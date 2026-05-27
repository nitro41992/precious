import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import saveIntents from "../_shared/save-intents.json" assert { type: "json" };

type CaptureRow = {
  id: string;
  user_id: string;
  capture_type?: string | null;
  source_url: string | null;
  source_text: string | null;
  source_app: string | null;
  asset_url?: string;
  asset_mime_type?: string | null;
  capture_assets?: Array<{
    storage_path: string;
    mime_type: string | null;
  }>;
};

type CapturePayload = {
  fields: Record<string, string>;
  asset: {
    filename: string;
    contentType: string;
    bytes: ArrayBuffer;
    size: number;
  } | null;
};

const PROMPT_VERSION = "precious-capture-analysis-v2";
const SCHEMA_VERSION = "precious-capture-analysis-v2";
const activeSaveIntents = (saveIntents as Array<{
  key: string;
  label: string;
  llm_description: string;
  active: boolean;
}>).filter((intent) => intent.active);
const activeSaveIntentKeys = activeSaveIntents.map((intent) => intent.key);
const activeSaveIntentKeySet = new Set(activeSaveIntentKeys);
const saveIntentPrompt = activeSaveIntents
  .map((intent) => `- ${intent.key} (${intent.label}): ${intent.llm_description}`)
  .join("\n");

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type",
  "access-control-allow-methods": "GET, POST, PATCH, OPTIONS"
};

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
          enum: activeSaveIntentKeys
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" }
  });
}

function errorMessage(error: unknown, fallback = "Unexpected error") {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    return String(value.message || value.details || value.hint || value.code || fallback);
  }
  return fallback;
}

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false }
  });
}

async function currentUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  if (error) return null;
  return data.user;
}

function extractUrl(value: string | null | undefined) {
  return value?.match(/https?:\/\/\S+/i)?.[0] ?? null;
}

function titleFallback(sourceText: string | null, sourceUrl: string | null) {
  if (sourceUrl) {
    try {
      return new URL(sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      return sourceUrl;
    }
  }
  return sourceText?.trim().split(/\n/)[0]?.slice(0, 80) || "Untitled capture";
}

function safeFilename(value: string) {
  return String(value || "shared-file")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 120) || "shared-file";
}

function inferCaptureType(sourceUrl: string | null, sourceText: string | null) {
  if (sourceUrl) return "link";
  return sourceText ? "text_note" : "unknown";
}

function captureState(row: any) {
  const analysis = row?.analysis && typeof row.analysis === "object" ? row.analysis : {};
  if (row?.archived_at || analysis.capture_state === "archived") return "archived";
  return "active";
}

function withCaptureState(row: any) {
  return row ? { ...row, capture_state: captureState(row) } : row;
}

function withCaptureStates(rows: any[]) {
  return Array.isArray(rows) ? rows.map(withCaptureState) : [];
}

function archivedFilter(row: any, archived: boolean) {
  return archived ? captureState(row) === "archived" : captureState(row) !== "archived";
}

function mergeAnalysisPatch(row: any, patch: Record<string, unknown>) {
  const current = row?.analysis && typeof row.analysis === "object" ? row.analysis : {};
  return { ...current, ...patch };
}

async function readCapturePayload(request: Request): Promise<CapturePayload> {
  const contentType = request.headers.get("content-type") || "";
  if (!/multipart\/form-data/i.test(contentType)) {
    return { fields: await request.json().catch(() => ({})), asset: null };
  }

  const form = await request.formData();
  const fields: Record<string, string> = {};
  let asset: CapturePayload["asset"] = null;
  for (const [key, value] of form.entries()) {
    if (value instanceof File) {
      if (key === "asset" && value.size > 0 && !asset) {
        asset = {
          filename: value.name || "shared-file",
          contentType: value.type || "application/octet-stream",
          bytes: await value.arrayBuffer(),
          size: value.size
        };
      }
    } else {
      fields[key] = value;
    }
  }
  return { fields, asset };
}

async function ensureCaptureBucket(supabase: ReturnType<typeof adminClient>) {
  const { error } = await supabase.storage.getBucket("captures");
  if (!error) return;
  await supabase.storage.createBucket("captures", { public: false }).catch(() => {});
}

