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

function collectionFixture(
  id: string,
  title: string,
  description: string,
  overrides: Record<string, unknown> = {},
): any {
  return {
    id,
    title,
    description,
    rerank_rank: 1,
    rerank_fit: "strong",
    rerank_confidence: 0.92,
    rerank_rationale: `${title} is a strong saved-value fit.`,
    ...overrides,
  };
}

function selectedCollectionDecision(collection: Record<string, unknown>) {
  return {
    type: "existing",
    collection_id: collection.id,
    title: collection.title,
    description: collection.description,
    rationale: "Selected by extraction.",
    confidence: 0.9,
  };
}

function recoveryAnalysisFixture(
  selectedCollection: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) {
  return {
    display_title: "Saved capture",
    summary: "Useful saved content.",
    capture_role: "learning_reference",
    default_intent: {
      category: "learn",
      confidence: 0.84,
      rationale: "Evidence supports learning or reference.",
    },
    entities: [],
    search_phrases: [],
    review_rationale: {
      summary: "Looks useful to save.",
      intent: "Save Intent fits the source evidence.",
      collections: "Collection fit is based on source evidence.",
    },
    collection_decisions: [selectedCollectionDecision(selectedCollection)],
    ...overrides,
  };
}

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
  assert(
    prompt.includes("learn over read for tutorials") &&
      prompt.includes("Use do, not visit, for scheduled activities") &&
      prompt.includes("Use plan for logistics") &&
      prompt.includes("Use buy for product, listing, store, deal") &&
      prompt.includes("Use make for creating an artifact"),
    "prompt should include Save Intent precedence rules",
  );
});

Deno.test("analysis prompt limits reminder and visit target overlap", () => {
  const prompt = urlEvidence.buildPrompt(
    captureFixture({
      source_text:
        "Neighborhood guide updated May 30, 2026 with restaurants around Austin.",
    }),
    null,
    [],
  );
  assert(
    prompt.includes("actionable future event window") &&
      prompt.includes("Do not suggest a Reminder idea for publish dates") &&
      prompt.includes("incidental date mentions"),
    "prompt should distinguish actionable Reminder dates from incidental dates",
  );
  assert(
    prompt.includes("Do not create a Visit Target for only a city") &&
      prompt.includes("generic location list") &&
      prompt.includes("named visitable place"),
    "prompt should distinguish concrete Visit Targets from broad location evidence",
  );
  assert(
    prompt.includes(
      "Extract location_context as internal structured evidence",
    ) &&
      prompt.includes("is_destination_away_from_user must be null") &&
      prompt.includes(
        "Do not implement or imply continuous precise location tracking",
      ),
    "prompt should extract structured location without implying user tracking",
  );
});

Deno.test("collection retrieval breadth uses twenty candidates and prompts ten", () => {
  assertEqual(
    urlEvidence.COLLECTION_RETRIEVAL_MATCH_COUNT,
    20,
    "collection retrieval should request enough candidates for reranking",
  );
  assertEqual(
    urlEvidence.COLLECTION_PROMPT_CANDIDATE_COUNT,
    10,
    "main extraction should see only the top reranked candidates",
  );
  assertEqual(
    urlEvidence.promptCollectionsForAnalysis(
      Array.from({ length: 12 }, (_, index) => ({
        id: `collection-${index}`,
        title: `Collection ${index}`,
        description: "",
      })),
    ).length,
    10,
    "prompt collection helper should cap candidates",
  );
});

Deno.test("secondary collection recovery adds guide value for software docs", () => {
  const software = collectionFixture(
    "software-id",
    "Software & Apps",
    "Apps, software tools, SaaS products, developer repositories, technical docs, and software workflows.",
  );
  const guides = collectionFixture(
    "guides-id",
    "Articles & Guides",
    "Long reads, how-tos, explainers, reference pages, and practical guides saved for later use.",
    {
      rerank_rank: 2,
      rerank_rationale:
        "The capture is a tutorial reference for configuring a software API.",
    },
  );
  const result = urlEvidence.applySecondaryCollectionRecovery(
    recoveryAnalysisFixture(software, {
      summary:
        "A developer tutorial explains setup steps and API reference details for the app workflow.",
      default_intent: {
        category: "learn",
        confidence: 0.88,
        rationale: "The source is useful as a tutorial and reference.",
      },
    }),
    [software, guides],
    [software, guides],
  );

  assertEqual(
    result.collection_decisions.length,
    2,
    "software docs should recover a guide/reference Collection",
  );
  assertEqual(
    result.collection_decisions[1].collection_id,
    "guides-id",
    "recovered Collection id",
  );
});

