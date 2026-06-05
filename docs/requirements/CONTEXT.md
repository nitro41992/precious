# Sharebook

Sharebook is an AI save layer for links, screenshots, posts, and notes. It preserves the user's reason for saving something so the capture can be found, understood, and acted on later.

## Language

**Capture**:
A saved screenshot, link, social post, note, or shared item that may contain people, places, things, and intent.
_Avoid_: Bookmark, link, item

**Capture Type**:
The form in which a Capture entered Sharebook, such as link, screenshot, social post, image, text note, voice note, email, location pin, or browser session.
_Avoid_: Source, category

**Save Intent**:
An optional action signal for what the saved thing clearly supports, such as watch, read, visit, buy, cook, make, do, plan, or learn. Save Intent should not duplicate Collection topic or project grouping, and it may be blank when Capture evidence does not support a concrete action.
_Avoid_: Summary, tag, category

Save Intent precedence keeps labels from overlapping: learn over read for instructional material; do over visit for scheduled activities or routines; visit for concrete places; plan for logistics or future arrangements; buy for concrete purchase targets; cook for food preparation; make for created artifacts.

**Default Intent**:
The Save Intent Sharebook assigns when Capture Analysis finishes and the user does not apply One-Tap Correction or add a Context Note. Default Intent may be blank when no active Intent Category is clearly inferable.
_Avoid_: Unconfirmed tag, uncategorized

**Intent Category**:
A small canonical Save Intent option used for Default Intent assignment and One-Tap Correction. Intent Categories should stay action-oriented and finite: watch, read, visit, buy, cook, make, do, plan, and learn.
_Avoid_: Tag taxonomy, folder structure

**Captured Entity**:
A person, place, product, event, media object, concept, or other meaningful thing extracted from a Capture.
_Avoid_: Keyword, tag

**Visit Target**:
A maps-searchable candidate extracted from Capture evidence when the Capture appears to reference a real-world venue, business, restaurant, shop, park, hotel, event venue, or other place the user may want to visit. A Visit Target stores a name, search query, confidence state, evidence, and `verified_place: false` unless the server-side Places resolver attaches a Resolved Place. It may power Google Maps or Apple Maps search links without becoming a canonical place record.
_Avoid_: Verified location, place ID, address, map pin

**Resolved Place**:
A server-verified Google Places result attached to a Visit Target when the Places lookup finds a confident exact match. A Resolved Place may store a durable Google place ID plus refreshable display snapshots such as name, address, coordinates, Maps URI, and photo attribution. Google photo bytes are not stored as app media; Capture responses may include a short-lived thumbnail URL.
_Avoid_: AI-invented address, permanent copied Places photo, top-level Map destination

**Structured Location Context**:
Internal extraction detail for explicit place and destination evidence, such as a place name, address, city, region, country, coordinates when provided, source destination framing, and coarse local-vs-travel reasoning when user context explicitly supports it. It helps eval and future travel/local Collection reasoning without becoming a verified place record, Map pin, location history, or continuous precise tracking feature.
_Avoid_: Location tracking, verified place, GPS history

**Platform Evidence**:
Optional source-specific details preserved from the capture surface, such as creator, caption, transcript, comment text, collection name, sender, post type, or URL metadata.
_Avoid_: Required platform metadata, full integration data

**Public URL Evidence Enrichment**:
Backend-only retrieval of public evidence for a known Capture URL when local metadata is weak, such as HTML/oEmbed failure, generic platform metadata, public PDFs, JavaScript-heavy pages, or shortlinks. Enriched evidence is normalized into `url_evidence` with provider provenance and cache behavior. It is not client-side scraping, private-content access, broad web search, or a source of gold labels.
_Avoid_: Client enrichment, private scraping, topic search, label truth

**Explicit Capture**:
A user-initiated act of adding something to Sharebook through share sheet, upload, paste, drag-and-drop, or manual entry.
_Avoid_: Automatic import, background scraping

