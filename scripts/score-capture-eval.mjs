import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  scoreCaptureEvaluation,
  scoreReportMarkdown
} from "./capture-eval-lib.mjs";

const defaultPredictionsPath = "eval/capture-accuracy/generated/predictions.json";
const defaultLabelsPath = "eval/capture-accuracy/generated/labels.json";
const defaultSilverLabelsPath = "eval/capture-accuracy/generated/silver-labels.json";
const defaultOutPath = "eval/capture-accuracy/generated/score.json";
const defaultMarkdownPath = "eval/capture-accuracy/generated/score.md";

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function parseArgs() {
  return {
    predictionsPath: argValue("--predictions", defaultPredictionsPath),
    labelsPath: argValue("--labels", defaultLabelsPath),
    silverLabelsPath: argValue("--silver-labels", defaultSilverLabelsPath),
    outPath: argValue("--out", defaultOutPath),
    markdownPath: argValue("--markdown", defaultMarkdownPath)
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function writeText(path, value) {
  const resolved = resolve(path);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, value);
}

function labelsFromJson(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.labels)) return json.labels;
  throw new Error("Labels file must be an array or { labels: [] }.");
}

function samplesFromJson(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.samples)) return json.samples;
  throw new Error("Predictions file must be an array or { samples: [] }.");
}

function main() {
  const options = parseArgs();
  const predictions = readJson(options.predictionsPath);
  const labels = readJson(options.labelsPath);
  const silverLabels = existsSync(resolve(options.silverLabelsPath))
    ? labelsFromJson(readJson(options.silverLabelsPath))
    : [];
  const score = scoreCaptureEvaluation(
    samplesFromJson(predictions),
    labelsFromJson(labels),
    silverLabels
  );
  const output = {
    version: 1,
    scored_at: new Date().toISOString(),
    predictions_path: options.predictionsPath,
    labels_path: options.labelsPath,
    silver_labels_path: silverLabels.length ? options.silverLabelsPath : "",
    run_id: predictions.run_id || "",
    score
  };
  writeText(options.outPath, `${JSON.stringify(output, null, 2)}\n`);
  writeText(options.markdownPath, scoreReportMarkdown(score, { run_id: output.run_id }));
  console.log(
    JSON.stringify(
      {
        ok: true,
        out: options.outPath,
        markdown: options.markdownPath,
        samples: score.gold.sample_count,
        gold_labeled: score.gold.labeled_sample_count,
        gold_failures: score.gold.failures.length,
        silver_labeled: score.silver_agreement?.labeled_sample_count || 0,
        silver_failures: score.silver_agreement?.failures.length || 0
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
