const crypto = require("node:crypto");
const dns = require("node:dns").promises;
const net = require("node:net");
const { createClient } = require("@supabase/supabase-js");
const saveIntents = require("../../supabase/functions/_shared/save-intents.json");

const PROMPT_VERSION = "precious-capture-analysis-v2";
const SCHEMA_VERSION = "precious-capture-analysis-v2";
const MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const USER_AGENT = "PreciousCaptures/0.1 (+https://github.com/nitro41992/precious)";
const METADATA_MAX_BYTES = 220_000;
const METADATA_TIMEOUT_MS = 7000;
const ACTIVE_SAVE_INTENTS = saveIntents.filter((intent) => intent.active);
const ACTIVE_SAVE_INTENT_KEYS = ACTIVE_SAVE_INTENTS.map((intent) => intent.key);
const SAVE_INTENT_PROMPT = ACTIVE_SAVE_INTENTS
  .map((intent) => `- ${intent.key} (${intent.label}): ${intent.llm_description}`)
  .join("\n");

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "display_title",
    "summary",
    "default_intent",
    "entities",
    "suggested_reminders",
    "suggested_collections",
    "search_phrases",
    "confidence_label",
    "needs_review"
  ],
  properties: {
    display_title: { type: "string" },
    summary: { type: "string" },
    default_intent: {
      type: "object",
      additionalProperties: false,
      required: ["category", "confidence", "rationale"],
      properties: {
        category: {
          type: "string",
          enum: ACTIVE_SAVE_INTENT_KEYS
        },
        confidence: { type: "number" },
        rationale: { type: "string" }
      }
    },
    entities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "name", "evidence", "confidence"],
        properties: {
          type: { type: "string" },
          name: { type: "string" },
          evidence: { type: "string" },
          confidence: { type: "number" }
        }
      }
    },
    suggested_reminders: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["trigger_type", "trigger_value", "rationale", "confidence"],
        properties: {
          trigger_type: { type: "string", enum: ["time", "place", "none"] },
          trigger_value: { type: "string" },
          rationale: { type: "string" },
          confidence: { type: "number" }
        }
      }
    },
    suggested_collections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "rationale", "confidence"],
        properties: {
          name: { type: "string" },
          rationale: { type: "string" },
          confidence: { type: "number" }
        }
      }
    },
    search_phrases: { type: "array", items: { type: "string" } },
    confidence_label: {
      type: "string",
      enum: ["Looks right", "Maybe", "Not sure", "Couldn't tell"]
    },
    needs_review: { type: "boolean" }
  }
};

function env(name, fallbackName) {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : "");
  if (!value) throw new Error(`${name}${fallbackName ? `/${fallbackName}` : ""} is not configured`);
  return value;
}

function adminClient() {
  return createClient(env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false }
  });
}