**Capture Receipt**:
The immediate acknowledgement that Sharebook has accepted an Explicit Capture before analysis is complete. A Capture Receipt may be shown in-app for fallback capture surfaces, but native share capture can be silent when the Capture is accepted durably.
_Avoid_: Processing result, final save state

**Capture Analysis**:
The background process that uses content evidence, Platform Evidence, Visual Understanding, and Capture Context to infer Captured Entities and Save Intent. Source app, host, and format are fallback evidence only when content and context are limited.
_Avoid_: Upload, OCR pass, summary generation

**Analysis State**:
The visible lifecycle of Capture Analysis for a Capture, such as queued, processing, ready, partial, failed, or needs review.
_Avoid_: Loading flag, spinner state

**Capture Surface**:
An interface where the user creates an Explicit Capture, such as a mobile share extension, Android share target, upload form, paste box, drag-and-drop area, or manual entry.
_Avoid_: Importer, scraper

**Review Inbox**:
The surface where users triage Captures and suggestions that need lightweight decisions, such as low-confidence intent, One-Tap Correction, Context Notes, suggested Reminders, failed analysis, and Quick Edit actions. Review Inbox may use segments or tabs, but it should remain one surface rather than separate suggestion queues.
_Avoid_: Bookmark list, folder, separate suggestions inbox

**Capture Review**:
The focused single-Capture surface opened from a Capture Completion Notification, Review Inbox, Search, or Library. It shows extracted intent, entities, Reminder suggestions, existing Collection attachments, human-readable Confidence States, concise rationale, and Quick Edit controls.
_Avoid_: Analysis report, debug view, model score screen

**Inline Field Rationale**:
A concise, analyzer-authored user-facing explanation shown next to the specific Purpose, Collection, or Later suggestion in Capture Review. It should point to the exact field decision and reference active Intent Categories, existing Collection names, No intent, No collection, or Reminder idea rather than loose analyzer labels. Backend validation may reject unsafe, debug-like, source-only, generic, or malformed rationale; fallback copy should be neutral practical guidance rather than synthesized rationale from titles or summaries. It is evidence/rationale, not hidden model reasoning.
_Avoid_: Chain-of-thought, audit report, model trace, confidence percentage

**Retrieval Lens**:
A user-facing view over Captures and related entities that helps the user find saved things by a primary access pattern, such as meaning, place, time, or recency. Recent Captures, Search, Map, Agenda, Library, and Review Inbox are Retrieval Lenses, not separate saved object types.
_Avoid_: Item type, folder, separate app

**Recent Captures**:
The default home Retrieval Lens that shows active Captures in most-recently-captured order, with Search as the primary action for retrieval. Deleted Captures are hidden immediately and are not part of Recent Captures or Search.
_Avoid_: Upcoming, daily dashboard, activity feed, productivity homepage

**Upcoming**:
An optional Retrieval Lens that surfaces saved things when they become relevant across days or weeks, such as upcoming Reminders, unresolved review needs, time-relevant Captures, or place cues. Upcoming should not imply the user has something to do in Sharebook every day; when unsupported by reminder functionality, it should not be treated as the default home surface.
_Avoid_: Daily dashboard, activity feed, productivity homepage

**Map**:
A deferred Retrieval Lens that shows Captures associated with place-like Captured Entities, such as restaurants, venues, stores, hotels, trip ideas, or event locations. High-confidence captured places may appear on Map automatically, while uncertain places should go to Review Inbox before appearing as normal pins. Map should not show where the user happened to be when saving unless that location is part of the Capture's meaning.
_Avoid_: Location history, check-in map, GPS trail

**Agenda**:
A deferred Retrieval Lens for time-relevant Captures and Confirmed Reminders. Agenda depends on functioning Confirmed Reminders; without them, it should not be treated as a primary navigation surface. Confirmed Reminders appear as scheduled agenda items, while unconfirmed reminder suggestions or date-like Captures should go to a review inbox rather than becoming obligations.
_Avoid_: Calendar replacement, automatic schedule, notification queue

