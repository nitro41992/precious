import {
  assert,
  assertEqual,
  captureFixture,
  urlEvidence,
} from "./url-evidence.test-support.ts";
import {
  qualifyingNewCollectionDecision,
  resolveNewCollectionSuggestions,
  surfaceSuggestionToSiblings,
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
    prompt.includes("consider proposing exactly one new Collection") &&
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
    prompt.includes("basic category level") &&
      prompt.includes("Balance informativeness against economy"),
    "prompt frames naming at the cognitive basic level",
  );
  assert(
    prompt.includes("Name the durable category of the content, not this one task") &&
      prompt.includes("reusable noun-phrase category label"),
    "prompt bans one-off, task-phrased titles and asks for reusable category labels",
  );
  assert(
    prompt.includes("at most 50 characters") &&
      prompt.includes("at most 160 characters"),
    "prompt states the title and description length limits",
  );
});

Deno.test("analysis prompt omits the pending-suggestion block when none exist", () => {
  const prompt = urlEvidence.buildPrompt(
    captureFixture({ source_text: "A great trail running route near Boulder." }),
    null,
    [],
  );
  assert(
    !prompt.includes("Existing pending suggested Collections"),
    "no pending block is rendered when the user has no pending suggestions",
  );
});

Deno.test("analysis prompt surfaces pending suggestions as verbatim reuse candidates", () => {
  const prompt = urlEvidence.buildPrompt(
    captureFixture({ source_text: "A short clip with a song I want to find." }),
    null,
    [],
    [{
      id: "s1",
      title: "Songs to identify",
      description: "Clips with music I want to name later.",
      keyword_rank: null,
      semantic_rank: null,
      keyword_score: null,
      semantic_score: null,
      rrf_score: null,
    }],
  );
  assert(
    prompt.includes("Existing pending suggested Collections"),
    "pending suggestions are shown to the model when present",
  );
  assert(
    prompt.includes("Songs to identify"),
    "the pending suggestion title is included so the model can reuse it",
  );
  assert(
    !prompt.includes("\"s1\""),
    "pending suggestion ids are withheld so they are not used as link targets",
  );
  assert(
    prompt.includes("reuse that pending suggestion's title verbatim"),
    "prompt instructs verbatim title reuse to consolidate near-duplicates",
  );
  assert(
    prompt.includes("Keep genuinely distinct intents separate"),
    "prompt keeps the conservative guard against wrongly merging distinct intents",
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
  assert(
    Number.isInteger(urlEvidence.COLLECTION_SUGGESTION_MIN_CAPTURES) &&
      urlEvidence.COLLECTION_SUGGESTION_MIN_CAPTURES >= 2,
    "topical suggestions require at least a second corroborating capture",
  );
});

// --- Frequency-gated topical suggestions ---

Deno.test("decision normalization carries an intrinsic/topical basis", () => {
  const topical = urlEvidence.normalizeCollectionDecision({
    type: "new",
    basis: "topical",
    collection_id: null,
    title: "Soccer articles",
    description: "Articles about soccer to read.",
    rationale: "Recurring soccer reads.",
    confidence: 0.7,
  });
  assertEqual(topical.basis, "topical", "an explicit topical basis is preserved");

  const intrinsic = urlEvidence.normalizeCollectionDecision({
    type: "new",
    basis: "intrinsic",
    collection_id: null,
    title: "Trail Runs",
    description: "Routes and gear.",
    rationale: "r",
    confidence: 0.7,
  });
  assertEqual(intrinsic.basis, "intrinsic", "an explicit intrinsic basis is preserved");

  const legacy = urlEvidence.normalizeCollectionDecision({
    type: "new",
    collection_id: null,
    title: "Trail Runs",
    description: "Routes and gear.",
    rationale: "r",
    confidence: 0.7,
  });
  assertEqual(
    legacy.basis,
    "intrinsic",
    "a decision with no basis defaults to intrinsic so it surfaces immediately",
  );
});

Deno.test("analysis schema offers an intrinsic/topical basis on decisions", () => {
  const basisSchema =
    urlEvidence.analysisSchema.properties.collection_decisions.items.properties.basis;
  assertEqual(
    basisSchema.enum.slice().sort().join(","),
    "intrinsic,topical",
    "the model classifies a new collection's basis",
  );
  assert(
    urlEvidence.analysisSchema.properties.collection_decisions.items.required
      .includes("basis"),
    "basis is required (OpenAI strict mode requires every property)",
  );
});

Deno.test("analysis prompt allows topical themes and provisional copy", () => {
  const prompt = urlEvidence.buildPrompt(
    captureFixture({ source_text: "A news article about a soccer match." }),
    null,
    [],
  );
  assert(
    prompt.includes("Set basis to \"intrinsic\"") &&
      prompt.includes("Set basis to \"topical\""),
    "prompt instructs the model to classify intrinsic vs topical themes",
  );
  assert(
    prompt.includes("subject paired with a content type") &&
      prompt.includes("never as a bare subject"),
    "topical themes must be subject+type, not a bare subject or bare format",
  );
  assert(
    prompt.includes("Could group as [Collection label] if you save more like this"),
    "topical rationale copy reads provisionally while the suggestion is held back",
  );
});

Deno.test("shouldSurfaceSuggestion gates only topical themes on frequency", () => {
  assert(
    urlEvidence.shouldSurfaceSuggestion("intrinsic", 1),
    "intrinsic themes surface on the very first capture",
  );
  assert(
    urlEvidence.shouldSurfaceSuggestion("", 1),
    "an unknown/default basis behaves like intrinsic and surfaces immediately",
  );
  assert(
    !urlEvidence.shouldSurfaceSuggestion("topical", 1),
    "a topical theme stays silent with only one capture",
  );
  assert(
    urlEvidence.shouldSurfaceSuggestion(
      "topical",
      urlEvidence.COLLECTION_SUGGESTION_MIN_CAPTURES,
    ),
    "a topical theme surfaces once the corroborating capture count is met",
  );
});

// A tiny in-memory Supabase double covering only the tables surfaceSuggestionToSiblings reads
// and writes: it filters/links rows and records capture updates for assertions.
function fakeSupabase(store: {
  links: Array<Record<string, unknown>>;
  dismissals: Array<Record<string, unknown>>;
  captures: Array<Record<string, unknown>>;
}) {
  const updates: Array<{ id: string; values: Record<string, unknown> }> = [];
  const matches = (row: Record<string, unknown>, filters: Array<[string, unknown]>) =>
    filters.every(([col, val]) =>
      val === null ? row[col] === null || row[col] === undefined : row[col] === val
    );
  const client = {
    from(table: string) {
      const state: {
        op: "select" | "update";
        values: Record<string, unknown> | null;
        filters: Array<[string, unknown]>;
      } = { op: "select", values: null, filters: [] };
      const exec = () => {
        if (table === "collection_capture_links") {
          return { data: store.links.filter((r) => matches(r, state.filters)), error: null };
        }
        if (table === "captures" && state.op === "update") {
          const row = store.captures.find((r) => matches(r, state.filters));
          if (row) {
            Object.assign(row, state.values);
            updates.push({ id: String(row.id), values: state.values ?? {} });
          }
          return { data: null, error: null };
        }
        return { data: null, error: null };
      };
      const single = () => {
        if (table === "collection_suggestion_dismissals") {
          const row = store.dismissals.find((r) => matches(r, state.filters));
          return { data: row ?? null, error: null };
        }
        if (table === "captures") {
          const row = store.captures.find((r) => matches(r, state.filters));
          return { data: row ? { analysis: row.analysis } : null, error: null };
        }
        return { data: null, error: null };
      };
      const api: Record<string, unknown> = {
        select() { state.op = "select"; return api; },
        update(values: Record<string, unknown>) { state.op = "update"; state.values = values; return api; },
        eq(col: string, val: unknown) { state.filters.push([col, val]); return api; },
        is(col: string, val: unknown) { state.filters.push([col, val]); return api; },
        maybeSingle() { return Promise.resolve(single()); },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          return Promise.resolve(exec()).then(resolve, reject);
        },
      };
      return api;
    },
  };
  return { client: client as never, updates };
}

