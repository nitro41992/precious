import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { normalizeExpectedLabel, uniqueStringList } from "./capture-eval-lib.mjs";

const defaultGoldPath =
  "eval/capture-accuracy/generated/silver-e2e-30-taxonomy-gold-labels.json";
const defaultCollectionsMapPath =
  "eval/capture-accuracy/generated/silver-e2e-30-gold-v2-20collections-map.json";
const defaultOutPath =
  "eval/capture-accuracy/generated/silver-e2e-30-gold-v2-20collections.json";

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function parseArgs() {
  return {
    goldPath: argValue("--gold", defaultGoldPath),
    collectionsMapPath: argValue("--collections-map", defaultCollectionsMapPath),
    outPath: argValue("--out", defaultOutPath),
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
  throw new Error("Gold file must be an array or { labels: [] }.");
}

function collectionMapFromJson(json) {
  const rows = Array.isArray(json) ? json : json.collections || json.rows || [];
  if (Array.isArray(rows)) {
    return new Map(rows.map((row) => [
      row.sample_id,
      uniqueStringList(row.collections || row.expected_collections || []),
    ]));
  }
  return new Map(
    Object.entries(rows && typeof rows === "object" ? rows : json).map(([sampleId, collections]) => [
      sampleId,
      uniqueStringList(collections),
    ]),
  );
}

function buildGoldV2(goldJson, collectionMap) {
  const labels = labelsFromJson(goldJson).map((label) => {
    const expected = normalizeExpectedLabel(label.expected || {});
    const collections = collectionMap.has(label.sample_id)
      ? collectionMap.get(label.sample_id)
      : expected.collections;
    return {
      ...label,
      label_type: "gold",
      label_variant: "v2_20collections",
      label_source: "gold_v2_20collections",
      expected: {
        ...expected,
        collections,
      },
    };
  });
  return {
    version: 1,
    label_type: "gold",
    label_variant: "v2_20collections",
    source_gold_path: goldJson.source_csv_path || "",
    generated_at: new Date().toISOString(),
    reviewed_count: labels.length,
    skipped_count: 0,
    labels,
  };
}

function main() {
  const options = parseArgs();
  const goldJson = readJson(options.goldPath);
  const collectionMap = collectionMapFromJson(readJson(options.collectionsMapPath));
  const output = buildGoldV2(goldJson, collectionMap);
  writeJson(options.outPath, output);
  console.log(JSON.stringify({
    ok: true,
    out: options.outPath,
    labels: output.labels.length,
    collection_overrides: collectionMap.size,
  }, null, 2));
}

main();
