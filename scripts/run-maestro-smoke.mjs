// Maestro smoke runner.
//
// Auth on this app is magic-link + Google OAuth (no password UI) and those are
// off-app surfaces Maestro cannot drive. So the suite establishes a session via
// the deep-link callback seam (signInWithAuthCallback) and exercises the product
// journeys against DETERMINISTIC SEEDED fixtures — no OpenAI call, no per-run LLM
// cost, fully repeatable.
//
// Default run is zero-LLM (seeded flows only). Pass --with-live-capture to also
// run the one intentionally-real manual-capture flow (hits the real backend/LLM).

import { randomBytes } from "node:crypto";
import { loadEnvFiles } from "./load-env-files.mjs";
import { run, runMaestroFlow, signInWithAuthCallback } from "./lib/e2e-harness.mjs";
import {
  resolveSeedContext,
  seedFailedCapture,
  seedPendingSuggestion
} from "./lib/seed-captures.mjs";

function parseArgs() {
  const options = { withLiveCapture: false };
  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (arg === "--with-live-capture") options.withLiveCapture = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function buildEnv() {
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

async function main() {
  const options = parseArgs();
  const env = buildEnv();

  // Ensure the E2E auth user exists (password lives at the Supabase auth level for
  // the deep-link seam; the app UI itself no longer exposes password sign-in).
  run("Create or update E2E password user", "node", ["scripts/create-password-user.mjs"], { env });

  // Seed deterministic fixtures the flows assert against (no LLM). Accept and undo
  // each need their own pending suggestion since accepting consumes one, so they
  // get separate seed contexts (distinct prefixes -> no key collision).
  const base = await resolveSeedContext(env);
  const failed = await seedFailedCapture(base);
  const acceptCtx = await resolveSeedContext(env);
  const accept = await seedPendingSuggestion(acceptCtx);
  const undoCtx = await resolveSeedContext(env);
  const undo = await seedPendingSuggestion(undoCtx);
  console.log(JSON.stringify({ ok: true, seeded: { base: base.prefix, failed, accept, undo } }, null, 2));

  // Establish the app session without driving the magic-link / OAuth UI.
  await signInWithAuthCallback(env);

  // Zero-LLM seeded flows, each handed the ids/prefix it asserts against.
  runMaestroFlow("Recents + search", ".maestro/02-collections.yaml", env, {
    PRECIOUS_E2E_PREFIX: base.prefix
  });
  runMaestroFlow("AI suggestion accept", ".maestro/04-ai-suggestion-accept.yaml", env, {
    PRECIOUS_E2E_SUGGESTION_ID: accept.collectionId
  });
  runMaestroFlow("AI suggestion dismiss + undo", ".maestro/05-ai-suggestion-undo.yaml", env, {
    PRECIOUS_E2E_SUGGESTION_ID: undo.collectionId
  });
  runMaestroFlow("Failed-capture recovery", ".maestro/06-failed-recovery.yaml", env, {
    PRECIOUS_E2E_PREFIX: base.prefix
  });
  runMaestroFlow("Settings delete guard", ".maestro/07-settings-delete-guard.yaml", env);

  // The single intentionally-real wire-check (hits the real backend + LLM).
  if (options.withLiveCapture) {
    runMaestroFlow("Manual capture (LIVE LLM)", ".maestro/01-manual-capture.yaml", env);
  }

  console.log(JSON.stringify({ ok: true, liveCapture: options.withLiveCapture }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
