import { createHash } from "node:crypto";

export const terminalOutcomes = new Set([
  "ready",
  "needs_review",
  "failed",
  "rejected"
]);

export const primaryScoreMetrics = [
  "terminal_outcome",
  "save_intent",
  "reminder",
  "visit_target",
  "collections"
];

export const secondaryScoreMetrics = [
  "title_contains",
  "summary_contains",
  "entities",
  "location_context"
];

export const suitabilityValues = new Set(["core", "edge", "exclude"]);

export const starterCollections = [
  {
    title: "Recipes",
    description:
      "Dishes, cooking ideas, restaurant-inspired meals, grocery notes, and kitchen tips you may want to find again."
  },
  {
    title: "Movies & Shows",
    description:
      "Films, series, trailers, reviews, and recommendations about movies, shows, performers, and media titles."
  },
  {
    title: "Restaurants & Cafes",
    description:
      "Named restaurants, cafes, bars, bakeries, dining maps/place links, menus, reviews, and food-place lists. Prefer this over Local Activities for concrete places to eat or drink."
  },
  {
    title: "Products",
    description:
      "Clothing, gifts, gear, home items, tools, and comparisons you are considering or want to revisit."
  },
  {
    title: "Articles & Guides",
    description:
      "Long reads, how-tos, explainers, reference pages, and practical guides saved for later use."
  }
];

export const starterCollectionTitles = starterCollections.map((collection) => collection.title);

export const evalStarterCollections20 = [
  ...starterCollections,
  {
    title: "Events & Tickets",
    description:
      "Specific time-bound events, concerts, workshops, performances, ticket pages, event schedules, venues for an event, and attendable activities. Not for regular places or attractions merely because hours or admission are mentioned."
  },
  {
    title: "Travel & Trips",
    description:
      "Trip planning, destinations, hotels, itineraries, travel logistics, attractions, city guides, and saved ideas for future travel."
  },
  {
    title: "Fitness & Health",
    description:
      "Workouts, wellness routines, physical therapy, health advice, medical admin, classes, recovery, and fitness gear or habits."
  },
  {
    title: "Home & DIY",
    description:
      "Home projects, repairs, decor, cleaning, gardening, organization, crafts, tools, and do-it-yourself build instructions."
  },
  {
    title: "Books & Reading",
    description:
      "Books, authors, reading lists, literary recommendations, articles about books, bookstores, and things to read later."
  },
  {
    title: "Music & Podcasts",
    description:
      "Songs, albums, artists, playlists, concerts as media interest, podcast episodes, audio shows, and listening recommendations."
  },
  {
    title: "Software & Apps",
    description:
      "Apps, app-store listings, SaaS products, software tools, developer libraries, GitHub repositories, technical docs, and software workflows, even when the app is about restaurants, media, travel, or shopping."
  },
  {
    title: "Design Inspiration",
    description:
      "Visual references, UI patterns, interiors, fashion looks, brand systems, creative direction, and aesthetic examples to revisit."
  },
  {
    title: "Work & Career",
    description:
      "Professional development, job search, management, business operations, productivity, workplace skills, and career planning."
  },
  {
    title: "Personal Finance",
    description:
      "Budgeting, taxes, investing, insurance, banking, deals with financial decisions, subscriptions, and money administration."
  },
  {
    title: "Parenting & Family",
    description:
      "Childcare, school, family logistics, activities for kids, parenting advice, family purchases, and household coordination."
  },
  {
    title: "Beauty & Skincare",
    description:
      "Skincare routines, cosmetics, haircare, beauty products, dermatology tips, grooming advice, and product recommendations."
  },
  {
    title: "Local Activities",
    description:
      "Nearby non-dining, non-ticketed things to do such as museums, parks, pop-ups, seasonal outings, and neighborhood ideas. Prefer more specific Collections for restaurants, events, travel, fitness, courses, products, or apps."
  },
  {
    title: "Gift Ideas",
    description:
      "Potential gifts, wishlists, presents for specific people, holiday shopping ideas, and thoughtful items to consider later."
  },
  {
    title: "Classes & Courses",
    description:
      "Courses, workshops, tutorials, lessons, training programs, educational events, and skill-building opportunities to enroll in."
  }
];

export const defaultCoverageQuotas = {
  has_date_time: 50,
  location_only: 25,
  google_maps_location: 15,
  starter_collection_fit: Object.fromEntries(
    starterCollectionTitles.map((title) => [title, 25])
  ),
  ambiguous_negative: 20
};

export function numberFromSeed(seed) {
  let value = 2166136261;
  for (const char of String(seed)) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function seededRandom(seed) {
  let state = numberFromSeed(seed);
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function deterministicShuffle(values, seed) {
  const random = seededRandom(seed);
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function stableSampleId(value, prefix = "cap") {
  return `${prefix}_${createHash("sha256").update(String(value)).digest("hex").slice(0, 12)}`;
}

export function hostFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function canonicalUrlKey(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "igsh",
      "si",
      "_t",
      "_r"
    ];
    for (const param of trackingParams) url.searchParams.delete(param);
    url.searchParams.sort();
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return String(value || "").trim().toLowerCase();
  }
}

export function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return normalizeText(item);
      if (item && typeof item === "object") {
        return normalizeText(item.name || item.title || item.label || item.value);
      }
      return "";
    })
    .filter(Boolean);
}

export function uniqueStringList(value) {
  const input = Array.isArray(value) ? value : value ? [value] : [];
  const seen = new Set();
  const output = [];
  for (const item of input) {
    const text = String(item || "").trim();
    const key = normalizeText(text);
    if (!text || seen.has(key)) continue;
    seen.add(key);
    output.push(text);
  }
  return output;
}

