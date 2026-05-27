import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const terminalStates = new Set(["ready", "needs_review", "failed"]);

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
  const options = {
    allowNoReminder: false,
    timeoutMs: 180000
  };
  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (arg === "--allow-no-reminder") options.allowNoReminder = true;
    else if (arg === "--timeout-ms") options.timeoutMs = Number(process.argv[++index]);
    else if (arg === "--url") options.url = process.argv[++index];
    else if (arg === "--text") options.text = process.argv[++index];
    else if (arg === "--image") options.image = process.argv[++index];
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function env(name, fallbackName) {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : "");
  if (!value) throw new Error(`Missing ${name}${fallbackName ? ` or ${fallbackName}` : ""}`);
  return value.replace(/\/$/, "");
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${init?.method || "GET"} ${url} failed ${response.status}: ${text.slice(0, 500)}`);
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
        user_metadata: { source: "precious-captures-hosted-e2e" }
      })
    }).catch((error) => {
      if (!String(error.message).includes("already")) throw error;
    });
    return await signIn();
  }
}

async function restRows({ supabaseUrl, serviceRoleKey, table, params }) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return requestJson(url, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`
    }
  });
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function pollCapture({ functionUrl, anonKey, accessToken, clientCaptureKey, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    const url = new URL(functionUrl);
    url.searchParams.set("clientCaptureKey", clientCaptureKey);
    const json = await requestJson(url, {
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${accessToken}`
      }
    });
    latest = json.capture;
    if (latest && terminalStates.has(latest.analysis_state)) return latest;
    await sleep(5000);
  }
  return latest;
}

function isEdgeCaptureApi(apiUrl) {
  return apiUrl.includes("/functions/v1/");
}

function mimeTypeFor(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

async function postCapture({ apiUrl, anonKey, accessToken, clientCaptureKey, sourceUrl, sourceText, imagePath }) {
  const edge = isEdgeCaptureApi(apiUrl);
  if (imagePath) {
    const resolvedImagePath = resolve(imagePath);
    if (!existsSync(resolvedImagePath)) throw new Error(`Image fixture not found: ${resolvedImagePath}`);
    const form = new FormData();
    form.set("clientCaptureKey", clientCaptureKey);
    form.set("sourceText", sourceText);
    if (sourceUrl) form.set("sourceUrl", sourceUrl);
    form.set("sourceApp", "Hosted Verification");
    form.set("autoAnalyze", edge ? "true" : "false");
    form.set(
      "asset",
      new Blob([readFileSync(resolvedImagePath)], { type: mimeTypeFor(resolvedImagePath) }),
      basename(resolvedImagePath)
    );
    const json = await requestJson(edge ? apiUrl : `${apiUrl}/api/captures`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${accessToken}`
      },
      body: form
    });
    if (!json.capture?.id) throw new Error("Capture intake did not return a capture id.");
    return json.capture;
  }

  const json = await requestJson(edge ? apiUrl : `${apiUrl}/api/captures`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      clientCaptureKey,
      sourceUrl,
      sourceText,
      sourceApp: "Hosted Verification",
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

async function createSuggestedReminders({ apiUrl, accessToken, capture }) {
  if (isEdgeCaptureApi(apiUrl)) return;
  const suggestions = capture.reminder_suggestions ?? capture.analysis?.suggested_reminders ?? [];
  for (const reminder of suggestions) {
    if (
      reminder.trigger_type === "none" ||
      !reminder.trigger_value ||
      Number(reminder.confidence ?? 0) < 0.55
    ) {
      continue;
    }
    await requestJson(`${apiUrl}/api/reminders`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(
        reminder.id
          ? { captureId: capture.id, suggestionId: reminder.id }
          : {
              captureId: capture.id,
              triggerType: reminder.trigger_type,
              triggerValue: reminder.trigger_value,
              rationale: reminder.rationale
            }
      )
    });
  }
}

