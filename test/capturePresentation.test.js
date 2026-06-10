const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const ts = require("typescript");

let capturePresentation;

function loadCapturePresentation() {
  if (capturePresentation) return capturePresentation;
  const sourcePath = join(__dirname, "../app/capturePresentation.ts");
  const source = readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      resolveJsonModule: true,
      target: ts.ScriptTarget.ES2020
    },
    fileName: sourcePath
  }).outputText;
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier === "phosphor-react-native") {
      // Each named icon resolves to a stable stub tagged with its name, so tests
      // can assert which icon a capture maps to by identity/name.
      const iconStubs = new Map();
      return new Proxy(
        {},
        {
          get(_target, name) {
            if (typeof name !== "string") return undefined;
            if (!iconStubs.has(name)) {
              const Icon = () => null;
              Icon.iconName = name;
              iconStubs.set(name, Icon);
            }
            return iconStubs.get(name);
          }
        }
      );
    }
    if (specifier === "./captureLogic") return require("../app/captureLogic");
    if (specifier === "../supabase/functions/_shared/save-intents.json") {
      return require("../supabase/functions/_shared/save-intents.json");
    }
    return require(specifier);
  };
  Function("require", "module", "exports", compiled)(
    localRequire,
    module,
    module.exports
  );
  capturePresentation = module.exports;
  return capturePresentation;
}

function capture(overrides = {}) {
  return {
    id: "capture-a",
    title: "Saved link",
    sourceUrl: null,
    sourceText: "",
    siteName: "",
    summary: "",
    status: "ready",
    createdAt: Date.UTC(2026, 5, 5, 15, 20),
    updatedAt: Date.UTC(2026, 5, 5, 15, 20),
    defaultIntent: undefined,
    linkedCollections: [],
    suggestedReminders: [],
    ...overrides
  };
}

test("captureDisplayTitle never falls back to Saved from source domain", () => {
  const { captureDisplayTitle } = loadCapturePresentation();
  const title = captureDisplayTitle(
    capture({
      title: "instagram.com",
      sourceUrl: "https://www.instagram.com/reel/abc123/",
      siteName: "instagram.com"
    })
  );

  assert.equal(title, "Saved link");
  assert.notEqual(title, "Saved from instagram.com");
});

test("capture image load keys stay stable across refreshed signed URLs", () => {
  const {
    captureImageCacheKey,
    captureImageLoadKey
  } = loadCapturePresentation();
  const base = capture({
    imageAssetUrl: "https://example.supabase.co/storage/v1/object/sign/a.png?token=old",
    imageAssetCacheKey: "captures/user/a.png:thumb",
    imageAssetMimeType: "image/png"
  });
  const refreshed = {
    ...base,
    imageAssetUrl: "https://example.supabase.co/storage/v1/object/sign/a.png?token=new"
  };

  assert.equal(captureImageCacheKey(base), "captures/user/a.png:thumb");
  assert.equal(captureImageCacheKey(refreshed), "captures/user/a.png:thumb");
  assert.equal(captureImageLoadKey(base), "captures/user/a.png:thumb");
  assert.equal(captureImageLoadKey(refreshed), "captures/user/a.png:thumb");
});

test("capture image load keys still track public fallback URLs", () => {
  const { captureImageLoadKey } = loadCapturePresentation();
  const base = capture({
    thumbnailUrl: "https://cdn.example.com/preview-old.jpg"
  });
  const refreshed = {
    ...base,
    thumbnailUrl: "https://cdn.example.com/preview-new.jpg"
  };

  assert.equal(captureImageLoadKey(base), "https://cdn.example.com/preview-old.jpg");
  assert.equal(captureImageLoadKey(refreshed), "https://cdn.example.com/preview-new.jpg");
});

test("captureDisplayTitle uses non-source summary before generic fallback", () => {
  const { captureDisplayTitle } = loadCapturePresentation();
  assert.equal(
    captureDisplayTitle(
      capture({
        title: "Saved from instagram.com",
        sourceUrl: "https://www.instagram.com/reel/abc123/",
        siteName: "instagram.com",
        summary: "Modly turns local photos into 3D models."
      })
    ),
    "Modly turns local photos into 3D models"
  );
});

