# Use Email-First Account Creation

Date: 2026-05-30

## Status

Accepted

## Context

The first Android hosted build exposed a combined sign-in and account-creation form. When a user entered only an email and tapped `Create account`, the app asked for a password on the sign-in surface, which made the path feel like a failed sign-in rather than onboarding.

Supabase Auth already has email auth enabled, signups enabled, and email auto-confirm disabled for the hosted project. That supports a confirmation-link flow without introducing a separate backend. Google sign-in can reduce reliance on repeated auth emails, but native Google SDK setup has historically been high-friction for this app.

## Decision

Precious Captures will keep password sign-in for existing users and move account creation to a separate email-only screen. Because email-only onboarding does not collect a password, the sign-in screen will also offer an emailed sign-in link for returning accounts. When the hosted Supabase Google provider is configured, the sign-in screen may also offer `Continue with Google` through browser-based Supabase OAuth and the same `preciouscaptures://auth/callback` session persistence path.

`Create account` sends a Supabase passwordless email link with `create_user: true` and `preciouscaptures://auth/callback` as the redirect target. After sending, the app shows a `Check your email` state. Opening the link on the phone finishes sign-in by persisting the returned Supabase session.

`Email sign-in link` sends a Supabase passwordless email link with `create_user: false` to avoid silently creating a new account from the sign-in screen. It reuses the same redirect target and session persistence path.

`Continue with Google` opens the hosted Supabase `/auth/v1/authorize?provider=google` flow with the app callback as `redirect_to`. It deliberately avoids native Google SDK integration and Android SHA fingerprint-specific client setup.

## Consequences

- New users do not create or remember a password during onboarding.
- Users who created an account without a password can return through email-link sign-in.
- Google sign-in requires a Google OAuth web client and Supabase provider configuration, but not native Google SDK wiring in the Android app.
- The Supabase Auth URL allowlist must include `preciouscaptures://auth/callback`.
- The Supabase magic-link email template should keep a confirmation link and may also include an OTP later if the product adds code entry.
- Custom SMTP remains the production path for users outside private testing because built-in Supabase email has delivery and rate-limit constraints.
