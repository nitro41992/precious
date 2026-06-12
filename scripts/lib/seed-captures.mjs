// Deterministic capture/collection fixtures for the device E2E suite. These seed
// the exact backend shapes the app parses (see app/remoteData.ts captureFromRemote)
// so Maestro flows can exercise AI-suggestion, failed-recovery, and review journeys
// WITHOUT calling OpenAI — no per-run LLM cost, fully repeatable.
//
// The pure build* functions return the DB rows; the seed* functions insert them.
// Keeping them split lets test/seedFixtures.test.js feed the same rows through
// captureFromRemote in the gated fast suite, so a future shape/type drift breaks a
// test here instead of silently passing a green-but-wrong Maestro run.

import { randomBytes } from "node:crypto";

import {
  restInsert,
  signInForUser,
  supabaseConfig
} from "./e2e-harness.mjs";

const FIXTURE_IMAGE_URL = "https://picsum.photos/seed/precious-e2e/900/700";

// --- Pure fixture builders (no side effects) -------------------------------

// A pending AI collection suggestion: a status:"suggested" collection plus a
// capture whose analysis carries pending_collection_suggestion and a "ready"
// suggestion state. captureFromRemote turns this into a suggested LinkedCollection.
export function buildPendingSuggestionFixture(prefix, userId) {
  const collectionRow = {
    user_id: userId,
    title: `${prefix} Suggested`,
    description: "Seeded suggested collection for E2E.",
    status: "suggested",
    created_by: "analysis"
  };
  const buildCaptureRow = (collectionId) => ({
    user_id: userId,
    client_capture_key: `${prefix}-suggestion`,
    source_text: `${prefix} suggestion source text`,
    source_url: "https://example.com/precious-suggestion",
    source_app: "Precious E2E",
    display_title: `${prefix} suggestion`,
    title: `${prefix} suggestion`,
    thumbnail_url: FIXTURE_IMAGE_URL,
    analysis_state: "needs_review",
    analysis_provider: "system",
    analysis_model: "e2e-fixture",
    analysis_mode: "llm",
    default_intent: "learn",
    default_intent_confidence: 0.82,
    current_save_intent: "learn",
    collection_suggestion_state: "ready",
    analysis: {
      summary: "Seeded suggestion summary",
      default_intent: { category: "learn", confidence: 0.82, rationale: "Seeded." },
      pending_collection_suggestion: {
        collection_id: collectionId,
        title: `${prefix} Suggested`,
        description: "Seeded suggested collection for E2E.",
        rationale: "Seeded suggestion rationale.",
        confidence: 0.84
      }
    }
  });
  return { collectionRow, buildCaptureRow };
}

// A failed, non-image capture: triggers the photo-recovery prompt in review
// (shouldOfferPhotoRecovery -> displayStatus "failed" && !isImageCapture).
export function buildFailedCaptureFixture(prefix, userId) {
  return {
    user_id: userId,
    client_capture_key: `${prefix}-failed`,
    source_text: `${prefix} failed source text`,
    source_url: "https://example.com/precious-failed",
    source_app: "Precious E2E",
    display_title: `${prefix} failed`,
    title: `${prefix} failed`,
    analysis_state: "failed",
    analysis_provider: "system",
    analysis_model: "e2e-fixture",
    analysis_mode: "llm",
    analysis: {
      summary: "",
      rejection_reason: "Seeded failed capture for recovery flow."
    }
  };
}

// A needs-review capture for generic review-screen assertions.
export function buildNeedsReviewFixture(prefix, userId) {
  return {
    user_id: userId,
    client_capture_key: `${prefix}-review`,
    source_text: `${prefix} review source text`,
    source_url: "https://example.com/precious-review",
    source_app: "Precious E2E",
    display_title: `${prefix} review`,
    title: `${prefix} review`,
    thumbnail_url: FIXTURE_IMAGE_URL,
    analysis_state: "needs_review",
    analysis_provider: "system",
    analysis_model: "e2e-fixture",
    analysis_mode: "llm",
    default_intent: "learn",
    analysis: {
      summary: "Seeded review summary",
      default_intent: { category: "learn", confidence: 0.8, rationale: "Seeded." }
    }
  };
}

// --- Seed context + inserts -------------------------------------------------

export async function resolveSeedContext(env) {
  const { supabaseUrl, anonKey, serviceRoleKey } = supabaseConfig(env);
  const user = await signInForUser({
    supabaseUrl,
    anonKey,
    email: env.PRECIOUS_E2E_EMAIL,
    password: env.PRECIOUS_E2E_PASSWORD
  });
  const prefix = `review-e2e-${randomBytes(8).toString("hex")}`;
  return { supabaseUrl, serviceRoleKey, user, prefix };
}

export async function seedPendingSuggestion(ctx) {
  const { collectionRow, buildCaptureRow } = buildPendingSuggestionFixture(ctx.prefix, ctx.user.id);
  const collection = await restInsert({
    supabaseUrl: ctx.supabaseUrl,
    serviceRoleKey: ctx.serviceRoleKey,
    table: "collections",
    row: collectionRow
  });
  const capture = await restInsert({
    supabaseUrl: ctx.supabaseUrl,
    serviceRoleKey: ctx.serviceRoleKey,
    table: "captures",
    row: buildCaptureRow(collection.id)
  });
  return { prefix: ctx.prefix, collectionId: collection.id, captureId: capture.id };
}

export async function seedFailedCapture(ctx) {
  const capture = await restInsert({
    supabaseUrl: ctx.supabaseUrl,
    serviceRoleKey: ctx.serviceRoleKey,
    table: "captures",
    row: buildFailedCaptureFixture(ctx.prefix, ctx.user.id)
  });
  return { prefix: ctx.prefix, captureId: capture.id };
}

export async function seedNeedsReviewCapture(ctx) {
  const capture = await restInsert({
    supabaseUrl: ctx.supabaseUrl,
    serviceRoleKey: ctx.serviceRoleKey,
    table: "captures",
    row: buildNeedsReviewFixture(ctx.prefix, ctx.user.id)
  });
  return { prefix: ctx.prefix, captureId: capture.id };
}