test("captureRowSourceLabel hides shared image filenames from row metadata", () => {
  const { captureRowSourceLabel } = loadCapturePresentation();

  assert.equal(
    captureRowSourceLabel(
      capture({
        captureType: "image",
        sourceText: "Shared image: Screenshot_20260605-032059.png",
        imageAssetUrl: "https://storage.example/captures/screenshot.png"
      })
    ),
    "Shared image"
  );
});

test("captureRowSourceLabel keeps real source hosts for link rows", () => {
  const { captureRowSourceLabel } = loadCapturePresentation();

  assert.equal(
    captureRowSourceLabel(
      capture({
        sourceUrl: "https://www.instagram.com/reel/abc123/",
        siteName: "instagram.com",
        sourceText: "Shared text: https://www.instagram.com/reel/abc123/"
      })
    ),
    "instagram.com"
  );
});

test("buildMonthGrid returns a stable 42-cell month with correct offsets", () => {
  const { buildMonthGrid } = loadCapturePresentation();

  // June 2026 starts on a Monday -> 1 leading day from May.
  const june = buildMonthGrid(2026, 5);
  assert.equal(june.length, 42);
  const juneInMonth = june.filter((cell) => cell.inMonth);
  assert.equal(juneInMonth.length, 30);
  assert.equal(juneInMonth[0].date, "2026-06-01");
  assert.equal(juneInMonth[juneInMonth.length - 1].date, "2026-06-30");
  assert.equal(june[0].inMonth, false); // leading day from May
  assert.equal(june[0].date, "2026-05-31");
});

test("buildMonthGrid handles leap and non-leap February", () => {
  const { buildMonthGrid } = loadCapturePresentation();

  const leap = buildMonthGrid(2024, 1);
  assert.equal(leap.length, 42);
  assert.equal(leap.filter((cell) => cell.inMonth).length, 29);
  assert.ok(leap.some((cell) => cell.date === "2024-02-29" && cell.inMonth));

  const nonLeap = buildMonthGrid(2025, 1);
  assert.equal(nonLeap.filter((cell) => cell.inMonth).length, 28);
  assert.ok(!nonLeap.some((cell) => cell.date === "2025-02-29" && cell.inMonth));
});

test("buildMonthGrid keeps 42 cells for a Sunday-start month with no leading blanks", () => {
  const { buildMonthGrid } = loadCapturePresentation();

  // March 2026 starts on a Sunday.
  const march = buildMonthGrid(2026, 2);
  assert.equal(march.length, 42);
  assert.equal(march[0].date, "2026-03-01");
  assert.equal(march[0].inMonth, true);
});

test("shiftMonth rolls across year boundaries", () => {
  const { shiftMonth } = loadCapturePresentation();
  assert.deepEqual(shiftMonth(2026, 11, 1), { year: 2027, month: 0 });
  assert.deepEqual(shiftMonth(2026, 0, -1), { year: 2025, month: 11 });
});

test("parseClock and formatClock round-trip across the meridiem boundaries", () => {
  const { parseClock, formatClock } = loadCapturePresentation();

  assert.deepEqual(parseClock("00:00"), { hour12: 12, minute: 0, meridiem: "AM" });
  assert.deepEqual(parseClock("12:00"), { hour12: 12, minute: 0, meridiem: "PM" });
  assert.deepEqual(parseClock("13:05"), { hour12: 1, minute: 5, meridiem: "PM" });
  assert.deepEqual(parseClock("09:30"), { hour12: 9, minute: 30, meridiem: "AM" });

  assert.equal(formatClock({ hour12: 12, minute: 0, meridiem: "AM" }), "00:00");
  assert.equal(formatClock({ hour12: 12, minute: 0, meridiem: "PM" }), "12:00");
  assert.equal(formatClock({ hour12: 1, minute: 5, meridiem: "PM" }), "13:05");
  assert.equal(formatClock({ hour12: 9, minute: 30, meridiem: "AM" }), "09:30");

  assert.equal(parseClock(""), null);
  assert.equal(parseClock("9:5"), null);
  assert.equal(parseClock("24:00"), null);
  assert.equal(formatClock({ hour12: 13, minute: 0, meridiem: "AM" }), "");
});

