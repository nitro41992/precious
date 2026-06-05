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

function reminderText(reminder: Record<string, unknown>) {
  return [
    reminder.trigger_value,
    reminder.trigger_text,
    reminder.rationale,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function analysisText(analysis: AnalysisOutput) {
  const rationale = jsonObject(analysis.review_rationale);
  const defaultIntent = jsonObject(analysis.default_intent);
  return [
    analysis.display_title,
    analysis.summary,
    Array.isArray(analysis.search_phrases)
      ? analysis.search_phrases.join(" ")
      : "",
    defaultIntent.rationale,
    ...(Array.isArray(analysis.collection_decisions)
      ? analysis.collection_decisions.map((decision) => jsonObject(decision).rationale)
      : []),
    rationale.intent,
    rationale.collections,
    rationale.reminder,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isGenericCadenceAdvice(reminder: Record<string, unknown>) {
  const text = reminderText(reminder);
  if (!text) return false;
  const cadence =
    /\b(review|check|revisit|visit|look|come|return)\b.{0,40}\b(monthly|weekly|regularly|often|soon|periodically|from time to time)\b/i
      .test(text) ||
    /\b(monthly|weekly|regular)\b.{0,40}\b(review|check|revisit|visit|look|return)\b/i
      .test(text);
  if (!cadence) return false;
  return !/\b(deadline|due|ends?|expires?|sale|event|concert|show|festival|workshop|class|booking|reservation|release|launch|opens?|closes?|appointment|ticket|presale)\b/i
    .test(text);
}

function isBroadDirectoryReminder(
  reminder: Record<string, unknown>,
  analysis: AnalysisOutput,
) {
  const text = `${analysisText(analysis)} ${reminderText(reminder)}`;
  if (!/\b(events?|dated|calendar|schedule)\b/i.test(text)) return false;
  return /\b(directory|homepage|home page|index|feed|profile|calendar|many unrelated|multiple unrelated|statewide|state-wide|broad list|listing page)\b/i
    .test(text);
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
    if (!normalized) {
      continue;
    }
    if (isStaleReminder(normalized, capturedAt)) {
      continue;
    }
    if (isBroadDirectoryReminder(normalized, analysis)) {
      continue;
    }
    if (isGenericCadenceAdvice(normalized)) {
      continue;
    }
    kept.push(normalized);
  }
  if (kept.length === reminders.length) {
    return { ...analysis, suggested_reminders: kept };
  }
  return {
    ...analysis,
    suggested_reminders: kept,
  };
}
