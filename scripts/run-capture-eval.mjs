import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFiles } from "./load-env-files.mjs";
import {
  predictionFromCapture,
  starterCollections
} from "./capture-eval-lib.mjs";

loadEnvFiles();

const terminalStates = new Set(["ready", "needs_review", "failed"]);
const defaultManifestPath = "eval/capture-accuracy/generated/exa-public-manifest.json";
const defaultOutPath = "eval/capture-accuracy/generated/predictions.json";

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function parseArgs() {
  return {
    manifestPath: argValue("--manifest", defaultManifestPath),
    privateManifestPath: argValue("--private-manifest", ""),
    outPath: argValue("--out", defaultOutPath),
    runId: argValue("--run-id", `capture-eval-${new Date().toISOString().replace(/[:.]/g, "-")}`),
    timeoutMs: Number(argValue("--timeout-ms", "240000")),
    pollMs: Number(argValue("--poll-ms", "5000")),
    concurrency: Math.max(1, Number(argValue("--concurrency", "2")) || 2),
    limit: Number(argValue("--limit", "0")),
    sampleIds: argValue("--sample-id", "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    dryRun: process.argv.includes("--dry-run"),
    yes: process.argv.includes("--yes"),
    supplementPublicEvidence: process.argv.includes("--supplement-public-evidence"),
    seedStarterCollections: !process.argv.includes("--no-seed-starter-collections")
  };
}

function env(name, fallbackName = "") {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : "");
  if (!value) throw new Error(`Missing ${name}${fallbackName ? ` or ${fallbackName}` : ""}`);
  return value.replace(/\/$/, "");
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
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

function serviceHeaders(serviceRoleKey, extra = {}) {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    ...extra
  };
}

function compactText(parts, maxLength = 5000) {
  return parts
    .flat()
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, maxLength);
}

function collectionEmbeddingContent(title, description) {
  return compactText([title, description], 1600);
}

function embeddingLiteral(values) {
  return `[${values.map((value) => Number(value) || 0).join(",")}]`;
}

async function createEmbedding(input) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "Missing OPENAI_API_KEY. Starter Collection seeding needs text-embedding-3-small embeddings; pass --no-seed-starter-collections only if the eval user is already seeded."
    );
  }
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: input || "untitled collection"
    })
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(json.error?.message || `OpenAI embeddings failed with ${response.status}: ${text.slice(0, 700)}`);
  }
  const embedding = json.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) throw new Error("OpenAI embedding response did not include an embedding.");
  return embedding.map(Number);
}

async function fetchEvalCollections({ supabaseUrl, serviceRoleKey, userId }) {
  const url = new URL(`${supabaseUrl}/rest/v1/collections`);
  url.searchParams.set("select", "id,user_id,title,description,status,deleted_at,created_by");
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("limit", "200");
  const rows = await requestJson(url, {
    headers: serviceHeaders(serviceRoleKey)
  });
  return Array.isArray(rows) ? rows : [];
}

