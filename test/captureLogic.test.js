const assert = require("node:assert/strict");
const test = require("node:test");

const {
  LOCAL_PROCESSING_GRACE_MS,
  captureIdentityAliases,
  captureFieldRationaleVisible,
  captureIntentPatchBody,
  collectionCollageSlots,
  capturesForListMode,
  capturesForSearchScope,
  capturesShareIdentity,
  captureFieldState,
  collectionSelectionActionState,
  displayStatus,
  extractHttpUrl,
  hostFromUrl,
  mapSearchCandidates,
  mapSearchCandidatesForVisitTarget,
  mapsSearchUrls,
  mergeRemoteCaptures,
  mergeSearchResults,
  normalizeIntent,
  normalizeSearchQuery,
  parseCaptureUrl,
  reviewReasonSummary,
  reviewReasons,
  reviewTargetsForCapture,
  searchCacheKey,
  statusLabel,
  uniqueCapturesByIdentity
} = require("../app/captureLogic");

function capture(overrides = {}) {
  return {
    id: "capture-a",
    status: "ready",
    createdAt: 1000,
    updatedAt: 1000,
    archivedAt: null,
    deletedAt: null,
    deletePurgeAfter: null,
    defaultIntent: "remember",
    summary: "A saved reference",
    analysisProvider: "openai",
    collectionDecisions: [],
    reviewConfirmedAt: null,
    ...overrides
  };
}

test("extractHttpUrl returns the first clean http URL from shared text", () => {
  assert.equal(
    extractHttpUrl("Read this: https://example.com/path?q=1)."),
    "https://example.com/path?q=1"
  );
  assert.equal(extractHttpUrl("mailto:person@example.com"), "");
  assert.equal(hostFromUrl("https://www.example.com/a"), "example.com");
});

test("parseCaptureUrl extracts deep-link capture ids", () => {
  assert.equal(parseCaptureUrl("preciouscaptures://capture/local%20id?from=notification"), "local id");
  assert.equal(parseCaptureUrl("https://example.com/capture/local-id"), null);
});

test("mapsSearchUrls creates Google and Apple Maps search links from a query", () => {
  assert.deepEqual(
    mapsSearchUrls("Sanwits Ribeye Caldereta sandwich"),
    {
      google: "https://www.google.com/maps/search/?api=1&query=Sanwits%20Ribeye%20Caldereta%20sandwich",
      apple: "https://maps.apple.com/?q=Sanwits%20Ribeye%20Caldereta%20sandwich"
    }
  );
  assert.deepEqual(mapsSearchUrls("  "), { google: "", apple: "" });
});

test("mapSearchCandidates uses native providers and omits unavailable platform providers", () => {
  assert.deepEqual(
    mapSearchCandidates("Sanwits Ribeye Caldereta sandwich", "android"),
    [
      {
        provider: "google",
        label: "Google Maps",
        url: "geo:0,0?q=Sanwits%20Ribeye%20Caldereta%20sandwich"
      }
    ]
  );
  assert.deepEqual(mapSearchCandidates("  ", "android"), []);
  assert.equal(
    mapSearchCandidates("Sanwits", "android").some((candidate) => candidate.provider === "apple"),
    false
  );
});

test("mapSearchCandidatesForVisitTarget prefers the visit target name over the long query", () => {
  assert.deepEqual(
    mapSearchCandidatesForVisitTarget(
      {
        name: "Out of Control Vintage",
        query:
          "Out of Control Vintage — popup at St. Anthony's Flea Market, 154 Sullivan Street, SOHO, NYC"
      },
      "android"
    ),
    [
      {
        provider: "google",
        label: "Google Maps",
        url: "geo:0,0?q=Out%20of%20Control%20Vintage"
      }
    ]
  );
  assert.deepEqual(
    mapSearchCandidatesForVisitTarget({ name: "", query: "154 Sullivan Street" }, "android"),
    [
      {
        provider: "google",
        label: "Google Maps",
        url: "geo:0,0?q=154%20Sullivan%20Street"
      }
    ]
  );
});

