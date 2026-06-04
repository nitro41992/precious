# Capture Accuracy Eval

This workspace builds a 300-row offline dataset for measuring Sharebook Capture
Analysis. Exa can source public URLs and reviewer context, and the hosted
backend can use Exa as gated runtime URL evidence when `EXA_API_KEY` is
configured. Exa is not the gold label source. Gemini silver labels reduce manual
work, but human-reviewed gold labels are the primary accuracy truth.

## Truth Policy

- Exa can provide observed public evidence: URL, title, author, text excerpts,
  highlights, images, and crawl/access status.
- Human labels are the ground truth for Sharebook-specific decisions: terminal
  outcome, Save Intent, meaningful entities, Visit Target, structured location
  context, Reminder idea, and Collection fit.
- Gemini labels are independent silver labels. They should guide review queue
  priority, never replace gold labels in the primary accuracy report.
- Blocked, login-gated, stale, or weak public links remain useful samples. The
  correct label may be `rejected`, `needs_review`, or no Save Intent.
- Gemini does not use search grounding by default. Exa/public evidence and
  private Capture fields are the fixed evidence package.

## Dataset Shape

- Public Exa samples: 240.
- Private real-Capture samples: 60, exported newest-first by `created_at desc`.
- Coverage quotas:
  - At least 50 rows with explicit date/time evidence.
  - At least 25 location-only rows with no future date/time.
  - At least 15 Google Maps or `maps.app.goo.gl` rows.
  - Broad target-fit coverage across the eval starter Collections.
  - At least 20 ambiguous or negative rows.
- Eval Starter Collections:
  - The manifest carries 20 eval-only starter Collections, each with a
    description. The descriptions are passed to Gemini silver, seeded into the
    hosted eval account, embedded for retrieval, and shown to the Precious
    collection reranker.
  - Real product empty-account starters remain the current five. The broader
    20-Collection set is for recall/selection evaluation only.

## Workflow

1. Generate a 240-row public manifest plus label template:

   ```sh
   EXA_API_KEY=... npm run eval:exa:generate
   ```

2. Export 60 private real-Capture samples in a local ignored manifest:

   ```sh
   npm run eval:private:export -- --yes
   ```

3. Run a Gemini structured-output preflight:

   ```sh
   GEMINI_API_KEY=... GEMINI_LABEL_MODEL=gemini-3.5-flash npm run eval:label:preflight
   ```

   If `gemini-3.5-flash` is unavailable for the key, override the model with
   `GEMINI_LABEL_MODEL`. Keep the default model at `gemini-3.5-flash`.

4. Generate silver labels:

   ```sh
   npm run eval:label:silver
   ```

5. Run a small hosted pilot:

   ```sh
   npm run eval:capture:run -- --limit 30 --yes
   npm run eval:capture:score
   ```

   The runner seeds the eval user from the manifest `starter_collections`
   block, including descriptions and `text-embedding-3-small` embeddings. It
   archives stale eval-seeded Collections not present in the manifest so
   Precious and Gemini silver see the same Collection universe. Use
   `--no-seed-starter-collections` only when that user is already seeded. To
   test whether fixed public evidence helps Precision without changing the
   production URL, add `--supplement-public-evidence`; the runner keeps
   `sourceUrl` unchanged and adds bounded Exa title/summary/highlights to
   eval-only `sourceText`. To evaluate production-style runtime enrichment
   after deploying the backend with `EXA_API_KEY`, use
   `--runtime-exa-evidence` instead; it keeps `sourceText` as the URL and lets
   `capture-intake` attach Exa as first-class `url_evidence`.

6. Generate a human review queue:

   ```sh
   npm run eval:review:queue
   ```

   Review the generated CSV for marking decisions. It has one row per review
   item, side-by-side Gemini silver vs Precious values, editable `gold_*`
   columns, `decision`, `include_in_gold`, and suitability fields. The Markdown
   is the readable companion view, and JSON remains the machine-readable queue.
   The queue includes all disagreements, low-confidence silver rows,
   blocked/login-gated rows, date/time Reminder cases, location-only false
   Reminder risks, structured location disagreements, Collection-fit
   mismatches, suitability exclusions, and a deterministic 15% sample of
   agreement rows.

7. Promote reviewed rows into
   `eval/capture-accuracy/generated/gold-labels.json`, then pass that file as
   the scoring labels:

   ```sh
   npm run eval:review:gold:build
   ```

   The builder skips CSV rows whose `decision` cell is blank, so partial review
   is safe. Primary accuracy uses gold labels only; silver agreement is
   secondary.

8. Convert reviewed pilot gold to the 20-Collection v2 set:

   ```sh
   cp eval/capture-accuracy/generated/silver-e2e-30-taxonomy-gold-labels.json eval/capture-accuracy/generated/silver-e2e-30-gold-v1-5collections.json
   npm run eval:review:gold:v2-collections
   ```

   This preserves terminal outcome, Save Intent, Reminder, Visit Target,
   access, title/summary, and entities exactly. Only
   `expected.collections` changes, using the targeted Collection review map.
   The v1 artifact remains available as `gold-v1-5collections`.

