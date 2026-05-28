# Use Recent Captures and Full-Screen Search as the Consumer App Shape

Status: accepted

Precious is moving away from a dogfooding/audit-oriented UI toward a consumer memory surface. We will make `Recent Captures` the default home screen, showing active Captures in most-recently-captured order with rich consumer rows, and make Search a full-screen primary Retrieval Lens instead of an embedded list filter or chatbot. We will not make Upcoming, Library, Collections, Map, Agenda, Archived, or reminder modules top-level destinations in this revamp because reminders are not yet functioning, collection browsing should not dominate the capture loop, and the strongest consumer wedge is polished search-first retrieval.

## Considered Options

- `Upcoming` as default home: rejected for now because reminder functionality is not ready, and an Upcoming surface would imply a time-planning product that the app cannot yet deliver.
- `Captures / Collections` as top-level modes: rejected because it makes the app feel like an internal database or manual filing tool.
- Embedded search field on the capture list: rejected because Search should feel like a primary, focused consumer retrieval experience.

## Consequences

- Home UI work should optimize Recent Captures, date/time grouping, rich rows, loading states, and motion.
- Search should be designed as its own full-screen surface and should use persisted extraction details without exposing audit metadata in home rows.
- Collections remain editable from Capture Review, but top-level collection browsing is out of scope for this pass.
- Map and Agenda stay deferred; Agenda depends on first-class Confirmed Reminders.
- Reminder UI may be explored only where it can persist a user-approved value without implying notification delivery.
