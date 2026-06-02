const assert = require("node:assert/strict");
const test = require("node:test");

const {
  LOCAL_PROCESSING_GRACE_MS,
  captureIdentityAliases,
  capturesForListMode,
  capturesForSearchScope,
  capturesShareIdentity,
  displayStatus,
  extractHttpUrl,
  hostFromUrl,
  mapSearchCandidates,
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

test("reviewReasons prioritizes unresolved review causes and confirmed reviews stay ready", () => {
  assert.deepEqual(
    reviewReasons(capture({ confidenceLabel: "Maybe", collectionDecisions: [{ title: "Ideas" }] })),
    ["intent"]
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

test("review targets drive needs-review state and clear independently", () => {
  assert.deepEqual(
    reviewTargetsForCapture(capture({ reviewTargets: ["collections", "intent", "collections"] })),
    ["collections", "intent"]
  );
  assert.equal(
    displayStatus(capture({ status: "needs_review", reviewTargets: ["collections"] })),
    "needs_review"
  );
  assert.equal(
    displayStatus(capture({ status: "needs_review", reviewTargets: [] })),
    "ready"
  );
  assert.deepEqual(
    reviewReasons(capture({ status: "needs_review", reviewTargets: ["reminder"] })),
    ["reminder"]
  );
});

test("displayStatus keeps extracted failed captures visible as ready but blocks pending review", () => {
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
