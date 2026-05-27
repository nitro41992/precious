package com.preciouscaptures

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import androidx.work.NetworkType

class PreciousCaptureStoreModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
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
}
