import { jsonObject, stringValue } from "../common.ts";
import type { AnalysisOutput } from "../types.ts";
import { normalizedTimeReminderSuggestion } from "./review-normalization.ts";

function dateOnlyMs(value: string | null) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return NaN;
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
}

function referenceDateOnly(capturedAt: string | null | undefined) {
  const date = capturedAt ? new Date(capturedAt) : new Date();
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function isStaleReminder(
  reminder: Record<string, unknown>,
  capturedAt: string | null | undefined,
) {
  const referenceDate = referenceDateOnly(capturedAt);
  if (!referenceDate) return false;
  const endDate = stringValue(reminder.end_date) ||
    stringValue(reminder.date_window_end) ||
    stringValue(reminder.trigger_date) ||
    stringValue(reminder.start_date);
  if (!endDate) return false;
  return dateOnlyMs(endDate) < dateOnlyMs(referenceDate);
}

function noReminderRationale(reviewRationale: unknown) {
  const rationale = jsonObject(reviewRationale);
  return {
    ...rationale,
    reminder:
      "No Reminder idea was saved because the extracted timing was stale or inconsistent.",
  };
}

export function validateReminderIdeas(
  analysis: AnalysisOutput,
  capturedAt: string | null | undefined,
) {
  const reminders = Array.isArray(analysis.suggested_reminders)
    ? analysis.suggested_reminders
    : [];
  if (!reminders.length) return analysis;

  const kept = [];
  for (const reminder of reminders) {
    const normalized = normalizedTimeReminderSuggestion(reminder);
    if (normalized && !isStaleReminder(normalized, capturedAt)) {
      kept.push(normalized);
    }
  }
  if (kept.length === reminders.length) {
    return { ...analysis, suggested_reminders: kept };
  }
  return {
    ...analysis,
    suggested_reminders: kept,
    review_rationale: kept.length
      ? analysis.review_rationale
      : noReminderRationale(analysis.review_rationale),
    review_targets: Array.isArray(analysis.review_targets)
      ? analysis.review_targets.filter((target) => target !== "reminder")
      : analysis.review_targets,
  };
}