test("mapSearchCandidatesForVisitTarget uses Google place id when resolved", () => {
  assert.deepEqual(
    mapSearchCandidatesForVisitTarget(
      {
        name: "Love's Club",
        query: "Love's Club 106 Melrose St Brooklyn NY",
        resolvedPlace: {
          status: "resolved",
          placeId: "places-love-club",
          displayName: "Love's Club",
          formattedAddress: "106 Melrose St, Brooklyn, NY",
          location: { latitude: 40.703, longitude: -73.93 }
        }
      },
      "android"
    ),
    [
      {
        provider: "google",
        label: "Google Maps",
        url: "https://www.google.com/maps/search/?api=1&query=Love's%20Club&query_place_id=places-love-club"
      }
    ]
  );
});

test("reviewReasons ignores field uncertainty and keeps confirmed reviews ready", () => {
  assert.deepEqual(
    reviewReasons(capture({ confidenceLabel: "Maybe", collectionDecisions: [{ title: "Ideas" }] })),
    []
  );
  assert.equal(
    reviewReasonSummary(["intent", "analysis"]),
    "Intent uncertain, Analysis needs review"
  );
  assert.deepEqual(
    reviewReasons(capture({ status: "needs_review", needsReview: true, reviewConfirmedAt: Date.now() })),
    []
  );
});

test("only analysis review targets drive visible needs-review state", () => {
  assert.deepEqual(
    reviewTargetsForCapture(capture({ reviewTargets: ["collections", "intent", "collections"] })),
    []
  );
  assert.equal(
    displayStatus(capture({ status: "needs_review", reviewTargets: ["collections"] })),
    "ready"
  );
  assert.equal(
    displayStatus(capture({ status: "needs_review", reviewTargets: [] })),
    "ready"
  );
  assert.deepEqual(
    reviewReasons(capture({ status: "needs_review", reviewTargets: ["reminder"] })),
    []
  );
  assert.deepEqual(
    reviewReasons(capture({ status: "needs_review", reviewTargets: ["analysis"] })),
    ["analysis"]
  );
});

test("collection selection action ignores field review targets", () => {
  const pendingNoCollection = capture({
    status: "needs_review",
    reviewTargets: ["collections"],
    linkedCollections: []
  });
  assert.deepEqual(
    collectionSelectionActionState(pendingNoCollection, []),
    {
      pendingReview: false,
      selectionChanged: false,
      shouldSave: false,
      label: "Done"
    }
  );

  const pendingExistingCollection = capture({
    status: "needs_review",
    reviewTargets: ["collections"],
    linkedCollections: [{ id: "collection-a" }]
  });
  assert.deepEqual(
    collectionSelectionActionState(pendingExistingCollection, ["collection-a"]),
    {
      pendingReview: false,
      selectionChanged: false,
      shouldSave: false,
      label: "Done"
    }
  );
  assert.deepEqual(
    collectionSelectionActionState(pendingExistingCollection, []),
    {
      pendingReview: false,
      selectionChanged: true,
      shouldSave: true,
      label: "Save collections"
    }
  );
  assert.deepEqual(
    collectionSelectionActionState(capture({ linkedCollections: [] }), []),
    {
      pendingReview: false,
      selectionChanged: false,
      shouldSave: false,
      label: "Done"
    }
  );
});