export function normalizeLocationContext(value = {}) {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  const coordinates = input.coordinates && typeof input.coordinates === "object"
    ? input.coordinates
    : {};
  const latitude = Number(coordinates.latitude);
  const longitude = Number(coordinates.longitude);
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
  const awayValue = input.is_destination_away_from_user;
  return {
    place_name: String(input.place_name || "").trim(),
    address: String(input.address || "").trim(),
    city: String(input.city || "").trim(),
    region: String(input.region || "").trim(),
    country: String(input.country || "").trim(),
    coordinates: hasCoordinates ? { latitude, longitude } : null,
    source_destination: String(input.source_destination || "").trim(),
    is_destination_away_from_user: typeof awayValue === "boolean" ? awayValue : null,
    travel_context_reason: String(input.travel_context_reason || "").trim()
  };
}

function locationContextEntries(value = {}) {
  const normalized = normalizeLocationContext(value);
  const entries = [];
  for (const field of [
    "place_name",
    "address",
    "city",
    "region",
    "country",
    "source_destination",
    "travel_context_reason"
  ]) {
    if (normalized[field]) entries.push(`${field}:${normalizeText(normalized[field])}`);
  }
  if (normalized.coordinates) {
    entries.push(
      `coordinates:${normalized.coordinates.latitude.toFixed(6)},${normalized.coordinates.longitude.toFixed(6)}`
    );
  }
  if (
    typeof normalized.is_destination_away_from_user === "boolean" &&
    (normalized.source_destination || normalized.travel_context_reason)
  ) {
    entries.push(`is_destination_away_from_user:${normalized.is_destination_away_from_user}`);
  }
  return entries;
}

export function dedupeCandidates(candidates) {
  const seen = new Set();
  const deduped = [];
  for (const candidate of candidates) {
    const key = canonicalUrlKey(candidate.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...candidate, canonical_key: key });
  }
  return deduped;
}

function queryCoverageTags(querySpec) {
  return uniqueStringList([
    ...(querySpec.coverage_tags || []),
    ...(querySpec.tags || [])
  ]);
}

function queryExpectedCollections(querySpec) {
  return uniqueStringList(querySpec.expected_collections || []);
}

function hasCoverageTag(sample, tag) {
  return Array.isArray(sample.coverage_tags) && sample.coverage_tags.includes(tag);
}

function sampleMatchesCoverageSpec(sample, spec) {
  if (spec.kind === "tag") return hasCoverageTag(sample, spec.tag);
  if (spec.kind === "collection") {
    return uniqueStringList(sample.expected_collections).some((collection) =>
      normalizeText(collection) === normalizeText(spec.collection)
    );
  }
  return false;
}

export function coverageSpecsFromQuotas(coverageQuotas = {}) {
  const quotas = coverageQuotas || {};
  const specs = [];
  for (const tag of [
    "has_date_time",
    "location_only",
    "google_maps_location",
    "ambiguous_negative"
  ]) {
    const quota = Number(quotas[tag] || 0);
    if (quota > 0) specs.push({ kind: "tag", tag, quota });
  }
  const starterFit = quotas.starter_collection_fit || {};
  for (const collection of Object.keys(starterFit)) {
    const quota = Number(starterFit[collection] || 0);
    if (quota > 0) specs.push({ kind: "collection", collection, quota });
  }
  return specs;
}

export function coverageCounts(samples, coverageQuotas = defaultCoverageQuotas) {
  const specs = coverageSpecsFromQuotas(coverageQuotas);
  const counts = {};
  for (const spec of specs) {
    const key = spec.kind === "collection"
      ? `starter_collection_fit:${spec.collection}`
      : spec.tag;
    counts[key] = samples.filter((sample) => sampleMatchesCoverageSpec(sample, spec)).length;
  }
  return counts;
}

export function coverageShortfalls(samples, coverageQuotas = defaultCoverageQuotas) {
  const shortfalls = [];
  for (const spec of coverageSpecsFromQuotas(coverageQuotas)) {
    const selected = samples.filter((sample) => sampleMatchesCoverageSpec(sample, spec)).length;
    if (selected >= spec.quota) continue;
    shortfalls.push({
      kind: "coverage",
      coverage: spec.kind === "collection" ? "starter_collection_fit" : spec.tag,
      collection: spec.collection || "",
      quota: spec.quota,
      selected,
      missing: spec.quota - selected
    });
  }
  return shortfalls;
}

export function selectDeterministicSamples(candidates, strata, target, seed, coverageQuotas = {}) {
  const deduped = dedupeCandidates(candidates);
  const selected = [];
  const selectedKeys = new Set();
  const shortfalls = [];

  const selectMatching = ({ spec, quota, seedPart, shortfall }) => {
    const current = spec
      ? selected.filter((sample) => sampleMatchesCoverageSpec(sample, spec)).length
      : 0;
    const needed = Math.max(quota - current, 0);
    if (!needed) return;
    const availableSlots = Math.max(target - selected.length, 0);
    const pool = deduped.filter((candidate) =>
      !selectedKeys.has(candidate.canonical_key) &&
      sampleMatchesCoverageSpec(candidate, spec)
    );
    const picked = deterministicShuffle(pool, `${seed}:${seedPart}`)
      .slice(0, Math.min(needed, availableSlots));
    for (const candidate of picked) {
      selected.push(candidate);
      selectedKeys.add(candidate.canonical_key);
    }
    if (picked.length < needed) {
      shortfalls.push({
        ...shortfall,
        quota,
        selected: current + picked.length,
        missing: needed - picked.length
      });
    }
  };

  for (const spec of coverageSpecsFromQuotas(coverageQuotas)) {
    selectMatching({
      spec,
      quota: spec.quota,
      seedPart: spec.kind === "collection"
        ? `coverage:starter_collection_fit:${spec.collection}`
        : `coverage:${spec.tag}`,
      shortfall: {
        kind: "coverage",
        coverage: spec.kind === "collection" ? "starter_collection_fit" : spec.tag,
        collection: spec.collection || ""
      }
    });
  }

  for (const stratum of strata) {
    const quota = Number(stratum.quota || 0);
    if (!quota) continue;
    const current = selected.filter((candidate) => candidate.stratum === stratum.id).length;
    const needed = Math.max(quota - current, 0);
    const availableSlots = Math.max(target - selected.length, 0);
    const pool = deduped.filter((candidate) =>
      candidate.stratum === stratum.id && !selectedKeys.has(candidate.canonical_key)
    );
    const picked = deterministicShuffle(pool, `${seed}:${stratum.id}`)
      .slice(0, Math.min(needed, availableSlots));
    for (const candidate of picked) {
      selected.push(candidate);
      selectedKeys.add(candidate.canonical_key);
    }
    if (picked.length < needed) {
      shortfalls.push({
        kind: "stratum",
        stratum: stratum.id,
        quota,
        selected: current + picked.length,
        missing: needed - picked.length
      });
    }
  }

  if (selected.length < target) {
    const remaining = deterministicShuffle(
      deduped.filter((candidate) => !selectedKeys.has(candidate.canonical_key)),
      `${seed}:quota-fill`
    );
    for (const candidate of remaining) {
      if (selected.length >= target) break;
      selected.push(candidate);
      selectedKeys.add(candidate.canonical_key);
    }
  }

  return {
    selected: selected.slice(0, target),
    shortfalls: [
      ...shortfalls,
      ...coverageShortfalls(selected.slice(0, target), coverageQuotas)
        .filter((shortfall) => !shortfalls.some((existing) =>
          existing.kind === shortfall.kind &&
          existing.coverage === shortfall.coverage &&
          existing.collection === shortfall.collection
        ))
    ],
    coverage_counts: coverageCounts(selected.slice(0, target), coverageQuotas),
    candidate_count: candidates.length,
    deduped_count: deduped.length
  };
}

