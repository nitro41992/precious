package com.preciouscaptures

import android.util.Log
import android.content.Context
import kotlinx.coroutines.delay
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

private const val ANALYSIS_CLIENT_TAG = "PreciousAnalysisClient"

object CaptureAnalysisClient {
  suspend fun process(context: Context, captureId: String, sourceText: String, sourceUrl: String?): JSONObject? {
    val apiUrl = configuredApiUrl()
    if (apiUrl.isBlank()) return null
    val session = validSession(context) ?: run {
      Log.w(ANALYSIS_CLIENT_TAG, "Hosted capture processing unavailable: no Supabase session")
      return null
    }
    val token = session.optString("accessToken")
    if (token.isBlank()) return null

    val created = postCapture(apiUrl, token, captureId, sourceText, sourceUrl)
    if (created == null) {
      Log.w(ANALYSIS_CLIENT_TAG, "Hosted capture enqueue failed")
      return null
    }
    val remoteCaptureId = created.optString("id", captureId)
    if (!isEdgeFunction(apiUrl)) {
      triggerAnalyze(apiUrl, token, remoteCaptureId)
    }

    repeat(60) {
      val remote = getCapture(apiUrl, token, captureId, remoteCaptureId)
      val state = remote?.optString("analysis_state").orEmpty()
      if (remote != null && (state == "ready" || state == "needs_review")) {
        if (!isEdgeFunction(apiUrl)) {
          createSuggestedReminders(apiUrl, token, remoteCaptureId, remote)
          val refreshed = getCapture(apiUrl, token, captureId, remoteCaptureId)
          return toEnrichment(refreshed ?: remote)
        }
        return toEnrichment(remote)
      }
      if (state == "failed") {
        Log.w(ANALYSIS_CLIENT_TAG, "Server analysis failed: ${remote?.optString("analysis_error")}")
        return remote?.let { toEnrichment(it).put("needsReview", true) }
      }
      delay(2000)
    }

    Log.w(ANALYSIS_CLIENT_TAG, "Hosted analysis is still processing")
    return llmStillProcessingEnrichment(sourceText, sourceUrl)
  }

  private fun postCapture(
    apiUrl: String,
    accessToken: String,
    captureId: String,
    sourceText: String,
    sourceUrl: String?
  ): JSONObject? {
    val edge = isEdgeFunction(apiUrl)
    val url = if (edge) apiUrl else "$apiUrl/api/captures"
    return request(url, "POST", accessToken) { connection ->
      val body = JSONObject()
        .put("clientCaptureKey", captureId)
        .put("sourceText", sourceText)
        .put("sourceUrl", sourceUrl ?: JSONObject.NULL)
        .put("sourceApp", "Android Share")
        .put("autoAnalyze", edge)
      connection.outputStream.use { output -> output.write(body.toString().toByteArray()) }
    }?.optJSONObject("capture")
  }

  private fun getCapture(apiUrl: String, accessToken: String, captureId: String, remoteCaptureId: String): JSONObject? {
    return if (isEdgeFunction(apiUrl)) {
      val encoded = URLEncoder.encode(captureId, "UTF-8")
      request("$apiUrl?clientCaptureKey=$encoded", "GET", accessToken)?.optJSONObject("capture")
    } else {
      val encoded = URLEncoder.encode(remoteCaptureId, "UTF-8")
      request("$apiUrl/api/captures?view=detail&captureId=$encoded", "GET", accessToken)?.optJSONObject("capture")
    }
  }

  private fun triggerAnalyze(apiUrl: String, accessToken: String, remoteCaptureId: String) {
    request("$apiUrl/api/analyze", "POST", accessToken, readTimeoutMs = 120000) { connection ->
      val body = JSONObject()
        .put("captureId", remoteCaptureId)
        .put("route", "openai_mini")
      connection.outputStream.use { output -> output.write(body.toString().toByteArray()) }
    }
  }

  private fun createSuggestedReminders(
    apiUrl: String,
    accessToken: String,
    remoteCaptureId: String,
    remoteCapture: JSONObject
  ) {
    val suggestions = remoteCapture.optJSONArray("reminder_suggestions")
      ?: remoteCapture.optJSONObject("analysis")?.optJSONArray("suggested_reminders")
      ?: return

    for (index in 0 until suggestions.length()) {
      val reminder = suggestions.optJSONObject(index) ?: continue
      val triggerType = reminder.optString("trigger_type")
      val triggerValue = reminder.optString("trigger_value")
      val confidence = reminder.optDouble("confidence", 0.0)
      if (triggerType == "none" || triggerValue.isBlank() || confidence < 0.55) continue

      request("$apiUrl/api/reminders", "POST", accessToken, readTimeoutMs = 30000) { connection ->
        val body = JSONObject().put("captureId", remoteCaptureId)
        val suggestionId = reminder.optString("id")
        if (suggestionId.isNotBlank()) {
          body.put("suggestionId", suggestionId)
        } else {
          body
            .put("triggerType", triggerType)
            .put("triggerValue", triggerValue)
            .put("rationale", reminder.optString("rationale"))
        }
        connection.outputStream.use { output -> output.write(body.toString().toByteArray()) }
      }
    }
  }

