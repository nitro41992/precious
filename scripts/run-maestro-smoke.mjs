import { spawnSync } from "node:child_process";
import { loadEnvFiles } from "./load-env-files.mjs";

loadEnvFiles();

const email = process.env.PRECIOUS_E2E_EMAIL || "precious-captures-e2e@example.com";
const password = process.env.PRECIOUS_E2E_PASSWORD;
const env = {
  ...process.env,
  ADB_MDNS_AUTO_CONNECT: process.env.ADB_MDNS_AUTO_CONNECT || "0",
  ADB_MDNS_OPENSCREEN: process.env.ADB_MDNS_OPENSCREEN || "0"
};

if (!password) throw new Error("Missing PRECIOUS_E2E_PASSWORD for Maestro smoke tests.");

const result = spawnSync(
  "maestro",
  [
    "test",
    "-e",
    `PRECIOUS_E2E_EMAIL=${email}`,
    "-e",
    `PRECIOUS_E2E_PASSWORD=${password}`,
    ".maestro/00-sign-in.yaml",
    ".maestro/01-manual-capture.yaml",
    ".maestro/02-collections.yaml"
  ],
  { env, stdio: "inherit" }
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
