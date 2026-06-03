import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildReviewQueue } from "./capture-eval-lib.mjs";

const defaultManifestPath = "eval/capture-accuracy/generated/exa-public-manifest.json";
const defaultPredictionsPath = "eval/capture-accuracy/generated/predictions.json";
const defaultSilverLabelsPath = "eval/capture-accuracy/generated/silver-labels.json";
const defaultOutPath = "eval/capture-accuracy/generated/review-queue.json";

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function parseArgs() {
  return {
    manifestPath: argValue("--manifest", defaultManifestPath),
    predictionsPath: argValue("--predictions", defaultPredictionsPath),
    silverLabelsPath: argValue("--silver-labels", defaultSilverLabelsPath),
    outPath: argValue("--out", defaultOutPath),
    markdownPath: argValue("--markdown", ""),
    csvPath: argValue("--csv", ""),
    lowConfidenceThreshold: Number(argValue("--low-confidence", "0.72")),
    agreementSampleRate: Number(argValue("--agreement-rate", "0.15")),
    seed: argValue("--seed", "capture-review-queue")
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

function writeText(path, value) {
  const resolved = resolve(path);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, value);
}

function samplesFromJson(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.samples)) return json.samples;
  return [];
}

function labelsFromJson(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.labels)) return json.labels;
  return [];
}

function reasonCounts(rows) {
  const counts = {};
  for (const row of rows) {
    for (const reason of row.reasons || []) {
      counts[reason] = (counts[reason] || 0) + 1;
    }
  }
  return counts;
}

function oneLine(value, fallback = "") {
  return String(value || fallback)
    .replace(/\s+/g, " ")
    .trim();
}

function itemText(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return value.name || value.title || value.label || value.value || JSON.stringify(value);
  }
  return String(value || "");
}

function listValue(value) {
  return Array.isArray(value) && value.length
    ? value.map(itemText).filter(Boolean).join(", ")
    : "none";
}

function cell(value, fallback = "blank") {
  const text = Array.isArray(value) ? listValue(value) : oneLine(value, fallback);
  return text
    .replace(/\|/g, "\\|")
    .replace(/`/g, "'")
    .slice(0, 240) || fallback;
}

function compactValue(value, fallback = "blank") {
  if (Array.isArray(value)) return listValue(value);
  if (value && typeof value === "object") return itemText(value) || fallback;
  return oneLine(value, fallback);
}

function comparableValue(value) {
  const text = compactValue(value, "").toLowerCase();
  return text === "none" ? "" : text;
}

function normalizedReminder(value) {
  const text = oneLine(value);
  if (!text || text === "none") return "none";
  return text === "suggested" ? "suggested" : "suggested";
}

function sameValue(left, right) {
  return comparableValue(left) === comparableValue(right);
}

function draftGoldValue(field, silver, prediction) {
  const silverValue = silver?.[field];
  const predictionValue = prediction?.[field];
  if (field === "reminder") {
    const silverReminder = normalizedReminder(silverValue);
    const predictedReminder = normalizedReminder(predictionValue);
    return silverReminder === predictedReminder ? silverReminder : "TODO";
  }
  if (sameValue(silverValue, predictionValue)) return compactValue(silverValue);
  if (field === "terminal_outcome" && ["failed", "rejected"].includes(predictionValue || "")) {
    return "TODO access decision";
  }
  return "TODO";
}

function reviewBucket(row) {
  const reasons = row.reasons || [];
  const terminal = row.prediction?.terminal_outcome || "";
  if (["failed", "rejected"].includes(terminal) || reasons.includes("disagreement:terminal_outcome")) {
    return "1. Terminal / Access";
  }
  if (reasons.some((reason) =>
    reason.includes("reminder") ||
    reason.includes("visit_target") ||
    reason === "date_time_reminder_case" ||
    reason === "location_only_false_reminder_risk"
  )) {
    return "2. Reminder / Visit Target";
  }
  if (reasons.some((reason) => reason.includes("save_intent") || reason.includes("collection"))) {
    return "3. Intent / Collections";
  }
  return "4. Content Quality";
}

function rowTitle(row) {
  return oneLine(row.source_title || row.prediction?.title || row.url || row.sample_id, row.sample_id)
    .slice(0, 120);
}

function csvEscape(value) {
  const text = Array.isArray(value)
    ? value.map(itemText).filter(Boolean).join("; ")
    : value && typeof value === "object"
      ? JSON.stringify(value)
      : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(values) {
  return values.map(csvEscape).join(",");
}

function predictedFieldValue(field, prediction) {
  if (field === "title_contains") return prediction.title;
  if (field === "summary_contains") return prediction.summary;
  return prediction[field];
}

function reviewRowsCsv(output) {
  const fields = [
    ["terminal_outcome", "terminal_outcome"],
    ["save_intent", "save_intent"],
    ["reminder", "reminder"],
    ["visit_target", "visit_target"],
    ["collections", "collections"],
    ["title_contains", "title_contains"],
    ["summary_contains", "summary_contains"],
    ["entities", "entities"]
  ];
  const header = [
    "sample_id",
    "bucket",
    "priority",
    "decision",
    "include_in_gold",
    "suitability",
    "suitability_reason",
    "reasons",
    "url",
    "source_title",
    "source_summary"
  ];
  for (const [, field] of fields) {
    header.push(`silver_${field}`, `precious_${field}`, `gold_${field}`);
  }
  header.push("silver_reminder_fields", "notes");

  const lines = [csvRow(header)];
  for (const row of output.rows) {
    const silver = row.silver_expected || {};
    const prediction = row.prediction || {};
    const values = [
      row.sample_id,
      reviewBucket(row),
      row.priority,
      "",
      "TRUE",
      row.suitability || "core",
      row.suitability_reason || "",
      listValue(row.reasons),
      row.url,
      row.source_title || "",
      row.source_summary || ""
    ];
    for (const [field] of fields) {
      values.push(
        compactValue(silver[field], ""),
        compactValue(predictedFieldValue(field, prediction), ""),
        draftGoldValue(field, silver, prediction)
      );
    }
    values.push(
      silver.reminder_fields && Object.keys(silver.reminder_fields).length
        ? JSON.stringify(silver.reminder_fields)
        : "",
      silver.notes || ""
    );
    lines.push(csvRow(values));
  }
  return `${lines.join("\n")}\n`;
}

function fieldComparisonRows(row) {
  const silver = row.silver_expected || {};
  const prediction = row.prediction || {};
  const fields = [
    ["terminal_outcome", "Terminal"],
    ["save_intent", "Intent"],
    ["reminder", "Reminder"],
    ["visit_target", "Visit target"],
    ["collections", "Collections"],
    ["title_contains", "Title"],
    ["summary_contains", "Summary"],
    ["entities", "Entities"]
  ];
  return fields.map(([field, label]) => {
    const predictedValue = field === "title_contains"
      ? prediction.title
      : field === "summary_contains"
        ? prediction.summary
        : prediction[field];
    const silverValue = silver[field];
    return `| ${label} | ${cell(silverValue)} | ${cell(predictedValue)} | \`${cell(draftGoldValue(field, silver, prediction))}\` |`;
  });
}

