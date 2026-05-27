import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const configPath = resolve("supabase/functions/_shared/save-intents.json");
const intents = JSON.parse(readFileSync(configPath, "utf8"));

if (!Array.isArray(intents)) {
  throw new Error("save-intents.json must contain an array.");
}

const keys = new Set();
const activeKeys = [];

for (const [index, intent] of intents.entries()) {
  if (!intent || typeof intent !== "object") {
    throw new Error(`Intent at index ${index} must be an object.`);
  }
  const { key, label, llm_description: llmDescription, active } = intent;
  if (typeof key !== "string" || !/^[a-z][a-z0-9_]*$/.test(key)) {
    throw new Error(`Intent at index ${index} has an invalid key.`);
  }
  if (keys.has(key)) throw new Error(`Duplicate intent key: ${key}`);
  keys.add(key);
  if (key === "other") throw new Error("Intent key 'other' is not allowed.");
  if (typeof label !== "string" || !label.trim()) {
    throw new Error(`Intent '${key}' must have a label.`);
  }
  if (typeof llmDescription !== "string" || !llmDescription.trim()) {
    throw new Error(`Intent '${key}' must have an llm_description.`);
  }
  if (typeof active !== "boolean") {
    throw new Error(`Intent '${key}' must have a boolean active flag.`);
  }
  if (active) activeKeys.push(key);
}

if (!activeKeys.length) throw new Error("At least one intent must be active.");

console.log(`Validated ${intents.length} save intents (${activeKeys.length} active).`);
