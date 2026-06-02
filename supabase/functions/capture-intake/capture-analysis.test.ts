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

Deno.test("URL preview images are passed as analyzer visual evidence", () => {
  const evidence = urlEvidence.oembedMetadata(
    {
      title: "Event roundup",
      thumbnail_url: "https://cdn.example.com/reel-preview.jpg",
    },
    "https://example.com/reel/abc123",
  );
  const capture = captureFixture({
    source_url: "https://example.com/reel/abc123",
    source_text: "https://example.com/reel/abc123",
  });

  const profile = urlEvidence.contentEvidenceProfile(capture, evidence);
  assertIncludes(
    profile.content_signals,
    "url_image_evidence",
    "URL thumbnail should count as visual content evidence",
  );
  assertEqual(
    profile.source_fallback_allowed,
    false,
    "URL thumbnail evidence should prevent source-only classification",
  );

  const content = urlEvidence.buildOpenAiUserContent(capture, evidence, []);
  assertEqual(content.length, 2, "prompt plus preview image should be sent");
  assertEqual(
    content[1].type,
    "input_image",
    "URL preview should be an image input",
  );
  assertEqual(
    content[1].image_url,
    "https://cdn.example.com/reel-preview.jpg",
    "URL preview image should be passed to OpenAI",
  );
  assert(
    String(content[0].text || "").includes('"source_image"') &&
      String(content[0].text || "").includes(
        "Optional visual evidence from the source URL thumbnail or preview image",
      ),
    "prompt should identify the source preview as visual evidence",
  );
});

Deno.test("URL preview visual evidence only accepts HTTPS images", () => {
  const evidence = urlEvidence.oembedMetadata(
    {
      title: "Event roundup",
      thumbnail_url: "http://cdn.example.com/reel-preview.jpg",
    },
    "https://example.com/reel/abc123",
  );
  const capture = captureFixture({
    source_url: "https://example.com/reel/abc123",
    source_text: "https://example.com/reel/abc123",
  });

  const content = urlEvidence.buildOpenAiUserContent(capture, evidence, []);
  assertEqual(content.length, 1, "HTTP preview images should not be attached");
});

Deno.test("reminder prompt prefers enclosing period for dated roundups", () => {
  const prompt = urlEvidence.buildPrompt(
    captureFixture({
      created_at: "2026-06-01T12:00:00.000Z",
      source_text:
        "July Edition: things to do. July 4 fireworks. July 12 night market. July 19 outdoor films.",
    }),
    null,
    [],
  );

  assert(
    prompt.includes(
      "multi-item list, roundup, calendar, itinerary, guide, or 'things to do'",
    ),
    "prompt should identify source-agnostic roundup/list captures",
  );
  assert(
    prompt.includes(
      "use the enclosing period rather than one arbitrary listed item",
    ),
    "prompt should prefer the overall period over an arbitrary event",
  );
  assert(
    prompt.includes(
      "For a month-level enclosing period such as July, set start_date to the first day of that month",
    ) && prompt.includes("date_precision month"),
    "prompt should map month-level scopes to month intervals",
  );
  assert(
    prompt.includes(
      "Only choose a single listed event when the evidence or user note clearly emphasizes that item",
    ),
    "prompt should avoid arbitrary single-event reminder selection",
  );
  assert(
    prompt.includes(
      "July things to do: July 4 fireworks; July 12 night market; July 19 outdoor film",
    ) && prompt.includes("July 1 through July 31"),
    "prompt should include a generic month-roundup example",
  );
  assert(
    prompt.includes("July Edition: things to do") &&
      prompt.includes("July 12 night market"),
    "prompt should pass dated roundup evidence through",
  );
});

Deno.test("reminder prompt derives a list-level window from many dated entries", () => {
  const prompt = urlEvidence.buildPrompt(
    captureFixture({
      created_at: "2026-06-01T12:00:00.000Z",
      source_text:
        "Things to do: June 1 rooftop film. June 4-7 carnival. June 9 museum festival. June 19 holiday event.",
    }),
    null,
    [],
  );

  assert(
    prompt.includes(
      "create one list-level Reminder idea from the earliest explicit listed date through the latest explicit listed date",
    ),
    "prompt should derive a single list-level interval",
  );
  assert(
    prompt.includes(
      "explicit enclosing period that agrees with the listed dates, then coherent earliest-to-latest list window",
    ),
    "prompt should prioritize list windows before single events",
  );
  assert(
    prompt.includes(
      "June 1 rooftop film; June 4-7 carnival; June 9 museum festival; June 19 holiday event",
    ) && prompt.includes("June 1 through June 19") &&
      prompt.includes("not a Reminder idea for only June 4-7"),
    "prompt should include a generic multi-date list example",
  );
  assert(
    prompt.includes("June 4-7 carnival") &&
      prompt.includes("June 19 holiday event"),
    "prompt should pass multi-date list evidence through",
  );
});

Deno.test("reminder prompt resolves conflicting edition text with explicit listed dates", () => {
  const prompt = urlEvidence.buildPrompt(
    captureFixture({
      created_at: "2026-06-01T12:00:00.000Z",
      source_text:
        "July edition coming soon. Listed entries: June 1 rooftop film. June 4-7 carnival. June 19 holiday event.",
    }),
    null,
    [],
  );

  assert(
    prompt.includes(
      "caption, title, headline, label, edition name, teaser, or promotional phrase names one period",
    ),
    "prompt should handle conflicting period wording generically",
  );
  assert(
    prompt.includes(
      "anchor the Reminder idea to the explicit listed dates rather than the conflicting phrase",
    ),
    "prompt should anchor reminders to explicit dated entries",
  );
  assert(
    prompt.includes("July edition coming soon") &&
      prompt.includes("June 1 through June 19") &&
      prompt.includes("not a July Reminder idea"),
    "prompt should include a generic conflict-resolution example",
  );
  assert(
    prompt.includes("June 4-7 carnival") &&
      prompt.includes("June 19 holiday event"),
    "prompt should pass conflicting-period evidence through",
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
