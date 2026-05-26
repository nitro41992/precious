package com.preciouscaptures

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

private const val CAPTURE_WORK_TAG_PREFIX = "precious-capture-"

fun captureWorkTag(captureId: String): String = "$CAPTURE_WORK_TAG_PREFIX$captureId"

fun enqueueCaptureWork(context: Context, captureId: String, networkType: NetworkType) {
  val request = OneTimeWorkRequestBuilder<ShareProcessWorker>()
    .setInputData(Data.Builder().putString("captureId", captureId).build())
    .setConstraints(Constraints.Builder().setRequiredNetworkType(networkType).build())
    .setBackoffCriteria(BackoffPolicy.LINEAR, 30, TimeUnit.SECONDS)
    .addTag(captureWorkTag(captureId))
    .build()

  WorkManager.getInstance(context).enqueue(request)
}

fun cancelCaptureWork(context: Context, captureId: String) {
  WorkManager.getInstance(context).cancelAllWorkByTag(captureWorkTag(captureId))
}
