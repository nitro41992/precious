# Analyzer Context PRD

## Summary

Analyzer Context is a bounded set of relevant prior signals made available to Capture Analysis so Sharebook can better infer why a user saved a Capture and what should happen next. It should help with Default Intent, Reminder timing, Collection reuse, and recurring preference detection without passing the user's full history into every model call.

This supports Sharebook's core wedge: preserving the user's reason for saving something so it can be found, understood, and acted on later.

## Problem

Capture Analysis currently understands a Capture from its immediate payload: URL, text, image, source metadata, entities, and other Capture Context. That is enough for many cases, but feedback from dogfooding shows several misses require prior user signals:

- Reminder timing depends on past reminders, trips, routines, or accepted behavior.
- Collection matching can be too broad or miss relevant existing Collections.
- The model may speculate about actions, such as "build this," without evidence.
- Past/future event reasoning needs current date/time and timezone.
- Repeated user behavior should influence interpretation, but raw history should not be dumped into prompts.

The challenge is to add memory without making analysis noisy, expensive, privacy-surprising, or brittle as history grows.

## Goals

- Improve Capture Analysis using bounded, relevant prior signals.
- Help the analyzer choose better Default Intent when current Capture evidence is ambiguous.
- Improve Reminder suggestions, especially timing and past-date suppression.
- Reuse existing Collections instead of generating new Collection names.
- Treat prior signals as weak evidence, not as facts.
- Keep Analyzer Context internally bounded and explainable.
- Preserve existing field-level outputs where possible; schema changes should be versioned when product workflow decisions remove unused fields.

## Non-Goals

- Do not pass full user history into prompts.
- Do not build a full long-term memory system in v1.
- Do not expose Analyzer Context as a user-facing object.
- Do not require calendar, location, contacts, or background permissions.
- Do not make Capture save depend on successful analysis.
- Do not replace One-Tap Correction or Context Notes.

## Users

Primary 0A user:

- A dogfooding user saving links, screenshots, products, events, posts, and notes from real daily life.

Future users:

- People who save things with a latent intent: places to visit, products to buy, trips or events to plan, videos to watch, articles to read, recipes to cook, things to make or do, and topics to learn.

## Product Requirements

### R1. Build A Bounded Context Pack

For each Capture Analysis run, Sharebook should assemble an Analyzer Context containing only a small, bounded set of relevant signals.

Initial v1 fields:

- current date/time
- timezone
- recent capture summaries
- corrected Save Intents
- prior Reminder suggestions and statuses
- existing Collections
- recent Collection attachments

Future fields:

- accepted/rejected Reminders
- manually created Collections
- repeated behavior summaries
- semantically similar Captures
- relevant search/click behavior

### R2. Use Context As Weak Evidence

The prompt must explicitly instruct the model that Analyzer Context is weak preference evidence.

The model may use it to:

- notice recurring timing preferences
- prefer existing Collections
- infer likely user workflows when repeated evidence exists

The model must not:

- invent facts about the current Capture
- assume a routine from one example
- force a Capture into an unrelated Collection
- suggest actions unsupported by Capture evidence or repeated user behavior

### R3. Improve Reminder Reasoning

Analyzer Context should help the model:

- suppress reminders for past events
- choose before/during timing for events, trips, sales, or deadlines
- avoid noisy reminders without a concrete future trigger
- use prior accepted reminders as stronger signals than raw model suggestions

### R4. Improve Existing Collection Matching

Analyzer Context should help the model:

- prefer existing Collections when relevant
- avoid broad intent-label matching such as "Watch later" or "Buy later"
- return no Collection match when no retrieved active Collection fits strongly
- never create or name a new Collection

### R5. Keep Capture Analysis Durable

Analyzer Context must not change the capture lifecycle:

- Capture is saved first.
- Capture Receipt is immediate.
- Capture Analysis runs after durable save.
- Analysis failure must not delete or invalidate the Capture.

### R6. Preserve Evaluation Loop

Analyzer Context should be measurable through the existing eval workflow.

The feedback report should surface themes such as:

- missing user-history context
- duplicate or too-broad Collections
- reminder timing problems
- unsupported speculation
- wrong Save Intent

## Success Metrics

0A quality metrics:

- Default Intent acceptance rate improves.
- Wrong-intent feedback decreases.
- Bad-reminder feedback decreases.
- Collection duplicate feedback decreases.
- "Looks right" feedback increases on real dogfood captures.

Dogfood usefulness metrics:

- User can explain why Analyzer Context improved a specific Capture.
- Reminder suggestions feel useful rather than noisy.
- Existing Collections are reused instead of duplicated.
- Feedback report produces actionable next steps.

Safety/operational metrics:

- Context pack remains bounded.
- Prompt size does not grow with total user history.
- Analysis latency remains acceptable.
- Analysis cost remains trackable by model route and prompt version.

## UX Requirements

Analyzer Context should not be shown as a separate product surface in v1.

User-facing effects should appear indirectly:

- better Default Intent
- better Reminder Rationale
- fewer noisy reminders
- better existing Collection assignment
- better search phrases

The user should still be able to correct intent or add a Context Note when the analyzer is wrong.

## Technical Requirements

- Add `AnalyzerUserContext` as an internal analyzer input.
- Extend prompt construction to include Analyzer Context.
- Keep output schema changes versioned and compatible with legacy analysis payloads.
- Store analysis metadata with prompt version and schema version.
- Keep current model-router abstraction.
- Keep context bounded by count/token budget.
- Future retrieval should move from fixed recency to relevance-ranked selection.

## Open Questions

- What should the hard context budget be for v1 and later?
- Which signals should rank highest: corrected intents, accepted reminders, existing Collections, similar Captures, or search behavior?
- When should Sharebook create compact preference summaries?
- How should users inspect or reset inferred preferences later?
- Should Collection matching eventually store `matched_collection_id` explicitly?

## Acceptance Criteria

- A new Capture Analysis run receives current date/time, timezone, recent Captures, prior Reminders, and existing Collections.
- The model prompt states that Analyzer Context is weak evidence.
- Collection matching avoids broad intent-label names.
- Existing exact-normalized Collection names are reused instead of duplicated, and no new Collection names are generated.
- Feedback report groups product-signal comments into actionable themes.
- No database migration is required for v1.
- Capture save continues to work even when analysis fails.

## Source Docs Used

- `CONTEXT.md`
- `docs/mvp-spec.md`
- `docs/phase-0a-implementation.md`
- `docs/adr/0006-existing-only-multi-collection-assignment.md`
