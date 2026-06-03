# Capture Prompt and Pipeline Improvements

This note tracks candidate improvements found during eval review. It is
separate from the README so the core workflow stays compact and prompt changes
do not accumulate as one-off instructions.

## Guiding Principle

Prefer short reusable rules, Collection descriptions, and targeted tests over
case-by-case prompt prose. Promote a pattern into the prompt or reranker only
when repeated review evidence shows that the current pipeline misses it.
Production prompt and reranker rules must not hard-code the eval starter
Collection set. Collections are dynamic, user-defined objects, so the analyzer
should reason from the retrieved Collection titles and descriptions. Named
Collection examples below are eval boundary tests and description-tuning notes,
not a fixed product taxonomy.

## Cross-Cutting Takeaways

The remaining iffy rows point to one overarching prompt/pipeline rule: classify
the saved value of the capture before matching Collections. Source shape,
platform, domain, and incidental keywords are weaker evidence than the reason a
user would keep the item.

Prompt and reranker should stay compact and dynamic:

- First identify the capture role from evidence: shopping, place visit,
  activity/event attendance, trip planning, learning/reference, visual
  inspiration, or project execution.
- Match that role to retrieved user Collection titles and descriptions. Select
  a secondary Collection only when it represents an independent saved value,
  not merely because the page is article-shaped or mentions a topic.
- Prefer conservative Collection assignment when the page is a broad directory,
  profile, feed, or roundup. These surfaces often contain many topics, places,
  products, or dates without making all of them primary.
- Keep deterministic validation outside the prompt where possible: reminders
  require one coherent future action, and travel/local reasoning needs
  structured location context.
- Add boundary tests before expanding prompt prose. If a distinction can be
  handled by clearer Collection descriptions, reranker features, or a validator,
  prefer that over another prompt instruction.

## Candidate Improvements

### Instructional Secondary Collections

Observed rows:

- `cap_93faca7672f5`: Expo web PreviewDrop tutorial.
- `cap_b4ace5bebdfc`: Snap Lens Studio Creator Mode documentation.
- `cap_7ed5e9e35a30`: travel planning checklist/logistics guide.

Current behavior:

- Precious selected the strong topical Collection, `Software & Apps`.
- Precious missed `Articles & Guides` even though the source was explicitly a
  tutorial, setup guide, documentation, or reference page.

Recommendation:

- For the eval starter set, `Articles & Guides` can be a strong secondary when
  the guide, checklist, tutorial, setup walkthrough, reference page, or
  explanatory framing is central to why the item is worth saving.
- In production, generalize this through the retrieved Collection description:
  if a user-defined Collection explicitly covers guides, tutorials, references,
  or how-tos, it can be selected as a secondary alongside a strong topical
  Collection.
- Do not select a guide/reference Collection merely because a page is
  article-shaped.

Likely implementation:

- Add one concise dynamic rule to collection reranking and final extraction:
  when a retrieved Collection explicitly describes guides, tutorials,
  checklists, reference, or how-tos, it can be selected as a secondary if that
  instructional framing is central to the capture.
- Prefer improving the relevant Collection description if the same distinction
  can be made there without adding more prompt surface area.
- Add focused tests before expanding prompt language further.

Boundary tests:

- Expo/PreviewDrop tutorial -> `Software & Apps` + `Articles & Guides`.
- Snap Creator Mode documentation -> `Software & Apps` + `Articles & Guides`.
- Travel planning checklist/logistics guide -> `Travel & Trips` +
  `Articles & Guides`.
- Vacation meal-planning guide -> `Travel & Trips` + `Articles & Guides`, not
  `Recipes`.
- Coffee shop brochure templates -> `Design Inspiration`; do not force
  `Articles & Guides` unless the page is primarily an instructional design
  guide.
- Generic SaaS landing page -> `Software & Apps`, not `Articles & Guides`.
- Ranked product list or shopping roundup -> `Products`, not
  `Articles & Guides`, unless it contains substantial non-shopping instruction.

### Plan vs Learn for Logistics Guides

Observed rows:

- `cap_7ed5e9e35a30`: a step-by-step travel planning article with budget,
  booking, dates, hotels, itinerary, packing, and document logistics.

Recommendation:

