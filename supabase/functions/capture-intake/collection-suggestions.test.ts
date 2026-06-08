import {
  assert,
  assertEqual,
  captureFixture,
  urlEvidence,
} from "./url-evidence.test-support.ts";
import {
  qualifyingNewCollectionDecision,
  resolveNewCollectionSuggestions,
} from "./lib/collections/review-decisions.ts";

// Any database access in these guard paths is a bug — fail loudly if it happens.
const throwingSupabase = new Proxy({}, {
  get() {
    throw new Error("resolveNewCollectionSuggestions touched the database");
  },
}) as never;

Deno.test("collection decision normalization accepts new suggestions", () => {
  const decision = urlEvidence.normalizeCollectionDecision({
    type: "new",
    collection_id: null,
    title: "  Trail Runs  ",
    description: "  Routes and gear for trail running.  ",
    rationale: "Repeated trail-running saves.",
    confidence: 0.74,
  });
  assertEqual(decision.type, "new", "new-type decisions must survive normalization");
  assertEqual(decision.collection_id, null, "new suggestions carry no collection id");
  assertEqual(decision.title, "Trail Runs", "title is trimmed");
  assertEqual(
    decision.description,
    "Routes and gear for trail running.",
    "description is trimmed and preserved for new suggestions",
  );
});

Deno.test("collection decision normalization clamps title and description length", () => {
  const longTitle = "A".repeat(120);
  const longDescription = "B".repeat(400);
  const decision = urlEvidence.normalizeCollectionDecision({
    type: "new",
    collection_id: null,
    title: longTitle,
    description: longDescription,
    rationale: "x",
    confidence: 0.9,
  });
  assertEqual(
    decision.title.length,
    urlEvidence.COLLECTION_TITLE_MAX_LENGTH,
    "title is clamped to the manual composer limit",
  );
  assertEqual(
    (decision.description || "").length,
    urlEvidence.COLLECTION_DESCRIPTION_MAX_LENGTH,
    "description is clamped to the manual composer limit",
  );
  assertEqual(urlEvidence.COLLECTION_TITLE_MAX_LENGTH, 50, "title limit mirrors the UI");
  assertEqual(
    urlEvidence.COLLECTION_DESCRIPTION_MAX_LENGTH,
    160,
    "description limit mirrors the UI",
  );
});

Deno.test("unknown collection decision types are still dropped", () => {
  const decision = urlEvidence.normalizeCollectionDecision({
    type: "freeform",
    title: "Whatever",
    confidence: 0.9,
  });
  assertEqual(decision.type, "", "only existing and new are valid decision types");
});

Deno.test("analysis schema allows existing and new collection decisions", () => {
  const typeSchema =
    urlEvidence.analysisSchema.properties.collection_decisions.items.properties.type;
  assertEqual(
    typeSchema.enum.slice().sort().join(","),
    "existing,new",
    "the model may return existing or new collection decisions",
  );
});

Deno.test("analysis prompt gates new collections with a granularity balance", () => {
  const prompt = urlEvidence.buildPrompt(
    captureFixture({ source_text: "A great trail running route near Boulder." }),
    null,
    [],
  );
  assert(
    prompt.includes("propose exactly one new Collection") &&
      prompt.includes("When NO existing Collection is a strong fit"),
    "prompt gates new collections behind no strong existing fit",
  );
  assert(
    prompt.includes("A possible fit is not a fit for linking purposes") &&
      prompt.includes("a weak or possible existing fit does not block a new Collection"),
    "prompt requires a strong existing fit to suppress a new suggestion",
  );
  assert(
    prompt.includes("Pick a mid-level grouping") &&
      prompt.includes("meaningless catch-all"),
    "prompt steers the model away from one-off and generic collections",
  );
  assert(
    prompt.includes("at most 50 characters") &&
      prompt.includes("at most 160 characters"),
    "prompt states the title and description length limits",
  );
});

