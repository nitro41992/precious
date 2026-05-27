import { spawnSync } from "node:child_process";
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

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const match = supabaseUrl.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i);
if (!match) {
  console.error("Missing or invalid EXPO_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL.");
  process.exit(1);
}

const projectRef = match[1];
const result = spawnSync(
  "npx",
  ["supabase", "functions", "deploy", "capture-intake", "--project-ref", projectRef],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit"
  }
);

if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Deployed capture-intake to project ${projectRef}.`);