async function pollAnyCapture({ apiUrl, anonKey, accessToken, clientCaptureKey, captureId, timeoutMs }) {
  if (isEdgeCaptureApi(apiUrl)) {
    return pollCapture({
      functionUrl: apiUrl,
      anonKey,
      accessToken,
      clientCaptureKey,
      timeoutMs
    });
  }

  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    const url = new URL(`${apiUrl}/api/captures`);
    url.searchParams.set("view", "detail");
    url.searchParams.set("captureId", captureId);
    const json = await requestJson(url, {
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${accessToken}`
      }
    });
    latest = json.capture;
    if (latest && terminalStates.has(latest.analysis_state)) return latest;
    await sleep(5000);
  }
  return latest;
}

async function main() {
  const options = parseArgs();
  const supabaseUrl = env("EXPO_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = env("EXPO_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const apiUrl =
    process.env.PRECIOUS_CAPTURE_FUNCTION_URL ||
    `${supabaseUrl}/functions/v1/capture-intake`;
  const email = process.env.PRECIOUS_E2E_EMAIL || "precious-captures-e2e@example.com";
  const password = process.env.PRECIOUS_E2E_PASSWORD;
  if (!password) throw new Error("Missing PRECIOUS_E2E_PASSWORD for hosted verification.");
  const clientCaptureKey = `hosted-e2e-${randomUUID()}`;
  const sourceUrl = options.url || (options.image ? "" : "https://www.reddit.com/r/reactnative/");
  const sourceText =
    options.text ||
    (options.image
      ? [
          `Precious hosted image E2E ${clientCaptureKey}.`,
          "Save this shared image for later reference.",
          "Remind me next Friday at 9 AM to review it."
        ].join(" ")
      : [
          sourceUrl,
          `Precious hosted E2E ${clientCaptureKey}.`,
          "Save this React Native reference for the mobile capture project.",
          "Remind me next Friday at 9 AM to review it and decide whether to use it."
        ].join(" "));

  const session = await signInOrCreateUser({
    supabaseUrl,
    anonKey,
    serviceRoleKey,
    email,
    password
  });
  const accessToken = session.access_token;
  if (!accessToken) throw new Error("Supabase auth did not return an access token.");

  const created = await postCapture({
    apiUrl,
    anonKey,
    accessToken,
    clientCaptureKey,
    sourceUrl,
    sourceText,
    imagePath: options.image
  });

  await triggerAnalyze({
    apiUrl,
    accessToken,
    captureId: created.id
  });

  const capture = await pollAnyCapture({
    apiUrl,
    anonKey,
    accessToken,
    clientCaptureKey,
    captureId: created.id,
    timeoutMs: options.timeoutMs
  });

  if (!capture) throw new Error(`Capture ${clientCaptureKey} was not returned by the Supabase capture function.`);
  if (capture.analysis_state === "failed") {
    throw new Error(`Hosted extraction failed: ${capture.analysis_error || "unknown error"}`);
  }
  if (!terminalStates.has(capture.analysis_state)) {
    throw new Error(`Hosted extraction did not finish. Latest state: ${capture.analysis_state || "missing"}`);
  }
  const succeededRuns = Array.isArray(capture.analysis_runs)
    ? capture.analysis_runs.filter((run) => run.status === "succeeded")
    : [];
  const llmRan = capture.analysis_mode === "llm" || succeededRuns.length > 0;
  if (!llmRan) {
    throw new Error(`Expected hosted LLM evidence, got analysis_mode=${capture.analysis_mode || "missing"}`);
  }
  const intent = capture.analysis?.default_intent?.category || capture.default_intent || capture.current_save_intent;
  if (!intent) {
    throw new Error("Capture is missing structured default_intent output.");
  }

  await createSuggestedReminders({
    apiUrl,
    accessToken,
    capture
  });

  const [runs, reminders, reminderLinks, suggestions, assets] = await Promise.all([
    restRows({
      supabaseUrl,
      serviceRoleKey,
      table: "analysis_runs",
      params: { capture_id: `eq.${capture.id}`, status: "eq.succeeded", select: "id,model,provider,status" }
    }),
    restRows({
      supabaseUrl,
      serviceRoleKey,
      table: "reminders",
      params: { capture_id: `eq.${capture.id}`, select: "id,trigger_type,trigger_value,status,rationale" }
    }),
    restRows({
      supabaseUrl,
      serviceRoleKey,
      table: "reminder_captures",
      params: { capture_id: `eq.${capture.id}`, select: "reminder_id,capture_id" }
    }),
    restRows({
      supabaseUrl,
      serviceRoleKey,
      table: "reminder_suggestions",
      params: { capture_id: `eq.${capture.id}`, select: "id,trigger_type,trigger_value,rationale,confidence" }
    }),
    restRows({
      supabaseUrl,
      serviceRoleKey,
      table: "capture_assets",
      params: { capture_id: `eq.${capture.id}`, select: "id,mime_type,byte_size,storage_path" }
    })
  ]);

  if (!runs.length) throw new Error("No succeeded analysis_runs row was persisted.");
  if (options.image) {
    if (capture.capture_type !== "image") {
      throw new Error(`Expected image capture_type, got ${capture.capture_type || "missing"}.`);
    }
    if (!assets.length) throw new Error("No capture_assets row was persisted for the image fixture.");
    if (!String(assets[0].mime_type || "").startsWith("image/")) {
      throw new Error(`Expected image asset MIME type, got ${assets[0].mime_type || "missing"}.`);
    }
  }
  const persistedReminders = reminders.length + reminderLinks.length;
  if (!options.allowNoReminder && !persistedReminders) {
    throw new Error(
      `No reminders row was persisted. Suggestions found: ${JSON.stringify(suggestions).slice(0, 500)}`
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiUrl,
        clientCaptureKey,
        captureId: capture.id,
        state: capture.analysis_state,
        analysisMode: capture.analysis_mode,
        model: capture.analysis_model || succeededRuns[0]?.model,
        intent,
        assets: assets.length,
        reminders: persistedReminders,
        reminderSuggestions: suggestions.length,
        title: capture.display_title
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
