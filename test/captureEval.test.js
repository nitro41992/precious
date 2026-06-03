const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

async function evalLib() {
  return import("../scripts/capture-eval-lib.mjs");
}

test("selectDeterministicSamples dedupes URLs and fills quotas deterministically", async () => {
  const { selectDeterministicSamples } = await evalLib();
  const strata = [
    { id: "articles", quota: 2 },
    { id: "social", quota: 1 }
  ];
  const candidates = [
    { sample_id: "a", stratum: "articles", url: "https://example.com/a?utm_source=x" },
    { sample_id: "a-dupe", stratum: "articles", url: "https://www.example.com/a" },
    { sample_id: "b", stratum: "articles", url: "https://example.com/b" },
    { sample_id: "c", stratum: "social", url: "https://social.example/post/1" },
    { sample_id: "d", stratum: "extra", url: "https://other.example/d" }
  ];

  const first = selectDeterministicSamples(candidates, strata, 3, "seed-a");
  const second = selectDeterministicSamples(candidates, strata, 3, "seed-a");

  assert.equal(first.candidate_count, 5);
  assert.equal(first.deduped_count, 4);
  assert.equal(first.selected.length, 3);
  assert.deepEqual(
    first.selected.map((sample) => sample.sample_id),
    second.selected.map((sample) => sample.sample_id)
  );
  assert.equal(first.selected.filter((sample) => sample.stratum === "social").length, 1);
});

test("Gemini silver label prompt includes Precious intent precedence policy", async () => {
  const { labelPrompt } = await import("../scripts/label-silver-gemini.mjs");
  const collections = [
    {
      title: "Software & Apps",
      description: "Apps, SaaS products, GitHub repositories, and software workflows."
    }
  ];
  const prompt = labelPrompt({
    sample_id: "sample-1",
    url: "https://example.com/how-to",
    source_kind: "exa_public",
    exa_title: "How to build a useful eval",
    exa_highlights: ["A practical tutorial with steps."]
  }, collections);

  assert.match(prompt, /learn beats read/i);
  assert.match(prompt, /do beats visit/i);
  assert.match(prompt, /actionable future event windows/i);
  assert.match(prompt, /concrete named visitable place/i);
  assert.match(prompt, /Software & Apps/);
  assert.match(prompt, /GitHub repositories/);
});

test("selectDeterministicSamples enforces coverage quotas and reports shortfalls", async () => {
  const { selectDeterministicSamples } = await evalLib();
  const candidates = [
    {
      sample_id: "date",
      stratum: "articles",
      url: "https://example.com/date",
      coverage_tags: ["has_date_time"],
      expected_collections: ["Articles & Guides"]
    },
    {
      sample_id: "place",
      stratum: "places",
      url: "https://example.com/place",
      coverage_tags: ["location_only"],
      expected_collections: ["Restaurants & Cafes"]
    }
  ];

  const result = selectDeterministicSamples(
    candidates,
    [{ id: "articles", quota: 1 }, { id: "places", quota: 1 }],
    2,
    "coverage-seed",
    {
      has_date_time: 1,
      location_only: 2,
      starter_collection_fit: {
        "Articles & Guides": 1,
        "Restaurants & Cafes": 1
      }
    }
  );

  assert.equal(result.selected.length, 2);
  assert.equal(result.coverage_counts.has_date_time, 1);
  assert.equal(result.coverage_counts.location_only, 1);
  assert.deepEqual(
    result.shortfalls.find((shortfall) => shortfall.coverage === "location_only"),
    {
      kind: "coverage",
      coverage: "location_only",
      collection: "",
      quota: 2,
      selected: 1,
      missing: 1
    }
  );
});

test("normalizeExaResponseResults maps status and content fields into manifest samples", async () => {
  const { normalizeExaResponseResults } = await evalLib();
  const samples = normalizeExaResponseResults(
    {
      results: [
        {
          id: "https://example.com/guide",
          url: "https://example.com/guide",
          title: "Useful guide",
          author: "Mina",
          highlights: ["A useful excerpt."],
          imageLinks: ["https://example.com/a.jpg"]
        }
      ],
      statuses: [
        {
          id: "https://example.com/guide",
          status: "success"
        }
      ]
    },
    { id: "articles", label: "Articles" },
    {
      id: "guide-query",
      query: "useful guides",
      coverage_tags: ["has_date_time"],
      expected_collections: ["Articles & Guides"],
      expected_reminder_surface: "deadline"
    },
    "2026-06-02T00:00:00.000Z"
  );

  assert.equal(samples.length, 1);
  assert.equal(samples[0].stratum, "articles");
  assert.equal(samples[0].domain, "example.com");
  assert.equal(samples[0].exa_status, "success");
  assert.deepEqual(samples[0].exa_image_links, ["https://example.com/a.jpg"]);
  assert.deepEqual(samples[0].coverage_tags, ["has_date_time"]);
  assert.deepEqual(samples[0].expected_collections, ["Articles & Guides"]);
  assert.equal(samples[0].expected_reminder_surface, "deadline");
});

