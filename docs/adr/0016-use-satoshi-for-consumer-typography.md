# Use Satoshi for Consumer Typography

Date: 2026-06-05

## Status

Accepted, amended by `0019-use-clash-display-for-display-typography.md`

## Context

The consumer UI previously used native system fonts to keep the app platform-neutral and low risk. During the Recents polish pass, the product direction shifted toward a less common but still popular free typeface that can make the dark Material 3 Expressive shell feel more deliberate without adding decorative chrome.

Inter was rejected because it is too common and reads like a generic product default. Google Sans Flex was considered because it aligns closely with Android and Material 3 Expressive, but it felt too close to platform branding for Precious' own voice.

## Decision

Precious Captures will use Satoshi, bundled from Fontshare, as the Android consumer UI typeface. The app includes Regular, Medium, Bold, and Black cuts in the Android font assets and exposes them through shared typography tokens in `app/ui/theme.ts`.

Native system fonts remain the fallback when Satoshi is unavailable.

## Consequences

- The UI gains a more distinctive modern product voice while staying flat, quiet, and readable.
- New text styles should use the shared Satoshi typography tokens instead of introducing another family.
- Future iOS support should either bundle the same Satoshi cuts or intentionally reopen the typography decision.
- Font licensing should continue to be checked from the official Fontshare source before changing, modifying, or redistributing font files.
