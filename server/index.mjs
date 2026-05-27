import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "data");
const storePath = join(dataDir, "captures.json");
const port = Number(process.env.PORT || 3030);
const model = process.env.OPENAI_MODEL || "gpt-5-mini";
const runningJobs = new Set();
const saveIntents = JSON.parse(
  readFileSync(join(__dirname, "..", "supabase", "functions", "_shared", "save-intents.json"), "utf8")
);
const activeSaveIntents = saveIntents.filter((intent) => intent.active);
const activeSaveIntentKeys = activeSaveIntents.map((intent) => intent.key);
const saveIntentPrompt = activeSaveIntents
  .map((intent) => `- ${intent.key} (${intent.label}): ${intent.llm_description}`)
  .join("\n");

const CAPTURE_ANALYSIS_SCHEMA = {
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
    search_phrases: {
      type: "array",
      items: { type: "string" }
    },
    confidence_label: {
      type: "string",
      enum: ["Looks right", "Maybe", "Not sure", "Couldn't tell"]
    },
    needs_review: { type: "boolean" }
  }
};

async function readStore() {
  await mkdir(dataDir, { recursive: true });
  try {
    return JSON.parse(await readFile(storePath, "utf8"));
  } catch {
    return { captures: [] };
  }
}

async function writeStore(store) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2));
}

async function upsertCapture(nextCapture) {
  const store = await readStore();
  const index = store.captures.findIndex(
    (capture) =>
      capture.id === nextCapture.id ||
      capture.client_capture_key === nextCapture.client_capture_key
  );
  if (index >= 0) store.captures[index] = { ...store.captures[index], ...nextCapture };
  else store.captures.unshift(nextCapture);
  await writeStore(store);
  return index >= 0 ? store.captures[index] : nextCapture;
}

async function findCapture(key) {
  const store = await readStore();
  return store.captures.find(
    (capture) => capture.id === key || capture.client_capture_key === key
  );
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function extractUrl(value) {
  return value?.match(/https?:\/\/\S+/i)?.[0] ?? null;
}

function fallbackTitle(sourceText, sourceUrl) {
  if (sourceUrl) {
    try {
      return new URL(sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      return sourceUrl;
    }
  }
  return sourceText?.trim().split(/\n/)[0]?.slice(0, 72) || "Shared capture";
}

async function fetchUrlMetadata(sourceUrl) {
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

function buildPrompt(capture, urlMetadata) {
  return [
    "Infer why the user saved this shared item, not just what the page is about.",
    "Return concise structured data for a mobile quick-edit surface.",
    "Choose default_intent.category from this configured save-intent catalog:",
    saveIntentPrompt,
    "Prefer the most specific future use over content type. Do not choose visit just because a place or business appears; choose reference for business contact or pricing information unless there is clear visit intent.",
    "Do not use a catch-all. If no specific future use is inferable, choose remember with lower confidence and needs_review.",
    "Do not invent facts that are not present in the shared text, URL, or URL metadata.",
    "If Reddit, Instagram, or another site blocks metadata, infer only from the URL path and user share text.",
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

function extractResponseText(apiResponse) {
  if (typeof apiResponse.output_text === "string") return apiResponse.output_text;
  for (const item of apiResponse.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") return content.text;
    }
  }
  return null;
}

async function runOpenAiAnalysis(capture, urlMetadata) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: "You are Sharebook's capture analysis worker. Produce only schema-valid extraction output."
        },
        {
          role: "user",
          content: buildPrompt(capture, urlMetadata)
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "capture_analysis",
          strict: true,
          schema: CAPTURE_ANALYSIS_SCHEMA
        }
      }
    })
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error?.message || `OpenAI request failed with ${response.status}`);
  }
  const outputText = extractResponseText(json);
  if (!outputText) throw new Error("OpenAI response did not include output text");
  return {
    analysis: JSON.parse(outputText),
    rawModelOutput: json,
    usage: json.usage ?? {}
  };
}

