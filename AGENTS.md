# Agent Notes

Guidance for coding agents (Claude Code, Codex, etc.) working in this repository. `CLAUDE.md` is a symlink to this file.

## What this is

Precious Captures: an Android-first React Native app for saving links/text/images from the Android share sheet. The product path is Supabase-backed: native Android share intake enqueues a WorkManager job → the worker posts the capture (with the persisted Supabase session) to the `capture-intake` Supabase Edge Function → the function persists captures/assets, runs OpenAI structured extraction in a background task with URL evidence enrichment, links collections, and stores analysis runs → the worker polls for completion and updates the notification → the app reads everything back from the same hosted API.

`server/index.mjs`, `api/`, and `pages/api/` are legacy Mac/Vercel dev harnesses, not the product path. Vercel env (`EXPO_PUBLIC_SHAREBOOK_API_URL`) must not be set for Android builds.

## Architecture

Three runtime areas:

1. **Android device** — React Native UI (`app/`), Kotlin native modules (`android/app/src/main/java/com/preciouscaptures/`): `ShareIntakeActivity` handles SEND intents, `ShareProcessWorker` (WorkManager) uploads/polls in the background, `PreciousAuth` persists the Supabase session for background workers, `PreciousCaptureStore` is a SharedPreferences-backed local cache (processing placeholders, page caches, review drafts), `PreciousNetworkModule` does native HTTP with retries.
2. **Supabase Edge Function** (`supabase/functions/capture-intake/`) — a single function with an internal router (`lib/routes/router.ts`) dispatching by `resource` query param: captures, collections, search (keyword + vector hybrid), client-events. Capture processing (`lib/captures.ts`, `lib/analysis/`) builds URL evidence (`lib/url-evidence/`: normalize → cache → safe fetch → platform adapters → optional Exa), gates, calls OpenAI, links collections, records analysis runs.
3. **Supabase managed** — Auth, Postgres with RLS (`supabase/migrations/`), private capture asset storage, pgvector search.

App-side structure: `app/App.tsx` is the shell; state hooks live in `app/state/` (auth session, capture feed, review, search, collections); screens in `app/screens/`, bottom sheets in `app/sheets/`, design system in `app/ui/` (theme, motion via Reanimated 4, typography: Satoshi consumer / Clash Display display).

`app/captureLogic.js` is plain JS (with `.d.ts`) so Node's test runner can exercise it directly.

See `docs/architecture/system-architecture.md` for the full system map.

## Commands & Testing

Use `docs/testing.md` as the source of truth for test commands, Android phone dev loops, hosted release smoke tests, and handoff install flows.

```sh
npm test                      # fast PR check: typecheck + validate:intents + unit tests
npm run typecheck             # tsc --noEmit
npm run test:unit             # node --test test/*.test.js
node --test test/captureLogic.test.js   # single unit test file
npm run test:url-evidence     # Deno tests for the capture-intake Edge Function
```

Unit tests use Node's built-in runner against shared logic (`app/captureLogic.js`, `app/capturePresentation.ts`, `app/remoteData.ts`) — no Metro, emulator, or live Supabase needed.

Hosted/backend checks (need `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PRECIOUS_E2E_PASSWORD`):

```sh
npm run test:e2e:hosted       # hosted:verify (full intake→LLM→analysis_runs) + hosted:verify:review
```

Other e2e: `npm run test:e2e:android-share` (share-sheet boundary), `npm run test:e2e:animations` (motion validation → writes /tmp/precious-motion.mp4 + framestats; the recording is the source of truth for motion feel, not green tests).

### Maestro regression tests

Maestro flows live in `.maestro/` (sign-in, manual capture, collections, animation validation). Run them against the hosted release APK to catch UI regressions:

```sh
npm run android:build:hosted
npm run android:install
npm run test:e2e:maestro    # needs PRECIOUS_E2E_EMAIL / PRECIOUS_E2E_PASSWORD
```

Run the Maestro smoke after changing any user-critical flow, and update or add a flow in `.maestro/` when you change one of those journeys so the regression coverage tracks the product. Keep coverage focused on user-critical flows: sign-in, manual capture, review/edit, collection creation, delete/undo, and Android share intake. Prefer visible-text assertions; use `testID` only for controls whose labels or placement may change during design iteration.

## Android Phone Installs

For fast UI work on a physical phone, the debug APK + Metro dev loop is fine (JS/TS changes hot-reload):

```sh
npm run android:dev:install   # rebuild only after native/Gradle/BuildConfig changes
npm run android:dev           # keep Metro running
npm run android:dev:launch    # relaunch app from another terminal
```

The debug APK is for active development only. Do not install `android/app/build/outputs/apk/debug/app-debug.apk` onto the phone for normal handoff — it expects a Metro dev-server bundle and shows `Unable to load script` when Metro is not running. For handoff or standalone phone testing, build and install the bundled hosted release APK:

