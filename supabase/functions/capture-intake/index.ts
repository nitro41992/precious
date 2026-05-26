import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type CaptureRow = {
  id: string;
  user_id: string;
  source_url: string | null;
  source_text: string | null;
  source_app: string | null;
};

const PROMPT_VERSION = "precious-capture-analysis-v1";
const SCHEMA_VERSION = "precious-capture-analysis-v1";

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" }
  });
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
    "Suggest a reminder only when the evidence has a useful future trigger. Do not invent events, places, or deadlines.",
    "If URL metadata is blocked, infer only from the URL path and shared text and mark low confidence when needed.",
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

function searchDocument(capture: CaptureRow, analysis: any) {
  return [
    analysis.display_title,
    analysis.summary,
    analysis.default_intent?.category,
    analysis.default_intent?.rationale,
    capture.source_url,
    capture.source_text,
    ...(analysis.search_phrases ?? []),
    ...(analysis.entities ?? []).map((entity: any) => `${entity.name} ${entity.type}`)
  ]
    .filter(Boolean)
    .join("\n");
}

async function processCapture(captureId: string, userId: string) {
  const supabase = adminClient();
  const { data: capture, error: captureError } = await supabase
    .from("captures")
    .select("*")
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
    const result = await runOpenAi(capture, urlMetadata);
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

    await Promise.all([
      supabase.from("captured_entities").delete().eq("capture_id", captureId),
      supabase.from("reminder_suggestions").delete().eq("capture_id", captureId),
      supabase.from("reminders").delete().eq("capture_id", captureId),
      supabase.from("collection_suggestions").delete().eq("capture_id", captureId),
      supabase.from("search_documents").delete().eq("capture_id", captureId)
    ]);

    if (analysis.entities?.length) {
      await supabase.from("captured_entities").insert(
        analysis.entities.map((entity: any) => ({
          user_id: userId,
          capture_id: captureId,
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
      (reminder: any) => reminder.trigger_type !== "none"
    );
    if (realReminders.length) {
      await supabase.from("reminder_suggestions").insert(
        realReminders.map((reminder: any) => ({
          user_id: userId,
          capture_id: captureId,
          analysis_run_id: run.id,
          trigger_type: reminder.trigger_type,
          trigger_value: reminder.trigger_value,
          rationale: reminder.rationale,
          confidence: reminder.confidence
        }))
      );
      const remindersToSet = realReminders
        .filter((reminder: any) => Number(reminder.confidence ?? 0) >= 0.55)
        .map((reminder: any) => ({
          user_id: userId,
          capture_id: captureId,
          analysis_run_id: run.id,
          trigger_type: reminder.trigger_type,
          trigger_value: reminder.trigger_value,
          rationale: reminder.rationale,
          confidence: reminder.confidence,
          status: "pending"
        }));
      if (remindersToSet.length) {
        await supabase.from("reminders").insert(remindersToSet);
      }
    }

    if (analysis.suggested_collections?.length) {
      await supabase.from("collection_suggestions").insert(
        analysis.suggested_collections.map((collection: any) => ({
          user_id: userId,
          capture_id: captureId,
          analysis_run_id: run.id,
          name: collection.name,
          rationale: collection.rationale,
          confidence: collection.confidence
        }))
      );
    }

    await supabase.from("search_documents").insert({
      user_id: userId,
      capture_id: captureId,
      analysis_run_id: run.id,
      document: searchDocument(capture, analysis)
    });

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

async function createOrGetCapture(request: Request, userId: string) {
  const body = await request.json().catch(() => ({}));
  const sourceText = typeof body.sourceText === "string" ? body.sourceText.trim() : "";
  const sourceUrl =
    typeof body.sourceUrl === "string" && body.sourceUrl.trim()
      ? body.sourceUrl.trim()
      : extractUrl(sourceText);
  if (!sourceText && !sourceUrl) throw new Error("sourceText or sourceUrl is required");

  const supabase = adminClient();
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
  if (existing.data) return existing.data;
  if (existing.error) throw existing.error;

  const { data, error } = await supabase
    .from("captures")
    .insert({
      user_id: userId,
      client_capture_key: clientCaptureKey,
      source_url: sourceUrl,
      source_text: sourceText,
      source_app: typeof body.sourceApp === "string" ? body.sourceApp : "Android Share",
      display_title: titleFallback(sourceText, sourceUrl),
      analysis_state: "queued"
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
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
      let query = supabase
        .from("captures")
        .select("*, captured_entities(*), reminder_suggestions(*), reminders(*), collection_suggestions(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (clientCaptureKey) query = query.eq("client_capture_key", clientCaptureKey).limit(1);
      else query = query.limit(Number(url.searchParams.get("limit") || 50));
      const { data, error } = await query;
      if (error) throw error;
      if (clientCaptureKey) return json({ capture: data?.[0] ?? null });
      return json({ captures: data ?? [] });
    }

    if (request.method === "PATCH") {
      const body = await request.json().catch(() => ({}));
      const captureId = typeof body.captureId === "string" ? body.captureId : "";
      if (!captureId) return json({ error: "captureId is required" }, 400);
      const { data, error } = await supabase
        .from("captures")
        .update({
          title: typeof body.title === "string" ? body.title : undefined,
          display_title: typeof body.title === "string" ? body.title : undefined,
          context_note: typeof body.note === "string" ? body.note : undefined
        })
        .eq("user_id", user.id)
        .or(`id.eq.${captureId},client_capture_key.eq.${captureId}`)
        .select("*")
        .single();
      if (error) throw error;
      return json({ capture: data });
    }

    if (request.method !== "POST") return json({ error: "Not found" }, 404);

    const capture = await createOrGetCapture(request, user.id);
    if (capture.analysis_state === "queued" || capture.analysis_state === "failed") {
      EdgeRuntime.waitUntil(processCapture(capture.id, user.id));
    }
    return json({ capture }, 202);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
