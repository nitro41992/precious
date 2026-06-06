# Precious Captures Style Guide

## Purpose

Precious Captures should feel like a native mobile memory surface: calm, fast, private, and useful when a saved thing needs to be found or edited. This guide translates reference patterns from Apple Health, Gentler Streak, Stoic, and Tiimo into implementation rules for Precious UI work.

Use this guide when designing or reviewing capture intake, capture lists, Capture Review, collections, search, reminders, empty states, loading states, and error recovery. It is not a marketing direction and should not introduce decorative AI chrome, dashboard density, or manual organization before the product has earned trust.

## Current Product Direction

The current consumer UI target is search-first memory retrieval:

- The default home Retrieval Lens is `Recent Captures`, shown in the UI with the compact title `Recents`, a beautiful active-capture list ordered by most recently captured.
- Search is a full-screen Retrieval Lens opened from a compact, prominent Recent Captures action, not a small embedded filter field.
- Capture rows should feel rich and consumer-facing, while audit-like extraction details remain hidden from the row and available to Search.
- The top-level app shell uses a Material 3-inspired bottom app bar for Recent, Collections, and Settings, with a separate contextual floating `+` action.
- Collections is a top-level management destination, but Recent Captures remains the default home and Search remains the primary retrieval lens.
- Map, Agenda, and full reminder delivery are deferred. Agenda depends on functioning Confirmed Reminders.
- Smooth transitions, loading states, press feedback, draft-preserving saves, and toast undo are part of the expected product quality.

## Reference Inheritance

Mobbin access was limited during research: the supplied pages exposed title shells and placeholders rather than full screen sets. The inheritance below combines those supplied references with public app pages, App Store listings, support docs, and public screenshot-library summaries.

### Apple Health

- Borrow the quiet grouped-list system: warm off-white grouped background, tonal surfaces, high-contrast text, muted metadata, soft spacing, and compact rows.
- Lead with a curated retrieval surface, not an exhaustive database. In Precious, recent active Captures and full-screen Search should appear before inactive-item cleanup.
- Use color only for meaning. Status, confidence, reminders, and collection suggestions may carry color; decoration should not.
- Keep detail screens drill-in oriented: title and state first, source and summary next, review decisions in the middle, raw source and destructive actions last.
- Use short explanatory blocks only where they increase trust around AI decisions.

### Gentler Streak

- Borrow the adaptive, non-judgmental tone. Failed or incomplete analysis should read as `Needs review` or `Could not analyze`, not as a user failure.
- Make one primary status surface obvious. A capture should clearly move through saved, analyzing, needs review, ready, and failed states. Deleted captures leave active surfaces immediately.
- Put contextual coaching near the relevant object: "Review the extracted title" or "Saved. Checking the source now."
- Use compact recaps for perspective, not pressure: review backlog, captures saved this week, collections updated, or sources used.
- Keep actions next to context. Confirm, retry, add to collection, remove, and delete should live with the capture or collection being acted on.

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
- Make replanning gentle: "Move later", "Review later", "Carry forward", and "Delete" are better than failure language when removal is intended.
- Break complex workflows into small steps when needed, especially capture review, reminder confirmation, and collection cleanup.

## Design Principles

- **Native Calm:** Use restrained native mobile patterns, compact hierarchy, warm light tonal surfaces, and clear state labels.
- **Capture First:** Saving must feel durable and immediate. Analysis and review happen after capture, not before it.
- **Quiet Confidence:** Persist low-risk, reversible AI decisions quietly; ask before creating reminders, obligations, or new organizational structures.
- **Guided Review:** Correction should feel like editing meaning with chips and short rationale, not filling out an analysis report.
- **Search-First Retrieval:** Home should make Search feel primary while still giving users a rich recent-memory list.
- **Owned Organization:** Collections should feel user-owned and manageable without turning organization into the main product surface.
- **Semantic Color:** Color communicates state, confidence, or category. Avoid decorative gradients, color fields, and ornamental backgrounds.
- **Scan Before Explain:** Rows and summaries should be legible in a two-second scan. Long rationale belongs behind an intentional affordance.
- **Private By Default:** AI and sync behavior should be legible, especially around source content, notes, images, and reminders.
- **Thumb-Aware:** Primary actions should be reachable, tap targets should be at least 44-48px, and bottom insets must be respected.
- **Consumer Polish:** Motion, loading states, empty states, and toast recovery should feel native and intentional, not debug-like.

