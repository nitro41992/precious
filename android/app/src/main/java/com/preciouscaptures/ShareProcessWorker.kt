package com.preciouscaptures

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject

class ShareProcessWorker(
  appContext: Context,
  params: WorkerParameters
) : CoroutineWorker(appContext, params) {
  override suspend fun doWork(): Result {
    val captureId = inputData.getString("captureId") ?: return Result.failure()
    if (PreciousCaptureStore.isCancelled(applicationContext, captureId)) {
      CaptureNotifications.showCancelled(applicationContext, captureId)
      return Result.success()
    }
    CaptureNotifications.showUploading(applicationContext, captureId)
    delay(1600)
    val pendingCapture = PreciousCaptureStore.find(applicationContext, captureId)
    val enrichment = withContext(Dispatchers.IO) {
      CaptureAnalysisClient.process(
        applicationContext,
        captureId,
        pendingCapture?.optString("sourceText").orEmpty(),
        pendingCapture?.optString("sourceUrl")
      ) { phase ->
        when (phase) {
          CaptureProcessingPhase.UPLOADING -> CaptureNotifications.showUploading(applicationContext, captureId)
          CaptureProcessingPhase.ANALYZING -> CaptureNotifications.showAnalyzing(applicationContext, captureId)
          CaptureProcessingPhase.SAVING -> CaptureNotifications.showSaving(applicationContext, captureId)
          CaptureProcessingPhase.WAITING_FOR_NETWORK -> CaptureNotifications.showWaitingForNetwork(applicationContext, captureId)
        }
      } ?: aiUnavailableEnrichment(
        pendingCapture?.optString("sourceText").orEmpty(),
        pendingCapture?.optString("sourceUrl")
      )
    }
    if (PreciousCaptureStore.isCancelled(applicationContext, captureId) || isStopped) {
      PreciousCaptureStore.cancel(applicationContext, captureId)
      CaptureNotifications.showCancelled(applicationContext, captureId)
      return Result.success()
    }
    val capture = PreciousCaptureStore.complete(applicationContext, captureId, enrichment)
    val title = capture?.optString("title", "Capture saved") ?: "Capture saved"
    when (capture?.optString("status")) {
      "ready" -> CaptureNotifications.showComplete(applicationContext, captureId, title)
      "needs_review" -> CaptureNotifications.showNeedsReview(applicationContext, captureId, title)
      "cancelled" -> CaptureNotifications.showCancelled(applicationContext, captureId)
      "processing" -> {
        if (capture.optString("analysisMode") == "llm_waiting_network") {
          CaptureNotifications.showWaitingForNetwork(applicationContext, captureId)
        } else {
          CaptureNotifications.showAnalyzing(applicationContext, captureId)
        }
        return Result.retry()
      }
      else -> CaptureNotifications.showFailed(applicationContext, captureId, title)
    }
    return Result.success()
  }

  private fun aiUnavailableEnrichment(sourceText: String, sourceUrl: String?): JSONObject {
    return CaptureEnricher.enrich(sourceText, sourceUrl)
      .put("analysisMode", "ai_unavailable")
      .put("analysisProvider", "none")
      .put("analysisModel", "")
      .put(
        "analysisError",
        "AI processing did not run. Sign in and configure the hosted Sharebook API."
      )
      .put("defaultIntent", "")
      .put("intentRationale", "")
      .put("confidenceLabel", "Couldn't tell")
      .put("needsReview", true)
  }
}