async function runAnalysisJob(captureId) {
  if (runningJobs.has(captureId)) return;
  runningJobs.add(captureId);
  const startedAt = Date.now();
  let capture = await findCapture(captureId);
  if (!capture) {
    runningJobs.delete(captureId);
    return;
  }

  capture = await upsertCapture({
    ...capture,
    analysis_state: "processing",
    analysis_error: null,
    updated_at: new Date().toISOString()
  });

  try {
    const urlMetadata = await fetchUrlMetadata(capture.source_url);
    const result = await runOpenAiAnalysis(capture, urlMetadata);
    await upsertCapture({
      ...capture,
      analysis_state: result.analysis.needs_review ? "needs_review" : "ready",
      analysis: result.analysis,
      analysis_provider: "openai",
      analysis_model: model,
      analysis_mode: "llm",
      analysis_run: {
        provider: "openai",
        model,
        prompt_version: "fresh-capture-analysis-v1",
        schema_version: "fresh-capture-analysis-v1",
        latency_ms: Date.now() - startedAt,
        usage: result.usage
      },
      url_metadata: urlMetadata,
      updated_at: new Date().toISOString(),
      processed_at: new Date().toISOString()
    });
  } catch (error) {
    await upsertCapture({
      ...capture,
      analysis_state: "failed",
      analysis_error: error instanceof Error ? error.message : "Analysis failed",
      analysis: null,
      analysis_provider: process.env.OPENAI_API_KEY ? "openai" : null,
      analysis_model: process.env.OPENAI_API_KEY ? model : null,
      analysis_mode: "llm_failed",
      analysis_run: {
        provider: "openai",
        model,
        prompt_version: "fresh-capture-analysis-v1",
        schema_version: "fresh-capture-analysis-v1",
        latency_ms: Date.now() - startedAt,
        usage: {}
      },
      updated_at: new Date().toISOString(),
      processed_at: new Date().toISOString()
    });
  } finally {
    runningJobs.delete(captureId);
  }
}

async function createCapture(body) {
  const now = new Date().toISOString();
  const sourceText = String(body.sourceText ?? body.source_text ?? "");
  const sourceUrl = String(body.sourceUrl ?? body.source_url ?? extractUrl(sourceText) ?? "");
  const capture = {
    id: body.id || crypto.randomUUID(),
    client_capture_key: body.clientCaptureKey || body.client_capture_key || crypto.randomUUID(),
    source_url: sourceUrl || null,
    source_text: sourceText,
    source_app: body.sourceApp || body.source_app || "Android Share",
    analysis_state: "queued",
    analysis_error: null,
    analysis: null,
    analysis_provider: null,
    analysis_model: null,
    analysis_mode: null,
    created_at: now,
    updated_at: now,
    processed_at: null
  };
  const saved = await upsertCapture(capture);
  setTimeout(() => void runAnalysisJob(saved.id), 0);
  return saved;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, 200, { ok: true, model, hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY) });
    }
    if (request.method === "POST" && url.pathname === "/api/captures") {
      const capture = await createCapture(await readJson(request));
      return sendJson(response, 202, { capture });
    }
    if (request.method === "POST" && url.pathname === "/api/analyze") {
      const body = await readJson(request);
      const capture = await findCapture(body.captureId || body.clientCaptureKey);
      if (!capture) return sendJson(response, 404, { error: "Capture not found" });
      setTimeout(() => void runAnalysisJob(capture.id), 0);
      return sendJson(response, 202, { capture: { ...capture, analysis_state: "queued" } });
    }
    const captureMatch = url.pathname.match(/^\/api\/captures\/([^/]+)$/);
    if (request.method === "GET" && captureMatch) {
      const capture = await findCapture(decodeURIComponent(captureMatch[1]));
      if (!capture) return sendJson(response, 404, { error: "Capture not found" });
      return sendJson(response, 200, { capture });
    }
    return sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return sendJson(response, 500, { error: message });
  }
});

server.listen(port, "127.0.0.1", async () => {
  console.log(`Precious Captures server listening on http://127.0.0.1:${port}`);
  const store = await readStore();
  for (const capture of store.captures) {
    if (capture.analysis_state === "queued" || capture.analysis_state === "processing") {
      setTimeout(() => void runAnalysisJob(capture.id), 0);
    }
  }
});