## Visual System

### Color Roles

Use the warm light palette as the default app base and add state colors sparingly. The shell should feel off-white and native, not stark white, dark, or decorative.

| Role | Token | Use |
| --- | --- | --- |
| Paper | `#FFF7E6` | App background, native window chrome, bottom fades, and sticky footers |
| Surface | `#FFFFFF` | Bounded review blocks or grouped surfaces only |
| Surface Container | `#FFF1DA` | Search bars, sheets, rows with emphasis, and warm fade support |
| Surface Container High | `#F8E6C6` | Pressed states, dense inputs, secondary panels |
| Surface Container Highest | `#F0D9AD` | Highest tonal emphasis for selected controls or bottom app bar wells |
| Review Card | `#FFFFFF` | Capture Review source and action cards |
| Review Card Well | `#FFF1DA` | Icon wells inside Capture Review action cards |
| Ink | `#17211B` | Primary text and high-emphasis actions |
| Muted | `#625F51` | Metadata, helper text, secondary labels |
| Placeholder | `#817866` | Input placeholder text |
| Line | `#E6D8BB` | Legacy subtle line token; avoid visible hairline borders and dividers |
| Line Strong | `#D0BE95` | Legacy stronger line token; use only when tonal separation is insufficient |
| Accent | `#C5D86D` | Lime primary fill for primary actions, ready states, and selected positive controls |
| Accent Text | `#C5D86D` | Bright lime icon tint and very small primary emphasis |
| Accent Text Strong | `#556600` | Darker green for readable inline values on warm paper |
| Accent Soft | `#EEF7C6` | Selected chip or successful quiet state |
| Accent Line | `#C5D86D` | Bright lime borders or small primary accent lines |
| Accent Pressed | `#9FB348` | Darker lime pressed fill for Recent Capture row/card feedback and primary actions |
| On Accent | `#17211B` | Text and icons on lime-filled controls |
| Collection Accent | `#F18F01` | Carrot secondary fill and collection emphasis |
| Collection Accent Text | `#F18F01` | Bright carrot text and icon tint for Collection navigation and management emphasis |
| Collection Accent Soft | `#FFE5BC` | Quiet collection emphasis |
| Collection Accent Line | `#F18F01` | Bright carrot borders or small secondary accent lines |
| Collection Accent Pressed | `#C66F00` | Darker carrot pressed fill for Collection card feedback and collection actions |
| On Collection Accent | `#17211B` | Text and icons on carrot-filled controls |
| Secondary | `#F18F01` | Alias for bright secondary text and action color |
| Processing | `#3525F5` | Analyzing, syncing, queued |
| Processing Soft | `#C0D6DF` | Quiet processing state surfaces |
| Processing Line | `#C0D6DF` | Processing state borders |
| Review | `#A05E00` | Needs review, maybe, action needed |
| Review Soft | `#FFE6BE` | Review callouts and changed suggestions |
| Danger | `#D13A2F` | Failed, destructive, could not save |
| Danger Soft | `#FFE1DA` | Quiet destructive state surfaces |
| Danger Line | `#F0A29A` | Destructive state borders |
| Deleted | `#D13A2F` | Destructive delete actions and pending-delete undo |

Rules:

