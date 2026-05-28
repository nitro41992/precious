import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && value && !process.env[key]) process.env[key] = value;
  }
}

[
  ".env",
  ".env.local",
  "../apps/mobile/.env",
  "../apps/mobile/.env.local",
  "../apps/web/.env",
  "../apps/web/.env.local"
].forEach((path) => loadEnvFile(resolve(path)));

function parseArgs() {
  return {
    keepData: process.argv.includes("--keep-data")
  };
}

function env(name, fallbackName) {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : "");
  if (!value) throw new Error(`Missing ${name}${fallbackName ? ` or ${fallbackName}` : ""}`);
  return value.replace(/\/$/, "");
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
        user_metadata: { source: "precious-captures-review-e2e" }
      })
    }).catch((error) => {
      if (!String(error.message).includes("already")) throw error;
    });
    return await signIn();
  }
}

function serviceHeaders(serviceRoleKey, extra = {}) {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    ...extra
  };
}

function userHeaders(anonKey, accessToken, extra = {}) {
  return {
    apikey: anonKey,
    authorization: `Bearer ${accessToken}`,
    ...extra
  };
}

async function restRows({ supabaseUrl, serviceRoleKey, table, params }) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return requestJson(url, {
    headers: serviceHeaders(serviceRoleKey)
  });
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

async function restDelete({ supabaseUrl, serviceRoleKey, table, params }) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  await requestJson(url, {
    method: "DELETE",
    headers: serviceHeaders(serviceRoleKey)
  });
}

async function fetchCapture({ supabaseUrl, serviceRoleKey, captureId }) {
  const rows = await restRows({
    supabaseUrl,
    serviceRoleKey,
    table: "captures",
    params: {
      id: `eq.${captureId}`,
      select: "id,analysis,analysis_state,review_confirmed_at,current_save_intent,display_title,context_note"
    }
  });
  if (!rows.length) throw new Error(`Capture not found: ${captureId}`);
  return rows[0];
}

async function activeLinks({ supabaseUrl, serviceRoleKey, captureId }) {
  return restRows({
    supabaseUrl,
    serviceRoleKey,
    table: "collection_capture_links",
    params: {
      capture_id: `eq.${captureId}`,
      unlinked_at: "is.null",
      select: "collection_id,created_by,rationale,confidence"
    }
  });
}

function isEdgeCaptureApi(apiUrl) {
  return apiUrl.includes("/functions/v1/");
}

function captureMutationUrl(apiUrl) {
  return isEdgeCaptureApi(apiUrl) ? apiUrl : `${apiUrl}/api/captures`;
}