test("nextDateRange implements flight-style range selection", () => {
  const { nextDateRange } = loadCapturePresentation();

  // First tap: single day (start == end).
  assert.deepEqual(nextDateRange("", "", "2026-06-05"), {
    startDate: "2026-06-05",
    endDate: "2026-06-05"
  });
  // Single day set, tap a later day: extend.
  assert.deepEqual(nextDateRange("2026-06-05", "2026-06-05", "2026-06-08"), {
    startDate: "2026-06-05",
    endDate: "2026-06-08"
  });
  // Complete range, any tap: reset to single day.
  assert.deepEqual(nextDateRange("2026-06-05", "2026-06-08", "2026-06-10"), {
    startDate: "2026-06-10",
    endDate: "2026-06-10"
  });
  // Tap before the start: reset to single day.
  assert.deepEqual(nextDateRange("2026-06-05", "2026-06-05", "2026-06-02"), {
    startDate: "2026-06-02",
    endDate: "2026-06-02"
  });
  // Tap exactly the start: stays single day.
  assert.deepEqual(nextDateRange("2026-06-05", "2026-06-05", "2026-06-05"), {
    startDate: "2026-06-05",
    endDate: "2026-06-05"
  });
});

test("isWithinRange is inclusive of both endpoints", () => {
  const { isWithinRange } = loadCapturePresentation();
  assert.equal(isWithinRange("2026-06-05", "2026-06-05", "2026-06-08"), true);
  assert.equal(isWithinRange("2026-06-08", "2026-06-05", "2026-06-08"), true);
  assert.equal(isWithinRange("2026-06-06", "2026-06-05", "2026-06-08"), true);
  assert.equal(isWithinRange("2026-06-09", "2026-06-05", "2026-06-08"), false);
  assert.equal(isWithinRange("2026-06-05", "", ""), false);
});

test("isAllDayDraft is true only when both times are empty", () => {
  const { isAllDayDraft } = loadCapturePresentation();
  assert.equal(isAllDayDraft("", ""), true);
  assert.equal(isAllDayDraft("09:00", ""), false);
  assert.equal(isAllDayDraft("09:00", "09:30"), false);
});

test("mergeCollectionsPreservingOrder keeps visible order after an undo reshuffles the server list", () => {
  const { mergeCollectionsPreservingOrder } = loadCapturePresentation();
  // User sees A, B, C. The server returns the same set but reordered (B bumped
  // to the top by the undo's recency touch) and with fresher content for B.
  const current = [
    { id: "a", title: "A", captureCount: 1 },
    { id: "b", title: "B", captureCount: 2 },
    { id: "c", title: "C", captureCount: 3 }
  ];
  const serverRows = [
    { id: "b", title: "B renamed", captureCount: 5 },
    { id: "a", title: "A", captureCount: 1 },
    { id: "c", title: "C", captureCount: 3 }
  ];
  const merged = mergeCollectionsPreservingOrder(current, serverRows);
  assert.deepEqual(merged.map((c) => c.id), ["a", "b", "c"]);
  // Content is taken from the server (B's fresh title/count) without moving it.
  assert.equal(merged[1].title, "B renamed");
  assert.equal(merged[1].captureCount, 5);
});

test("mergeCollectionsPreservingOrder drops removed collections and appends new ones in server order", () => {
  const { mergeCollectionsPreservingOrder } = loadCapturePresentation();
  const current = [
    { id: "a", title: "A" },
    { id: "b", title: "B" }
  ];
  // Server no longer has B (deleted elsewhere) and adds D then E.
  const serverRows = [
    { id: "a", title: "A" },
    { id: "d", title: "D" },
    { id: "e", title: "E" }
  ];
  const merged = mergeCollectionsPreservingOrder(current, serverRows);
  assert.deepEqual(merged.map((c) => c.id), ["a", "d", "e"]);
});