test("field rationale visibility follows current AI-selected field values", () => {
  assert.equal(
    captureFieldRationaleVisible(
      capture({
        defaultIntent: "learn",
        aiDefaultIntent: "learn",
        intentRationale: "I chose Learn because the capture explains a method.",
        fieldRationales: {
          purpose: {
            selectionKey: "learn",
            text: "I chose Learn because the capture explains a method."
          }
        }
      }),
      "purpose",
      { allowedIntents: ["learn", "read"] }
    ),
    true
  );
  assert.equal(
    captureFieldRationaleVisible(
      capture({
        defaultIntent: "read",
        aiDefaultIntent: "learn",
        intentRationale: "I chose Learn because the capture explains a method.",
        fieldRationales: {
          purpose: {
            selectionKey: "learn",
            text: "I chose Learn because the capture explains a method."
          }
        }
      }),
      "purpose",
      { allowedIntents: ["learn", "read"] }
    ),
    false
  );
  assert.equal(
    captureFieldRationaleVisible(
      capture({
        defaultIntent: null,
        aiDefaultIntent: null,
        fieldRationales: {
          purpose: {
            selectionKey: null,
            selectionLabel: "No intent",
            text: "No intent because no concrete action is clear."
          }
        }
      }),
      "purpose",
      { allowedIntents: ["learn", "read"] }
    ),
    true
  );
  assert.equal(
    captureFieldRationaleVisible(
      capture({
        defaultIntent: "learn",
        aiDefaultIntent: null,
        fieldRationales: {
          purpose: {
            selectionKey: null,
            selectionLabel: "No intent",
            text: "No intent because no concrete action is clear."
          }
        }
      }),
      "purpose",
      { allowedIntents: ["learn", "read"] }
    ),
    false
  );

  const collectionCapture = capture({
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
    captureFieldRationaleVisible(collectionCapture, "collection", {
      collectionSelectionIds: ["collection-a"]
    }),
    true
  );
  assert.equal(
    captureFieldRationaleVisible(collectionCapture, "collection", {
      collectionSelectionIds: ["collection-b"]
    }),
    false
  );
  assert.equal(
    captureFieldRationaleVisible(
      capture({
        linkedCollections: [],
        fieldRationales: {
          collections: [
            {
              collectionId: null,
              selectionLabel: "No collection",
              text: "No collection because no saved Collection strongly matches."
            }
          ]
        }
      }),
      "collection",
      { collectionSelectionIds: [] }
    ),
    true
  );
  assert.equal(
    captureFieldRationaleVisible(
      capture({
        linkedCollections: [],
        fieldRationales: {
          collections: [
            {
              collectionId: null,
              selectionLabel: "No collection",
              text: "No collection because no saved Collection strongly matches."
            }
          ]
        }
      }),
      "collection",
      { collectionSelectionIds: ["collection-a"] }
    ),
    false
  );

  assert.equal(
    captureFieldRationaleVisible(
      capture({
        suggestedReminders: [
          {
            trigger_value: "June 5",
            start_date: "2026-06-05",
            end_date: "2026-06-05",
            rationale: "I suggested June 5 because the event starts then.",
            source: "analysis"
          }
        ],
        fieldRationales: {
          reminder: {
            triggerValue: "June 5",
            startDate: "2026-06-05",
            endDate: "2026-06-05",
            text: "I suggested June 5 because the event starts then."
          }
        }
      }),
      "later"
    ),
    true
  );
  assert.equal(
    captureFieldRationaleVisible(
      capture({
        suggestedReminders: [
          {
            trigger_value: "June 6",
            start_date: "2026-06-06",
            end_date: "2026-06-06",
            rationale: "I suggested June 5 because the event starts then.",
            source: "ai_prefill"
          }
        ],
        fieldRationales: {
          reminder: {
            triggerValue: "June 5",
            startDate: "2026-06-05",
            endDate: "2026-06-05",
            text: "I suggested June 5 because the event starts then."
          }
        }
      }),
      "later"
    ),
    false
  );
  assert.equal(
    captureFieldRationaleVisible(
      capture({
        suggestedReminders: [
          {
            trigger_value: "June 5",
            start_date: "2026-06-05",
            end_date: "2026-06-05",
            rationale: "I suggested June 5 because the event starts then.",
            source: "manual"
          }
        ],
        fieldRationales: {
          reminder: {
            triggerValue: "June 5",
            startDate: "2026-06-05",
            endDate: "2026-06-05",
            text: "I suggested June 5 because the event starts then."
          }
        }
      }),
      "later"
    ),
    false
  );
  assert.equal(
    captureFieldRationaleVisible(
      capture({
        suggestedReminders: [],
        fieldRationales: {
          reminder: {
            triggerValue: "No Reminder idea",
            startDate: null,
            endDate: null,
            startTime: null,
            endTime: null,
            text: "No Reminder idea because no future date appears."
          }
        }
      }),
      "later"
    ),
    true
  );
  assert.equal(
    captureFieldRationaleVisible(
      capture({
        suggestedReminders: [
          {
            trigger_value: "June 5",
            start_date: "2026-06-05",
            end_date: "2026-06-05",
            rationale: "Manual reminder",
            source: "manual"
          }
        ],
        fieldRationales: {
          reminder: {
            triggerValue: "No Reminder idea",
            startDate: null,
            endDate: null,
            startTime: null,
            endTime: null,
            text: "No Reminder idea because no future date appears."
          }
        }
      }),
      "later"
    ),
    false
  );
});

test("collectionCollageSlots returns up to four unique preview captures", () => {
  const captures = [
    { id: "a", title: "A", thumbnailUrl: "https://example.com/a.jpg" },
    { id: "b", title: "B", imageAssetUrl: "https://example.com/b.jpg" },
    { id: "a", title: "A duplicate", thumbnailUrl: "https://example.com/a2.jpg" },
    { id: "c", title: "C", thumbnailUrl: "https://example.com/c.jpg" },
    { id: "d", title: "D", thumbnailUrl: "https://example.com/d.jpg" },
    { id: "e", title: "E", thumbnailUrl: "https://example.com/e.jpg" }
  ];
  assert.deepEqual(
    collectionCollageSlots(captures).map((item) => item.id),
    ["a", "b", "c", "d"]
  );
  assert.deepEqual(collectionCollageSlots(null), []);
});

test("collectionCollageSlots skips captures without usable thumbnail media", () => {
  const captures = [
    { id: "a", title: "A" },
    { id: "b", title: "B", thumbnailUrl: "" },
    { id: "c", title: "C", thumbnail_url: "https://example.com/c.jpg" },
    { id: "d", title: "D", urlEvidenceImageUrl: "https://example.com/d.jpg" }
  ];
  assert.deepEqual(
    collectionCollageSlots(captures).map((item) => item.id),
    ["c", "d"]
  );
});

test("capture fields show selected values before add labels", () => {
  assert.deepEqual(
    captureFieldState({
      kind: "purpose",
      value: "Read",
      emptyLabel: "Add intent"
    }),
    {
      kind: "purpose",
      value: "Read",
      displayValue: "Read",
      hasValue: true,
      isEmpty: false,
      canEdit: true
    }
  );

  assert.equal(
    captureFieldState({
      kind: "collection",
      value: "Restaurants",
      emptyLabel: "Add collection"
    }).displayValue,
    "Restaurants"
  );
  assert.equal(
    captureFieldState({
      kind: "later",
      value: "Tomorrow",
      emptyLabel: "Add reminder"
    }).hasValue,
    true
  );
});

test("capture fields fall back to add labels when empty", () => {
  const intentField = captureFieldState({
    kind: "purpose",
    value: "",
    emptyLabel: "Add intent"
  });
  assert.equal(intentField.displayValue, "Add intent");
  assert.equal(intentField.hasValue, false);

  assert.equal(
    captureFieldState({ kind: "collection", emptyLabel: "Add collection" }).displayValue,
    "Add collection"
  );
  assert.equal(
    captureFieldState({ kind: "later", emptyLabel: "Add reminder" }).displayValue,
    "Add reminder"
  );
});

test("capture intent patch body uses direct field editing contract", () => {
  assert.deepEqual(
    captureIntentPatchBody("capture-123", "watch"),
    {
      captureId: "capture-123",
      currentSaveIntent: "watch"
    }
  );
  assert.deepEqual(
    captureIntentPatchBody("capture-123", null),
    {
      captureId: "capture-123",
      currentSaveIntent: null
    }
  );
  assert.equal(Object.hasOwn(captureIntentPatchBody("capture-123", "read"), "action"), false);
  assert.equal(Object.hasOwn(captureIntentPatchBody("capture-123", "read"), "resolvedTargets"), false);
});

test("displayStatus keeps extracted failed captures visible as ready but blocks analysis review", () => {
  assert.equal(displayStatus(capture({ status: "failed", summary: "Recovered extraction" })), "ready");
  assert.equal(displayStatus(capture({ status: "needs_review", needsReview: true })), "needs_review");
  assert.equal(statusLabel("failed"), "Failed");
});

test("mergeRemoteCaptures preserves only fresh local processing rows in the active list", () => {
  const now = 10_000_000;
  const remote = [
    capture({ id: "remote", createdAt: now - 1000 }),
    capture({ id: "archived-remote", archivedAt: now - 900, createdAt: now - 900 })
  ];
  const freshLocal = capture({ id: "fresh-local", status: "processing", createdAt: now - 5000 });
  const staleLocal = capture({
    id: "stale-local",
    status: "processing",
    createdAt: now - LOCAL_PROCESSING_GRACE_MS - 1
  });
  const deletedLocal = capture({
    id: "deleted-local",
    status: "processing",
    deletedAt: now,
    createdAt: now - 4000
  });

  assert.deepEqual(
    mergeRemoteCaptures(remote, [freshLocal, staleLocal, deletedLocal], "active", now).map((item) => item.id),
    ["remote", "fresh-local"]
  );
  assert.deepEqual(
    mergeRemoteCaptures(remote, [freshLocal], "archived", now).map((item) => item.id),
    []
  );
});

test("capture scope helpers keep only active captures visible", () => {
  const active = capture({ id: "active", archivedAt: null });
  const archived = capture({ id: "archived", archivedAt: 1234 });
  const deleted = capture({ id: "deleted", deletedAt: 2345, deletePurgeAfter: 3456 });
  const rejected = capture({ id: "rejected", rejectedAt: 5678, analysisMode: "contextless_rejected" });
  const rows = [active, archived, deleted, rejected];

  assert.deepEqual(capturesForListMode(rows, "active").map((item) => item.id), ["active"]);
  assert.deepEqual(capturesForListMode(rows, "archived").map((item) => item.id), []);
  assert.deepEqual(capturesForSearchScope(rows, "active").map((item) => item.id), ["active"]);
  assert.deepEqual(capturesForSearchScope(rows, "archived").map((item) => item.id), ["active"]);
  assert.deepEqual(capturesForSearchScope(rows, "all").map((item) => item.id), ["active"]);
});

test("capture identity aliases compare local and remote ids without source dedupe", () => {
  assert.deepEqual(captureIdentityAliases({ id: "client-a", remoteId: "remote-a" }), ["client-a", "remote-a"]);
  assert.equal(
    capturesShareIdentity(
      { id: "client-a", remoteId: "remote-a" },
      { id: "remote-a", remoteId: "server-row" }
    ),
    true
  );
  assert.equal(
    capturesShareIdentity(
      { id: "client-a", remoteId: "remote-a", sourceUrl: "https://example.com/post" },
      { id: "client-b", remoteId: "remote-b", sourceUrl: "https://example.com/post" }
    ),
    false
  );
});

test("mergeRemoteCaptures suppresses matching local processing aliases", () => {
  const now = 10_000_000;
  const remote = [
    capture({ id: "client-key", remoteId: "remote-row", createdAt: now - 1000 }),
    capture({ id: "remote-cached", remoteId: "remote-id", createdAt: now - 2000 })
  ];
  const localSameClientKey = capture({ id: "client-key", status: "processing", createdAt: now - 500 });
  const localSameRemoteId = capture({ id: "local-cached", remoteId: "remote-id", status: "processing", createdAt: now - 600 });
  const unrelated = capture({ id: "fresh-local", status: "processing", createdAt: now - 700 });

  assert.deepEqual(
    mergeRemoteCaptures(remote, [localSameClientKey, localSameRemoteId, unrelated], "active", now).map((item) => item.id),
    ["fresh-local", "client-key", "remote-cached"]
  );
});

test("rejected remote tombstones hide matching local processing rows", () => {
  const now = 10_000_000;
  const rejected = capture({
    id: "client-key",
    remoteId: "remote-row",
    status: "failed",
    analysisMode: "contextless_rejected",
    rejectedAt: now - 1000,
    createdAt: now - 1000
  });
  const localSameClientKey = capture({ id: "client-key", status: "processing", createdAt: now - 500 });
  const localSameRemoteId = capture({ id: "local-cached", remoteId: "remote-row", status: "processing", createdAt: now - 600 });
  const unrelated = capture({ id: "fresh-local", status: "processing", createdAt: now - 700 });

  assert.deepEqual(
    capturesForListMode([rejected, unrelated], "active").map((item) => item.id),
    ["fresh-local"]
  );
  assert.deepEqual(
    mergeRemoteCaptures([rejected], [localSameClientKey, localSameRemoteId, unrelated], "active", now).map((item) => item.id),
    ["fresh-local"]
  );
});

test("uniqueCapturesByIdentity keeps the first startup row and suppresses aliases", () => {
  const cached = capture({ id: "client-key", remoteId: "remote-row", status: "ready", createdAt: 2000 });
  const localProcessing = capture({ id: "client-key", status: "processing", createdAt: 3000 });
  const sameRemote = capture({ id: "local-copy", remoteId: "remote-row", status: "processing", createdAt: 2500 });
  const repeatedSource = capture({ id: "separate-save", remoteId: "remote-other", sourceUrl: "https://example.com/post" });

  assert.deepEqual(
    uniqueCapturesByIdentity([cached, localProcessing, sameRemote, repeatedSource]).map((item) => item.id),
    ["client-key", "separate-save"]
  );
});

test("search cache keys normalize scope and query whitespace", () => {
  assert.equal(normalizeSearchQuery("  Ramen   Soho  "), "ramen soho");
  assert.equal(searchCacheKey("active", "  Ramen   Soho  "), "active:ramen soho");
  assert.equal(searchCacheKey("unknown", "products"), "active:products");
  assert.equal(searchCacheKey("all", "products"), "active:products");
  assert.equal(searchCacheKey("all", "  "), "");
});

test("mergeSearchResults keeps visible results first and appends remote-only matches", () => {
  const local = [
    capture({ id: "local-title", title: "Local title" }),
    capture({ id: "shared", title: "Shared local" })
  ];
  const ranked = [
    capture({ id: "semantic", title: "Semantic match" }),
    capture({ id: "shared", title: "Shared semantic" })
  ];
  assert.deepEqual(
    mergeSearchResults(local, ranked).map((item) => item.id),
    ["local-title", "shared", "semantic"]
  );
  assert.equal(
    mergeSearchResults(local, ranked).find((item) => item.id === "shared").title,
    "Shared local"
  );
});

test("mergeSearchResults dedupes aliases without collapsing repeated sources", () => {
  const local = [
    capture({ id: "client-a", remoteId: "remote-a", title: "Visible local" }),
    capture({ id: "same-url-a", remoteId: "remote-url-a", sourceUrl: "https://example.com/post" })
  ];
  const ranked = [
    capture({ id: "remote-a", remoteId: "server-a", title: "Remote alias" }),
    capture({ id: "same-url-b", remoteId: "remote-url-b", sourceUrl: "https://example.com/post" })
  ];
  assert.deepEqual(
    mergeSearchResults(local, ranked).map((item) => item.id),
    ["client-a", "same-url-a", "same-url-b"]
  );
});

test("normalizeIntent only accepts configured intent keys", () => {
  assert.equal(normalizeIntent("remember", ["remember", "compare"]), "remember");
  assert.equal(normalizeIntent("Remember", ["remember", "compare"]), "");
  assert.equal(normalizeIntent(undefined, ["remember"]), "");
});