- Use one dominant accent per screen.
- Do not use confidence percentages or red/yellow/green scoring.
- Pair color with text labels such as `Ready`, `Analyzing`, `Needs review`, `Failed`, or `Deleted`.
- Avoid pure black, pure white as the whole page background, purple gradients, glass effects, and decorative blobs.
- Header and bottom-navigation fades should use `Paper` and `Surface Container` stops so gradients stay within the warm light palette.
- Recent Captures, Collections, the Capture Review edit/detail plane, and the hero media matte around persisted imagery share the same `Paper` background. Use tonal containers only inside controls, media fallbacks, thumbnails, and pressed states.
- Treat available source imagery, thumbnails, screenshots, and shared image assets as product content. Use them for rows and Capture Review headers when already persisted; do not add decorative imagery or new extraction work only to fill space.

### Typography

- Use bundled Clash Display for page headers, section headers, sheet headers, Capture Review title headers, capture row titles, Collection titles, and card titles. Use medium-weight Clash for dense row/card titles and reserve heavier Clash cuts for page-level hierarchy. Use bundled Satoshi for body copy, metadata, inputs, buttons, navigation, labels, and non-title row content. Native system fonts remain the fallback when bundled families are unavailable. Avoid Inter as the primary product typeface.
- Page title: 28-30px, 800-900 weight, tight but readable line height.
- Section title: 17-19px, 700 weight.
- Row title: 17-18px, 600-700 weight, usually one line.
- Body: 15-16px, 21-23px line height.
- Metadata: 12-13px, muted, often 700 when used as a label.
- Inputs: at least 16px to avoid tiny mobile form text.
- Use sentence case for user-facing labels. Uppercase is acceptable only for compact metadata labels.
- Letter spacing should stay `0`.

### Iconography

- Use `phosphor-react-native` as the app icon family.
- Use `regular` weight for default outline icons, `bold` for compact tappable actions, and `fill` only for selected navigation, confirmed states, or compact status marks.
- Pair icon-only controls with accessible labels, and pair state color with icon shape or text.
- Avoid mixing icon families or custom SVG glyphs unless a Phosphor equivalent is unavailable.

### Spacing And Shape

- Use a compact spacing scale: 4, 8, 12, 16, 22 or 24, 32.
- Default horizontal screen padding: 22px unless a native component requires otherwise.
- Default radius: 8px. Segments may use 6px. Avoid large pill-heavy UI unless the element is truly a chip.
- Prefer spacing and tonal separation for lists. Do not use visible hairline borders or one-pixel dividers; use header gradients, tonal grouping, or soft surface changes when a boundary needs separation.
- Do not put cards inside cards.
- Prefer grouping and spacing before adding borders.

## Components

### Screen Shell

- Use safe areas on every screen, including Android status bar and bottom action areas.
- Put one screen title at the top. Avoid stacking multiple hero-like headings.
- Keep account, settings, or sign-out as small contextual actions, not primary workflow controls.
- Use the bottom app bar for top-level `Recent`, `Collections`, and contextual `Settings`, with a separate floating `+` beside the bar. On Recent it opens New Capture; on Collections it opens New Collection.
- Hide the bottom app bar on Search, Capture Review, collection detail, authentication, and modal-focused flows.
- Use a sticky bottom action only when the screen has one clear completion action.

### Lists And Rows

Capture rows should follow this order:

1. Title on the left, with operational status on the trailing edge only for analyzing or failed Captures.
2. Source and date/time metadata.
3. Optional icon-led meaning line for Save Intent, linked Collection, and Reminder when each value exists.

Rules:

- Rows should feel tappable without heavy card styling.
- Use separators or grouped surfaces, not thick borders.
- Keep row tap targets at least 44px high.
- Use stable row structure for `processing`, `ready`, `needs_review`, and `failed`; deleted rows disappear immediately with toast undo. Do not show a row glyph or review-colored source treatment for `needs_review`.
- Do not show model/provider details, analysis mode, confidence percentages, or generic `Analyzed` metadata in Recent Captures rows.
- Do not show analyzer rationale, summary prose, or note previews in Recents rows. Keep those details available in Capture Review and Search.
- When a Capture belongs to multiple Collections, rows should make that visible compactly, such as first Collection plus a quiet `+N` count, rather than rendering only one Collection or listing every Collection name.
- The bottom meaning line for Save Intent, Collection, and Reminder should read as muted metadata: keep its icons, text, and overflow count neutral rather than accent-colored.
- Group Recent Captures by recency with headers such as `Today`, `Yesterday`, `This week`, and `Earlier`.

