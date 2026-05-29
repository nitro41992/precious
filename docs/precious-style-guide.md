# Precious Captures Style Guide

## Purpose

Precious Captures should feel like a native mobile memory surface: calm, fast, private, and useful when a saved thing needs to be found or edited. This guide translates reference patterns from Apple Health, Gentler Streak, Stoic, and Tiimo into implementation rules for Precious UI work.

Use this guide when designing or reviewing capture intake, capture lists, Capture Review, collections, search, reminders, empty states, loading states, and error recovery. It is not a marketing direction and should not introduce decorative AI chrome, dashboard density, or manual organization before the product has earned trust.

## Current Product Direction

The current consumer UI target is search-first memory retrieval:

- The default home screen is `Recent Captures`, a beautiful active-capture list ordered by most recently captured.
- Search is a full-screen Retrieval Lens opened from a prominent home affordance, not a small embedded filter field.
- Capture rows should feel rich and consumer-facing, while audit-like extraction details remain hidden from the row and available to Search.
- Collections are not a top-level home mode. Collection attachment belongs in Capture Review, and Collection management should also exist as a secondary independent screen.
- Map, Agenda, and full reminder delivery are deferred. Agenda depends on functioning Confirmed Reminders.
- Smooth transitions, loading states, press feedback, draft-preserving saves, and snackbar undo are part of the expected product quality.

## Reference Inheritance

Mobbin access was limited during research: the supplied pages exposed title shells and placeholders rather than full screen sets. The inheritance below combines those supplied references with public app pages, App Store listings, support docs, and public screenshot-library summaries.

### Apple Health

- Borrow the quiet grouped-list system: low-glare dark grouped background, tonal surfaces, high-contrast text, muted metadata, thin dividers, and compact rows.
- Lead with a curated retrieval surface, not an exhaustive database. In Precious, recent active Captures and full-screen Search should appear before archive-heavy browsing.
- Use color only for meaning. Status, confidence, reminders, and collection suggestions may carry color; decoration should not.
- Keep detail screens drill-in oriented: title and state first, source and summary next, review decisions in the middle, raw source and destructive actions last.
- Use short explanatory blocks only where they increase trust around AI decisions.

### Gentler Streak

- Borrow the adaptive, non-judgmental tone. Failed or incomplete analysis should read as "needs a quick look", not as a user failure.
- Make one primary status surface obvious. A capture should clearly move through saved, analyzing, needs review, ready, and archived states.
- Put contextual coaching near the relevant object: "Review the extracted title" or "Saved. Checking the source now."
- Use compact recaps for perspective, not pressure: review backlog, captures saved this week, collections updated, or sources used.
- Keep actions next to context. Confirm, retry, add to collection, remove, and archive should live with the capture or collection being acted on.

### Stoic

- Borrow calm copy and guided reflection. Prompts should be short invitations, not blank forms or productivity pressure.
- Use optional reflective questions for context notes: "Why did you save this?", "Who is this for?", "What should this help you remember?"
- Treat privacy as a product quality. Sensitive moments should have quiet trust cues in settings, source metadata, and AI-analysis copy.
- Keep loading and sync states calm and draft-preserving. The user should never feel that a note, source, or review decision was lost.
- Use empty states that invite one real action instead of explaining the whole product.

### Tiimo

- Borrow the clear next-action model. The screen should answer what needs attention now without making the app feel like a chore list.
- Use visual planning cues when time matters: today, date groups, captured timestamps, reminder ideas, or carry-forward items.
- Pair color with icon or text. Do not rely on color alone for state or category.
- Make replanning gentle: "Move later", "Review later", "Carry forward", and "Archive" are better than failure language.
- Break complex workflows into small steps when needed, especially capture review, reminder confirmation, and collection cleanup.

## Design Principles

- **Native Calm:** Use restrained native mobile patterns, compact hierarchy, dark neutral tonal surfaces, and clear state labels.
- **Capture First:** Saving must feel durable and immediate. Analysis and review happen after capture, not before it.
- **Quiet Confidence:** Persist low-risk, reversible AI decisions quietly; ask before creating reminders, obligations, or new organizational structures.
- **Guided Review:** Correction should feel like editing meaning with chips and short rationale, not filling out an analysis report.
- **Search-First Retrieval:** Home should make Search feel primary while still giving users a rich recent-memory list.
- **Owned Organization:** Collections should feel user-owned and manageable without turning organization into the main product surface.
- **Semantic Color:** Color communicates state, confidence, or category. Avoid decorative gradients, color fields, and ornamental backgrounds.
- **Scan Before Explain:** Rows and summaries should be legible in a two-second scan. Long rationale belongs behind an intentional affordance.
- **Private By Default:** AI and sync behavior should be legible, especially around source content, notes, images, and reminders.
- **Thumb-Aware:** Primary actions should be reachable, tap targets should be at least 44-48px, and bottom insets must be respected.
- **Consumer Polish:** Motion, loading states, empty states, and snackbar recovery should feel native and intentional, not debug-like.

