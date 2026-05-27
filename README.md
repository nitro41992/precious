# Precious Captures

Fresh mobile prototype for the smallest useful Sharebook loop:

1. Share text or a link from Android.
2. Show a short processing notification.
3. Run Supabase-hosted LLM extraction while the app can be closed.
4. Tap the notification to quick edit.
5. Persist captures and extracted structure in Supabase.

The product path is Supabase-backed: native share intake enqueues Android WorkManager,
the worker posts to the Supabase Edge Function with the persisted user session, the
function stores captures and image assets in Supabase, runs OpenAI structured extraction
in a background task, and the worker polls for completion before updating the local
notification. The Mac server and Vercel API routes are only dev/legacy harnesses and are
not required for the mobile product flow.

## Requirements

Copied product/design requirements live in `docs/requirements/`. They are reference material only; no old app code was copied into this prototype.

`docs/requirements/RESET_REQUIREMENTS.md` is the controlling scope for this fresh app.

## Commands

```sh
npm run typecheck
npm run android:build:hosted
npm run android:install
```

Set these environment variables before building Android:

```sh
cp .env.example .env.local
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
PRECIOUS_CAPTURE_FUNCTION_URL=https://YOUR_PROJECT.supabase.co/functions/v1/capture-intake
```

If `PRECIOUS_CAPTURE_FUNCTION_URL` is omitted, the build uses
`${EXPO_PUBLIC_SUPABASE_URL}/functions/v1/capture-intake`.

Deploy the Supabase worker:

```sh
supabase db push
supabase secrets set OPENAI_API_KEY=...
export SUPABASE_ACCESS_TOKEN=...
npm run hosted:deploy
npm run hosted:verify
```

Live deploy and verification need these local secrets:

```sh
SUPABASE_ACCESS_TOKEN=...
SUPABASE_SERVICE_ROLE_KEY=...
PRECIOUS_E2E_PASSWORD=...
```

Use image verification when changing Android image capture or asset analysis:

```sh
npm run hosted:verify -- --image /path/to/test-image.png --allow-no-reminder
```

The script name still says `hosted` for compatibility, but it now targets the
Supabase Edge Function by default. Set `PRECIOUS_CAPTURE_FUNCTION_URL` only when
you need to override the derived `${EXPO_PUBLIC_SUPABASE_URL}/functions/v1/capture-intake`.

This repo should own the mobile dogfood env going forward. Parent-repo env files are
still read as a temporary migration convenience, but do not rely on them if the parent
Sharebook repo is being sunset. Keep real values in this repo's ignored `.env.local`;
commit only `.env.example`.

The app uses email/password auth to avoid magic-link redirect issues. After sign-in,
the native session is stored for Android share-sheet background workers.

For private dogfood accounts, create or reset a confirmed password user without magic
links:

```sh
npm run hosted:create-user -- --email you@example.com --password 'a-long-password'
```

`npm run android:build:hosted` loads Supabase env vars from this repo and the parent
Sharebook `.env` files before building the APK. Use it for phone builds that should
call the Supabase Edge Function instead of the old Mac runner.

`npm run hosted:verify` creates or signs in a password-based e2e user, posts a real
link to the Supabase capture function, polls until the LLM result is terminal, then requires
LLM evidence, a succeeded `analysis_runs` row, and structured intent. It uses:

```sh
EXPO_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
PRECIOUS_CAPTURE_FUNCTION_URL
```

The old `server:dev` and `android:reverse` scripts remain for debugging the earlier
Mac-hosted prototype, but they are not the product path.

Vercel is not part of the current mobile product path. Do not set
`EXPO_PUBLIC_SHAREBOOK_API_URL` for Android dogfood builds; the app resolves capture
intake to Supabase.

## Troubleshooting

`Request failed (404)` from the Android app usually means the Supabase Edge Function is
not deployed for the configured project. Confirm with:

```sh
curl -i https://YOUR_PROJECT.supabase.co/functions/v1/capture-intake
```

Expected responses:

- `401 Unauthorized`: the function exists and is waiting for a Supabase auth token.
- `404 NOT_FOUND` with `Requested function was not found`: deploy `capture-intake`.

Deploy after setting `SUPABASE_ACCESS_TOKEN` or running `npx supabase login`:

```sh
supabase db push
npm run hosted:deploy
```

The Android app id is `com.preciouscaptures`.
