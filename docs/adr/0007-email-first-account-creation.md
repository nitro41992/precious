# Use Email-First Account Creation

Date: 2026-05-30

## Status

Accepted

## Context

The first Android hosted build exposed a combined sign-in and account-creation form. When a user entered only an email and tapped `Create account`, the app asked for a password on the sign-in surface, which made the path feel like a failed sign-in rather than onboarding.

Supabase Auth already has email auth enabled, signups enabled, email auto-confirm disabled, and Google provider support configured for the hosted project. That supports a passwordless email-link flow and Google OAuth without introducing a separate backend. Native Google SDK setup has historically been high-friction for this app, so browser-based Supabase OAuth is preferred.

Supabase Auth automatically links OAuth identities with the same verified email address to an existing user. That lets a user start with an email magic link and later sign in with Google using the same email without creating a second account.

## Decision

Precious Captures will remove password sign-in from the primary consumer auth screen. The entry screen will offer two methods: `Continue with Google` and one email field that sends a secure email link for sign-in or account creation.

`Send sign-in link` sends a Supabase passwordless email link with `create_user: true` and `preciouscaptures://auth/callback` as the redirect target. Existing users can use the link to sign in, and new users can use it to finish account setup. After sending, the app shows a `Check your email` state. Opening the link on the phone finishes sign-in by persisting the returned Supabase session.

`Continue with Google` opens the hosted Supabase `/auth/v1/authorize?provider=google` flow with the app callback as `redirect_to`. It deliberately avoids native Google SDK integration and Android SHA fingerprint-specific client setup.

## Consequences

- New users do not create or remember a password during onboarding.
- Existing users return through Google or email-link sign-in.
- Users who use the same verified email across email link and Google should resolve to one linked Supabase user.
- Google sign-in requires a Google OAuth web client and Supabase provider configuration, but not native Google SDK wiring in the Android app.
- The Supabase Auth URL allowlist must include `preciouscaptures://auth/callback`.
- The Supabase magic-link email template should keep a confirmation link and may also include an OTP later if the product adds code entry.
- Custom SMTP remains the production path for users outside private testing because built-in Supabase email has delivery and rate-limit constraints.