## Visual System

### Color Roles

Use the dark neutral palette as the default app base and add state colors sparingly. The prior warm-paper palette is no longer the primary consumer shell direction.

| Role | Token | Use |
| --- | --- | --- |
| Paper | `#101411` | App background and sticky footers |
| Surface | `#171c18` | Bounded review blocks or grouped surfaces only |
| Surface Container | `#1d241f` | Search bars, sheets, rows with emphasis |
| Surface Container High | `#252d27` | Pressed states, dense inputs, secondary panels |
| Ink | `#eef5ef` | Primary text and high-emphasis actions |
| Muted | `#a6b3aa` | Metadata, helper text, secondary labels |
| Line | `#37413a` | Hairline dividers and subtle borders |
| Accent | `#7bd7ad` | Primary action, ready, selected positive state |
| Accent Soft | `#17382b` | Selected chip or successful quiet state |
| Processing | `#9fc6e3` | Analyzing, syncing, queued |
| Review | `#e2bd76` | Needs review, maybe, action needed |
| Review Soft | `#342713` | Review callouts and changed suggestions |
| Danger | `#ffb4a8` | Failed, destructive, could not save |
| Archived | `#a6b3aa` | Archived or inactive state |

Rules:

- Use one dominant accent per screen.
- Do not use confidence percentages or red/yellow/green scoring.
- Pair color with text labels such as `Ready`, `Analyzing`, `Needs review`, `Failed`, or `Archived`.
- Avoid pure black, pure white as the whole page background, purple gradients, glass effects, and decorative blobs.
- Treat available source imagery, thumbnails, screenshots, and shared image assets as product content. Use them for rows and Capture Review headers when already persisted; do not add decorative imagery or new extraction work only to fill space.

### Typography

- Use native system fonts.
- Page title: 26-28px, 700 weight, tight but readable line height.
- Section title: 17-19px, 700 weight.
- Row title: 17-18px, 600-700 weight, usually one line.
- Body: 15-16px, 21-23px line height.
- Metadata: 12-13px, muted, often 700 when used as a label.
- Inputs: at least 16px to avoid tiny mobile form text.
- Use sentence case for user-facing labels. Uppercase is acceptable only for compact metadata labels.
- Letter spacing should stay `0`.

### Spacing And Shape

- Use a compact spacing scale: 4, 8, 12, 16, 22 or 24, 32.
- Default horizontal screen padding: 22px unless a native component requires otherwise.
- Default radius: 8px. Segments may use 6px. Avoid large pill-heavy UI unless the element is truly a chip.
- Use hairline dividers for list separation.
- Do not put cards inside cards.
- Prefer grouping and spacing before adding borders.

## Components

### Screen Shell

- Use safe areas on every screen, including Android status bar and bottom action areas.
- Put one screen title at the top. Avoid stacking multiple hero-like headings.
- Keep account, settings, or sign-out as small contextual actions, not primary workflow controls.
- Use a sticky bottom action only when the screen has one clear completion action.

### Lists And Rows

Capture rows should follow this order:

1. Title on the left and status on the trailing edge.
2. Source and date/time metadata.
3. Optional one- or two-line summary.
4. Optional `Saved as [intent]` meaning line.
5. Optional review reason.
6. Optional note preview.

Rules:

- Rows should feel tappable without heavy card styling.
- Use separators or grouped surfaces, not thick borders.
- Keep row tap targets at least 44px high.
- Use stable row structure for `processing`, `ready`, `needs_review`, `failed`, and `archived`; do not make processing rows jump or disappear.
- Do not show model/provider details, analysis mode, confidence percentages, or generic `Analyzed` metadata in Recent Captures rows.
- Group Recent Captures by recency with headers such as `Today`, `Yesterday`, `This week`, and `Earlier`.

### Chips

- Chips represent editable meaning: Save Intent, Collection, Reminder, source filter, or review state.
- Chips must have visible text and at least 44px effective height when interactive.
- Selected chips may use `Accent Soft` or `Ink`; unselected chips use `Soft` or paper with a line border.
- Long-press rationale is allowed, but the primary tap should still perform the obvious edit or selection.

### Buttons And Actions

- Primary buttons use `Accent` or `Ink` depending on context; they should be visually stable and bottom-reachable where possible.
- Secondary actions should often be text buttons or light bordered buttons.
- Destructive actions use danger text and should sit near the footer or object settings, not beside the main save action.
- Button copy should use direct verbs: `Save review`, `Retry analysis`, `Archive capture`, `Restore capture`, `Use collection`.

