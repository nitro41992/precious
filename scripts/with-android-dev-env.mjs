import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

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

for (const path of [
  ".env",
  ".env.local",
  "../apps/mobile/.env",
  "../apps/mobile/.env.local",
  "../apps/web/.env",
  "../apps/web/.env.local"
]) {
  loadEnvFile(resolve(path));
}

if (!process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
}
if (!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
if (!process.env.PRECIOUS_API_URL && process.env.PRECIOUS_CAPTURE_FUNCTION_URL) {
  process.env.PRECIOUS_API_URL = process.env.PRECIOUS_CAPTURE_FUNCTION_URL.replace(/\/$/, "");
}

let cwd = process.cwd();
const args = process.argv.slice(2);
if (args[0] === "--cwd") {
  cwd = resolve(args[1] || ".");
  args.splice(0, 2);
}

if (!args.length) {
  console.error("Usage: node scripts/with-android-dev-env.mjs [--cwd path] <command> [args...]");
  process.exit(1);
}

const missing = ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"].filter(
  (name) => !process.env[name]
);
if (missing.length) {
  console.error(`Missing required Android dev environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const result = spawnSync(args[0], args.slice(1), {
  cwd,
  env: process.env,
  stdio: "inherit"
});

process.exit(result.status ?? 1);
