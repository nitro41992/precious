import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { loadEnvFiles } from "./load-env-files.mjs";

const appId = "com.preciouscaptures";
const deviceVideoPath = "/sdcard/precious-motion.mp4";
const localVideoPath = "/tmp/precious-motion.mp4";
const localFrameStatsPath = "/tmp/precious-motion-framestats.txt";
const fixtureImageUrl = "https://picsum.photos/seed/precious-motion/900/700";

function parseArgs() {
  const options = { recordSeconds: 60, seed: true };
  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (arg === "--record-seconds") {
      options.recordSeconds = Number(process.argv[++index]);
    } else if (arg === "--no-seed") {
      options.seed = false;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!Number.isFinite(options.recordSeconds) || options.recordSeconds < 5) {
    throw new Error("--record-seconds must be at least 5.");
  }
  return options;
}

function run(label, command, args, options = {}) {
  const result = spawnSync(command, args, {
    env: options.env || process.env,
    stdio: options.capture ? "pipe" : "inherit",
    encoding: options.capture ? "utf8" : undefined
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
  return result;
}

function runOptional(label, command, args, options = {}) {
  const result = spawnSync(command, args, {
    env: options.env || process.env,
    stdio: "pipe",
    encoding: "utf8"
  });
  if (result.error || result.status !== 0) {
    console.warn(`${label} skipped.`);
    return null;
  }
  return result;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function buildValidationEnv() {
  loadEnvFiles();
  const email = process.env.PRECIOUS_E2E_EMAIL || "precious-captures-e2e@example.com";
  const password = process.env.PRECIOUS_E2E_PASSWORD || `precious-e2e-${randomBytes(24).toString("base64url")}`;
  return {
    ...process.env,
    ADB_MDNS_AUTO_CONNECT: process.env.ADB_MDNS_AUTO_CONNECT || "0",
    ADB_MDNS_OPENSCREEN: process.env.ADB_MDNS_OPENSCREEN || "0",
    PRECIOUS_E2E_EMAIL: email,
    PRECIOUS_E2E_PASSWORD: password
  };
}

function envValue(env, name, fallbackName) {
  const value = env[name] || (fallbackName ? env[fallbackName] : "");
  if (!value) throw new Error(`Missing ${name}${fallbackName ? ` or ${fallbackName}` : ""}.`);
  return value.replace(/\/$/, "");
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${init.method || "GET"} ${url} failed ${response.status}: ${text.slice(0, 500)}`);
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

async function restInsert({ supabaseUrl, serviceRoleKey, table, row }) {
  const rows = await requestJson(`${supabaseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: serviceHeaders(serviceRoleKey, {
      "content-type": "application/json",
      prefer: "return=representation"
    }),
    body: JSON.stringify(row)
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function signInForUser({ supabaseUrl, anonKey, email, password }) {
  const session = await requestJson(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
  if (!session.user?.id) throw new Error("Supabase auth did not return a user id.");
  return session.user;
}

function collectionDecisionFor(collection) {
  return {
    type: "existing",
    collection_id: collection.id,
    title: collection.title,
    description: collection.description,
    rationale: "The capture matches the seeded animation validation collection.",
    confidence: 0.86
  };
}

function baseAnalysis(collection) {
  return {
    summary: "Animation validation summary",
    thumbnail_url: fixtureImageUrl,
    url_evidence: {
      final_url: "https://example.com/precious-motion",
      image_url: fixtureImageUrl
    },
    default_intent: {
      category: "learn",
      confidence: 0.82,
      rationale: "The text is useful educational material worth saving."
    },
    confidence_label: "Looks right",
    needs_review: true,
    entities: [
      {
        type: "project",
        name: "animation validation searchable detail",
        evidence: "seeded animation fixture",
        confidence: 0.91
      }
    ],
    search_phrases: ["animation validation", "collection detail motion"],
    collection_decisions: [collectionDecisionFor(collection)],
    suggested_collections: []
  };
}

async function seedAnimationFixtures(env) {
  const supabaseUrl = envValue(env, "EXPO_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = envValue(env, "EXPO_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = envValue(env, "SUPABASE_SERVICE_ROLE_KEY");
  const user = await signInForUser({
    supabaseUrl,
    anonKey,
    email: env.PRECIOUS_E2E_EMAIL,
    password: env.PRECIOUS_E2E_PASSWORD
  });
  const prefix = `review-e2e-${randomBytes(8).toString("hex")}`;
  const collection = await restInsert({
    supabaseUrl,
    serviceRoleKey,
    table: "collections",
    row: {
      user_id: user.id,
      title: `${prefix} Suggested`,
      description: "Seeded collection for Android animation validation.",
      status: "active",
      created_by: "user"
    }
  });
  const capture = await restInsert({
    supabaseUrl,
    serviceRoleKey,
    table: "captures",
    row: {
      user_id: user.id,
      client_capture_key: `${prefix}-choice`,
      source_text: `${prefix} choice source text`,
      source_url: "https://example.com/precious-motion",
      source_app: "Android Animation Validation",
      display_title: `${prefix} choice`,
      title: `${prefix} choice`,
      thumbnail_url: fixtureImageUrl,
      context_note: "Seeded note for animation validation.",
      analysis_state: "needs_review",
      analysis_provider: "system",
      analysis_model: "animation-validation",
      analysis_mode: "llm",
      default_intent: "learn",
      default_intent_confidence: 0.82,
      current_save_intent: "learn",
      intent_rationale: "The text is useful educational material worth saving.",
      analysis: baseAnalysis(collection)
    }
  });
  const link = await restInsert({
    supabaseUrl,
    serviceRoleKey,
    table: "collection_capture_links",
    row: {
      user_id: user.id,
      collection_id: collection.id,
      capture_id: capture.id,
      created_by: "user",
      rationale: "Seeded animation validation link.",
      confidence: 1
    }
  });
  console.log(
    JSON.stringify(
      {
        ok: true,
        prefix,
        capture: capture.id,
        collection: collection.id,
        link: link.id
      },
      null,
      2
    )
  );
}

function runMaestro(label, flowPath, env) {
  run(label, "maestro", [
    "test",
    "-e",
    `PRECIOUS_E2E_EMAIL=${env.PRECIOUS_E2E_EMAIL}`,
    "-e",
    `PRECIOUS_E2E_PASSWORD=${env.PRECIOUS_E2E_PASSWORD}`,
    flowPath
  ], { env });
}

async function signInWithAuthCallback(env) {
  const supabaseUrl = envValue(env, "EXPO_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = envValue(env, "EXPO_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const session = await requestJson(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      email: env.PRECIOUS_E2E_EMAIL,
      password: env.PRECIOUS_E2E_PASSWORD
    })
  });
  const accessToken = session.access_token || "";
  const refreshToken = session.refresh_token || "";
  const expiresAt = Number(session.expires_at) ||
    Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600);
  if (!accessToken || !refreshToken) throw new Error("Supabase auth did not return session tokens.");
  const callbackParams = new URLSearchParams({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: String(expiresAt)
  });
  const callbackUrl = `preciouscaptures://auth/callback#${callbackParams.toString()}`;
  run("Clear app state", "adb", ["shell", "pm", "clear", appId], { env, capture: true });
  runOptional("Grant notification permission", "adb", [
    "shell",
    "pm",
    "grant",
    appId,
    "android.permission.POST_NOTIFICATIONS"
  ], { env });
  run("Open auth callback", "adb", [
    "shell",
    "am",
    "start",
    "-W",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    shellQuote(callbackUrl),
    "-n",
    `${appId}/.MainActivity`
  ], { env, capture: true });
  await delay(3000);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function recordFlow(env, recordSeconds) {
  run("Remove old device recording", "adb", ["shell", "rm", "-f", deviceVideoPath], { env });
  run("Reset Android frame stats", "adb", ["shell", "dumpsys", "gfxinfo", appId, "reset"], { env, capture: true });

  const recorder = spawn("adb", [
    "shell",
    "screenrecord",
    "--time-limit",
    String(recordSeconds),
    deviceVideoPath
  ], {
    env,
    stdio: "ignore"
  });

  let recorderExited = false;
  const recorderExit = new Promise((resolve) => {
    recorder.once("exit", (code, signal) => {
      recorderExited = true;
      resolve({ code, signal });
    });
  });

  await delay(1500);
  runMaestro("Maestro animation validation flow", ".maestro/03-animation-validation.yaml", env);

  if (!recorderExited) {
    runOptional("Stop Android screenrecord", "adb", ["shell", "pkill", "-2", "screenrecord"], { env });
  }
  await Promise.race([recorderExit, delay(5000)]);
  if (!recorderExited) recorder.kill("SIGINT");

  run("Pull Android recording", "adb", ["pull", deviceVideoPath, localVideoPath], { env });
  const frameStats = run(
    "Collect Android frame stats",
    "adb",
    ["shell", "dumpsys", "gfxinfo", appId, "framestats"],
    { env, capture: true }
  );
  writeFileSync(localFrameStatsPath, `${frameStats.stdout || ""}${frameStats.stderr || ""}`);
}

async function main() {
  const options = parseArgs();
  const env = buildValidationEnv();

  if (options.seed) {
    run("Create or update E2E password user", "node", ["scripts/create-password-user.mjs"], { env });
    await seedAnimationFixtures(env);
  }

  await signInWithAuthCallback(env);
  await recordFlow(env, options.recordSeconds);

  console.log(
    JSON.stringify(
      {
        ok: true,
        video: localVideoPath,
        frameStats: localFrameStatsPath
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