### Summary Cards

Cards are allowed only for bounded summaries or decisions:

- Needs-review module
- Capture receipt
- Weekly recap
- Suggested collection
- Reminder suggestion
- Link evidence notice

Each card should have one purpose, one short headline, one evidence line, and one primary action at most.

### Motion And Feedback

- Use restrained native-feeling transitions for opening Search, Capture Review, collection edit views, and reminder edit views.
- Use press feedback on rows, buttons, and chips.
- Use inline loading placeholders or skeleton rows for captures and search results; avoid full-screen spinners except during app boot.
- Use snackbar undo for reversible destructive or removal actions such as archive and collection removal.
- Do not use decorative motion, delayed search animations, or heavy gesture systems until core retrieval is fast.

## Workflow Patterns

### First Run And Empty States

The Recent Captures empty state should teach through action:

- Title: `Share something in.`
- Body: `Use the share sheet from a browser, message, notes app, or photos.`
- Primary action: `Paste link or note`
- Secondary cue: `You can review details after the capture is saved.`

Rules:

- Do not use fake example feeds.
- Do not explain every future retrieval lens.
- For archived and collection-related empty states, state what will appear there and how it becomes useful.

### Recent Captures Home

- Home shows active Captures only, ordered by most recently captured.
- Archived Captures stay retrievable through a secondary filter or view, not the default list.
- Place a large search affordance at the top: `Search anything you saved`.
- Tapping the search affordance opens full-screen Search.
- Rows should include source and date/time metadata, not only time.
- Extraction details should remain persisted and searchable without being rendered as audit metadata.
- Collections, Map, Agenda, and reminder modules should not appear as top-level home sections in this pass. A small secondary entry to Collection management is allowed from Home/account/menu.

### Capture Intake

- Native share is the primary path and should stay silent after durable acceptance.
- In-app capture is a fallback. It should be compact: paste link or note, optional context note, save.
- The capture receipt should say the save happened immediately, then show analysis as background work.
- Do not block saving on AI analysis.

Recommended copy:

- `Saved. Checking the source now.`
- `Analyzing capture...`
- `You can leave this screen. Review will be available when analysis finishes.`

### Processing

Processing rows should preserve source and timestamp. Show a stable status, not a full-screen spinner.

Use:

- Status: `Analyzing`
- Metadata: source + time
- Optional support: `Checking the source now.`

Do not show model names, provider details, analysis reports, or debug status in the primary UI.

### Needs Review

Needs-review states should explain the exact decision needed.

Use:

- `Review title`
- `Confirm reminder`
- `Choose collection`
- `Open link once`
- `Add context`

Capture Review should read like an editable sentence:

`Saved as [try this place] in [NYC restaurants]. Reminder idea: [next Saturday afternoon].`

Each chip can expand into a small picker. Keep concise rationale visible only when it builds trust:

`Because the post mentions a SoHo ramen shop.`

When reminders are not fully implemented, use `Reminder idea: [before Saturday]` rather than copy that implies notification delivery.

### Collection Management

Collections need an independent management surface so organization does not feel hidden inside Capture Review.

Use:

- Screen title: `Collections`
- Primary action: `New collection`
- Row metadata: capture count, recent use, or short description when available
- Empty state: `Create a collection when a saved thing belongs somewhere specific.`

Rules:

- Keep Collection management secondary to Recent Captures and Search.
- Do not add Collections as a primary top-level tab or default home module in this pass.
- Let users create, rename, and manage Collections outside an individual Capture.
- Let Capture Review open collection selection or management and return without losing unsaved edits.
- Treat `No collection` as a valid choice, not an unresolved state.
- Avoid manual-filing pressure; Collections are optional organization, not required review work.

### Ready

Ready captures should feel done but still editable.

- Status: `Ready` or `Looks right`
- Keep edit affordances available in detail.
- Do not force confirmation for low-risk, reversible decisions.
- Raw source should be available but visually secondary.

### Failed Or Partial Analysis

Failure should preserve the capture and offer recovery.

Use:

- `Could not analyze`
- `Saved, but analysis needs another try.`
- Actions: `Retry analysis`, `Add note`, `Open source`

Avoid:

- `Failed to save` when the capture was saved.
- Blaming source apps or user input.
- Removing the row from the list.

### Collections

Collections are ongoing purpose groups, not folders.

- Show title, description, capture count, and archived state.
- Creating a new collection from AI requires user confirmation.
- High-confidence attachment to an existing collection may be quietly applied, but must remain editable.
- A Capture may intentionally have no Collection.
- If the user removes or changes an AI-applied Collection, do not reattach it automatically.
- Prior AI suggestions may remain available as `Use suggestion`.
- Collection removal should offer immediate snackbar undo when feasible.
- Collection browsing is not a top-level home mode in the current consumer revamp.