  private fun request(
    url: String,
    method: String,
    accessToken: String,
    readTimeoutMs: Int = 8000,
    writeBody: ((HttpURLConnection) -> Unit)? = null
  ): JSONObject? {
    return runCatching {
      val connection = (URL(url).openConnection() as HttpURLConnection).apply {
        requestMethod = method
        connectTimeout = 5000
        readTimeout = readTimeoutMs
        setRequestProperty("accept", "application/json")
        setRequestProperty("authorization", "Bearer $accessToken")
        if (BuildConfig.SUPABASE_ANON_KEY.isNotBlank()) {
          setRequestProperty("apikey", BuildConfig.SUPABASE_ANON_KEY)
        }
        if (writeBody != null) {
          setRequestProperty("content-type", "application/json")
          doOutput = true
        }
      }
      writeBody?.invoke(connection)
      val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
      val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
      if (connection.responseCode !in 200..299) {
        Log.w(ANALYSIS_CLIENT_TAG, "$method $url failed ${connection.responseCode}: ${body.take(240)}")
        return null
      }
      JSONObject(body)
    }.getOrElse { error ->
      Log.w(ANALYSIS_CLIENT_TAG, "$method $url failed: ${error.message}")
      null
    }
  }

  private fun validSession(context: Context): JSONObject? {
    val session = readNativeAuthSession(context) ?: return null
    val expiresAt = session.optLong("expiresAt", 0L)
    val now = System.currentTimeMillis() / 1000L
    if (expiresAt == 0L || expiresAt > now + 60) return session
    return refreshSession(context, session)
  }

  private fun refreshSession(context: Context, session: JSONObject): JSONObject? {
    val supabaseUrl = BuildConfig.SUPABASE_URL.trimEnd('/')
    val anonKey = BuildConfig.SUPABASE_ANON_KEY
    val refreshToken = session.optString("refreshToken")
    if (supabaseUrl.isBlank() || anonKey.isBlank() || refreshToken.isBlank()) return null

    return runCatching {
      val connection = (URL("$supabaseUrl/auth/v1/token?grant_type=refresh_token").openConnection() as HttpURLConnection)
      connection.requestMethod = "POST"
      connection.setRequestProperty("apikey", anonKey)
      connection.setRequestProperty("content-type", "application/json")
      connection.doOutput = true
      connection.outputStream.use { output ->
        output.write(JSONObject().put("refresh_token", refreshToken).toString().toByteArray())
      }
      if (connection.responseCode !in 200..299) return null
      val json = JSONObject(connection.inputStream.bufferedReader().readText())
      val next = JSONObject()
        .put("accessToken", json.getString("access_token"))
        .put("refreshToken", json.optString("refresh_token", refreshToken))
        .put("expiresAt", json.optLong("expires_at", 0L))
        .put("userId", session.optString("userId"))
      writeNativeAuthSession(context, next)
      next
    }.getOrNull()
  }

  private fun toEnrichment(remoteCapture: JSONObject): JSONObject {
    val analysis = remoteCapture.optJSONObject("analysis") ?: analysisFromCapture(remoteCapture)
    val defaultIntent = analysis.optJSONObject("default_intent") ?: JSONObject()
    val analysisRun = firstAnalysisRun(remoteCapture)
    val analysisMode = remoteCapture.optString("analysis_mode").ifBlank {
      if (analysisRun != null && analysisRun.optString("status", "succeeded") == "succeeded") "llm" else ""
    }
    val analysisProvider = remoteCapture.optString("analysis_provider").ifBlank {
      analysisRun?.optString("provider").orEmpty()
    }
    val analysisModel = remoteCapture.optString("analysis_model").ifBlank {
      analysisRun?.optString("model").orEmpty()
    }
    return JSONObject()
      .put(
        "title",
        analysis.optString(
          "display_title",
          remoteCapture.optString("display_title", remoteCapture.optString("source_url", "Capture saved"))
        )
      )
      .put("summary", analysis.optString("summary"))
      .put("siteName", hostFromUrl(remoteCapture.optString("source_url")))
      .put("sourceUrl", remoteCapture.optString("source_url"))
      .put("analysis", analysis)
      .put("analysisMode", analysisMode)
      .put("analysisProvider", analysisProvider)
      .put("analysisModel", analysisModel)
      .put("analysisError", nullableString(remoteCapture, "analysis_error"))
      .put("defaultIntent", defaultIntent.optString("category"))
      .put("intentRationale", defaultIntent.optString("rationale"))
      .put("confidenceLabel", analysis.optString("confidence_label"))
      .put("needsReview", analysis.optBoolean("needs_review") || remoteCapture.optString("analysis_state") == "needs_review")
      .put("entities", normalizeEntities(remoteCapture, analysis))
      .put("suggestedReminders", normalizeReminders(remoteCapture, analysis))
      .put("suggestedCollections", normalizeCollections(remoteCapture, analysis))
      .put("searchPhrases", analysis.optJSONArray("search_phrases") ?: org.json.JSONArray())
  }

