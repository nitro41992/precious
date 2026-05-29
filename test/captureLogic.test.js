const assert = require("node:assert/strict");
const test = require("node:test");

const {
  LOCAL_PROCESSING_GRACE_MS,
  displayStatus,
  extractHttpUrl,
  hostFromUrl,
  mapSearchCandidates,
  mapsSearchUrls,
  mergeRemoteCaptures,
  normalizeIntent,
  parseCaptureUrl,
  reviewReasonSummary,
  reviewReasons,
  statusLabel
} = require("../app/captureLogic");

function capture(overrides = {}) {
  return {
    id: "capture-a",
    status: "ready",
    createdAt: 1000,
    updatedAt: 1000,
    archivedAt: null,
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
    ["intent", "collection"]
  );
  assert.equal(
    reviewReasonSummary(["intent", "collection", "analysis"]),
    "Intent uncertain, Collection suggestions, Analysis needs review"
  );
  assert.deepEqual(
    reviewReasons(capture({ status: "needs_review", needsReview: true, reviewConfirmedAt: Date.now() })),
    []
  );
});

test("displayStatus keeps extracted failed captures visible as ready but blocks pending review", () => {
  assert.equal(displayStatus(capture({ status: "failed", summary: "Recovered extraction" })), "ready");
  assert.equal(displayStatus(capture({ status: "needs_review", needsReview: true })), "needs_review");
  assert.equal(statusLabel("failed"), "Failed");
});

test("mergeRemoteCaptures preserves only fresh local processing rows in the active list", () => {
  const now = 10_000_000;
  const remote = [capture({ id: "remote", createdAt: now - 1000 })];
  const freshLocal = capture({ id: "fresh-local", status: "processing", createdAt: now - 5000 });
  const staleLocal = capture({
    id: "stale-local",
    status: "processing",
    createdAt: now - LOCAL_PROCESSING_GRACE_MS - 1
  });
  const archivedLocal = capture({
    id: "archived-local",
    status: "processing",
    archivedAt: now,
    createdAt: now - 4000
  });

  assert.deepEqual(
    mergeRemoteCaptures(remote, [freshLocal, staleLocal, archivedLocal], "active", now).map((item) => item.id),
    ["remote", "fresh-local"]
  );
  assert.deepEqual(
    mergeRemoteCaptures(remote, [freshLocal], "archived", now).map((item) => item.id),
    ["remote"]
  );
});

test("normalizeIntent only accepts configured intent keys", () => {
  assert.equal(normalizeIntent("remember", ["remember", "compare"]), "remember");
  assert.equal(normalizeIntent("Remember", ["remember", "compare"]), "");
  assert.equal(normalizeIntent(undefined, ["remember"]), "");
});
