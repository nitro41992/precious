# ADR 0015: Use Bold Flat Dark Visual Language

Date: 2026-06-04

## Status

Accepted

## Context

ADR 0003 moved the consumer UI from warm paper to a calm dark Material 3-inspired shell. The current reference direction pushes the visual system further: oversized display type, matte dark backgrounds, flat saturated color blocks, modern line icons, minimal shadows, and imagery that comes from saved content rather than decoration.

This is a durable visual decision because it affects typography, color tokens, iconography, row hierarchy, sheet treatment, and future app-shell work. It should not reopen the agreed product shape.

## Decision

Precious Captures will evolve from calm dark Material 3 styling to a bold flat dark, content-first visual language.

- Use Space Grotesk for expressive display titles and rare high-emphasis labels.
- Use Inter for body copy, capture rows, metadata, controls, inputs, sheets, and dense review copy.
- Use matte dark backgrounds, flat surfaces, sparse dividers, and minimal functional shadows.
- Use saturated semantic blocks for state, confidence, source, category, or action. Pair color with text or a Lucide line icon.
- Use asymmetric archive-shaped row, media, decision, and mark surfaces so Precious has a recognizable product shape rather than a stock squircle system.
- Use source monograms and collection initials when real thumbnails or favicons are unavailable, reserving generic line icons for actions and secondary state.
- Consolidate Capture Review meaning into a decision dock that contains Purpose, Collection, Later, and rationale access. Avoid separate metadata cards and duplicated insight cards when one decision surface is clearer.
- Let `Why` own review confirmation entry from the decision dock; avoid default sticky footers when no completion action is needed.
- Treat the Home review queue as a filter over capture rows, not navigation to the first review item.
- Show bottom navigation selection through the selected icon glyph itself, without selected background pills.
- Treat reminder creation as preset-first. Common resurfacing intervals should be one tap, with manual date/time pickers available only when precision is needed.
- Treat saved thumbnails, screenshots, uploaded images, and source previews as the primary imagery layer. Do not add decorative gradients, abstract illustration, glass effects, or dashboard clutter.
- Preserve the existing product decisions: `Recent Captures` is the default home, Search is full-screen, Collections is top-level, Settings is contextual, and Map and Agenda remain deferred.

## Consequences

- ADR 0003 remains the record of the move to a dark shell, but this decision supersedes its calm Material 3 visual treatment for new consumer UI work.
- Future UI documentation and implementation should tune typography, palette, icons, and layout toward the bold flat dark direction while preserving native mobile ergonomics, accessibility, and 44-48px tap targets.
- This decision is visual only. It does not add new retrieval lenses, a reminder backend, Map, Agenda, chatbot search, or dashboard modules.
