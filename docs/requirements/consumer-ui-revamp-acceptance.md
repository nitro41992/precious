# Consumer UI Revamp Acceptance Criteria

## Purpose

This artifact records the agreed scope for the current Precious consumer UI revamp. Use it with `docs/precious-style-guide.md`, `docs/requirements/CONTEXT.md`, and `docs/requirements/PRODUCT.md` before implementing or reviewing UI work.

Related ADRs: `docs/adr/0001-recent-captures-and-full-screen-search.md`, `docs/adr/0005-bottom-app-bar-and-top-level-collections.md`, and `docs/adr/0006-existing-only-multi-collection-assignment.md`.

## Product Shape

- The app should feel like a polished consumer memory surface, not a dogfooding, audit, or extraction-review tool.
- The consumer shell uses a calm dark Material 3-inspired surface hierarchy by default, not the earlier warm paper shell.
- The default screen is `Recent Captures`: active Captures only, ordered by most recently captured.
- Search is a primary product function and opens as its own full-screen Retrieval Lens.
- The top-level app shell uses a bottom app bar with `Recent`, `Collections`, and `Settings`, plus a separate contextual floating `+` action.
- Search opens from a compact top action on `Recent Captures`, replacing the prior top-right Settings affordance.
- Settings/account actions stay small and contextual, opening a bottom sheet rather than a primary screen in this pass.
- Collections is a top-level management destination, while Map, Agenda, Library, Upcoming, and Archived are not top-level destinations in this pass.
- Collection management should exist as an independent screen outside Capture Review, without turning Collections into the default home mode.
- Map and Agenda are deferred. Agenda depends on functioning Confirmed Reminders.
- This pass focuses on UI and workflow. Do not add a broad first-class reminder backend unless the scope is explicitly reopened.

## Home

Home must:

- Show a compact, prominent top action that opens full-screen Search.
- Show active Captures grouped by recency, such as `Today`, `Yesterday`, `This week`, and `Earlier`.
- Show each row as rich consumer content: optional existing thumbnail or shared image preview, title, source plus date/time, summary when available, `Saved as [intent]` when available, meaningful status when needed, and optional note preview.
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
- Show existing capture thumbnails or source imagery in result rows when available, with the same fallback rhythm as Home.
- Search across title, summary, note, source, source URL, Save Intent, entities, collections, reminder suggestions, timestamps, and other persisted extraction details.
- Use empty and loading states that feel intentionally designed.
- Avoid chatbot framing unless a future product decision explicitly introduces it.

## New Capture

New Capture must:

- Open from the primary `+` action as a bottom sheet, not as an inline form in Recent Captures.
- Keep the paste input, close action, and save action visible and reachable when the keyboard is open on a small Android phone.
- Open with one upward sheet motion; keyboard focus must not make the sheet appear to pull down or jump against its entrance.
- Present exactly one capture mode at a time: `Link`, `Note`, or `Image`.
- Offer an explicit in-app image upload action that uses existing image capture processing and opens the platform photo picker directly from the Image control, without adding new extraction rules. Cancelling the picker returns to Recent Captures with the New Capture sheet closed.
- Route Link captures through public URL evidence and preflight. Route Note, Image, Screenshot, and mixed image captures through modality-specific note/visual evidence so weak URL evidence does not decide whether non-link analysis is useful.

## Capture Review

Capture Review must:

- Feel like editing a saved memory, not inspecting an analysis report.
- Lead with existing capture imagery or source media when available; tapping it opens the source URL when one is available.
- Make the editable title the primary text under the media/source header.
- Show Save Intent, Collections, and Reminder as quiet editable rows below the title rather than stacking prominent cards or pill-heavy controls.
- Show `Add collections` when no Collection is linked. A Capture may intentionally have no Collection.
- Tapping Collections opens a focused full-screen selector for existing active Collections, including `No collection` as a valid clearing state.
- Do not show AI Collection suggestions, `Use suggestion`, inline Collection creation, or per-row `Manage` actions inside Capture Review.
- Offer snackbar undo for immediate collection removal when feasible.
- Use `Reminder idea: [before Saturday]` for AI reminder suggestions until Confirmed Reminders and notification delivery are implemented.
- Show an `Open in Maps` action when Capture Analysis has a maps-searchable Visit Target and a native map provider passes an open check. This action opens the available Google Maps or Apple Maps search from the persisted query; Android must not show Apple Maps through a browser fallback, and the action must not imply a verified address, coordinates, place ID, or a first-class Map destination.
- Include an `Add reminder` flow only when the selected reminder can at least persist as a capture-local or otherwise durable value. Do not imply notification delivery until it exists.
- Include one consolidated `Review insight` rationale surface for Save Intent, Collections, and Reminder idea decisions, including cases where no Collection or no Reminder idea was applied. Its visible cue should point to the exact review decision rather than repeat a content summary.
- Keep raw source, destructive archive actions, and detailed rationale visually secondary.
- Use modality-specific evidence in review copy. Image and note captures without a source URL must not show Link evidence fallback copy or a `Link evidence` module; they should show `Needs review` / `Couldn't tell` language when saved content needs more context.

## Collection Management

Collection management must:

- Be available from the bottom app bar as the top-level `Collections` destination, while remaining secondary to Recent Captures and Search.
- Provide an independent `Collections` screen for creating, renaming, and managing Collections.
- Open new Collection creation from the Collections floating `+` as a bottom sheet, not as an inline card.
- Show existing Collections in a consumer-facing list with useful metadata such as capture count or recent use when available.
- Let Capture Review navigate to collection selection and return without losing edits.
- Preserve `No collection` as a valid state for any Capture.
- Allow a Capture to belong to multiple Collections.
- Avoid making Collection browsing the default retrieval surface; Search remains the primary retrieval lens.
- Use snackbar undo or confirmation for reversible/destructive collection changes where feasible.

## Trust Rules

- AI output is a suggestion, except high-confidence existing Collection matches may be applied quietly because they are finite and reversible.
- User-approved output becomes first-class product data.
- Existing Collection auto-attachment may be quietly applied when high-confidence because it uses only active user-owned Collections.
- New Collections require explicit user creation from the Collections destination, never AI creation.
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
- A general Library destination.
- Chatbot search.
- Broad backend restructuring beyond what is necessary to support the agreed UI.