  private fun isEdgeFunction(apiUrl: String): Boolean {
    return apiUrl.contains("/functions/v1/")
  }

  private fun firstAnalysisRun(remoteCapture: JSONObject): JSONObject? {
    val runs = remoteCapture.optJSONArray("analysis_runs") ?: return null
    return if (runs.length() > 0) runs.optJSONObject(0) else null
  }

  private fun analysisFromCapture(remoteCapture: JSONObject): JSONObject {
    val confidence = remoteCapture.optDouble("default_intent_confidence", 0.0)
    val confidenceLabel = when {
      confidence >= 0.72 -> "Looks right"
      confidence >= 0.5 -> "Maybe"
      confidence > 0.0 -> "Not sure"
      else -> "Couldn't tell"
    }
    val intent = JSONObject()
      .put("category", remoteCapture.optString("current_save_intent").ifBlank {
        remoteCapture.optString("default_intent", "remember")
      })
      .put("confidence", confidence)
      .put("rationale", remoteCapture.optString("intent_rationale"))
    return JSONObject()
      .put("display_title", remoteCapture.optString("display_title", remoteCapture.optString("title", "Capture ready")))
      .put("summary", remoteCapture.optString("source_text"))
      .put("default_intent", intent)
      .put("entities", org.json.JSONArray())
      .put("suggested_reminders", org.json.JSONArray())
      .put("suggested_collections", org.json.JSONArray())
      .put("search_phrases", org.json.JSONArray())
      .put("confidence_label", confidenceLabel)
      .put("needs_review", remoteCapture.optString("analysis_state") == "needs_review")
  }

  private fun normalizeEntities(remoteCapture: JSONObject, analysis: JSONObject): org.json.JSONArray {
    val related = remoteCapture.optJSONArray("captured_entities")
    if (related == null) return analysis.optJSONArray("entities") ?: org.json.JSONArray()
    val next = org.json.JSONArray()
    for (index in 0 until related.length()) {
      val entity = related.optJSONObject(index) ?: continue
      next.put(
        JSONObject()
          .put("type", entity.optString("type", entity.optString("entity_type")))
          .put("name", entity.optString("name", entity.optString("display_name")))
          .put("evidence", entity.optString("evidence"))
          .put("confidence", entity.optDouble("confidence", 0.0))
      )
    }
    return next
  }

  private fun normalizeReminders(remoteCapture: JSONObject, analysis: JSONObject): org.json.JSONArray {
    val related = remoteCapture.optJSONArray("reminders")
      ?: remoteCapture.optJSONArray("reminder_suggestions")
      ?: return analysis.optJSONArray("suggested_reminders") ?: org.json.JSONArray()
    val next = org.json.JSONArray()
    for (index in 0 until related.length()) {
      val reminder = related.optJSONObject(index) ?: continue
      next.put(
        JSONObject()
          .put("trigger_type", reminder.optString("trigger_type"))
          .put("trigger_value", reminder.optString("trigger_value"))
          .put("rationale", reminder.optString("rationale"))
          .put("confidence", reminder.optDouble("confidence", 0.0))
          .put("status", reminder.optString("status"))
      )
    }
    return next
  }

  private fun normalizeCollections(remoteCapture: JSONObject, analysis: JSONObject): org.json.JSONArray {
    val related = remoteCapture.optJSONArray("collection_suggestions")
      ?: return analysis.optJSONArray("suggested_collections") ?: org.json.JSONArray()
    val next = org.json.JSONArray()
    for (index in 0 until related.length()) {
      val collection = related.optJSONObject(index) ?: continue
      next.put(
        JSONObject()
          .put("name", collection.optString("name"))
          .put("rationale", collection.optString("rationale"))
          .put("confidence", collection.optDouble("confidence", 0.0))
      )
    }
    return next
  }

  private fun llmStillProcessingEnrichment(sourceText: String, sourceUrl: String?): JSONObject {
    return CaptureEnricher.enrich(sourceText, sourceUrl)
      .put("analysisMode", "llm_processing")
      .put("analysisProvider", "openai")
      .put("analysisModel", "")
      .put("analysisError", "")
      .put("defaultIntent", "")
      .put("intentRationale", "")
      .put("confidenceLabel", "")
      .put("needsReview", false)
  }

  private fun hostFromUrl(value: String): String {
    if (value.isBlank()) return ""
    return runCatching { URL(value).host.removePrefix("www.") }.getOrDefault("")
  }

  private fun nullableString(json: JSONObject, key: String): String {
    if (json.isNull(key)) return ""
    val value = json.optString(key)
    return if (value == "null") "" else value
  }
}
