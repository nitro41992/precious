package com.preciouscaptures

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.work.NetworkType

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
    if (intent?.action != Intent.ACTION_SEND) return
    if (configuredApiUrl().isNotBlank() && readNativeAuthSession(applicationContext) == null) {
      Toast.makeText(this, "Open Precious Captures and sign in before sharing.", Toast.LENGTH_LONG).show()
      return
    }
    val sourceText = intent.getStringExtra(Intent.EXTRA_TEXT)
      ?: intent.getStringExtra(Intent.EXTRA_SUBJECT)
      ?: return

    val capture = PreciousCaptureStore.addProcessingCapture(applicationContext, sourceText)
    val captureId = capture.getString("id")
    CaptureNotifications.showQueued(applicationContext, captureId)
    val networkType = if (configuredApiUrl().isNotBlank() || capture.optString("sourceUrl").isNotBlank()) {
      NetworkType.CONNECTED
    } else {
      NetworkType.NOT_REQUIRED
    }

    enqueueCaptureWork(applicationContext, captureId, networkType)
    Toast.makeText(this, "Saved to Precious Captures", Toast.LENGTH_SHORT).show()
  }
}