async function patchCapture({ apiUrl, anonKey, accessToken, body }) {
  const json = await requestJson(captureMutationUrl(apiUrl), {
    method: "PATCH",
    headers: userHeaders(anonKey, accessToken, {
      "content-type": "application/json"
    }),
    body: JSON.stringify(body)
  });
  if (!json.capture?.id) throw new Error(`Capture mutation did not return a capture: ${body.action}`);
  return json.capture;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function collectionDecisionFor(collection, rationale = "The capture matches the seeded collection topic.", confidence = 0.8) {
  return {
    type: "existing",
    collection_id: collection.id,
    title: collection.title,
    description: collection.description,
    rationale,
    confidence
  };
}

function baseAnalysis({ existingCollection, label, extraCollectionDecisions = [] }) {
  return {
    summary: `${label} summary`,
    default_intent: {
      category: "remember",
      confidence: 0.82,
      rationale: "The text is useful reference material worth saving."
    },
    confidence_label: "Looks right",
    needs_review: true,
    entities: [
      {
        type: "project",
        name: `${label} searchable detail`,
        evidence: "seeded regression fixture",
        confidence: 0.91
      }
    ],
    search_phrases: [`${label} searchable phrase`, "collection review regression"],
    suggested_reminders: [
      {
        trigger_type: "time",
        trigger_value: "next Friday 9 AM",
        rationale: "The user mentioned reviewing it later.",
        confidence: 0.74
      }
    ],
    collection_decisions: [
      collectionDecisionFor(existingCollection),
      ...extraCollectionDecisions
    ],
    suggested_collections: []
  };
}

async function seedCollection({ supabaseUrl, serviceRoleKey, userId, prefix, suffix }) {
  return restInsert({
    supabaseUrl,
    serviceRoleKey,
    table: "collections",
    row: {
      user_id: userId,
      title: `${prefix} ${suffix}`,
      description: `Seeded collection for ${suffix}`,
      status: "active",
      created_by: "user"
    }
  });
}

async function seedCapture({ supabaseUrl, serviceRoleKey, userId, prefix, existingCollection, suffix, extraCollectionDecisions = [] }) {
  return restInsert({
    supabaseUrl,
    serviceRoleKey,
    table: "captures",
    row: {
      user_id: userId,
      client_capture_key: `${prefix}-${suffix}`,
      source_text: `${prefix} ${suffix} source text`,
      source_app: "Hosted Review Regression",
      display_title: `${prefix} ${suffix}`,
      title: `${prefix} ${suffix}`,
      context_note: "Seeded note",
      analysis_state: "needs_review",
      analysis_provider: "system",
      analysis_model: "review-regression",
      analysis_mode: "llm",
      default_intent: "remember",
      default_intent_confidence: 0.82,
      current_save_intent: "remember",
      intent_rationale: "The text is useful reference material worth saving.",
      analysis: baseAnalysis({ existingCollection, label: suffix, extraCollectionDecisions })
    }
  });
}

async function main() {
  const options = parseArgs();
  const supabaseUrl = env("EXPO_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = env("EXPO_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const apiUrl = process.env.PRECIOUS_CAPTURE_FUNCTION_URL || `${supabaseUrl}/functions/v1/capture-intake`;
  const email = process.env.PRECIOUS_E2E_EMAIL || "precious-captures-e2e@example.com";
  const password = process.env.PRECIOUS_E2E_PASSWORD;
  if (!password) throw new Error("Missing PRECIOUS_E2E_PASSWORD for hosted review regression.");

  const session = await signInOrCreateUser({ supabaseUrl, anonKey, serviceRoleKey, email, password });
  const accessToken = session.access_token;
  const userId = session.user?.id;
  if (!accessToken || !userId) throw new Error("Supabase auth did not return an access token and user id.");

  const prefix = `review-e2e-${randomUUID()}`;
  const cleanup = { captures: [], collections: [] };

  try {
    const suggested = await seedCollection({ supabaseUrl, serviceRoleKey, userId, prefix, suffix: "Suggested" });
    const replacement = await seedCollection({ supabaseUrl, serviceRoleKey, userId, prefix, suffix: "Replacement" });
    const alternative = await seedCollection({ supabaseUrl, serviceRoleKey, userId, prefix, suffix: "Alternative" });
    cleanup.collections.push(suggested.id, replacement.id, alternative.id);

    const choiceCapture = await seedCapture({
      supabaseUrl,
      serviceRoleKey,
      userId,
      prefix,
      existingCollection: suggested,
      suffix: "choice"
    });
    cleanup.captures.push(choiceCapture.id);

    await patchCapture({
      apiUrl,
      anonKey,
      accessToken,
      body: {
        captureId: choiceCapture.id,
        action: "apply_collection_choice",
        choice: { type: "existing", collectionId: replacement.id },
        source: "manual",
        dismissCurrentCollectionSuggestions: true
      }
    });
    let capture = await fetchCapture({ supabaseUrl, serviceRoleKey, captureId: choiceCapture.id });
    let links = await activeLinks({ supabaseUrl, serviceRoleKey, captureId: choiceCapture.id });
    assert(links.some((link) => link.collection_id === replacement.id), "Manual replacement did not link the replacement collection.");
    assert((capture.analysis.collection_decisions || []).length === 0, "Manual replacement did not dismiss collection suggestions.");
    assert(
      (capture.analysis.collection_choice_overrides || []).some((override) =>
        override.collection_id === replacement.id && override.restored_decisions?.length === 1
      ),
      "Manual replacement did not preserve the replaced AI suggestion for undo."
    );

    await patchCapture({
      apiUrl,
      anonKey,
      accessToken,
      body: {
        captureId: choiceCapture.id,
        action: "undo_collection_choice",
        collectionId: replacement.id
      }
    });
    capture = await fetchCapture({ supabaseUrl, serviceRoleKey, captureId: choiceCapture.id });
    links = await activeLinks({ supabaseUrl, serviceRoleKey, captureId: choiceCapture.id });
    assert(!links.some((link) => link.collection_id === replacement.id), "Undo did not unlink the manual replacement.");
    assert(
      (capture.analysis.collection_decisions || []).some((decision) => decision.collection_id === suggested.id),
      "Undo did not restore the original AI collection suggestion."
    );

    await patchCapture({
      apiUrl,
      anonKey,
      accessToken,
      body: {
        captureId: choiceCapture.id,
        action: "clear_collection_suggestion",
        suggestionIndex: 0
      }
    });
    capture = await fetchCapture({ supabaseUrl, serviceRoleKey, captureId: choiceCapture.id });
    assert((capture.analysis.collection_decisions || []).length === 0, "Clear AI did not remove the restored collection suggestion.");

    const autoCapture = await seedCapture({
      supabaseUrl,
      serviceRoleKey,
      userId,
      prefix,
      existingCollection: suggested,
      suffix: "auto",
      extraCollectionDecisions: [
        collectionDecisionFor(alternative, "The capture could also fit the alternative collection.", 0.58)
      ]
    });
    cleanup.captures.push(autoCapture.id);
    await patchCapture({
      apiUrl,
      anonKey,
      accessToken,
      body: {
        captureId: autoCapture.id,
        action: "apply_collection_choice",
        choice: { type: "existing", collectionId: suggested.id },
        source: "analysis",
        suggestionIndex: 0,
        dismissCurrentCollectionSuggestions: true,
        rationale: "The capture matches the seeded collection topic.",
        confidence: 0.8
      }
    });
    capture = await fetchCapture({ supabaseUrl, serviceRoleKey, captureId: autoCapture.id });
    links = await activeLinks({ supabaseUrl, serviceRoleKey, captureId: autoCapture.id });
    assert(links.some((link) => link.collection_id === suggested.id), "Auto analysis selection did not link the top collection suggestion.");
    assert((capture.analysis.collection_decisions || []).length === 0, "Auto analysis selection did not clear pending collection suggestions.");
    assert(
      (capture.analysis.collection_choice_overrides || []).some((override) =>
        override.collection_id === suggested.id &&
          override.source === "analysis" &&
          override.restored_decisions?.some((decision) => decision.collection_id === alternative.id)
      ),
      "Auto analysis selection did not preserve alternate AI collection ideas."
    );

    const reviewCapture = await seedCapture({
      supabaseUrl,
      serviceRoleKey,
      userId,
      prefix,
      existingCollection: suggested,
      suffix: "review"
    });
    cleanup.captures.push(reviewCapture.id);
    await patchCapture({
      apiUrl,
      anonKey,
      accessToken,
      body: {
        captureId: reviewCapture.id,
        action: "save_review_decisions",
        title: `${prefix} reviewed title`,
        note: "Reviewed note",
        reminderDecisions: [{ index: 0, action: "remove" }],
        collectionDecisions: [
          {
            kind: "suggested",
            index: 0,
            type: "existing",
            collectionId: suggested.id,
            title: suggested.title,
            description: suggested.description,
            rationale: "Accepted by hosted review regression.",
            confidence: 0.8,
            action: "link"
          }
        ]
      }
    });
    capture = await fetchCapture({ supabaseUrl, serviceRoleKey, captureId: reviewCapture.id });
    links = await activeLinks({ supabaseUrl, serviceRoleKey, captureId: reviewCapture.id });
    assert(capture.analysis_state === "ready", `Expected review save to produce ready state, got ${capture.analysis_state}.`);
    assert((capture.analysis.suggested_reminders || []).length === 0, "Review save did not remove the reminder suggestion.");
    assert((capture.analysis.collection_decisions || []).length === 0, "Review save did not consume the collection decision.");
    assert(links.some((link) => link.collection_id === suggested.id), "Review save did not link the accepted collection.");
    assert(capture.analysis.entities?.length === 1, "Review save dropped persisted extracted entities.");
    assert(capture.analysis.search_phrases?.length === 2, "Review save dropped search phrases.");

    const confirmCapture = await seedCapture({
      supabaseUrl,
      serviceRoleKey,
      userId,
      prefix,
      existingCollection: suggested,
      suffix: "confirm"
    });
    cleanup.captures.push(confirmCapture.id);
    await patchCapture({
      apiUrl,
      anonKey,
      accessToken,
      body: {
        captureId: confirmCapture.id,
        action: "confirm_review",
        title: `${prefix} confirmed title`,
        note: "Confirmed note"
      }
    });
    capture = await fetchCapture({ supabaseUrl, serviceRoleKey, captureId: confirmCapture.id });
    links = await activeLinks({ supabaseUrl, serviceRoleKey, captureId: confirmCapture.id });
    assert(capture.analysis_state === "ready", `Expected confirm_review to produce ready state, got ${capture.analysis_state}.`);
    assert(capture.review_confirmed_at, "Confirm review did not persist review_confirmed_at.");
    assert((capture.analysis.collection_decisions || []).length === 0, "Confirm review did not clear pending collection decisions.");
    assert(links.some((link) => link.collection_id === suggested.id), "Confirm review did not accept pending collection decisions.");
    assert(capture.analysis.entities?.length === 1, "Confirm review dropped persisted extracted entities.");
    assert(capture.analysis.search_phrases?.length === 2, "Confirm review dropped search phrases.");

    console.log(
      JSON.stringify(
        {
          ok: true,
          apiUrl,
          prefix,
          captures: cleanup.captures,
          collections: cleanup.collections
        },
        null,
        2
      )
    );
  } finally {
    if (!options.keepData) {
      for (const captureId of cleanup.captures) {
        await restDelete({ supabaseUrl, serviceRoleKey, table: "captures", params: { id: `eq.${captureId}` } }).catch(() => {});
      }
      for (const collectionId of cleanup.collections) {
        await restDelete({ supabaseUrl, serviceRoleKey, table: "collections", params: { id: `eq.${collectionId}` } }).catch(() => {});
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