export function normalizeExaResponseResults(response, stratum, querySpec, generatedAt) {
  const statusById = new Map();
  for (const status of Array.isArray(response?.statuses) ? response.statuses : []) {
    const key = String(status.id || status.url || "");
    if (key) statusById.set(key, status);
  }

  return (Array.isArray(response?.results) ? response.results : [])
    .map((result) => {
      const url = String(result.url || result.id || "").trim();
      if (!/^https?:\/\//i.test(url)) return null;
      const status = statusById.get(String(result.id || "")) ||
        statusById.get(url) ||
        null;
      return {
        source_kind: "exa_public",
        sample_id: stableSampleId(`${stratum.id}:${url}`),
        generated_at: generatedAt,
        stratum: stratum.id,
        stratum_label: stratum.label || stratum.id,
        query_id: querySpec.id || stableSampleId(querySpec.query, "query"),
        query: querySpec.query,
        coverage_tags: queryCoverageTags(querySpec),
        expected_collections: queryExpectedCollections(querySpec),
        expected_reminder_surface: querySpec.expected_reminder_surface || "",
        expected_visit_target_surface: querySpec.expected_visit_target_surface || "",
        url,
        domain: hostFromUrl(url),
        exa_id: result.id || "",
        exa_title: result.title || "",
        exa_author: result.author || "",
        exa_published_date: result.publishedDate || result.published_date || "",
        exa_score: Number.isFinite(Number(result.score)) ? Number(result.score) : null,
        exa_image: result.image || "",
        exa_highlights: Array.isArray(result.highlights) ? result.highlights : [],
        exa_summary: result.summary || "",
        exa_text_excerpt: result.text ? String(result.text).slice(0, 1200) : "",
        exa_image_links: Array.isArray(result.imageLinks)
          ? result.imageLinks
          : Array.isArray(result.extras?.imageLinks)
            ? result.extras.imageLinks
            : [],
        exa_status: status?.status || "unknown",
        exa_error: status?.error?.tag || status?.error?.message || ""
      };
    })
    .filter(Boolean);
}

export function labelTemplateForSample(sample) {
  return {
    sample_id: sample.sample_id,
    url: sample.url,
    stratum: sample.stratum,
    coverage_tags: uniqueStringList(sample.coverage_tags),
    expected_collections: uniqueStringList(sample.expected_collections),
    expected_reminder_surface: sample.expected_reminder_surface || "",
    expected_visit_target_surface: sample.expected_visit_target_surface || "",
    reviewer: "",
    reviewed_at: "",
    expected: {
      terminal_outcome: "",
      save_intent: "",
      entities: [],
      visit_target: "",
      reminder: "",
      reminder_fields: {},
      collections: [],
      location_context: normalizeLocationContext(),
      title_contains: [],
      summary_contains: [],
      access_state: "",
      notes: ""
    },
    suitability: "core",
    suitability_reason: "",
    include_in_gold: true
  };
}

export function predictionFromCapture(capture) {
  const analysis = capture?.analysis && typeof capture.analysis === "object"
    ? capture.analysis
    : {};
  const defaultIntent = analysis.default_intent && typeof analysis.default_intent === "object"
    ? analysis.default_intent.category
    : null;
  const rejected = Boolean(capture?.rejected_at || analysis.capture_state === "rejected" || capture?.analysis_mode === "contextless_rejected");
  const terminalOutcome = rejected ? "rejected" : String(capture?.analysis_state || "");
  const reminderCount = Array.isArray(analysis.suggested_reminders)
    ? analysis.suggested_reminders.length
    : 0;
  const linkedCollectionTitles = Array.isArray(analysis.linked_collections)
    ? analysis.linked_collections
      .map((collection) => collection?.title || collection?.collection_title)
      .filter(Boolean)
    : [];
  const decisionCollectionTitles = Array.isArray(analysis.collection_decisions)
    ? analysis.collection_decisions
      .map((decision) => decision?.title || decision?.collection_title)
      .filter(Boolean)
    : [];
  const collectionTitles = uniqueStringList([
    ...linkedCollectionTitles,
    ...decisionCollectionTitles
  ]);

  return {
    terminal_outcome: terminalOutcome,
    save_intent: defaultIntent || capture?.default_intent || capture?.current_save_intent || "",
    entities: Array.isArray(analysis.entities)
      ? analysis.entities.map((entity) => ({
        type: entity?.type || entity?.entity_type || "",
        name: entity?.name || entity?.display_name || entity?.title || ""
      })).filter((entity) => entity.name)
      : [],
    visit_target: analysis.visit_target_name || analysis.visit_target_query || "",
    location_context: normalizeLocationContext(analysis.location_context || {}),
    reminder: reminderCount > 0 ? "suggested" : "none",
    collections: collectionTitles,
    capture_role: analysis.capture_role || "",
    title: analysis.display_title || capture?.display_title || capture?.title || "",
    summary: analysis.summary || "",
    confidence_label: analysis.confidence_label || "",
    url_evidence_status: analysis.url_evidence?.status || "",
    url_evidence_quality: analysis.url_evidence?.evidence_quality || "",
    review_targets: Array.isArray(analysis.review_targets) ? analysis.review_targets : []
  };
}

function isMissingLabelValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return locationContextEntries(value).length === 0;
  }
  return value === undefined || value === null || value === "" ||
    (Array.isArray(value) && value.length === 0);
}

