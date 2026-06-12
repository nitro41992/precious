// Shared end-to-end harness helpers for the Android device suites (Maestro smoke,
// animation validation). Centralizes Supabase auth, REST seeding, and the
// deep-link session seam so the device flows start already authenticated without
// driving the (un-automatable) magic-link / Google OAuth UI.
//
// SECURITY: the auth callback carries real session tokens for a throwaway E2E
// user. Never log the callback URL, and keep SUPABASE_SERVICE_ROLE_KEY (which
// bypasses RLS) in the gitignored .env.local — never in committed files or CI logs.

import { spawnSync } from "node:child_process";

export const APP_ID = "com.preciouscaptures";

export function run(label, command, args, options = {}) {
  const result = spawnSync(command, args, {
    env: options.env || process.env,
    stdio: options.capture ? "pipe" : "inherit",
    encoding: options.capture ? "utf8" : undefined
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
  return result;
}

export function runOptional(label, command, args, options = {}) {
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

export function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function envValue(env, name, fallbackName) {
  const value = env[name] || (fallbackName ? env[fallbackName] : "");
  if (!value) throw new Error(`Missing ${name}${fallbackName ? ` or ${fallbackName}` : ""}.`);
  return value.replace(/\/$/, "");
}

export async function requestJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${init.method || "GET"} ${url} failed ${response.status}: ${text.slice(0, 500)}`);
  }
  return json;
}

export function serviceHeaders(serviceRoleKey, extra = {}) {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    ...extra
  };
}

export async function restInsert({ supabaseUrl, serviceRoleKey, table, row }) {
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

// Resolve the Supabase project URL / anon / service-role keys from an env bag.
export function supabaseConfig(env) {
  return {
    supabaseUrl: envValue(env, "EXPO_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: envValue(env, "EXPO_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: envValue(env, "SUPABASE_SERVICE_ROLE_KEY")
  };
}

export async function signInForUser({ supabaseUrl, anonKey, email, password }) {
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

// Establish a real app session without driving the magic-link / OAuth UI: mint a
// session server-side, then hand it to the app via its auth-callback deep link.
export async function signInWithAuthCallback(env) {
  const { supabaseUrl, anonKey } = supabaseConfig(env);
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
  // Tokens live in the fragment; do not log this URL.
  const callbackUrl = `preciouscaptures://auth/callback#${callbackParams.toString()}`;
  run("Clear app state", "adb", ["shell", "pm", "clear", APP_ID], { env, capture: true });
  runOptional("Grant notification permission", "adb", [
    "shell",
    "pm",
    "grant",
    APP_ID,
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
    `${APP_ID}/.MainActivity`
  ], { env, capture: true });
  await delay(3000);
}

// Run a single Maestro flow with the E2E credentials in scope. The session is
// injected via signInWithAuthCallback beforehand, so flows never sign in via UI.
// `vars` are extra `${NAME}` substitutions (e.g. seeded ids/prefix) the flow can
// reference; credentials are always provided.
export function runMaestroFlow(label, flowPath, env, vars = {}) {
  const allVars = {
    PRECIOUS_E2E_EMAIL: env.PRECIOUS_E2E_EMAIL,
    PRECIOUS_E2E_PASSWORD: env.PRECIOUS_E2E_PASSWORD,
    ...vars
  };
  const varArgs = Object.entries(allVars).flatMap(([name, value]) => ["-e", `${name}=${value}`]);
  run(label, "maestro", ["test", ...varArgs, flowPath], { env });
}
