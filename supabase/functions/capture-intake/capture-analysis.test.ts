import {
  assert,
  assertEqual,
  assertIncludes,
  captureFixture,
  corpus,
  evidenceFor,
  gateFixture,
  imageAssetFixture,
  urlEvidence,
} from "./url-evidence.test-support.ts";

Deno.test("Visit target normalization keeps map candidates unverified", () => {
  const normalized = urlEvidence.normalizeVisitTargetFields({
    visit_target_name: " Sanwits ",
    visit_target_query: "Sanwits Ribeye Caldereta sandwich",
    visit_target_confidence: "medium",
    visit_target_evidence: [
      "title mentions Sanwits",
      "",
      "title mentions Ribeye Caldereta sandwich",
    ],
    verified_place: true,
  });
  assertEqual(
    normalized.visit_target_name,
    "Sanwits",
    "visit target name is trimmed",
  );
  assertEqual(
    normalized.visit_target_confidence,
    "medium",
    "visit target confidence is preserved",
  );
  assertEqual(
    normalized.verified_place,
    false,
    "visit targets stay unverified until a resolver confirms them",
  );
  assert(
    Array.isArray(normalized.visit_target_evidence) &&
      normalized.visit_target_evidence.length === 2,
    "blank visit target evidence should be removed",
  );
  const empty = urlEvidence.normalizeVisitTargetFields({
    visit_target_name: "Corner Cafe",
    visit_target_query: "",
    visit_target_confidence: "high",
    visit_target_evidence: ["name present"],
  });
  assertEqual(
    empty.visit_target_confidence,
    "none",
    "missing query clears visit target confidence",
  );
  assertEqual(empty.visit_target_name, null, "missing query clears name");
});

Deno.test("Visit target prompt allows brand-plus-service disambiguation from evidence only", () => {
  const prompt = urlEvidence.buildPrompt(
    captureFixture({
      source_text: "Screenshot text: VEJA repair services near SoHo.",
    }),
    null,
    [],
  );
  assert(
    prompt.includes("service-like or locator-style evidence"),
    "prompt should name service-like map evidence",
  );
  assert(
    prompt.includes("visible brand, product, or storefront text"),
    "prompt should allow visible brand/product text to disambiguate",
  );
  assert(
    prompt.includes("Screenshot text: VEJA repair services near SoHo."),
    "prompt should pass the capture evidence through",
  );
  const instructionText = prompt.slice(0, prompt.indexOf('"source_app"'));
  assert(
    !instructionText.includes("VEJA"),
    "prompt instructions should not hard-code a specific brand",
  );
});

Deno.test("save intent catalog is small, active, and action-oriented", () => {
  assertEqual(
    urlEvidence.activeSaveIntentKeys.join("|"),
    "watch|read|visit|buy|cook|make|do|plan|learn",
    "active save intent keys",
  );

  const prompt = urlEvidence.buildPrompt(
    captureFixture({
      source_text: "Physical therapy routine: three ankle mobility stretches.",
    }),
    null,
    [],
  );
  assert(
    prompt.includes("- do (Do):") &&
      prompt.includes("physical therapy") &&
      prompt.includes("- cook (Cook):") &&
      prompt.includes("return null when no listed action is clearly supported"),
    "prompt should describe do/cook and allow blank intent",
  );
});

Deno.test("source fallback is allowed only when content evidence is limited", () => {
  const contentSpecific = urlEvidence.contentEvidenceProfile(
    captureFixture({
      source_url: "https://www.instagram.com/reel/abc123/",
      source_text:
        "https://www.instagram.com/reel/abc123/ Dermatologist recommends budget retinoids for acne care.",
    }),
    null,
  );
  assertEqual(
    contentSpecific.source_fallback_allowed,
    false,
    "meaningful shared text should block source fallback classification",
  );
  assertIncludes(
    contentSpecific.content_signals,
    "shared_text",
    "shared text should count as content evidence",
  );

  const sourceOnly = urlEvidence.contentEvidenceProfile(
    captureFixture({
      source_url: "https://www.instagram.com/reel/abc123/",
      source_text: "https://www.instagram.com/reel/abc123/",
    }),
    null,
  );
  assertEqual(
    sourceOnly.source_fallback_allowed,
    true,
    "naked URL capture should allow source fallback",
  );
});

Deno.test("analysis schema restricts collection decisions to retrieved active collections", () => {
  const schema = urlEvidence.analysisSchemaForCollections([
    { id: "articles-id", title: "Articles & Guides", description: "" },
    { id: "products-id", title: "Products", description: "" },
  ] as any);
  assertEqual(
    JSON.stringify(
      schema.properties.collection_decisions.items.properties.collection_id
        .enum,
    ),
    JSON.stringify(["articles-id", "products-id", null]),
    "collection_id enum should be retrieved ids plus null",
  );

  const emptySchema = urlEvidence.analysisSchemaForCollections([]);
  assertEqual(
    JSON.stringify(
      emptySchema.properties.collection_decisions.items.properties
        .collection_id,
    ),
    JSON.stringify({ type: "null", enum: [null] }),
    "no retrieved collections should allow only null collection_id",
  );
});

Deno.test("collection prompt is subject-first when social video content is available", () => {
  const prompt = urlEvidence.buildPrompt(
    captureFixture({
      source_url: "https://www.instagram.com/reel/abc123/",
      source_text: "Dermatologist recommends budget retinoids for acne care.",
    }),
    null,
    [
      {
        id: "movies-id",
        title: "Movies & Shows",
        description:
          "Films, series, trailers, reviews, and recommendations about movies, shows, performers, and media titles.",
      },
      {
        id: "articles-id",
        title: "Articles & Guides",
        description:
          "Long reads, how-tos, explainers, reference pages, and practical guides saved for later use.",
      },
    ] as any,
  );
  assert(
    prompt.includes('"source_fallback_allowed": false'),
    "prompt should mark source fallback disallowed when content is present",
  );
  assert(
    prompt.includes(
      "Do not match to media or entertainment Collections merely because a capture is a reel",
    ),
    "prompt should forbid source-format collection matches",
  );
  assert(
    prompt.includes('"title": "Articles & Guides"') &&
      prompt.includes('"title": "Movies & Shows"'),
    "prompt should still inject retrieved collection values",
  );
});