function hasScoredLabel(expected) {
  return [
    expected.terminal_outcome,
    expected.save_intent,
    expected.visit_target,
    expected.reminder,
    expected.location_context,
    expected.title_contains,
    expected.summary_contains,
    expected.entities,
    expected.collections
  ].some((value) => !isMissingLabelValue(value));
}

export function exactMetric(expected, predicted) {
  if (isMissingLabelValue(expected)) return null;
  const expectedText = normalizeText(expected);
  const predictedText = normalizeText(predicted);
  const normalizedExpected = expectedText === "none" ? "" : expectedText;
  const normalizedPredicted = predictedText === "none" ? "" : predictedText;
  return normalizedExpected === normalizedPredicted;
}

export function containsMetric(expectedParts, predicted) {
  const parts = Array.isArray(expectedParts) ? expectedParts : [expectedParts];
  const normalizedPredicted = normalizeText(predicted);
  const expected = parts.map(normalizeText).filter(Boolean);
  if (!expected.length) return null;
  return expected.every((part) => normalizedPredicted.includes(part));
}

export function setStats(expectedValue, predictedValue) {
  const expected = new Set(normalizeStringList(expectedValue));
  if (!expected.size) return null;
  const predicted = new Set(normalizeStringList(predictedValue));
  let truePositive = 0;
  for (const value of predicted) {
    if (expected.has(value)) truePositive += 1;
  }
  return {
    tp: truePositive,
    fp: Math.max(predicted.size - truePositive, 0),
    fn: Math.max(expected.size - truePositive, 0),
    exact: truePositive === expected.size && predicted.size === expected.size
  };
}

export function locationContextStats(expectedValue, predictedValue) {
  const expected = new Set(locationContextEntries(expectedValue));
  if (!expected.size) return null;
  const predicted = new Set(locationContextEntries(predictedValue));
  let truePositive = 0;
  for (const value of predicted) {
    if (expected.has(value)) truePositive += 1;
  }
  return {
    tp: truePositive,
    fp: Math.max(predicted.size - truePositive, 0),
    fn: Math.max(expected.size - truePositive, 0),
    exact: truePositive === expected.size && predicted.size === expected.size
  };
}

function emptyMetric() {
  return { total: 0, correct: 0 };
}

function emptySetMetric() {
  return { total: 0, exact: 0, tp: 0, fp: 0, fn: 0 };
}

function addExactMetric(metrics, name, result) {
  if (result === null) return;
  metrics[name].total += 1;
  if (result) metrics[name].correct += 1;
}

function addSetMetric(metrics, name, result) {
  if (result === null) return;
  metrics[name].total += 1;
  metrics[name].tp += result.tp;
  metrics[name].fp += result.fp;
  metrics[name].fn += result.fn;
  if (result.exact) metrics[name].exact += 1;
}

export function metricSummary(metric) {
  if ("correct" in metric) {
    return {
      ...metric,
      accuracy: metric.total ? metric.correct / metric.total : null
    };
  }
  const precisionDenominator = metric.tp + metric.fp;
  const recallDenominator = metric.tp + metric.fn;
  return {
    ...metric,
    exact_accuracy: metric.total ? metric.exact / metric.total : null,
    precision: precisionDenominator ? metric.tp / precisionDenominator : null,
    recall: recallDenominator ? metric.tp / recallDenominator : null
  };
}

export function normalizeReminderValue(value, reminderFields = {}) {
  const rawText = String(value ?? "").trim();
  const normalized = normalizeText(rawText);
  const fields = reminderFields && typeof reminderFields === "object" && !Array.isArray(reminderFields)
    ? Object.fromEntries(
      Object.entries(reminderFields)
        .filter(([, fieldValue]) => fieldValue !== undefined && fieldValue !== null && fieldValue !== "")
        .map(([key, fieldValue]) => [key, Array.isArray(fieldValue)
          ? fieldValue.map((item) => String(item)).filter(Boolean)
          : String(fieldValue)])
    )
    : {};
  if (!rawText) {
    return { reminder: "", fields };
  }
  if (normalized === "none" || normalized === "no" || normalized === "false") {
    return { reminder: "none", fields };
  }
  if (normalized === "suggested" || normalized === "yes" || normalized === "true") {
    return { reminder: "suggested", fields };
  }
  return {
    reminder: "suggested",
    fields: {
      raw_text: rawText,
      ...fields
    }
  };
}

export function normalizeSuitability(value) {
  const normalized = normalizeText(value).replace(/\s+/g, "_");
  if (normalized === "excluded" || normalized === "unsuitable") return "exclude";
  if (suitabilityValues.has(normalized)) return normalized;
  return "core";
}

export function labelIsScorable(label) {
  if (!label) return false;
  if (label.include_in_gold === false) return false;
  return normalizeSuitability(label.suitability || label.expected?.suitability) !== "exclude";
}

export function normalizeExpectedLabel(value = {}) {
  const expected = value || {};
  const reminder = normalizeReminderValue(expected.reminder, expected.reminder_fields);
  return {
    terminal_outcome: String(expected.terminal_outcome || ""),
    save_intent: String(expected.save_intent || ""),
    entities: Array.isArray(expected.entities) ? expected.entities : [],
    visit_target: String(expected.visit_target || ""),
    reminder: reminder.reminder,
    reminder_fields: reminder.fields,
    collections: Array.isArray(expected.collections) ? expected.collections : [],
    location_context: normalizeLocationContext(expected.location_context),
    title_contains: Array.isArray(expected.title_contains) ? expected.title_contains : [],
    summary_contains: Array.isArray(expected.summary_contains) ? expected.summary_contains : [],
    access_state: String(expected.access_state || ""),
    notes: String(expected.notes || "")
  };
}

