package com.preciouscaptures

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

private const val CHANNEL_ID = "precious-capture-processing"

object CaptureNotifications {
  fun showProcessing(context: Context, captureId: String) {
    showAnalyzing(context, captureId)
  }

  fun showQueued(context: Context, captureId: String) {
    notify(
      context = context,
      captureId = captureId,
      title = "Saving capture",
      body = "Queued to check the source.",
      ongoing = true
    )
  }

  fun showWaitingForNetwork(context: Context, captureId: String) {
    notify(
      context = context,
      captureId = captureId,
      title = "Waiting for internet",
      body = "Sharebook will keep trying when you are back online.",
      ongoing = true
    )
  }

  fun showUploading(context: Context, captureId: String) {
    notify(
      context = context,
      captureId = captureId,
      title = "Saving capture",
      body = "Uploading shared content.",
      ongoing = true
    )
  }

  fun showAnalyzing(context: Context, captureId: String) {
    notify(
      context = context,
      captureId = captureId,
      title = "Checking the source",
      body = "Capture analysis is running.",
      ongoing = true
    )
  }

  fun showSaving(context: Context, captureId: String) {
    notify(
      context = context,
      captureId = captureId,
      title = "Saving capture",
      body = "Storing the details.",
      ongoing = true
    )
  }

  fun showComplete(context: Context, captureId: String, captureTitle: String) {
    notify(
      context = context,
      captureId = captureId,
      title = "Capture processed",
      body = "Extraction looks good.",
      ongoing = false
    )
  }

  fun showNeedsReview(context: Context, captureId: String, captureTitle: String) {
    notify(
      context = context,
      captureId = captureId,
      title = "Capture processed",
      body = "Extraction needs review.",
      ongoing = false
    )
  }

  fun showFailed(context: Context, captureId: String, captureTitle: String) {
    notify(
      context = context,
      captureId = captureId,
      title = "Capture needs a quick look",
      body = captureTitle,
      ongoing = false
    )
  }

  fun showNotSaved(context: Context, captureId: String, message: String) {
    notify(
      context = context,
      captureId = captureId,
      title = "Capture not saved",
      body = message,
      ongoing = false
    )
  }

  private fun notify(
    context: Context,
    captureId: String,
    title: String,
    body: String,
    ongoing: Boolean
  ) {
    ensureChannel(context)
    if (Build.VERSION.SDK_INT >= 33 &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      return
    }

    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("preciouscaptures://capture/$captureId"), context, MainActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val pendingIntent = PendingIntent.getActivity(
      context,
      captureId.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_menu_save)
      .setContentTitle(title)
      .setContentText(body)
      .setContentIntent(pendingIntent)
      .setOngoing(ongoing)
      .setAutoCancel(!ongoing)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .setOnlyAlertOnce(true)
    if (ongoing) builder.setProgress(0, 0, true)

    runCatching {
      NotificationManagerCompat.from(context).notify(captureId.hashCode(), builder.build())
    }
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    val existing = manager.getNotificationChannel(CHANNEL_ID)
    if (existing != null) return
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "Capture processing", NotificationManager.IMPORTANCE_DEFAULT)
    )
  }
}
