# Use Recent Captures and Full-Screen Search as the Consumer App Shape

Status: accepted

Superseded in part by ADR 0005: Collections is now a top-level bottom app bar destination, while Recent Captures remains the default home and Search remains full-screen.

Precious is moving away from a dogfooding/audit-oriented UI toward a consumer memory surface. We will make `Recent Captures` the default home screen, showing active Captures in most-recently-captured order with rich consumer rows, and make Search a full-screen primary Retrieval Lens instead of an embedded list filter or chatbot. At the time of this decision, Upcoming, Library, Collections, Map, Agenda, Archived, and reminder modules were not top-level destinations because reminders were not yet functioning, collection browsing should not dominate the capture loop, and the strongest consumer wedge was polished search-first retrieval. ADR 0005 later promotes Collections as a top-level management destination.

## Considered Options

- `Upcoming` as default home: rejected for now because reminder functionality is not ready, and an Upcoming surface would imply a time-planning product that the app cannot yet deliver.
- `Captures / Collections` as top-level modes: rejected because it makes the app feel like an internal database or manual filing tool.
- Capture-only collection management: rejected because it hides user-owned organization inside a detail workflow and makes collection cleanup feel accidental.
- Embedded search field on the capture list: rejected because Search should feel like a primary, focused consumer retrieval experience.

## Consequences

- Home UI work should optimize Recent Captures, date/time grouping, rich rows, loading states, and motion.
- Search should be designed as its own full-screen surface and should use persisted extraction details without exposing audit metadata in home rows.
- Collections remain editable from Capture Review, and an independent secondary Collection management screen is in scope.
- Top-level Collection browsing as a primary retrieval destination remains out of scope for this pass; ADR 0005 later promotes Collections as a top-level management destination.
- Map and Agenda stay deferred; Agenda depends on first-class Confirmed Reminders.
- Reminder UI may be explored only where it can persist a user-approved value without implying notification delivery.