export function predictionExpectedComparisons(prediction, expected) {
  const normalizedExpected = normalizeExpectedLabel(expected);
  return {
    terminal_outcome: exactMetric(normalizedExpected.terminal_outcome, prediction.terminal_outcome),
    save_intent: exactMetric(normalizedExpected.save_intent, prediction.save_intent),
    visit_target: exactMetric(normalizedExpected.visit_target, prediction.visit_target),
    reminder: exactMetric(normalizedExpected.reminder, prediction.reminder),
    title_contains: containsMetric(normalizedExpected.title_contains, prediction.title),
    summary_contains: containsMetric(normalizedExpected.summary_contains, prediction.summary),
    entities: setStats(normalizedExpected.entities, prediction.entities),
    location_context: locationContextStats(
      normalizedExpected.location_context,
      prediction.location_context
    ),
    collections: setStats(normalizedExpected.collections, prediction.collections)
  };
}

export function comparisonFailures(comparisons) {
  return Object.entries(comparisons)
    .filter(([, result]) => result === false || (result && typeof result === "object" && !result.exact))
    .map(([name]) => name);
}

export function emptyScoreMetrics() {
  return {
    terminal_outcome: emptyMetric(),
    save_intent: emptyMetric(),
    visit_target: emptyMetric(),
    reminder: emptyMetric(),
    title_contains: emptyMetric(),
    summary_contains: emptyMetric(),
    entities: emptySetMetric(),
    location_context: emptySetMetric(),
    collections: emptySetMetric()
  };
}

export function scoreCapturePredictions(samples, labels) {
  const labelById = new Map(labels.map((label) => [label.sample_id, label]));
  const overall = emptyScoreMetrics();
  const byStratum = new Map();
  const bySuitability = new Map();
  const failures = [];
  const terminalDiagnostics = {
    by_outcome: {},
    by_domain: {},
    errors: []
  };
  let labeledSamples = 0;
  let excludedLabels = 0;

  for (const sample of samples) {
    const label = labelById.get(sample.sample_id);
    if (!label?.expected) continue;
    if (!labelIsScorable(label)) {
      excludedLabels += 1;
      continue;
    }
    if (!hasScoredLabel(label.expected)) continue;
    labeledSamples += 1;
    const prediction = sample.prediction || predictionFromCapture(sample.capture || sample);
    const stratum = sample.stratum || label.stratum || "unknown";
    const suitability = normalizeSuitability(label.suitability || label.expected?.suitability);
    if (!byStratum.has(stratum)) byStratum.set(stratum, emptyScoreMetrics());
    if (!bySuitability.has(suitability)) bySuitability.set(suitability, emptyScoreMetrics());
    const stratumMetrics = byStratum.get(stratum);
    const suitabilityMetrics = bySuitability.get(suitability);
    const comparisons = predictionExpectedComparisons(prediction, label.expected);
    const exactChecks = [
      ["terminal_outcome", comparisons.terminal_outcome],
      ["save_intent", comparisons.save_intent],
      ["visit_target", comparisons.visit_target],
      ["reminder", comparisons.reminder],
      ["title_contains", comparisons.title_contains],
      ["summary_contains", comparisons.summary_contains]
    ];
    const setChecks = [
      ["entities", comparisons.entities],
      ["location_context", comparisons.location_context],
      ["collections", comparisons.collections]
    ];

    const outcome = prediction.terminal_outcome || "unknown";
    const domain = hostFromUrl(sample.url || label.url || "") || "unknown";
    terminalDiagnostics.by_outcome[outcome] = (terminalDiagnostics.by_outcome[outcome] || 0) + 1;
    if (["failed", "rejected", "needs_review"].includes(outcome)) {
      if (!terminalDiagnostics.by_domain[domain]) terminalDiagnostics.by_domain[domain] = {};
      terminalDiagnostics.by_domain[domain][outcome] =
        (terminalDiagnostics.by_domain[domain][outcome] || 0) + 1;
      if (sample.error || sample.capture?.analysis_error) {
        terminalDiagnostics.errors.push({
          sample_id: sample.sample_id,
          domain,
          outcome,
          error: sample.error || sample.capture?.analysis_error || ""
        });
      }
    }

    for (const [name, result] of exactChecks) {
      addExactMetric(overall, name, result);
      addExactMetric(stratumMetrics, name, result);
      addExactMetric(suitabilityMetrics, name, result);
      if (result === false) {
        failures.push({
          sample_id: sample.sample_id,
          stratum,
          suitability,
          metric: name,
          expected: label.expected[name],
          predicted: prediction[name],
          url: sample.url || label.url || ""
        });
      }
    }
    for (const [name, result] of setChecks) {
      addSetMetric(overall, name, result);
      addSetMetric(stratumMetrics, name, result);
      addSetMetric(suitabilityMetrics, name, result);
      if (result && !result.exact) {
        failures.push({
          sample_id: sample.sample_id,
          stratum,
          suitability,
          metric: name,
          expected: label.expected[name],
          predicted: prediction[name],
          url: sample.url || label.url || ""
        });
      }
    }
  }

  const summarizeGroup = (metrics) =>
    Object.fromEntries(
      Object.entries(metrics).map(([name, metric]) => [name, metricSummary(metric)])
    );

  return {
    sample_count: samples.length,
    labeled_sample_count: labeledSamples,
    excluded_label_count: excludedLabels,
    overall: summarizeGroup(overall),
    primary_overall: Object.fromEntries(
      primaryScoreMetrics.map((name) => [name, metricSummary(overall[name])])
    ),
    secondary_overall: Object.fromEntries(
      secondaryScoreMetrics.map((name) => [name, metricSummary(overall[name])])
    ),
    by_stratum: Object.fromEntries(
      Array.from(byStratum.entries()).map(([name, metrics]) => [name, summarizeGroup(metrics)])
    ),
    by_suitability: Object.fromEntries(
      Array.from(bySuitability.entries()).map(([name, metrics]) => [name, summarizeGroup(metrics)])
    ),
    terminal_diagnostics: terminalDiagnostics,
    failures
  };
}