### Chips

- Chips represent editable meaning: Save Intent, Collection, Reminder, source filter, or review state.
- Chips must have visible text and at least 44px effective height when interactive.
- Selected chips may use `Accent Soft` or `Ink`; unselected chips should use tonal fills and avoid hairline outlines.
- Long-press rationale is allowed, but the primary tap should still perform the obvious edit or selection.

### Buttons And Actions

- Primary buttons use `Accent` or `Ink` depending on context; they should be visually stable and bottom-reachable where possible.
- Secondary actions should often be text buttons or tonal buttons; avoid hairline-outline buttons.
- Destructive actions use danger text and should sit near the footer or object settings, not beside the main save action.
- Button copy should use direct verbs: `Save review`, `Retry analysis`, `Delete capture`, `Undo`, `Use collection`.

### Summary Cards

Cards are allowed only for bounded summaries or decisions:

- Capture receipt
- Weekly recap
- Existing collection assignment
- Reminder suggestion
- Link evidence notice

Each card should have one purpose, one short headline, one evidence line, and one primary action at most.

### Motion And Feedback

- Use restrained native-feeling transitions for opening Search, Capture Review, collection edit views, and reminder edit views.
- Use press feedback on rows, buttons, and chips. Recent Capture rows press with `Accent Pressed`; Collection cards press with `Collection Accent Pressed`.
- Use inline loading placeholders or skeleton rows for captures and search results; avoid full-screen spinners except during app boot.
- Use toast undo for reversible destructive or removal actions such as delete and collection removal.
- Use the shared tonal toast host for transient action feedback such as saved, copied, removed, undo, unavailable, and could-not-complete states. Toasts should be bottom-docked, tonal, borderless, icon-led, and should show tone through the icon/action accent rather than a colored card edge. Keep page-level load errors, authentication form errors, and field-level autosave state inline where they orient the current task.
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
- For collection-related empty states, state what will appear there and how it becomes useful.

### Authentication

- Authentication is a focused setup flow, not part of the authenticated app shell.
- Google sign-in and email magic link are the primary authentication methods.
- Google sign-in should use Supabase browser OAuth and the existing app callback link; do not add native Google SDK setup unless the product explicitly needs it.
- Email authentication should use one email field that sends a secure link for sign-in or account creation, then shows a `Check your email` confirmation state.
- The confirmation state should tell the user to open the link on the phone where Precious Captures is installed.
- Do not show password sign-in in the primary consumer flow unless the product explicitly reintroduces password setup.
- Tell users to use the same email with Google and email links so Supabase can keep one linked account.
- Auth errors should name the fix without exposing provider internals where possible.

### Recent Captures Home

- Home shows active Captures only, ordered by most recently captured.
- Deleted Captures are hidden from Recent Captures and Search immediately.
- Place a compact Search action in the top bar.
- Show the active capture count as quiet inline metadata beside `Recents`, not as a top kicker line or home review banner.
- Tapping Search opens full-screen Search.
- Rows should include source and date/time metadata, not only time.
- Extraction details should remain persisted and searchable without being rendered as audit metadata.
- Collections, Map, Agenda, and reminder modules should not appear as home sections. Collections lives in the bottom app bar; Map and Agenda remain deferred.

### Capture Intake

