import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  labelIsScorable,
  normalizeExpectedLabel,
  normalizeSuitability,
} from "./capture-eval-lib.mjs";

const defaultGoldPath =
  "eval/capture-accuracy/generated/silver-e2e-30-gold-v2-20collections.json";
const defaultGoldManifestPath =
  "eval/capture-accuracy/generated/silver-e2e-30-manifest.json";
const defaultSilverPath =
  "eval/capture-accuracy/generated/silver-e2e-100-labels.json";
const defaultSilverManifestPath =
  "eval/capture-accuracy/generated/silver-e2e-100-manifest.json";
const defaultOutLabelsPath =
  "eval/capture-accuracy/generated/combined-100-gold-v2-plus-silver-labels.json";
const defaultOutManifestPath =
  "eval/capture-accuracy/generated/combined-100-gold-v2-plus-silver-manifest.json";

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function parseArgs() {
  return {
    goldPath: argValue("--gold", defaultGoldPath),
    goldManifestPath: argValue("--gold-manifest", defaultGoldManifestPath),
    silverPath: argValue("--silver", defaultSilverPath),
    silverManifestPath: argValue("--silver-manifest", defaultSilverManifestPath),
    outLabelsPath: argValue("--out-labels", defaultOutLabelsPath),
    outManifestPath: argValue("--out-manifest", defaultOutManifestPath),
    target: Number(argValue("--target", "100")),
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
  throw new Error("Labels file must be an array or { labels: [] }.");
}

function samplesFromJson(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.samples)) return json.samples;
  throw new Error("Manifest file must be an array or { samples: [] }.");
}

function manifestSampleMap(...manifests) {
  const entries = [];
  for (const manifest of manifests) {
    for (const sample of samplesFromJson(manifest)) {
      entries.push([sample.sample_id, sample]);
    }
  }
  return new Map(entries);
}

function starterCollectionsFrom(...manifests) {
  for (const manifest of manifests) {
    if (Array.isArray(manifest?.starter_collections)) {
      return manifest.starter_collections;
    }
  }
  return [];
}

function combinedLabel(label, labelSource) {
  return {
    ...label,
    label_source: labelSource,
    expected: normalizeExpectedLabel(label.expected || {}),
    suitability: normalizeSuitability(label.suitability || label.expected?.suitability),
  };
}

function main() {
  const options = parseArgs();
  if (!Number.isInteger(options.target) || options.target <= 0) {
    throw new Error("--target must be a positive integer.");
  }
  const goldJson = readJson(options.goldPath);
  const goldManifest = readJson(options.goldManifestPath);
  const silverJson = readJson(options.silverPath);
  const silverManifest = readJson(options.silverManifestPath);
  const sampleById = manifestSampleMap(goldManifest, silverManifest);

  const labels = [];
  const selectedIds = new Set();
  for (const label of labelsFromJson(goldJson)) {
    const next = combinedLabel(label, "gold_v2_20collections");
    if (!labelIsScorable(next) || selectedIds.has(next.sample_id)) continue;
    labels.push(next);
    selectedIds.add(next.sample_id);
  }
  for (const label of labelsFromJson(silverJson)) {
    if (labels.length >= options.target) break;
    const next = combinedLabel(label, "silver");
    if (!labelIsScorable(next) || selectedIds.has(next.sample_id)) continue;
    labels.push(next);
    selectedIds.add(next.sample_id);
  }
  if (labels.length !== options.target) {
    throw new Error(`Could only build ${labels.length} scorable labels for target ${options.target}.`);
  }

  const samples = labels.map((label, index) => {
    const sample = sampleById.get(label.sample_id);
    if (!sample) throw new Error(`Missing manifest sample for ${label.sample_id}.`);
    return {
      ...sample,
      ordinal: index + 1,
      label_source: label.label_source,
    };
  });
  const starterCollections = starterCollectionsFrom(silverManifest, goldManifest);
  writeJson(options.outManifestPath, {
    version: 1,
    source: "combined_gold_v2_20collections_plus_silver",
    generated_at: new Date().toISOString(),
    target_samples: options.target,
    selected_count: samples.length,
    starter_collections: starterCollections,
    samples,
  });
  writeJson(options.outLabelsPath, {
    version: 1,
    label_type: "combined",
    label_policy: "gold_v2_20collections_plus_silver",
    generated_at: new Date().toISOString(),
    target_labels: options.target,
    gold_labels_path: options.goldPath,
    silver_labels_path: options.silverPath,
    manifest_path: options.outManifestPath,
    labels,
  });
  console.log(JSON.stringify({
    ok: true,
    labels: labels.length,
    gold: labels.filter((label) => label.label_source === "gold_v2_20collections").length,
    silver: labels.filter((label) => label.label_source === "silver").length,
    out_labels: options.outLabelsPath,
    out_manifest: options.outManifestPath,
  }, null, 2));
}

main();
