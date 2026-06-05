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
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

private const val ANALYSIS_CLIENT_TAG = "PreciousAnalysisClient"
private const val REMOTE_CAPTURE_PREFS = "precious_remote_captures"
private const val CLIENT_EVENT_CONNECT_TIMEOUT_MS = 5000
private const val CLIENT_EVENT_READ_TIMEOUT_MS = 10000

enum class CaptureProcessingPhase {
  UPLOADING,
  ANALYZING,
  SAVING,
  WAITING_FOR_NETWORK
}

private class NetworkUnavailableException(
  message: String,
  cause: Throwable? = null,
  val reasonCode: String = "unknown_network_error",
  val phase: String = "unknown",
  val requestMethod: String? = null,
  val requestUrl: String? = null,
  val connectTimeoutMs: Int? = null,
  val readTimeoutMs: Int? = null,
  val elapsedMs: Long? = null
) : IOException(message, cause)

object CaptureAnalysisClient {
  suspend fun process(
    context: Context,
    captureId: String,
    sourceText: String,
    sourceUrl: String?,
    clientResolutionAttemptCount: Int = 0,
    clientResolvedUrl: String? = null,
    clientResolutionSource: String? = null,
    assetPath: String? = null,
    assetMimeType: String? = null,
    assetFileName: String? = null,
    assetExpected: Boolean = false,
    onPhase: (CaptureProcessingPhase) -> Unit = {}
  ): JSONObject? {
    var apiUrl = ""
    var accessToken = ""
    var remoteCaptureId = readRemoteCapture(context, captureId)
    return try {
      apiUrl = configuredApiUrl()
      if (apiUrl.isBlank()) return null
      val session = validSession(context) ?: run {
        Log.w(ANALYSIS_CLIENT_TAG, "Hosted capture processing unavailable: no Supabase session")
        return null
      }
      val token = session.optString("accessToken")
      if (token.isBlank()) return null
      accessToken = token

      onPhase(CaptureProcessingPhase.UPLOADING)
      if (assetExpected || !assetPath.isNullOrBlank()) {
        val asset = assetPath?.ifBlank { null }?.let { File(it) }
        if (asset == null || !asset.exists() || asset.length() <= 0) {
          Log.w(
            ANALYSIS_CLIENT_TAG,
            "Shared capture expected an asset but the cached file was unavailable: ${assetPath ?: "(missing path)"}"
          )
          return captureAssetUnavailableEnrichment(sourceText, sourceUrl)
        }
      }
      val created = postCapture(
        apiUrl,
        token,
        captureId,
        sourceText,
        sourceUrl,
        assetPath,
        assetMimeType,
        assetFileName,
        clientResolvedUrl,
        clientResolutionSource,
        clientResolutionAttemptCount.takeIf { it > 0 },
        assetExpected
      )
      if (created == null) {
        Log.w(ANALYSIS_CLIENT_TAG, "Hosted capture enqueue failed")
        return hostedEnqueueFailedEnrichment(sourceText, sourceUrl)
      }
      remoteCaptureId = created.optString("id", captureId)
      rememberRemoteCapture(context, captureId, remoteCaptureId ?: captureId)
      if (!isEdgeFunction(apiUrl)) {
        onPhase(CaptureProcessingPhase.ANALYZING)
        triggerAnalyze(apiUrl, token, remoteCaptureId ?: captureId)
      }

      var clientResolutionAttempted = clientResolutionAttemptCount > 0
      repeat(60) {
        onPhase(CaptureProcessingPhase.ANALYZING)
        val remote = getCapture(apiUrl, token, captureId, remoteCaptureId ?: captureId)
        val state = remote?.optString("analysis_state").orEmpty()
        if (
          remote != null &&
          !clientResolutionAttempted &&
          needsClientResolution(remote) &&
          !sourceUrl.isNullOrBlank()
        ) {
          clientResolutionAttempted = true
          val attemptCount = PreciousCaptureStore.incrementClientResolutionAttempt(context, captureId)
          val resolvedUrl = ClientUrlResolver.resolve(sourceUrl)
          if (!resolvedUrl.isNullOrBlank() && resolvedUrl != sourceUrl) {
            postCapture(
              apiUrl,
              token,
              captureId,
              sourceText,
              sourceUrl,
              clientResolvedUrl = resolvedUrl,
              clientResolutionSource = "android_redirect_resolver",
              clientResolutionAttemptCount = attemptCount
            )
            delay(1000)
            return@repeat
          }
        }
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
      Log.w(ANALYSIS_CLIENT_TAG, "Hosted capture processing is waiting for network (${error.reasonCode}/${error.phase}): ${error.message}")
      reportClientNetworkEvent(apiUrl, accessToken, captureId, remoteCaptureId, error)
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
    assetFileName: String? = null,
    clientResolvedUrl: String? = null,
    clientResolutionSource: String? = null,
    clientResolutionAttemptCount: Int? = null,
    assetExpected: Boolean = false
  ): JSONObject? {
    val edge = isEdgeFunction(apiUrl)
    val url = if (edge) apiUrl else "$apiUrl/api/captures"
    val asset = assetPath?.ifBlank { null }?.let { File(it) }
    if (asset != null && asset.exists() && asset.length() > 0) {
      return postMultipartCapture(url, accessToken, captureId, sourceText, sourceUrl, asset, assetMimeType, assetFileName, edge)
        ?.optJSONObject("capture")
    }
    return request(url, "POST", accessToken, phase = "enqueue_capture") { connection ->
      val body = JSONObject()
        .put("clientCaptureKey", captureId)
        .put("sourceText", sourceText)
        .put("sourceUrl", sourceUrl ?: JSONObject.NULL)
        .put("original_url", sourceUrl ?: JSONObject.NULL)
        .put("client_resolved_url", clientResolvedUrl ?: JSONObject.NULL)
        .put("client_resolution_source", clientResolutionSource ?: JSONObject.NULL)
        .put("client_resolution_timestamp", if (clientResolvedUrl.isNullOrBlank()) JSONObject.NULL else isoNow())
        .put("client_resolution_attempt_count", clientResolutionAttemptCount ?: JSONObject.NULL)
        .put("assetExpected", assetExpected)
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
    val started = System.currentTimeMillis()
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
        field("original_url", sourceUrl)
        field("sourceApp", "Android Share")
        field("assetExpected", "true")
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
        throw NetworkUnavailableException(
          error.message ?: "Network is unavailable",
          error,
          reasonCode = networkReasonCode(error),
          phase = "enqueue_capture_multipart",
          requestMethod = "POST",
          requestUrl = url,
          connectTimeoutMs = 5000,
          readTimeoutMs = 30000,
          elapsedMs = System.currentTimeMillis() - started
        )
      }
      Log.w(ANALYSIS_CLIENT_TAG, "POST $url multipart failed: ${error.message}")
      null
    }
  }

  private fun getCapture(apiUrl: String, accessToken: String, captureId: String, remoteCaptureId: String): JSONObject? {
    return if (isEdgeFunction(apiUrl)) {
      val encoded = URLEncoder.encode(captureId, "UTF-8")
      request("$apiUrl?clientCaptureKey=$encoded", "GET", accessToken, phase = "poll_capture")?.optJSONObject("capture")
    } else {
      val encoded = URLEncoder.encode(remoteCaptureId, "UTF-8")
      request("$apiUrl/api/captures?view=detail&captureId=$encoded", "GET", accessToken, phase = "poll_capture")?.optJSONObject("capture")
    }
  }

  private fun triggerAnalyze(apiUrl: String, accessToken: String, remoteCaptureId: String) {
    request("$apiUrl/api/analyze", "POST", accessToken, readTimeoutMs = 120000, phase = "trigger_analyze") { connection ->
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
    phase: String,
    writeBody: ((HttpURLConnection) -> Unit)? = null
  ): JSONObject? {
    val started = System.currentTimeMillis()
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
        throw NetworkUnavailableException(
          error.message ?: "Network is unavailable",
          error,
          reasonCode = networkReasonCode(error),
          phase = phase,
          requestMethod = method,
          requestUrl = url,
          connectTimeoutMs = 5000,
          readTimeoutMs = readTimeoutMs,
          elapsedMs = System.currentTimeMillis() - started
        )
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
        throw NetworkUnavailableException(
          error.message ?: "Network is unavailable",
          error,
          reasonCode = networkReasonCode(error),
          phase = "refresh_auth_session"
        )
      }
      null
    }
  }

