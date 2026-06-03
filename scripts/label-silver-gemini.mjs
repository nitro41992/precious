import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadEnvFiles } from "./load-env-files.mjs";
import {
  geminiPreflightFailureMessage,
  normalizeGeminiSilverLabel,
  parseGeminiJson,
  starterCollections
} from "./capture-eval-lib.mjs";

loadEnvFiles();

const defaultManifestPath = "eval/capture-accuracy/generated/exa-public-manifest.json";
const defaultOutPath = "eval/capture-accuracy/generated/silver-labels.json";
const defaultModel = "gemini-3.5-flash";

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function parseArgs() {
  return {
    manifestPath: argValue("--manifest", defaultManifestPath),
    outPath: argValue("--out", defaultOutPath),
    fixturePath: argValue("--fixture", ""),
    model: argValue("--model", process.env.GEMINI_LABEL_MODEL || defaultModel),
    limit: Number(argValue("--limit", "0")),
    concurrency: Math.max(1, Number(argValue("--concurrency", "1")) || 1),
    retries: Math.max(0, Number(argValue("--retries", "1")) || 0),
    timeoutMs: Math.max(1000, Number(argValue("--timeout-ms", "60000")) || 60000),
    sampleIds: argValue("--sample-id", "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    preflight: process.argv.includes("--preflight"),
    skipErrors: process.argv.includes("--skip-errors")
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function writeJson(path, value) {
  const resolved = resolve(path);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`);
}

function samplesFromManifest(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.samples)) return json.samples;
  throw new Error("Manifest must be an array or { samples: [] }.");
}

function collectionsFromManifest(json) {
  const collections = Array.isArray(json?.starter_collections)
    ? json.starter_collections
    : starterCollections;
  return collections
    .map((collection) => ({
      title: String(collection?.title || "").trim(),
      description: String(collection?.description || "").trim()
    }))
    .filter((collection) => collection.title && collection.description);
}

function fixtureResponses(path) {
  if (!path) return [];
  const fixture = readJson(path);
  if (Array.isArray(fixture)) return fixture;
  if (Array.isArray(fixture.responses)) return fixture.responses;
  throw new Error(`Fixture must be an array or { responses: [] }: ${path}`);
}

function fixtureForSample(responses, sample, index) {
  if (!responses.length) return null;
  return responses.find((entry) => entry.sample_id === sample.sample_id) || responses[index] || null;
}

function geminiResponseSchema() {
  const stringArray = { type: "ARRAY", items: { type: "STRING" } };
  const locationContext = {
    type: "OBJECT",
    properties: {
      place_name: { type: "STRING" },
      address: { type: "STRING" },
      city: { type: "STRING" },
      region: { type: "STRING" },
      country: { type: "STRING" },
      coordinates: {
        type: "OBJECT",
        properties: {
          latitude: { type: "NUMBER" },
          longitude: { type: "NUMBER" }
        }
      },
      source_destination: { type: "STRING" },
      is_destination_away_from_user: { type: "BOOLEAN" },
      travel_context_reason: { type: "STRING" }
    }
  };
  const reminderFields = {
    type: "OBJECT",
    properties: {
      raw_text: { type: "STRING" },
      start_date: { type: "STRING" },
      end_date: { type: "STRING" },
      start_time: { type: "STRING" },
      end_time: { type: "STRING" },
      timezone: { type: "STRING" },
      evidence_phrase: { type: "STRING" }
    }
  };
  const confidenceProperties = Object.fromEntries(
    [
      "terminal_outcome",
      "save_intent",
      "entities",
      "visit_target",
      "reminder",
      "collections",
      "location_context",
      "title_contains",
      "summary_contains",
      "access_state"
    ].map((field) => [field, { type: "NUMBER" }])
  );
  return {
    type: "OBJECT",
    required: [
      "expected",
      "confidence",
      "evidence_snippets",
      "uncertainty_flags",
      "suitability",
      "suitability_reason"
    ],
    properties: {
      expected: {
        type: "OBJECT",
        required: [
          "terminal_outcome",
          "save_intent",
          "entities",
          "visit_target",
          "location_context",
          "reminder",
          "reminder_fields",
          "collections",
          "title_contains",
          "summary_contains",
          "access_state",
          "notes"
        ],
        properties: {
          terminal_outcome: { type: "STRING" },
          save_intent: { type: "STRING" },
          entities: stringArray,
          visit_target: { type: "STRING" },
          location_context: locationContext,
          reminder: { type: "STRING", enum: ["suggested", "none"] },
          reminder_fields: reminderFields,
          collections: stringArray,
          title_contains: stringArray,
          summary_contains: stringArray,
          access_state: { type: "STRING" },
          notes: { type: "STRING" }
        }
      },
      confidence: {
        type: "OBJECT",
        properties: confidenceProperties
      },
      evidence_snippets: {
        type: "OBJECT",
        properties: {
          terminal_outcome: stringArray,
          save_intent: stringArray,
          entities: stringArray,
          visit_target: stringArray,
          location_context: stringArray,
          reminder: stringArray,
          collections: stringArray,
          access_state: stringArray
        }
      },
      uncertainty_flags: stringArray,
      suitability: { type: "STRING", enum: ["core", "edge", "exclude"] },
      suitability_reason: { type: "STRING" }
    }
  };
}

function evidencePackage(sample) {
  return {
    sample_id: sample.sample_id,
    source_kind: sample.source_kind,
    url: sample.url,
    domain: sample.domain,
    stratum: sample.stratum,
    stratum_label: sample.stratum_label,
    query: sample.query,
    coverage_tags: sample.coverage_tags || [],
    expected_collections: sample.expected_collections || [],
    expected_reminder_surface: sample.expected_reminder_surface || "",
    expected_visit_target_surface: sample.expected_visit_target_surface || "",
    exa: {
      title: sample.exa_title || "",
      author: sample.exa_author || "",
      published_date: sample.exa_published_date || "",
      highlights: sample.exa_highlights || [],
      summary: sample.exa_summary || "",
      text_excerpt: sample.exa_text_excerpt || "",
      image: sample.exa_image || "",
      image_links: sample.exa_image_links || [],
      status: sample.exa_status || "",
      error: sample.exa_error || ""
    },
    private_capture_context: sample.source_kind === "real_capture_private"
      ? {
        created_at: sample.created_at || "",
        source_app: sample.source_app || "",
        capture_type: sample.capture_type || "",
        title: sample.title || sample.display_title || "",
        source_text_excerpt: sample.source_text_excerpt || ""
      }
      : null
  };
}

export function labelPrompt(sample, collections = starterCollections) {
  return [
    "You are drafting independent silver labels for Precious Captures eval rows.",
    "Use only the fixed evidence package below. Do not assume live web access or search grounding.",
    "Return labels for what Precious should infer from this evidence, not what a crawler failed to fetch.",
    "",
    "Domain rules:",
    "- Save Intent is one of watch, read, visit, buy, cook, make, do, plan, learn, or blank if no clear action is supported.",
    "- Save Intent precedence: learn beats read for how-tos, tutorials, explainers, playbooks, concepts, methods, or skill-building material; read is for text where the main action is reading/consuming the document.",
    "- Save Intent precedence: do beats visit for scheduled activities, classes, concerts, workshops, performances, shows, workouts, routines, practices, or drills; visit is for a concrete place/business/venue itself.",
    "- Save Intent precedence: plan is for logistics, itineraries, bookings, schedules, checklists, renewals, trip or event planning, and admin follow-through.",
    "- Save Intent precedence: buy is for product/listing/store/deal pages; reviews, comparisons, and buying guides are read or learn unless one concrete purchase target dominates.",
    "- Save Intent precedence: cook is for recipes and food prep; visit is for restaurants/cafes; make creates an artifact; do performs an activity; watch is for media to watch.",
    "- Reminder must be exactly suggested or none. Use suggested only for actionable future event windows, deadlines, booking windows, sale ends, user-relevant appointments, or time windows. Location-only evidence is not a Reminder.",
    "- Do not label publish dates, modified dates, generic edition dates, incidental date mentions, historical dates, stale dates, or weak promotional dates as Reminder ideas unless the date is clearly actionable.",
    "- Put exact Reminder dates/times in reminder_fields. Do not put dates, natural language times, or event names in expected.reminder.",
    "- Visit Target is a maps-searchable venue/business/place candidate; use none if no concrete named visitable place is supported. Cities, neighborhoods, regions, categories, generic location lists, and articles about places are not Visit Targets by themselves.",
    "- location_context is scored separately from Visit Target. Fill explicit place, address, city, region, country, or destination context when the evidence supports it. Use empty strings for unknown location fields. Set is_destination_away_from_user only if user/home/current/trip context and source destination can be compared from the fixed evidence; otherwise omit or leave false with a note in travel_context_reason.",
    "- Collections are limited to the starter Collections below; include only strong fits.",
    "- Terminal outcome is ready, needs_review, failed, or rejected. Use rejected for contextless/blocked links with too little useful evidence.",
    "- access_state is public, blocked, login_gated, stale, dead, or weak_metadata.",
    "- suitability is core when the row is a realistic scoreable capture, edge when it is scoreable but unusual/stale/weak, and exclude when the row is unsuitable for product scoring.",
    "- Keep every free-text string concise. Evidence snippets should quote at most two short phrases per field.",
    "- Return strict JSON only: double-quoted property names and strings, no markdown, no comments, and no trailing commas.",
    "",
    "Starter Collections:",
    JSON.stringify(collections, null, 2),
    "",
    "Evidence package:",
    JSON.stringify(evidencePackage(sample), null, 2)
  ].join("\n");
}

function geminiUrl(model) {
  const modelPath = model.startsWith("models/") ? model : `models/${model}`;
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent`);
  url.searchParams.set("key", process.env.GEMINI_API_KEY || "");
  return url;
}

async function requestGeminiLabel(sample, model, preflight, collections, timeoutMs) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY. Use --fixture for a networkless silver-label smoke.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(geminiUrl(model), {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: labelPrompt(sample, collections) }]
          }
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
          responseSchema: geminiResponseSchema()
        }
      })
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Gemini silver-label request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = preflight
      ? geminiPreflightFailureMessage(model, response.status, text)
      : `Gemini silver-label request failed for ${sample.sample_id} with ${response.status}: ${text.slice(0, 700)}`;
    throw new Error(message);
  }
  return json;
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function labelSample(sample, index, options, fixture, collections) {
  const maxAttempts = fixture.length ? 1 : options.retries + 1;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const fixtureEntry = fixtureForSample(fixture, sample, index);
    try {
      const raw = fixtureEntry
        ? fixtureEntry.response || fixtureEntry.raw_response || fixtureEntry.parsed || fixtureEntry
        : await requestGeminiLabel(
          sample,
          options.model,
          options.preflight,
          collections,
          options.timeoutMs
        );
      const parsed = fixtureEntry?.parsed || parseGeminiJson(raw);
      return normalizeGeminiSilverLabel(sample, parsed, {
        model: options.model,
        reviewed_at: new Date().toISOString(),
        raw_response_metadata: {
          fixture: Boolean(fixtureEntry),
          finish_reason: raw?.candidates?.[0]?.finishReason || "",
          usage_metadata: raw?.usageMetadata || null,
          prompt_feedback: raw?.promptFeedback || null,
          attempt
        }
      });
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) continue;
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Gemini silver labeling failed for ${sample.sample_id}: ${message}`);
}

async function main() {
  const options = parseArgs();
  const manifest = readJson(options.manifestPath);
  const collections = collectionsFromManifest(manifest);
  let samples = samplesFromManifest(manifest);
  if (options.sampleIds.length) {
    const allowed = new Set(options.sampleIds);
    samples = samples.filter((sample) => allowed.has(sample.sample_id));
  }
  if (options.limit > 0) samples = samples.slice(0, options.limit);
  if (options.preflight) samples = samples.slice(0, 1);
  if (!samples.length) throw new Error("No samples selected for silver labeling.");

  const fixture = fixtureResponses(options.fixturePath);
  let completed = 0;
  const results = await mapLimit(samples, options.concurrency, async (sample, index) => {
    try {
      const result = {
        label: await labelSample(sample, index, options, fixture, collections),
        error: null
      };
      completed += 1;
      console.error(`[${completed}/${samples.length}] labeled ${sample.sample_id}`);
      return result;
    } catch (error) {
      if (!options.skipErrors) throw error;
      const result = {
        label: null,
        error: {
          sample_id: sample.sample_id,
          url: sample.url,
          message: error instanceof Error ? error.message : String(error)
        }
      };
      completed += 1;
      console.error(`[${completed}/${samples.length}] skipped ${sample.sample_id}: ${result.error.message}`);
      return result;
    }
  });
  const labels = results.map((result) => result.label).filter(Boolean);
  const errors = results.map((result) => result.error).filter(Boolean);
  if (!labels.length) throw new Error("No labels were generated.");

  const output = {
    version: 1,
    label_type: "silver",
    provider: "google-gemini",
    model: options.model,
    manifest_path: options.manifestPath,
    starter_collections: collections,
    generated_at: new Date().toISOString(),
    preflight: options.preflight,
    sample_count: labels.length,
    error_count: errors.length,
    errors,
    labels
  };
  writeJson(options.outPath, output);
  console.log(JSON.stringify({
    ok: true,
    out: options.outPath,
    model: options.model,
    labels: labels.length,
    errors: errors.length,
    preflight: options.preflight
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
