import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnvFiles(paths = [
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
]) {
  for (const path of paths) {
    const resolved = resolve(path);
    if (!existsSync(resolved)) continue;
    for (const rawLine of readFileSync(resolved, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const index = line.indexOf("=");
      if (index === -1) continue;
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key && value && !process.env[key]) process.env[key] = value;
    }
  }
}
