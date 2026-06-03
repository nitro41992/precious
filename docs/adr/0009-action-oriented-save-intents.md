# Use Optional Action-Oriented Save Intents

Date: 2026-05-31

## Status

Accepted

## Context

The original Save Intent catalog included broad labels such as `research`, `reference`, `remember`, `follow_up`, and `share`. As Collections became first-class, those labels started to overlap with topic and project organization. They also made intent feel like a second taxonomy instead of a lightweight reason-for-saving signal.

Some broad intents were not reliably inferable from capture evidence. For example, the app usually cannot know that a user saved an item to send to someone unless the user adds explicit context. Similarly, static reference or memory value is often better handled by Search, entities, notes, and Collections than by a visible intent chip.

## Decision

Save Intent is now an optional action signal. Active Intent Categories are limited to `watch`, `read`, `visit`, `buy`, `cook`, `make`, `do`, `plan`, and `learn`.

When Capture Analysis cannot infer one of those concrete actions, it leaves intent blank and marks the Capture for review. Blank intent is valid after user review; it should not be replaced with a broad fallback such as `remember` or `reference`.

Ambiguous captures use stable precedence rules:

- `learn` wins over `read` for how-tos, tutorials, explainers, playbooks, concepts, methods, and skill-building material. `read` is for text where the main action is consuming the document.
- `do` wins over `visit` for scheduled activities, classes, concerts, workshops, performances, shows, workouts, routines, practices, and drills. `visit` is for a concrete place, business, venue, restaurant, shop, or destination.
- `plan` is for logistics, itineraries, bookings, schedules, checklists, renewals, trip or event planning, and admin follow-through.
- `buy` is for product, listing, store, deal, and purchase-option pages. Reviews, comparisons, and buying guides use `read` or `learn` unless one concrete purchase target dominates.
- `cook` is for recipes and food preparation. `make` creates an artifact, `do` performs an activity, and `learn` understands a method or concept.

Legacy broad intents may remain in stored data for compatibility, but they are inactive and should not appear as selectable user-facing chips.

## Consequences

- Collections own subject, project, trip, purchase-decision, and life-context grouping.
- Save Intent powers action cues, quick correction, search signals, and future action surfaces only when the action is clear.
- Physical therapy, workouts, stretches, routines, and practices use `do` rather than `make`.
- Recipes and food preparation use `cook`; created outputs such as DIY, crafts, builds, and code patterns use `make`.
- Sending or sharing remains a possible future action, but it is not an inferred Save Intent without an explicit recipient/context workflow.
