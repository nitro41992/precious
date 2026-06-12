const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const ts = require("typescript");

let remoteData;

function loadRemoteData() {
  if (remoteData) return remoteData;
  const sourcePath = join(__dirname, "../app/remoteData.ts");
  const source = readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    },
    fileName: sourcePath
  }).outputText;
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier === "./captureLogic") return require("../app/captureLogic");
    if (specifier === "./capturePresentation") {
      return {
        remoteImageAsset(row, role = "capture_media") {
          return Array.isArray(row.capture_assets)
            ? row.capture_assets.find((asset) => (asset.asset_role || "capture_media") === role) || null
            : null;
        },
        reviewRationaleFromRemote() {
          return undefined;
        },
        uniqueCaptures(captures) {
          return captures;
        },
        // remoteData re-exports these from capturePresentation; mirror them here so the stub
        // resolves the re-export. Kept in lockstep with capturePresentation's definitions.
        suggestedLinkedCollection(capture) {
          return (capture.linkedCollections || []).find((collection) => collection.status === "suggested") || null;
        },
        activeLinkedCollections(capture) {
          return (capture.linkedCollections || []).filter((collection) => collection.status !== "suggested");
        }
      };
    }
    return require(specifier);
  };
  Function("require", "module", "exports", compiled)(
    localRequire,
    module,
    module.exports
  );
  remoteData = module.exports;
  return remoteData;
}

test("captureFromRemote keeps failed OpenAI rows failed even when provider is present", () => {
  const { captureFromRemote } = loadRemoteData();
  const capture = captureFromRemote({
    id: "remote-capture",
    client_capture_key: "client-capture",
    created_at: "2026-06-05T07:21:09.169Z",
    updated_at: "2026-06-05T07:21:10.914Z",
    processed_at: "2026-06-05T07:21:10.914Z",
    display_title: "Screenshot (Jun 5, 2026 3:20:59 AM)",
    source_text: "Screenshot (Jun 5, 2026 3:20:59 AM)",
    capture_type: "image",
    analysis_state: "failed",
    analysis_mode: "llm_failed",
    analysis_provider: "openai",
    analysis_model: "gpt-5-mini",
    analysis_error:
      "Unsupported value: 'minimal' is not supported with the 'gpt-5-mini' model.",
    analysis: null
  });

  assert.equal(capture.status, "failed");
  assert.equal(capture.analysisError, "Unsupported value: 'minimal' is not supported with the 'gpt-5-mini' model.");
  assert.equal(capture.analysisProvider, "openai");
});

test("captureFromRemote still maps successful OpenAI rows to ready", () => {
  const { captureFromRemote } = loadRemoteData();
  const capture = captureFromRemote({
    id: "ready-remote-capture",
    client_capture_key: "ready-client-capture",
    created_at: "2026-06-05T07:22:09.169Z",
    updated_at: "2026-06-05T07:22:10.914Z",
    processed_at: "2026-06-05T07:22:10.914Z",
    display_title: "Saved guide",
    source_text: "A useful saved guide",
    capture_type: "text_note",
    analysis_state: "ready",
    analysis_mode: "llm",
    analysis_provider: "openai",
    analysis_model: "gpt-5-mini",
    analysis: {
      summary: "A useful saved guide.",
      default_intent: {
        category: "read",
        confidence: 0.82,
        rationale: "The saved content is a guide to read later."
      },
      entities: [],
      suggested_reminders: [],
      collection_decisions: [],
      search_phrases: []
    }
  });

  assert.equal(capture.status, "ready");
  assert.equal(capture.defaultIntent, "read");
  assert.equal(capture.analysisProvider, "openai");
});

test("captureFromRemote prefers analyzer title over source-only persisted titles", () => {
  const { captureFromRemote } = loadRemoteData();
  const capture = captureFromRemote({
    id: "source-title-capture",
    client_capture_key: "source-title-client",
    created_at: "2026-06-05T15:19:09.169Z",
    updated_at: "2026-06-05T15:19:10.914Z",
    display_title: "Saved from instagram.com",
    title: "instagram.com",
    source_url: "https://www.instagram.com/reel/abc123/",
    capture_type: "social_post",
    analysis_state: "ready",
    analysis: {
      display_title: "Modly local photo-to-3D model tool",
      summary: "A local open-source photo-to-3D mesh generation tool.",
      default_intent: {
        category: "learn",
        confidence: 0.82,
        rationale: "The capture explains a tool."
      },
      entities: [],
      suggested_reminders: [],
      collection_decisions: [],
      search_phrases: []
    }
  });

  assert.equal(capture.title, "Modly local photo-to-3D model tool");
});

