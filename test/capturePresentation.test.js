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
      const Icon = () => null;
      return {
        BookOpen: Icon,
        Calendar: Icon,
        ImageSquare: Icon,
        Link: Icon,
        MapPin: Icon,
        Note: Icon,
        ShoppingBag: Icon
      };
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