async function fetchUrlMetadata(sourceUrl: string | null) {
  if (!sourceUrl) return null;
  const endpoint = oembedEndpoint(sourceUrl);
  if (!endpoint) return null;
  try {
    const response = await fetch(endpoint, {
      headers: {
        accept: "application/json",
        "user-agent": "PreciousCaptures/0.1"
      },
      signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) return null;
    const data = await response.json();
    return {
      provider: "oembed",
      type: typeof data.type === "string" ? data.type : null,
      title: typeof data.title === "string" ? data.title : null,
      description: null,
      image: typeof data.thumbnail_url === "string" ? data.thumbnail_url : null,
      canonical: sourceUrl,
      siteName: typeof data.provider_name === "string" ? data.provider_name : null,
      authorName: typeof data.author_name === "string" ? data.author_name : null,
      authorUrl: typeof data.author_url === "string" ? data.author_url : null
    };
  } catch {
    return null;
  }
}

function oembedEndpoint(value: string) {
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

function buildPrompt(capture: CaptureRow, urlMetadata: unknown) {
  return [
    "Infer why the user saved this item. Focus on intent, medium-term usefulness, reminders, and collection fit.",
    "Return concise structured data for a mobile quick-edit surface.",
    "Choose default_intent.category from this configured save-intent catalog:",
    saveIntentPrompt,
    "Prefer the most specific future use over content type. Do not choose visit just because a place or business appears; choose reference for business contact or pricing information unless there is clear visit intent.",
    "Do not use a catch-all. If no specific future use is inferable, choose remember with lower confidence and needs_review.",
    "Suggest a reminder only when the evidence has a useful future trigger. Do not invent events, places, or deadlines.",
    "If URL metadata is blocked, infer only from the URL path and shared text and mark low confidence when needed.",
    "",
    JSON.stringify(
      {
        source_app: capture.source_app,
        source_url: capture.source_url,
        source_text: capture.source_text,
        asset: capture.asset_url
          ? {
              mime_type: capture.asset_mime_type || null,
              purpose: "Optional shared image evidence from the Android share sheet."
            }
          : null,
        url_metadata: urlMetadata
      },
      null,
      2
    )
  ].join("\n");
}

function responseText(payload: any) {
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") return content.text;
    }
  }
  return null;
}

async function runOpenAi(capture: CaptureRow, urlMetadata: unknown) {
  const started = Date.now();
  const model = Deno.env.get("OPENAI_MODEL") || "gpt-5-mini";
  const userContent: Array<Record<string, unknown>> = [{ type: "input_text", text: buildPrompt(capture, urlMetadata) }];
  if (capture.asset_url && String(capture.asset_mime_type || "").startsWith("image/")) {
    userContent.push({ type: "input_image", image_url: capture.asset_url });
  }
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env("OPENAI_API_KEY")}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: "You are Sharebook's capture analysis worker. Produce only schema-valid extraction output."
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
    })
  });
  const raw = await response.json();
  if (!response.ok) throw new Error(raw.error?.message || `OpenAI failed with ${response.status}`);
  const text = responseText(raw);
  if (!text) throw new Error("OpenAI response did not include output text");
  return {
    analysis: JSON.parse(text),
    model,
    raw,
    latencyMs: Date.now() - started,
    usage: raw.usage ?? {}
  };
}

