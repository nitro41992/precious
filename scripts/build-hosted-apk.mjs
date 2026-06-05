import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
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

if (!process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
}
if (!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
if (!process.env.PRECIOUS_API_URL && process.env.PRECIOUS_CAPTURE_FUNCTION_URL) {
  process.env.PRECIOUS_API_URL = process.env.PRECIOUS_CAPTURE_FUNCTION_URL.replace(/\/$/, "");
}

const missing = ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"].filter(
  (name) => !process.env[name]
);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl)) {
  console.error(`EXPO_PUBLIC_SUPABASE_URL must be a hosted Supabase URL. Current value: ${supabaseUrl}`);
  process.exit(1);
}

if (process.env.PRECIOUS_API_URL && !/^https:\/\/.+\/functions\/v1\//i.test(process.env.PRECIOUS_API_URL)) {
  console.error(`PRECIOUS_API_URL must be a Supabase Edge Function URL. Current value: ${process.env.PRECIOUS_API_URL}`);
  process.exit(1);
}

if (!process.env.JAVA_HOME && existsSync("/opt/homebrew/opt/openjdk@17")) {
  process.env.JAVA_HOME = "/opt/homebrew/opt/openjdk@17";
}

const androidDir = resolve("android");
for (const path of [
  "app/build/generated/assets/react/release",
  "app/build/generated/res/react/release",
  "app/build/intermediates/sourcemaps/react/release"
]) {
  rmSync(resolve(androidDir, path), { force: true, recursive: true });
}

const gradle = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const result = spawnSync(gradle, [":app:assembleRelease", "--stacktrace", "--no-daemon"], {
  cwd: androidDir,
  env: process.env,
  stdio: "inherit"
});

if (result.status !== 0) process.exit(result.status ?? 1);

const apkPath = resolve(androidDir, "app/build/outputs/apk/release/app-release.apk");
if (!existsSync(apkPath)) {
  console.error("Release build finished, but the APK was not found at the expected path.");
  process.exit(1);
}

console.log(`Hosted APK ready: ${apkPath}`);