test("scoreCapturePredictions measures exact and set-based accuracy", async () => {
  const { scoreCapturePredictions } = await evalLib();
  const score = scoreCapturePredictions(
    [
      {
        sample_id: "sample-a",
        stratum: "articles",
        url: "https://example.com/a",
        prediction: {
          terminal_outcome: "ready",
          save_intent: "read",
          entities: [{ name: "Kyoto" }, { name: "Mina Park" }],
          location_context: {
            city: "Kyoto",
            country: "Japan",
            source_destination: "Kyoto"
          },
          visit_target: "",
          reminder: "none",
          collections: ["Articles & Guides"],
          title: "A quiet weekend in Kyoto",
          summary: "A practical guide for temples and coffee."
        }
      }
    ],
    [
      {
        sample_id: "sample-a",
        expected: {
          terminal_outcome: "ready",
          save_intent: "read",
          entities: ["Kyoto"],
          location_context: {
            city: "Kyoto",
            country: "Japan",
            source_destination: "Kyoto"
          },
          visit_target: "",
          reminder: "none",
          collections: ["Articles & Guides"],
          title_contains: ["Kyoto"],
          summary_contains: ["practical guide"]
        }
      }
    ]
  );

  assert.equal(score.labeled_sample_count, 1);
  assert.equal(score.overall.terminal_outcome.accuracy, 1);
  assert.equal(score.overall.save_intent.accuracy, 1);
  assert.equal(score.overall.entities.precision, 0.5);
  assert.equal(score.overall.entities.recall, 1);
  assert.equal(score.overall.location_context.exact_accuracy, 1);
  assert.equal(score.overall.collections.exact_accuracy, 1);
  assert.equal(score.failures.length, 1);
  assert.equal(score.failures[0].metric, "entities");
});

test("predictionFromCapture reads auto-linked Collections from analysis", async () => {
  const { predictionFromCapture } = await evalLib();
  const prediction = predictionFromCapture({
    analysis_state: "ready",
    analysis: {
      default_intent: { category: "cook" },
      linked_collections: [
        { title: "Recipes" },
        { title: "Recipes" }
      ],
      collection_decisions: [
        { title: "Articles & Guides" }
      ]
    }
  });

  assert.deepEqual(prediction.collections, ["Recipes", "Articles & Guides"]);
});

test("normalizeGeminiSilverLabel parses structured output with confidences", async () => {
  const { normalizeGeminiSilverLabel, parseGeminiJson } = await evalLib();
  const sample = {
    sample_id: "sample-a",
    url: "https://example.com/a",
    stratum: "articles",
    coverage_tags: ["has_date_time"],
    expected_collections: ["Articles & Guides"]
  };
  const parsed = parseGeminiJson({
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                expected: {
                  terminal_outcome: "ready",
                  save_intent: "read",
                  entities: ["Kyoto"],
                  visit_target: "none",
                  reminder: "2026-07-04 8pm",
                  reminder_fields: { evidence_phrase: "July 4 at 8pm" },
                  collections: ["Articles & Guides"],
                  title_contains: ["Kyoto"],
                  summary_contains: ["guide"],
                  access_state: "public",
                  notes: "Fixture"
                },
                suitability: "edge",
                suitability_reason: "Public evidence is thin but scoreable.",
                confidence: { save_intent: 0.91, reminder: 1.4 },
                evidence_snippets: { save_intent: ["guide"] },
                uncertainty_flags: ["low excerpt"]
              })
            }
          ]
        }
      }
    ]
  });
  const label = normalizeGeminiSilverLabel(sample, parsed, {
    model: "gemini-3.5-flash",
    reviewed_at: "2026-06-02T00:00:00.000Z"
  });

  assert.equal(label.label_type, "silver");
  assert.equal(label.model, "gemini-3.5-flash");
  assert.equal(label.expected.save_intent, "read");
  assert.equal(label.expected.reminder, "suggested");
  assert.deepEqual(label.expected.reminder_fields, {
    raw_text: "2026-07-04 8pm",
    evidence_phrase: "July 4 at 8pm"
  });
  assert.equal(label.suitability, "edge");
  assert.equal(label.suitability_reason, "Public evidence is thin but scoreable.");
  assert.equal(label.confidence.save_intent, 0.91);
  assert.equal(label.confidence.reminder, 1);
  assert.deepEqual(label.evidence_snippets.save_intent, ["guide"]);
  assert.deepEqual(label.uncertainty_flags, ["low excerpt"]);
});