- Native share is the primary path and should stay silent after durable acceptance.
- In-app capture is a fallback. It should be compact and mode-based: Link and Note are text input modes, while Image opens the platform picker directly instead of showing a second in-sheet image button.
- In-app image upload should reuse the same image capture processing as the share sheet. It is capture content, not decoration, and should not add new provider-specific extraction rules by itself. Cancelling the picker should close the capture sheet and return to Recent Captures.
- Link-only captures that provide no useful public or user-supplied context should not become durable captures. Use source-agnostic copy: `Could not save this capture. The link did not provide enough context. Add a screenshot or note and try again.`
- Keyboard-open composer states must keep the sheet, active input, mode selector, close, and save action reachable on small Android phones.
- Treat typed link or note text as user content, not instructions. Do not add extra free-form context fields until prompt-injection hardening for capture text is explicit.
- The capture receipt should say the save happened immediately, then show analysis as background work, except for contextless link-only captures that are later rejected with clear not-saved copy.
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

### Review Decisions

Review decisions should explain the exact user action needed without adding review prompts to Recents or Search rows.

Use:

- `Review title`
- `Confirm reminder`
- `Choose collection`
- `Open link once`

Capture Review should read like a polished saved-memory edit surface, not a form. Use one compact editable sentence for Purpose, Collection, and Later, such as `Saved as [Purpose] in [Collection] for [Later]`: Purpose can be the primary semantic handle, while Collection and Later read as quieter inline metadata. Save Intent is optional; when no concrete action is inferable, show `Add intent` without creating review work.

Source host, timestamp, and source-copy affordances should read as neutral context, not Collection or reminder-colored emphasis.

`Purpose: Visit | Collection: NYC restaurants | Later: next Saturday afternoon`

The rail should feel embedded in the memory surface: use spacing, tonal separation, hierarchy, and pressed states rather than equal-weight stat cards, stark-white oversized pills, prose sentences, or boxed form rows.

Each control can expand into a focused picker or editor. Keep concise rationale visible only when it builds trust:

`Because the post mentions a SoHo ramen shop.`

Capture Review should show Purpose, Collection, and Later as one compact editable sentence directly under the title/source area. Treat AI-selected values as current values, not suggestions waiting for approval. Use a flat Material 3 Expressive treatment: black connective labels, darker green inline values, dark orange missing-value actions, warm tonal pill affordances, and comfortable touch targets rather than stark white pill cards, underlined text links, or a boxed field module. Tapping a field opens a focused bottom sheet editor for that field; show concise AI rationale inside that sheet only while the current value still matches the AI-selected value. Do not use inline review rows, `Looks good`, clear-suggestion actions, a separate Review Insight checklist sheet, nested cards, hero-sized rationale text, hidden-only long presses, duplicate blurbs, or model traces. Keep sheet actions clear of Android gesture navigation.

When reminders are not fully implemented, use `Later` for the main Capture Review control and `Reminder idea` only in rationale or detail surfaces for AI proposals. Do not use copy that implies notification delivery.

When a Capture has a maps-searchable Visit Target, Capture Review may show `Open in Maps` actions for Google Maps and Apple Maps. Treat this as a Maps search action from persisted Visit Target evidence, preferring the target name for launch when present, not a verified address, place ID, or top-level Map lens.

Uploaded image and screenshot Captures should treat the media header as inspectable content: tapping it opens a full-screen viewer with pinch zoom and a high-resolution uncropped viewer image. Link/source preview media may still open the saved source URL instead.

### Collection Management

Collections need an independent management surface so organization does not feel hidden inside Capture Review.

Use:

- Screen title: `Collections`
- Primary action: floating `+` opens `New collection`
- Row metadata: capture count, recent use, or short description when available
- Empty state: `Create a collection when a saved thing belongs somewhere specific.`

Rules:

- Keep Collection management secondary to Recent Captures and Search.
- Collections may be a top-level management destination, but it should not become the default home module.
- Empty accounts may start with a finite set of object-based starter Collections, such as recipes, movies and shows, restaurants, products, and articles or guides. They should look and behave like normal Collections, including delete with undo.
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

