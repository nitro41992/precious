# Sharebook Consumer Redesign Brief

## Product Identity

Sharebook is a capture-first memory app. It lets users save anything quickly, then retrieve it by meaning, place, or time.

The consumer app should not feel like an AI development dashboard, bookmark manager, productivity cockpit, or manual tagging tool. It should feel like a trusted memory surface that stays out of the way during capture and becomes useful when the saved thing matters again.

Sharebook is a provisional app name. The domain model should remain stable while consumer-facing labels evolve. App name, Confidence States, reminder state names, collection state names, and place state names should be centralized as Product Language Tokens.

## Core Loop

The first consumer design sprint should optimize for the share-to-understanding loop:

1. User shares a link, post, screenshot, image, or note to Sharebook.
2. Sharebook immediately creates a durable Capture without requiring confirmation.
3. Sharebook may show a compact Capture Status Notification while Capture Analysis runs in the background.
4. When analysis is complete, the status notification updates to a compact processed state: "Extraction looks good" or "Extraction needs review."
5. If the result has low confidence or user-actionable suggestions, the processed notification includes a Review CTA.
6. Tapping the notification opens Capture Review with AI extraction Confidence States, rationale, and focused Quick Edit.
7. User accepts, changes, or dismisses inferred intent, suggested Reminder, and Collection attachment.
8. Sharebook preserves the Capture and makes it retrievable through Upcoming, Search, Library, Map, and Agenda.

Silent instant save is the prerequisite trust moment for native share. Useful post-analysis Capture Review with human-readable Confidence States and Quick Edit is the first differentiated wow moment.

## Retrieval Model

Search, Map, Agenda, Upcoming, Library, and Review Inbox are Retrieval Lenses over Captures and related entities. They are not separate saved object types.

- Search retrieves by fuzzy memory, meaning, entity, Save Intent, Collection, place, time, source, or remembered context.
- Map retrieves by place-like Captured Entities, not where the user happened to be when saving.
- Agenda retrieves time-relevant Captures and Confirmed Reminders. Suggestions go to review, not the schedule.
- Library is organized memory: saved Captures browsed by recency, place, time, Collection, and archived state.
- Upcoming is the default home lens. It spans across days or weeks and should not imply the user has something to check every day. With no Captures, it becomes a first-capture empty state.
- Review Inbox is one segmented triage surface for low-confidence intent, suggested Reminders, suggested Collections, failed analysis, and Quick Edit actions.

## Navigation

Primary mobile navigation:

- Upcoming
- Search
- Library
- Settings

Capture should remain globally available through a prominent floating action button and through native share surfaces.

Library should contain prominent lenses:

- All
- Map
- Agenda
- Collections
- Archived

Map and Agenda are important, but they are not bottom-navigation destinations in the first consumer design.

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
> Reminder suggested: **next Saturday afternoon**.

The tappable parts are chips. The user can change intent, accept/edit/dismiss the Reminder suggestion, adjust Collection attachment, or add a short Context Note.

Captured Entities may appear as supporting context, but entity editing should not be the main task. The feeling should be fast, tactile, and low-stakes.

Quick Edit should optimize for tactile delight: restrained visuals, tappable chips, haptic-feeling transitions where native platforms allow them, quick accept/change/dismiss gestures, and enough polish that correcting AI feels easy rather than punitive. It should not become gamified or visually loud.

Quick Edit should include a concise because sentence for each AI-predicted suggestion that asks for user trust, including inferred Save Intent, suggested Reminder, suggested Collection, and location or place placement. The rationale should be short and specific, such as "Because the reel mentions a SoHo ramen shop." The first version should not include expandable evidence, confidence percentages, or an analysis report.

If the user dismisses Quick Edit:

- The Capture remains saved.
- Default Intent persists.
- Unconfirmed Reminders do not persist.
- High-confidence attachment to an existing Collection may persist.
- New Collections are not created without confirmation.

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
- Maybe: must appear as a suggestion in Quick Edit, Review Inbox, or Upcoming review prompts; it must not create obligations.
- Not sure: must appear in Review Inbox as something to resolve.
- Couldn't tell: preserves the Capture, avoids inventing, and offers a useful fallback such as review later or add note.

Anything Sharebook does not confidently act on must be visible and actionable somewhere predictable. Unconfirmed Reminder suggestions must look like suggestions, not scheduled reminders.

Capture Status Notifications should behave like compact transfer notifications:

- Processing state: terse ongoing status, such as "Processing capture" or "Analyzing saved reel."
- Processed, looks good: "Capture processed" with "Extraction looks good"; quiet or minimized by default.
- Processed, needs review: "Capture processed" with "Extraction needs review" and a Review CTA; may alert.

Notifications should not include extensive extraction details. Confidence States, rationale, and Quick Edit belong in Capture Review after the user taps.

## First-Run Empty State

Zero-capture Upcoming should not feel like an empty dashboard or daily agenda. Its job is to help the user create the first real Capture.

Primary first-run action:

- Share something to Sharebook

Fallback actions:

- Paste a link
- Add a note
- Upload a screenshot or photo

The empty state should teach by action, not by a long onboarding tour.

## Upcoming Review Module

Upcoming should include a gentle review module when suggestions or uncertain predictions are waiting, such as "2 saves need a quick look." This module should surface Maybe, Not sure, and Couldn't tell items without making Sharebook feel like a daily chore list.

## Design Principles

- Optimize the first visual direction for Personal Memory with Native Calm: warmer and more human than internal tooling, but still restrained, fast, and familiar.
- Capture first, analysis second, review when useful.
- Preserve momentum during intake.
- Make AI correction feel lightweight and satisfying.
- Do not show confidence percentages to users.
- Do not turn suggestions into obligations.
- Do not map location history.
- Do not make users manually organize before the app has earned trust.
- Use restrained product UI: native-feeling controls, compact hierarchy, clear states, and no decorative AI chrome.
- Treat the app name, Confidence States, and user-facing state labels as product language tokens. Sharebook is provisional, and consumer copy should be easy to revise without changing the domain model.
