import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  normalizeExpectedLabel,
  normalizeReminderValue,
  normalizeSuitability,
  uniqueStringList
} from "./capture-eval-lib.mjs";

const defaultReviewCsvPath = "eval/capture-accuracy/generated/review-queue.csv";
const defaultSilverLabelsPath = "eval/capture-accuracy/generated/silver-labels.json";
const defaultOutPath = "eval/capture-accuracy/generated/gold-labels.json";

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function parseArgs() {
  return {
    csvPath: argValue("--csv", defaultReviewCsvPath),
    silverLabelsPath: argValue("--silver-labels", defaultSilverLabelsPath),
    outPath: argValue("--out", defaultOutPath),
    reviewer: argValue("--reviewer", "human")
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function writeJson(path, value) {
  const resolved = resolve(path);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`);
}

function labelsFromJson(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.labels)) return json.labels;
  return [];
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => String(cell).trim()));
}

function rowsFromCsv(text) {
  const rows = parseCsv(text);
  const header = rows.shift() || [];
  return rows.map((cells) => Object.fromEntries(
    header.map((name, index) => [name, cells[index] ?? ""])
  ));
}

function boolValue(value, fallback = true) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return fallback;
  if (["true", "yes", "y", "1"].includes(text)) return true;
  if (["false", "no", "n", "0"].includes(text)) return false;
  return fallback;
}

function cleanDraft(value) {
  const text = String(value ?? "").trim();
  return /^todo\b/i.test(text) ? "" : text;
}

function parseList(value) {
  const text = cleanDraft(value);
  if (!text || text === "none") return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return uniqueStringList(parsed);
  } catch {
    // Fall through to delimiter parsing.
  }
  return uniqueStringList(text.split(/[;,]/).map((item) => item.trim()));
}

function setStringField(expected, field, value) {
  const text = cleanDraft(value);
  if (text) expected[field] = text === "blank" ? "" : text;
}

function setListField(expected, field, value) {
  const list = parseList(value);
  if (list.length || cleanDraft(value) === "none") expected[field] = list;
}

function baseExpectedForDecision(row, silverLabel) {
  const decision = String(row.decision || "").trim().toLowerCase();
  if (decision.startsWith("silver")) return { ...normalizeExpectedLabel(silverLabel?.expected || {}) };
  return { ...normalizeExpectedLabel({}) };
}

function preciousFallback(row, field) {
  return cleanDraft(row[`precious_${field}`]);
}

function goldValue(row, field) {
  return cleanDraft(row[`gold_${field}`]);
}

function applyFieldValues(row, expected) {
  const decision = String(row.decision || "").trim().toLowerCase();
  const usePrecious = decision.startsWith("precious");
  const stringFields = ["terminal_outcome", "save_intent", "visit_target"];
  for (const field of stringFields) {
    setStringField(expected, field, goldValue(row, field) || (usePrecious ? preciousFallback(row, field) : ""));
  }

  const reminderText = goldValue(row, "reminder") || (usePrecious ? preciousFallback(row, "reminder") : "");
  if (reminderText) {
    const reminder = normalizeReminderValue(reminderText);
    expected.reminder = reminder.reminder;
    expected.reminder_fields = reminder.fields;
  }

  for (const field of ["collections", "entities", "title_contains", "summary_contains"]) {
    const value = goldValue(row, field) || (usePrecious ? preciousFallback(row, field) : "");
    if (value) setListField(expected, field, value);
  }

  if (row.silver_reminder_fields && !Object.keys(expected.reminder_fields || {}).length) {
    try {
      const parsed = JSON.parse(row.silver_reminder_fields);
      if (parsed && typeof parsed === "object") expected.reminder_fields = parsed;
    } catch {
      expected.reminder_fields = { raw_text: row.silver_reminder_fields };
    }
  }

  expected.notes = cleanDraft(row.notes) || expected.notes || "";
  return normalizeExpectedLabel(expected);
}

function buildLabels(rows, silverLabels, reviewer) {
  const silverById = new Map(silverLabels.map((label) => [label.sample_id, label]));
  const labels = [];
  const skipped = [];
  const errors = [];
  const reviewedAt = new Date().toISOString();

  for (const row of rows) {
    const sampleId = String(row.sample_id || "").trim();
    if (!sampleId) continue;
    const decision = String(row.decision || "").trim().toLowerCase();
    if (!decision) {
      skipped.push({ sample_id: sampleId, reason: "blank_decision" });
      continue;
    }
    const includeInGold = boolValue(row.include_in_gold, true) && !decision.startsWith("exclude");
    const silver = silverById.get(sampleId);
    const expected = applyFieldValues(row, baseExpectedForDecision(row, silver));
    const requiresEditedGold = decision.startsWith("hybrid") || decision.includes("edit");
    if (includeInGold && requiresEditedGold && /^todo\b/i.test([
      row.gold_terminal_outcome,
      row.gold_save_intent,
      row.gold_reminder,
      row.gold_visit_target,
      row.gold_collections
    ].join(" "))) {
      errors.push({ sample_id: sampleId, reason: "unresolved_todo_primary_field" });
      continue;
    }
    labels.push({
      sample_id: sampleId,
      url: row.url || silver?.url || "",
      stratum: silver?.stratum || "",
      source_kind: silver?.source_kind || "",
      coverage_tags: silver?.coverage_tags || [],
      expected_collections: silver?.expected_collections || [],
      expected_reminder_surface: silver?.expected_reminder_surface || "",
      expected_visit_target_surface: silver?.expected_visit_target_surface || "",
      label_type: "gold",
      reviewer,
      reviewed_at: reviewedAt,
      decision,
      suitability: includeInGold ? normalizeSuitability(row.suitability || silver?.suitability) : "exclude",
      suitability_reason: row.suitability_reason || silver?.suitability_reason || "",
      include_in_gold: includeInGold,
      expected
    });
  }

  if (errors.length) {
    const details = errors.map((error) => `${error.sample_id}: ${error.reason}`).join("; ");
    throw new Error(`Cannot build gold labels with unresolved review fields. ${details}`);
  }
  return { labels, skipped };
}

function main() {
  const options = parseArgs();
  const rows = rowsFromCsv(readFileSync(resolve(options.csvPath), "utf8"));
  const silverLabels = labelsFromJson(readJson(options.silverLabelsPath));
  const { labels, skipped } = buildLabels(rows, silverLabels, options.reviewer);
  writeJson(options.outPath, {
    version: 1,
    label_type: "gold",
    source_csv_path: options.csvPath,
    silver_labels_path: options.silverLabelsPath,
    generated_at: new Date().toISOString(),
    reviewed_count: labels.length,
    skipped_count: skipped.length,
    skipped,
    labels
  });
  console.log(JSON.stringify({
    ok: true,
    out: options.outPath,
    reviewed: labels.length,
    skipped: skipped.length
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
