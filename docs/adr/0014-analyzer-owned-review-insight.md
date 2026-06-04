# ADR 0014: Analyzer-Owned Review Insight Copy

## Status

Accepted

## Context

Review Insight explains why Capture Analysis chose a Save Intent, Collection
outcome, and Reminder idea. The backend previously repaired missing or rejected
rationale by synthesizing friendly copy from extracted summaries, titles, and
field values. That made the UI resilient, but it also let clipped or generic
analysis text look like intentional product language.

## Decision

The analyzer owns Review Insight copy within the structured `review_rationale`
contract. Prompt instructions and JSON Schema field descriptions define the
copy bounds.

The backend still validates Review Insight as untrusted model output. It may
reject missing, source-only, debug-like, generic, too-long, or malformed copy,
but it must not compose explanatory rationale from summaries, titles, intents,
Collection names, or Reminder fields. Invalid Review Insight degrades to
neutral review copy and adds an `analysis` review target when the user has not
already confirmed review.

## Consequences

- User-facing explanation comes from one authored source: Capture Analysis.
- Backend validation remains a guardrail, not a second copywriter.
- Bad insight copy asks for review instead of creating polished but misleading
  rationale.
- Existing persisted Review Insight is not backfilled by this decision.