test("captureFromRemote falls back to generic copy when only source metadata exists", () => {
  const { captureFromRemote } = loadRemoteData();
  const capture = captureFromRemote({
    id: "source-only-capture",
    client_capture_key: "source-only-client",
    created_at: "2026-06-05T15:19:09.169Z",
    updated_at: "2026-06-05T15:19:10.914Z",
    display_title: "instagram.com",
    source_url: "https://www.instagram.com/reel/abc123/",
    capture_type: "social_post",
    analysis_state: "ready",
    analysis: {
      display_title: "Saved from instagram.com",
      summary: "",
      default_intent: { category: null, confidence: 0, rationale: "" },
      entities: [],
      suggested_reminders: [],
      collection_decisions: [],
      search_phrases: []
    }
  });

  assert.equal(capture.title, "Saved link");
});

test("captureFromRemote maps structured field rationales", () => {
  const { captureFromRemote } = loadRemoteData();
  const capture = captureFromRemote({
    id: "structured-rationale-capture",
    client_capture_key: "structured-rationale-client",
    created_at: "2026-06-05T07:22:09.169Z",
    updated_at: "2026-06-05T07:22:10.914Z",
    display_title: "Saved guide",
    source_text: "A useful saved guide",
    analysis_state: "ready",
    analysis_provider: "openai",
    current_save_intent: "learn",
    linked_collections: [
      {
        id: "collection-a",
        title: "Articles & Guides",
        created_by: "analysis",
        rationale: "I picked Articles & Guides because it explains the workflow."
      }
    ],
    analysis: {
      default_intent: {
        category: "learn",
        confidence: 0.82,
        rationale: "I chose Learn because it explains the workflow."
      },
      field_rationales: {
        purpose: {
          selection_key: "learn",
          selection_label: "Learn",
          text: "I chose Learn because it explains the workflow."
        },
        collections: [
          {
            collection_id: "collection-a",
            selection_label: "Articles & Guides",
            text: "I picked Articles & Guides because it explains the workflow."
          }
        ],
        reminder: {
          trigger_value: "June 12",
          start_date: "2026-06-12",
          end_date: "2026-06-12",
          start_time: null,
          end_time: null,
          text: "I suggested June 12 because the event starts then."
        }
      },
      suggested_reminders: [
        {
          trigger_type: "time",
          trigger_value: "June 12",
          start_date: "2026-06-12",
          end_date: "2026-06-12",
          rationale: "I suggested June 12 because the event starts then.",
          confidence: 0.82,
          source: "analysis"
        }
      ],
      entities: [],
      collection_decisions: [],
      search_phrases: []
    }
  });

  assert.deepEqual(capture.fieldRationales, {
    purpose: {
      selectionKey: "learn",
      selectionLabel: "Learn",
      text: "I chose Learn because it explains the workflow."
    },
    collections: [
      {
        collectionId: "collection-a",
        selectionLabel: "Articles & Guides",
        text: "I picked Articles & Guides because it explains the workflow."
      }
    ],
    reminder: {
      triggerValue: "June 12",
      startDate: "2026-06-12",
      endDate: "2026-06-12",
      startTime: null,
      endTime: null,
      text: "I suggested June 12 because the event starts then."
    }
  });
});

test("captureFromRemote preserves no-choice field rationales", () => {
  const { captureFromRemote } = loadRemoteData();
  const capture = captureFromRemote({
    id: "no-choice-rationale-capture",
    client_capture_key: "no-choice-rationale-client",
    created_at: "2026-06-05T07:22:09.169Z",
    updated_at: "2026-06-05T07:22:10.914Z",
    display_title: "Saved note",
    source_text: "Useful but not clearly actionable.",
    analysis_state: "ready",
    analysis_provider: "openai",
    current_save_intent: null,
    linked_collections: [],
    analysis: {
      default_intent: {
        category: null,
        confidence: 0,
        rationale: "No intent because no concrete action is clear."
      },
      field_rationales: {
        purpose: {
          selection_key: null,
          selection_label: "No intent",
          text: "No intent because no concrete action is clear."
        },
        collections: [
          {
            collection_id: null,
            selection_label: "No collection",
            text: "No collection because no saved Collection strongly matches."
          }
        ],
        reminder: {
          trigger_value: "No Reminder idea",
          start_date: null,
          end_date: null,
          start_time: null,
          end_time: null,
          text: "No Reminder idea because no future date appears."
        }
      },
      suggested_reminders: [],
      entities: [],
      collection_decisions: [],
      search_phrases: []
    }
  });

  assert.deepEqual(capture.fieldRationales, {
    purpose: {
      selectionKey: null,
      selectionLabel: "No intent",
      text: "No intent because no concrete action is clear."
    },
    collections: [
      {
        collectionId: null,
        selectionLabel: "No collection",
        text: "No collection because no saved Collection strongly matches."
      }
    ],
    reminder: {
      triggerValue: "No Reminder idea",
      startDate: null,
      endDate: null,
      startTime: null,
      endTime: null,
      text: "No Reminder idea because no future date appears."
    }
  });
});

