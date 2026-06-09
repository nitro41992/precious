import { assert, assertEqual } from "./url-evidence.test-support.ts";
import {
  dismissCollectionSuggestion,
  undoDismissCollectionSuggestion,
} from "./lib/routes/collection-suggestions.ts";

// In-memory Supabase double covering the tables the whole-suggestion dismiss/undo touch:
// collections, collection_capture_links, collection_suggestion_dismissals, captures.
// The collection_preview_captures select returns a schema-cache error so the preview
// refresh is a clean no-op (mirrors a deployment without the preview column), keeping the
// test focused on the dismiss/undo state transitions rather than preview computation.
type Row = Record<string, unknown>;
type Store = {
  collections: Row[];
  links: Row[];
  dismissals: Row[];
  captures: Row[];
};

function fakeSupabase(store: Store) {
  type Filter = ["eq" | "is" | "in", string, unknown];
  const matches = (row: Row, filters: Filter[]) =>
    filters.every(([type, col, val]) => {
      if (type === "in") return Array.isArray(val) && val.includes(row[col]);
      if (type === "is") return val === null ? row[col] === null || row[col] === undefined : row[col] === val;
      return row[col] === val;
    });

  const tableKey: Record<string, keyof Store> = {
    collections: "collections",
    collection_capture_links: "links",
    collection_suggestion_dismissals: "dismissals",
    captures: "captures",
  };
  const client = {
    rpc() {
      // Force activeCollectionCounts onto its table-query fallback.
      return Promise.resolve({ data: null, error: { message: "no rpc" } });
    },
    from(tableName: string) {
      const table = tableKey[tableName];
      const state: {
        op: "select" | "update" | "delete";
        cols: string;
        values: Row | null;
        filters: Filter[];
      } = { op: "select", cols: "*", values: null, filters: [] };
      const rowsFor = () => (store as Record<string, Row[]>)[table] ?? [];
      const exec = () => {
        const rows = rowsFor();
        if (state.op === "select") {
          if (table === "collections" && state.cols.includes("collection_preview_captures")) {
            return { data: null, error: { message: "schema cache" } };
          }
          return { data: rows.filter((r) => matches(r, state.filters)), error: null };
        }
        if (state.op === "update") {
          for (const row of rows.filter((r) => matches(r, state.filters))) {
            Object.assign(row, state.values);
          }
          return { data: null, error: null };
        }
        if (state.op === "delete") {
          const keep = rows.filter((r) => !matches(r, state.filters));
          (store as Record<string, Row[]>)[table] = keep;
          return { data: null, error: null };
        }
        return { data: null, error: null };
      };
      const single = () => {
        if (table === "collections" && state.cols.includes("collection_preview_captures")) {
          return { data: null, error: { message: "schema cache" } };
        }
        const row = rowsFor().find((r) => matches(r, state.filters));
        if (!row) return { data: null, error: null };
        return { data: row, error: null };
      };
      const api: Record<string, unknown> = {
        select(cols?: string) { state.op = "select"; if (cols) state.cols = cols; return api; },
        update(values: Row) { state.op = "update"; state.values = values; return api; },
        delete() { state.op = "delete"; return api; },
        upsert(rows: Row | Row[]) {
          const incoming = Array.isArray(rows) ? rows : [rows];
          const target = (store as Record<string, Row[]>)[table];
          for (const next of incoming) {
            const existing = target.find((r) =>
              r.collection_id === next.collection_id && r.capture_id === next.capture_id
            );
            if (existing) Object.assign(existing, next);
            else target.push({ ...next });
          }
          return Promise.resolve({ data: null, error: null });
        },
        eq(col: string, val: unknown) { state.filters.push(["eq", col, val]); return api; },
        is(col: string, val: unknown) { state.filters.push(["is", col, val]); return api; },
        in(col: string, val: unknown) { state.filters.push(["in", col, val]); return api; },
        maybeSingle() { return Promise.resolve(single()); },
        single() { return Promise.resolve(single()); },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          return Promise.resolve(exec()).then(resolve, reject);
        },
      };
      return api;
    },
  };
  return client as never;
}

