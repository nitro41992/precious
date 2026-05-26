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
  fun updateCapture(id: String, title: String, note: String, promise: Promise) {
    try {
      promise.resolve(PreciousCaptureStore.update(reactContext, id, title, note).toString())
    } catch (error: Exception) {
      promise.reject("capture_store_update_failed", error)
    }
  }
}