function labelMap(labels) {
  return new Map((labels || []).map((label) => [label.sample_id, label]));
}

function predictionBySample(samples) {
  return new Map((samples || []).map((sample) => [
    sample.sample_id,
    sample.prediction || predictionFromCapture(sample.capture || sample)
  ]));
}

function coverageCollectionTitles(samples, labels) {
  const titles = uniqueStringList([
    ...starterCollectionTitles,
    ...(samples || []).flatMap((sample) => sample.starter_collections || [])
      .map((collection) => collection?.title || collection),
    ...(samples || []).flatMap((sample) => sample.expected_collections || []),
    ...(labels || []).flatMap((label) => label.expected_collections || []),
    ...(labels || []).flatMap((label) => label.expected?.collections || [])
  ]);
  return titles;
}

function scoreCoverage(samples, labels) {
  const labelById = labelMap(labels);
  const predictionById = predictionBySample(samples);
  const collectionTitles = coverageCollectionTitles(samples, labels);
  const groups = {
    reminder_cases: { sample_count: 0, predicted_suggested: 0, expected_suggested: 0 },
    visit_target_cases: { sample_count: 0, predicted_present: 0, expected_present: 0 },
    structured_location_context: { sample_count: 0, predicted_present: 0, expected_present: 0 },
    google_maps_location_links: { sample_count: 0, predicted_visit_target: 0 },
    location_only_no_reminder: { sample_count: 0, false_reminder_predictions: 0 },
    starter_collection_fit: Object.fromEntries(
      collectionTitles.map((title) => [
        title,
        { sample_count: 0, predicted_match: 0, expected_match: 0 }
      ])
    )
  };

  for (const sample of samples || []) {
    const label = labelById.get(sample.sample_id);
    if (!label || !labelIsScorable(label)) continue;
    const expected = normalizeExpectedLabel(label?.expected || {});
    const prediction = predictionById.get(sample.sample_id) || {};
    const coverageTags = uniqueStringList(sample.coverage_tags || label?.coverage_tags);
    const expectedCollections = uniqueStringList(
      sample.expected_collections?.length ? sample.expected_collections : label?.expected_collections
    );
    const hasReminderCase = coverageTags.includes("has_date_time") ||
      Boolean(sample.expected_reminder_surface || label?.expected_reminder_surface) ||
      expected.reminder === "suggested";
    const hasVisitCase = coverageTags.includes("location_only") ||
      coverageTags.includes("google_maps_location") ||
      Boolean(sample.expected_visit_target_surface || label?.expected_visit_target_surface) ||
      !isMissingLabelValue(expected.visit_target);
    const hasLocationContextCase = !isMissingLabelValue(expected.location_context);

    if (hasReminderCase) {
      groups.reminder_cases.sample_count += 1;
      if (prediction.reminder === "suggested") groups.reminder_cases.predicted_suggested += 1;
      if (expected.reminder === "suggested") groups.reminder_cases.expected_suggested += 1;
    }
    if (hasVisitCase) {
      groups.visit_target_cases.sample_count += 1;
      if (!isMissingLabelValue(prediction.visit_target)) groups.visit_target_cases.predicted_present += 1;
      if (!isMissingLabelValue(expected.visit_target) && normalizeText(expected.visit_target) !== "none") {
        groups.visit_target_cases.expected_present += 1;
      }
    }
    if (hasLocationContextCase) {
      groups.structured_location_context.sample_count += 1;
      if (!isMissingLabelValue(prediction.location_context)) {
        groups.structured_location_context.predicted_present += 1;
      }
      if (!isMissingLabelValue(expected.location_context)) {
        groups.structured_location_context.expected_present += 1;
      }
    }
    if (coverageTags.includes("google_maps_location")) {
      groups.google_maps_location_links.sample_count += 1;
      if (!isMissingLabelValue(prediction.visit_target)) {
        groups.google_maps_location_links.predicted_visit_target += 1;
      }
    }
    if (coverageTags.includes("location_only")) {
      groups.location_only_no_reminder.sample_count += 1;
      if (prediction.reminder === "suggested" && expected.reminder !== "suggested") {
        groups.location_only_no_reminder.false_reminder_predictions += 1;
      }
    }
    for (const collection of collectionTitles) {
      if (!expectedCollections.some((value) => normalizeText(value) === normalizeText(collection))) {
        continue;
      }
      const group = groups.starter_collection_fit[collection];
      group.sample_count += 1;
      if (normalizeStringList(prediction.collections).includes(normalizeText(collection))) {
        group.predicted_match += 1;
      }
      if (normalizeStringList(expected.collections).includes(normalizeText(collection))) {
        group.expected_match += 1;
      }
    }
  }

  return groups;
}

export function scoreCaptureEvaluation(samples, goldLabels, silverLabels = []) {
  return {
    gold: scoreCapturePredictions(samples, goldLabels),
    silver_agreement: silverLabels.length
      ? scoreCapturePredictions(samples, silverLabels)
      : null,
    coverage: scoreCoverage(samples, goldLabels?.length ? goldLabels : silverLabels)
  };
}

export function formatPercent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "n/a";
}

