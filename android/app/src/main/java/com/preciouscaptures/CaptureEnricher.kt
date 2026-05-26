package com.preciouscaptures

import android.text.Html
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object CaptureEnricher {
  fun enrich(sourceText: String, sourceUrl: String?): JSONObject {
    val url = sourceUrl?.ifBlank { null }
    if (url == null) return fallback(sourceText, null)

    val html = fetch(url) ?: return fallback(sourceText, url)
    val rawTitle = firstMeta(html, "og:title")
      ?: firstMeta(html, "twitter:title")
      ?: titleTag(html)
      ?: fallbackTitle(sourceText, url)
    val socialTitle = titleFromSocialUrl(url)
    val title = if (socialTitle != null && isGenericSocialTitle(rawTitle)) socialTitle else rawTitle
    val summary = firstMeta(html, "og:description")
      ?: firstMeta(html, "twitter:description")
      ?: noteFromShareText(sourceText, url)
    val siteName = firstMeta(html, "og:site_name") ?: hostFromUrl(url)
    val canonicalUrl = firstMeta(html, "og:url") ?: url

    return JSONObject()
      .put("title", clean(title))
      .put("summary", clean(summary))
      .put("siteName", clean(siteName))
      .put("sourceUrl", canonicalUrl)
      .put("analysisMode", "local_metadata")
      .put("analysisProvider", "local")
      .put("analysisModel", "metadata_extractor")
  }

  private fun fetch(value: String): String? {
    return runCatching {
      val connection = (URL(value).openConnection() as HttpURLConnection).apply {
        connectTimeout = 5000
        readTimeout = 7000
        instanceFollowRedirects = true
        setRequestProperty("User-Agent", "Mozilla/5.0 PreciousCaptures/0.1")
        setRequestProperty("Accept", "text/html,application/xhtml+xml")
      }
      connection.inputStream.bufferedReader().use { reader ->
        val buffer = CharArray(262_144)
        val count = reader.read(buffer)
        if (count <= 0) "" else String(buffer, 0, count)
      }
    }.getOrNull()
  }

  private fun firstMeta(html: String, key: String): String? {
    val escaped = Regex.escape(key)
    val propertyThenContent = Regex(
      """<meta\s+[^>]*(?:property|name)=["']$escaped["'][^>]*content=["']([^"']+)["'][^>]*>""",
      RegexOption.IGNORE_CASE
    )
    val contentThenProperty = Regex(
      """<meta\s+[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']$escaped["'][^>]*>""",
      RegexOption.IGNORE_CASE
    )
    return propertyThenContent.find(html)?.groupValues?.get(1)
      ?: contentThenProperty.find(html)?.groupValues?.get(1)
  }

  private fun titleTag(html: String): String? {
    return Regex("""<title[^>]*>(.*?)</title>""", setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL))
      .find(html)
      ?.groupValues
      ?.get(1)
  }

  private fun fallback(sourceText: String, url: String?): JSONObject {
    return JSONObject()
      .put("title", fallbackTitle(sourceText, url))
      .put("summary", noteFromShareText(sourceText, url))
      .put("siteName", hostFromUrl(url))
      .put("sourceUrl", url ?: "")
      .put("analysisMode", "local_metadata")
      .put("analysisProvider", "local")
      .put("analysisModel", "metadata_extractor")
  }

  private fun fallbackTitle(sourceText: String, url: String?): String {
    val socialTitle = titleFromSocialUrl(url)
    if (!socialTitle.isNullOrBlank()) return socialTitle
    val host = hostFromUrl(url)
    if (host.isNotBlank()) return host
    return sourceText.trim().lineSequence().firstOrNull()?.take(72)?.ifBlank { null } ?: "Shared capture"
  }

  private fun titleFromSocialUrl(value: String?): String? {
    if (value.isNullOrBlank()) return null
    val url = runCatching { URL(value) }.getOrNull() ?: return null
    val host = url.host.removePrefix("www.")
    val parts = url.path.split("/").filter { it.isNotBlank() }

    if (host.endsWith("instagram.com") && parts.isNotEmpty()) {
      val handle = parts.first()
      if (handle !in setOf("p", "reel", "reels", "stories", "explore")) return "@$handle on Instagram"
      if (parts.size > 1) return "Instagram ${handle.removeSuffix("s")} ${parts[1]}"
    }

    if (host.endsWith("reddit.com")) {
      val communityIndex = parts.indexOf("r")
      if (communityIndex >= 0 && parts.size > communityIndex + 1) {
        val community = parts[communityIndex + 1]
        val commentsIndex = parts.indexOf("comments")
        if (commentsIndex >= 0 && parts.size > commentsIndex + 2) {
          return parts[commentsIndex + 2].replace("-", " ").replaceFirstChar { it.titlecase() }
        }
        return "r/$community on Reddit"
      }
    }

    return null
  }

  private fun isGenericSocialTitle(value: String): Boolean {
    val normalized = value.lowercase()
    return normalized.isBlank() ||
      normalized.contains("please wait for verification") ||
      normalized == "instagram" ||
      normalized == "instagram.com" ||
      normalized == "reddit" ||
      normalized == "reddit.com"
  }

  private fun noteFromShareText(sourceText: String, url: String?): String {
    return sourceText.replace(url ?: "", "").trim()
  }

  private fun hostFromUrl(value: String?): String {
    if (value.isNullOrBlank()) return ""
    return runCatching { URL(value).host.removePrefix("www.") }.getOrDefault("")
  }

  private fun clean(value: String): String {
    val decoded = Html.fromHtml(value, Html.FROM_HTML_MODE_LEGACY).toString()
    return decoded.replace(Regex("""\s+"""), " ").trim()
  }
}