test("insertCollectionAtAnchor restores a middle collection to its original slot", () => {
  const { insertCollectionAtAnchor } = loadCapturePresentation();
  // List was [a, b, c]; b was deleted, leaving [a, c]. Undo should reinsert b
  // after a (its original predecessor), not at the top.
  const list = [
    { id: "a", title: "A" },
    { id: "c", title: "C" }
  ];
  const restored = { id: "b", title: "B" };
  const result = insertCollectionAtAnchor(list, restored, { prevId: "a", index: 1 });
  assert.deepEqual(result.map((c) => c.id), ["a", "b", "c"]);
});

test("insertCollectionAtAnchor inserts at the top when prevId is null", () => {
  const { insertCollectionAtAnchor } = loadCapturePresentation();
  const list = [
    { id: "b", title: "B" },
    { id: "c", title: "C" }
  ];
  const restored = { id: "a", title: "A" };
  const result = insertCollectionAtAnchor(list, restored, { prevId: null, index: 0 });
  assert.deepEqual(result.map((c) => c.id), ["a", "b", "c"]);
});

test("insertCollectionAtAnchor clamps to the original index when the predecessor is gone", () => {
  const { insertCollectionAtAnchor } = loadCapturePresentation();
  // Original predecessor "a" no longer exists; fall back to the recorded index.
  const list = [
    { id: "c", title: "C" },
    { id: "d", title: "D" }
  ];
  const restored = { id: "b", title: "B" };
  const result = insertCollectionAtAnchor(list, restored, { prevId: "a", index: 1 });
  assert.deepEqual(result.map((c) => c.id), ["c", "b", "d"]);
});

test("insertCollectionAtAnchor is idempotent and dedupes the restored id", () => {
  const { insertCollectionAtAnchor } = loadCapturePresentation();
  const list = [
    { id: "a", title: "A" },
    { id: "b", title: "B stale" },
    { id: "c", title: "C" }
  ];
  const restored = { id: "b", title: "B fresh" };
  const result = insertCollectionAtAnchor(list, restored, { prevId: "a", index: 1 });
  assert.deepEqual(result.map((c) => c.id), ["a", "b", "c"]);
  assert.equal(result[1].title, "B fresh");
});

test("insertCollectionAtAnchor prepends when no anchor is provided", () => {
  const { insertCollectionAtAnchor } = loadCapturePresentation();
  const list = [
    { id: "a", title: "A" },
    { id: "b", title: "B" }
  ];
  const restored = { id: "c", title: "C" };
  assert.deepEqual(insertCollectionAtAnchor(list, restored).map((c) => c.id), ["c", "a", "b"]);
  assert.deepEqual(insertCollectionAtAnchor(list, restored, null).map((c) => c.id), ["c", "a", "b"]);
});

test("reminderLabelParts splits date and time into separate labels", () => {
  const { reminderLabelParts } = loadCapturePresentation();

  const range = reminderLabelParts({
    trigger_type: "time",
    start_date: "2026-06-08",
    end_date: "2026-06-09",
    start_time: "10:00",
    end_time: "17:00",
    rationale: "",
    confidence: 0.9
  });
  assert.equal(range.dateLabel, "Jun 8-Jun 9");
  assert.equal(range.timeLabel, "10:00 AM – 5:00 PM");

  const singleNoTime = reminderLabelParts({
    trigger_type: "time",
    start_date: "2026-06-08",
    rationale: "",
    confidence: 0.9
  });
  assert.equal(singleNoTime.dateLabel, "Jun 8");
  assert.equal(singleNoTime.timeLabel, "");

  assert.deepEqual(reminderLabelParts(undefined), { dateLabel: "", timeLabel: "" });
});

