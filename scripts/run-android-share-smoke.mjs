import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { loadEnvFiles } from "./load-env-files.mjs";

loadEnvFiles();

const commandEnv = {
  ...process.env,
  ADB_MDNS_AUTO_CONNECT: process.env.ADB_MDNS_AUTO_CONNECT || "0",
  ADB_MDNS_OPENSCREEN: process.env.ADB_MDNS_OPENSCREEN || "0"
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    env: commandEnv,
    stdio: "inherit",
    ...options
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const signal = result.signal ? ` signal ${result.signal}` : "";
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}${signal}`);
  }
}

const defaultCorpusPath = new URL("../test/fixtures/share-smoke-urls.txt", import.meta.url);

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function hostFromText(value) {
  const match = String(value || "").match(/https?:\/\/([^/\s]+)/i);
  if (!match) return "";
  return match[1].replace(/^www\./i, "");
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function urlWithSearchToken(url, marker) {
  const parsed = new URL(url);
  const existingHash = parsed.hash.replace(/^#/, "");
  parsed.hash = existingHash ? `${existingHash}-${marker}` : marker;
  return parsed.toString();
}

function env(name, fallbackName = "") {
  return (process.env[name] || (fallbackName ? process.env[fallbackName] : "") || "").replace(/\/$/, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${init.method || "GET"} ${url} failed ${response.status}: ${text.slice(0, 300)}`);
  }
  return json;
}

async function verificationHeaders() {
  const supabaseUrl = env("EXPO_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = env("EXPO_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const email = process.env.PRECIOUS_E2E_EMAIL || "precious-captures-e2e@example.com";
  const password = process.env.PRECIOUS_E2E_PASSWORD || "";

  if (!supabaseUrl) throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.");
  if (anonKey && password) {
    const session = await requestJson(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        "content-type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });
    if (!session?.access_token) throw new Error("Supabase auth did not return an access token.");
    return {
      supabaseUrl,
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${session.access_token}`
      }
    };
  }

  if (serviceRoleKey) {
    return {
      supabaseUrl,
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`
      }
    };
  }

  throw new Error("Missing PRECIOUS_E2E_PASSWORD or SUPABASE_SERVICE_ROLE_KEY for share smoke verification.");
}

async function pollSharedCapture({ expectedHost, token, timeoutMs = 120000 }) {
  const { supabaseUrl, headers } = await verificationHeaders();
  const deadline = Date.now() + timeoutMs;
  let lastRows = [];

  while (Date.now() < deadline) {
    const url = new URL(`${supabaseUrl}/rest/v1/captures`);
    url.searchParams.set("select", "id,source_text,source_url,display_title,analysis_state,created_at");
    url.searchParams.set("source_text", `ilike.*${token}*`);
    url.searchParams.set("order", "created_at.desc");
    url.searchParams.set("limit", "1");
    lastRows = await requestJson(url, { headers });
    const capture = Array.isArray(lastRows) ? lastRows[0] : null;
    const source = `${capture?.source_text || ""} ${capture?.source_url || ""}`.toLowerCase();
    if (capture && source.includes(token.toLowerCase()) && source.includes(expectedHost.toLowerCase())) {
      return capture;
    }
    await sleep(2500);
  }

  throw new Error(`Timed out waiting for shared capture containing ${expectedHost} and ${token}. Last rows: ${JSON.stringify(lastRows).slice(0, 500)}`);
}

function parseCorpusLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return "";
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      return String(parsed.url || parsed.URL || "");
    } catch {
      return "";
    }
  }
  const csvMatch = trimmed.match(/^\d+,\s*"?([^",\s]+)"?/);
  const candidate = (csvMatch ? csvMatch[1] : trimmed.split(/\s+/)[0]).replace(/^"|"$/g, "");
  if (/^https?:\/\//i.test(candidate)) return candidate;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(candidate)) return `https://${candidate}`;
  return "";
}

function loadUrlCorpus(path) {
  const raw = readFileSync(path, "utf8");
  const urls = raw
    .split(/\r?\n/)
    .map(parseCorpusLine)
    .filter(Boolean);
  const seen = new Set();
  return urls.filter((url) => {
    const key = url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function numberFromSeed(seed) {
  let value = 2166136261;
  for (const char of String(seed)) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function seededRandom(seed) {
  let state = numberFromSeed(seed);
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const explicitText = argumentValue("--text");
const explicitUrl = argumentValue("--url");
const corpusPath = argumentValue("--corpus") || process.env.PRECIOUS_SHARE_SMOKE_URL_CORPUS || defaultCorpusPath;
const seed = argumentValue("--seed") || process.env.PRECIOUS_SHARE_SMOKE_SEED || `${Date.now()}-${Math.random()}`;
const corpusUrls = explicitText || explicitUrl ? [] : loadUrlCorpus(corpusPath);
if (!corpusUrls.length && !explicitUrl && !explicitText) {
  throw new Error(`No URLs found in share smoke corpus: ${corpusPath}`);
}
const pickRandom = seededRandom(seed);
const randomUrl = corpusUrls[Math.floor(pickRandom() * corpusUrls.length)];
const selectedLink = explicitUrl
  ? {
      host: hostFromText(explicitUrl),
      label: "Custom real-world link",
      url: explicitUrl
    }
  : explicitText
    ? {
        host: hostFromText(explicitText),
        label: "Custom share text",
        url: explicitText
      }
  : {
      host: hostFromText(randomUrl),
      label: "Corpus real-world link",
      url: randomUrl
    };
const token = `sharesmoke${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const text = explicitText ? `${explicitText} ${token}` : urlWithSearchToken(selectedLink.url, token);
const expectedHost = hostFromText(text) || selectedLink.host;

if (!text) throw new Error("Missing value after --text.");
if (!expectedHost) throw new Error("The share smoke text must include an http(s) URL.");

run("adb", [
  "shell",
  "am",
  "force-stop",
  "com.preciouscaptures"
]);

run("adb", [
  "shell",
  [
    "am",
    "start",
    "-a",
    "android.intent.action.SEND",
    "-n",
    "com.preciouscaptures/.ShareIntakeActivity",
    "-t",
    "text/plain",
    "--es",
    "android.intent.extra.TEXT",
    shellQuote(text)
  ].join(" ")
]);

console.log(`Share smoke corpus: ${corpusPath}`);
console.log(`Share smoke corpus size: ${corpusUrls.length}`);
console.log(`Share smoke seed: ${seed}`);
console.log(`Share smoke URL: ${selectedLink.url}`);
console.log(`Share smoke label: ${selectedLink.label}`);
console.log(`Share smoke token: ${token}`);

run("adb", ["shell", "am", "start", "-W", "-n", "com.preciouscaptures/.MainActivity"]);

const capture = await pollSharedCapture({ expectedHost, token });
console.log(`Share smoke persisted ${expectedHost} as ${capture.analysis_state || "unknown"} (${capture.id}).`);
