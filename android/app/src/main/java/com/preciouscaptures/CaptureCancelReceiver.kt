package com.preciouscaptures

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

const val ACTION_CANCEL_CAPTURE = "com.preciouscaptures.action.CANCEL_CAPTURE"
const val EXTRA_CAPTURE_ID = "captureId"

class CaptureCancelReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION_CANCEL_CAPTURE) return
    val captureId = intent.getStringExtra(EXTRA_CAPTURE_ID) ?: return
    cancelCaptureWork(context, captureId)
    PreciousCaptureStore.cancel(context, captureId)
    CaptureAnalysisClient.cancelRemote(context, captureId)
    CaptureNotifications.showCancelled(context, captureId)
  }
}
