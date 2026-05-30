# Use Email-First Account Creation

Date: 2026-05-30

## Status

Accepted

## Context

The first Android hosted build exposed a combined sign-in and account-creation form. When a user entered only an email and tapped `Create account`, the app asked for a password on the sign-in surface, which made the path feel like a failed sign-in rather than onboarding.

Supabase Auth already has email auth enabled, signups enabled, and email auto-confirm disabled for the hosted project. That supports a confirmation-link flow without introducing a separate backend.

## Decision

Precious Captures will keep password sign-in for existing users and move account creation to a separate email-only screen.

`Create account` sends a Supabase passwordless email link with `create_user: true` and `preciouscaptures://auth/callback` as the redirect target. After sending, the app shows a `Check your email` state. Opening the link on the phone finishes sign-in by persisting the returned Supabase session.

## Consequences

- New users do not create or remember a password during onboarding.
- The Supabase Auth URL allowlist must include `preciouscaptures://auth/callback`.
- The Supabase magic-link email template should keep a confirmation link and may also include an OTP later if the product adds code entry.
- Custom SMTP remains the production path for users outside private testing because built-in Supabase email has delivery and rate-limit constraints.