  private fun toEnrichment(remoteCapture: JSONObject): JSONObject {
    val analysis = remoteCapture.optJSONObject("analysis") ?: analysisFromCapture(remoteCapture)
    val urlEvidence = analysis.optJSONObject("url_evidence")
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
      .put("clientResolvedUrl", nullableString(remoteCapture, "client_resolved_url"))
      .put("clientResolutionSource", nullableString(remoteCapture, "client_resolution_source"))
      .put("clientResolutionAttemptCount", remoteCapture.optInt("client_resolution_attempt_count", 0))
      .put("analysis", analysis)
      .put("urlEvidence", urlEvidence ?: JSONObject.NULL)
      .put("analysisMode", analysisMode)
      .put("analysisProvider", analysisProvider)
      .put("analysisModel", analysisModel)
      .put("analysisError", nullableString(remoteCapture, "analysis_error"))
      .put("defaultIntent", defaultIntent.optString("category"))
      .put("intentRationale", defaultIntent.optString("rationale"))
      .put("confidenceLabel", analysis.optString("confidence_label"))
      .put("needsReview", remoteCaptureRequiresReview(remoteCapture, analysis))
      .put("entities", normalizeEntities(remoteCapture, analysis))
      .put("suggestedReminders", normalizeReminders(remoteCapture, analysis))
      .put("collectionDecisions", normalizeCollections(remoteCapture, analysis))
      .put("suggestedCollections", normalizeCollections(remoteCapture, analysis))
      .put("searchPhrases", analysis.optJSONArray("search_phrases") ?: org.json.JSONArray())
      .put("reviewConfirmedAt", nullableString(remoteCapture, "review_confirmed_at"))
  }

