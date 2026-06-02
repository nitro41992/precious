# 0011 Capture-local Confirmed Reminders

## Status

Accepted

## Context

Capture Analysis can suggest Reminder ideas, but the product trust model says reminders require explicit user action. At the same time, Capture Review needs a manual `Add reminder` path even when analysis does not find a future trigger. Notification delivery and Agenda remain deferred, so the product needs durable reminder data without implying that a notification has been scheduled.

## Decision

Capture Review will always expose a `Reminder` edit row for editable captures. Tapping it opens a native-feeling editor for a calendar-like interval: start date, end date, optional start time, and optional end time. The UI shows a computed duration instead of making duration units the primary control. Capture-local Reminders and AI Reminder ideas are time intervals only; location, venue, address, and proximity evidence stays in Visit Targets and Maps actions.

AI Reminder ideas may prefill the editor through structured extraction fields: `start_date`, `end_date`, `start_time`, `end_time`, `date_precision`, `time_precision`, and `timezone`. Legacy compatibility fields such as `trigger_date`, `trigger_time`, `date_window_start`, `date_window_end`, `duration`, and `duration_unit` are derived from the same interval. Vague phrases such as "early July" are represented as date windows, for example July 1 through July 10. Time-only durations keep `start_date` and `end_date` equal. Missing AI fields remain editable blanks or defaults. Saving the editor persists a capture-local Confirmed Reminder in `analysis.suggested_reminders` with `status: confirmed`.

This does not schedule notification delivery and does not make Agenda a primary surface.

## Consequences

- Users can create a reminder manually even when Capture Analysis returns no Reminder idea.
- Reminder data is durable and searchable before the notification system exists.
- The backend validates the start/end interval and derives duration compatibility fields rather than reparsing reminder prose.
- The backend drops non-time Reminder ideas so legacy place or proximity reminders do not appear in Capture Review.
- Future notification delivery can consume Confirmed Reminders without reinterpreting AI rationale text.
