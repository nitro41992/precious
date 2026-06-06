# ADR 0020: Use Reanimated 4 for Consumer Motion Polish

Date: 2026-06-06

## Status

Accepted

## Context

Precious Captures already treated smooth transitions, loading states, press
feedback, and toast undo as part of the consumer experience. The existing React
Native implementation used core `Animated` for screen fades, sheets, skeletons,
and toasts, but several consumer flows still felt abrupt: Collections collage
previews flashed when returning to the top-level Collections view, Capture rows
could switch from analyzing to ready without enough continuity, and delete or
collection-removal updates felt like hard list mutations.

React Native core animation remains useful for simple existing transitions, but
the app now needs richer enter/exit, layout, and gesture-ready motion while
preserving the calm warm-light memory-surface direction.

## Decision

Precious Captures will adopt Reanimated 4 with `react-native-worklets` as the
consumer app's primary motion layer for list layout changes, row/card
enter/exit, toast motion, and focused high-polish transitions. Existing stable
core `Animated` surfaces may remain when they already behave correctly.

The first motion pass uses a custom measured overlay for the Recents
thumbnail-to-Capture Review handoff instead of Reanimated's experimental
shared-element transitions. The current state-based navigation architecture
remains in place; adopting React Navigation or native-stack shared transitions
is a separate product and architecture decision.

The Recents handoff should replay backward to the measured source thumbnail.
Collection capture returns should restore Collection Detail cleanly without a
reverse hero handoff until that virtualized list has a durable mounted target for
the destination row.

Virtualized collection surfaces should not run per-row Reanimated exits during
screen-level unmounts. Collection cards may use snappy item enter, exit, and
layout motion while the top-level Collections surface is active. Collection
Detail capture rows may use item enter, exit, and layout motion for in-place
list changes, but Collection Detail dismissal should suppress those item exits
and be treated as one screen transition rather than many row exits.

Collections collage flashing is treated as a root-cause rendering problem, not
only an animation problem: cached Collection cards should stay visible during
refresh, persisted preview imagery should not be remounted unnecessarily, and
collage images should not replay a crossfade every time the Collections screen
remounts.

## Consequences

- Android builds must validate the Reanimated 4 and Worklets native dependency
  setup under the existing New Architecture configuration.
- Motion work should use shared presets so timing, spring feel, and exit
  behavior stay consistent with the product's restrained native tone.
- Experimental shared-element transitions remain out of scope until they are
  production-ready for the app's navigation shape.
- UI polish work should continue to avoid decorative motion that delays capture,
  retrieval, or navigation.
