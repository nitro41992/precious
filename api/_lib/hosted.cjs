const crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");

const PROMPT_VERSION = "precious-capture-analysis-v1";
const SCHEMA_VERSION = "precious-capture-analysis-v1";
const MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";

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
          enum: [
            "read_later",
            "watch_later",
            "try_place",
            "buy_later",
            "cook_or_make",
            "remember",
            "follow_up",
            "other"
          ]
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

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function extractUrl(value) {
  return value?.match(/https?:\/\/\S+/i)?.[0] ?? null;
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
    if (host === "reddit.com" || host.endsWith(".reddit.com")) {
      return `https://www.reddit.com/oembed?format=json&url=${encodeURIComponent(value)}`;
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchUrlMetadata(sourceUrl) {
  if (!sourceUrl) return null;
  const endpoint = oembedEndpoint(sourceUrl);
  if (endpoint) {
    try {
      const response = await fetch(endpoint, {
        headers: {
          accept: "application/json",
          "user-agent": "PreciousCaptures/0.1"
        },
        signal: AbortSignal.timeout(7000)
      });
      if (response.ok) {
        const data = await response.json();
        if (typeof data.title === "string" && data.title) {
          return {
            provider: "oembed",
            type: typeof data.type === "string" ? data.type : null,
            title: data.title,
            description: null,
            image: typeof data.thumbnail_url === "string" ? data.thumbnail_url : null,
            canonical: sourceUrl,
            siteName: typeof data.provider_name === "string" ? data.provider_name : null,
            authorName: typeof data.author_name === "string" ? data.author_name : null,
            authorUrl: typeof data.author_url === "string" ? data.author_url : null
          };
        }
      }
    } catch {
      return null;
    }
  }
  return null;
}

function buildPrompt(capture, urlMetadata) {
  return [
    "Infer why the user saved this item. Focus on intent, medium-term usefulness, reminders, and collection fit.",
    "Return concise structured data for a mobile quick-edit surface.",
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
        url_metadata: urlMetadata
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
  const useWebSearch = Boolean(capture.source_url && !urlMetadata);
  const requestBody = {
    model: MODEL,
    reasoning: { effort: "low" },
    max_output_tokens: 1600,
    input: [
      {
        role: "system",
        content: "You are Precious Captures' hosted analysis worker. Produce only schema-valid extraction output."
      },
      { role: "user", content: buildPrompt(capture, urlMetadata) }
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

function searchDocument(capture, analysis, urlMetadata) {
  return [
    analysis.display_title,
    analysis.summary,
    analysis.default_intent?.category,
    analysis.default_intent?.rationale,
    urlMetadata?.title,
    urlMetadata?.authorName,
    capture.source_url,
    capture.source_text,
    ...(analysis.search_phrases ?? []),
    ...(analysis.entities ?? []).map((entity) => `${entity.name} ${entity.type}`)
  ]
    .filter(Boolean)
    .join("\n");
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

async function loadCapture(supabase, userId, captureId) {
  const { data, error } = await supabase
    .from("captures")
    .select("*, captured_entities(*), reminder_suggestions(*), collection_suggestions(*), analysis_runs(*)")
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

  const urlMetadata = await fetchUrlMetadata(capture.source_url);
  const result = await runOpenAi(capture, urlMetadata);
  const analysis = result.analysis;

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

  await Promise.all([
    supabase.from("captured_entities").delete().eq("capture_id", capture.id),
    supabase.from("reminder_suggestions").delete().eq("capture_id", capture.id),
    supabase.from("reminders").delete().eq("capture_id", capture.id),
    supabase.from("collection_suggestions").delete().eq("capture_id", capture.id),
    supabase.from("search_documents").delete().eq("capture_id", capture.id)
  ]);

  if (analysis.entities?.length) {
    await supabase.from("captured_entities").insert(
      analysis.entities.map((entity) => ({
        user_id: userId,
        capture_id: capture.id,
        analysis_run_id: run.id,
        entity_type: entity.type,
        display_name: entity.name,
        normalized_name: String(entity.name || "").toLowerCase(),
        evidence: entity.evidence,
        source: "llm",
        confidence: entity.confidence
      }))
    );
  }

  const realReminders = (analysis.suggested_reminders ?? []).filter(
    (reminder) => reminder.trigger_type !== "none"
  );
  if (realReminders.length) {
    await supabase.from("reminder_suggestions").insert(
      realReminders.map((reminder) => ({
        user_id: userId,
        capture_id: capture.id,
        analysis_run_id: run.id,
        trigger_type: reminder.trigger_type,
        trigger_value: reminder.trigger_value,
        rationale: reminder.rationale,
        confidence: reminder.confidence
      }))
    );
    const remindersToSet = realReminders
      .filter((reminder) => Number(reminder.confidence ?? 0) >= 0.55)
      .map((reminder) => ({
        user_id: userId,
        capture_id: capture.id,
        analysis_run_id: run.id,
        trigger_type: reminder.trigger_type,
        trigger_value: reminder.trigger_value,
        rationale: reminder.rationale,
        confidence: reminder.confidence,
        status: "pending"
      }));
    if (remindersToSet.length) await supabase.from("reminders").insert(remindersToSet);
  }

  if (analysis.suggested_collections?.length) {
    await supabase.from("collection_suggestions").insert(
      analysis.suggested_collections.map((collection) => ({
        user_id: userId,
        capture_id: capture.id,
        analysis_run_id: run.id,
        name: collection.name,
        rationale: collection.rationale,
        confidence: collection.confidence
      }))
    );
  }

  await supabase.from("search_documents").insert({
    user_id: userId,
    capture_id: capture.id,
    analysis_run_id: run.id,
    document: searchDocument(capture, analysis, urlMetadata)
  });

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
  errorMessage,
  failAnalysis,
  loadCapture,
  readBody,
  send,
  withUser
};
