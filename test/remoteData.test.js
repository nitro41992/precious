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
    analysis_model: "gpt-5.4-mini",
    analysis_error:
      "Unsupported value: 'minimal' is not supported with the 'gpt-5.4-mini' model.",
    analysis: null
  });

  assert.equal(capture.status, "failed");
  assert.equal(capture.analysisError, "Unsupported value: 'minimal' is not supported with the 'gpt-5.4-mini' model.");
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
    analysis_model: "gpt-5.4-mini",
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