async function currentUser(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  if (error) return null;
  return data.user;
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function errorMessage(error, fallback = "Unexpected server error") {
  if (error instanceof Error && error.message) return error.message;
  if (error?.message) return String(error.message);
  if (error?.error?.message) return String(error.error.message);
  if (error?.details || error?.hint || error?.code) {
    return [error.message, error.details, error.hint, error.code].filter(Boolean).join(" ");
  }
  try {
    const serialized = JSON.stringify(error);
    return serialized && serialized !== "{}" ? serialized : fallback;
  } catch {
    return fallback;
  }
}

function allowCors(req, res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "authorization, apikey, content-type");
  res.setHeader("access-control-allow-methods", "GET, POST, PATCH, OPTIONS");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

function captureState(row) {
  const analysis = row?.analysis && typeof row.analysis === "object" ? row.analysis : {};
  if (row?.archived_at || analysis.capture_state === "archived") return "archived";
  return "active";
}

function withCaptureState(row) {
  return row ? { ...row, capture_state: captureState(row) } : row;
}

function withCaptureStates(rows) {
  return Array.isArray(rows) ? rows.map(withCaptureState) : [];
}

function mergeAnalysisPatch(row, patch) {
  const current = row?.analysis && typeof row.analysis === "object" ? row.analysis : {};
  return { ...current, ...patch };
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const raw = await readRawBody(req);
  return raw.length ? JSON.parse(raw.toString("utf8")) : {};
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function parseContentDisposition(value) {
  const parsed = {};
  for (const part of String(value || "").split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rest.length) {
      parsed.type = rawKey;
      continue;
    }
    parsed[rawKey.toLowerCase()] = rest.join("=").replace(/^"|"$/g, "");
  }
  return parsed;
}

function parseMultipartBuffer(buffer, contentType) {
  const match = String(contentType || "").match(/boundary=([^;]+)/i);
  if (!match) throw new Error("multipart boundary is required");
  const boundary = Buffer.from(`--${match[1].replace(/^"|"$/g, "")}`);
  const fields = {};
  let asset = null;
  let offset = 0;
  while (offset < buffer.length) {
    const start = buffer.indexOf(boundary, offset);
    if (start === -1) break;
    const next = buffer.indexOf(boundary, start + boundary.length);
    if (next === -1) break;
    let part = buffer.subarray(start + boundary.length, next);
    if (part.subarray(0, 2).toString() === "--") break;
    if (part.subarray(0, 2).toString() === "\r\n") part = part.subarray(2);
    if (part.subarray(-2).toString() === "\r\n") part = part.subarray(0, -2);
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) {
      offset = next;
      continue;
    }
    const headerText = part.subarray(0, headerEnd).toString("utf8");
    const body = part.subarray(headerEnd + 4);
    const headers = {};
    for (const line of headerText.split(/\r?\n/)) {
      const index = line.indexOf(":");
      if (index > 0) headers[line.slice(0, index).toLowerCase()] = line.slice(index + 1).trim();
    }
    const disposition = parseContentDisposition(headers["content-disposition"]);
    const name = disposition.name;
    if (!name) {
      offset = next;
      continue;
    }
    if (disposition.filename) {
      asset = {
        fieldName: name,
        filename: disposition.filename,
        contentType: headers["content-type"] || "application/octet-stream",
        buffer: body
      };
    } else {
      fields[name] = body.toString("utf8");
    }
    offset = next;
  }
  return { fields, asset };
}

async function readCapturePayload(req) {
  const contentType = req.headers["content-type"] || "";
  if (/multipart\/form-data/i.test(contentType)) {
    return parseMultipartBuffer(await readRawBody(req), contentType);
  }
  return { fields: await readBody(req), asset: null };
}

function extractUrl(value) {
  return cleanUrl(value?.match(/https?:\/\/\S+/i)?.[0] ?? null);
}

function cleanUrl(value) {
  if (!value || typeof value !== "string") return null;
  return value.trim().replace(/[),.;\]]+$/g, "");
}

function normalizeUrl(value) {
  const cleaned = cleanUrl(value);
  if (!cleaned) return null;
  try {
    const url = new URL(cleaned);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }
    return url.toString();
  } catch {
    return null;
  }
}

