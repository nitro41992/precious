# Use Existing-Only Multi-Collection Assignment

Date: 2026-05-29

## Status

Accepted

## Context

Capture Review's inline Collection picker combined selection, AI suggestions, Collection creation, and Collection management in one crowded surface. This made it unclear whether the user was assigning a Capture, accepting an AI guess, or managing the Collection itself.

AI-generated Collection names also made organization feel unbounded. Collections should be a finite user-owned set, while Capture Review should stay focused on editing the saved memory.

## Decision

Captures may belong to zero or more Collections. Capture Review opens a focused full-screen selector that lists existing active Collections, supports search, includes `No collection`, and saves the selected set.

Capture Analysis may only match a Capture to existing active Collections retrieved for that user. High-confidence existing matches may be applied quietly because they are finite and reversible. AI must not create, name, or surface new Collections, and low-confidence Collection matches should not become Capture Review work.

Collection creation, renaming, archiving, and restore remain in the top-level Collections destination.

## Consequences

- The `collection_capture_links` table remains valid because it already supports multiple active Collection links per Capture.
- Linking a Capture to one Collection must not unlink other active Collection links.
- Capture Review must not show `Use suggestion`, inline `New collection`, or per-row `Manage` controls.
- Search may use linked Collections as retrieval detail, but hidden or legacy Collection suggestions should not appear as review reasons.
- New Collections are always explicit user-created data.
