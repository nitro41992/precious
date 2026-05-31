package com.preciouscaptures

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

private const val STORE_PREFS = "precious_capture_store"
private const val STORE_KEY = "captures"
private const val REVIEW_DRAFTS_KEY = "capture_review_drafts"
private const val CAPTURE_PAGE_CACHE_PREFIX = "capture_page_cache"
private const val COLLECTION_PAGE_CACHE_PREFIX = "collection_page_cache"

object PreciousCaptureStore {
  @Synchronized
  fun list(context: Context): JSONArray {
    val raw = context
      .getSharedPreferences(STORE_PREFS, Context.MODE_PRIVATE)
      .getString(STORE_KEY, "[]")
      ?: "[]"
    return runCatching { JSONArray(raw) }.getOrDefault(JSONArray())
  }

  @Synchronized
  fun cachedCapturePage(context: Context, userId: String, mode: String): String? {
    if (userId.isBlank()) return null
    val safeMode = if (mode == "archived") "archived" else "active"
    return context
      .getSharedPreferences(STORE_PREFS, Context.MODE_PRIVATE)
      .getString(capturePageCacheKey(userId, safeMode), null)
  }

  @Synchronized
  fun saveCapturePageCache(
    context: Context,
    userId: String,
    mode: String,
    capturesJson: String,
    nextCursor: String?
  ) {
    if (userId.isBlank()) return
    val safeMode = if (mode == "archived") "archived" else "active"
    val captures = runCatching { JSONArray(capturesJson) }.getOrDefault(JSONArray())
    val page = JSONObject()
      .put("captures", captures)
      .put("next_cursor", nextCursor ?: JSONObject.NULL)
      .put("cached_at", System.currentTimeMillis())
    context
      .getSharedPreferences(STORE_PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(capturePageCacheKey(userId, safeMode), page.toString())
      .apply()
  }

  @Synchronized
  fun cachedCollectionPage(context: Context, userId: String, mode: String): String? {
    if (userId.isBlank()) return null
    val safeMode = if (mode == "archived") "archived" else "active"
    return context
      .getSharedPreferences(STORE_PREFS, Context.MODE_PRIVATE)
      .getString(collectionPageCacheKey(userId, safeMode), null)
  }

  @Synchronized
  fun saveCollectionPageCache(
    context: Context,
    userId: String,
    mode: String,
    collectionsJson: String,
    nextCursor: String?
  ) {
    if (userId.isBlank()) return
    val safeMode = if (mode == "archived") "archived" else "active"
    val collections = runCatching { JSONArray(collectionsJson) }.getOrDefault(JSONArray())
    val page = JSONObject()
      .put("collections", collections)
      .put("next_cursor", nextCursor ?: JSONObject.NULL)
      .put("cached_at", System.currentTimeMillis())
    context
      .getSharedPreferences(STORE_PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(collectionPageCacheKey(userId, safeMode), page.toString())
      .apply()
  }

  @Synchronized
  fun addProcessingCapture(context: Context, sourceText: String): JSONObject {
    val now = System.currentTimeMillis()
    val capture = JSONObject()
      .put("id", UUID.randomUUID().toString())
      .put("title", titleFromSource(sourceText))
      .put("sourceText", sourceText)
      .put("sourceUrl", extractUrl(sourceText))
      .put("siteName", "")
      .put("summary", "")
      .put("analysis", JSONObject.NULL)
      .put("urlEvidence", JSONObject.NULL)
      .put("clientResolutionAttemptCount", 0)
      .put("analysisMode", "")
      .put("analysisProvider", "")
      .put("analysisModel", "")
      .put("analysisError", "")
      .put("defaultIntent", "")
      .put("intentRationale", "")
      .put("confidenceLabel", "")
      .put("needsReview", false)
      .put("entities", JSONArray())
      .put("suggestedReminders", JSONArray())
      .put("suggestedCollections", JSONArray())
      .put("searchPhrases", JSONArray())
      .put("note", "")
      .put("archivedAt", JSONObject.NULL)
      .put("reviewConfirmedAt", JSONObject.NULL)
      .put("status", "processing")
      .put("createdAt", now)
      .put("updatedAt", now)
      .put("processedAt", JSONObject.NULL)

    val captures = list(context)
    val next = JSONArray().put(capture)
    for (index in 0 until captures.length()) next.put(captures.getJSONObject(index))
    save(context, next)
    return capture
  }

  @Synchronized
  fun markReady(context: Context, id: String): JSONObject? {
    val captures = list(context)
    val now = System.currentTimeMillis()
    var updated: JSONObject? = null
    val next = JSONArray()
    for (index in 0 until captures.length()) {
      val capture = captures.getJSONObject(index)
      if (capture.optString("id") == id) {
        capture
          .put("status", "ready")
          .put("updatedAt", now)
          .put("processedAt", now)
        updated = capture
      }
      next.put(capture)
    }
    save(context, next)
    return updated
  }

  @Synchronized
  fun find(context: Context, id: String): JSONObject? {
    val captures = list(context)
    for (index in 0 until captures.length()) {
      val capture = captures.getJSONObject(index)
      if (capture.optString("id") == id) return capture
    }
    return null
  }

  @Synchronized
  fun incrementClientResolutionAttempt(context: Context, id: String): Int {
    val captures = list(context)
    val now = System.currentTimeMillis()
    var count = 0
    val next = JSONArray()
    for (index in 0 until captures.length()) {
      val capture = captures.getJSONObject(index)
      if (capture.optString("id") == id) {
        count = capture.optInt("clientResolutionAttemptCount", 0) + 1
        capture
          .put("clientResolutionAttemptCount", count)
          .put("updatedAt", now)
      }
      next.put(capture)
    }
    save(context, next)
    return count
  }

  @Synchronized
  fun submitExpandedUrl(context: Context, id: String, expandedUrl: String): JSONObject? {
    val captures = list(context)
    val now = System.currentTimeMillis()
    var updated: JSONObject? = null
    val next = JSONArray()
    for (index in 0 until captures.length()) {
      val capture = captures.getJSONObject(index)
      if (capture.optString("id") == id) {
        val count = capture.optInt("clientResolutionAttemptCount", 0) + 1
        capture
          .put("clientResolvedUrl", expandedUrl)
          .put("clientResolutionSource", "manual_paste")
          .put("clientResolutionAttemptCount", count)
          .put("status", "processing")
          .put("analysisMode", "pending_llm")
          .put("analysisError", "")
          .put("processedAt", JSONObject.NULL)
          .put("updatedAt", now)
        updated = capture
      }
      next.put(capture)
    }
    save(context, next)
    return updated
  }

  @Synchronized
  fun complete(context: Context, id: String, enrichment: JSONObject): JSONObject? {
    val captures = list(context)
    val now = System.currentTimeMillis()
    var updated: JSONObject? = null
    val next = JSONArray()
    for (index in 0 until captures.length()) {
      val capture = captures.getJSONObject(index)
      if (capture.optString("id") == id) {
        val title = enrichment.optString("title").ifBlank { capture.optString("title", "Untitled capture") }
        val analysisMode = enrichment.optString("analysisMode", "pending_llm")
        val needsReview = enrichmentRequiresReview(enrichment)
        val nextStatus = when {
          analysisMode == "preflight_rejected" -> "failed"
          analysisMode == "needs_client_resolution" -> "needs_review"
          analysisMode == "insufficient_url_evidence" -> "needs_review"
          analysisMode == "llm_processing" -> "processing"
          analysisMode == "llm_waiting_network" -> "processing"
          analysisMode == "llm" && !needsReview -> "ready"
          analysisMode == "llm" -> "needs_review"
          enrichment.optString("defaultIntent").isNotBlank() && !needsReview -> "ready"
          enrichment.optString("defaultIntent").isNotBlank() -> "needs_review"
          else -> "failed"
        }
        capture
          .put("title", title)
          .put("siteName", enrichment.optString("siteName"))
          .put("summary", enrichment.optString("summary"))
          .put("sourceUrl", enrichment.optString("sourceUrl", capture.optString("sourceUrl")))
          .put("clientResolvedUrl", enrichment.optString("clientResolvedUrl", capture.optString("clientResolvedUrl")))
          .put("clientResolutionSource", enrichment.optString("clientResolutionSource", capture.optString("clientResolutionSource")))
          .put("analysis", enrichment.opt("analysis") ?: JSONObject.NULL)
          .put("urlEvidence", enrichment.opt("urlEvidence") ?: JSONObject.NULL)
          .put("clientResolutionAttemptCount", enrichment.optInt("clientResolutionAttemptCount", capture.optInt("clientResolutionAttemptCount", 0)))
          .put("analysisMode", analysisMode)
          .put("analysisProvider", enrichment.optString("analysisProvider"))
          .put("analysisModel", enrichment.optString("analysisModel"))
          .put("analysisError", enrichment.optString("analysisError"))
          .put("defaultIntent", enrichment.optString("defaultIntent"))
          .put("intentRationale", enrichment.optString("intentRationale"))
          .put("confidenceLabel", enrichment.optString("confidenceLabel"))
          .put("needsReview", needsReview)
          .put("entities", enrichment.optJSONArray("entities") ?: JSONArray())
          .put("suggestedReminders", enrichment.optJSONArray("suggestedReminders") ?: JSONArray())
          .put("collectionDecisions", enrichment.optJSONArray("collectionDecisions") ?: JSONArray())
          .put("suggestedCollections", enrichment.optJSONArray("suggestedCollections") ?: JSONArray())
          .put("searchPhrases", enrichment.optJSONArray("searchPhrases") ?: JSONArray())
          .put("status", nextStatus)
          .put("updatedAt", now)
          .put("processedAt", if (nextStatus == "processing") JSONObject.NULL else now)
        updated = capture
      }
      next.put(capture)
    }
    save(context, next)
    return updated
  }

  @Synchronized
  fun update(context: Context, id: String, title: String, note: String, currentSaveIntent: String?): JSONArray {
    val captures = list(context)
    val now = System.currentTimeMillis()
    val next = JSONArray()
    for (index in 0 until captures.length()) {
      val capture = captures.getJSONObject(index)
      if (capture.optString("id") == id) {
        capture
          .put("title", title.ifBlank { capture.optString("title", "Untitled capture") })
          .put("note", note)
          .put("updatedAt", now)
        if (!currentSaveIntent.isNullOrBlank()) {
          capture
            .put("defaultIntent", currentSaveIntent)
            .put("intentCorrectedAt", now)
        }
      }
      next.put(capture)
    }
    save(context, next)
    return next
  }

  @Synchronized
  fun confirmReview(context: Context, id: String, title: String, note: String, currentSaveIntent: String?): JSONArray {
    val captures = list(context)
    val now = System.currentTimeMillis()
    val next = JSONArray()
    for (index in 0 until captures.length()) {
      val capture = captures.getJSONObject(index)
      if (capture.optString("id") == id) {
        capture
          .put("title", title.ifBlank { capture.optString("title", "Untitled capture") })
          .put("note", note)
          .put("needsReview", false)
          .put("collectionDecisions", JSONArray())
          .put("suggestedCollections", JSONArray())
          .put("suggestedReminders", confirmedReminders(capture.optJSONArray("suggestedReminders") ?: JSONArray()))
          .put("status", "ready")
          .put("reviewConfirmedAt", now)
          .put("updatedAt", now)
        if (!currentSaveIntent.isNullOrBlank()) {
          capture
            .put("defaultIntent", currentSaveIntent)
            .put("intentCorrectedAt", now)
        }
      }
      next.put(capture)
    }
    save(context, next)
    return next
  }

  @Synchronized
  fun reviewDrafts(context: Context): String? {
    return context
      .getSharedPreferences(STORE_PREFS, Context.MODE_PRIVATE)
      .getString(REVIEW_DRAFTS_KEY, "{}")
  }

  @Synchronized
  fun saveReviewDrafts(context: Context, draftsJson: String) {
    context
      .getSharedPreferences(STORE_PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(REVIEW_DRAFTS_KEY, draftsJson)
      .commit()
  }

  @Synchronized
  fun archive(context: Context, id: String): JSONArray = setArchived(context, id, true)

  @Synchronized
  fun restore(context: Context, id: String): JSONArray = setArchived(context, id, false)

  private fun setArchived(context: Context, id: String, archived: Boolean): JSONArray {
    val captures = list(context)
    val now = System.currentTimeMillis()
    val next = JSONArray()
    for (index in 0 until captures.length()) {
      val capture = captures.getJSONObject(index)
      if (capture.optString("id") == id) {
        capture
          .put("archivedAt", if (archived) now else JSONObject.NULL)
          .put("updatedAt", now)
      }
      next.put(capture)
    }
    save(context, next)
    return next
  }

  private fun save(context: Context, captures: JSONArray) {
    context
      .getSharedPreferences(STORE_PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(STORE_KEY, captures.toString())
      .commit()
  }

  private fun capturePageCacheKey(userId: String, mode: String): String {
    return "$CAPTURE_PAGE_CACHE_PREFIX:$userId:$mode"
  }

  private fun collectionPageCacheKey(userId: String, mode: String): String {
    return "$COLLECTION_PAGE_CACHE_PREFIX:$userId:$mode"
  }

  private fun enrichmentRequiresReview(enrichment: JSONObject): Boolean {
    if (enrichment.optBoolean("needsReview", false)) return true
    return when (enrichment.optString("confidenceLabel")) {
      "Maybe", "Not sure", "Couldn't tell" -> true
      else -> {
        val decisions = enrichment.optJSONArray("collectionDecisions")
          ?: enrichment.optJSONArray("suggestedCollections")
        decisions != null && decisions.length() > 0
      }
    }
  }

  private fun confirmedReminders(reminders: JSONArray): JSONArray {
    val next = JSONArray()
    for (index in 0 until reminders.length()) {
      val reminder = reminders.optJSONObject(index)
      if (reminder != null) {
        next.put(reminder.put("status", "confirmed"))
      } else {
        next.put(reminders.opt(index))
      }
    }
    return next
  }

  private fun extractUrl(value: String): String? {
    return Regex("https?://\\S+").find(value)?.value
  }

  private fun titleFromSource(value: String): String {
    val url = extractUrl(value)
    if (url != null) {
      val host = runCatching { java.net.URL(url).host.removePrefix("www.") }.getOrNull()
      if (!host.isNullOrBlank()) return host
    }
    return value.trim().lineSequence().firstOrNull()?.take(72)?.ifBlank { null } ?: "Shared capture"
  }
}