function absoluteUrl(value, baseUrl) {
  if (!value || typeof value !== "string") return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function hostFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function decodeHtml(value) {
  if (!value || typeof value !== "string") return null;
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAttrs(value) {
  const attrs = {};
  for (const match of value.matchAll(/([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
    attrs[match[1].toLowerCase()] = decodeHtml(match[3] ?? match[4] ?? match[5] ?? "") || "";
  }
  return attrs;
}

function firstMeta(html, keys) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  for (const match of html.matchAll(/<meta\b([^>]+)>/gi)) {
    const attrs = parseAttrs(match[1]);
    const name = String(attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    if (wanted.has(name) && attrs.content) return attrs.content;
  }
  return null;
}

function firstLink(html, rels, baseUrl, typePredicate) {
  const wanted = rels.map((rel) => rel.toLowerCase());
  for (const match of html.matchAll(/<link\b([^>]+)>/gi)) {
    const attrs = parseAttrs(match[1]);
    const rel = String(attrs.rel || "").toLowerCase();
    if (!attrs.href || !wanted.some((item) => rel.split(/\s+/).includes(item))) continue;
    if (typePredicate && !typePredicate(String(attrs.type || "").toLowerCase())) continue;
    return absoluteUrl(attrs.href, baseUrl);
  }
  return null;
}

function firstTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return decodeHtml(match?.[1] || "");
}

function imageFromJsonLd(value, baseUrl) {
  if (!value) return null;
  if (typeof value === "string") return absoluteUrl(value, baseUrl);
  if (Array.isArray(value)) return imageFromJsonLd(value[0], baseUrl);
  if (typeof value === "object") return imageFromJsonLd(value.url || value.contentUrl, baseUrl);
  return null;
}

function authorFromJsonLd(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return authorFromJsonLd(value[0]);
  if (typeof value === "object") return value.name || value.author || value.creator || null;
  return null;
}

function jsonLdCandidates(html) {
  const candidates = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = parseAttrs(match[1]);
    if (!String(attrs.type || "").toLowerCase().includes("ld+json")) continue;
    try {
      const parsed = JSON.parse(match[2].trim());
      if (Array.isArray(parsed)) candidates.push(...parsed);
      else if (parsed?.["@graph"] && Array.isArray(parsed["@graph"])) candidates.push(...parsed["@graph"]);
      else if (parsed) candidates.push(parsed);
    } catch {
      // Ignore malformed JSON-LD.
    }
  }
  return candidates.slice(0, 8);
}

function parseHtmlMetadata(html, sourceUrl) {
  const jsonLd = jsonLdCandidates(html);
  const primaryJsonLd = jsonLd.find((item) => item && typeof item === "object" && (item.name || item.headline)) || null;
  const canonical = firstLink(html, ["canonical"], sourceUrl) || sourceUrl;
  const title =
    firstMeta(html, ["og:title", "twitter:title"]) ||
    primaryJsonLd?.headline ||
    primaryJsonLd?.name ||
    firstTitle(html);
  const description =
    firstMeta(html, ["og:description", "twitter:description", "description"]) ||
    primaryJsonLd?.description ||
    null;
  const image =
    absoluteUrl(firstMeta(html, ["og:image", "og:image:url", "twitter:image", "twitter:image:src"]), sourceUrl) ||
    imageFromJsonLd(primaryJsonLd?.image, sourceUrl);
  const siteName = firstMeta(html, ["og:site_name", "application-name"]) || hostFromUrl(sourceUrl);
  const authorName =
    firstMeta(html, ["article:author", "author", "twitter:creator"]) ||
    authorFromJsonLd(primaryJsonLd?.author || primaryJsonLd?.creator) ||
    null;
  const favicon =
    firstLink(html, ["icon"], sourceUrl) ||
    firstLink(html, ["shortcut", "apple-touch-icon"], sourceUrl) ||
    absoluteUrl("/favicon.ico", sourceUrl);
  const type = firstMeta(html, ["og:type"]) || primaryJsonLd?.["@type"] || null;
  const provider = firstMeta(html, ["og:site_name"]) || hostFromUrl(sourceUrl);
  const raw = {
    jsonLd: primaryJsonLd
      ? {
          type: primaryJsonLd["@type"] || null,
          name: primaryJsonLd.name || null,
          headline: primaryJsonLd.headline || null,
          datePublished: primaryJsonLd.datePublished || null,
          dateModified: primaryJsonLd.dateModified || null
        }
      : null
  };
  if (!title && !description && !image) return null;
  return {
    provider,
    type,
    title: title ? String(title).slice(0, 300) : null,
    description: description ? String(description).slice(0, 1200) : null,
    image,
    canonical,
    siteName,
    favicon,
    authorName: authorName ? String(authorName).slice(0, 240) : null,
    authorUrl: null,
    source: title || description ? "open_graph" : "html_metadata",
    confidence: title || description ? 0.72 : 0.42,
    status: "success",
    raw
  };
}

function isPrivateIp(address) {
  const version = net.isIP(address);
  if (!version) return false;
  if (version === 6) {
    const lower = address.toLowerCase();
    return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
  }
  const parts = address.split(".").map(Number);
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 0
  );
}

async function assertPublicUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http/https URLs are supported");
  if (url.username || url.password) throw new Error("Credentialed URLs are not supported");
  if (isPrivateIp(url.hostname)) throw new Error("Private URLs are not supported");
  const addresses = await dns.lookup(url.hostname, { all: true }).catch(() => []);
  if (addresses.some((address) => isPrivateIp(address.address))) {
    throw new Error("Private URLs are not supported");
  }
}

async function fetchTextLimited(sourceUrl, options = {}) {
  let current = normalizeUrl(sourceUrl);
  if (!current) throw new Error("Invalid URL");
  for (let redirect = 0; redirect <= 4; redirect += 1) {
    await assertPublicUrl(current);
    const response = await fetch(current, {
      redirect: "manual",
      headers: {
        accept: options.accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent": USER_AGENT
      },
      signal: AbortSignal.timeout(options.timeoutMs || METADATA_TIMEOUT_MS)
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirect without location");
      current = new URL(location, current).toString();
      continue;
    }
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) throw new Error(`Metadata fetch failed with ${response.status}`);
    if (options.htmlOnly !== false && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new Error(`Unsupported metadata content-type: ${contentType || "unknown"}`);
    }
    const reader = response.body?.getReader();
    if (!reader) return { text: await response.text(), finalUrl: current, contentType };
    const chunks = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > (options.maxBytes || METADATA_MAX_BYTES)) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    return {
      text: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8"),
      finalUrl: current,
      contentType
    };
  }
  throw new Error("Too many redirects");
}