test("reminderScheduleDraftForSuggestion prefills all-day and same-day suggestions", () => {
  const { reminderScheduleDraftForSuggestion, isAllDayDraft } = loadCapturePresentation();

  // Dates only, no time -> all-day.
  const allDay = reminderScheduleDraftForSuggestion({
    trigger_type: "time",
    start_date: "2026-06-05",
    end_date: "2026-06-08",
    rationale: "",
    confidence: 0.9
  });
  assert.equal(allDay.startTime, "");
  assert.equal(allDay.endTime, "");
  assert.equal(isAllDayDraft(allDay.startTime, allDay.endTime), true);

  // Start date only -> same-day (start == end).
  const sameDay = reminderScheduleDraftForSuggestion({
    trigger_type: "time",
    start_date: "2026-06-05",
    rationale: "",
    confidence: 0.9
  });
  assert.equal(sameDay.startDate, "2026-06-05");
  assert.equal(sameDay.endDate, "2026-06-05");
});

test("reminderSuggestionFromSchedule serializes an all-day draft as a timeless reminder", () => {
  const { reminderSuggestionFromSchedule, reminderLabelParts } = loadCapturePresentation();

  // This is what the editor produces once the user flips on "All day": empty
  // times across a date range. It must serialize with null times and an
  // unknown time precision so the date-only reminder round-trips.
  const suggestion = reminderSuggestionFromSchedule({
    startDate: "2026-06-05",
    endDate: "2026-06-08",
    startTime: "",
    endTime: "",
    timezone: "America/New_York",
    datePrecision: "date_range",
    timePrecision: "unknown",
    duration: 4,
    durationUnit: "days",
    source: "manual"
  });

  assert.equal(suggestion.start_time, null);
  assert.equal(suggestion.end_time, null);
  assert.equal(suggestion.time_precision, "unknown");
  assert.equal(suggestion.trigger_value, "Jun 5-Jun 8");

  // And the chip renders date-only, with no stray time label.
  const parts = reminderLabelParts(suggestion);
  assert.equal(parts.dateLabel, "Jun 5-Jun 8");
  assert.equal(parts.timeLabel, "");
});

test("captureFieldStates surfaces a pending collection suggestion on the collection field", () => {
  const { captureFieldStates } = loadCapturePresentation();
  const fields = captureFieldStates({
    linkedCollections: [],
    pendingSuggestion: {
      collectionId: "11111111-1111-1111-1111-111111111111",
      title: "Restaurants to try",
      description: "Restaurants you'd like to visit.",
      rationale: "NYC restaurant.",
      confidence: 0.7
    }
  });
  const collection = fields.find((field) => field.kind === "collection");
  assert.equal(collection.suggested, true);
  assert.equal(collection.displayValue, "Restaurants to try");
  assert.equal(collection.hasValue, true);
});

test("captureFieldStates prefers a linked collection over a pending suggestion", () => {
  const { captureFieldStates } = loadCapturePresentation();
  const fields = captureFieldStates({
    linkedCollections: [{ id: "c1", title: "Food" }],
    pendingSuggestion: {
      collectionId: "c2",
      title: "Restaurants to try",
      description: "x",
      rationale: "y",
      confidence: 0.7
    }
  });
  const collection = fields.find((field) => field.kind === "collection");
  assert.equal(collection.suggested, false);
  assert.equal(collection.displayValue, "Food");
});

test("captureFieldStates leaves the collection field empty with no link or suggestion", () => {
  const { captureFieldStates } = loadCapturePresentation();
  const fields = captureFieldStates({ linkedCollections: [] });
  const collection = fields.find((field) => field.kind === "collection");
  assert.equal(collection.suggested, false);
  assert.equal(collection.hasValue, false);
  assert.equal(collection.displayValue, "Add collection");
});

function collectionItem(overrides = {}) {
  return {
    id: "col",
    title: "Collection",
    description: "",
    status: "active",
    captureCount: 0,
    previewCaptures: [],
    updatedAt: null,
    ...overrides
  };
}

test("splitCollectionsByRecency fills the shelf by most-recently updated", () => {
  const { splitCollectionsByRecency } = loadCapturePresentation();
  const collections = [
    collectionItem({ id: "a", updatedAt: "2026-01-01T00:00:00Z" }),
    collectionItem({ id: "b", updatedAt: "2026-06-01T00:00:00Z" }),
    collectionItem({ id: "c", updatedAt: "2026-03-01T00:00:00Z" })
  ];
  const { recent, rest } = splitCollectionsByRecency(collections, [], 2);
  assert.deepEqual(recent.map((c) => c.id), ["b", "c"]);
  assert.deepEqual(rest.map((c) => c.id), ["a"]);
});

