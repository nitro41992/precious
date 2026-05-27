package com.preciouscaptures

import android.util.Log
import android.content.Context
import kotlinx.coroutines.delay
import org.json.JSONObject
import java.net.ConnectException
import java.net.HttpURLConnection
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.net.URL
import java.net.URLEncoder
import java.net.UnknownHostException
import java.io.File
import java.io.IOException
import java.util.UUID

private const val ANALYSIS_CLIENT_TAG = "PreciousAnalysisClient"
private const val REMOTE_CAPTURE_PREFS = "precious_remote_captures"

enum class CaptureProcessingPhase {
  UPLOADING,
  ANALYZING,
  SAVING,
  WAITING_FOR_NETWORK
}

private class NetworkUnavailableException(message: String, cause: Throwable? = null) : IOException(message, cause)

object CaptureAnalysisClient {
  suspend fun process(
    context: Context,
    captureId: String,
    sourceText: String,
    sourceUrl: String?,
    assetPath: String? = null,
    assetMimeType: String? = null,
    assetFileName: String? = null,
    onPhase: (CaptureProcessingPhase) -> Unit = {}
  ): JSONObject? {
    return try {
      val apiUrl = configuredApiUrl()
      if (apiUrl.isBlank()) return null
      val session = validSession(context) ?: run {
        Log.w(ANALYSIS_CLIENT_TAG, "Hosted capture processing unavailable: no Supabase session")
        return null
      }
      val token = session.optString("accessToken")
      if (token.isBlank()) return null

      onPhase(CaptureProcessingPhase.UPLOADING)
      val created = postCapture(apiUrl, token, captureId, sourceText, sourceUrl, assetPath, assetMimeType, assetFileName)
      if (created == null) {
        Log.w(ANALYSIS_CLIENT_TAG, "Hosted capture enqueue failed")
        return null
      }
      val remoteCaptureId = created.optString("id", captureId)
      rememberRemoteCapture(context, captureId, remoteCaptureId)
      if (!isEdgeFunction(apiUrl)) {
        onPhase(CaptureProcessingPhase.ANALYZING)
        triggerAnalyze(apiUrl, token, remoteCaptureId)
      }

      repeat(60) {
        onPhase(CaptureProcessingPhase.ANALYZING)
        val remote = getCapture(apiUrl, token, captureId, remoteCaptureId)
        val state = remote?.optString("analysis_state").orEmpty()
        if (remote != null && (state == "ready" || state == "needs_review")) {
          onPhase(CaptureProcessingPhase.SAVING)
          if (!isEdgeFunction(apiUrl)) {
            return toEnrichment(remote)
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
      llmStillProcessingEnrichment(sourceText, sourceUrl)
    } catch (error: NetworkUnavailableException) {
      Log.w(ANALYSIS_CLIENT_TAG, "Hosted capture processing is waiting for network: ${error.message}")
      onPhase(CaptureProcessingPhase.WAITING_FOR_NETWORK)
      waitingForNetworkEnrichment(sourceText, sourceUrl)
    }
  }

  private fun postCapture(
    apiUrl: String,
    accessToken: String,
    captureId: String,
    sourceText: String,
    sourceUrl: String?,
    assetPath: String? = null,
    assetMimeType: String? = null,
    assetFileName: String? = null
  ): JSONObject? {
    val edge = isEdgeFunction(apiUrl)
    val url = if (edge) apiUrl else "$apiUrl/api/captures"
    val asset = assetPath?.ifBlank { null }?.let { File(it) }
    if (asset != null && asset.exists() && asset.length() > 0) {
      return postMultipartCapture(url, accessToken, captureId, sourceText, sourceUrl, asset, assetMimeType, assetFileName, edge)
        ?.optJSONObject("capture")
    }
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

  private fun postMultipartCapture(
    url: String,
    accessToken: String,
    captureId: String,
    sourceText: String,
    sourceUrl: String?,
    asset: File,
    assetMimeType: String?,
    assetFileName: String?,
    autoAnalyze: Boolean
  ): JSONObject? {
    val boundary = "PreciousCapture-${UUID.randomUUID()}"
    return runCatching {
      val connection = (URL(url).openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 5000
        readTimeout = 30000
        doOutput = true
        setRequestProperty("accept", "application/json")
        setRequestProperty("authorization", "Bearer $accessToken")
        setRequestProperty("content-type", "multipart/form-data; boundary=$boundary")
        if (BuildConfig.SUPABASE_ANON_KEY.isNotBlank()) {
          setRequestProperty("apikey", BuildConfig.SUPABASE_ANON_KEY)
        }
      }
      connection.outputStream.use { output ->
        fun field(name: String, value: String?) {
          if (value == null) return
          output.write("--$boundary\r\n".toByteArray())
          output.write("Content-Disposition: form-data; name=\"$name\"\r\n\r\n".toByteArray())
          output.write(value.toByteArray())
          output.write("\r\n".toByteArray())
        }

        field("clientCaptureKey", captureId)
        field("sourceText", sourceText)
        field("sourceUrl", sourceUrl)
        field("sourceApp", "Android Share")
        field("autoAnalyze", if (autoAnalyze) "true" else "false")
        output.write("--$boundary\r\n".toByteArray())
        output.write(
          "Content-Disposition: form-data; name=\"asset\"; filename=\"${safeMultipartFilename(assetFileName ?: asset.name)}\"\r\n"
            .toByteArray()
        )
        output.write("Content-Type: ${(assetMimeType ?: "application/octet-stream")}\r\n\r\n".toByteArray())
        asset.inputStream().use { input -> input.copyTo(output) }
        output.write("\r\n--$boundary--\r\n".toByteArray())
      }
      val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
      val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
      if (connection.responseCode !in 200..299) {
        Log.w(ANALYSIS_CLIENT_TAG, "POST $url multipart failed ${connection.responseCode}: ${body.take(240)}")
        return null
      }
      JSONObject(body)
    }.getOrElse { error ->
      if (error.isTransientNetworkError()) {
        throw NetworkUnavailableException(error.message ?: "Network is unavailable", error)
      }
      Log.w(ANALYSIS_CLIENT_TAG, "POST $url multipart failed: ${error.message}")
      null
    }
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
      if (error.isTransientNetworkError()) {
        throw NetworkUnavailableException(error.message ?: "Network is unavailable", error)
      }
      Log.w(ANALYSIS_CLIENT_TAG, "$method $url failed: ${error.message}")
      null
    }
  }

  private fun validSession(context: Context): JSONObject? {
    return try {
      refreshNativeAuthSession(context)
    } catch (error: Exception) {
      if (error.isTransientNativeNetworkError()) {
        throw NetworkUnavailableException(error.message ?: "Network is unavailable", error)
      }
      null
    }
  }

  private fun toEnrichment(remoteCapture: JSONObject): JSONObject {
    val analysis = remoteCapture.optJSONObject("analysis") ?: analysisFromCapture(remoteCapture)
    val defaultIntent = analysis.optJSONObject("default_intent") ?: JSONObject()
    val analysisRun = firstAnalysisRun(remoteCapture)
    val analysisMode = nullableString(remoteCapture, "analysis_mode").ifBlank {
      if (analysisRun != null && analysisRun.optString("status", "succeeded") == "succeeded") "llm" else ""
    }
    val analysisProvider = nullableString(remoteCapture, "analysis_provider").ifBlank {
      analysisRun?.optString("provider").orEmpty()
    }
    val analysisModel = nullableString(remoteCapture, "analysis_model").ifBlank {
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
    return analysis.optJSONArray("entities") ?: org.json.JSONArray()
  }

  private fun normalizeReminders(remoteCapture: JSONObject, analysis: JSONObject): org.json.JSONArray {
    return analysis.optJSONArray("suggested_reminders") ?: org.json.JSONArray()
  }

  private fun normalizeCollections(remoteCapture: JSONObject, analysis: JSONObject): org.json.JSONArray {
    return analysis.optJSONArray("suggested_collections") ?: org.json.JSONArray()
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

  private fun waitingForNetworkEnrichment(sourceText: String, sourceUrl: String?): JSONObject {
    return CaptureEnricher.enrich(sourceText, sourceUrl)
      .put("analysisMode", "llm_waiting_network")
      .put("analysisProvider", "openai")
      .put("analysisModel", "")
      .put("analysisError", "Waiting for internet to reach Sharebook.")
      .put("defaultIntent", "")
      .put("intentRationale", "")
      .put("confidenceLabel", "")
      .put("needsReview", false)
  }

  private fun rememberRemoteCapture(context: Context, captureId: String, remoteCaptureId: String) {
    context
      .getSharedPreferences(REMOTE_CAPTURE_PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(captureId, remoteCaptureId)
      .apply()
  }

  private fun readRemoteCapture(context: Context, captureId: String): String? {
    return context.getSharedPreferences(REMOTE_CAPTURE_PREFS, Context.MODE_PRIVATE).getString(captureId, null)
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

  private fun safeMultipartFilename(value: String): String {
    return value
      .replace(Regex("[\\\\/\\r\\n\\\"]"), "-")
      .take(120)
      .ifBlank { "shared-file" }
  }
}

private fun Throwable.isTransientNetworkError(): Boolean {
  return isTransientNativeNetworkError() ||
    this is UnknownHostException ||
    this is SocketTimeoutException ||
    this is ConnectException ||
    this is NoRouteToHostException ||
    (this is IOException && message?.contains("Unable to resolve host", ignoreCase = true) == true)
}
