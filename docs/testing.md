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

Keep Maestro coverage focused on user-critical flows: sign-in, manual capture, review/edit, collection creation, archive/restore, and Android share intake. Prefer visible text for stable user-facing assertions and `testID` only for controls whose labels or placement may change during design iteration.

## Android phone dev loop

For fast UI work on a physical phone, install the debug APK once, then run Metro. This is the phone equivalent of the emulator dev loop: JavaScript and TypeScript changes update through Metro without rebuilding a hosted APK.

```sh
npm run android:dev:install
npm run android:dev
npm run android:dev:launch
```

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