test("normalizeExpectedLabel preserves missing reminder and maps exact reminder text to suggested", async () => {
  const { normalizeExpectedLabel } = await evalLib();

  assert.equal(normalizeExpectedLabel({}).reminder, "");
  assert.deepEqual(
    normalizeExpectedLabel({
      reminder: "June 15 at 9am",
      reminder_fields: { timezone: "America/New_York" }
    }),
    {
      terminal_outcome: "",
      save_intent: "",
      entities: [],
      visit_target: "",
      reminder: "suggested",
      reminder_fields: {
        raw_text: "June 15 at 9am",
        timezone: "America/New_York"
      },
      collections: [],
      location_context: {
        place_name: "",
        address: "",
        city: "",
        region: "",
        country: "",
        coordinates: null,
        source_destination: "",
        is_destination_away_from_user: null,
        travel_context_reason: ""
      },
      title_contains: [],
      summary_contains: [],
      access_state: "",
      notes: ""
    }
  );
});

test("location context scoring is separate from visit target", async () => {
  const { scoreCapturePredictions } = await evalLib();
  const score = scoreCapturePredictions(
    [
      {
        sample_id: "travel-guide",
        prediction: {
          terminal_outcome: "ready",
          save_intent: "plan",
          reminder: "none",
          visit_target: "",
          collections: ["Travel & Trips"],
          title: "Sekigahara day trip",
          summary: "A guide to battlefield sites and the museum.",
          location_context: {
            place_name: "Gifu Sekigahara Battlefield Memorial Museum",
            city: "Sekigahara",
            region: "Gifu",
            country: "Japan",
            source_destination: "Sekigahara, Gifu, Japan"
          }
        }
      }
    ],
    [
      {
        sample_id: "travel-guide",
        expected: {
          terminal_outcome: "ready",
          save_intent: "plan",
          reminder: "none",
          visit_target: "none",
          collections: ["Travel & Trips"],
          location_context: {
            city: "Sekigahara",
            region: "Gifu",
            country: "Japan",
            source_destination: "Sekigahara, Gifu, Japan"
          }
        }
      }
    ]
  );

  assert.equal(score.overall.visit_target.accuracy, 1);
  assert.equal(score.overall.location_context.recall, 1);
  assert.equal(score.overall.location_context.precision < 1, true);
});

test("geminiPreflightFailureMessage names model override", async () => {
  const { geminiPreflightFailureMessage } = await evalLib();
  const message = geminiPreflightFailureMessage("gemini-3.5-flash", 404, "model not found");

  assert.match(message, /gemini-3\.5-flash/);
  assert.match(message, /GEMINI_API_KEY/);
  assert.match(message, /GEMINI_LABEL_MODEL/);
  assert.match(message, /404/);
});