- Prefer `plan` over `learn` when an instructional guide is primarily useful
  for arranging a future trip, event, booking, schedule, checklist, or admin
  workflow.
- Keep `learn` for understanding concepts, methods, or skills where the next
  action is comprehension rather than arranging logistics.

Boundary tests:

- Trip planning checklist with bookings/dates/itinerary -> `plan`.
- Conceptual travel advice without concrete logistics -> `learn`.
- Product ranking or buying roundup with prices and buy links -> `buy`, usually
  `Products` only.
- Software setup tutorial -> `learn`, unless it is primarily a project/admin
  checklist with follow-through dates or handoffs.

### Location Context for Travel vs Local Place Lists

Observed rows:

- `cap_e02e7f5f80ef`: Minneapolis food and drink Instagram post framed as a
  travel itinerary.
- `cap_0504805f0db7`: single restaurant review in Orange Beach with travel
  wording, but little destination-planning value beyond the restaurant.
- `cap_d1833c92ae26`: single Corgi Cafe recommendation in Barcelona with
  travel-vlog wording, but still primarily a cafe visit.

Current behavior:

- Precious selected `visit` and `Restaurants & Cafes`, which is right for the
  named dining places.
- The harder boundary is whether `Travel & Trips` should be added when a place
  list is outside the user's normal location or explicitly framed as a trip.
- Current eval scores are probably over-comforting here: `visit_target` and
  location-only no-Reminder checks can be high while structured location
  extraction and local-vs-travel reasoning remain untested.

Recommendation:

- Keep the current eval decision grounded in source evidence: explicit phrases
  like "travel itinerary", "travel guide", destination hashtags, or trip
  planning language can justify `Travel & Trips` as a secondary Collection
  when the actual substance helps plan the destination or trip, not merely when
  the content uses travel wording around a single place.
- Plan a product/pipeline feature that uses user location or current trip
  context to distinguish local saved places from travel planning captures. A
  restaurant list near the user may remain only `Restaurants & Cafes`; a
  restaurant list in another city may also fit `Travel & Trips`.
- Treat this as a context feature, not a prompt-only fix. User location is
  private, may be unavailable, and should not be inferred from the source page
  alone.
- Prefer privacy-preserving location context: explicit home city, current trip
  context, or coarse opt-in location is enough for Collection reasoning. Avoid
  continuous precise tracking unless a separate user-facing feature clearly
  needs it.

Eval gap:

- The current scored eval has `visit_target` as a primary metric and `entities`
  as a secondary set metric. That tests whether the system names a visitable
  place, but it does not separately score extracted city, region, country,
  address, coordinates, source destination, or distance from the user's normal
  location.
- Coverage groups such as `location_only`, `google_maps_location`, and
  location-only no-Reminder checks are useful proxies, but they do not validate
  local-vs-travel Collection decisions.
- Add structured expected fields for location evaluation before relying on this
  behavior in score gates, such as `place_name`, `address`, `city`, `region`,
  `country`, `coordinates`, `is_destination_away_from_user`, and
  `travel_context_reason`.

Boundary tests:

- Explicit "Minneapolis travel itinerary" restaurant list with multiple saved
  stops ->
  `Restaurants & Cafes` + `Travel & Trips`.
- Single restaurant review or menu walkthrough, even with travel wording ->
  `Restaurants & Cafes`.
- Nearby/local restaurant list with no trip framing -> `Restaurants & Cafes`.
- Out-of-town restaurant list with user location available and different from
  the destination -> consider `Restaurants & Cafes` + `Travel & Trips`.

### Home & DIY vs Design Inspiration

Observed rows:

- `cap_535b0887d75f`: Pottery Barn shoppable bedroom furniture/styling post.
- `cap_f3e2747760ec`: Cathie Hong kitchen project post with materials,
  millwork, countertops, pantry, before photos, and source tags.
- `cap_54a0683132a8`: Lucy Gleeson Interiors Pinterest profile/moodboards.

Recommendation:

- For production prompts, do not hard-code interior-specific Collection names.
  Distinguish the capture's role: shoppable/product-led, visual inspiration, or
  project execution.
- Select the retrieved Collection whose title/description matches that role.
  If a user has only one broad interiors Collection, one match may be enough.
  If they have separate inspiration, product, and project Collections, choose
  only the strong independent fits.