Deno.test("existing-only collection decisions never reach the suggestion pipeline", async () => {
  const analysis = {
    collection_decisions: [{
      type: "existing",
      collection_id: "c1",
      title: "Coffee",
      description: "Cafes worth a visit.",
      rationale: "r",
      confidence: 0.9,
    }],
  };
  const result = await resolveNewCollectionSuggestions(
    throwingSupabase,
    "user-1",
    "capture-1",
    analysis,
  );
  assertEqual(
    (result.collection_decisions as unknown[]).length,
    1,
    "existing decisions are preserved for auto-link",
  );
  assertEqual(
    result.pending_collection_suggestion,
    undefined,
    "no pending suggestion is created for existing decisions",
  );
});

Deno.test("low-confidence new suggestions are dropped before any write", async () => {
  const analysis = {
    collection_decisions: [{
      type: "new",
      collection_id: null,
      title: "Trail Runs",
      description: "Routes and gear for trail running.",
      rationale: "r",
      confidence: 0.2,
    }],
  };
  const result = await resolveNewCollectionSuggestions(
    throwingSupabase,
    "user-1",
    "capture-1",
    analysis,
  );
  assertEqual(
    (result.collection_decisions as unknown[]).length,
    0,
    "the weak new decision is stripped",
  );
  assertEqual(
    result.pending_collection_suggestion,
    undefined,
    "no pending suggestion is surfaced for a weak new decision",
  );
});

// qualifyingNewCollectionDecision gates whether processCapture marks the capture
// collection_suggestion_state='pending' (and runs the background suggestion pass). It must
// agree with the writes-side filter inside resolveNewCollectionSuggestions: only a confident,
// fully-formed new decision qualifies, and at most the most-confident one.
Deno.test("qualifyingNewCollectionDecision selects a confident new decision", () => {
  const decision = qualifyingNewCollectionDecision({
    collection_decisions: [
      {
        type: "existing",
        collection_id: "c1",
        title: "Coffee",
        description: "Cafes.",
        rationale: "r",
        confidence: 0.95,
      },
      {
        type: "new",
        collection_id: null,
        title: "Trail Runs",
        description: "Routes and gear for trail running.",
        rationale: "r",
        confidence: 0.72,
      },
      {
        type: "new",
        collection_id: null,
        title: "Hiking",
        description: "Trails and hikes.",
        rationale: "r",
        confidence: 0.81,
      },
    ],
  });
  assert(decision !== null, "a qualifying new decision is returned");
  assertEqual(decision?.title, "Hiking", "the most confident new decision wins");
});

Deno.test("qualifyingNewCollectionDecision returns null when nothing qualifies", () => {
  assertEqual(
    qualifyingNewCollectionDecision({
      collection_decisions: [{
        type: "existing",
        collection_id: "c1",
        title: "Coffee",
        description: "Cafes.",
        rationale: "r",
        confidence: 0.95,
      }],
    }),
    null,
    "existing-only analyses have no pending suggestion",
  );
  assertEqual(
    qualifyingNewCollectionDecision({
      collection_decisions: [{
        type: "new",
        collection_id: null,
        title: "Trail Runs",
        description: "Routes and gear.",
        rationale: "r",
        confidence: 0.2,
      }],
    }),
    null,
    "low-confidence new decisions do not qualify",
  );
});

Deno.test("suggestion dedup and confidence thresholds are bounded", () => {
  assert(
    urlEvidence.COLLECTION_SUGGESTION_DEDUP_SIMILARITY > 0 &&
      urlEvidence.COLLECTION_SUGGESTION_DEDUP_SIMILARITY <= 1,
    "dedup similarity is a cosine threshold in (0,1]",
  );
  assert(
    urlEvidence.COLLECTION_SUGGESTION_MIN_CONFIDENCE >= 0 &&
      urlEvidence.COLLECTION_SUGGESTION_MIN_CONFIDENCE <= 1,
    "minimum suggestion confidence is in [0,1]",
  );
});