test("buildReviewQueue prioritizes disagreements and risk rows with agreement spot checks", async () => {
  const { buildReviewQueue } = await evalLib();
  const samples = [
    {
      sample_id: "needs-review",
      url: "https://example.com/place",
      stratum: "places",
      coverage_tags: ["location_only"],
      expected_collections: ["Restaurants & Cafes"]
    },
    {
      sample_id: "agreement",
      url: "https://example.com/guide",
      stratum: "articles",
      coverage_tags: [],
      expected_collections: []
    }
  ];
  const predictions = [
    {
      sample_id: "needs-review",
      prediction: {
        terminal_outcome: "ready",
        save_intent: "read",
        entities: [],
        visit_target: "",
        reminder: "suggested",
        collections: [],
        title: "Place",
        summary: ""
      }
    },
    {
      sample_id: "agreement",
      prediction: {
        terminal_outcome: "ready",
        save_intent: "read",
        entities: [],
        visit_target: "",
        reminder: "none",
        collections: [],
        title: "Guide",
        summary: "Guide"
      }
    }
  ];
  const silver = [
    {
      sample_id: "needs-review",
      expected_collections: ["Restaurants & Cafes"],
      expected: {
        terminal_outcome: "ready",
        save_intent: "visit",
        entities: [],
        visit_target: "Example Place",
        reminder: "none",
        collections: ["Restaurants & Cafes"],
        title_contains: [],
        summary_contains: [],
        access_state: "public"
      },
      confidence: { save_intent: 0.6 },
      uncertainty_flags: [],
      suitability: "core"
    },
    {
      sample_id: "agreement",
      expected: {
        terminal_outcome: "ready",
        save_intent: "read",
        entities: [],
        visit_target: "none",
        reminder: "none",
        collections: [],
        title_contains: ["Guide"],
        summary_contains: ["Guide"],
        access_state: "public"
      },
      confidence: { save_intent: 0.9 },
      uncertainty_flags: [],
      suitability: "core"
    }
  ];

  const queue = buildReviewQueue(samples, predictions, silver, {
    lowConfidenceThreshold: 0.72,
    agreementSampleRate: 1
  });
  const review = queue.find((row) => row.sample_id === "needs-review");
  const spotCheck = queue.find((row) => row.sample_id === "agreement");

  assert.equal(review.priority, "review");
  assert.ok(review.reasons.includes("disagreement:save_intent"));
  assert.ok(review.reasons.includes("disagreement:visit_target"));
  assert.ok(review.reasons.includes("location_only_false_reminder_risk"));
  assert.ok(review.reasons.includes("collection_fit_mismatch"));
  assert.equal(review.suitability, "core");
  assert.equal(spotCheck.priority, "spot_check");
  assert.equal(spotCheck.suitability, "core");
  assert.deepEqual(spotCheck.reasons, ["agreement_spot_check"]);
});

test("scoreCaptureEvaluation reports gold accuracy and silver agreement separately", async () => {
  const { scoreCaptureEvaluation } = await evalLib();
  const samples = [
    {
      sample_id: "sample-a",
      stratum: "articles",
      coverage_tags: ["has_date_time"],
      expected_collections: ["Articles & Guides"],
      prediction: {
        terminal_outcome: "ready",
        save_intent: "read",
        entities: [],
        visit_target: "",
        reminder: "none",
        collections: ["Articles & Guides"],
        title: "A guide",
        summary: "A useful guide."
      }
    }
  ];
  const gold = [
    {
      sample_id: "sample-a",
      expected: {
        terminal_outcome: "ready",
        save_intent: "read",
        entities: [],
        visit_target: "none",
        reminder: "none",
        collections: ["Articles & Guides"],
        title_contains: ["guide"],
        summary_contains: ["useful"],
        access_state: "public"
      }
    }
  ];
  const silver = [
    {
      sample_id: "sample-a",
      expected: {
        terminal_outcome: "ready",
        save_intent: "plan",
        entities: [],
        visit_target: "none",
        reminder: "none",
        collections: ["Articles & Guides"],
        title_contains: ["guide"],
        summary_contains: ["useful"],
        access_state: "public"
      }
    }
  ];

  const score = scoreCaptureEvaluation(samples, gold, silver);

  assert.equal(score.gold.overall.save_intent.accuracy, 1);
  assert.equal(score.silver_agreement.overall.save_intent.accuracy, 0);
  assert.equal(score.coverage.reminder_cases.sample_count, 1);
  assert.equal(score.coverage.starter_collection_fit["Articles & Guides"].predicted_match, 1);
});

test("scoreCapturePredictions excludes labels marked unsuitable for scoring", async () => {
  const { scoreCapturePredictions } = await evalLib();
  const score = scoreCapturePredictions(
    [
      {
        sample_id: "excluded",
        prediction: {
          terminal_outcome: "ready",
          save_intent: "read",
          reminder: "none",
          visit_target: "",
          collections: [],
          title: "",
          summary: ""
        }
      }
    ],
    [
      {
        sample_id: "excluded",
        suitability: "exclude",
        expected: {
          terminal_outcome: "rejected",
          save_intent: "blank",
          reminder: "none"
        }
      }
    ]
  );

  assert.equal(score.labeled_sample_count, 0);
  assert.equal(score.excluded_label_count, 1);
  assert.equal(score.overall.terminal_outcome.total, 0);
});

