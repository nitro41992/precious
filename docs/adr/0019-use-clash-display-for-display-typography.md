# Use Clash Display for Display Typography

Date: 2026-06-05

## Status

Accepted

## Context

The consumer UI already uses bundled Satoshi for a calmer, more distinctive product voice than native system fonts. After seeing the light consumer shell and card surfaces together, the product direction shifted toward a two-typeface system: a stronger display face for headings and card titles, with Satoshi retained for compact UI text.

Using Clash Display everywhere would make dense mobile surfaces feel louder and less scannable. Keeping Satoshi everywhere would miss the stronger editorial hierarchy now desired for headers and card titles.

## Decision

Precious Captures will use bundled Clash Display for page headers, section headers, sheet headers, Capture Review title headers, capture row titles, Collection titles, and card titles.

Satoshi remains the default typeface for body copy, metadata, inputs, buttons, navigation, labels, and non-title row content. Native system fonts remain the fallback when a bundled family is unavailable.

The Android app bundles Clash Display Regular, Medium, Semibold, and Bold cuts from Fontshare and exposes them through shared typography tokens in `app/ui/theme.ts`.

## Consequences

- Header and card title surfaces gain a more deliberate display voice without adding decorative chrome.
- Dense retrieval row metadata, form controls, and action labels keep Satoshi's calmer UI readability.
- New title-like styles should choose Clash Display only when the text is functioning as a header or card title; default text should continue to inherit Satoshi.
- Font licensing should continue to be checked from the official Fontshare source before changing, modifying, or redistributing font files.
