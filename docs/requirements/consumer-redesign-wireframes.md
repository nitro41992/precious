# Sharebook Consumer Redesign Wireframes

These are low-fidelity product wireframes for shared understanding. They describe structure and flow, not final visual style.

## 1. Zero-Capture Upcoming

Purpose: turn an empty product into the first successful Capture.

```text
Upcoming
--------------------------------------------------

Save something for when it matters later

[ Share from another app ]        primary

[ Paste link ]  [ Add note ]  [ Upload image ]

How it works
Saved things come back by meaning, place, or time.

Recent
No captures yet
```

Notes:

- The primary action teaches native share.
- Fallback actions are available without burying the user.
- No fake feed, fake examples, or dashboard metrics.

## 2. Capture Sheet

Purpose: in-app fallback capture, not the main native share path.

```text
Capture
--------------------------------------------------

Copied link found
https://www.nps.gov/yose/planyourvisit/reservations.htm

[ Save copied link ]

or

[ Paste link or text............................ ]

[ Add note ]
[ Upload screenshot or photo ]

First time?
Share from Instagram, TikTok, Maps, Safari, or Photos.
```

Notes:

- Smart paste detection should reduce effort.
- First-run share help can disappear after activation.

## 3. Capture Receipt

Purpose: prove the save happened immediately for in-app fallback capture surfaces. Native share does not need to foreground this screen by default.

```text
Saved to Sharebook
--------------------------------------------------

Restaurant reel
instagram.com/...

Analyzing in background
[ progress line ]

[ Done ]
[ Quick edit ]        optional, not required
```

Notes:

- The receipt is not the final analysis result.
- User can leave immediately.
- Android native share, and later iOS share extension capture, should silently accept the Capture and rely on completion notification or Review Inbox for follow-up review.

## 4. Background Progress And Completion

Purpose: silent native-share handoff with compact per-capture status.

```text
Processing notification
--------------------------------------------------
Sharebook
Processing capture
Ramen reel from Instagram

Processed notification, looks good
--------------------------------------------------
Sharebook
Capture processed
Extraction looks good

Processed notification, needs review
--------------------------------------------------
Sharebook
Capture processed
Extraction needs review

Tap opens
--------------------------------------------------
Capture Review
AI extraction Confidence States, rationale, and Quick Edit
```

Notes:

- Completion notification is not a Reminder.
- The notification should stay terse, like a transfer status. Extraction details belong in Capture Review.
- Extraction looks good can be quiet or minimized; Extraction needs review may alert.
- Review CTA is reserved for low-confidence or user-actionable suggestions.
- Notification permission can be requested after first successful Capture.

## 5. Quick Edit

Purpose: make correction feel like editing meaning, not filling a form.

```text
Saved
--------------------------------------------------

Ramen reel from Instagram

Saved as [ try this place ] in [ NYC restaurants ].

Reminder suggested: [ next Saturday afternoon ].

Because: restaurant and neighborhood found in the reel.

[ Accept ]        [ Change ]        [ Dismiss ]

View details
```

Expanded chip behavior:

```text
Saved as
[ visit ] [ cook ] [ do ] [ plan ]

Collection
[ Choose existing collections ]

Reminder
[ Accept Saturday ] [ Change time ] [ No reminder ]
```

Notes:

- Default surface is sentence-like.
- Chips can expand into small pickers.
- Entities support the decision but are not the editing task.

## 6. Upcoming With One Capture

Purpose: show the app becoming useful after activation without implying daily use.

```text
Upcoming
--------------------------------------------------

Needs a quick look
[ Ramen reel ]
try this place | reminder suggested | NYC restaurants

Recently saved
[ Ramen reel ]  Ready

Across days
No confirmed reminders

Nearby or places
1 saved place
```

Notes:

- Upcoming combines review needs and relevant resurfacing across days or weeks.
- Inbox can appear as a badge or module, not necessarily a bottom tab.

## 7. Library

Purpose: organized memory, not a filing cabinet.

```text
Library
--------------------------------------------------

[ All ] [ Map ] [ Agenda ] [ Collections ] [ Archived ]

All
--------------------------------------------------
[ Ramen reel ]        try this place
[ Chair screenshot ]  buy
[ Article ]           read
```

Map lens:

```text
Library / Map
--------------------------------------------------

[ map ]

Saved places near view
[ Ramen place, SoHo ]   1 capture
[ Hotel idea ]          2 captures
```

Agenda lens:

```text
Library / Agenda
--------------------------------------------------

Confirmed
Saturday
[ Try ramen place ]     confirmed reminder

Suggestions
[ Concert poster has date ]   review
```

Notes:

- Map shows captured places, not location history.
- Agenda shows confirmed reminders separately from suggestions.

## 8. Search

Purpose: fuzzy-memory retrieval and power filtering.

```text
Search
--------------------------------------------------

[ that ramen place near soho.................... ]

Filters
[ Intent ] [ Collection ] [ Entity ] [ Place ] [ Time ]

Results
--------------------------------------------------
[ Ramen reel ]
Matched place: SoHo
Intent: try this place
Source: Instagram

[ NYC restaurants collection ]
3 captures
```

Command-like examples:

```text
intent:try place
collection:NYC restaurants
place:SoHo
time:next weekend
entity:ramen
```

Notes:

- Search starts as a search box with explainable results.
- Commands are filters, not a chatbot default.