Deno.test("secondary collection recovery boosts selected strong secondary decisions", () => {
  const guides = collectionFixture(
    "guides-id",
    "Articles & Guides",
    "Long reads, how-tos, explainers, reference pages, and practical guides saved for later use.",
  );
  const software = collectionFixture(
    "software-id",
    "Software & Apps",
    "Apps, software tools, SaaS products, developer repositories, technical docs, and software workflows.",
    {
      rerank_rank: 2,
      rerank_confidence: 0.88,
      rerank_rationale:
        "The selected secondary Collection fits the software tutorial evidence.",
    },
  );
  const result = urlEvidence.applySecondaryCollectionRecovery(
    recoveryAnalysisFixture(guides, {
      summary:
        "A developer tutorial explains setup steps, API docs, Expo web preview configuration, and a software workflow.",
      collection_decisions: [
        selectedCollectionDecision(guides),
        {
          ...selectedCollectionDecision(software),
          confidence: 0.75,
        },
      ],
    }),
    [guides, software],
    [guides, software],
  );

  assert(
    result.collection_decisions[1].confidence >= 0.86,
    "strong selected secondary Collection should be boosted above auto-link threshold",
  );
  assertEqual(
    result.collection_recall_diagnostics.boosted_selected_decisions[0]
      .collection_id,
    "software-id",
    "boosted selected decision should be diagnosed",
  );
});

Deno.test("secondary collection recovery boosts selected possible secondary decisions with evidence", () => {
  const travel = collectionFixture(
    "travel-id",
    "Travel & Trips",
    "Trips, destinations, routes, hotels, flights, booking notes, and itineraries.",
  );
  const guides = collectionFixture(
    "guides-id",
    "Reference Shelf",
    "Guides, checklists, how-tos, and reference pages saved for later use.",
    {
      rerank_rank: 2,
      rerank_fit: "possible",
      rerank_confidence: 0.75,
      rerank_rationale:
        "The selected secondary Collection may fit the travel planning article.",
    },
  );
  const result = urlEvidence.applySecondaryCollectionRecovery(
    recoveryAnalysisFixture(travel, {
      capture_role: "trip_planning",
      summary:
        "A how-to travel article explains itinerary steps, route planning, access details, and a booking checklist.",
      collection_decisions: [
        selectedCollectionDecision(travel),
        {
          ...selectedCollectionDecision(guides),
          confidence: 0.75,
        },
      ],
    }),
    [travel, guides],
    [travel, guides],
  );

  assert(
    result.collection_decisions[1].confidence >= 0.86,
    "selected possible secondary Collection with evidence should be boosted",
  );
});

Deno.test("secondary collection recovery adds guide value for travel logistics", () => {
  const travel = collectionFixture(
    "travel-id",
    "Travel & Trips",
    "Trips, destinations, routes, hotels, flights, booking notes, and itineraries.",
  );
  const guides = collectionFixture(
    "guides-id",
    "Reference Shelf",
    "Guides, checklists, how-tos, and reference pages saved for later use.",
    {
      rerank_rank: 2,
      rerank_rationale:
        "The capture is a practical travel guide with route and access details.",
    },
  );
  const result = urlEvidence.applySecondaryCollectionRecovery(
    recoveryAnalysisFixture(travel, {
      capture_role: "trip_planning",
      summary:
        "A destination guide with itinerary options, route planning, admission, access, and booking details.",
      default_intent: {
        category: "do",
        confidence: 0.86,
        rationale:
          "The evidence supports trip planning and a practical checklist.",
      },
    }),
    [travel, guides],
    [travel, guides],
  );

  assertEqual(
    result.collection_decisions[1].collection_id,
    "guides-id",
    "travel logistics should recover a guide/reference Collection",
  );
});