test("captureFromRemote separates user media from source preview media", () => {
  const { captureFromRemote } = loadRemoteData();
  const capture = captureFromRemote({
    id: "preview-capture",
    client_capture_key: "preview-client-capture",
    created_at: "2026-06-05T07:22:09.169Z",
    updated_at: "2026-06-05T07:22:10.914Z",
    display_title: "Instagram reel",
    source_url: "https://www.instagram.com/reel/abc123/",
    capture_type: "social_post",
    analysis_state: "ready",
    capture_assets: [
      {
        asset_role: "source_preview",
        mime_type: "image/webp",
        signed_url: "https://storage.example.com/source-preview.webp",
        signed_url_cache_key: "user/capture/source-preview.webp:thumb"
      },
      {
        asset_role: "capture_media",
        mime_type: "image/png",
        signed_url: "https://storage.example.com/uploaded.png",
        signed_url_cache_key: "user/capture/uploaded.png:thumb"
      }
    ],
    analysis: {
      url_evidence: {
        image_url: "https://cdn.example.com/hotlinked.webp"
      }
    }
  });

  assert.equal(capture.imageAssetUrl, "https://storage.example.com/uploaded.png");
  assert.equal(capture.imageAssetMimeType, "image/png");
  assert.equal(capture.sourcePreviewAssetUrl, "https://storage.example.com/source-preview.webp");
  assert.equal(capture.sourcePreviewAssetCacheKey, "user/capture/source-preview.webp:thumb");
});

test("captureFromRemote can expose source preview without user media", () => {
  const { captureFromRemote } = loadRemoteData();
  const capture = captureFromRemote({
    id: "source-preview-only",
    client_capture_key: "source-preview-only",
    created_at: "2026-06-05T07:22:09.169Z",
    updated_at: "2026-06-05T07:22:10.914Z",
    display_title: "TikTok video",
    source_url: "https://www.tiktok.com/@creator/video/1234567890",
    capture_type: "social_post",
    analysis_state: "ready",
    capture_assets: [
      {
        asset_role: "source_preview",
        mime_type: "image/jpeg",
        signed_url: "https://storage.example.com/source-preview.jpg",
        signed_url_cache_key: "user/capture/source-preview.jpg:thumb"
      }
    ],
    analysis: {
      url_evidence: {
        image_url: "https://cdn.example.com/hotlinked.jpg"
      }
    }
  });

  assert.equal(capture.imageAssetUrl, undefined);
  assert.equal(capture.imageAssetMimeType, undefined);
  assert.equal(capture.sourcePreviewAssetUrl, "https://storage.example.com/source-preview.jpg");
  assert.equal(capture.sourcePreviewAssetMimeType, "image/jpeg");
});

test("captureFromRemote maps the full-res asset url and versioned cache keys", () => {
  const { captureFromRemote } = loadRemoteData();
  const capture = captureFromRemote({
    id: "full-asset-capture",
    client_capture_key: "full-asset-capture",
    created_at: "2026-06-05T07:22:09.169Z",
    updated_at: "2026-06-05T07:22:10.914Z",
    display_title: "Uploaded photo",
    capture_type: "image",
    analysis_state: "ready",
    capture_assets: [
      {
        asset_role: "capture_media",
        mime_type: "image/png",
        signed_url: "https://storage.example.com/uploaded.png?variant=detail",
        signed_url_cache_key: "user/capture/uploaded.png:detail:v2",
        signed_full_url: "https://storage.example.com/uploaded.png?variant=viewer",
        signed_full_url_cache_key: "user/capture/uploaded.png:viewer:v2"
      }
    ],
    analysis: {}
  });

  // The hero upgrade depends on the full-res variant + its distinct cache key
  // surviving the remote -> Capture mapping.
  assert.equal(capture.imageAssetUrl, "https://storage.example.com/uploaded.png?variant=detail");
  assert.equal(capture.imageAssetCacheKey, "user/capture/uploaded.png:detail:v2");
  assert.equal(capture.imageAssetFullUrl, "https://storage.example.com/uploaded.png?variant=viewer");
  assert.equal(capture.imageAssetFullCacheKey, "user/capture/uploaded.png:viewer:v2");
  assert.notEqual(capture.imageAssetCacheKey, capture.imageAssetFullCacheKey);
});