- Show title, description, capture count, and a destructive delete action.
- Open `New collection` from the Collections floating `+` as a focused bottom sheet using the same sheet treatment as New Capture.
- AI never creates or suggests new Collections. It may only attach high-confidence matches to existing active Collections.
- A Capture may intentionally have no Collection, and may belong to multiple Collections.
- Capture Review opens a focused bottom sheet selector for existing active Collections instead of an inline picker.
- The selector must include `No collection`, search, check states, and one sticky `Save collections` action.
- If the user removes or changes an AI-applied Collection, do not reattach it automatically.
- Do not show `Use suggestion`, inline Collection creation, or per-row `Manage` actions in Capture Review.
- Collection removal should offer immediate toast undo when feasible.
- Collection management is a top-level bottom-bar destination, but Recent Captures and Search remain the primary retrieval surfaces.

### Search

Search is a full-screen retrieval utility, not a chatbot default.

- Place a compact prominent Search action in the Recent Captures top bar that opens the full-screen Search lens.
- Results should explain why they matched: source, place, intent, collection, time, or remembered context.
- Filters should be chips or compact segments.
- Keep command-like filters optional and discoverable later.
- Search should match persisted extraction details such as entities, summary, Save Intent, collections, reminder suggestions, source URL, notes, and timestamps.
- Search should feel immediate: show local or keyword matches while semantic retrieval refines in the background.
- Use a compact activity cue near the Search input for background refinement; do not replace known results with skeleton rows.

### Reminders And Agenda

- Confirmed reminders are user-approved resurfacing triggers and should be first-class data when implemented.
- Suggested reminders are review items, not scheduled obligations.
- Capture Review should always offer a Later field when a capture can be edited. Show an AI Reminder idea as the current Later value when available; show `Add reminder` only when no reminder exists.
- Use review language only inside rationale or detail surfaces: `Reminder idea`, `Add reminder`, `Choose date and time`.
- A capture-local Confirmed Reminder should store a structured interval: start date, end date, optional start time, optional end time, timezone, date precision, time precision, and derived duration. Date ranges cover days or weeks; time ranges cover minutes or hours; if only time duration is present, start date and end date are the same. Location, venue, and proximity evidence belongs in Visit Targets and Maps actions, not Reminders.
- Do not imply notification delivery until notification delivery exists.
- Agenda is deferred until Confirmed Reminders function.

### Loading, Offline, And Sync

- Loading should be inline inside the section that is loading.
- Cached rows and known-empty states should render immediately while fresh data reloads in the background.
- The Recent Captures onboarding empty state should render only after the active feed has settled with an authoritative empty result; an empty array during cache hydration, app boot, or background fetch should stay in loading/quiet space.
- Skeleton rows are for cold unknown loads only and should appear immediately during authenticated app boot; they should not flash before an authoritative empty state.
- Preserve drafts during loading, sync, and app backgrounding.
- Offline states should offer useful local behavior where possible: save locally, retry, or sync later.
- Error messages should name the operation: `Could not save review`, `Could not load collections`, `Network connection dropped. Try again in a moment.`
- Loading, empty, error, and syncing states should be designed with the same visual care as populated states.

## Copy Rules

Use:

- `Saved`
- `Analyzing`
- `Looks right`
- `Maybe`
- `Not sure`
- `Couldn't tell`
- `Review later`
- `Move later`
- `Delete`

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
- Loading, empty, failed, delete-undo, and long-content states are designed.
- AI rationale is concise and user-facing; model/provider/debug details are hidden.
- Suggested reminders require confirmation, and new Collections require explicit user creation.
- The UI respects safe areas and bottom insets.
- No nested cards, decorative gradients, or dashboard-style density were introduced.
- Recent Captures rows include date/time metadata and hide audit-like extraction details.
- Recents and Search do not show review glyphs or home review banners; only analyzing and failed states get visible row status treatment.
- Search opens as a full-screen lens and can match persisted extraction details.
- Collections, Map, Agenda, and Upcoming are not primary navigation destinations for this pass.
- Collection removal offers immediate toast undo where feasible.
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