Deno.test("secondary collection recovery adds class value for workshops", () => {
  const events = collectionFixture(
    "events-id",
    "Events",
    "Attendable events, performances, schedules, festivals, and ticketed happenings.",
  );
  const classes = collectionFixture(
    "classes-id",
    "Classes",
    "Classes, courses, workshops, lessons, training programs, and curriculum.",
    {
      rerank_rank: 2,
      rerank_rationale:
        "The event is also a workshop with lesson-style training.",
    },
  );
  const result = urlEvidence.applySecondaryCollectionRecovery(
    recoveryAnalysisFixture(events, {
      capture_role: "event_attendance",
      summary:
        "A dated workshop with tickets, training sessions, lessons, and class enrollment details.",
      default_intent: {
        category: "do",
        confidence: 0.88,
        rationale: "The user could attend the workshop.",
      },
    }),
    [events, classes],
    [events, classes],
  );

  assertEqual(
    result.collection_decisions[1].collection_id,
    "classes-id",
    "workshop evidence should recover a class/work Collection",
  );
});

Deno.test("secondary collection recovery adds music value for concerts", () => {
  const events = collectionFixture(
    "events-id",
    "Events",
    "Attendable events, schedules, festivals, concerts, performances, and ticket pages.",
  );
  const music = collectionFixture(
    "music-id",
    "Music Library",
    "Music, podcasts, songs, albums, artists, playlists, and concerts as media.",
    {
      rerank_rank: 2,
      rerank_rationale:
        "The event is a concert festival centered on artists and music.",
    },
  );
  const result = urlEvidence.applySecondaryCollectionRecovery(
    recoveryAnalysisFixture(events, {
      capture_role: "event_attendance",
      summary:
        "A ticketed music festival concert with artists, DJ sets, playlists, and performance schedule.",
      default_intent: {
        category: "do",
        confidence: 0.9,
        rationale: "The user could attend the concert.",
      },
    }),
    [events, music],
    [events, music],
  );

  assertEqual(
    result.collection_decisions[1].collection_id,
    "music-id",
    "concert evidence should recover music when it is independent",
  );
});

Deno.test("secondary collection recovery does not boost selected guide for product roundups", () => {
  const products = collectionFixture(
    "products-id",
    "Products",
    "Products, shopping, buy links, deals, gear, gifts, stores, and purchase comparisons.",
  );
  const guides = collectionFixture(
    "guides-id",
    "Articles & Guides",
    "Long reads, how-tos, explainers, reference pages, and practical guides saved for later use.",
    {
      rerank_rank: 2,
      rerank_confidence: 0.78,
      rerank_rationale: "The source is a buying guide roundup for products.",
    },
  );
  const result = urlEvidence.applySecondaryCollectionRecovery(
    recoveryAnalysisFixture(products, {
      capture_role: "shopping",
      summary:
        "A best robot vacuum buying guide ranks products with prices, sale notes, buy links, and comparisons.",
      default_intent: {
        category: "read",
        confidence: 0.78,
        rationale:
          "The model framed the shopping roundup as reference reading.",
      },
      collection_decisions: [
        selectedCollectionDecision(products),
        {
          ...selectedCollectionDecision(guides),
          confidence: 0.78,
        },
      ],
    }),
    [products, guides],
    [products, guides],
  );

  assert(
    result.collection_decisions[1].confidence < 0.86,
    "shopping roundup guide should remain below auto-link threshold",
  );
  assertEqual(
    result.collection_recall_diagnostics.boosted_selected_decisions.length,
    0,
    "blocked shopping guide should not be diagnosed as boosted",
  );
});