test("score coverage reports manifest-defined eval collections", async () => {
  const { scoreCaptureEvaluation } = await evalLib();
  const samples = [
    {
      sample_id: "app",
      starter_collections: [
        {
          title: "Software & Apps",
          description: "Apps, software tools, and GitHub repositories."
        }
      ],
      expected_collections: ["Software & Apps"],
      prediction: {
        terminal_outcome: "ready",
        save_intent: "buy",
        reminder: "none",
        visit_target: "",
        collections: ["Software & Apps"],
        title: "Useful app",
        summary: "A software listing."
      }
    }
  ];
  const labels = [
    {
      sample_id: "app",
      expected_collections: ["Software & Apps"],
      expected: {
        terminal_outcome: "ready",
        save_intent: "buy",
        entities: [],
        visit_target: "none",
        reminder: "none",
        collections: ["Software & Apps"],
        title_contains: [],
        summary_contains: [],
        access_state: "public"
      }
    }
  ];

  const score = scoreCaptureEvaluation(samples, labels);

  assert.equal(score.coverage.starter_collection_fit["Software & Apps"].sample_count, 1);
  assert.equal(score.coverage.starter_collection_fit["Software & Apps"].predicted_match, 1);
});

test("gold v2 and combined builders preserve labels and record label sources", () => {
  const dir = mkdtempSync(join(tmpdir(), "capture-eval-"));
  const goldPath = join(dir, "gold.json");
  const mapPath = join(dir, "map.json");
  const goldV2Path = join(dir, "gold-v2.json");
  const goldManifestPath = join(dir, "gold-manifest.json");
  const silverPath = join(dir, "silver.json");
  const silverManifestPath = join(dir, "silver-manifest.json");
  const combinedLabelsPath = join(dir, "combined-labels.json");
  const combinedManifestPath = join(dir, "combined-manifest.json");

  writeFileSync(goldPath, JSON.stringify({
    labels: [
      {
        sample_id: "gold-a",
        url: "https://example.com/gold",
        suitability: "core",
        include_in_gold: true,
        expected: {
          terminal_outcome: "ready",
          save_intent: "buy",
          entities: [],
          visit_target: "none",
          reminder: "none",
          collections: ["Products"],
          title_contains: [],
          summary_contains: [],
          access_state: "public"
        }
      }
    ]
  }));
  writeFileSync(mapPath, JSON.stringify({
    collections: {
      "gold-a": ["Software & Apps"]
    }
  }));
  execFileSync("node", [
    "scripts/build-gold-v2-collections.mjs",
    "--gold", goldPath,
    "--collections-map", mapPath,
    "--out", goldV2Path
  ]);

  const goldV2 = JSON.parse(readFileSync(goldV2Path, "utf8"));
  assert.deepEqual(goldV2.labels[0].expected.collections, ["Software & Apps"]);
  assert.equal(goldV2.labels[0].expected.save_intent, "buy");

  writeFileSync(goldManifestPath, JSON.stringify({
    starter_collections: [{ title: "Software & Apps", description: "Software." }],
    samples: [{ sample_id: "gold-a", url: "https://example.com/gold" }]
  }));
  writeFileSync(silverPath, JSON.stringify({
    labels: [
      {
        sample_id: "silver-b",
        suitability: "core",
        include_in_gold: true,
        expected: {
          terminal_outcome: "ready",
          save_intent: "learn",
          entities: [],
          visit_target: "none",
          reminder: "none",
          collections: ["Articles & Guides"],
          title_contains: [],
          summary_contains: [],
          access_state: "public"
        }
      }
    ]
  }));
  writeFileSync(silverManifestPath, JSON.stringify({
    starter_collections: [{ title: "Software & Apps", description: "Software." }],
    samples: [{ sample_id: "silver-b", url: "https://example.com/silver" }]
  }));
  execFileSync("node", [
    "scripts/build-combined-eval-labels.mjs",
    "--gold", goldV2Path,
    "--gold-manifest", goldManifestPath,
    "--silver", silverPath,
    "--silver-manifest", silverManifestPath,
    "--out-labels", combinedLabelsPath,
    "--out-manifest", combinedManifestPath,
    "--target", "2"
  ]);

  const combined = JSON.parse(readFileSync(combinedLabelsPath, "utf8"));
  assert.deepEqual(
    combined.labels.map((label) => label.label_source),
    ["gold_v2_20collections", "silver"]
  );
  assert.equal(JSON.parse(readFileSync(combinedManifestPath, "utf8")).samples.length, 2);
});
