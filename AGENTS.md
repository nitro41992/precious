# Agent Notes

## Product Documentation

Before product, UI, workflow, capture-review, search, collection, reminder, or navigation changes, read these artifacts and keep them consistent:

- `docs/precious-style-guide.md`
- `docs/requirements/consumer-ui-revamp-acceptance.md`
- `docs/requirements/CONTEXT.md`
- `docs/requirements/PRODUCT.md`
- `docs/adr/`

If a product decision changes, update the smallest relevant artifact immediately. Use `CONTEXT.md` only for domain language, use the acceptance doc for current UI criteria, use the style guide for visual/workflow rules, and create or update an ADR when the decision is durable, surprising without context, and the result of a real trade-off.

## Android Phone Installs

Do not install `android/app/build/outputs/apk/debug/app-debug.apk` onto the phone for normal handoff. The debug APK expects a Metro/dev-server JavaScript bundle and can show `Unable to load script` when Metro is not running.

For a standalone phone install, build and install the bundled hosted release APK:

```sh
npm run android:build:hosted
adb install -r android/app/build/outputs/apk/release/app-release.apk
adb shell am start -n com.preciouscaptures/.MainActivity
```

If Java is not found, use OpenJDK 17:

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@17 npm run android:build:hosted
```

The hosted build script embeds the JavaScript bundle and hosted Supabase configuration.

## Supabase Pushes

Only push/deploy Supabase when backend files changed, such as `supabase/functions`, `supabase/migrations`, or API/server code that is actually deployed. Pure React Native UI changes in `app/App.tsx` do not require a Supabase push.

## Extraction Rules

Keep LLM prompts, preflight gates, and policy decisions domain-agnostic. If a specific site needs richer handling, put that logic in a bounded extractor/parser adapter for that site's public URL format or API, and keep the prompt/policy language generic.