**Library**:
The Retrieval Lens hub for browsing saved Captures by recency, place, time, and Collection. Library should feel like organized memory rather than a filing cabinet or power-user database.
_Avoid_: Folder tree, deleted-item dump, database browser

**Search**:
A full-screen fuzzy-memory Retrieval Lens for finding Captures by meaning, entity, Save Intent, Collection, place, time, source, or remembered context. Search may use persisted Searchable Extraction Detail and command-like filters for Collections, entities, intent, Map, and Agenda, but it should not default to a generic chat assistant or remain a small embedded field on the Recent Captures home lens.
_Avoid_: Chatbot, database query builder, tag search

**Searchable Extraction Detail**:
Analysis-derived Capture data that remains persisted and available to Search, such as extracted entities, summary, Save Intent, Platform Evidence, Collection links, Reminder suggestions, Structured Location Context, source URL, and timestamps. Searchable Extraction Detail may improve retrieval without appearing as audit metadata in the Recent Captures row.
_Avoid_: Debug metadata, visible model output, analysis report

**Capture Context**:
The surrounding signals available when a Capture is created, such as source app, share text, screenshot content, timestamp, collection name, sender, calendar context, travel context, location, or a one-tap correction.
_Avoid_: Metadata, note

**Capture Role**:
An internal non-user-facing analysis signal for the durable reason a Capture was likely saved, such as shopping, place visit, event attendance, trip planning, learning/reference, visual inspiration, project execution, media to watch/listen to, or other. Capture Role helps Collection retrieval and reranking reason from saved value before matching dynamic user-owned Collection titles and descriptions. It is not a user-visible taxonomy and should not replace Save Intent or Collections.
_Avoid_: User tag, Collection name, Save Intent category

**Analyzer Context**:
A bounded set of relevant prior Captures, Reminders, Collections, and preference signals made available to Capture Analysis so Sharebook can interpret the current Capture without reading the user's full history.
_Avoid_: Raw history, memory dump, prompt history

**Quiet Confidence**:
Sharebook's trust posture for AI output: quietly persist low-risk, reversible decisions while asking before creating interruptions, obligations, or new organizational structures. Default Intent and high-confidence attachment to an existing Collection may persist and remain editable; Confirmed Reminders and new Collections require explicit user acceptance.
_Avoid_: Autopilot, always ask, confidence score UI

**Confidence State**:
A stored confidence label for an AI prediction, expressed as Looks right, Maybe, Not sure, or Couldn't tell rather than a numeric score. Confidence States support future quality work and may inform internal analysis, but field uncertainty alone should not create user-visible review work.
_Avoid_: Confidence percentage, model score, probability

**Product Language Token**:
A consumer-facing label that may change without changing the domain model, such as the app name, Confidence State labels, or UI state names. Product Language Tokens should be centralized in product copy or design tokens rather than treated as canonical domain terms.
_Avoid_: Hardcoded brand copy, domain object name

**One-Tap Correction**:
An optional lightweight user action that confirms or changes the inferred Save Intent without requiring typing.
_Avoid_: Required tagging, manual categorization

**Suggested Action**:
An optional next step proposed after Save Intent is inferred or corrected, such as setting a Reminder, opening a map, sending to a person, adding to a trip, or marking done.
_Avoid_: Intent chip, category chip

**Context Note**:
Optional free text added by the user when One-Tap Correction is not expressive enough.
_Avoid_: Required rationale, mandatory note

**Quick Edit**:
A compact post-capture amendment that reads like an editable sentence with tappable chips for optional Save Intent, suggested Reminder, Collection attachment, and optional Context Note. Captured Entities may appear as supporting context, but Quick Edit is not the primary entity-editing surface.
_Avoid_: Gamification, tagging workflow, command language, entity editor, correction form

**Visual Understanding**:
Interpretation of screenshot or image content as people, places, things, scenes, UI state, and implied meaning.
_Avoid_: OCR, image text extraction

