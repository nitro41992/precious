# Testing Precious Captures

## Fast PR checks

Run this before opening a PR:

```sh
npm test
```

That runs:

- `npm run typecheck`
- `npm run validate:intents`
- `npm run test:unit`

The unit tests use Node's built-in test runner against shared app logic in `app/captureLogic.js`, so they do not need Metro, an emulator, or live Supabase credentials.

## Hosted product-path checks

Run these when backend behavior, capture review, collections, assets, or extraction output shape changes:

```sh
npm run test:e2e:hosted
```

Required environment:

```sh
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
PRECIOUS_E2E_PASSWORD=...
PRECIOUS_E2E_EMAIL=precious-captures-e2e@example.com # optional
```

`hosted:verify` exercises capture intake, polling, LLM analysis evidence, persisted `analysis_runs`, and optional image assets. `hosted:verify:review` seeds deterministic review/collection fixtures and verifies review mutations without relying on a fresh LLM response.

## Capture accuracy evals

Use the Exa-seeded eval harness when you need a broader measurement of Capture
Analysis quality across public links and a private real-capture slice. Exa can
source the public corpus and can be exercised as runtime URL evidence when the
hosted backend has `EXA_API_KEY`; Gemini drafts independent silver labels from
the fixed evidence package, and human labels are the gold truth for Save Intent,
entities, Visit Targets, Reminder ideas, Collections, terminal outcome, and
rejection or review correctness.

Generate a 240-row public manifest and label template:

```sh
EXA_API_KEY=... npm run eval:exa:generate
```

For a networkless smoke of the generator:

```sh
npm run eval:exa:generate -- --dry-run --fixture eval/capture-accuracy/fixtures/exa-search-fixture.json --target 2 --smoke
```

For low-usage live smoke generation, also pass `--smoke` with the small target so
Exa stops once enough candidates exist. Omit `--smoke` for the representative
240-row public corpus.

Export the 60 newest private real-Capture samples when Supabase credentials are
available and private data export is approved:

```sh
npm run eval:private:export -- --yes
```

Run the Gemini structured-output preflight, then draft silver labels:

```sh
GEMINI_API_KEY=... GEMINI_LABEL_MODEL=gemini-3.5-flash npm run eval:label:preflight
npm run eval:label:silver
```

If `gemini-3.5-flash` is unavailable for the key, the preflight fails with a
model-access message and you can override `GEMINI_LABEL_MODEL`.

After copying or promoting reviewed labels to
`eval/capture-accuracy/generated/gold-labels.json`, run a hosted pilot before
the full pass:

```sh
npm run eval:capture:run -- --limit 30 --yes
npm run eval:review:queue
npm run eval:review:gold:build
npm run eval:capture:score -- --labels eval/capture-accuracy/generated/gold-labels.json
```

Use the generated review queue CSV for human decisions and field edits. The
Markdown is the readable companion: it groups rows by terminal/access,
Reminder/Visit Target, intent/Collections, and content-quality work, then shows
Gemini silver and Precious output side by side. The queue JSON is for scripts.
Set a row's `decision` before building gold labels; blank decisions are skipped.

The hosted runner seeds the eval user from the manifest `starter_collections`
block, including titles, descriptions, and embeddings. For the 20-Collection
accuracy eval, keep that set in the manifest so Precious hosted eval and Gemini
silver use the same Collection descriptions for retrieval and selection. Pass
`--no-seed-starter-collections` only when the user is already seeded. To
evaluate production-style runtime Exa enrichment, deploy `capture-intake` with
`EXA_API_KEY` and add `--runtime-exa-evidence`; it keeps `sourceText` as the URL
and lets the backend attach Exa as first-class `url_evidence`. The older
`--supplement-public-evidence` flag remains available for fixed-evidence
experiments that inject bounded Exa context into eval-only `sourceText`.

For the reviewed 30-row pilot, keep the original reviewed gold as the
five-Collection baseline and build the targeted 20-Collection v2 artifact:

```sh
cp eval/capture-accuracy/generated/silver-e2e-30-taxonomy-gold-labels.json eval/capture-accuracy/generated/silver-e2e-30-gold-v1-5collections.json
npm run eval:review:gold:v2-collections
```

That v2 conversion only updates `expected.collections`; terminal outcome, Save
Intent, Reminder, Visit Target, access, title/summary, and entities stay copied
from the reviewed gold labels.

After generating enough 20-Collection Gemini silver rows, build the combined
100-row scored set:

```sh
npm run eval:combined:build
```

The combined labels pin scorable reviewed gold v2 rows first, fill with
non-overlapping silver rows, exclude unsuitable rows from primary scoring, and
record `label_source` on every row.

For the full hybrid dataset, keep the 60 real-capture samples in a local ignored
manifest such as `eval/capture-accuracy/private/real-captures.json`:

```sh
npm run eval:capture:run -- --private-manifest eval/capture-accuracy/private/real-captures.json --yes
npm run eval:review:queue
npm run eval:review:gold:build
npm run eval:capture:score -- --labels eval/capture-accuracy/generated/gold-labels.json
```

The hosted runner requires the same Supabase environment as the hosted product
checks plus `PRECIOUS_EVAL_PASSWORD` or `PRECIOUS_E2E_PASSWORD`. It refuses to
create eval Captures unless `--yes` is passed.

For networkless eval smoke coverage:

```sh
npm run eval:label:silver -- --fixture eval/capture-accuracy/fixtures/gemini-label-fixture.json --manifest eval/capture-accuracy/generated/fixture-manifest.json --out eval/capture-accuracy/generated/fixture-silver-labels.json
npm run eval:review:queue -- --manifest eval/capture-accuracy/generated/fixture-manifest.json --predictions eval/capture-accuracy/generated/fixture-predictions.json --silver-labels eval/capture-accuracy/generated/fixture-silver-labels.json --out eval/capture-accuracy/generated/fixture-review-queue.json
npm run eval:review:gold:build -- --csv eval/capture-accuracy/generated/fixture-review-queue.csv --silver-labels eval/capture-accuracy/generated/fixture-silver-labels.json --out eval/capture-accuracy/generated/fixture-gold-labels.json
npm run eval:capture:score -- --predictions eval/capture-accuracy/generated/fixture-predictions.json --labels eval/capture-accuracy/generated/fixture-labels-template.json --silver-labels eval/capture-accuracy/generated/fixture-silver-labels.json --out eval/capture-accuracy/generated/fixture-score.json --markdown eval/capture-accuracy/generated/fixture-score.md
```

## Android release smoke tests

Build and install the standalone hosted release APK before running Maestro:

```sh
npm run android:build:hosted
npm run android:install
npm run test:e2e:maestro
```

The Maestro scripts load `.env`, `.env.local`, and the legacy parent app env files. They need:

```sh
PRECIOUS_E2E_EMAIL=...
PRECIOUS_E2E_PASSWORD=...
```

Keep Maestro coverage focused on user-critical flows: sign-in, manual capture, review/edit, collection creation, delete/undo, and Android share intake. Prefer visible text for stable user-facing assertions and `testID` only for controls whose labels or placement may change during design iteration.

## Android phone dev loop

For fast UI work on a physical phone, install the debug APK once, then run Metro. This is the phone equivalent of the emulator dev loop: JavaScript and TypeScript changes update through Metro without rebuilding a hosted APK.

```sh
npm run android:dev:install
npm run android:dev
npm run android:dev:launch
```

The debug build loads Supabase public config from `.env`, `.env.local`, and the
legacy `../apps/mobile` / `../apps/web` env locations before embedding Android
`BuildConfig` values. Re-run `npm run android:dev:install` if those values
change.

Keep `npm run android:dev` running while you edit. Run `npm run android:dev:launch` in another terminal when you need to relaunch the app. Re-run `npm run android:dev:install` only after native Android, manifest, Gradle, native dependency, or BuildConfig environment changes.

Debug builds depend on Metro. For handoff or standalone phone testing, use the hosted release flow below instead.

After the sign-in flow has established a session on the device, run the Android share-intake smoke:

```sh
npm run test:e2e:android-share
```

This sends an Android `ACTION_SEND` text intent to `ShareIntakeActivity`, opens the app with `adb`, then polls Supabase for the unique marker in the persisted `source_text` / `source_url`. Maestro remains the preferred tool for normal in-app journeys; this smoke owns the Android system-share boundary directly because Maestro app launch can be flaky after external intents.

The share smoke picks a random real-world URL from `test/fixtures/share-smoke-urls.txt`, appends a unique marker to the shared URL, and verifies that marker was persisted with the capture. To broaden coverage without editing the test, pass a larger newline, Tranco-style CSV, or Common Crawl CDX JSON-lines corpus:

```sh
PRECIOUS_SHARE_SMOKE_URL_CORPUS=/path/to/urls.txt npm run test:e2e:android-share
PRECIOUS_SHARE_SMOKE_SEED=regression-2026-05-28 npm run test:e2e:android-share
```

## Phone handoff

For normal phone handoff, do not install the debug APK. Use:

```sh
npm run android:build:hosted
adb install -r android/app/build/outputs/apk/release/app-release.apk
adb shell am start -n com.preciouscaptures/.MainActivity
```

For Wi-Fi installs, prefer the resilient helper. It rediscovers the current
Wireless Debugging port, wakes the device best-effort, retries non-streaming
install, and launches the app:

```sh
npm run android:push:wifi
```

If the phone still does not appear, unlock it and keep Android `Wireless
debugging` open, then run:

```sh
npm run android:install:wifi
```