function titleFallback(sourceText, sourceUrl) {
  if (sourceUrl) {
    try {
      return new URL(sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      return sourceUrl;
    }
  }
  return sourceText?.trim().split(/\n/)[0]?.slice(0, 80) || "Untitled capture";
}

function inferSourceApp(sourceUrl) {
  if (!sourceUrl) return null;
  if (/instagram\.com/i.test(sourceUrl)) return "Instagram";
  if (/tiktok\.com/i.test(sourceUrl)) return "TikTok";
  if (/reddit\.com/i.test(sourceUrl)) return "Reddit";
  if (/youtube\.com|youtu\.be/i.test(sourceUrl)) return "YouTube";
  if (/maps\.app\.goo\.gl|google\.[^/]+\/maps|maps\.google\./i.test(sourceUrl)) return "Maps";
  if (/x\.com|twitter\.com/i.test(sourceUrl)) return "X";
  return "Browser";
}

function inferCaptureType(sourceUrl, sourceText) {
  if (sourceUrl) {
    if (/instagram\.com|tiktok\.com|reddit\.com|youtube\.com|youtu\.be|x\.com|twitter\.com/i.test(sourceUrl)) {
      return "social_post";
    }
    return "link";
  }
  return sourceText ? "text_note" : "unknown";
}

function oembedEndpoint(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be" || host === "music.youtube.com") {
      return `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(value)}`;
    }
    if (host === "reddit.com" || host.endsWith(".reddit.com")) {
      return `https://www.reddit.com/oembed?format=json&url=${encodeURIComponent(value)}`;
    }
  } catch {
    return null;
  }
  return null;
}

function oembedMetadata(data, sourceUrl, provider = "oembed") {
  if (!data || typeof data.title !== "string" || !data.title) return null;
  return {
    provider,
    type: typeof data.type === "string" ? data.type : null,
    title: data.title,
    description: typeof data.description === "string" ? data.description.slice(0, 1200) : null,
    image: typeof data.thumbnail_url === "string" ? data.thumbnail_url : null,
    canonical: sourceUrl,
    siteName: typeof data.provider_name === "string" ? data.provider_name : null,
    favicon: null,
    authorName: typeof data.author_name === "string" ? data.author_name : null,
    authorUrl: typeof data.author_url === "string" ? data.author_url : null,
    source: "oembed",
    confidence: 0.9,
    status: "success",
    raw: {
      provider_name: data.provider_name || null,
      type: data.type || null,
      version: data.version || null,
      thumbnail_url: data.thumbnail_url || null
    }
  };
}

async function fetchOembedMetadata(sourceUrl, endpoint) {
  if (endpoint) {
    const { text } = await fetchTextLimited(endpoint, {
      accept: "application/json",
      htmlOnly: false,
      maxBytes: 80_000
    });
    return oembedMetadata(JSON.parse(text), sourceUrl);
  }
  return null;
}

async function loadCachedUrlMetadata(supabase, userId, normalizedUrl) {
  return null;
}

async function persistUrlMetadata(supabase, userId, normalizedUrl, metadata, errorMessageValue) {
  return;
}

function hasUsefulMetadata(metadata) {
  return Boolean(metadata && (metadata.title || metadata.description || metadata.image));
}

