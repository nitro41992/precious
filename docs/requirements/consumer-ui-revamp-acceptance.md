# Consumer UI Revamp Acceptance Criteria

## Purpose

This artifact records the agreed scope for the current Precious consumer UI revamp. Use it with `docs/precious-style-guide.md`, `docs/requirements/CONTEXT.md`, and `docs/requirements/PRODUCT.md` before implementing or reviewing UI work.

Related ADRs: `docs/adr/0001-recent-captures-and-full-screen-search.md`, `docs/adr/0005-bottom-app-bar-and-top-level-collections.md`, `docs/adr/0006-existing-only-multi-collection-assignment.md`, `docs/adr/0008-starter-collections-for-empty-accounts.md`, `docs/adr/0009-action-oriented-save-intents.md`, and `docs/adr/0016-use-satoshi-for-consumer-typography.md`.

## Product Shape

- The app should feel like a polished consumer memory surface, not a dogfooding, audit, or extraction-review tool.
- The consumer shell uses a calm dark Material 3 Expressive-inspired surface hierarchy by default, not the earlier warm paper shell.
- Material 3 Expressive emphasis should clarify review decisions through purposeful size, shape, tonal containment, motion, and semantic color while preserving familiar native controls and Precious' calm dark tone.
- The default Retrieval Lens is `Recent Captures`, titled `Recents` in the app: active Captures only, ordered by most recently captured.
- Search is a primary product function and opens as its own full-screen Retrieval Lens.
- The top-level app shell uses a bottom app bar with `Recent`, `Collections`, and `Settings`, plus a separate contextual floating `+` action.
- Search opens from a compact top action on `Recent Captures`, replacing the prior top-right Settings affordance.
- Settings/account actions stay small and contextual, opening a bottom sheet rather than a primary screen in this pass.
- Collections is a top-level management destination, while Map, Agenda, Library, Upcoming, and deleted-item browsing are not top-level destinations in this pass.
- Collection management should exist as an independent screen outside Capture Review, without turning Collections into the default home mode.
- Map and Agenda are deferred. Agenda depends on functioning Confirmed Reminders.
- This pass focuses on UI and workflow. Do not add a broad first-class reminder backend unless the scope is explicitly reopened.

## Authentication

Authentication must:

- Offer Google sign-in through Supabase browser OAuth when the provider is configured.
- Let users continue with one email field that sends a Supabase magic link for sign-in or account creation.
- Send a Supabase email magic link, then show a dedicated `Check your email` state.
- Tell users to open the email link on the phone with Precious Captures installed.
- Avoid password fields in the primary consumer auth flow.
- Explain that using the same email with Google and email links keeps one linked account.
- Avoid surfacing anonymous-auth or provider-debug messages as primary user copy.

## Home

Home must:

- Show a compact, prominent top action that opens full-screen Search.
- Show the active Capture count as quiet inline metadata beside the `Recents` title, not as a separate top line.
- Show active Captures grouped by recency, such as `Today`, `Yesterday`, `This week`, and `Earlier`.
- Show each row as rich consumer content: optional existing thumbnail or shared image preview, title, source plus date/time, icon-led Save Intent when available, compact linked Collection when available, compact Reminder when available, and operational status only for analyzing or failed Captures.
- Hide analyzer rationale, summary prose, and note previews from the Recents row surface while keeping them available in Capture Review and Search.
- Indicate when a Capture belongs to more than one Collection without making the row noisy, for example by showing the first Collection with a compact additional-count marker.
- Hide audit-like extraction details from rows, including model/provider names, analysis mode, confidence percentages, generic `Analyzed` labels, and debug state.
- Keep extraction details persisted and searchable.
- Preserve the Recent Captures scroll position when a user opens Capture Review from a Recent row and returns by in-screen, hardware, or gesture back.
- Provide designed loading, empty, error, long-content, processing, failed, and delete-undo states.

Home must not:

- Show a home review banner.
- Show a permanent paste box as the main module.
- Use `Upcoming` as the default home.
- Surface Collections, Map, Agenda, or reminder modules as primary home sections.

## Search

Search must:

- Open as a full-screen, focused surface with a minimal search input.
- Use rich result rows consistent with Home.
- Show existing capture thumbnails or source imagery in result rows when available, with the same fallback rhythm as Home.
- Avoid review glyphs, review-colored source marks, and visible review status labels in result rows.
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
- Route Link captures through public URL evidence and preflight. Link-only captures with no useful public or user-provided context should not remain in Recent Captures; notify the user that the capture was not saved and suggest adding a screenshot or note. Route Note, Image, Screenshot, and mixed image captures through modality-specific note/visual evidence so weak URL evidence does not decide whether non-link analysis is useful.

## Capture Review

Capture Review must:

- Feel like editing a saved memory, not inspecting an analysis report.
- Lead with the editable title and source context, followed by existing capture imagery or source media when available. Tapping uploaded image or screenshot media opens a full-screen image viewer with pinch zoom; tapping source/link preview media opens the source URL when one is available.
- Make the editable title the primary text above the media/source preview.
- Show Save Intent, Collections, and Reminder as one compact editable sentence below the title/source area, using language like `Saved as [Purpose] in [Collection] for [Later]`. Use Material 3 Expressive-style emphasis through type, color, underline, and touch target sizing rather than pill cards.
- Show current AI-selected values as normal editable values. Show `Add intent`, `Add collection`, or `Add reminder` only when the field has no current value. Blank intent remains valid when no concrete action is inferable.
- Tapping Purpose, Collection, or Later opens a focused bottom sheet editor. Collection selection includes existing active Collections and `No collection` as a valid clearing state.
- Do not show separate AI Collection suggestion modules, `Use suggestion`, inline Collection creation, or per-row `Manage` actions inside Capture Review. Collection suggestions may appear only as the inline Collection value/rationale in the editable sentence.
- Offer toast undo for immediate collection removal when feasible.
- Use a consumer label such as `Later` for the main Reminder control; reserve `Reminder idea` for sheet rationale or detail surfaces when the AI suggested the timing. When Capture Analysis found no Reminder idea, tapping `Add reminder` opens the same manual reminder editor.
- Show an `Open in Maps` action when Capture Analysis has a maps-searchable Visit Target and a native map provider passes an open check. This action opens the available Google Maps or Apple Maps search from the persisted Visit Target, preferring the target name when present and falling back to the saved query; Android must not show Apple Maps through a browser fallback, and the action must not imply a verified address, coordinates, place ID, or a first-class Map destination.
- Include an `Add reminder` flow only when the selected reminder can at least persist as a capture-local or otherwise durable value. The editor must collect a start and end date, optional start and end time, and show the computed duration so date ranges, time ranges, and same-day time ranges are all editable. Do not imply notification delivery until it exists.
- Purpose, Collection, and Later field uncertainty must not create inline review work, `Looks good`, clear-suggestion actions, or home review banners. The user corrects AI selections through ordinary field editing.
- Do not show a separate Review Insight bottom sheet or checklist for Purpose, Collection, or Later. AI rationale appears only inside the relevant field editor sheet while the field still matches the AI-selected value.
- Choosing `No intent`, `No collection`, or no Reminder must stay available through the Purpose, Collection, or Later bottom sheets. Analysis-level missing context or failure cases may use neutral `Needs review` or `Could not analyze` status copy.
- Keep raw source, destructive delete actions, and detailed rationale visually secondary.
- Use modality-specific evidence in review copy. Image and note captures without a source URL must not show Link evidence fallback copy or a `Link evidence` module; they should show `Needs review` / `Couldn't tell` language when saved content needs more context.

## Collection Management

Collection management must:

- Be available from the bottom app bar as the top-level `Collections` destination, while remaining secondary to Recent Captures and Search.
- Provide an independent `Collections` screen for creating, renaming, and managing Collections.
- Open new Collection creation from the Collections floating `+` as a bottom sheet, not as an inline card.
- Show existing Collections in a consumer-facing list with useful metadata such as capture count or recent use when available.
- Seed empty accounts with a small finite set of object-based starter Collections that behave like normal active Collections and can be removed through Collection management.
- Let Capture Review navigate to collection selection and return without losing edits.
- Preserve `No collection` as a valid state for any Capture.
- Allow a Capture to belong to multiple Collections.
- Avoid making Collection browsing the default retrieval surface; Search remains the primary retrieval lens.
- Use toast undo for reversible/destructive collection changes where feasible.

## Trust Rules

- AI output is a suggestion, except high-confidence existing Collection matches may be applied quietly because they are finite and reversible.
- User-approved output becomes first-class product data.
- Existing Collection auto-attachment may be quietly applied when high-confidence because it uses only active user-owned Collections.
- New Collections require explicit user creation from the Collections destination or product-owned starter seeding for empty accounts, never AI creation.
- All reminders require explicit user action.
- Leaving a Capture without a Collection is valid and should not appear as an unresolved task.

## Motion And State

- Use restrained native-feeling transitions for opening Search, Capture Review, and focused edit views.
- Use press feedback on rows, buttons, and chips.
- Use inline loading placeholders or skeleton rows instead of debug spinners where possible.
- Preserve drafts during loading, app backgrounding, and navigation.
- Use toasts for reversible actions such as collection removal or delete when feasible.
- Avoid decorative motion, heavy gesture systems, or animation that delays capture or retrieval.

## Out Of Scope For This Pass

- Map.
- Agenda.
- Full reminder notification delivery.
- A general Library destination.
- Chatbot search.
- Broad backend restructuring beyond what is necessary to support the agreed UI.
