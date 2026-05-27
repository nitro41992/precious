import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const TABLES = [
  "captures",
  "analysis_runs",
  "capture_assets"
];

const REMOVED_TABLES = [
  "captured_entities",
  "reminder_suggestions",
  "reminders",
  "collection_suggestions",
  "collections",
  "search_documents",
  "url_metadata",
  "reminder_captures",
  "capture_collections",
  "notification_deliveries",
  "notification_devices",
  "platform_evidence",
  "eval_runs",
  "eval_fixtures",
  "model_route_configs"
];

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

[".env", ".env.local"].forEach((path) => loadEnvFile(resolve(path)));

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
    throw new Error(`${init.method || "GET"} ${url} failed ${response.status}: ${text.slice(0, 500)}`);
  }
  return { response, json };
}

async function countTable(supabaseUrl, serviceRoleKey, table) {
  const url = `${supabaseUrl}/rest/v1/${table}?select=id`;
  const response = await fetch(url, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      prefer: "count=exact"
    }
  });
  if (!response.ok) return { table, error: `${response.status} ${await response.text()}` };
  return { table, count: Number(response.headers.get("content-range")?.split("/")?.[1] || 0) };
}

async function main() {
  const supabaseUrl = env("EXPO_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const headers = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`
  };

  const [{ json: userPayload }, tableCounts, bucketResult] = await Promise.all([
    requestJson(`${supabaseUrl}/auth/v1/admin/users?per_page=1000`, { headers }),
    Promise.all([...TABLES, ...REMOVED_TABLES].map((table) => countTable(supabaseUrl, serviceRoleKey, table))),
    requestJson(`${supabaseUrl}/storage/v1/bucket`, { headers }).catch((error) => ({ error: error.message }))
  ]);

  const users = (userPayload.users || []).map((user) => ({
    id: user.id,
    email: user.email,
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at,
    app_metadata: user.app_metadata,
    user_metadata: user.user_metadata
  }));

  console.log(JSON.stringify({ users, tableCounts, buckets: bucketResult.json || bucketResult }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