async function fetchUrlMetadata(sourceUrl, supabase, userId) {
  const normalized = normalizeUrl(sourceUrl);
  if (!normalized) return null;
  const cached = await loadCachedUrlMetadata(supabase, userId, normalized).catch(() => null);
  if (cached && hasUsefulMetadata(cached)) return cached;

  try {
    const directOembed = await fetchOembedMetadata(normalized, oembedEndpoint(normalized)).catch(() => null);
    if (directOembed) {
      await persistUrlMetadata(supabase, userId, normalized, directOembed);
      return directOembed;
    }

    const { text: html, finalUrl } = await fetchTextLimited(normalized);
    const discoveredOembed = firstLink(
      html,
      ["alternate"],
      finalUrl,
      (type) => type.includes("json+oembed") || type.includes("xml+oembed")
    );
    const discovered = await fetchOembedMetadata(finalUrl, discoveredOembed).catch(() => null);
    if (discovered) {
      await persistUrlMetadata(supabase, userId, normalized, discovered);
      return discovered;
    }

    const parsed = parseHtmlMetadata(html, finalUrl);
    if (parsed) {
      await persistUrlMetadata(supabase, userId, normalized, parsed);
      return parsed;
    }
    await persistUrlMetadata(supabase, userId, normalized, null, "No preview metadata found");
  } catch (error) {
    await persistUrlMetadata(supabase, userId, normalized, null, errorMessage(error, "Metadata fetch failed"));
  }
  return null;
}

function buildPrompt(capture, urlMetadata) {
  return [
    "Infer why the user saved this item. Focus on intent, medium-term usefulness, reminders, and collection fit.",
    "Return concise structured data for a mobile quick-edit surface.",
    "Choose default_intent.category from this configured save-intent catalog:",
    SAVE_INTENT_PROMPT,
    "Prefer the most specific future use over content type. Do not choose visit just because a place or business appears; choose reference for business contact or pricing information unless there is clear visit intent.",
    "Do not use a catch-all. If no specific future use is inferable, choose remember with lower confidence and needs_review.",
    "Use URL metadata when provided.",
    "If URL metadata is missing and web search is available, search for evidence about the exact shared URL or its stable public identifier.",
    "Use a single targeted search whenever possible; do not browse broadly when the exact URL or ID is enough.",
    "Only use web evidence that clearly matches the shared URL. If evidence is missing or ambiguous, mark the result low confidence instead of inventing details.",
    "Suggest a reminder only when the evidence has a useful future trigger. Do not invent events, places, or deadlines.",
    "If metadata is unavailable, infer only from the URL path and shared text and mark low confidence when needed.",
    "",
    JSON.stringify(
      {
        source_app: capture.source_app,
        source_url: capture.source_url,
        source_text: capture.source_text,
        url_metadata: urlMetadata,
        asset: capture.asset_url
          ? {
              mime_type: capture.asset_mime_type || null,
              purpose: "Optional shared image evidence from the Android share sheet."
            }
          : null
      },
      null,
      2
    )
  ].join("\n");
}

function responseText(payload) {
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") return content.text;
    }
  }
  return null;
}

async function runOpenAi(capture, urlMetadata) {
  const started = Date.now();
  const useWebSearch = Boolean(capture.source_url && !hasUsefulMetadata(urlMetadata));
  const userContent = [{ type: "input_text", text: buildPrompt(capture, urlMetadata) }];
  if (capture.asset_url && String(capture.asset_mime_type || "").startsWith("image/")) {
    userContent.push({ type: "input_image", image_url: capture.asset_url });
  }
  const requestBody = {
    model: MODEL,
    reasoning: { effort: "low" },
    max_output_tokens: 1600,
    input: [
      {
        role: "system",
        content: "You are Precious Captures' hosted analysis worker. Produce only schema-valid extraction output."
      },
      { role: "user", content: userContent }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "capture_analysis",
        strict: true,
        schema: analysisSchema
      }
    }
  };
  if (useWebSearch) {
    requestBody.tools = [{ type: "web_search" }];
    requestBody.tool_choice = "auto";
    requestBody.include = ["web_search_call.action.sources"];
  }
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env("OPENAI_API_KEY")}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });
  const raw = await response.json();
  if (!response.ok) throw new Error(raw.error?.message || `OpenAI failed with ${response.status}`);
  const text = responseText(raw);
  if (!text) throw new Error("OpenAI response did not include output text");
  return {
    analysis: JSON.parse(text),
    model: MODEL,
    raw,
    latencyMs: Date.now() - started,
    usage: raw.usage ?? {}
  };
}