Deno.test("surfaceSuggestionToSiblings back-fills earlier captures that were held silent", async () => {
  const store = {
    links: [
      { user_id: "u1", collection_id: "sug-1", capture_id: "cap-1", rationale: "Earlier soccer read.", confidence: 0.7, unlinked_at: null },
      { user_id: "u1", collection_id: "sug-1", capture_id: "cap-2", rationale: "r2", confidence: 0.8, unlinked_at: null },
    ],
    dismissals: [],
    captures: [
      { id: "cap-1", user_id: "u1", analysis: { title: "First" }, collection_suggestion_state: "ready" },
    ],
  };
  const { client, updates } = fakeSupabase(store);
  await surfaceSuggestionToSiblings(client, "u1", "sug-1", "cap-2", {
    title: "Soccer articles",
    description: "Articles about soccer to read.",
  });
  assertEqual(updates.length, 1, "only the silent sibling cap-1 is updated, not the current cap-2");
  assertEqual(updates[0].id, "cap-1", "the earlier capture is the one back-filled");
  const pending = (store.captures[0].analysis as Record<string, unknown>)
    .pending_collection_suggestion as Record<string, unknown>;
  assertEqual(pending.collection_id, "sug-1", "the suggestion points at the shared group");
  assertEqual(pending.title, "Soccer articles", "the suggestion carries the group title");
  assertEqual(pending.rationale, "Earlier soccer read.", "the sibling keeps its own link rationale");
  assertEqual(store.captures[0].collection_suggestion_state, "ready", "the sibling resolves to ready");
});

Deno.test("surfaceSuggestionToSiblings skips dismissed and already-surfaced siblings", async () => {
  const store = {
    links: [
      { user_id: "u1", collection_id: "sug-1", capture_id: "cap-dismissed", rationale: "r", confidence: 0.7, unlinked_at: null },
      { user_id: "u1", collection_id: "sug-1", capture_id: "cap-shown", rationale: "r", confidence: 0.7, unlinked_at: null },
      { user_id: "u1", collection_id: "sug-1", capture_id: "cap-current", rationale: "r", confidence: 0.7, unlinked_at: null },
    ],
    dismissals: [
      { user_id: "u1", collection_id: "sug-1", capture_id: "cap-dismissed" },
    ],
    captures: [
      { id: "cap-dismissed", user_id: "u1", analysis: { title: "D" } },
      { id: "cap-shown", user_id: "u1", analysis: { title: "S", pending_collection_suggestion: { collection_id: "sug-1" } } },
    ],
  };
  const { client, updates } = fakeSupabase(store);
  await surfaceSuggestionToSiblings(client, "u1", "sug-1", "cap-current", {
    title: "Soccer articles",
    description: "Articles about soccer to read.",
  });
  assertEqual(updates.length, 0, "a dismissed sibling and an already-surfaced sibling are both left alone");
});
