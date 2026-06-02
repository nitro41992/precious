import {
  assert,
  assertEqual,
} from "./url-evidence.test-support.ts";
import {
  archivedFilter,
  captureState,
  withCaptureStates,
} from "./lib/capture-records.ts";

Deno.test("deleted and legacy archived captures are inactive", () => {
  const active = { id: "active", analysis: {} };
  const deleted = {
    id: "deleted",
    deleted_at: "2026-06-02T12:00:00.000Z",
    analysis: { capture_state: "deleted" },
  };
  const legacyArchived = {
    id: "legacy-archived",
    archived_at: "2026-06-01T12:00:00.000Z",
    analysis: { capture_state: "archived" },
  };

  assertEqual(captureState(active), "active", "active capture state");
  assertEqual(captureState(deleted), "deleted", "deleted capture state");
  assertEqual(
    captureState(legacyArchived),
    "deleted",
    "legacy archived capture state",
  );

  const rows = withCaptureStates([active, deleted, legacyArchived]);
  assertEqual(
    rows.filter((row) => archivedFilter(row, false)).map((row) => row.id)
      .join(","),
    "active",
    "only active captures pass response filters",
  );
  assert(
    rows.every((row) => !archivedFilter(row, true)),
    "archived response filters are empty after archive removal",
  );
});