async function createOrGetCapture(supabase, userId, body) {
  const sourceText = typeof body.sourceText === "string" ? body.sourceText.trim() : "";
  const sourceUrl =
    typeof body.sourceUrl === "string" && body.sourceUrl.trim()
      ? body.sourceUrl.trim()
      : extractUrl(sourceText);
  if (!sourceText && !sourceUrl) throw new Error("sourceText or sourceUrl is required");

  const clientCaptureKey =
    typeof body.clientCaptureKey === "string" && body.clientCaptureKey.trim()
      ? body.clientCaptureKey.trim()
      : crypto.randomUUID();

  const existing = await supabase
    .from("captures")
    .select("*")
    .eq("user_id", userId)
    .eq("client_capture_key", clientCaptureKey)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const displayTitle = titleFallback(sourceText, sourceUrl);
  const { data, error } = await supabase
    .from("captures")
    .insert({
      user_id: userId,
      client_capture_key: clientCaptureKey,
      capture_type: inferCaptureType(sourceUrl, sourceText),
      source_url: sourceUrl,
      source_text: sourceText || sourceUrl,
      source_app: typeof body.sourceApp === "string" ? body.sourceApp : inferSourceApp(sourceUrl),
      display_title: displayTitle,
      title: null,
      analysis_state: "queued",
      analysis_error: null
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

function safeFilename(value) {
  return String(value || "shared-file")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 120) || "shared-file";
}

async function ensureCaptureBucket(supabase) {
  const { error } = await supabase.storage.getBucket("captures");
  if (!error) return;
  await supabase.storage.createBucket("captures", { public: false }).catch(() => {});
}

async function createOrGetCaptureWithAsset(supabase, userId, fields, asset) {
  const sourceText =
    typeof fields.sourceText === "string" && fields.sourceText.trim()
      ? fields.sourceText.trim()
      : asset
        ? `Shared ${asset.contentType?.split("/")[0] || "file"}: ${asset.filename || "attachment"}`
        : "";
  const capture = await createOrGetCapture(
    supabase,
    userId,
    {
      ...fields,
      sourceText,
      sourceUrl: typeof fields.sourceUrl === "string" && fields.sourceUrl.trim() ? fields.sourceUrl : extractUrl(sourceText),
      sourceApp: typeof fields.sourceApp === "string" ? fields.sourceApp : "Android Share"
    }
  );
  if (!asset || !asset.buffer?.length) return capture;

  const existing = await supabase
    .from("capture_assets")
    .select("id")
    .eq("user_id", userId)
    .eq("capture_id", capture.id)
    .maybeSingle()
    .catch(() => ({ data: null, error: null }));
  if (existing?.data) return capture;

  const extension = safeFilename(asset.filename).split(".").pop() || "bin";
  const storagePath = `${userId}/${capture.id}/${crypto.randomUUID()}.${extension}`;
  await ensureCaptureBucket(supabase);
  const upload = await supabase.storage.from("captures").upload(storagePath, asset.buffer, {
    contentType: asset.contentType || "application/octet-stream",
    upsert: false
  });
  if (upload.error) throw upload.error;
  const { error } = await supabase.from("capture_assets").insert({
    user_id: userId,
    capture_id: capture.id,
    storage_path: storagePath,
    public_url: null,
    mime_type: asset.contentType || "application/octet-stream",
    byte_size: asset.buffer.length
  });
  if (error) throw error;
  await supabase
    .from("captures")
    .update({
      capture_type: asset.contentType?.startsWith("image/") ? "image" : capture.capture_type
    })
    .eq("id", capture.id)
    .eq("user_id", userId);
  return capture;
}

async function loadCapture(supabase, userId, captureId) {
  const { data, error } = await supabase
    .from("captures")
    .select("*, analysis_runs(*), capture_assets(*)")
    .eq("user_id", userId)
    .or(`id.eq.${captureId},client_capture_key.eq.${captureId}`)
    .order("created_at", { referencedTable: "analysis_runs", ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function analyzeCapture(supabase, userId, captureId) {
  const capture = await loadCapture(supabase, userId, captureId);
  if (!capture) throw new Error("Capture not found");
  if (capture.analysis_cancel_requested_at) {
    const error = new Error("AI processing was cancelled.");
    error.statusCode = 409;
    throw error;
  }

  await supabase
    .from("captures")
    .update({ analysis_state: "processing", analysis_error: null })
    .eq("id", capture.id)
    .eq("user_id", userId)
    .is("analysis_cancel_requested_at", null);

  const urlMetadata = await fetchUrlMetadata(capture.source_url, supabase, userId);
  const asset = Array.isArray(capture.capture_assets) ? capture.capture_assets[0] : null;
  const signedAsset =
    asset?.storage_path && String(asset.mime_type || "").startsWith("image/")
      ? await supabase.storage.from("captures").createSignedUrl(asset.storage_path, 60 * 10)
      : null;
  const captureForAnalysis =
    signedAsset?.data?.signedUrl
      ? { ...capture, asset_url: signedAsset.data.signedUrl, asset_mime_type: asset.mime_type }
      : capture;
  const result = await runOpenAi(captureForAnalysis, urlMetadata);
  const analysis = {
    ...result.analysis,
    url_metadata: urlMetadata
  };

  const { data: run, error: runError } = await supabase
    .from("analysis_runs")
    .insert({
      user_id: userId,
      capture_id: capture.id,
      provider: "openai",
      model: result.model,
      status: "succeeded",
      is_canonical: true,
      prompt_version: PROMPT_VERSION,
      schema_version: SCHEMA_VERSION,
      latency_ms: result.latencyMs,
      usage: result.usage,
      raw_output: analysis,
      raw_model_output: JSON.stringify(result.raw)
    })
    .select("id")
    .single();
  if (runError) throw runError;

  const { error: updateError } = await supabase
    .from("captures")
    .update({
      capture_type: analysis.capture_type || capture.capture_type,
      analysis_state: analysis.needs_review ? "needs_review" : "ready",
      analysis_error: null,
      analysis,
      analysis_provider: "openai",
      analysis_model: result.model,
      analysis_mode: "llm",
      display_title: analysis.display_title,
      title: capture.title || urlMetadata?.title || analysis.display_title,
      thumbnail_url: urlMetadata?.image || capture.thumbnail_url,
      default_intent: analysis.default_intent.category,
      default_intent_confidence: analysis.default_intent.confidence,
      current_save_intent: analysis.default_intent.category,
      intent_rationale: analysis.default_intent.rationale,
      processed_at: new Date().toISOString()
    })
    .eq("id", capture.id)
    .eq("user_id", userId);
  if (updateError) throw updateError;

  return loadCapture(supabase, userId, capture.id);
}

async function failAnalysis(supabase, userId, captureId, error) {
  const message = errorMessage(error, "Capture analysis failed");
  await supabase.from("analysis_runs").insert({
    user_id: userId,
    capture_id: captureId,
    provider: "openai",
    model: MODEL,
    status: "failed",
    is_canonical: true,
    prompt_version: PROMPT_VERSION,
    schema_version: SCHEMA_VERSION,
    raw_output: {},
    error_message: message
  });
  await supabase
    .from("captures")
    .update({
      analysis_state: "failed",
      analysis_error: message,
      analysis_mode: "llm_failed",
      analysis_provider: "openai",
      analysis_model: MODEL,
      processed_at: new Date().toISOString()
    })
    .eq("id", captureId)
    .eq("user_id", userId);
}

async function withUser(req, res, handler) {
  if (allowCors(req, res)) return;
  try {
    const user = await currentUser(req);
    if (!user) return send(res, 401, { error: "Unauthorized" });
    return await handler({ user, supabase: adminClient() });
  } catch (error) {
    return send(res, error.statusCode || 500, {
      error: errorMessage(error)
    });
  }
}

module.exports = {
  analyzeCapture,
  createOrGetCapture,
  createOrGetCaptureWithAsset,
  errorMessage,
  failAnalysis,
  loadCapture,
  readBody,
  readCapturePayload,
  send,
  withCaptureState,
  withCaptureStates,
  mergeAnalysisPatch,
  withUser
};