9. Run the full dataset after the pilot labels and scoring look right:

   ```sh
   npm run eval:capture:run -- --private-manifest eval/capture-accuracy/private/real-captures.json --yes
   npm run eval:capture:score -- --labels eval/capture-accuracy/generated/gold-labels.json
   ```

10. Build and score the combined 100-row set when there are enough fresh silver
    rows:

    ```sh
    npm run eval:combined:build
    npm run eval:capture:run -- --manifest eval/capture-accuracy/generated/combined-100-gold-v2-plus-silver-manifest.json --yes --runtime-exa-evidence
    npm run eval:capture:score -- --predictions eval/capture-accuracy/generated/capture-eval-predictions.json --labels eval/capture-accuracy/generated/combined-100-gold-v2-plus-silver-labels.json
    ```

    The combined builder pins reviewed
    `gold_v2_20collections` rows first, fills to 100 with non-overlapping
    scorable Gemini silver rows, excludes unsuitable labels from primary
    scoring, and records every row's `label_source`.

Generated raw Exa responses, predictions, reports, and private manifests are
ignored by git.

## Label Fields

- `terminal_outcome`: `ready`, `needs_review`, `failed`, or `rejected`
- `save_intent`: one active Save Intent, or empty when not labeled
- `entities`: names or `{ "name": "..." }` objects expected from analysis
- `visit_target`: expected place/search target, or `none`
- `location_context`: optional structured location fields such as
  `place_name`, `address`, `city`, `region`, `country`, `coordinates`,
  `source_destination`, and coarse local-vs-travel context when the fixed
  evidence supports it. This is scored separately from `visit_target`.
- `reminder`: `suggested` or `none`
- `reminder_fields`: optional exact date/time details that explain a
  `suggested` Reminder
- `collections`: expected existing eval Collection titles
- `title_contains` / `summary_contains`: required substrings for lightweight
  title/summary quality checks
- `access_state`: reviewer note such as `public`, `blocked`, `login_gated`,
  `stale`, or `dead`
- `suitability`: `core`, `edge`, or `exclude`; excluded rows are omitted from
  primary scoring

Save Intent silver labels follow the same precedence as Precious: `learn` over
`read` for instructional material; `do` over `visit` for scheduled activities;
`visit` for concrete places; `plan` for logistics or future arrangements; `buy`
for concrete purchase targets; `cook` for food preparation; and `make` for
created artifacts.

Collection labels should require a strong subject or purpose fit, especially
for secondary Collections. Use `Articles & Guides` when the guide, checklist,
template, or explanatory framing is central to why the item is worth saving;
do not add it merely because the page is article-shaped. Likewise, examples
inside a guide should not trigger their own topical Collections unless that
topic is the main content. For example, a vacation meal-planning guide can be
`Travel & Trips` plus `Articles & Guides`, but it should not be `Recipes`
unless recipe or cooking instructions are central. Product rankings, shopping
roundups, and list-style buying guides should usually remain `Products` only
unless they include substantial non-shopping instruction.
Likewise, single-place restaurant reviews or menu walkthroughs should usually
remain `Restaurants & Cafes`; add `Travel & Trips` only when the content helps
plan a destination or trip beyond the dining place itself.

Precious may expose an internal `capture_role` in eval/debug output. Treat it
as a reranker trace for the capture's saved-value role, not as a gold label or
user-facing taxonomy.

Prompt and reranker improvement candidates live in
`eval/capture-accuracy/prompt-pipeline-improvements.md` so repeated review
patterns can be planned without bloating this workflow README.

## Networkless Smokes

```sh
npm run eval:exa:generate -- --dry-run --fixture eval/capture-accuracy/fixtures/exa-search-fixture.json --target 2 --smoke --out eval/capture-accuracy/generated/fixture-manifest.json --labels-out eval/capture-accuracy/generated/fixture-labels-template.json
npm run eval:label:silver -- --fixture eval/capture-accuracy/fixtures/gemini-label-fixture.json --manifest eval/capture-accuracy/generated/fixture-manifest.json --out eval/capture-accuracy/generated/fixture-silver-labels.json
npm run eval:review:queue -- --manifest eval/capture-accuracy/generated/fixture-manifest.json --predictions eval/capture-accuracy/generated/fixture-predictions.json --silver-labels eval/capture-accuracy/generated/fixture-silver-labels.json --out eval/capture-accuracy/generated/fixture-review-queue.json
npm run eval:review:gold:build -- --csv eval/capture-accuracy/generated/fixture-review-queue.csv --silver-labels eval/capture-accuracy/generated/fixture-silver-labels.json --out eval/capture-accuracy/generated/fixture-gold-labels.json
npm run eval:capture:score -- --predictions eval/capture-accuracy/generated/fixture-predictions.json --labels eval/capture-accuracy/generated/fixture-labels-template.json --silver-labels eval/capture-accuracy/generated/fixture-silver-labels.json --out eval/capture-accuracy/generated/fixture-score.json --markdown eval/capture-accuracy/generated/fixture-score.md
```

For low-usage live smoke runs, pass `--smoke` with a small `--target`. That stops
Exa after enough candidates exist for the requested sample instead of querying
every seed query. Omit `--smoke` for the representative 240-row public corpus.
