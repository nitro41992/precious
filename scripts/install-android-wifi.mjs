#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const defaultApk = "android/app/build/outputs/apk/release/app-release.apk";
const packageActivity = "com.preciouscaptures/.MainActivity";
const adbEnv = {
  ...process.env,
  ADB_MDNS_AUTO_CONNECT: process.env.ADB_MDNS_AUTO_CONNECT || "0",
  ADB_MDNS_OPENSCREEN: process.env.ADB_MDNS_OPENSCREEN || "0"
};

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runAdb(args, options = {}) {
  const result = spawnSync("adb", args, {
    env: adbEnv,
    encoding: "utf8",
    timeout: options.timeoutMs || 30000,
    stdio: options.inherit ? "inherit" : "pipe"
  });
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  return {
    ok: result.status === 0 && !result.error,
    status: result.status,
    signal: result.signal,
    error: result.error,
    stdout,
    stderr,
    output: `${stdout}${stderr}`.trim()
  };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseDevices(output) {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /\sdevice(\s|$)/.test(line))
    .map((line) => line.split(/\s+/)[0]);
}

function connectedDevices() {
  const result = runAdb(["devices", "-l"], { timeoutMs: 15000 });
  if (!result.ok) return [];
  return parseDevices(result.stdout);
}

function parseMdnsConnectTargets(output) {
  const targets = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.includes("_adb-tls-connect._tcp")) continue;
    const match = line.match(/(\d{1,3}(?:\.\d{1,3}){3}:\d+)/);
    if (match) targets.push(match[1]);
  }
  return [...new Set(targets)].reverse();
}

function mdnsTargets() {
  const result = runAdb(["mdns", "services"], { timeoutMs: 15000 });
  if (!result.ok) return [];
  return parseMdnsConnectTargets(result.stdout);
}

function connectTarget(target) {
  const result = runAdb(["connect", target], { timeoutMs: 15000 });
  const text = result.output.toLowerCase();
  return result.ok && (text.includes(`connected to ${target}`) || text.includes(`already connected to ${target}`));
}

function chooseDevice(serialHint = "") {
  const current = connectedDevices();
  if (serialHint && current.includes(serialHint)) return serialHint;
  if (!serialHint && current.length === 1) return current[0];

  for (const target of mdnsTargets()) {
    if (serialHint && target !== serialHint) continue;
    console.log(`Connecting to ${target}...`);
    connectTarget(target);
    const afterConnect = connectedDevices();
    if (serialHint && afterConnect.includes(serialHint)) return serialHint;
    if (!serialHint && afterConnect.length === 1) return afterConnect[0];
    if (!serialHint && afterConnect.includes(target)) return target;
  }

  const afterMdns = connectedDevices();
  if (serialHint && afterMdns.includes(serialHint)) return serialHint;
  if (!serialHint && afterMdns.length === 1) return afterMdns[0];
  if (afterMdns.length > 1) {
    fail(`More than one adb device is connected. Re-run with --serial <device>.\n${afterMdns.join("\n")}`);
  }
  return "";
}

function wakeDevice(serial) {
  const wakeCommands = [
    ["shell", "input", "keyevent", "KEYCODE_WAKEUP"],
    ["shell", "wm", "dismiss-keyguard"],
    ["shell", "input", "keyevent", "82"]
  ];
  for (const args of wakeCommands) {
    runAdb(["-s", serial, ...args], { timeoutMs: 8000 });
  }
}

function installApk(serial, apkPath, attempt) {
  console.log(`Installing ${apkPath} on ${serial} (attempt ${attempt})...`);
  return runAdb(["-s", serial, "install", "--no-streaming", "-r", apkPath], {
    timeoutMs: 240000
  });
}

function launchApp(serial) {
  const result = runAdb(["-s", serial, "shell", "am", "start", "-n", packageActivity], {
    timeoutMs: 30000
  });
  if (!result.ok) {
    fail(`Install finished, but app launch failed:\n${result.output}`);
  }
}

const apkPath = resolve(argumentValue("--apk") || process.env.PRECIOUS_ANDROID_APK || defaultApk);
const serialHint = argumentValue("--serial") || process.env.ANDROID_SERIAL || "";
const attempts = Number(argumentValue("--attempts") || process.env.PRECIOUS_ANDROID_INSTALL_ATTEMPTS || 4);
const skipWake = hasFlag("--no-wake");

if (!existsSync(apkPath)) {
  fail(`APK not found: ${apkPath}\nBuild it first with npm run android:build:hosted.`);
}

let lastOutput = "";
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const serial = chooseDevice(serialHint);
  if (!serial) {
    lastOutput = "No adb device was connected or discoverable over Wireless Debugging.";
    console.warn(`${lastOutput} Retry ${attempt}/${attempts}.`);
    sleep(2500);
    continue;
  }

  if (!skipWake) wakeDevice(serial);
  const install = installApk(serial, apkPath, attempt);
  if (install.ok) {
    console.log(install.output || "Install succeeded.");
    launchApp(serial);
    console.log(`Installed and launched Precious Captures on ${serial}.`);
    process.exit(0);
  }

  lastOutput = install.output || String(install.error || "adb install failed");
  console.warn(lastOutput);
  if (/INSTALL_FAILED_UPDATE_INCOMPATIBLE|INSTALL_FAILED_VERSION_DOWNGRADE/.test(lastOutput)) break;
  runAdb(["disconnect"], { timeoutMs: 10000 });
  sleep(2500 * attempt);
}

fail(
  `Could not install over Wi-Fi after ${attempts} attempts.\n` +
    `${lastOutput}\n\n` +
    "Unlock the phone, keep Wireless Debugging open, and re-run npm run android:install:wifi."
);