Deno.test("secondary collection recovery keeps shopping roundups product-only", () => {
  const products = collectionFixture(
    "products-id",
    "Products",
    "Products, shopping, buy links, deals, gear, gifts, stores, and purchase comparisons.",
  );
  const guides = collectionFixture(
    "guides-id",
    "Articles & Guides",
    "Long reads, how-tos, explainers, reference pages, and practical guides saved for later use.",
    {
      rerank_rank: 2,
      rerank_rationale: "The source is a buying guide roundup for products.",
    },
  );
  const result = urlEvidence.applySecondaryCollectionRecovery(
    recoveryAnalysisFixture(products, {
      capture_role: "shopping",
      summary:
        "A best backpacks buying guide with ranked products, prices, sale notes, buy links, and comparison details.",
      default_intent: {
        category: "buy",
        confidence: 0.91,
        rationale: "The saved value is shopping and purchase comparison.",
      },
    }),
    [products, guides],
    [products, guides],
  );

  assertEqual(
    result.collection_decisions.length,
    1,
    "product roundup should not add guide only because it is article-shaped",
  );
  assertEqual(
    result.collection_recall_diagnostics.recovery_candidates[0].reason,
    "shopping_roundup_does_not_need_independent_guide_collection",
    "shopping-only guide risk should be diagnosed",
  );
});

Deno.test("secondary collection recovery does not add travel for one restaurant", () => {
  const dining = collectionFixture(
    "dining-id",
    "Restaurants & Cafes",
    "Restaurants, cafes, bars, menus, dining, and places to eat or drink.",
  );
  const travel = collectionFixture(
    "travel-id",
    "Travel & Trips",
    "Trips, destination planning, routes, hotels, flights, booking, and itinerary logistics.",
    {
      rerank_rank: 2,
      rerank_rationale:
        "The page mentions a city but does not provide route or trip planning.",
    },
  );
  const result = urlEvidence.applySecondaryCollectionRecovery(
    recoveryAnalysisFixture(dining, {
      capture_role: "place_visit",
      summary:
        "A single cafe video with menu details, coffee drinks, and a named restaurant to visit.",
      default_intent: {
        category: "visit",
        confidence: 0.89,
        rationale: "The user could visit the cafe.",
      },
    }),
    [dining, travel],
    [dining, travel],
  );

  assertEqual(
    result.collection_decisions.length,
    1,
    "single restaurant/cafe evidence should not recover travel planning",
  );
});

Deno.test("secondary collection recovery separates inspiration from execution", () => {
  const design = collectionFixture(
    "design-id",
    "Design Inspiration",
    "Design, inspiration, visual style, interiors, fashion, creative references, and moodboards.",
  );
  const projects = collectionFixture(
    "projects-id",
    "Home Projects",
    "Home, DIY, repair, decor projects, gardening, crafts, builds, materials, and before/after work.",
    {
      rerank_rank: 2,
      rerank_rationale:
        "Project fit requires execution evidence such as materials and steps.",
    },
  );
  const inspiration = urlEvidence.applySecondaryCollectionRecovery(
    recoveryAnalysisFixture(design, {
      capture_role: "visual_inspiration",
      summary:
        "An interiors profile with visual inspiration, color palette, styling ideas, and moodboard value.",
      default_intent: {
        category: null,
        confidence: 0.62,
        rationale: "The saved value is visual inspiration.",
      },
    }),
    [design, projects],
    [design, projects],
  );
  assertEqual(
    inspiration.collection_decisions.length,
    1,
    "visual inspiration alone should not recover project execution",
  );

  const execution = urlEvidence.applySecondaryCollectionRecovery(
    recoveryAnalysisFixture(design, {
      capture_role: "project_execution",
      summary:
        "A before and after renovation guide with materials, steps, sources, installation details, and DIY build notes.",
      default_intent: {
        category: "do",
        confidence: 0.89,
        rationale: "The saved value includes executing the project.",
      },
    }),
    [design, projects],
    [design, projects],
  );
  assertEqual(
    execution.collection_decisions[1].collection_id,
    "projects-id",
    "execution evidence should recover project/home Collection",
  );
});