test("splitCollectionsByRecency keeps all selected rows in the shelf, even past the limit", () => {
  const { splitCollectionsByRecency } = loadCapturePresentation();
  const collections = [
    collectionItem({ id: "a", updatedAt: "2026-01-01T00:00:00Z" }),
    collectionItem({ id: "b", updatedAt: "2026-06-01T00:00:00Z" }),
    collectionItem({ id: "c", updatedAt: "2026-03-01T00:00:00Z" }),
    collectionItem({ id: "d", updatedAt: "2026-02-01T00:00:00Z" })
  ];
  const { recent, rest } = splitCollectionsByRecency(collections, ["a", "d"], 2);
  // Selected lead in incoming order; limit is already met so no fill is added.
  assert.deepEqual(recent.map((c) => c.id), ["a", "d"]);
  assert.deepEqual(rest.map((c) => c.id), ["b", "c"]);
});

test("splitCollectionsByRecency ignores non-active collections", () => {
  const { splitCollectionsByRecency } = loadCapturePresentation();
  const collections = [
    collectionItem({ id: "a", status: "active", updatedAt: "2026-01-01T00:00:00Z" }),
    collectionItem({ id: "b", status: "archived", updatedAt: "2026-06-01T00:00:00Z" }),
    collectionItem({ id: "c", status: "suggested", updatedAt: "2026-03-01T00:00:00Z" })
  ];
  const { recent, rest } = splitCollectionsByRecency(collections, [], 5);
  assert.deepEqual(recent.map((c) => c.id), ["a"]);
  assert.deepEqual(rest, []);
});

test("captureFieldRationale surfaces the no-collection rationale while nothing is selected", () => {
  const { captureFieldRationale } = loadCapturePresentation();
  const noCollection = capture({
    linkedCollections: [],
    fieldRationales: {
      collections: [
        {
          collectionId: null,
          selectionLabel: "No collection",
          text: "No collection because it's a one-off clip, not a recurring topic you save"
        }
      ]
    }
  });
  const insight = captureFieldRationale(noCollection, "collection", {
    collectionSelectionIds: []
  });
  assert.equal(insight.field, "collection");
  assert.equal(insight.title, "AI insight");
  assert.equal(
    insight.text,
    "No collection because it's a one-off clip, not a recurring topic you save"
  );
  assert.equal(insight.visible, true);
});

test("captureFieldRationale hides the no-collection insight once a collection is selected", () => {
  const { captureFieldRationale } = loadCapturePresentation();
  const noCollection = capture({
    linkedCollections: [],
    fieldRationales: {
      collections: [
        {
          collectionId: null,
          selectionLabel: "No collection",
          text: "No collection because it's a one-off clip, not a recurring topic you save"
        }
      ]
    }
  });
  const insight = captureFieldRationale(noCollection, "collection", {
    collectionSelectionIds: ["collection-a"]
  });
  // Text stays available so the block can render through its collapse animation,
  // but it is no longer "current" so visibility flips off to drive the close.
  assert.equal(insight.text, "No collection because it's a one-off clip, not a recurring topic you save");
  assert.equal(insight.visible, false);
});

test("captureFieldRationale keeps the AI-pick insight visible while its collection stays selected", () => {
  const { captureFieldRationale } = loadCapturePresentation();
  const picked = capture({
    linkedCollections: [
      {
        id: "collection-a",
        createdBy: "analysis",
        rationale: "I picked Recipes because the capture gives cooking steps."
      }
    ],
    fieldRationales: {
      collections: [
        {
          collectionId: "collection-a",
          text: "I picked Recipes because the capture gives cooking steps."
        }
      ]
    }
  });
  assert.equal(
    captureFieldRationale(picked, "collection", { collectionSelectionIds: ["collection-a"] }).visible,
    true
  );
  assert.equal(
    captureFieldRationale(picked, "collection", { collectionSelectionIds: ["collection-b"] }).visible,
    false
  );
});
