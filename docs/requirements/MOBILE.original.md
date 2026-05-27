# Sharebook Mobile

Android-first React Native dogfood app for Phase 0A.

## Current Implementation Note

The current Precious Captures app is mobile-first and uses Supabase as the canonical
backend path. Android share intake posts to the Supabase Edge Function
`${EXPO_PUBLIC_SUPABASE_URL}/functions/v1/capture-intake`, which stores captures,
image assets, analysis runs, reminders, and archive state in Supabase. Vercel/Next API
routes are legacy/dev harnesses for this prototype and are not the current dogfood
product path.

## Why This Exists

The web app remains the eval and feedback dashboard. This app exists to remove the dogfood bottleneck of sending phone captures to a Mac before uploading them.

## Setup

1. Copy the environment template:

   ```sh
   cp .env.example .env.local
   ```

2. Fill:

   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - optional: `PRECIOUS_CAPTURE_FUNCTION_URL`

   If `PRECIOUS_CAPTURE_FUNCTION_URL` is omitted, the app derives
   `${EXPO_PUBLIC_SUPABASE_URL}/functions/v1/capture-intake`. Do not use
   `EXPO_PUBLIC_SHAREBOOK_API_URL` for the current Android dogfood path.

   Keep these values in this repo's ignored `.env.local`. Parent-repo env fallbacks are
   temporary and should not be required once this prototype stands alone.

3. Deploy the Supabase backend:

   ```sh
   supabase db push
   supabase secrets set OPENAI_API_KEY=...
   export SUPABASE_ACCESS_TOKEN=...
   npm run hosted:deploy
   ```

4. Build/run Android:

   ```sh
   npm run android
   ```

## Dogfood Modes

### Native installed app

This is the target path for real 0A dogfooding. The app is installed on the phone and receives Android share-sheet payloads as Sharebook. It should not depend on Expo Go.

For walking-around dogfooding, the phone needs the Supabase project URL and deployed
Edge Function. It should not depend on a Mac, local LAN URL, tunnel, or Vercel API.

The installed debug APK still expects Metro unless built with a bundled JS payload. For field dogfooding, prefer a release/internal build once the first native loop is working.

Build the local release APK with embedded JavaScript:

```sh
npm run build:mobile:dogfood
```

Install the generated APK:

```sh
npm run device -- install apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

The dogfood build script refuses local API URLs because the app needs to work away from the Mac.

### Auth

Mobile uses the same Supabase account as the web dashboard. Magic link and password sign-in are enabled for current dogfooding. Google is hidden by default and can be turned back on later with `EXPO_PUBLIC_ENABLE_GOOGLE_AUTH=true` and `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true`.

To preserve access to existing web eval data, sign in with the same email address you used on web.

Supabase setup required:

- Email auth and Magic Links are enabled by default in Supabase Auth.
- Add `sharebook://auth/callback` to Supabase Auth redirect URLs.
- Add local development callback URLs, such as `http://127.0.0.1:3000/auth/callback`.
- For solo dogfooding, the built-in Supabase email sender can work only for addresses that belong to the Supabase project team and is rate-limited. For anyone outside the project team, configure custom SMTP.
- Update the Supabase Magic Link email template to include both the link and OTP code:

```txt
Sign in to Sharebook:
{{ .ConfirmationURL }}

Or enter this code:
{{ .Token }}
```

You do not need to buy a domain just to test Android magic links or email codes. Use
`sharebook://auth/callback` as the mobile redirect URL. A custom domain is mainly
needed later for better email deliverability and brand trust.

Custom SMTP notes:

- Supabase works with any SMTP provider. Resend, Postmark, SendGrid, Brevo, AWS SES, and similar services all work.
- For quick private testing without a domain, use Supabase's built-in sender if your email is a team member. If you need custom SMTP before buying a domain, an existing mailbox provider with SMTP credentials can work, but deliverability and limits are worse than a real sending domain.
- For beta users, use a real sending domain or subdomain, for example `auth.yourdomain.com`, with SPF, DKIM, and DMARC configured in the email provider.

Future Google setup:

- Enable Google as a Supabase Auth provider and configure the Google OAuth client ID/secret.
- Turn on `EXPO_PUBLIC_ENABLE_GOOGLE_AUTH=true` and `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true`.
- Supabase automatically links OAuth identities with the same verified email. Signed-in users can also use the explicit Connect Google action when the feature flag is enabled.

### Nearby wireless debugging

Wireless ADB is useful while the phone and Mac are on the same Wi-Fi. It lets Codex launch the app, capture screenshots, read logs, install APKs, and simulate text/URL shares without a USB cable. It does not help once the phone leaves the network.

On Android, enable Developer options, open Wireless debugging, then use the pairing address/code:

```sh
npm run device -- pair <pair-host:pair-port> <pair-code>
npm run device -- connect <device-host:device-port>
npm run device -- status
```

Useful native-device commands:

```sh
npm run device -- install
npm run device -- launch
npm run device -- screenshot
npm run device -- logs
npm run device -- logs:clear
npm run device -- share-url https://example.com
```

Verify the full native share path against Supabase:

```sh
supabase db push
npm run hosted:deploy
npm run hosted:verify
npm run hosted:verify -- --image /path/to/test-image.png --allow-no-reminder
```

This creates or signs in a real Supabase test user, posts a deterministic capture to
the deployed Supabase Edge Function, waits for terminal analysis state, and requires
persisted analysis evidence. It needs `SUPABASE_ACCESS_TOKEN` for deploy,
`SUPABASE_SERVICE_ROLE_KEY` for verification, and `PRECIOUS_E2E_PASSWORD` for the
test user. The image verifier also requires a local image fixture path.

`npm run android:e2e:workflow` is the broader manual regression gate. It uses the same dedicated e2e account, verifies native text share, in-app pasted link, in-app manual note, deterministic native image share, Review Inbox/Capture Review navigation, Quick Edit intent change, reminder acceptance, Search, Library, Settings, backend analysis evidence, and success cleanup. Pass `-- --keep-data` when you want to inspect the generated Supabase records after a successful run.

### Expo QR

Expo QR is useful for fast UI iteration and console output, but it is not the main dogfood path. Expo Go cannot act as the Sharebook Android share target from this app's native manifest.

## Capture Flow

1. Sign in with Google, password, or a magic link using the same account as the web dashboard.
2. Share a URL, text, screenshot, or image to Sharebook from Android.
3. Sharebook silently saves the Capture through the Supabase Edge Function without requiring confirmation.
4. Capture analysis runs in the background with a compact per-Capture status notification.
5. When analysis is complete, the notification updates to "Capture processed" with either "Extraction looks good" or "Extraction needs review."
6. "Extraction looks good" can be quiet or minimized by default; "Extraction needs review" may alert and includes a Review CTA.
7. Tapping the notification opens Capture Review with Confidence States, rationale, and Quick Edit for intent, entities, reminders, and collections.

## Notes

- The app uses bearer-token auth against the Supabase Edge Function.
- Android share intake uses `ShareIntakeActivity` and `WorkManager`, so shared items are accepted silently and uploaded with the persisted Supabase session. It requires a native/dev build, not Expo Go.
- iOS is intentionally deferred until Android proves the dogfood loop, but should keep the same silent-share product behavior: accept the share extension payload, complete the host app request, and use notification or Review Inbox follow-up to open Capture Review.
