# Consumer UI Revamp Acceptance Criteria

## Purpose

This artifact records the agreed scope for the current Precious consumer UI revamp. Use it with `docs/precious-style-guide.md`, `docs/requirements/CONTEXT.md`, and `docs/requirements/PRODUCT.md` before implementing or reviewing UI work.

Related ADRs: `docs/adr/0001-recent-captures-and-full-screen-search.md`, `docs/adr/0005-bottom-app-bar-and-top-level-collections.md`, `docs/adr/0006-existing-only-multi-collection-assignment.md`, `docs/adr/0008-starter-collections-for-empty-accounts.md`, `docs/adr/0009-action-oriented-save-intents.md`, `docs/adr/0016-use-satoshi-for-consumer-typography.md`, `docs/adr/0018-light-consumer-app-shell.md`, and `docs/adr/0019-use-clash-display-for-display-typography.md`.

## Product Shape

- The app should feel like a polished consumer memory surface, not a dogfooding, audit, or extraction-review tool.
- The consumer shell uses a calm warm light Material 3 Expressive-inspired surface hierarchy by default, with an off-white paper background and tonal grouped surfaces.
- Material 3 Expressive emphasis should clarify review decisions through purposeful size, shape, tonal containment, motion, and semantic color while preserving familiar native controls and Precious' calm memory-surface tone.
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
- Treat the Capture title as the saved content's title, not source metadata. Titles must not duplicate the source line or render copy such as `Saved from instagram.com`.
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
- Present exactly one capture mode at a time: `Link` or `Image`; New Capture no longer offers free-text Note creation.
- Validate Link captures as a single absolute `http`/`https` URL or bare domain before saving, with inline helper copy for invalid input while preserving backend/native URL validation.
- Offer explicit in-app image actions for `Take photo` and `Choose from photos`, both using existing image capture processing without adding new extraction rules. Cancelling either image path returns to Recent Captures with the New Capture sheet closed.
- Route Link captures through public URL evidence and preflight. Link-only captures with no useful public or user-provided context should not remain in Recent Captures; notify the user that the capture was not saved and suggest adding a screenshot or note. Route Image, Screenshot, and mixed image captures through modality-specific visual evidence so weak URL evidence does not decide whether non-link analysis is useful.

## Capture Review

Capture Review must:

- Feel like editing a saved memory, not inspecting an analysis report.
- Lead with existing capture imagery or source media as a full-bleed top preview that can extend under the transparent status bar, with the image matte and editable title/source/detail controls gathered against the same warm paper background as Recents and Collections. Tapping uploaded image or screenshot media opens a full-screen image viewer with pinch zoom; tapping source/link preview media opens the source URL when one is available.
- Make the saved media or designed source fallback a strong first-viewport visual anchor with a taller portrait-like frame at rest that eases toward square as the same native page scroll advances into the detail plane. Do not use nested detail-only scrolling, sticky collapse behavior, or draggable sheet affordances for Capture Review.
- Keep source app, host, and URL represented only as source context; the editable title should not default to source-only copy such as `Saved from [domain]`.
- Show Save Intent, Collections, and Reminder as one compact editable sentence below the title/source area, using language like `Saved as [Purpose] in [Collection] for [Later]`. Use Material 3 Expressive-style emphasis through type, color, warm tonal pills, and touch target sizing rather than stark white cards or underlined text links.
- Show current AI-selected values as normal editable values. Show `Add intent`, `Add collection`, or `Add reminder` only when the field has no current value. Blank intent remains valid when no concrete action is inferable.
- Tapping Purpose, Collection, or Later opens a focused bottom sheet editor. Collection selection includes existing active Collections and `No collection` as a valid clearing state.
- Do not show separate AI Collection suggestion modules, `Use suggestion`, inline Collection creation, or per-row `Manage` actions inside Capture Review. Collection suggestions may appear only as the inline Collection value/rationale in the editable sentence.
- Offer toast undo for immediate collection removal when feasible.
- Use a consumer label such as `Later` for the main Reminder control; reserve `Reminder idea` for sheet rationale or detail surfaces when the AI suggested the timing. When Capture Analysis found no Reminder idea, tapping `Add reminder` opens the same manual reminder editor.
- Show contextual location only when Capture Analysis has a maps-searchable Visit Target or a resolved Google Place. The primary review surface should keep location inside the same editable sentence rhythm, using Material 3 Expressive emphasis such as tappable `at [Place]` text rather than a standalone card, map icon, or separate Maps button. If Google Places resolves an exact Resolved Place, Maps opening should use the Google place ID; if resolution is missing, failed, ambiguous, or unavailable, stay search-only and do not imply a verified address, coordinates, place ID, photo, or first-class Map destination. Android must not show Apple Maps through a browser fallback.
- Include an `Add reminder` flow only when the selected reminder can at least persist as a capture-local or otherwise durable value. The editor must collect a start and end date, optional start and end time, and show the computed duration so date ranges, time ranges, and same-day time ranges are all editable. Do not imply notification delivery until it exists.
- Purpose, Collection, and Later field uncertainty must not create inline review work, `Looks good`, clear-suggestion actions, or home review banners. The user corrects AI selections through ordinary field editing.
- Do not show a separate Review Insight bottom sheet or checklist for Purpose, Collection, or Later. AI rationale appears only inside the relevant field editor sheet while the field still matches the AI-selected value.
- Field rationale copy must come from structured Capture Analysis output, not client-side string rewriting. Purpose rationale should use `I chose [Purpose] because ...` or explain `No intent`, Collection rationale should use `I picked [Collection] because ...` or explain `No collection`, and Later rationale should use `I suggested [Later] because ...` or explain `No Reminder idea`, with each field rationale capped at 12 words and each structured field header capped at 36 characters.
- Editing Purpose, changing the Collection draft selection, or changing the Later date/time draft must hide that field's AI rationale immediately, before save, whenever the draft no longer matches the structured AI-selected value.
- Choosing `No intent`, `No collection`, or no Reminder must stay available through the Purpose, Collection, or Later bottom sheets. Analysis-level missing context or failure cases may use neutral `Needs review` or `Could not analyze` status copy.
- Keep raw source, destructive delete actions, and detailed rationale visually secondary.
- Use modality-specific evidence in review copy. Image and note captures without a source URL must not show Link evidence fallback copy or a `Link evidence` module; they should show `Needs review` / `Couldn't tell` language when saved content needs more context.

## Collection Management

Collection management must:

- Be available from the bottom app bar as the top-level `Collections` destination, while remaining secondary to Recent Captures and Search.
- Provide an independent `Collections` screen for creating, renaming, and managing Collections.
- Open new Collection creation from the Collections floating `+` as a bottom sheet, not as an inline card.
- Let the Collections top action open a focused full-screen Collection Search surface that returns Collections using the same redesigned Collection card grid.
- Show existing Collections as a consumer-facing two-column grid of large cards, with useful metadata such as capture count or recent use when available.
- Show each Collection card with a large thumbnail area: empty Collections and Collections with no usable thumbnail media use a quiet blank tonal thumbnail, while non-empty Collections show a collage of up to four recently linked Capture thumbnails when available. Captures without usable thumbnail media must not reserve collage slots or appear as source-domain/no-image placeholder tiles.
- Load Collection card collage previews from persisted Collection metadata rather than fetching each Collection detail page or re-deriving recent links just to paint thumbnails.
- Update persisted Collection collage composition when a new Capture is added to that Collection, so the grid stays visually stable across ordinary reloads.
- Keep Collection detail rows usable as soon as capture text data arrives; thumbnail loading must not hold the entire row behind a skeleton.
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