**Intent Graph**:
The lightweight network of Captures, Captured Entities, Capture Context, and Save Intents that explains what the user saved and why it may matter later.
_Avoid_: Knowledge graph, database, collection

**Collection**:
A user-owned grouping of Captures that share a concrete subject or ongoing purpose, such as recipes, movies to watch, restaurants, products, a trip, a research topic, an event, or a project. Collections may be explicitly user-created or product-seeded starter Collections for empty accounts. A Capture may intentionally have no Collection and may belong to multiple Collections.
_Avoid_: Folder, plan

**Collection Suggestion**:
An internal AI match from a Capture to one or more existing active Collections. Collection Suggestions match the Capture's subject or purpose before source app, host, or format; source is fallback evidence only when content and context are limited. High-confidence matches may be quietly applied because they are finite and reversible. AI must not create, name, or surface new Collections, and lower-confidence matches should not become Capture Review work.
Secondary Collection Suggestions should require a strong independent subject or purpose fit and should reason from the user's available Collection titles and descriptions rather than a fixed taxonomy. Guide-shaped Captures may also match a guide/reference Collection when the guide, checklist, template, or explanatory framing is central, but incidental examples inside a guide should not trigger their own topical Collections. Product rankings, shopping roundups, and list-style buying guides should usually remain in the user's product/shopping Collection when one exists unless they include substantial non-shopping instruction. Single-place restaurant reviews or menu walkthroughs should usually remain in the user's dining/place Collection when one exists; travel Collection fit requires destination or trip-planning value beyond the dining place itself.
_Avoid_: Required filing, folder audit, automatic new Collection, free-form collection name

**Reminder**:
A first-class prompt to resurface one or more Captures at a specific date, time, deadline, or time window. Capture-local Reminders are not place or proximity triggers; place evidence belongs to Visit Targets and Map actions.
_Avoid_: Notification setting, capture property

**Reminder Suggestion**:
An AI-proposed time-based resurfacing idea for a Capture. Reminder Suggestions are not Confirmed Reminders and must not notify until the user explicitly accepts or edits them.
Reminder Suggestions require one coherent future event, deadline, sale end, reservation window, release, appointment, or bounded interval. Broad directories, feeds, profiles, calendars, or indexes with many unrelated dated items should not create a Reminder Suggestion, and generic advice such as "review monthly" or "check back often" is not a Reminder Suggestion by itself.
_Avoid_: Automatic reminder, scheduled obligation, AI nudge

**Confirmed Reminder**:
A Reminder that the user explicitly created or accepted from a suggestion. A Confirmed Reminder has a user-approved trigger and should be persisted even before notification delivery or Agenda is implemented. Capture-local Confirmed Reminders store a structured interval: start date, end date, optional start time, optional end time, timezone, date precision, time precision, and a derived duration for compatibility. If only a time range is present, the start and end date are the same.
_Avoid_: AI nudge, automatic notification

**Reminder Rationale**:
The short reason shown with a Reminder that explains why the Capture is being resurfaced, derived from Save Intent, Capture Context, or Context Note.
_Avoid_: Generic notification text, AI nudge

**Capture Status Notification**:
A compact per-Capture notification that reflects Capture Analysis lifecycle, similar to a transfer notification. It can update from a processing state to a processed state, using terse copy such as "Capture processed" and either "Extraction looks good" or "Extraction needs review."
_Avoid_: Feed item, marketing notification, analysis summary

**Capture Completion Notification**:
A Capture Status Notification in its processed state. It should stay compact: "Capture processed" plus "Extraction looks good" or "Extraction needs review." Looks-good completions should be quiet or minimized by default; needs-review completions may alert because they need user attention. It is not a Reminder and does not create a future notification obligation.
_Avoid_: Reminder, AI nudge, engagement notification