test("captureFromRemote maps a pending collection suggestion", () => {
  const { captureFromRemote } = loadRemoteData();
  const capture = captureFromRemote({
    id: "capture-1",
    source_text: "Trail running route near Boulder",
    analysis: {
      summary: "A trail run",
      pending_collection_suggestion: {
        collection_id: "11111111-1111-1111-1111-111111111111",
        title: "Trail Runs",
        description: "Routes and gear for trail running.",
        rationale: "Repeated trail-running saves.",
        confidence: 0.74
      }
    }
  });
  // A resolved suggestion is normalized into linkedCollections as a status:"suggested" entry.
  const { suggestedLinkedCollection } = loadRemoteData();
  const suggested = suggestedLinkedCollection(capture);
  assert.ok(suggested);
  assert.equal(suggested.id, "11111111-1111-1111-1111-111111111111");
  assert.equal(suggested.title, "Trail Runs");
  assert.equal(suggested.description, "Routes and gear for trail running.");
  assert.equal(suggested.confidence, 0.74);
  assert.equal(suggested.status, "suggested");
});

test("captureFromRemote leaves no suggested linkedCollection without a suggestion", () => {
  const { captureFromRemote, suggestedLinkedCollection } = loadRemoteData();
  const capture = captureFromRemote({ id: "capture-2", analysis: { summary: "x" } });
  assert.equal(suggestedLinkedCollection(capture), null);
});

test("captureFromRemote surfaces ready analysis while a suggestion is still pending", () => {
  const { captureFromRemote, suggestedLinkedCollection } = loadRemoteData();
  const capture = captureFromRemote({
    id: "capture-3",
    analysis_state: "ready",
    collection_suggestion_state: "pending",
    analysis: { summary: "A trail run", display_title: "Trail run" }
  });
  // The capture's own analysis is shown immediately; the suggestion resolves in the background.
  // While resolving there is no collection yet, so no suggested membership — only the signal.
  assert.equal(capture.status, "ready");
  assert.equal(capture.collectionSuggestionState, "pending");
  assert.equal(suggestedLinkedCollection(capture), null);
});

test("suggestedLinkedCollection / activeLinkedCollections split membership by status", () => {
  const { suggestedLinkedCollection, activeLinkedCollections } = loadRemoteData();
  const capture = {
    linkedCollections: [
      { id: "a", title: "Food", status: "active" },
      { id: "b", title: "Trail Runs", status: "suggested" },
      { id: "c", title: "Travel" } // missing status defaults to active
    ]
  };
  assert.equal(suggestedLinkedCollection(capture).id, "b");
  assert.deepEqual(activeLinkedCollections(capture).map((c) => c.id), ["a", "c"]);
});

test("captureFromRemote defaults collectionSuggestionState to none", () => {
  const { captureFromRemote } = loadRemoteData();
  const capture = captureFromRemote({
    id: "capture-4",
    analysis_state: "ready",
    analysis: { summary: "x" }
  });
  assert.equal(capture.collectionSuggestionState, "none");
});

test("collectionFromRemote preserves the suggested status", () => {
  const { collectionFromRemote } = loadRemoteData();
  const collection = collectionFromRemote({
    id: "c1",
    title: "Trail Runs",
    description: "Routes and gear.",
    status: "suggested",
    capture_count: 2
  });
  assert.equal(collection.status, "suggested");
  assert.equal(collection.captureCount, 2);
});

test("cachedCollectionPageFromRaw round-trips the suggested status", () => {
  const { cachedCollectionPageFromRaw } = loadRemoteData();
  const raw = JSON.stringify({
    collections: [
      { id: "c1", title: "Trail Runs", description: "Routes.", status: "suggested", captureCount: 1, previewCaptures: [] }
    ],
    next_cursor: null
  });
  const page = cachedCollectionPageFromRaw(raw);
  assert.equal(page.present, true);
  assert.equal(page.collections[0].status, "suggested");
});

test("pickCaptureFromRaw finds a capture by id", () => {
  const { pickCaptureFromRaw } = loadRemoteData();
  const raw = JSON.stringify([
    { id: "local-a", remoteId: "remote-a", title: "Alpha" },
    { id: "local-b", remoteId: "remote-b", title: "Bravo" }
  ]);
  const capture = pickCaptureFromRaw(raw, "local-b");
  assert.equal(capture?.title, "Bravo");
});

