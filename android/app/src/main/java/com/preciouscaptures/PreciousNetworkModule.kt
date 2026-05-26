package com.preciouscaptures

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class PreciousNetworkModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "PreciousNetwork"

  @ReactMethod
  fun requestJson(
    url: String,
    method: String,
    headersJson: String?,
    body: String?,
    promise: Promise
  ) {
    Thread {
      try {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
          requestMethod = method.uppercase()
          connectTimeout = 10000
          readTimeout = 30000
          val headers = runCatching { JSONObject(headersJson ?: "{}") }.getOrDefault(JSONObject())
          headers.keys().forEach { key ->
            setRequestProperty(key, headers.optString(key))
          }
          if (!body.isNullOrBlank()) {
            doOutput = true
            if (getRequestProperty("content-type").isNullOrBlank()) {
              setRequestProperty("content-type", "application/json")
            }
          }
        }

        if (!body.isNullOrBlank()) {
          connection.outputStream.use { output -> output.write(body.toByteArray()) }
        }

        val status = connection.responseCode
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        val responseBody = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        promise.resolve(
          JSONObject()
            .put("status", status)
            .put("ok", status in 200..299)
            .put("body", responseBody)
            .toString()
        )
        connection.disconnect()
      } catch (error: Exception) {
        promise.reject("native_request_failed", error)
      }
    }.start()
  }
}