Deno.test("secondary collection recovery records cap-blocked matches", () => {
  const software = collectionFixture(
    "software-id",
    "Software & Apps",
    "Apps, software tools, APIs, developer repositories, and workflows.",
  );
  const guides = collectionFixture(
    "guides-id",
    "Guides",
    "How-tos, tutorials, reference docs, manuals, and checklists.",
    {
      rerank_rank: 2,
      rerank_rationale: "The capture is a software tutorial reference.",
    },
  );
  const work = collectionFixture(
    "work-id",
    "Work",
    "Work, career, business, professional operations, management, and startup notes.",
    {
      rerank_rank: 3,
      rerank_rationale:
        "The capture also describes professional workflow operations.",
    },
  );
  const result = urlEvidence.applySecondaryCollectionRecovery(
    recoveryAnalysisFixture(software, {
      summary:
        "A professional developer tutorial with API docs, setup checklist, business workflow, operations, and management details.",
      default_intent: {
        category: "learn",
        confidence: 0.88,
        rationale:
          "The source is tutorial reference for a professional workflow.",
      },
    }),
    [software, guides, work],
    [software, guides],
  );

  assertEqual(
    result.collection_decisions.length,
    urlEvidence.COLLECTION_AUTO_LINK_LIMIT,
    "recovery should preserve the two-link production cap",
  );
  assertEqual(
    result.collection_recall_diagnostics.cap_blocked_decisions[0].collection_id,
    "work-id",
    "extra strong matches should be diagnosed as cap-blocked",
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

Deno.test("visual retry catches invalid image data errors", () => {
  assert(
    urlEvidence.isVisualDownloadFailure({
      error: {
        message:
          "The image data you provided does not represent a valid image. Please check your input and try again.",
      },
    }),
    "invalid preview image data should retry without visual inputs",
  );
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

Deno.test("reminder schema and prompt only allow time interval suggestions", () => {
  const schema = urlEvidence.analysisSchemaForCollections([]) as any;
  assertEqual(
    JSON.stringify(
      schema.properties.suggested_reminders.items.properties.trigger_type.enum,
    ),
    JSON.stringify(["time"]),
    "reminder trigger_type should be time-only",
  );
  assert(
    schema.required.includes("location_context") &&
      schema.properties.location_context.required.includes(
        "source_destination",
      ),
    "analysis schema should include structured location context",
  );
  assert(
    !schema.required.includes("review_rationale") &&
      !schema.required.includes("review_targets") &&
      !Object.prototype.hasOwnProperty.call(schema.properties, "review_rationale") &&
      !Object.prototype.hasOwnProperty.call(schema.properties, "review_targets"),
    "analysis schema should omit separate review workflow fields",
  );

  const prompt = urlEvidence.buildPrompt(
    captureFixture({
      source_text:
        "Out of Control Vintage popup at St. Anthony's Flea Market, 154 Sullivan Street.",
    }),
    null,
    [],
  );

  assert(
    prompt.includes("Suggested reminders are time intervals only"),
    "prompt should define Reminder ideas as time intervals",
  );
  assert(
    prompt.includes("Never create location, place, proximity, venue") &&
      prompt.includes("when near"),
    "prompt should forbid location/proximity reminder ideas",
  );
  assert(
    prompt.includes(
      "Place, venue, address, and maps-search evidence belongs in visit_target_* fields",
    ),
    "prompt should route place evidence to Visit Target fields",
  );
  assert(
    prompt.includes("154 Sullivan Street"),
    "prompt should still pass place evidence through for Visit Target extraction",
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
      "Choose Collections based on independent durable saved value",
    ) &&
      prompt.includes(
        "source shape, platform, domain, media format, or incidental topic mentions",
      ),
    "prompt should forbid source-shape collection matches",
  );
  assert(
    prompt.includes('"title": "Articles & Guides"') &&
      prompt.includes('"title": "Movies & Shows"'),
    "prompt should still inject retrieved collection values",
  );
  const instructionText = prompt.slice(
    0,
    prompt.indexOf("Reranked retrieved active collections:"),
  );
  assert(
    !instructionText.includes("Articles & Guides") &&
      !instructionText.includes("Movies & Shows"),
    "collection instructions should not hard-code candidate Collection names",
  );
});

Deno.test("analysis prompt includes capture role trace from reranking", () => {
  const prompt = urlEvidence.buildPrompt(
    captureFixture({
      source_text:
        "Step-by-step guide to build a tiny Expo web app with PreviewDrop.",
    }),
    null,
    [
      {
        id: "software-id",
        title: "Software & Apps",
        description: "Apps and software workflows.",
        rerank_rank: 1,
        rerank_fit: "strong",
        rerank_confidence: 0.92,
        rerank_rationale: "Software workflow.",
        rerank_capture_role: "learning_reference",
        rerank_capture_role_confidence: 0.88,
        rerank_capture_role_rationale:
          "The saved value is a step-by-step guide.",
      },
    ] as any,
  );

  assert(
    prompt.includes("Internal capture role signal from Collection reranking") &&
      prompt.includes('"capture_role": "learning_reference"') &&
      prompt.includes('"capture_role_confidence": 0.88'),
    "prompt should pass the reranker capture role into extraction",
  );
});

Deno.test("reminder validation drops stale extracted reminder ideas", () => {
  const analysis = urlEvidence.validateReminderIdeas(
    {
      suggested_reminders: [
        {
          trigger_type: "time",
          trigger_value: "Presidents' Day sale",
          start_date: "2025-02-16",
          end_date: "2025-02-16",
          rationale: "Sale ends February 16.",
          confidence: 0.9,
        },
      ],
      review_targets: ["reminder"],
      review_rationale: {
        reminder: "Reminder idea: sale ends February 16.",
      },
    },
    "2026-06-03T12:00:00.000Z",
  );
  assert(
    Array.isArray(analysis.suggested_reminders) &&
      analysis.suggested_reminders.length === 0,
    "validator should drop stale reminder ideas",
  );
  assert(
    analysis.review_rationale?.reminder === "Reminder idea: sale ends February 16.",
    "validator should not synthesize new Review Insight copy when a reminder is dropped",
  );
});

Deno.test("reminder validation drops broad directories and generic cadence advice", () => {
  const broadDirectory = urlEvidence.validateReminderIdeas(
    {
      display_title: "North Carolina events directory",
      summary: "A statewide directory with many unrelated event dates.",
      suggested_reminders: [
        {
          trigger_type: "time",
          trigger_value: "June events",
          start_date: "2026-06-05",
          end_date: "2026-06-28",
          rationale: "The page lists many event dates.",
          confidence: 0.8,
        },
      ],
      review_targets: ["reminder"],
      review_rationale: {
        reminder: "Reminder idea: June events.",
      },
    },
    "2026-06-03T12:00:00.000Z",
  );
  assertEqual(
    broadDirectory.suggested_reminders.length,
    0,
    "broad event directories should not keep Reminder ideas",
  );
  assert(
    broadDirectory.review_rationale?.reminder === "Reminder idea: June events.",
    "broad directory drop should not synthesize Review Insight copy",
  );

  const cadenceAdvice = urlEvidence.validateReminderIdeas(
    {
      display_title: "How to maintain a movie watchlist",
      summary: "Advice for keeping a watchlist tidy.",
      suggested_reminders: [
        {
          trigger_type: "time",
          trigger_value: "Review your watchlist monthly",
          start_date: "2026-07-01",
          end_date: "2026-07-01",
          rationale: "The guide recommends reviewing your watchlist monthly.",
          confidence: 0.8,
        },
      ],
      review_targets: ["reminder"],
      review_rationale: {
        reminder: "Reminder idea: review the watchlist monthly.",
      },
    },
    "2026-06-03T12:00:00.000Z",
  );
  assertEqual(
    cadenceAdvice.suggested_reminders.length,
    0,
    "generic cadence advice should not keep Reminder ideas",
  );
  assert(
    cadenceAdvice.review_rationale?.reminder === "Reminder idea: review the watchlist monthly.",
    "generic cadence drop should not synthesize Review Insight copy",
  );
});

Deno.test("reminder validation preserves concrete future reminders", () => {
  const analysis = urlEvidence.validateReminderIdeas(
    {
      display_title: "Sample sale",
      summary: "Sale ends July 8.",
      suggested_reminders: [
        {
          trigger_type: "time",
          trigger_value: "Sale ends July 8",
          start_date: "2026-07-08",
          end_date: "2026-07-08",
          rationale: "The sale ends July 8.",
          confidence: 0.9,
        },
      ],
      review_targets: ["reminder"],
    },
    "2026-06-03T12:00:00.000Z",
  );
  assertEqual(
    analysis.suggested_reminders.length,
    1,
    "concrete future sale reminders should be preserved",
  );
});