async function insertCollection({ supabaseUrl, serviceRoleKey, userId, collection }) {
  const url = new URL(`${supabaseUrl}/rest/v1/collections`);
  url.searchParams.set("select", "id,user_id,title,description,status,deleted_at");
  const rows = await requestJson(url, {
    method: "POST",
    headers: serviceHeaders(serviceRoleKey, {
      "content-type": "application/json",
      Prefer: "return=representation"
    }),
    body: JSON.stringify({
      user_id: userId,
      title: collection.title,
      description: collection.description,
      status: "active",
      created_by: "eval"
    })
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function patchCollection({ supabaseUrl, serviceRoleKey, collectionId, description }) {
  const url = new URL(`${supabaseUrl}/rest/v1/collections`);
  url.searchParams.set("id", `eq.${collectionId}`);
  await requestJson(url, {
    method: "PATCH",
    headers: serviceHeaders(serviceRoleKey, {
      "content-type": "application/json",
      Prefer: "return=minimal"
    }),
    body: JSON.stringify({
      description,
      status: "active",
      deleted_at: null
    })
  });
}

async function archiveCollection({ supabaseUrl, serviceRoleKey, collectionId }) {
  const url = new URL(`${supabaseUrl}/rest/v1/collections`);
  url.searchParams.set("id", `eq.${collectionId}`);
  await requestJson(url, {
    method: "PATCH",
    headers: serviceHeaders(serviceRoleKey, {
      "content-type": "application/json",
      Prefer: "return=minimal"
    }),
    body: JSON.stringify({
      status: "archived",
      deleted_at: new Date().toISOString()
    })
  });
}

async function fetchCollectionEmbeddings({ supabaseUrl, serviceRoleKey, userId }) {
  const url = new URL(`${supabaseUrl}/rest/v1/collection_embeddings`);
  url.searchParams.set("select", "collection_id,content");
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("limit", "200");
  const rows = await requestJson(url, {
    headers: serviceHeaders(serviceRoleKey)
  });
  return Array.isArray(rows) ? rows : [];
}

async function upsertCollectionEmbedding({ supabaseUrl, serviceRoleKey, userId, collectionId, content, embedding }) {
  const url = new URL(`${supabaseUrl}/rest/v1/collection_embeddings`);
  url.searchParams.set("on_conflict", "collection_id");
  await requestJson(url, {
    method: "POST",
    headers: serviceHeaders(serviceRoleKey, {
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    }),
    body: JSON.stringify({
      user_id: userId,
      collection_id: collectionId,
      content,
      embedding: embeddingLiteral(embedding)
    })
  });
}

async function seedStarterCollectionsForEvalUser({ supabaseUrl, serviceRoleKey, userId, collections: starterSet }) {
  const existing = await fetchEvalCollections({ supabaseUrl, serviceRoleKey, userId });
  const existingByTitle = new Map(existing.map((collection) => [collection.title, collection]));
  const targetTitles = new Set(starterSet.map((collection) => collection.title));
  const collections = [];
  const inserted = [];
  const updated = [];
  const archived = [];

  for (const collection of existing) {
    if (
      collection.created_by === "eval" &&
      collection.status === "active" &&
      !collection.deleted_at &&
      !targetTitles.has(collection.title)
    ) {
      await archiveCollection({ supabaseUrl, serviceRoleKey, collectionId: collection.id });
      archived.push(collection.title);
    }
  }

  for (const starter of starterSet) {
    let collection = existingByTitle.get(starter.title);
    if (!collection) {
      collection = await insertCollection({ supabaseUrl, serviceRoleKey, userId, collection: starter });
      inserted.push(starter.title);
    } else if (
      collection.description !== starter.description ||
      collection.status !== "active" ||
      collection.deleted_at
    ) {
      await patchCollection({
        supabaseUrl,
        serviceRoleKey,
        collectionId: collection.id,
        description: starter.description
      });
      collection = { ...collection, description: starter.description, status: "active", deleted_at: null };
      updated.push(starter.title);
    }
    if (!collection?.id) throw new Error(`Could not seed starter Collection: ${starter.title}`);
    collections.push(collection);
  }

  const embeddings = await fetchCollectionEmbeddings({ supabaseUrl, serviceRoleKey, userId });
  const embeddingByCollectionId = new Map(embeddings.map((embedding) => [embedding.collection_id, embedding]));
  const embedded = [];
  for (const collection of collections) {
    const content = collectionEmbeddingContent(collection.title, collection.description);
    if (embeddingByCollectionId.get(collection.id)?.content === content) continue;
    const embedding = await createEmbedding(content);
    await upsertCollectionEmbedding({
      supabaseUrl,
      serviceRoleKey,
      userId,
      collectionId: collection.id,
      content,
      embedding
    });
    embedded.push(collection.title);
  }

  return {
    enabled: true,
    collection_count: collections.length,
    inserted,
    updated,
    archived,
    embedded
  };
}

async function signInOrCreateUser({ supabaseUrl, anonKey, serviceRoleKey, email, password }) {
  const signIn = async () =>
    requestJson(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        "content-type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

  try {
    return await signIn();
  } catch {
    await requestJson(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { source: "precious-captures-accuracy-eval" }
      })
    }).catch((error) => {
      if (!String(error.message).includes("already")) throw error;
    });
    return await signIn();
  }
}

function isEdgeCaptureApi(apiUrl) {
  return apiUrl.includes("/functions/v1/");
}

function sourceTextForSample(sample, supplementPublicEvidence) {
  if (!supplementPublicEvidence || sample.source_kind !== "exa_public") return sample.url;
  return compactText([
    sample.url,
    "Public evidence package for eval analysis:",
    sample.exa_title ? `Title: ${sample.exa_title}` : "",
    sample.exa_author ? `Author: ${sample.exa_author}` : "",
    sample.exa_published_date ? `Published: ${sample.exa_published_date}` : "",
    sample.exa_summary ? `Summary: ${sample.exa_summary}` : "",
    Array.isArray(sample.exa_highlights) && sample.exa_highlights.length
      ? `Highlights:\n${sample.exa_highlights.slice(0, 4).map((highlight) => `- ${highlight}`).join("\n")}`
      : "",
    sample.exa_text_excerpt ? `Text excerpt: ${sample.exa_text_excerpt}` : "",
    sample.exa_status ? `Exa status: ${sample.exa_status}` : "",
    sample.exa_error ? `Exa error: ${sample.exa_error}` : ""
  ]);
}

function evidenceModeForSample(sample, supplementPublicEvidence) {
  return supplementPublicEvidence && sample.source_kind === "exa_public"
    ? "public_evidence_supplement"
    : "direct_url";
}

async function postCapture({ apiUrl, anonKey, accessToken, clientCaptureKey, url, sourceText }) {
  const edge = isEdgeCaptureApi(apiUrl);
  const json = await requestJson(edge ? apiUrl : `${apiUrl}/api/captures`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      clientCaptureKey,
      sourceUrl: url,
      sourceText,
      sourceApp: "Capture Accuracy Eval",
      autoAnalyze: edge
    })
  });
  if (!json.capture?.id) throw new Error("Capture intake did not return a capture id.");
  return json.capture;
}