  private fun needsClientResolution(remoteCapture: JSONObject): Boolean {
    if (remoteCapture.optString("analysis_mode") == "needs_client_resolution") return true
    val analysis = remoteCapture.optJSONObject("analysis") ?: return false
    val evidence = analysis.optJSONObject("url_evidence") ?: return false
    return evidence.optString("status") == "needs_client_resolution"
  }

  private fun isEdgeFunction(apiUrl: String): Boolean {
    return apiUrl.contains("/functions/v1/")
  }

  private fun isoNow(): String {
    return SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
      timeZone = TimeZone.getTimeZone("UTC")
    }.format(Date())
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
    return analysis.optJSONArray("collection_decisions")
      ?: analysis.optJSONArray("suggested_collections")
      ?: org.json.JSONArray()
  }

  private fun remoteCaptureRequiresReview(remoteCapture: JSONObject, analysis: JSONObject): Boolean {
    if (nullableString(remoteCapture, "review_confirmed_at").isNotBlank()) return false
    if (analysis.optBoolean("needs_review") || remoteCapture.optString("analysis_state") == "needs_review") return true
    return when (analysis.optString("confidence_label")) {
      "Maybe", "Not sure", "Couldn't tell" -> true
      else -> normalizeCollections(remoteCapture, analysis).length() > 0
    }
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

  private fun captureAssetUnavailableEnrichment(sourceText: String, sourceUrl: String?): JSONObject {
    return CaptureEnricher.enrich(sourceText, sourceUrl)
      .put("analysisMode", "capture_asset_missing")
      .put("analysisProvider", "system")
      .put("analysisModel", "android-share-intake")
      .put("analysisError", "Could not upload the shared image. Share it again or choose it from Precious Captures.")
      .put("defaultIntent", "")
      .put("intentRationale", "")
      .put("confidenceLabel", "Couldn't tell")
      .put("needsReview", true)
  }

  private fun hostedEnqueueFailedEnrichment(sourceText: String, sourceUrl: String?): JSONObject {
    return CaptureEnricher.enrich(sourceText, sourceUrl)
      .put("analysisMode", "capture_enqueue_failed")
      .put("analysisProvider", "system")
      .put("analysisModel", "android-share-intake")
      .put("analysisError", "Could not send this capture for analysis. Open Precious Captures and try again.")
      .put("defaultIntent", "")
      .put("intentRationale", "")
      .put("confidenceLabel", "Couldn't tell")
      .put("needsReview", true)
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

  private fun reportClientNetworkEvent(
    apiUrl: String,
    accessToken: String,
    captureId: String,
    remoteCaptureId: String?,
    error: NetworkUnavailableException
  ) {
    if (apiUrl.isBlank() || accessToken.isBlank() || !isEdgeFunction(apiUrl)) return
    runCatching {
      val body = JSONObject()
        .put("captureId", remoteCaptureId ?: captureId)
        .put("clientCaptureKey", captureId)
        .put("eventType", "hosted_capture_waiting")
        .put("phase", error.phase)
        .put("reasonCode", error.reasonCode)
        .put("message", error.message ?: "Hosted capture processing is waiting")
        .put(
          "diagnostics",
          JSONObject()
            .put("exception_class", error.cause?.javaClass?.simpleName ?: error.javaClass.simpleName)
            .put("exception_message", error.cause?.message ?: error.message.orEmpty())
            .put("request_method", error.requestMethod ?: JSONObject.NULL)
            .put("request_host", urlHost(error.requestUrl))
            .put("request_path", urlPath(error.requestUrl))
            .put("api_host", urlHost(apiUrl))
            .put("connect_timeout_ms", error.connectTimeoutMs ?: JSONObject.NULL)
            .put("read_timeout_ms", error.readTimeoutMs ?: JSONObject.NULL)
            .put("elapsed_ms", error.elapsedMs ?: JSONObject.NULL)
            .put("remote_capture_id", remoteCaptureId ?: JSONObject.NULL)
            .put("app_version", BuildConfig.VERSION_NAME)
            .put("app_version_code", BuildConfig.VERSION_CODE)
        )
      val connection = (URL("$apiUrl?resource=client-events").openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = CLIENT_EVENT_CONNECT_TIMEOUT_MS
        readTimeout = CLIENT_EVENT_READ_TIMEOUT_MS
        doOutput = true
        setRequestProperty("accept", "application/json")
        setRequestProperty("content-type", "application/json")
        setRequestProperty("authorization", "Bearer $accessToken")
        if (BuildConfig.SUPABASE_ANON_KEY.isNotBlank()) {
          setRequestProperty("apikey", BuildConfig.SUPABASE_ANON_KEY)
        }
      }
      connection.outputStream.use { output -> output.write(body.toString().toByteArray()) }
      val status = connection.responseCode
      if (status !in 200..299) {
        val stream = connection.errorStream ?: connection.inputStream
        val response = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        Log.w(ANALYSIS_CLIENT_TAG, "Client event upload failed $status: ${response.take(160)}")
      }
      connection.disconnect()
    }.onFailure { eventError ->
      Log.w(ANALYSIS_CLIENT_TAG, "Client event upload failed: ${eventError.message}")
    }
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

  private fun urlHost(value: String?): String {
    if (value.isNullOrBlank()) return ""
    return runCatching { URL(value).host.removePrefix("www.") }.getOrDefault("")
  }

  private fun urlPath(value: String?): String {
    if (value.isNullOrBlank()) return ""
    return runCatching { URL(value).path.ifBlank { "/" } }.getOrDefault("")
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

private fun networkReasonCode(error: Throwable): String {
  val value = error.message.orEmpty()
  return when {
    error is UnknownHostException -> "dns_resolution_failed"
    error is SocketTimeoutException -> "request_timeout"
    error is ConnectException -> "connection_refused"
    error is NoRouteToHostException -> "no_route_to_host"
    value.contains("Unable to resolve host", ignoreCase = true) -> "dns_resolution_failed"
    value.contains("Connection reset", ignoreCase = true) -> "connection_reset"
    value.contains("Software caused connection abort", ignoreCase = true) -> "connection_aborted"
    value.contains("unexpected end of stream", ignoreCase = true) -> "unexpected_end_of_stream"
    else -> "unknown_network_error"
  }
}