### Search

Search is a full-screen retrieval utility, not a chatbot default.

- Place a prominent search affordance at the top of Recent Captures that opens the full-screen Search lens.
- Results should explain why they matched: source, place, intent, collection, time, or remembered context.
- Filters should be chips or compact segments.
- Keep command-like filters optional and discoverable later.
- Search should match persisted extraction details such as entities, summary, Save Intent, collections, reminder suggestions, source URL, notes, and timestamps.

### Reminders And Agenda

- Confirmed reminders are user-approved resurfacing triggers and should be first-class data when implemented.
- Suggested reminders are review items, not scheduled obligations.
- Use review language until the user accepts: `Reminder idea`, `Add reminder`, `Choose date and time`.
- Do not imply notification delivery until notification delivery exists.
- Agenda is deferred until Confirmed Reminders function.

### Loading, Offline, And Sync

- Loading should be inline inside the section that is loading.
- Preserve drafts during loading, sync, and app backgrounding.
- Offline states should offer useful local behavior where possible: save locally, retry, or sync later.
- Error messages should name the operation: `Could not save review`, `Could not load collections`, `Network connection dropped. Try again in a moment.`
- Loading, empty, error, and syncing states should be designed with the same visual care as populated states.

## Copy Rules

Use:

- `Saved`
- `Analyzing`
- `Needs review`
- `Looks right`
- `Maybe`
- `Not sure`
- `Couldn't tell`
- `Review later`
- `Move later`
- `Archive`

Avoid:

- Numeric confidence scores
- `AI thinks`
- `Autopilot`
- `Uncategorized`
- `Failed item`
- Productivity pressure like `Complete your backlog`
- Marketing language like `unlock your memories`

Tone should be calm, direct, and specific. Prefer "Review the extracted title" over "Something went wrong."

## Implementation Checklist

Before shipping a Precious UI change, verify:

- The primary user decision is visible within two seconds.
- The screen has one dominant action or one clear scanning purpose.
- Status is expressed with text plus semantic color.
- Tap targets are at least 44-48px.
- The screen works around 360px-wide Android phones.
- Text does not overlap, clip awkwardly, or depend on fixed-height containers.
- Loading, empty, failed, archived, and long-content states are designed.
- AI rationale is concise and user-facing; model/provider/debug details are hidden.
- Suggested reminders and new collections require confirmation.
- The UI respects safe areas and bottom insets.
- No nested cards, decorative gradients, or dashboard-style density were introduced.
- Recent Captures rows include date/time metadata and hide audit-like extraction details.
- Search opens as a full-screen lens and can match persisted extraction details.
- Collections, Map, Agenda, and Upcoming are not primary navigation destinations for this pass.
- Collection removal offers immediate snackbar undo where feasible.
- Animations and loading states feel smooth without delaying capture or retrieval.

## Reference Links

- Apple Health Mobbin reference: https://mobbin.com/apps/apple-health-ios-76436d76-126b-42ea-a287-9bb453f8d97f/9b150bfa-4e95-489c-9dc0-4af8396899bf/screens
- Gentler Streak Mobbin reference: https://mobbin.com/apps/gentler-streak-ios-ccc0bb26-39b3-48fa-862d-2df69182840e/91403472-6e15-413b-ae56-0ad41f2ca6d2/screens
- Stoic Mobbin reference: https://mobbin.com/apps/stoic-ios-621f0be7-8046-45cd-b667-97add5f9c3c7/e20c833d-975b-401c-8601-74d135883e25/screens
- Tiimo Mobbin reference: https://mobbin.com/apps/tiimo-ios-92e196c8-3689-45c1-8869-449f9b7207c4/dc39e0c5-e9cb-4411-a8c4-75cc3a5e8169/screens
- Apple Health: https://apps.apple.com/us/app/apple-health/id1242545199
- Apple Health sharing support: https://support.apple.com/guide/iphone/share-your-health-data-iph5ede58c3d/ios
- Apple Health iOS 15 screenshots: https://www.apple.com/sg/newsroom/2021/06/apple-advances-personal-health-by-introducing-secure-sharing-and-new-insights/
- MacStories Health redesign writeup: https://www.macstories.net/stories/health-in-ios-13-a-foundation-for-apples-grand-wellness-ambitions/
- Gentler Streak: https://gentlerstories.com/gentlerstreak
- Stoic: https://www.getstoic.com/
- Tiimo: https://www.tiimoapp.com/
- Tiimo visual planning: https://www.tiimoapp.com/product/visual-planning
- Tiimo focus timer: https://www.tiimoapp.com/product/focus