function seedStore(): Store {
  return {
    collections: [{
      id: "sug-1",
      user_id: "u1",
      status: "suggested",
      title: "Trail Runs",
      description: "Routes and gear for trail running.",
      normalized_title: "trail runs",
      deleted_at: null,
      delete_purge_after: null,
    }],
    links: [
      { user_id: "u1", collection_id: "sug-1", capture_id: "cap-1", rationale: "First trail save.", confidence: 0.7, unlinked_at: null, unlink_reason: null },
      { user_id: "u1", collection_id: "sug-1", capture_id: "cap-2", rationale: "Second trail save.", confidence: 0.8, unlinked_at: null, unlink_reason: null },
    ],
    dismissals: [],
    captures: [
      { id: "cap-1", user_id: "u1", review_confirmed_at: null, analysis: { title: "First", pending_collection_suggestion: { collection_id: "sug-1", title: "Trail Runs" } } },
      { id: "cap-2", user_id: "u1", review_confirmed_at: null, analysis: { title: "Second", pending_collection_suggestion: { collection_id: "sug-1", title: "Trail Runs" } } },
    ],
  };
}

Deno.test("dismiss removes a whole suggestion from every member capture", async () => {
  const store = seedStore();
  const result = await dismissCollectionSuggestion(fakeSupabase(store), "u1", "sug-1");

  assert(result !== null, "a live suggestion is dismissable");
  assertEqual(
    result?.captureIds.slice().sort().join(","),
    "cap-1,cap-2",
    "the dismiss reports every member capture so the client can refresh them",
  );
  assertEqual(store.dismissals.length, 2, "a dismissal is recorded for each member so none are re-suggested");
  assert(
    store.links.every((l) => l.unlinked_at !== null && l.unlink_reason === "suggestion_dismissed"),
    "every member link is unlinked with the dismiss reason",
  );
  assert(
    store.captures.every((c) =>
      (c.analysis as Row).pending_collection_suggestion === undefined
    ),
    "every member capture loses its pending suggestion marker",
  );
  assertEqual(store.collections[0].deleted_at !== null, true, "the suggestion is soft-deleted");
});

Deno.test("undo_dismiss restores the suggestion and every member's marker", async () => {
  const store = seedStore();
  const supabase = fakeSupabase(store);
  await dismissCollectionSuggestion(supabase, "u1", "sug-1");

  const restored = await undoDismissCollectionSuggestion(supabase, "u1", "sug-1");
  assert(restored !== null, "a dismissed suggestion can be undone");
  assertEqual(store.collections[0].deleted_at, null, "the suggestion is un-deleted");
  assertEqual(store.dismissals.length, 0, "dismissal records are cleared so the group can resurface");
  assert(
    store.links.every((l) => l.unlinked_at === null && l.unlink_reason === null),
    "every member link is re-linked",
  );
  for (const capture of store.captures) {
    const pending = (capture.analysis as Row).pending_collection_suggestion as Row;
    assert(pending !== undefined, `${capture.id} has its pending marker restored`);
    assertEqual(pending.collection_id, "sug-1", "the marker points back at the group");
    assertEqual(pending.title, "Trail Runs", "the marker carries the group title");
  }
  const cap1 = store.captures.find((c) => c.id === "cap-1");
  assertEqual(
    ((cap1?.analysis as Row).pending_collection_suggestion as Row).rationale,
    "First trail save.",
    "each restored marker keeps that capture's own link rationale",
  );
});

Deno.test("dismiss is a no-op for a missing or already-dismissed suggestion", async () => {
  const store = seedStore();
  const supabase = fakeSupabase(store);
  await dismissCollectionSuggestion(supabase, "u1", "sug-1");
  // The row is now soft-deleted; loadSuggestionRow must refuse a second dismiss.
  const second = await dismissCollectionSuggestion(supabase, "u1", "sug-1");
  assertEqual(second, null, "a soft-deleted suggestion is not dismissable again");
});