```sh
npm run android:build:hosted  # embeds JS bundle + hosted Supabase config
adb install -r android/app/build/outputs/apk/release/app-release.apk
adb shell am start -n com.preciouscaptures/.MainActivity
```

Or `npm run android:push:wifi` for Wi-Fi installs. If Java is not found, use OpenJDK 17:

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@17 npm run android:build:hosted
```

## Supabase Pushes

Only push/deploy Supabase when backend files changed, such as `supabase/functions`, `supabase/migrations`, or API/server code that is actually deployed. Pure React Native UI changes in `app/` do not require a Supabase push.

```sh
npm run hosted:db:push
npm run hosted:deploy
npm run hosted:verify
```

## Product Documentation

Before product, UI, workflow, capture-review, search, collection, reminder, or navigation changes, read these artifacts and keep them consistent:

- `docs/precious-style-guide.md` — visual/workflow rules
- `docs/requirements/consumer-ui-revamp-acceptance.md` — current UI criteria
- `docs/requirements/CONTEXT.md` — domain language only
- `docs/requirements/PRODUCT.md`
- `docs/adr/` — durable decisions

If a product decision changes, update the smallest relevant artifact immediately. Create or update an ADR when the decision is durable, surprising without context, and the result of a real trade-off.

## Hard Rules

- **DRY**: prefer reusing and improving existing components, hooks, helpers, and Kotlin utilities over adding parallel ones. Shared capture logic belongs in `app/captureLogic.js` / `app/capturePresentation.ts` (unit-testable), shared backend logic in `supabase/functions/capture-intake/lib/` — don't duplicate it across screens, routes, or scripts. Less code is better than more code.
- **No hairline borders, one-pixel outlines, or visible hairline dividers** in the consumer UI. They make the product feel fussy and brittle; prefer spacing, tonal fills, soft grouped surfaces, shadows, or typography to create separation.
- **Pressed/tap highlights must be designed for the control's shape and weight — never a default or full-width hard-edged rectangle.** Every pressable needs a deliberate pressed state, and a tonal press fill must match the control's own radius and footprint. A full-width row uses a fill that spans the row's rounded surface; a primary button reuses its own `borderRadius`; a text-only or "link" action must hug its label (e.g. `alignSelf: "center"` + a pill `borderRadius` + horizontal padding) so the fill is a soft rounded shape, or use opacity/scale dimming with no fill at all. Never apply a background-fill pressed style (e.g. `subtlePressed`) to an element that has no matching `borderRadius`, and never leave the platform-default rectangular ripple/highlight on a custom control. Match the emphasis of the press feedback to the action: prominent for primary, whisper-quiet for secondary/destructive-secondary.
- **No semantic interpretation in the RN app**: no keyword/regex/substring classification or rationale logic in `app/`. The app renders structured capture fields and product copy; semantic interpretation belongs in `supabase/functions`, bounded extractor/parser adapters, or other backend analysis code with tests.
- **Keep LLM prompts, preflight gates, and policy decisions domain-agnostic.** If a specific site needs richer handling, put that logic in a bounded extractor/parser adapter for that site's public URL format or API, and keep the prompt/policy language generic. Do not make platform-specific or app-specific behavior changes unless the user explicitly asks for that platform/app. When investigating a platform-specific example, first look for a source-agnostic state or capability (access-limited content, login-gated pages, weak metadata, missing media, opaque share URLs, user-provided screenshot evidence) and prefer generic detection, routing, and copy that apply across sources.
- Keep real secrets in this repo's ignored `.env.local`; commit only `.env.example`. Parent Sharebook repo env files are a temporary migration convenience only.

## Architecture Documentation Expectations

When documenting architecture, system flows, data flows, persistence, external integrations, or runtime boundaries:

- Use the `$system-architecture-mapper` skill when available.
- Write for a technical product person first and an engineer second.
- Base claims on repository evidence.
- Include Mermaid diagrams.
- Include components, processes, persistence layers, integrations, config, and failure behavior.
- Mark unclear areas as unknown rather than guessing.
- Do not modify application behavior.
- Do not expose secrets.

## Environment

```sh
cp .env.example .env.local
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
# PRECIOUS_CAPTURE_FUNCTION_URL is derived from EXPO_PUBLIC_SUPABASE_URL if omitted
```

Auth is email/password (no magic links, to avoid redirect issues); create dogfood users with `npm run hosted:create-user -- --email ... --password ...`. Android app id is `com.preciouscaptures`. A 404 from the app usually means `capture-intake` isn't deployed for the configured project (`curl -i .../functions/v1/capture-intake` — 401 means deployed, 404 means deploy it).
