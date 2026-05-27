import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_KEEP_EMAIL = "nitro41992@gmail.com";
const TABLE_DELETE_ORDER = [
  "analysis_runs",
  "capture_assets",
  "captures",
  "search_documents",
  "collection_suggestions",
  "collections",
  "reminders",
  "reminder_suggestions",
  "captured_entities",
  "url_metadata"
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

function parseArgs() {
  const options = { keepEmail: DEFAULT_KEEP_EMAIL, yes: false };
  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (arg === "--yes") options.yes = true;
    else if (arg === "--keep-email") options.keepEmail = process.argv[++index];
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
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
    throw new Error(`${init.method || "GET"} ${url} failed ${response.status}: ${text.slice(0, 500)}`);
  }
  return json;
}

async function deleteTableRows(supabase, table) {
  const { error } = await supabase.from(table).delete().not("id", "is", null);
  if (error && !/Could not find the table|schema cache|does not exist/i.test(error.message || "")) {
    throw error;
  }
  return error ? "missing" : "cleared";
}

async function listStoragePaths(bucket, prefix = "") {
  const { data, error } = await bucket.list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error) {
    if (/not found|does not exist/i.test(error.message || "")) return [];
    throw error;
  }
  const paths = [];
  for (const item of data || []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id) paths.push(path);
    else paths.push(...(await listStoragePaths(bucket, path)));
  }
  return paths;
}

async function main() {
  const options = parseArgs();
  if (!options.yes) {
    throw new Error(`Refusing to reset hosted data without --yes. Keeping only ${options.keepEmail}.`);
  }

  const keepEmail = options.keepEmail.toLowerCase();
  const supabaseUrl = env("EXPO_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const headers = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`
  };
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const bucket = supabase.storage.from("captures");
  const storagePaths = await listStoragePaths(bucket);
  if (storagePaths.length) {
    const { error } = await bucket.remove(storagePaths);
    if (error) throw error;
  }

  const tableResults = {};
  for (const table of TABLE_DELETE_ORDER) {
    tableResults[table] = await deleteTableRows(supabase, table);
  }

  const usersPayload = await requestJson(`${supabaseUrl}/auth/v1/admin/users?per_page=1000`, { headers });
  const users = usersPayload.users || [];
  const keepUser = users.find((user) => user.email?.toLowerCase() === keepEmail);
  if (!keepUser) throw new Error(`Keep user ${keepEmail} was not found; refusing to delete auth users.`);

  const deletedUsers = [];
  for (const user of users) {
    if (user.email?.toLowerCase() === keepEmail) continue;
    await requestJson(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, { method: "DELETE", headers });
    deletedUsers.push({ id: user.id, email: user.email });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        keptUser: { id: keepUser.id, email: keepUser.email },
        deletedUsers,
        deletedStorageObjects: storagePaths.length,
        tableResults
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
