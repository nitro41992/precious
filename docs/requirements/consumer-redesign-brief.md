# Sharebook Consumer Redesign Brief

## Product Identity

Sharebook is a capture-first memory app. It lets users save anything quickly, then retrieve it by meaning, place, or time.

The consumer app should not feel like an AI development dashboard, bookmark manager, productivity cockpit, or manual tagging tool. It should feel like a trusted memory surface that stays out of the way during capture and becomes useful when the saved thing matters again.

Sharebook is a provisional app name. The domain model should remain stable while consumer-facing labels evolve. App name, Confidence States, reminder state names, collection state names, and place state names should be centralized as Product Language Tokens.

## Core Loop

The first consumer design sprint should optimize for the share-to-understanding-to-search loop:

1. User shares a link, post, screenshot, image, or note to Sharebook.
2. Sharebook immediately creates a durable Capture without requiring confirmation.
3. Sharebook may show a compact Capture Status Notification while Capture Analysis runs in the background.
4. When analysis is complete, the status notification updates to a compact processed state: "Extraction looks good" or "Extraction needs review."
5. If the result has low confidence or user-actionable suggestions, the processed notification includes a Review CTA.
6. Tapping the notification opens Capture Review with AI extraction Confidence States, rationale, and focused Quick Edit.
7. User accepts, changes, or dismisses inferred intent, suggested Reminder, and Collection attachment.
8. Sharebook preserves the Capture and makes it retrievable through Recent Captures and full-screen Search.

Silent instant save is the prerequisite trust moment for native share. Useful post-analysis Capture Review with human-readable Confidence States and Quick Edit is the first differentiated wow moment.

## Retrieval Model

Recent Captures, Search, Map, Agenda, Library, and Review Inbox are Retrieval Lenses over Captures and related entities. They are not separate saved object types.

- Recent Captures is the default home lens. It shows active Captures ordered by most recently captured, grouped by recency, with Search as the primary retrieval action.
- Search retrieves by fuzzy memory, meaning, entity, Save Intent, Collection, place, time, source, or remembered context.
- Search is a full-screen lens opened from a compact Recent Captures top action, not a small embedded filter field or generic chatbot.
- Search may use persisted extraction details such as entities, summary, Save Intent, Platform Evidence, Collection links, Reminder suggestions, source URL, notes, and timestamps.
- Collections is a top-level management destination for user-owned organization, while Recent Captures remains the default home lens.
- Map retrieves by place-like Captured Entities, not where the user happened to be when saving. Map is deferred for this revamp.
- Agenda retrieves time-relevant Captures and Confirmed Reminders. Agenda is deferred until Confirmed Reminders function.
- Library can later become organized memory for browsing saved Captures by recency, place, time, Collection, and archived state. It is not top-level for this revamp.
- Review Inbox remains a useful concept for low-confidence intent, suggested Reminders, failed analysis, and Quick Edit actions, but it is not a top-level screen in this revamp.

## Navigation

Primary mobile navigation:

- Recent
- Collections
- Settings/account as a small contextual action
- Separate contextual floating `+` action

On Recent, capture should remain globally available through a prominent floating button beside the bottom app bar and through native share surfaces. On Collections, the floating button opens New Collection.

Do not expose these as top-level destinations in the current revamp:

- Map
- Agenda
- Archived
- Upcoming
- Library

Collections remain editable from Capture Review and manageable from the bottom app bar. Archived Captures remain available through a secondary filter or view, not the default Home list.

## Intake

Native share is the primary activation path because Sharebook's wedge is saving from the flow of another app.

Native share should be silent by default on Android and later iOS: once the user chooses Sharebook from another app's share sheet, Sharebook should durably accept the Capture and return the user to the source app or host context. The follow-up moment is the Capture Completion Notification, which opens Capture Review when tapped.

The in-app Capture FAB opens a compact Capture Sheet with:

- Save copied link or pasted text
- Add note
- Upload image or screenshot
- First-run help for sharing from another app

Capture must not wait for AI analysis. Correction improves the Capture but is not required to save it.

## Quick Edit

Quick Edit should feel like an editable sentence, not a correction form.

Example structure:

> Saved as **try this place** in **SF trip**.  
> Reminder idea: **next Saturday afternoon**.

The tappable parts are chips. The user can change intent, adjust Collection attachment, open an Add Reminder flow, or add a short Context Note.

Captured Entities may appear as supporting context, but entity editing should not be the main task. The feeling should be fast, tactile, and low-stakes.

