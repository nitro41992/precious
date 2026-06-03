import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFiles } from "./load-env-files.mjs";
import { hostFromUrl, stableSampleId, uniqueStringList } from "./capture-eval-lib.mjs";

loadEnvFiles();

const defaultOutPath = "eval/capture-accuracy/private/real-captures.json";

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function parseArgs() {
  return {
    outPath: argValue("--out", defaultOutPath),
    limit: Math.max(1, Number(argValue("--limit", "60")) || 60),
    candidateLimit: Math.max(1, Number(argValue("--candidate-limit", "180")) || 180),
    userId: argValue("--user-id", ""),
    yes: process.argv.includes("--yes")
  };
}

function env(name, fallbackName = "") {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : "");
  if (!value) throw new Error(`Missing ${name}${fallbackName ? ` or ${fallbackName}` : ""}`);
  return value.replace(/\/$/, "");
}

function writeJson(path, value) {
  const resolved = resolve(path);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`);
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${init.method || "GET"} ${url} failed ${response.status}: ${text.slice(0, 700)}`);
  }
  return json;
}

function sourceUrl(row) {
  return String(row.source_url || "").trim();
}

function sourceTextExcerpt(row) {
  return String(row.source_text || "").trim().slice(0, 1200);
}

function collectionTitles(row) {
  const decisions = Array.isArray(row.analysis?.collection_decisions)
    ? row.analysis.collection_decisions
    : [];
  return uniqueStringList(
    decisions.map((decision) => decision?.title || decision?.collection_title).filter(Boolean)
  );
}

function coverageTagsForCapture(row) {
  const analysis = row.analysis && typeof row.analysis === "object" ? row.analysis : {};
  const tags = [];
  const url = sourceUrl(row);
  if (Array.isArray(analysis.suggested_reminders) && analysis.suggested_reminders.length) {
    tags.push("has_date_time");
  }
  if (analysis.visit_target_name || analysis.visit_target_query) {
    tags.push("location_only");
  }
  const host = hostFromUrl(url);
  if (host === "maps.app.goo.gl" || host === "maps.google.com" || host === "google.com") {
    tags.push("google_maps_location");
  }
  if (row.analysis_state === "needs_review" || row.rejected_at || row.analysis_mode === "contextless_rejected") {
    tags.push("ambiguous_negative");
  }
  return uniqueStringList(tags);
}

function sampleFromCapture(row, ordinal) {
  const url = sourceUrl(row);
  return {
    source_kind: "real_capture_private",
    sample_id: stableSampleId(row.id, "real"),
    ordinal,
    capture_id: row.id,
    user_id: row.user_id,
    created_at: row.created_at,
    stratum: "real_recent_private",
    stratum_label: "Newest real private captures",
    url,
    domain: hostFromUrl(url),
    title: row.display_title || row.title || "",
    source_app: row.source_app || "",
    capture_type: row.capture_type || "",
    source_text_excerpt: sourceTextExcerpt(row),
    coverage_tags: coverageTagsForCapture(row),
    expected_collections: collectionTitles(row),
    expected_reminder_surface: "",
    expected_visit_target_surface: ""
  };
}

async function fetchCaptures(options) {
  const supabaseUrl = env("EXPO_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const url = new URL(`${supabaseUrl}/rest/v1/captures`);
  url.searchParams.set(
    "select",
    "id,user_id,source_url,source_text,source_app,display_title,title,capture_type,analysis_state,analysis_mode,analysis,rejected_at,deleted_at,created_at"
  );
  url.searchParams.set("order", "created_at.desc");
  url.searchParams.set("limit", String(options.candidateLimit));
  url.searchParams.set("deleted_at", "is.null");
  if (options.userId) url.searchParams.set("user_id", `eq.${options.userId}`);
  return requestJson(url, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`
    }
  });
}

async function main() {
  const options = parseArgs();
  if (!options.yes) {
    throw new Error("Refusing to export private captures without --yes.");
  }
  const rows = await fetchCaptures(options);
  const filtered = rows
    .filter((row) => sourceUrl(row) || sourceTextExcerpt(row))
    .filter((row) => row.source_app !== "Capture Accuracy Eval")
    .slice(0, options.limit);
  const output = {
    version: 1,
    source: "real_capture_private",
    generated_at: new Date().toISOString(),
    ordered_by: "created_at.desc",
    target_samples: options.limit,
    selected_count: filtered.length,
    samples: filtered.map((row, index) => sampleFromCapture(row, index + 1))
  };
  writeJson(options.outPath, output);
  console.log(JSON.stringify({
    ok: true,
    out: options.outPath,
    selected: output.selected_count,
    ordered_by: output.ordered_by
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