function scoreSectionMarkdown(score, title) {
  const lines = [
    `## ${title}`,
    "",
    `Samples: ${score.sample_count}`,
    `Labeled samples: ${score.labeled_sample_count}`,
    `Excluded labels: ${score.excluded_label_count || 0}`,
    "",
  ];

  const addMetricTable = (heading, metrics) => {
    lines.push(`### ${heading}`, "");
    lines.push("| Metric | Count | Accuracy | Precision | Recall |");
    lines.push("| --- | ---: | ---: | ---: | ---: |");
    for (const [name, metric] of Object.entries(metrics || {})) {
      lines.push([
        `| ${name}`,
        metric.total ?? 0,
        formatPercent(metric.accuracy ?? metric.exact_accuracy),
        formatPercent(metric.precision),
        `${formatPercent(metric.recall)} |`
      ].join(" | "));
    }
    lines.push("");
  };

  if (score.primary_overall || score.secondary_overall) {
    addMetricTable("Primary Product Metrics", score.primary_overall || {});
    addMetricTable("Secondary Diagnostics", score.secondary_overall || {});
  } else {
    addMetricTable("Metrics", score.overall || {});
  }

  if (score.by_suitability && Object.keys(score.by_suitability).length) {
    lines.push("### Suitability Breakdown", "");
    for (const [suitability, metrics] of Object.entries(score.by_suitability)) {
      const terminal = metrics.terminal_outcome || {};
      const intent = metrics.save_intent || {};
      const collections = metrics.collections || {};
      lines.push(
        `- ${suitability}: terminal ${formatPercent(terminal.accuracy)}, intent ${formatPercent(intent.accuracy)}, collections exact ${formatPercent(collections.exact_accuracy)}`
      );
    }
    lines.push("");
  }

  if (score.terminal_diagnostics?.by_outcome) {
    lines.push("### Terminal Diagnostics", "");
    lines.push(Object.entries(score.terminal_diagnostics.by_outcome)
      .map(([outcome, count]) => `${outcome}: ${count}`)
      .join("; ") || "No terminal outcomes.");
    lines.push("");
  }

  lines.push(`### ${title} Failures`, "");
  if (!score.failures.length) {
    lines.push("No labeled failures.");
  } else {
    for (const failure of score.failures.slice(0, 100)) {
      lines.push(`- ${failure.sample_id} ${failure.metric}: expected ${JSON.stringify(failure.expected)}; got ${JSON.stringify(failure.predicted)} (${failure.url})`);
    }
    if (score.failures.length > 100) {
      lines.push(`- ${score.failures.length - 100} additional failures omitted.`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function coverageReportMarkdown(coverage) {
  if (!coverage) return "";
  const structuredLocation = coverage.structured_location_context || {
    sample_count: 0,
    predicted_present: 0
  };
  const lines = [
    "## Coverage",
    "",
    `Reminder cases: ${coverage.reminder_cases.sample_count} (${coverage.reminder_cases.predicted_suggested} predicted suggested)`,
    `Visit Target cases: ${coverage.visit_target_cases.sample_count} (${coverage.visit_target_cases.predicted_present} predicted present)`,
    `Structured location context: ${structuredLocation.sample_count} (${structuredLocation.predicted_present} predicted present)`,
    `Google Maps/location links: ${coverage.google_maps_location_links.sample_count} (${coverage.google_maps_location_links.predicted_visit_target} predicted Visit Targets)`,
    `Location-only no-reminder checks: ${coverage.location_only_no_reminder.sample_count} (${coverage.location_only_no_reminder.false_reminder_predictions} false Reminder predictions)`,
    "",
    "| Starter Collection | Coverage rows | Expected match | Predicted match |",
    "| --- | ---: | ---: | ---: |"
  ];
  for (const [title, group] of Object.entries(coverage.starter_collection_fit || {})) {
    lines.push(`| ${title} | ${group.sample_count} | ${group.expected_match} | ${group.predicted_match} |`);
  }
  return `${lines.join("\n")}\n`;
}

export function scoreReportMarkdown(score, metadata = {}) {
  if (score.gold) {
    const lines = [
      "# Capture Accuracy Eval",
      "",
      `Run: ${metadata.run_id || "unknown"}`,
      "",
      scoreSectionMarkdown(score.gold, "Gold Accuracy").trimEnd()
    ];
    if (score.silver_agreement) {
      lines.push("", scoreSectionMarkdown(score.silver_agreement, "Silver Agreement").trimEnd());
    }
    lines.push("", coverageReportMarkdown(score.coverage).trimEnd());
    return `${lines.filter(Boolean).join("\n")}\n`;
  }

  return scoreSectionMarkdown(score, "Overall");
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(1, number));
}

export function extractGeminiJsonText(apiResponse) {
  const parts = apiResponse?.candidates?.[0]?.content?.parts || [];
  return parts.map((part) => part?.text || "").join("\n").trim();
}

export function parseGeminiJson(apiResponse) {
  const text = typeof apiResponse === "string" ? apiResponse : extractGeminiJsonText(apiResponse);
  if (!text) throw new Error("Gemini response did not include JSON text.");
  const parseLoose = (value) => JSON.parse(value.replace(/,\s*([}\]])/g, "$1"));
  try {
    return JSON.parse(text);
  } catch (error) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return parseLoose(fenced[1]);
    try {
      return parseLoose(text);
    } catch {
      // Preserve the original JSON.parse error; it usually points at the
      // model's first malformed token more clearly than the repaired attempt.
    }
    throw error;
  }
}