- Do not attach a project/execution Collection merely because content shows a
  home or interior. The deciding question is whether the saved thing helps
  execute a home project, not merely admire or buy a look.

Boundary tests:

- Shoppable furniture styling post -> `Products` + `Design Inspiration`, not
  `Home & DIY`.
- Interior designer project post with materials/source details/before photos ->
  `Design Inspiration` + `Home & DIY`.
- Pinterest interiors profile or moodboard page -> `Design Inspiration`, not
  `Home & DIY`.

### Visual Inspiration Can Have No Save Intent

Observed rows:

- `cap_f3e2747760ec`: visual kitchen design post.
- `cap_54a0683132a8`: interiors Pinterest profile/moodboards.

Recommendation:

- Leave Save Intent blank when a capture is mainly visual inspiration or a
  moodboard/profile and no active action is clear.
- Do not force `read` or `learn` merely because the source is a page, post, or
  profile. Collections can carry the durable value when the user likely saved
  the item as aesthetic reference.

Boundary tests:

- Visual interiors post with no instructions -> blank Save Intent +
  `Design Inspiration`.
- Explicit tutorial/design method article -> `learn`.
- Product-led interior post with clear shopping cue -> `buy`.

### Broad Event Directories Should Not Create Reminders

Observed rows:

- `cap_010cd4e7819c`: JamBase homepage with many unrelated concert and
  festival dates.
- `cap_cd4ae15691fa`: VisitNC events directory with many unrelated event dates.

Recommendation:

- Do not create a Reminder for a broad homepage, index, or directory that lists
  many unrelated dated events.
- Suggest a Reminder only when the capture centers on one event, deadline, or a
  coherent bounded event window.
- For Collections, reason from the retrieved descriptions: a live-event
  attendance Collection can fit a concert directory, while a media/listening
  Collection should not be selected unless the saved content is about listening,
  podcasts, albums, playlists, music reviews, or media consumption rather than
  attendance.

Boundary tests:

- JamBase-style homepage with many unrelated dates -> no Reminder.
- VisitNC-style state-wide events directory -> no Reminder.
- Specific concert/event page -> Reminder when future date/time is clear.
- Festival page with one named date range -> one Reminder for that range.

### Reminder Advice Is Not a Reminder

Observed rows:

- `cap_f0a97fd446a8`: Matinee watchlist guide with general advice to review a
  watchlist regularly.

Recommendation:

- Do not create a Reminder from generic advice such as "review monthly",
  "check back often", "visit soon", or similar editorial cadence language.
- Suggest a Reminder only when the source gives a concrete user-relevant date,
  deadline, release, sale end, event time, reservation window, or bounded future
  interval.

Boundary tests:

- Movie watchlist article recommending monthly review -> no Reminder.
- Sale page with explicit future end date -> Reminder.
- Single event page with date and time -> Reminder.

### Source Shape and Mentions Are Weak Collection Evidence

Observed rows:

- `cap_0415b8bff1bf`: shopping article/list about Nordstrom summer trends.
- `cap_e44b94136f19`: Meta StackOverflow Q&A mentioning software sites and
  programming examples.
- `cap_f3a58b506284`: Clickteam tutorial PDF.

Recommendation:

- A product roundup or shopping list should favor a product/shopping Collection
  and `buy` intent. Do not add a guide/reference Collection merely because the
  source is an article.
- Do not select a software/tool Collection merely because the source domain,
  forum, or examples mention software. The saved purpose should be about a
  software tool, app, workflow, or technical task.
- Distinguish tutorial/reference documents from courses or classes. Select a
  class/course Collection only when the page offers enrollment, curriculum,
  lesson series, workshop, or class-like instruction.

Boundary tests:

- Product ranking or shopping roundup with buy links -> `buy` and product
  Collection; no guide Collection unless instruction is independently central.
- StackOverflow/meta Q&A about site policy -> guide/reference Collection, not
  software/tool Collection.
- Software tutorial PDF -> guide/reference + software/tool Collections.
- Standalone tutorial PDF -> not a class/course Collection unless course-like
  evidence is present.

## Deferred Until Repeated

Keep one-off or ambiguous review decisions here until there is enough evidence
to justify prompt or pipeline changes. This prevents diminishing returns from
overloading the prompt with narrow examples.
