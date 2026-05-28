import { spawnSync } from "node:child_process";
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
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

const text = process.argv.includes("--text")
  ? process.argv[process.argv.indexOf("--text") + 1]
  : `https://example.com/quiet-place-android-share-smoke-${Date.now()}`;

if (!text) throw new Error("Missing value after --text.");

run("adb", [
  "shell",
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
  text
]);

run("maestro", [
  "test",
  "-e",
  `PRECIOUS_E2E_EMAIL=${process.env.PRECIOUS_E2E_EMAIL || "precious-captures-e2e@example.com"}`,
  "-e",
  `PRECIOUS_E2E_PASSWORD=${process.env.PRECIOUS_E2E_PASSWORD || ""}`,
  "-e",
  `SHARE_SMOKE_TEXT=${text}`,
  "e2e/maestro-share-intake.yaml"
]);