Quick Edit should optimize for tactile delight: restrained visuals, tappable chips, haptic-feeling transitions where native platforms allow them, quick accept/change/dismiss gestures, and enough polish that correcting AI feels easy rather than punitive. It should not become gamified or visually loud.

Quick Edit should include a concise because sentence for each AI-predicted suggestion that asks for user trust, including inferred Save Intent, suggested Reminder, and location or place placement. Collection assignment should use only existing Collections and should not surface free-form AI suggestions. The rationale should be short and specific, such as "Because the reel mentions a SoHo ramen shop." The first version should not include expandable evidence, confidence percentages, or an analysis report.

If the user dismisses Quick Edit:

- The Capture remains saved.
- Default Intent persists.
- Unconfirmed Reminders do not persist.
- High-confidence attachment to an existing Collection may persist.
- New Collections are created only from the top-level Collections destination.
- A Capture may intentionally have no Collection and may belong to multiple Collections.
- AI Collection matches are not shown as `Use suggestion` review work.

If the user misses or dismisses the Capture Completion Notification, the completed Capture and its suggestions should remain available in the Review Inbox for later triage when there is something actionable to review.

## Trust Rule

Sharebook uses Quiet Confidence:

Sharebook may quietly persist low-risk, reversible AI decisions, such as Default Intent or high-confidence attachment to an existing Collection. It must ask before creating interruptions, obligations, or new organizational structures, such as Confirmed Reminders or new Collections.

User-facing AI confidence should use human-readable Confidence States, not numeric scores:

- Looks right
- Maybe
- Not sure
- Couldn't tell

Confidence States should be supported by concise rationale when the user is asked to trust or correct a prediction, such as "Maybe Saturday because the post says open this weekend."

Behavior mapping:

- Looks right: may persist when low-risk and reversible, but remains editable.
- Maybe: must appear as a suggestion in Quick Edit, Review Inbox, or another review surface; it must not create obligations.
- Not sure: must appear in Review Inbox as something to resolve.
- Couldn't tell: preserves the Capture, avoids inventing, and offers a useful fallback such as review later or add note.

Anything Sharebook does not confidently act on must be visible and actionable somewhere predictable. Unconfirmed Reminder suggestions must look like suggestions, not scheduled reminders.

Capture Status Notifications should behave like compact transfer notifications:

- Processing state: terse ongoing status, such as "Processing capture" or "Analyzing saved reel."
- Processed, looks good: "Capture processed" with "Extraction looks good"; quiet or minimized by default.
- Processed, needs review: "Capture processed" with "Extraction needs review" and a Review CTA; may alert.

Notifications should not include extensive extraction details. Confidence States, rationale, and Quick Edit belong in Capture Review after the user taps.

## First-Run Empty State

Zero-capture Home should not feel like an empty dashboard or daily agenda. Its job is to help the user create the first real Capture.

Primary first-run action:

- Share something to Sharebook

Fallback actions:

- Paste a link
- Add a note
- Upload a screenshot or photo

The empty state should teach by action, not by a long onboarding tour.

## Upcoming Review Module

Upcoming is deferred. Do not build an Upcoming review module until reminder functionality and review-surface priorities are revalidated.

## Recent Captures Home

Home should feel like a consumer memory surface, not an audit table.

- Show active Captures only, ordered by most recently captured.
- Group rows by recency, such as `Today`, `Yesterday`, `This week`, and `Earlier`.
- Row metadata must include source and date/time, not only time.
- Rows should show consumer-facing meaning: title, source/date/time, summary, `Saved as [intent]`, meaningful status, and optional note preview.
- Rows should not show model/provider details, analysis mode, confidence percentages, generic `Analyzed` labels, or other audit metadata.
- Put a compact Search action in the top bar that opens full-screen Search.
- Use smooth transitions, loading states, press feedback, and snackbar undo for reversible removal actions.

## Design Principles

- Optimize the first visual direction for Personal Memory with Native Calm: warmer and more human than internal tooling, but still restrained, fast, and familiar.
- Capture first, analysis second, review when useful.
- Preserve momentum during intake.
- Make Recent Captures and full-screen Search feel like the primary consumer product.
- Make AI correction feel lightweight and satisfying.
- Treat smooth transitions, loading states, and draft-preserving feedback as required polish.
- Do not show confidence percentages to users.
- Do not turn suggestions into obligations.
- Do not map location history.
- Do not make users manually organize before the app has earned trust.
- Use restrained product UI: native-feeling controls, compact hierarchy, clear states, and no decorative AI chrome.
- Treat the app name, Confidence States, and user-facing state labels as product language tokens. Sharebook is provisional, and consumer copy should be easy to revise without changing the domain model.
