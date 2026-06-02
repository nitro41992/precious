package com.preciouscaptures

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.provider.OpenableColumns
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import androidx.work.NetworkType
import java.io.File
import java.util.UUID

class PreciousCaptureStoreModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  private val imagePickerRequestCode = 41029
  private var pendingImagePromise: Promise? = null

  init {
    reactContext.addActivityEventListener(object : BaseActivityEventListener() {
      override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != imagePickerRequestCode) return
        val promise = pendingImagePromise ?: return
        pendingImagePromise = null

        if (resultCode != Activity.RESULT_OK) {
          promise.resolve(null)
          return
        }

        try {
          val uri = data?.data
          if (uri == null) {
            promise.reject("capture_image_missing", "No image was selected.")
            return
          }
          runCatching {
            val flags = data.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION
            if (flags != 0) reactContext.contentResolver.takePersistableUriPermission(uri, flags)
          }
          val asset = copyPickedImage(uri)
          if (asset == null) {
            promise.reject("capture_image_read_failed", "Could not read the selected image.")
            return
          }
          val capture = PreciousCaptureStore.addProcessingCapture(reactContext, imageSourceText(asset.fileName))
          val captureId = capture.getString("id")
          CaptureNotifications.showQueued(reactContext, captureId)
          val networkType = if (configuredApiUrl().isNotBlank() || capture.optString("sourceUrl").isNotBlank()) {
            NetworkType.CONNECTED
          } else {
            NetworkType.NOT_REQUIRED
          }
          enqueueCaptureWork(
            reactContext,
            captureId,
            networkType,
            asset.file.absolutePath,
            asset.mimeType,
            asset.fileName
          )
          promise.resolve(capture.toString())
        } catch (error: Exception) {
          promise.reject("capture_image_enqueue_failed", error)
        }
      }
    })
  }

  override fun getName(): String = "PreciousCaptureStore"

  @ReactMethod
  fun getCaptures(promise: Promise) {
    try {
      promise.resolve(PreciousCaptureStore.list(reactContext).toString())
    } catch (error: Exception) {
      promise.reject("capture_store_read_failed", error)
    }
  }

  @ReactMethod
  fun getCachedCapturePage(userId: String, mode: String, promise: Promise) {
    try {
      promise.resolve(PreciousCaptureStore.cachedCapturePage(reactContext, userId, mode))
    } catch (error: Exception) {
      promise.reject("capture_page_cache_read_failed", error)
    }
  }

  @ReactMethod
  fun setCachedCapturePage(
    userId: String,
    mode: String,
    capturesJson: String,
    nextCursor: String?,
    promise: Promise
  ) {
    try {
      PreciousCaptureStore.saveCapturePageCache(reactContext, userId, mode, capturesJson, nextCursor)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("capture_page_cache_write_failed", error)
    }
  }

  @ReactMethod
  fun getCachedCollectionPage(userId: String, mode: String, promise: Promise) {
    try {
      promise.resolve(PreciousCaptureStore.cachedCollectionPage(reactContext, userId, mode))
    } catch (error: Exception) {
      promise.reject("collection_page_cache_read_failed", error)
    }
  }

  @ReactMethod
  fun setCachedCollectionPage(
    userId: String,
    mode: String,
    collectionsJson: String,
    nextCursor: String?,
    promise: Promise
  ) {
    try {
      PreciousCaptureStore.saveCollectionPageCache(reactContext, userId, mode, collectionsJson, nextCursor)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("collection_page_cache_write_failed", error)
    }
  }

  @ReactMethod
  fun captureSource(sourceText: String, promise: Promise) {
    try {
      if (configuredApiUrl().isNotBlank() && readNativeAuthSession(reactContext) == null) {
        promise.reject("capture_auth_required", "Sign in before saving captures.")
        return
      }

      val capture = PreciousCaptureStore.addProcessingCapture(reactContext, sourceText)
      val captureId = capture.getString("id")
      CaptureNotifications.showQueued(reactContext, captureId)
      enqueueCaptureWork(reactContext, captureId, NetworkType.CONNECTED)
      promise.resolve(capture.toString())
    } catch (error: Exception) {
      promise.reject("capture_enqueue_failed", error)
    }
  }

  @ReactMethod
  fun captureImage(promise: Promise) {
    try {
      if (configuredApiUrl().isNotBlank() && readNativeAuthSession(reactContext) == null) {
        promise.reject("capture_auth_required", "Sign in before saving captures.")
        return
      }
      val activity = reactContext.currentActivity
      if (activity == null) {
        promise.reject("capture_image_activity_unavailable", "Open Precious Captures before choosing an image.")
        return
      }
      if (pendingImagePromise != null) {
        promise.reject("capture_image_in_progress", "Finish choosing the current image first.")
        return
      }

      pendingImagePromise = promise
      val intent = imagePickerIntent()
      activity.startActivityForResult(intent, imagePickerRequestCode)
    } catch (error: Exception) {
      pendingImagePromise = null
      promise.reject("capture_image_picker_failed", error)
    }
  }

  @ReactMethod
  fun submitExpandedUrl(id: String, expandedUrl: String, promise: Promise) {
    try {
      if (configuredApiUrl().isNotBlank() && readNativeAuthSession(reactContext) == null) {
        promise.reject("capture_auth_required", "Sign in before resolving captures.")
        return
      }
      val normalized = runCatching {
        val url = java.net.URL(expandedUrl.trim())
        if (url.protocol != "http" && url.protocol != "https") null else url.toString()
      }.getOrNull()
      if (normalized.isNullOrBlank()) {
        promise.reject("invalid_expanded_url", "Paste a valid http or https URL.")
        return
      }
      val capture = PreciousCaptureStore.submitExpandedUrl(reactContext, id, normalized)
      if (capture == null) {
        promise.reject("capture_not_found", "Capture not found.")
        return
      }
      CaptureNotifications.showQueued(reactContext, id)
      enqueueCaptureWork(reactContext, id, NetworkType.CONNECTED)
      promise.resolve(PreciousCaptureStore.list(reactContext).toString())
    } catch (error: Exception) {
      promise.reject("capture_resolve_enqueue_failed", error)
    }
  }

  @ReactMethod
  fun updateCapture(id: String, title: String, note: String, currentSaveIntent: String?, promise: Promise) {
    try {
      promise.resolve(PreciousCaptureStore.update(reactContext, id, title, note, currentSaveIntent).toString())
    } catch (error: Exception) {
      promise.reject("capture_store_update_failed", error)
    }
  }

  @ReactMethod
  fun confirmCaptureReview(id: String, title: String, note: String, currentSaveIntent: String?, promise: Promise) {
    try {
      promise.resolve(PreciousCaptureStore.confirmReview(reactContext, id, title, note, currentSaveIntent).toString())
    } catch (error: Exception) {
      promise.reject("capture_store_confirm_failed", error)
    }
  }

  @ReactMethod
  fun getReviewDrafts(promise: Promise) {
    try {
      promise.resolve(PreciousCaptureStore.reviewDrafts(reactContext))
    } catch (error: Exception) {
      promise.reject("capture_review_drafts_read_failed", error)
    }
  }

  @ReactMethod
  fun setReviewDrafts(draftsJson: String, promise: Promise) {
    try {
      PreciousCaptureStore.saveReviewDrafts(reactContext, draftsJson)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("capture_review_drafts_write_failed", error)
    }
  }

  @ReactMethod
  fun archiveCapture(id: String, promise: Promise) {
    try {
      promise.resolve(PreciousCaptureStore.archive(reactContext, id).toString())
    } catch (error: Exception) {
      promise.reject("capture_store_archive_failed", error)
    }
  }

  @ReactMethod
  fun restoreCapture(id: String, promise: Promise) {
    try {
      promise.resolve(PreciousCaptureStore.restore(reactContext, id).toString())
    } catch (error: Exception) {
      promise.reject("capture_store_restore_failed", error)
    }
  }

  @ReactMethod
  fun deleteCapture(id: String, promise: Promise) {
    try {
      promise.resolve(PreciousCaptureStore.delete(reactContext, id).toString())
    } catch (error: Exception) {
      promise.reject("capture_store_delete_failed", error)
    }
  }

  @ReactMethod
  fun undoDeleteCapture(id: String, promise: Promise) {
    try {
      promise.resolve(PreciousCaptureStore.undoDelete(reactContext, id).toString())
    } catch (error: Exception) {
      promise.reject("capture_store_undo_delete_failed", error)
    }
  }

  private fun imagePickerIntent(): Intent {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      Intent(MediaStore.ACTION_PICK_IMAGES).apply {
        type = "image/*"
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
    } else {
      Intent(Intent.ACTION_PICK, MediaStore.Images.Media.EXTERNAL_CONTENT_URI).apply {
        type = "image/*"
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
    }
  }

  private fun imageSourceText(fileName: String): String {
    return "Selected image: $fileName"
  }

  private fun copyPickedImage(uri: Uri): PickedImage? {
    val mimeType = reactContext.contentResolver.getType(uri) ?: "application/octet-stream"
    if (!mimeType.startsWith("image/", ignoreCase = true)) return null
    val fileName = displayName(uri) ?: "${UUID.randomUUID()}.${extensionFor(mimeType)}"
    val dir = File(reactContext.cacheDir, "shared-intake").apply { mkdirs() }
    val file = File(dir, "${UUID.randomUUID()}-${fileName.replace(Regex("[/\\\\\\r\\n\"]"), "-")}")
    return runCatching {
      val inputStream = reactContext.contentResolver.openInputStream(uri)
        ?: uri.path?.takeIf { uri.scheme == "file" }?.let { File(it).inputStream() }
        ?: return null
      inputStream.use { input ->
        file.outputStream().use { output -> input.copyTo(output) }
      }
      PickedImage(file, mimeType, fileName)
    }.getOrNull()
  }

  private fun displayName(uri: Uri): String? {
    return runCatching {
      reactContext.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
      }
    }.getOrNull()
  }

  private fun extensionFor(mimeType: String): String {
    return when {
      mimeType.equals("image/jpeg", ignoreCase = true) -> "jpg"
      mimeType.equals("image/png", ignoreCase = true) -> "png"
      mimeType.equals("image/webp", ignoreCase = true) -> "webp"
      mimeType.equals("image/gif", ignoreCase = true) -> "gif"
      mimeType.equals("image/heic", ignoreCase = true) -> "heic"
      mimeType.equals("image/heif", ignoreCase = true) -> "heif"
      mimeType.startsWith("image/", ignoreCase = true) -> "img"
      else -> "bin"
    }
  }

  private data class PickedImage(val file: File, val mimeType: String, val fileName: String)
}
