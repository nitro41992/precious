# ADR 0014: Analyzer-Owned Review Insight Copy

## Status

Superseded by ADR 0015

## Context

Review Insight previously explained why Capture Analysis chose a Save Intent, Collection
outcome, and Reminder idea. The backend previously repaired missing or rejected
rationale by synthesizing friendly copy from extracted summaries, titles, and
field values. That made the UI resilient, but it also let clipped or generic
analysis text look like intentional product language.

## Decision

The analyzer owned Review Insight copy within the structured `review_rationale`
contract. Prompt instructions and JSON Schema field descriptions define the
copy bounds.

The backend validated Review Insight as untrusted model output. It could
reject missing, source-only, debug-like, generic, too-long, or malformed copy,
but it must not compose explanatory rationale from summaries, titles, intents,
Collection names, or Reminder fields. Invalid Review Insight degrades to
neutral review copy and adds an `analysis` review target when the user has not
already confirmed review. The normalized analysis also records the invalid
field and validation reason so fallback cases can be diagnosed without showing
the rejected copy to users.

## Consequences

- User-facing explanation comes from one authored source: Capture Analysis.
- Backend validation remains a guardrail, not a second copywriter.
- Bad insight copy asks for review instead of creating polished but misleading
  rationale.
- Neutral fallback copy is review scaffolding, not authored AI insight, so the
  UI should not present those neutral rows under an `AI insight` label.
- Existing persisted Review Insight is tolerated as legacy analysis data, but new primary analyzer output no longer requests `review_rationale`.
