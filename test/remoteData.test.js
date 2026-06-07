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
