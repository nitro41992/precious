# Consumer UI Revamp Acceptance Criteria

## Purpose

This artifact records the agreed scope for the current Precious consumer UI revamp. Use it with `docs/precious-style-guide.md`, `docs/requirements/CONTEXT.md`, and `docs/requirements/PRODUCT.md` before implementing or reviewing UI work.

Related ADR: `docs/adr/0001-recent-captures-and-full-screen-search.md`.

## Product Shape

- The app should feel like a polished consumer memory surface, not a dogfooding, audit, or extraction-review tool.
- The default screen is `Recent Captures`: active Captures only, ordered by most recently captured.
- Search is a primary product function and opens as its own full-screen Retrieval Lens.
- Settings/account actions stay small and contextual.
- Collections, Map, Agenda, Library, Upcoming, and Archived are not top-level destinations in this pass.
- Map and Agenda are deferred. Agenda depends on functioning Confirmed Reminders.
- This pass focuses on UI and workflow. Do not add a broad first-class reminder backend unless the scope is explicitly reopened.

## Home

Home must:

- Show a large affordance such as `Search anything you saved` that opens full-screen Search.
- Show active Captures grouped by recency, such as `Today`, `Yesterday`, `This week`, and `Earlier`.
- Show each row as rich consumer content: title, source plus date/time, summary when available, `Saved as [intent]` when available, meaningful status when needed, and optional note preview.
- Hide audit-like extraction details from rows, including model/provider names, analysis mode, confidence percentages, generic `Analyzed` labels, and debug state.
- Keep extraction details persisted and searchable.
- Provide designed loading, empty, error, long-content, processing, failed, and archived/filter states.

Home must not:

- Show a permanent paste box as the main module.
- Use `Upcoming` as the default home.
- Surface Collections, Map, Agenda, or reminder modules as primary home sections.

## Search

Search must:

- Open as a full-screen, focused surface with a minimal search input.
- Use rich result rows consistent with Home.
- Search across title, summary, note, source, source URL, Save Intent, entities, collections, reminder suggestions, timestamps, and other persisted extraction details.
- Use empty and loading states that feel intentionally designed.
- Avoid chatbot framing unless a future product decision explicitly introduces it.

## Capture Review

Capture Review must:

- Feel like editing a saved memory, not inspecting an analysis report.
- Lead with an editable sentence, such as `Saved as [try this place] in [Japan trip].`
- Omit the collection phrase when no Collection is linked or suggested. A Capture may intentionally have no Collection.
- Show `Add to collection` as a secondary action when relevant.
- Show prior AI Collection suggestions as `Use suggestion` when useful, without reattaching automatically after user removal.
- Offer snackbar undo for immediate collection removal when feasible.
- Use `Reminder idea: [before Saturday]` for AI reminder suggestions until Confirmed Reminders and notification delivery are implemented.
- Include an `Add reminder` flow only when the selected reminder can at least persist as a capture-local or otherwise durable value. Do not imply notification delivery until it exists.
- Keep raw source, destructive archive actions, and detailed rationale visually secondary.

## Trust Rules

- AI output is a suggestion.
- User-approved output becomes first-class product data.
- Existing Collection auto-attachment may be quietly applied when high-confidence because it is reversible.
- New Collections require explicit user acceptance.
- All reminders require explicit user action.
- Leaving a Capture without a Collection is valid and should not appear as an unresolved task.

## Motion And State

- Use restrained native-feeling transitions for opening Search, Capture Review, and focused edit views.
- Use press feedback on rows, buttons, and chips.
- Use inline loading placeholders or skeleton rows instead of debug spinners where possible.
- Preserve drafts during loading, app backgrounding, and navigation.
- Use snackbars for reversible actions such as collection removal or archive when feasible.
- Avoid decorative motion, heavy gesture systems, or animation that delays capture or retrieval.

## Out Of Scope For This Pass

- Map.
- Agenda.
- Full reminder notification delivery.
- Top-level Collection browsing.
- A general Library destination.
- Chatbot search.
- Broad backend restructuring beyond what is necessary to support the agreed UI.
