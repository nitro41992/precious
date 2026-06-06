# Use a Light Consumer App Shell

Date: 2026-06-05

## Status

Accepted

## Context

ADR 0003 moved the consumer app shell to a fully dark Material-inspired theme. The product direction has been reopened and now prefers returning to a light native memory surface. This is a durable visual decision because it changes default screen backgrounds, component surfaces, native status and navigation bars, sheet treatment, row media contrast, and future UI token choices.

## Decision

Precious Captures will use a warm light shell as the default consumer theme. The base background is an off-white paper tone, grouped surfaces use nearby warm neutrals, and semantic colors remain reserved for meaning: green for primary and ready states, blue for processing, amber for review, and red for destructive or failed states.

Recent Captures, Collections, the Capture Review edit/detail plane, and the hero media matte around persisted imagery share the same paper base so moving between retrieval, organization, and edit surfaces does not feel like entering a different visual mode. Tonal containers remain available for controls, media fallbacks, thumbnails, sheets, and pressed states.

The current warm light palette uses paper `#FFF7E6`, lime `#C5D86D` for primary accent emphasis, and carrot `#F18F01` for secondary and Collection emphasis. Filled lime and carrot controls use ink content for contrast, while accent icons and labels keep the same bright brand values rather than darker derived tints. Header and bottom-navigation fades should also stay within the paper and warm surface-container tokens.

The light shell is parameterized through `app/ui/theme.ts` so future palette swaps can replace token values rather than editing screen-level literals. Media inspection controls may continue to use explicit dark translucent overlay tokens for contrast over imagery, but those controls should not inherit ordinary text tokens.

Existing capture imagery, thumbnails, screenshots, and shared image assets remain product content and should appear in rows and Capture Review headers when already persisted. The UI should not add decorative imagery, gradients, or provider-specific extraction work only to make the light shell feel richer.

## Consequences

- Future app-shell UI work should start from the light token set in `app/ui/theme.ts` and `docs/precious-style-guide.md`.
- Native sheets, confirmations, toasts, search surfaces, and Android window chrome should use warm light tonal containers.
- Dark-mode or high-contrast variants are not in scope unless explicitly reopened.
- ADR 0003 remains as historical context for the prior dark-shell decision, but no longer defines the current default.