function reviewTemplate(row) {
  const silver = row.silver_expected || {};
  const prediction = row.prediction || {};
  const gold = {
    terminal_outcome: draftGoldValue("terminal_outcome", silver, prediction),
    save_intent: draftGoldValue("save_intent", silver, prediction),
    reminder: draftGoldValue("reminder", silver, prediction),
    visit_target: draftGoldValue("visit_target", silver, prediction),
    collections: draftGoldValue("collections", silver, prediction),
    access_state: silver.access_state || "",
    include_in_gold: true,
    notes: ""
  };
  return [
    "```yaml",
    "gold:",
    `  sample_id: ${row.sample_id}`,
    `  terminal_outcome: ${JSON.stringify(gold.terminal_outcome)}`,
    `  save_intent: ${JSON.stringify(gold.save_intent)}`,
    `  reminder: ${JSON.stringify(gold.reminder)}`,
    `  visit_target: ${JSON.stringify(gold.visit_target)}`,
    gold.collections.startsWith("TODO")
      ? "  collections: [] # TODO"
      : `  collections: ${JSON.stringify(gold.collections === "none" ? [] : gold.collections.split(", ").filter(Boolean))}`,
    `  access_state: ${JSON.stringify(gold.access_state)}`,
    `  include_in_gold: ${gold.include_in_gold}`,
    `  notes: ${JSON.stringify(gold.notes)}`,
    "```"
  ];
}

function groupedRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const bucket = reviewBucket(row);
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket).push(row);
  }
  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([bucket, bucketRows]) => [
      bucket,
      bucketRows.sort((left, right) => left.sample_id.localeCompare(right.sample_id))
    ]);
}

