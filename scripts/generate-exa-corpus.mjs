import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFiles } from "./load-env-files.mjs";
import {
  labelTemplateForSample,
  normalizeExaResponseResults,
  selectDeterministicSamples,
  stableSampleId,
  starterCollections
} from "./capture-eval-lib.mjs";

loadEnvFiles();

const defaultConfigPath = "eval/capture-accuracy/seed-config.json";
const defaultManifestPath = "eval/capture-accuracy/generated/exa-public-manifest.json";
const defaultLabelsPath = "eval/capture-accuracy/generated/labels-template.json";
const defaultRawDir = "eval/capture-accuracy/generated/raw-exa";

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function parseArgs() {
  return {
    configPath: argValue("--config", defaultConfigPath),
    outPath: argValue("--out", defaultManifestPath),
    labelsPath: argValue("--labels-out", defaultLabelsPath),
    rawDir: argValue("--raw-out", defaultRawDir),
    fixturePath: argValue("--fixture", ""),
    seed: argValue("--seed", ""),
    target: Number(argValue("--target", "0")),
    maxQueries: Number(argValue("--max-queries", "0")),
    queryIds: argValue("--query-id", "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    dryRun: process.argv.includes("--dry-run"),
    smoke: process.argv.includes("--smoke"),
    scaleQuotas: process.argv.includes("--scale-quotas"),
    noRaw: process.argv.includes("--no-raw")
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

function exaHeaders() {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) throw new Error("Missing EXA_API_KEY. Use --fixture for networkless generation.");
  return {
    "content-type": "application/json",
    "x-api-key": apiKey
  };
}

function searchBody(config, querySpec) {
  const defaults = config.query_defaults || {};
  const body = {
    query: querySpec.query,
    type: querySpec.type || defaults.type || "auto",
    numResults: querySpec.numResults || defaults.numResults || 20,
    moderation: querySpec.moderation ?? defaults.moderation ?? true,
    contents: {
      ...(defaults.contents || {}),
      ...(querySpec.contents || {})
    }
  };
  const userLocation = querySpec.userLocation || defaults.userLocation;
  if (userLocation) body.userLocation = userLocation;
  if (Array.isArray(querySpec.includeDomains) && querySpec.includeDomains.length) {
    body.includeDomains = querySpec.includeDomains;
  }
  if (Array.isArray(querySpec.excludeDomains) && querySpec.excludeDomains.length) {
    body.excludeDomains = querySpec.excludeDomains;
  }
  if (querySpec.startPublishedDate) body.startPublishedDate = querySpec.startPublishedDate;
  if (querySpec.endPublishedDate) body.endPublishedDate = querySpec.endPublishedDate;
  return body;
}

async function exaSearch(body) {
  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: exaHeaders(),
    body: JSON.stringify(body)
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Exa search failed ${response.status}: ${text.slice(0, 700)}`);
  }
  return json;
}

function fixtureResponses(path) {
  if (!path) return [];
  const fixture = readJson(path);
  if (Array.isArray(fixture)) return fixture;
  if (Array.isArray(fixture.responses)) return fixture.responses;
  throw new Error(`Fixture must be an array or { responses: [] }: ${path}`);
}

function responseFromFixture(responses, stratum, querySpec, index) {
  const hasScopedEntries = responses.some((entry) =>
    entry?.stratum || entry?.stratum_id || entry?.query_id || entry?.query
  );
  const match = responses.find((entry) => {
    if (entry.query_id || entry.query) {
      return entry.query_id === querySpec.id || entry.query === querySpec.query;
    }
    return entry.stratum === stratum.id || entry.stratum_id === stratum.id;
  });
  const entry = match || (hasScopedEntries ? null : responses[index]);
  return entry?.response || entry;
}

function scaledQuota(value, factor) {
  const quota = Number(value || 0);
  if (!quota) return quota;
  return Math.max(1, Math.ceil(quota * factor));
}

function scaledCoverageQuotas(coverageQuotas, factor) {
  if (!coverageQuotas || factor >= 1) return coverageQuotas || {};
  const output = {};
  for (const [key, value] of Object.entries(coverageQuotas)) {
    if (key === "starter_collection_fit" && value && typeof value === "object") {
      output[key] = Object.fromEntries(
        Object.entries(value).map(([collection, quota]) => [
          collection,
          scaledQuota(quota, factor)
        ])
      );
    } else {
      output[key] = scaledQuota(value, factor);
    }
  }
  return output;
}

function scaledStrata(strata, factor) {
  if (factor >= 1) return strata;
  return strata.map((stratum) => ({
    ...stratum,
    quota: scaledQuota(stratum.quota, factor)
  }));
}

async function main() {
  const options = parseArgs();
  const config = readJson(options.configPath);
  const seed = options.seed || config.random_seed || "capture-accuracy-v1";
  const target = options.target || config.public_samples || 240;
  const quotaScaleFactor = options.scaleQuotas
    ? Math.min(1, target / Math.max(Number(config.public_samples || target), 1))
    : 1;
  const effectiveCoverageQuotas = scaledCoverageQuotas(
    config.coverage_quotas || {},
    quotaScaleFactor
  );
  const effectiveStrata = scaledStrata(config.strata || [], quotaScaleFactor);
  const generatedAt = new Date().toISOString();
  const fixture = fixtureResponses(options.fixturePath);
  if (!fixture.length && options.dryRun) {
    throw new Error("--dry-run requires --fixture so generation is networkless and deterministic.");
  }

  const candidates = [];
  const requestedQueryIds = new Set(options.queryIds);
  let queryJobs = effectiveStrata.flatMap((stratum) =>
    (stratum.queries || []).map((querySpec) => ({ stratum, querySpec }))
  );
  if (requestedQueryIds.size) {
    queryJobs = queryJobs.filter(({ querySpec }) =>
      requestedQueryIds.has(querySpec.id || stableSampleId(querySpec.query, "query"))
    );
    if (!queryJobs.length) throw new Error(`No seed queries matched --query-id ${options.queryIds.join(",")}`);
  }
  if (options.maxQueries > 0) queryJobs = queryJobs.slice(0, options.maxQueries);

  let executedQueryCount = 0;
  for (const [queryIndex, { stratum, querySpec }] of queryJobs.entries()) {
    const body = searchBody(config, querySpec);
    const response = fixture.length
      ? responseFromFixture(fixture, stratum, querySpec, queryIndex)
      : await exaSearch(body);
    executedQueryCount += 1;
    if (!options.noRaw && !fixture.length) {
      const rawPath = `${options.rawDir}/${stratum.id}-${querySpec.id || stableSampleId(querySpec.query, "query")}.json`;
      writeJson(rawPath, { request: body, response });
    }
    candidates.push(
      ...normalizeExaResponseResults(response, stratum, querySpec, generatedAt)
    );
    if (options.smoke && candidates.length >= target) break;
  }

  const selection = selectDeterministicSamples(
    candidates,
    effectiveStrata,
    target,
    seed,
    effectiveCoverageQuotas
  );
  const manifest = {
    version: 1,
    source: "exa_public",
    generated_at: generatedAt,
    seed,
    query_count: executedQueryCount,
    smoke: options.smoke,
    quota_scale_factor: quotaScaleFactor,
    target_samples: target,
    public_samples: config.public_samples || target,
    private_real_capture_samples: config.private_real_capture_samples || 0,
    coverage_quotas: effectiveCoverageQuotas,
    coverage_counts: selection.coverage_counts,
    starter_collections: config.starter_collections || starterCollections,
    candidate_count: selection.candidate_count,
    deduped_count: selection.deduped_count,
    selected_count: selection.selected.length,
    shortfalls: selection.shortfalls,
    samples: selection.selected.map((sample, index) => ({
      ...sample,
      ordinal: index + 1,
      label_status: "unlabeled"
    }))
  };

  writeJson(options.outPath, manifest);
  writeJson(options.labelsPath, {
    version: 1,
    manifest_path: options.outPath,
    generated_at: generatedAt,
    labels: manifest.samples.map(labelTemplateForSample)
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        manifest: options.outPath,
        labels: options.labelsPath,
        selected: manifest.selected_count,
        queries: manifest.query_count,
        smoke: manifest.smoke,
        quota_scale_factor: manifest.quota_scale_factor,
        candidates: manifest.candidate_count,
        deduped: manifest.deduped_count,
        coverage: manifest.coverage_counts,
        shortfalls: manifest.shortfalls
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
