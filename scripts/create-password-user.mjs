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
  "../.env",
  "../.env.local",
  "../precious-captures/.env",
  "../precious-captures/.env.local",
  "../apps/mobile/.env",
  "../apps/mobile/.env.local",
  "../apps/web/.env",
  "../apps/web/.env.local"
].forEach((path) => loadEnvFile(resolve(path)));

function parseArgs() {
  const options = {};
  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (arg === "--email") options.email = process.argv[++index];
    else if (arg === "--password") options.password = process.argv[++index];
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

async function main() {
  const options = parseArgs();
  const email = options.email || process.env.PRECIOUS_DOGFOOD_EMAIL || process.env.PRECIOUS_E2E_EMAIL;
  const password =
    options.password || process.env.PRECIOUS_DOGFOOD_PASSWORD || process.env.PRECIOUS_E2E_PASSWORD;
  if (!email || !password) {
    throw new Error("Provide --email and --password, or set PRECIOUS_DOGFOOD_EMAIL/PRECIOUS_DOGFOOD_PASSWORD.");
  }

  const supabaseUrl = env("EXPO_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");

  const users = await requestJson(`${supabaseUrl}/auth/v1/admin/users?per_page=1000`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`
    }
  });
  const existing = users.users?.find(
    (user) => user.email?.toLowerCase() === email.toLowerCase()
  );

  const payload = {
    email,
    password,
    email_confirm: true,
    user_metadata: { source: "precious-captures-password-user" }
  };

  const user = existing
    ? await requestJson(`${supabaseUrl}/auth/v1/admin/users/${existing.id}`, {
        method: "PUT",
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      })
    : await requestJson(`${supabaseUrl}/auth/v1/admin/users`, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });

  console.log(
    JSON.stringify(
      {
        ok: true,
        id: user.id,
        email: user.email,
        confirmedAt: user.email_confirmed_at || user.confirmed_at || null
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