function reviewQueueMarkdown(output) {
  const lines = [
    "# Capture Eval Review Queue",
    "",
    `Generated: ${output.generated_at}`,
    `Rows: ${output.sample_count} (${output.review_count} review, ${output.spot_check_count} spot check)`,
    "",
    "## How To Mark Rows",
    "",
    "For each row, choose one overall decision, then edit any `TODO` values in the CSV or gold YAML block.",
    "",
    "The CSV is the easiest artifact to mark and can be converted into `gold-labels.json` with `npm run eval:review:gold:build`.",
    "",
    "- Use **Silver overall** when Gemini's label is the intended product behavior.",
    "- Use **Precious overall** when the app output is the intended product behavior.",
    "- Use **Hybrid** when some fields are right and others need editing.",
    "- Use **Exclude** when the row is unsuitable or the source evidence is too stale/ambiguous to score.",
    "",
    "Reminder gold values should be `suggested` or `none`; put exact dates in notes only.",
    "",
    "## Reason Counts",
    "",
    "| Reason | Count |",
    "| --- | ---: |"
  ];
  for (const [reason, count] of Object.entries(output.reason_counts || {})) {
    lines.push(`| ${reason} | ${count} |`);
  }

  lines.push("", "## Rows", "");
  let index = 1;
  for (const [bucket, bucketRows] of groupedRows(output.rows)) {
    lines.push(`## ${bucket}`, "");
    for (const row of bucketRows) {
      lines.push(`### ${index}. ${rowTitle(row)}`);
      lines.push("");
      lines.push(`ID: \`${row.sample_id}\` | [Open source](${row.url}) | ${row.priority}`);
      lines.push("");
      lines.push(`Reasons: ${listValue(row.reasons)}`);
      lines.push(`Suitability: ${row.suitability || "core"}${row.suitability_reason ? ` (${oneLine(row.suitability_reason)})` : ""}`);
      lines.push("");
      lines.push("Decision:");
      lines.push("");
      lines.push("- [ ] Silver overall");
      lines.push("- [ ] Precious overall");
      lines.push("- [ ] Hybrid / edit gold fields");
      lines.push("- [ ] Exclude from scoring");
      lines.push("");
      lines.push("| Field | Gemini silver | Precious output | Gold value to keep/edit |");
      lines.push("| --- | --- | --- | --- |");
      lines.push(...fieldComparisonRows(row));
      lines.push("");
      lines.push("Gold label block:");
      lines.push("");
      lines.push(...reviewTemplate(row));
      lines.push("");
      lines.push("<details>");
      lines.push("<summary>Evidence and notes</summary>");
      lines.push("");
      lines.push(`- Source title: ${oneLine(row.source_title, "n/a")}`);
      if (row.source_summary) lines.push(`- Source summary: ${oneLine(row.source_summary)}`);
      if (row.source_highlights?.length) {
        lines.push("- Source highlights:");
        for (const highlight of row.source_highlights) {
          lines.push(`  - ${oneLine(highlight).slice(0, 700)}`);
        }
      }
      if (row.silver_expected?.notes) lines.push(`- Silver notes: ${oneLine(row.silver_expected.notes)}`);
      if (row.silver_uncertainty_flags?.length) {
        lines.push(`- Silver uncertainty: ${listValue(row.silver_uncertainty_flags)}`);
      }
      lines.push(`- Precious confidence: ${oneLine(row.prediction?.confidence_label, "n/a")}`);
      lines.push(`- Precious review targets: ${listValue(row.prediction?.review_targets)}`);
      lines.push("</details>");
      lines.push("");
      index += 1;
    }
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs();
  const manifestSamples = samplesFromJson(readJson(options.manifestPath));
  const predictions = samplesFromJson(readJson(options.predictionsPath));
  const silverLabels = labelsFromJson(readJson(options.silverLabelsPath));
  const rows = buildReviewQueue(manifestSamples, predictions, silverLabels, {
    lowConfidenceThreshold: options.lowConfidenceThreshold,
    agreementSampleRate: options.agreementSampleRate,
    seed: options.seed
  });
  const output = {
    version: 1,
    generated_at: new Date().toISOString(),
    manifest_path: options.manifestPath,
    predictions_path: options.predictionsPath,
    silver_labels_path: options.silverLabelsPath,
    low_confidence_threshold: options.lowConfidenceThreshold,
    agreement_sample_rate: options.agreementSampleRate,
    seed: options.seed,
    sample_count: rows.length,
    review_count: rows.filter((row) => row.priority === "review").length,
    spot_check_count: rows.filter((row) => row.priority === "spot_check").length,
    reason_counts: reasonCounts(rows),
    rows
  };
  writeJson(options.outPath, output);
  const markdownPath = options.markdownPath || options.outPath.replace(/\.json$/i, ".md");
  const csvPath = options.csvPath || options.outPath.replace(/\.json$/i, ".csv");
  writeText(markdownPath, reviewQueueMarkdown(output));
  writeText(csvPath, reviewRowsCsv(output));
  console.log(JSON.stringify({
    ok: true,
    out: options.outPath,
    markdown: markdownPath,
    csv: csvPath,
    rows: output.sample_count,
    review: output.review_count,
    spot_check: output.spot_check_count
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
