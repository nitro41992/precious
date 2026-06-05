package com.preciouscaptures

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.widget.Toast
import androidx.work.NetworkType
import java.io.File
import java.util.UUID

class ShareIntakeActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    handleShare(intent)
    finish()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    handleShare(intent)
    finish()
  }

  private fun handleShare(intent: Intent?) {
    if (intent?.action != Intent.ACTION_SEND && intent?.action != Intent.ACTION_SEND_MULTIPLE) return
    if (configuredApiUrl().isNotBlank() && readNativeAuthSession(applicationContext) == null) {
      Toast.makeText(this, "Open Precious Captures and sign in before sharing.", Toast.LENGTH_LONG).show()
      return
    }
    val streams = sharedStreams(intent)
    if (streams.isNotEmpty()) {
      var saved = 0
      for (uri in streams) {
        val asset = copySharedAsset(uri, intent.type) ?: continue
        val label = if (asset.mimeType.startsWith("image/")) "image" else "file"
        val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
          ?: intent.getStringExtra(Intent.EXTRA_SUBJECT)
          ?: "Shared $label: ${asset.fileName}"
        enqueueCapture(sharedText, asset)
        saved += 1
      }
      if (saved > 0) {
        Toast.makeText(this, "Saved to Precious Captures", Toast.LENGTH_SHORT).show()
        return
      }
      Toast.makeText(this, "Could not read the shared image.", Toast.LENGTH_LONG).show()
      return
    }
    if (intent.type?.startsWith("image/", ignoreCase = true) == true) {
      Toast.makeText(this, "Could not read the shared image.", Toast.LENGTH_LONG).show()
      return
    }
    val sourceText = intent.getStringExtra(Intent.EXTRA_TEXT)
      ?: intent.getStringExtra(Intent.EXTRA_SUBJECT)
      ?: return

    enqueueCapture(sourceText)
    Toast.makeText(this, "Saved to Precious Captures", Toast.LENGTH_SHORT).show()
  }

  private fun enqueueCapture(sourceText: String, asset: SharedAsset? = null) {
    val capture = PreciousCaptureStore.addProcessingCapture(applicationContext, sourceText)
    val captureId = capture.getString("id")
    CaptureNotifications.showQueued(applicationContext, captureId)
    val networkType = if (configuredApiUrl().isNotBlank() || capture.optString("sourceUrl").isNotBlank()) {
      NetworkType.CONNECTED
    } else {
      NetworkType.NOT_REQUIRED
    }

    enqueueCaptureWork(
      applicationContext,
      captureId,
      networkType,
      asset?.file?.absolutePath,
      asset?.mimeType,
      asset?.fileName,
      assetExpected = asset != null
    )
  }

  private fun sharedStreams(intent: Intent): List<Uri> {
    if (intent.action == Intent.ACTION_SEND_MULTIPLE) {
      @Suppress("DEPRECATION")
      return intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)?.filterNotNull().orEmpty()
    }
    @Suppress("DEPRECATION")
    return listOfNotNull(intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri)
  }

  private fun copySharedAsset(uri: Uri, fallbackMimeType: String?): SharedAsset? {
    val mimeType = contentResolver.getType(uri) ?: fallbackMimeType ?: "application/octet-stream"
    val fileName = displayName(uri) ?: "${UUID.randomUUID()}.${extensionFor(mimeType)}"
    val dir = File(cacheDir, "shared-intake").apply { mkdirs() }
    val file = File(dir, "${UUID.randomUUID()}-${fileName.replace(Regex("[/\\\\\\r\\n\"]"), "-")}")
    return runCatching {
      val inputStream = contentResolver.openInputStream(uri)
        ?: uri.path?.takeIf { uri.scheme == "file" }?.let { File(it).inputStream() }
        ?: return null
      inputStream.use { input ->
        file.outputStream().use { output -> input.copyTo(output) }
      }
      SharedAsset(file, mimeType, fileName)
    }.getOrNull()
  }

  private fun displayName(uri: Uri): String? {
    return runCatching {
      contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
      }
    }.getOrNull()
  }

  private fun extensionFor(mimeType: String): String {
    return when {
      mimeType.equals("image/jpeg", ignoreCase = true) -> "jpg"
      mimeType.equals("image/png", ignoreCase = true) -> "png"
      mimeType.equals("image/webp", ignoreCase = true) -> "webp"
      mimeType.startsWith("image/", ignoreCase = true) -> "img"
      else -> "bin"
    }
  }

  private data class SharedAsset(val file: File, val mimeType: String, val fileName: String)
}
