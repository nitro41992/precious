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

Field rationale is structured analyzer output, not client-side copy
composition. Capture Analysis returns a `field_rationales` object for Purpose,
Collections, and Later. Each user-facing rationale is capped at 12 words, each
structured field header is capped at 36 characters, and the copy uses
field-specific wording: `I chose [Purpose] because ...`, `I picked [Collection]
because ...`, or `I suggested [Later] because ...`.

The UI may decide whether a rationale is still fresh by comparing structured
field values, such as intent key, Collection ids, and Reminder interval fields,
but it must not parse, classify, or rewrite rationale prose to make that
decision. Editing a field hides stale rationale as soon as the draft no longer
matches the structured AI selection.

## Consequences

- The main Capture Review page stays minimal and correction-oriented.
- `Add intent`, `Add collection`, and `Add reminder` mean absence.
- Collection editing uses a bottom sheet so Capture Review remains the active
  context while the user adjusts field values.
- Confidence labels and field rationales remain available for internal quality
  work but do not route field-level review.
- Analyzer-owned field rationale copy keeps user-facing explanation bounded
  without adding regex or substring interpretation to the app.
