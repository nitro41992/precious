package com.preciouscaptures

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

private const val STORE_PREFS = "precious_capture_store"
private const val STORE_KEY = "captures"

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
  fun complete(context: Context, id: String, enrichment: JSONObject): JSONObject? {
    val captures = list(context)
    val now = System.currentTimeMillis()
    var updated: JSONObject? = null
    val next = JSONArray()
    for (index in 0 until captures.length()) {
      val capture = captures.getJSONObject(index)
      if (capture.optString("id") == id) {
        val title = enrichment.optString("title").ifBlank { capture.optString("title", "Untitled capture") }
        val analysisMode = enrichment.optString("analysisMode", "local_metadata")
        val needsReview = enrichment.optBoolean("needsReview", false)
        val nextStatus = when {
          capture.optString("status") == "cancelled" -> "cancelled"
          analysisMode == "cancelled" -> "cancelled"
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
          .put("analysis", enrichment.opt("analysis") ?: JSONObject.NULL)
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
  fun cancel(context: Context, id: String): JSONObject? {
    val captures = list(context)
    val now = System.currentTimeMillis()
    var updated: JSONObject? = null
    val next = JSONArray()
    for (index in 0 until captures.length()) {
      val capture = captures.getJSONObject(index)
      if (capture.optString("id") == id) {
        capture
          .put("status", "cancelled")
          .put("analysisMode", "cancelled")
          .put("analysisError", "AI processing was cancelled.")
          .put("updatedAt", now)
          .put("processedAt", now)
        updated = capture
      }
      next.put(capture)
    }
    save(context, next)
    return updated
  }

  fun isCancelled(context: Context, id: String): Boolean {
    return find(context, id)?.optString("status") == "cancelled"
  }

  @Synchronized
  fun update(context: Context, id: String, title: String, note: String): JSONArray {
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