async function triggerAnalyze({ apiUrl, accessToken, captureId }) {
  if (isEdgeCaptureApi(apiUrl)) return;
  await requestJson(`${apiUrl}/api/analyze`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ captureId, route: "openai_mini" })
  });
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function pollCaptureRest({ supabaseUrl, serviceRoleKey, clientCaptureKey, timeoutMs, pollMs }) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    const url = new URL(`${supabaseUrl}/rest/v1/captures`);
    url.searchParams.set(
      "select",
      "id,client_capture_key,source_url,source_text,source_app,display_title,title,analysis_state,analysis_error,analysis_provider,analysis_model,analysis_mode,default_intent,current_save_intent,analysis,rejected_at,processed_at,created_at"
    );
    url.searchParams.set("client_capture_key", `eq.${clientCaptureKey}`);
    url.searchParams.set("limit", "1");
    const rows = await requestJson(url, {
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`
      }
    });
    latest = Array.isArray(rows) ? rows[0] : null;
    if (latest && (latest.rejected_at || terminalStates.has(latest.analysis_state))) {
      return latest;
    }
    await sleep(pollMs);
  }
  return latest;
}

function manifestSamples(path, sourceKindFallback) {
  const json = manifestJson(path);
  if (!json) return [];
  const samples = Array.isArray(json) ? json : json.samples || [];
  return samples.map((sample) => ({
    ...sample,
    source_kind: sample.source_kind || sourceKindFallback
  }));
}

function manifestJson(path) {
  if (!path) return null;
  if (!existsSync(resolve(path))) throw new Error(`Manifest not found: ${path}`);
  return readJson(path);
}

function collectionsFromManifests(manifests) {
  for (const manifest of manifests) {
    const collections = Array.isArray(manifest?.starter_collections)
      ? manifest.starter_collections
      : [];
    const normalized = collections
      .map((collection) => ({
        title: String(collection?.title || "").trim(),
        description: String(collection?.description || "").trim()
      }))
      .filter((collection) => collection.title && collection.description);
    if (normalized.length) return normalized;
  }
  return starterCollections;
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

async function main() {
  const options = parseArgs();
  if (!options.dryRun && !options.yes) {
    throw new Error("Refusing to create hosted eval captures without --yes. Use --dry-run to preview locally.");
  }

  const publicManifest = manifestJson(options.manifestPath);
  const privateManifest = manifestJson(options.privateManifestPath);
  const evalCollections = collectionsFromManifests([publicManifest, privateManifest]);
  let samples = [
    ...manifestSamples(options.manifestPath, "exa_public"),
    ...manifestSamples(options.privateManifestPath, "real_capture_private")
  ];
  if (options.sampleIds.length) {
    const allowed = new Set(options.sampleIds);
    samples = samples.filter((sample) => allowed.has(sample.sample_id));
  }
  if (options.limit > 0) samples = samples.slice(0, options.limit);
  if (!samples.length) throw new Error("No eval samples selected.");

  if (options.dryRun) {
    writeJson(options.outPath, {
      version: 1,
      run_id: options.runId,
      dry_run: true,
      selected_count: samples.length,
      evidence_mode: options.supplementPublicEvidence
        ? "public_evidence_supplement_for_exa_public"
        : "direct_url",
      starter_collections: evalCollections,
      samples: samples.map((sample, index) => ({
        ordinal: index + 1,
        sample_id: sample.sample_id,
        stratum: sample.stratum,
        source_kind: sample.source_kind,
        url: sample.url,
        evidence_mode: evidenceModeForSample(sample, options.supplementPublicEvidence),
        source_text_preview: sourceTextForSample(sample, options.supplementPublicEvidence).slice(0, 500)
      }))
    });
    console.log(JSON.stringify({ ok: true, dryRun: true, selected: samples.length, out: options.outPath }, null, 2));
    return;
  }

  const supabaseUrl = env("EXPO_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = env("EXPO_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const apiUrl = process.env.PRECIOUS_CAPTURE_FUNCTION_URL ||
    `${supabaseUrl}/functions/v1/capture-intake`;
  const email = process.env.PRECIOUS_EVAL_EMAIL || "precious-captures-eval@example.com";
  const password = process.env.PRECIOUS_EVAL_PASSWORD || process.env.PRECIOUS_E2E_PASSWORD;
  if (!password) throw new Error("Missing PRECIOUS_EVAL_PASSWORD or PRECIOUS_E2E_PASSWORD.");

  const session = await signInOrCreateUser({
    supabaseUrl,
    anonKey,
    serviceRoleKey,
    email,
    password
  });
  const accessToken = session.access_token;
  if (!accessToken) throw new Error("Supabase auth did not return an access token.");
  const evalUserId = session.user?.id || session.user_id || "";
  if (!evalUserId) throw new Error("Supabase auth did not return an eval user id.");

  const starterCollectionsSeed = options.seedStarterCollections
    ? await seedStarterCollectionsForEvalUser({
      supabaseUrl,
      serviceRoleKey,
      userId: evalUserId,
      collections: evalCollections
    })
    : { enabled: false };
  if (starterCollectionsSeed.enabled) {
    console.log(`Seeded starter Collections for ${email}: ${starterCollectionsSeed.collection_count}`);
  }

  let completed = 0;
  const startedAt = new Date().toISOString();
  const runSamples = await mapLimit(samples, options.concurrency, async (sample) => {
    const clientCaptureKey = `${options.runId}-${sample.sample_id}`.slice(0, 180);
    const row = {
      ...sample,
      run_id: options.runId,
      client_capture_key: clientCaptureKey,
      evidence_mode: evidenceModeForSample(sample, options.supplementPublicEvidence)
    };
    try {
      const sourceText = sourceTextForSample(sample, options.supplementPublicEvidence);
      const created = await postCapture({
        apiUrl,
        anonKey,
        accessToken,
        clientCaptureKey,
        url: sample.url,
        sourceText
      });
      await triggerAnalyze({ apiUrl, accessToken, captureId: created.id });
      const capture = await pollCaptureRest({
        supabaseUrl,
        serviceRoleKey,
        clientCaptureKey,
        timeoutMs: options.timeoutMs,
        pollMs: options.pollMs
      });
      if (!capture) throw new Error(`Capture did not appear before timeout: ${clientCaptureKey}`);
      completed += 1;
      console.log(`[${completed}/${samples.length}] ${sample.sample_id} ${capture.analysis_state || "unknown"}`);
      return {
        ...row,
        capture_id: capture.id,
        prediction: predictionFromCapture(capture),
        capture
      };
    } catch (error) {
      completed += 1;
      console.log(`[${completed}/${samples.length}] ${sample.sample_id} error`);
      return {
        ...row,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  writeJson(options.outPath, {
    version: 1,
    run_id: options.runId,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    api_url: apiUrl,
    eval_email: email,
    eval_user_id: evalUserId,
    evidence_mode: options.supplementPublicEvidence
      ? "public_evidence_supplement_for_exa_public"
      : "direct_url",
    starter_collections_seed: starterCollectionsSeed,
    starter_collections: evalCollections,
    sample_count: runSamples.length,
    samples: runSamples
  });
  console.log(JSON.stringify({ ok: true, runId: options.runId, samples: runSamples.length, out: options.outPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
