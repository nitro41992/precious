package com.preciouscaptures

import org.json.JSONObject
import java.net.URL

object CaptureEnricher {
  fun enrich(sourceText: String, sourceUrl: String?): JSONObject {
    val url = sourceUrl?.ifBlank { null }
    return JSONObject()
      .put("title", sourceTitle(sourceText, url))
      .put("summary", "")
      .put("siteName", hostFromUrl(url))
      .put("sourceUrl", url ?: "")
      .put("analysisMode", "pending_llm")
      .put("analysisProvider", "none")
      .put("analysisModel", "")
  }

  private fun sourceTitle(sourceText: String, url: String?): String {
    val host = hostFromUrl(url)
    if (host.isNotBlank()) return host
    return sourceText.trim().lineSequence().firstOrNull()?.take(72)?.ifBlank { null } ?: "Shared capture"
  }

  private fun hostFromUrl(value: String?): String {
    if (value.isNullOrBlank()) return ""
    return runCatching { URL(value).host.removePrefix("www.") }.getOrDefault("")
  }
}