async function processCapture(captureId: string, userId: string) {
  const supabase = adminClient();
  const { data: capture, error: captureError } = await supabase
    .from("captures")
    .select("*, capture_assets(*)")
    .eq("id", captureId)
    .eq("user_id", userId)
    .single();
  if (captureError || !capture) return;

  await supabase
    .from("captures")
    .update({ analysis_state: "processing", analysis_error: null })
    .eq("id", captureId)
    .eq("user_id", userId);

  try {
    const urlMetadata = await fetchUrlMetadata(capture.source_url);
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
    const analysis = result.analysis;
    const { data: run, error: runError } = await supabase
      .from("analysis_runs")
      .insert({
        user_id: userId,
        capture_id: captureId,
        provider: "openai",
        model: result.model,
        status: "succeeded",
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

    await supabase
      .from("captures")
      .update({
        analysis_state: analysis.needs_review ? "needs_review" : "ready",
        analysis_error: null,
        analysis,
        analysis_provider: "openai",
        analysis_model: result.model,
        analysis_mode: "llm",
        display_title: analysis.display_title,
        title: capture.title || analysis.display_title,
        default_intent: analysis.default_intent.category,
        default_intent_confidence: analysis.default_intent.confidence,
        current_save_intent: analysis.default_intent.category,
        intent_rationale: analysis.default_intent.rationale,
        processed_at: new Date().toISOString()
      })
      .eq("id", captureId)
      .eq("user_id", userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Capture analysis failed";
    await supabase.from("analysis_runs").insert({
      user_id: userId,
      capture_id: captureId,
      provider: "openai",
      model: Deno.env.get("OPENAI_MODEL") || "gpt-5-mini",
      status: "failed",
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
        analysis_model: Deno.env.get("OPENAI_MODEL") || "gpt-5-mini",
        processed_at: new Date().toISOString()
      })
      .eq("id", captureId)
      .eq("user_id", userId);
  }
}

async function createOrGetCaptureFromFields(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  fields: Record<string, unknown>
) {
  const sourceText = typeof fields.sourceText === "string" ? fields.sourceText.trim() : "";
  const sourceUrl =
    typeof fields.sourceUrl === "string" && fields.sourceUrl.trim()
      ? fields.sourceUrl.trim()
      : extractUrl(sourceText);
  if (!sourceText && !sourceUrl) throw new Error("sourceText or sourceUrl is required");

  const clientCaptureKey =
    typeof fields.clientCaptureKey === "string" && fields.clientCaptureKey.trim()
      ? fields.clientCaptureKey.trim()
      : crypto.randomUUID();

  const existing = await supabase
    .from("captures")
    .select("*")
    .eq("user_id", userId)
    .eq("client_capture_key", clientCaptureKey)
    .maybeSingle();
  if (existing.data) return existing.data;
  if (existing.error) throw existing.error;

  const { data, error } = await supabase
    .from("captures")
    .insert({
      user_id: userId,
      client_capture_key: clientCaptureKey,
      capture_type: inferCaptureType(sourceUrl, sourceText),
      source_url: sourceUrl,
      source_text: sourceText,
      source_app: typeof fields.sourceApp === "string" ? fields.sourceApp : "Android Share",
      display_title: titleFallback(sourceText, sourceUrl),
      analysis_state: "queued"
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function createOrGetCaptureWithAsset(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  fields: Record<string, unknown>,
  asset: CapturePayload["asset"]
) {
  const sourceText =
    typeof fields.sourceText === "string" && fields.sourceText.trim()
      ? fields.sourceText.trim()
      : asset
        ? `Shared ${asset.contentType.split("/")[0] || "file"}: ${asset.filename || "attachment"}`
        : "";
  const capture = await createOrGetCaptureFromFields(supabase, userId, {
    ...fields,
    sourceText,
    sourceUrl:
      typeof fields.sourceUrl === "string" && fields.sourceUrl.trim()
        ? fields.sourceUrl
        : extractUrl(sourceText),
    sourceApp: typeof fields.sourceApp === "string" ? fields.sourceApp : "Android Share"
  });
  if (!asset || !asset.size) return capture;

  const existing = await supabase
    .from("capture_assets")
    .select("id")
    .eq("user_id", userId)
    .eq("capture_id", capture.id)
    .maybeSingle();
  if (existing.error && existing.error.code !== "PGRST116") throw existing.error;
  if (existing?.data) return capture;

  const extension = safeFilename(asset.filename).split(".").pop() || "bin";
  const storagePath = `${userId}/${capture.id}/${crypto.randomUUID()}.${extension}`;
  await ensureCaptureBucket(supabase);
  const upload = await supabase.storage.from("captures").upload(storagePath, asset.bytes, {
    contentType: asset.contentType || "application/octet-stream",
    upsert: false
  });
  if (upload.error) throw upload.error;

  const { error: assetError } = await supabase.from("capture_assets").insert({
    user_id: userId,
    capture_id: capture.id,
    storage_path: storagePath,
    public_url: null,
    mime_type: asset.contentType || "application/octet-stream",
    byte_size: asset.size
  });
  if (assetError) throw assetError;

  const { data: updated, error: updateError } = await supabase
    .from("captures")
    .update({
      capture_type: asset.contentType.startsWith("image/") ? "image" : capture.capture_type
    })
    .eq("id", capture.id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (updateError) throw updateError;
  return updated;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const user = await currentUser(request);
  if (!user) return json({ error: "Unauthorized" }, 401);

  try {
    const url = new URL(request.url);
    const supabase = adminClient();

    if (request.method === "GET") {
      const clientCaptureKey = url.searchParams.get("clientCaptureKey");
      const archived = url.searchParams.get("archived") === "true";
      let query = supabase
        .from("captures")
        .select("*, capture_assets(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (clientCaptureKey) query = query.eq("client_capture_key", clientCaptureKey).limit(1);
      else query = query.limit(Number(url.searchParams.get("limit") || 50));
      const { data, error } = await query;
      if (error) throw error;
      if (clientCaptureKey) return json({ capture: withCaptureState(data?.[0] ?? null) });
      return json({ captures: withCaptureStates(data ?? []).filter((row) => archivedFilter(row, archived)) });
    }

    if (request.method === "PATCH") {
      const body = await request.json().catch(() => ({}));
      const captureId = typeof body.captureId === "string" ? body.captureId : "";
      if (!captureId) return json({ error: "captureId is required" }, 400);

      const existingResult = await supabase
        .from("captures")
        .select("*")
        .eq("user_id", user.id)
        .or(`id.eq.${captureId},client_capture_key.eq.${captureId}`)
        .maybeSingle();
      if (existingResult.error) throw existingResult.error;
      if (!existingResult.data) return json({ error: "Capture not found" }, 404);

      if (body.action === "archive" || body.action === "restore") {
        const archivedAt = body.action === "archive" ? new Date().toISOString() : null;
        const analysis = mergeAnalysisPatch(existingResult.data, {
          capture_state: body.action === "archive" ? "archived" : "active",
          archived_at: archivedAt
        });
        let result = await supabase
          .from("captures")
          .update({ analysis, archived_at: archivedAt })
          .eq("user_id", user.id)
          .or(`id.eq.${captureId},client_capture_key.eq.${captureId}`)
          .select("*")
          .single();
        if (result.error && /archived_at|schema cache|column/i.test(String(result.error.message || result.error.details || ""))) {
          result = await supabase
            .from("captures")
            .update({ analysis })
            .eq("user_id", user.id)
            .or(`id.eq.${captureId},client_capture_key.eq.${captureId}`)
            .select("*")
            .single();
        }
        if (result.error) throw result.error;
        return json({ capture: withCaptureState(result.data) });
      }

      const update: Record<string, unknown> = {};
      if (typeof body.title === "string") {
        const title = body.title.trim() || null;
        update.title = title;
        update.display_title = title;
      }
      if (typeof body.note === "string") update.context_note = body.note.trim() || null;
      if (typeof body.currentSaveIntent === "string") {
        if (!activeSaveIntentKeySet.has(body.currentSaveIntent)) {
          return json({ error: "currentSaveIntent is not an active save intent" }, 400);
        }
        update.current_save_intent = body.currentSaveIntent;
        update.intent_corrected_at = new Date().toISOString();
      }
      if (!Object.keys(update).length) {
        return json({ capture: withCaptureState(existingResult.data) });
      }

      let result = await supabase
        .from("captures")
        .update(update)
        .eq("user_id", user.id)
        .or(`id.eq.${captureId},client_capture_key.eq.${captureId}`)
        .select("*")
        .single();
      if (result.error && /intent_corrected_at|schema cache|column/i.test(String(result.error.message || result.error.details || ""))) {
        const fallbackUpdate = { ...update };
        delete fallbackUpdate.intent_corrected_at;
        result = await supabase
          .from("captures")
          .update(fallbackUpdate)
          .eq("user_id", user.id)
          .or(`id.eq.${captureId},client_capture_key.eq.${captureId}`)
          .select("*")
          .single();
      }
      if (result.error) throw result.error;
      return json({ capture: withCaptureState(result.data) });
    }

    if (request.method !== "POST") return json({ error: "Not found" }, 404);

    const payload = await readCapturePayload(request);
    const capture = payload.asset
      ? await createOrGetCaptureWithAsset(supabase, user.id, payload.fields, payload.asset)
      : await createOrGetCaptureFromFields(supabase, user.id, payload.fields);
    if (capture.analysis_state === "queued" || capture.analysis_state === "failed") {
      EdgeRuntime.waitUntil(processCapture(capture.id, user.id));
    }
    return json({ capture }, 202);
  } catch (error) {
    return json({ error: errorMessage(error) }, 500);
  }
});