**Review CTA**:
The stronger call to action on a Capture Completion Notification when the processed state is "Extraction needs review" because a Capture has Maybe, Not sure, or Couldn't tell Confidence States, failed or partial analysis, or suggestions that require user acceptance. Review CTA opens Capture Review.
_Avoid_: Mandatory review, engagement prompt, generic open app

**Capture State**:
The user's lifecycle state for a Capture, such as active or pending deletion.
_Avoid_: Folder, category

**Reschedule**:
The action of moving an existing Reminder to a later date, time, or time window after it has fired or before it is due.
_Avoid_: Re-remind

## Example Dialogue

Product: "The user saved this Instagram reel, but the transcript only says it is about ramen."

Domain Expert: "That is the content summary, not the Save Intent. The Save Intent might be 'try this restaurant next time I am in SoHo'."

Product: "So the Capture should keep the reel, the restaurant, the neighborhood, the creator, and the inferred reason?"

Domain Expert: "Yes. The user should later be able to search 'that ramen place near SoHo' or open its Visit Target in maps, while any Reminder stays tied to a date or time window."

Product: "Do we need to normalize every possible field from Instagram, TikTok, Reddit, YouTube, and Maps?"

Domain Expert: "No. Normalize the Capture, Captured Entities, Save Intent, and Reminder. Preserve source-specific details as Platform Evidence when available, but do not make complete platform metadata a product requirement."

Product: "Should Sharebook pull everything the user has saved inside other apps?"

Domain Expert: "Not at first. Sharebook should begin with Explicit Capture through share sheet, upload, paste, drag-and-drop, or manual entry."

Product: "Should saving wait until AI processing is complete?"

Domain Expert: "No. Sharebook should accept native share Captures silently and durably, then run Capture Analysis in the background. In-app fallback capture surfaces may show a Capture Receipt, but the follow-up review moment should come from Capture Completion Notification or Review Inbox."

Product: "What happens if the user closes the app after capture?"

Domain Expert: "The Capture must survive app closure. Capture Analysis should continue in the backend or resume from a durable queue, and the Review Inbox should show the Analysis State when the user returns."

Product: "What happens if the user dismisses the receipt sheet or ignores the correction chips?"

Domain Expert: "Sharebook should save the Capture with its Default Intent. Correction is optional, not a prerequisite for saving."

Product: "Where should the MVP live?"

Domain Expert: "Start with a mobile-first Capture Surface through the phone share workflow and a Review Inbox for correction, search, and reminders."

Product: "How many intent choices should users see?"

Domain Expert: "Keep Intent Categories small and action-oriented: watch, read, visit, buy, cook, make, do, plan, and learn. If none of those actions is supported by the Capture evidence, leave intent blank and ask for a quick look instead of inventing a broad category."

Product: "Should the user have to explain the reason while saving?"

Domain Expert: "No. Sharebook should infer Save Intent from Capture Context first, then allow One-Tap Correction or an optional Context Note when the guess is wrong or incomplete."

Product: "Can Capture Analysis look at everything the user has saved before?"

Domain Expert: "No. Use Analyzer Context: a bounded, relevant set of prior signals. The point is to improve interpretation, not to paste the user's whole history into every analysis."

Product: "Are the save-intent chips the same as action chips?"

Domain Expert: "No. One-Tap Correction changes why Sharebook thinks the user saved the Capture. Suggested Actions come after that and help the user act on the Capture."

Product: "Is this a knowledge graph?"

Domain Expert: "Call it an Intent Graph. The point is not to model all knowledge; the point is to preserve what the user cared about and the action it may support."

Product: "Should trips or projects become Plans?"

Domain Expert: "No. Use Collections to link related Captures. A trip, research topic, or purchase decision can be a Collection without becoming a first-class Plan."

Product: "What should a reminder feel like?"

Domain Expert: "A Reminder should say what is resurfacing and why the user wanted it, not just ping that something might be relevant."

Product: "What if a Capture is no longer active but should remain searchable?"

Domain Expert: "Delete the Capture. It should leave active surfaces immediately with a short Undo window, then become eligible for hard purge with associated extracted data and assets."
