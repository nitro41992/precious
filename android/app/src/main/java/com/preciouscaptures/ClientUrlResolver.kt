package com.preciouscaptures

import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URL
import java.util.Locale

object ClientUrlResolver {
  private const val MAX_REDIRECTS = 8
  private const val CONNECT_TIMEOUT_MS = 5000
  private const val READ_TIMEOUT_MS = 5000
  private const val GET_FALLBACK_MAX_BYTES = 4096
  private val REDIRECT_STATUSES = setOf(301, 302, 303, 307, 308)
  private val HEAD_FALLBACK_STATUSES = setOf(400, 403, 405, 501)

  fun resolve(originalUrl: String?): String? {
    val first = normalize(originalUrl) ?: return null
    var current = first
    repeat(MAX_REDIRECTS) {
      if (!isPublicHttpUrl(current)) return null
      val next = redirectLocation(current) ?: return if (current != first) current else null
      if (!isPublicHttpUrl(next)) return null
      current = next
    }
    return if (current != first && isPublicHttpUrl(current)) current else null
  }

  private fun redirectLocation(current: String): String? {
    val head = redirectLocation(current, "HEAD")
    if (head.result != null) return head.result
    if (!head.shouldFallbackToGet) return null
    return redirectLocation(current, "GET").result
  }

  private fun redirectLocation(current: String, method: String): RedirectAttempt {
    return runCatching {
      val connection = (URL(current).openConnection() as HttpURLConnection).apply {
        instanceFollowRedirects = false
        requestMethod = method
        connectTimeout = CONNECT_TIMEOUT_MS
        readTimeout = READ_TIMEOUT_MS
        setRequestProperty("accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        setRequestProperty(
          "user-agent",
          "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Mobile Safari/537.36"
        )
        if (method == "GET") {
          setRequestProperty("range", "bytes=0-${GET_FALLBACK_MAX_BYTES - 1}")
        }
      }
      val status = connection.responseCode
      if (method == "GET" && status !in REDIRECT_STATUSES) {
        readTinyBody(connection)
      }
      if (status !in REDIRECT_STATUSES) {
        connection.disconnect()
        return RedirectAttempt(null, method == "HEAD" && status in HEAD_FALLBACK_STATUSES)
      }
      val location = connection.getHeaderField("location")
      connection.disconnect()
      val resolved = if (location.isNullOrBlank()) null else normalize(URL(URL(current), location).toString())
      RedirectAttempt(resolved?.takeIf { isPublicHttpUrl(it) }, false)
    }.getOrDefault(RedirectAttempt(null, method == "HEAD"))
  }

  private fun readTinyBody(connection: HttpURLConnection) {
    runCatching {
      val stream = connection.inputStream ?: return
      stream.use { input ->
        val buffer = ByteArray(GET_FALLBACK_MAX_BYTES)
        input.read(buffer)
      }
    }
  }

  private fun normalize(value: String?): String? {
    return runCatching {
      val url = URL(value?.trim().orEmpty())
      if (url.protocol != "http" && url.protocol != "https") return null
      URL(url.protocol, url.host.lowercase(Locale.US), url.port, url.file).toString()
    }.getOrNull()
  }

  private fun isPublicHttpUrl(value: String): Boolean {
    return runCatching {
      val url = URL(value)
      if (url.protocol != "http" && url.protocol != "https") return false
      if (url.userInfo != null) return false
      val host = url.host.lowercase(Locale.US)
      if (host == "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false
      InetAddress.getAllByName(host).none { isPrivateAddress(it) }
    }.getOrDefault(false)
  }

  private fun isPrivateAddress(address: InetAddress): Boolean {
    val bytes = address.address
    if (address.isAnyLocalAddress || address.isLoopbackAddress || address.isLinkLocalAddress || address.isSiteLocalAddress) {
      return true
    }
    if (bytes.size == 16) {
      val first = bytes[0].toInt() and 0xff
      val second = bytes[1].toInt() and 0xff
      return first in 0xfc..0xfd || (first == 0xfe && second in 0x80..0xbf)
    }
    if (bytes.size != 4) return false
    val first = bytes[0].toInt() and 0xff
    val second = bytes[1].toInt() and 0xff
    return first == 10 ||
      first == 127 ||
      first == 0 ||
      (first == 169 && second == 254) ||
      (first == 172 && second in 16..31) ||
      (first == 192 && second == 168)
  }

  private data class RedirectAttempt(val result: String?, val shouldFallbackToGet: Boolean)
}
