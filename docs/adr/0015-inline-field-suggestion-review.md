# ADR 0015: Trust AI Field Selections in Capture Review

## Status

Accepted

## Context

Capture Analysis can select Purpose, Collection, and Later values. The previous
Capture Review UI split those values across a main field rail and review
actions when confidence was low. That made review feel like a second workflow
even though the user was already editing the Capture.

## Decision

Capture Review will show Purpose, Collection, and Later as one flat editable
sentence below the title/source area, using language like `Saved as [Purpose]
in [Collection] for [Later]`. Analyzer-selected values appear as normal current
values, not suggestions waiting for approval.

Purpose, Collection, and Later field uncertainty does not create user-visible
review work, `Looks good`, clear-suggestion actions, or `Needs a quick look`.
The user corrects AI selections through ordinary field editing.

AI rationale remains stored on selected field outputs for future quality work
and appears inside the relevant bottom sheet while the current field still
matches the AI-selected value. The separate Review Insight checklist sheet is
removed from Capture Review.

## Consequences

- The main Capture Review page stays minimal and correction-oriented.
- `Add intent`, `Add collection`, and `Add reminder` mean absence.
- Collection editing uses a bottom sheet so Capture Review remains the active
  context while the user adjusts field values.
- Confidence labels and field rationales remain available for internal quality
  work but do not route field-level review.
