# Use a Bottom App Bar and Promote Collections to Top-Level Navigation

Date: 2026-05-29

## Status

Accepted

## Context

ADR 0001 kept Collections out of top-level navigation so the consumer revamp could emphasize Recent Captures and full-screen Search. After the dark Material app-shell direction in ADR 0003, the navigation shape changed again: the app needs a thumb-reachable shell that keeps capture creation prominent without leaving Settings as the only top-right action.

## Decision

Precious Captures will use a Material 3-inspired bottom app bar for the authenticated top-level shell. The bar contains `Recent`, `Collections`, and `Settings`, with a separate trailing contextual floating `+` action. On Recent it opens New Capture; on Collections it opens New Collection. `Recent Captures` remains the default screen. Search moves to a compact top action on Recent Captures and still opens the full-screen Search Retrieval Lens.

Collections is now a durable top-level management destination. Settings remains contextual and opens a bottom sheet for account/session actions. The Settings sheet must not contain Collections because Collections now has its own top-level destination.

## Consequences

- This supersedes the part of ADR 0001 that rejected top-level Collections for the current revamp.
- Search remains the primary retrieval lens; Collections is for user-owned organization and management, not the default browse mode.
- The bottom app bar should appear only on top-level Recent and Collections screens.
- Search, Capture Review, collection detail, authentication, capture composer focus, and modal flows should avoid competing top-level navigation chrome.
- Map, Agenda, Upcoming, Library, and full reminder delivery remain deferred.