test("pickCaptureFromRaw matches on remoteId too", () => {
  const { pickCaptureFromRaw } = loadRemoteData();
  const raw = JSON.stringify([{ id: "local-a", remoteId: "remote-a", title: "Alpha" }]);
  const capture = pickCaptureFromRaw(raw, "remote-a");
  assert.equal(capture?.title, "Alpha");
});

test("pickCaptureFromRaw returns null when absent, empty, or malformed", () => {
  const { pickCaptureFromRaw } = loadRemoteData();
  const raw = JSON.stringify([{ id: "local-a", title: "Alpha" }]);
  assert.equal(pickCaptureFromRaw(raw, "missing"), null);
  assert.equal(pickCaptureFromRaw(null, "local-a"), null);
  assert.equal(pickCaptureFromRaw("", "local-a"), null);
  assert.equal(pickCaptureFromRaw("{not json", "local-a"), null);
  assert.equal(pickCaptureFromRaw(raw, ""), null);
});

test("eventFromRemote maps a snake_case timed event, trimming Postgres time seconds", () => {
  const { eventFromRemote } = loadRemoteData();
  const event = eventFromRemote({
    id: "evt-1",
    capture_id: "cap-9",
    title: "Rooftop film night",
    start_date: "2026-07-03",
    end_date: "2026-07-03",
    start_time: "20:00:00",
    end_time: "22:30:00",
    all_day: false,
    duration: 150,
    duration_unit: "minutes",
    date_precision: "exact",
    time_precision: "time_range",
    timezone: "America/New_York",
    source: "analysis",
    status: "detected",
    reminder_index: 0
  });
  assert.equal(event.startTime, "20:00");
  assert.equal(event.endTime, "22:30");
  assert.equal(event.allDay, false);
  assert.equal(event.captureId, "cap-9");
  assert.equal(event.durationUnit, "minutes");
  assert.equal(event.source, "analysis");
});

test("eventFromRemote treats a missing start time as an all-day event with null capture", () => {
  const { eventFromRemote } = loadRemoteData();
  const event = eventFromRemote({
    id: "evt-2",
    capture_id: null,
    title: "Trip week",
    start_date: "2026-08-01",
    all_day: true,
    date_precision: "month",
    source: "manual",
    status: "confirmed"
  });
  assert.equal(event.allDay, true);
  assert.equal(event.startTime, "");
  assert.equal(event.endDate, "2026-08-01");
  assert.equal(event.captureId, null);
  assert.equal(event.datePrecision, "month");
  assert.equal(event.source, "manual");
});

// --- Seed fixture <-> parser contract ---
// The deterministic E2E seeder (scripts/lib/seed-captures.mjs) writes the same
// backend shapes captureFromRemote parses. These tests pin that contract so a
// future shape/type drift fails here in the gated suite instead of silently
// passing a green-but-wrong Maestro run against fixtures the app can't read.

test("seed fixture: pending suggestion parses to a ready suggested membership", async () => {
  const { captureFromRemote } = loadRemoteData();
  const { buildPendingSuggestionFixture } = await import("../scripts/lib/seed-captures.mjs");
  const { buildCaptureRow } = buildPendingSuggestionFixture("review-e2e-test", "user-1");
  const capture = captureFromRemote(buildCaptureRow("col-1"));

  assert.equal(capture.collectionSuggestionState, "ready");
  const suggested = (capture.linkedCollections || []).find((c) => c.status === "suggested");
  assert.ok(suggested, "expected a suggested LinkedCollection");
  assert.equal(suggested.id, "col-1");
  assert.equal(suggested.title, "review-e2e-test Suggested");
});

test("seed fixture: failed capture parses to a failed, non-image capture", async () => {
  const { captureFromRemote } = loadRemoteData();
  const { buildFailedCaptureFixture } = await import("../scripts/lib/seed-captures.mjs");
  const capture = captureFromRemote(buildFailedCaptureFixture("review-e2e-test", "user-1"));

  assert.equal(capture.status, "failed");
  // Non-image so the review screen offers photo recovery (shouldOfferPhotoRecovery).
  assert.notEqual(String(capture.captureType || "").toLowerCase(), "image");
  assert.equal(String(capture.imageAssetMimeType || "").startsWith("image/"), false);
});

test("seed fixture: needs-review capture parses to needs_review status", async () => {
  const { captureFromRemote } = loadRemoteData();
  const { buildNeedsReviewFixture } = await import("../scripts/lib/seed-captures.mjs");
  const capture = captureFromRemote(buildNeedsReviewFixture("review-e2e-test", "user-1"));

  assert.equal(capture.status, "needs_review");
});
