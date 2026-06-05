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
  "../.env",
  "../.env.local",
  "../precious-captures/.env",
  "../precious-captures/.env.local"
].forEach((path) => loadEnvFile(resolve(path)));

const result = spawnSync("npx", ["supabase", "db", "push", "--linked"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit"
});

if (result.status !== 0) process.exit(result.status ?? 1);
