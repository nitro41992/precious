# Use a Dark Material App Shell for the Consumer UI

Date: 2026-05-29

## Status

Accepted

## Context

The earlier consumer revamp guidance used a warm paper shell inspired by grouped native list surfaces. During the Material 3 Expressive app-shell revamp, the product direction changed to prefer a fully dark theme. This is a durable visual decision because it changes default screen backgrounds, component surfaces, sheet treatment, row media contrast, and future UI token choices.

## Decision

Precious Captures will use a calm dark Material 3-inspired shell as the default consumer theme. The palette keeps the product quiet and memory-focused through charcoal backgrounds, tonal surface containers, muted green primary actions, amber review states, blue processing states, and soft destructive tones.

Existing capture imagery, thumbnails, screenshots, and shared image assets are product content and should appear in rows and Capture Review headers when already persisted. The UI should not add decorative imagery, gradients, or provider-specific extraction work only to make the dark shell feel richer.

## Consequences

- Future app-shell UI work should start from the dark token set in `app/App.tsx` and `docs/precious-style-guide.md`.
- Native sheets, confirmations, snackbars, and search surfaces should use dark tonal containers instead of platform `Alert` popups or warm paper panels.
- Light-mode or warm-paper variants are not in scope unless explicitly reopened.
