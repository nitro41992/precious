import { adminClient } from "../supabase.ts";

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// Maps a capture's analysis to normalized calendar-event rows. Pure: structured-field copy only,
// no semantic interpretation. By the time analysis is persisted, suggested_reminders are already
// normalized (valid YYYY-MM-DD dates, HH:mm times) by review-normalization, so we trust the
// fields and only defensively re-validate shape.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

const DATE_PRECISIONS = new Set([
  "exact",
  "day",
  "date_range",
  "week",
  "month_window",
  "month",
  "unknown",
]);
const TIME_PRECISIONS = new Set(["exact", "time_range", "unknown"]);
const DURATION_UNITS = new Set(["minutes", "hours", "days", "weeks"]);

function validDate(value: string) {
  return DATE_RE.test(value);
}

function validTime(value: string) {
  const match = TIME_RE.exec(value);
  if (!match) return false;
  return Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

export type CaptureEventRow = {
  user_id: string;
  capture_id: string;
  title: string;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  duration: number | null;
  duration_unit: string | null;
  date_precision: string;
  time_precision: string;
  timezone: string | null;
  source: "analysis";
  status: "detected";
  reminder_index: number;
};

export function eventRowsFromAnalysis(
  userId: string,
  captureId: string,
  analysis: Record<string, unknown> | null | undefined,
  captureTitle: string,
): CaptureEventRow[] {
  const reminders = Array.isArray(analysis?.suggested_reminders)
    ? analysis!.suggested_reminders as Array<Record<string, unknown>>
    : [];
  const rows: CaptureEventRow[] = [];
  reminders.forEach((reminder, index) => {
    if (!reminder || typeof reminder !== "object") return;
    if (str(reminder.trigger_type) !== "time") return;
    const startDate = str(reminder.start_date);
    if (!validDate(startDate)) return; // a calendar event needs a real anchor day
    const endDateRaw = str(reminder.end_date);
    const endDate = validDate(endDateRaw) ? endDateRaw : startDate;
    const startTimeRaw = str(reminder.start_time);
    const startTime = validTime(startTimeRaw) ? startTimeRaw : null;
    const endTimeRaw = str(reminder.end_time);
    const endTime = startTime && validTime(endTimeRaw) ? endTimeRaw : null;
    const datePrecisionRaw = str(reminder.date_precision);
    const datePrecision = DATE_PRECISIONS.has(datePrecisionRaw) ? datePrecisionRaw : "exact";
    const timePrecisionRaw = str(reminder.time_precision);
    const timePrecision = TIME_PRECISIONS.has(timePrecisionRaw) ? timePrecisionRaw : "unknown";
    const durationUnitRaw = str(reminder.duration_unit);
    const durationUnit = DURATION_UNITS.has(durationUnitRaw) ? durationUnitRaw : null;
    const durationValue = Number(reminder.duration);
    const duration = durationUnit && Number.isFinite(durationValue) && durationValue > 0
      ? durationValue
      : null;
    const title = (captureTitle || str(reminder.trigger_value) || "Event").slice(0, 200);
    rows.push({
      user_id: userId,
      capture_id: captureId,
      title,
      start_date: startDate,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime,
      all_day: !startTime,
      duration: duration && durationUnit ? duration : null,
      duration_unit: duration ? durationUnit : null,
      date_precision: datePrecision,
      time_precision: timePrecision,
      timezone: str(reminder.timezone) || null,
      source: "analysis",
      status: "detected",
      reminder_index: index,
    });
  });
  return rows;
}

// Re-syncs the calendar's analysis-sourced events for a single capture to mirror its current
// analysis. Replaces only rows still in the 'detected' state, preserving any the user has since
// confirmed or dismissed (keyed by reminder_index) so re-analysis can never clobber a user's
// calendar edit — and never touching their manual events (source='manual'). Callers wrap this in
// try/catch so a calendar write never fails capture processing.
export async function syncDetectedCaptureEvents(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  captureId: string,
  analysis: Record<string, unknown> | null | undefined,
  captureTitle: string,
): Promise<void> {
  const existing = await supabase
    .from("capture_events")
    .select("reminder_index,status")
    .eq("user_id", userId)
    .eq("capture_id", captureId)
    .eq("source", "analysis");
  if (existing.error) throw existing.error;
  // Reminder slots the user has already confirmed/dismissed — leave these frozen.
  const preserved = new Set(
    (existing.data ?? [])
      .filter((row) => row.status !== "detected")
      .map((row) => row.reminder_index),
  );

  const deletion = await supabase
    .from("capture_events")
    .delete()
    .eq("user_id", userId)
    .eq("capture_id", captureId)
    .eq("source", "analysis")
    .eq("status", "detected");
  if (deletion.error) throw deletion.error;

  const rows = eventRowsFromAnalysis(userId, captureId, analysis, captureTitle)
    .filter((row) => !preserved.has(row.reminder_index));
  if (!rows.length) return;
  const insertion = await supabase.from("capture_events").insert(rows);
  if (insertion.error) throw insertion.error;
}
