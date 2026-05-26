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
    notify(
      context = context,
      captureId = captureId,
      title = "Processing capture",
      body = "Running AI extraction.",
      ongoing = true
    )
  }

  fun showComplete(context: Context, captureId: String, captureTitle: String) {
    notify(
      context = context,
      captureId = captureId,
      title = "AI extraction complete",
      body = captureTitle,
      ongoing = false
    )
  }

  fun showNeedsReview(context: Context, captureId: String, captureTitle: String) {
    notify(
      context = context,
      captureId = captureId,
      title = "AI extraction needs review",
      body = captureTitle,
      ongoing = false
    )
  }

  fun showFailed(context: Context, captureId: String, captureTitle: String) {
    notify(
      context = context,
      captureId = captureId,
      title = "AI extraction failed",
      body = captureTitle,
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

    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_menu_save)
      .setContentTitle(title)
      .setContentText(body)
      .setContentIntent(pendingIntent)
      .setOngoing(ongoing)
      .setAutoCancel(!ongoing)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .build()

    runCatching {
      NotificationManagerCompat.from(context).notify(captureId.hashCode(), notification)
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