export function normalizeGeminiSilverLabel(sample, parsed, metadata = {}) {
  const expected = normalizeExpectedLabel(parsed.expected || parsed);
  const suitability = normalizeSuitability(
    parsed.suitability ||
    parsed.review_suitability ||
    parsed.expected?.suitability ||
    "core"
  );
  const confidence = {};
  for (const field of [
    "terminal_outcome",
    "save_intent",
    "entities",
    "visit_target",
    "reminder",
    "collections",
    "location_context",
    "title_contains",
    "summary_contains",
    "access_state"
  ]) {
    confidence[field] = clampConfidence(parsed.confidence?.[field]);
  }
  return {
    sample_id: sample.sample_id,
    url: sample.url,
    stratum: sample.stratum,
    source_kind: sample.source_kind || "exa_public",
    coverage_tags: uniqueStringList(sample.coverage_tags),
    expected_collections: uniqueStringList(sample.expected_collections),
    expected_reminder_surface: sample.expected_reminder_surface || "",
    expected_visit_target_surface: sample.expected_visit_target_surface || "",
    label_type: "silver",
    suitability,
    suitability_reason: String(parsed.suitability_reason || parsed.review_suitability_reason || ""),
    include_in_gold: suitability !== "exclude",
    reviewer: "gemini",
    reviewed_at: metadata.reviewed_at || new Date().toISOString(),
    provider: metadata.provider || "google-gemini",
    model: metadata.model || "",
    expected,
    confidence,
    evidence_snippets: {
      terminal_outcome: uniqueStringList(parsed.evidence_snippets?.terminal_outcome),
      save_intent: uniqueStringList(parsed.evidence_snippets?.save_intent),
      entities: uniqueStringList(parsed.evidence_snippets?.entities),
      visit_target: uniqueStringList(parsed.evidence_snippets?.visit_target),
      reminder: uniqueStringList(parsed.evidence_snippets?.reminder),
      collections: uniqueStringList(parsed.evidence_snippets?.collections),
      location_context: uniqueStringList(parsed.evidence_snippets?.location_context),
      access_state: uniqueStringList(parsed.evidence_snippets?.access_state)
    },
    uncertainty_flags: uniqueStringList(parsed.uncertainty_flags),
    raw_response_metadata: metadata.raw_response_metadata || {}
  };
}

export function geminiPreflightFailureMessage(model, status, detail = "") {
  return [
    `Gemini silver-label preflight failed for model "${model}".`,
    "Confirm GEMINI_API_KEY has access to that model, or override GEMINI_LABEL_MODEL.",
    status ? `Status: ${status}.` : "",
    detail ? `Response: ${String(detail).slice(0, 700)}` : ""
  ].filter(Boolean).join(" ");
}

function lowestConfidence(label) {
  const values = Object.values(label?.confidence || {})
    .filter((value) => Number.isFinite(value));
  return values.length ? Math.min(...values) : null;
}

function deterministicFraction(seed) {
  return seededRandom(seed)();
}

export function buildReviewQueue(samples, predictions, silverLabels, options = {}) {
  const silverById = labelMap(silverLabels);
  const sampleById = new Map((samples || []).map((sample) => [sample.sample_id, sample]));
  const predictionSamples = predictions?.length ? predictions : samples;
  const lowConfidenceThreshold = Number(options.lowConfidenceThreshold ?? 0.72);
  const agreementSampleRate = Number(options.agreementSampleRate ?? 0.15);
  const seed = options.seed || "capture-review-queue";
  const rows = [];

  for (const predictionSample of predictionSamples || []) {
    const sample = sampleById.get(predictionSample.sample_id) || predictionSample;
    const silver = silverById.get(predictionSample.sample_id);
    const prediction = predictionSample.prediction || predictionFromCapture(predictionSample.capture || predictionSample);
    const suitability = normalizeSuitability(silver?.suitability || silver?.expected?.suitability || "core");
    const reasons = [];
    const metrics = silver?.expected
      ? predictionExpectedComparisons(prediction, silver.expected)
      : {};
    const failures = comparisonFailures(metrics);
    if (failures.length) {
      reasons.push(...failures.map((metric) => `disagreement:${metric}`));
    }

    const confidence = lowestConfidence(silver);
    if (confidence !== null && confidence < lowConfidenceThreshold) {
      reasons.push("low_confidence");
    }
    if ((silver?.uncertainty_flags || []).length) {
      reasons.push("uncertainty_flags");
    }
    if (suitability === "exclude") {
      reasons.push("suitability:exclude");
    }

    const accessState = normalizeText(silver?.expected?.access_state);
    if (["blocked", "login gated", "login_gated", "dead"].includes(accessState)) {
      reasons.push(`access:${accessState.replace(/\s+/g, "_")}`);
    }

    const coverageTags = uniqueStringList(sample.coverage_tags || silver?.coverage_tags);
    if (coverageTags.includes("has_date_time") || sample.expected_reminder_surface || silver?.expected_reminder_surface) {
      reasons.push("date_time_reminder_case");
    }
    if (coverageTags.includes("location_only") && prediction.reminder === "suggested") {
      reasons.push("location_only_false_reminder_risk");
    }

    const expectedCollections = uniqueStringList(
      sample.expected_collections?.length ? sample.expected_collections : silver?.expected_collections
    );
    if (expectedCollections.length) {
      const predictedCollections = normalizeStringList(prediction.collections);
      const silverCollections = normalizeStringList(silver?.expected?.collections || []);
      const mismatch = expectedCollections.some((collection) => {
        const key = normalizeText(collection);
        return !predictedCollections.includes(key) || !silverCollections.includes(key);
      });
      if (mismatch) reasons.push("collection_fit_mismatch");
    }

    const uniqueReasons = uniqueStringList(reasons);
    const agreement = !uniqueReasons.length;
    if (agreement && deterministicFraction(`${seed}:${sample.sample_id}`) >= agreementSampleRate) {
      continue;
    }
    rows.push({
      sample_id: sample.sample_id,
      url: sample.url || silver?.url || "",
      stratum: sample.stratum || silver?.stratum || "",
      source_kind: sample.source_kind || silver?.source_kind || "",
      source_title: sample.exa_title || sample.title || sample.display_title || "",
      source_summary: sample.exa_summary || "",
      source_highlights: Array.isArray(sample.exa_highlights)
        ? sample.exa_highlights.slice(0, 2)
        : [],
      priority: agreement ? "spot_check" : "review",
      reasons: agreement ? ["agreement_spot_check"] : uniqueReasons,
      suitability,
      suitability_reason: silver?.suitability_reason || "",
      silver_expected: silver?.expected || null,
      silver_confidence: silver?.confidence || null,
      silver_evidence_snippets: silver?.evidence_snippets || null,
      silver_uncertainty_flags: silver?.uncertainty_flags || [],
      prediction,
      coverage_tags: coverageTags,
      expected_collections: expectedCollections
    });
  }

  rows.sort((left, right) => {
    if (left.priority !== right.priority) return left.priority === "review" ? -1 : 1;
    return left.sample_id.localeCompare(right.sample_id);
  });
  return rows;
}
