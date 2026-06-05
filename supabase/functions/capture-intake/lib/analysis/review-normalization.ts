import {
  activeSaveIntentKeySet,
  NO_CLEAR_INTENT_RATIONALE,
} from "../config.ts";
import { finiteNumber, jsonObject, stringValue } from "../common.ts";
import type { AnalysisOutput } from "../types.ts";
import { sanitizeAnalysisRationales } from "./rationales.ts";
import { normalizeVisitTargetFields } from "./visit-targets.ts";
import { normalizedLocationContext } from "./capture-roles.ts";

export function confidenceRequiresReview(value: unknown) {
  return value === "Maybe" || value === "Not sure" ||
    value === "Couldn't tell";
}

export const reviewTargetKeys = [
  "analysis",
] as const;
const reviewTargetSet = new Set<string>(reviewTargetKeys);
const reminderDatePrecisions = new Set([
  "exact",
  "day",
  "date_range",
  "week",
  "month_window",
  "month",
  "unknown",
]);
const reminderTimePrecisions = new Set(["exact", "time_range", "unknown"]);
const reminderDurationUnits = new Set(["minutes", "hours", "days", "weeks"]);

export function normalizedReviewTargets(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const seen = new Set<string>();
  const targets: string[] = [];
  for (const item of value) {
    const target = stringValue(item) || "";
    if (!reviewTargetSet.has(target) || seen.has(target)) continue;
    seen.add(target);
    targets.push(target);
  }
  return targets;
}

function analysisHasReviewTargets(analysis: Record<string, unknown>) {
  return Object.prototype.hasOwnProperty.call(analysis, "review_targets");
}

export function reviewTargetsForAnalysis(
  analysis: Record<string, unknown>,
  reviewConfirmedAt?: unknown,
) {
  if (reviewConfirmedAt) return [] as string[];
  if (analysisHasReviewTargets(analysis)) {
    return normalizedReviewTargets(analysis.review_targets);
  }
  return analysis.needs_review ? ["analysis"] : [];
}

export function resolveReviewTargets(
  analysis: Record<string, unknown>,
  resolvedTargets: string[],
  reviewConfirmedAt?: unknown,
) {
  const resolved = new Set(resolvedTargets);
  const reviewTargets = reviewTargetsForAnalysis(analysis, reviewConfirmedAt)
    .filter((target) => !resolved.has(target));
  return {
    ...analysis,
    review_targets: reviewTargets,
    needs_review: reviewTargets.length > 0,
  };
}

export function analysisRequiresReview(
  analysis: Record<string, unknown>,
  reviewConfirmedAt?: unknown,
) {
  return reviewTargetsForAnalysis(analysis, reviewConfirmedAt).length > 0;
}

export function activeIntentCategory(value: unknown) {
  const category = stringValue(value);
  return category && activeSaveIntentKeySet.has(category) ? category : null;
}

export function normalizedDefaultIntent(analysis: Record<string, unknown>) {
  const defaultIntent = jsonObject(analysis.default_intent);
  const category = activeIntentCategory(defaultIntent.category);
  return {
    category,
    confidence: category ? finiteNumber(defaultIntent.confidence) : 0,
    rationale: stringValue(defaultIntent.rationale) ||
      (category ? "" : NO_CLEAR_INTENT_RATIONALE),
  };
}

function validReminderDate(value: string | null) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function validReminderTime(value: string | null) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function dateTimeMs(date: string, time = "00:00") {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) return NaN;
  return Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
  );
}

function normalizedReminderDuration(value: unknown) {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

function normalizedReminderDurationUnit(value: unknown) {
  const unit = stringValue(value);
  return unit && reminderDurationUnits.has(unit) ? unit : null;
}

function normalizedReminderDateWindow(value: unknown, fallback: string) {
  const date = stringValue(value);
  return date && validReminderDate(date) ? date : fallback;
}

function normalizedReminderDatePrecision(
  value: unknown,
  startDate: string,
  endDate: string,
) {
  const precision = stringValue(value);
  if (precision && reminderDatePrecisions.has(precision)) return precision;
  return startDate === endDate ? "exact" : "date_range";
}

function normalizedReminderTimePrecision(
  value: unknown,
  startTime: string | null,
  endTime: string | null,
) {
  const precision = stringValue(value);
  if (precision && reminderTimePrecisions.has(precision)) return precision;
  if (startTime && endTime) return "time_range";
  if (startTime) return "exact";
  return "unknown";
}

function normalizedFieldRationales(analysis: Record<string, unknown>) {
  const fieldRationales = jsonObject(analysis.field_rationales);
  const defaultIntent = normalizedDefaultIntent(analysis);
  const purpose = jsonObject(fieldRationales.purpose);
  const reminder = jsonObject(fieldRationales.reminder);
  const collections = Array.isArray(fieldRationales.collections)
    ? fieldRationales.collections.map((item) => {
      const record = jsonObject(item);
      return {
        collection_id: stringValue(record.collection_id) || null,
        selection_label: stringValue(record.selection_label) || null,
        text: stringValue(record.text) || null,
      };
    }).filter((item) => item.collection_id && item.selection_label)
    : [];
  return {
    purpose: {
      selection_key: activeIntentCategory(purpose.selection_key) ||
        defaultIntent.category,
      selection_label: stringValue(purpose.selection_label) || null,
      text: stringValue(purpose.text) || null,
    },
    collections,
    reminder: {
      trigger_value: stringValue(reminder.trigger_value) || null,
      start_date: stringValue(reminder.start_date) || null,
      end_date: stringValue(reminder.end_date) || null,
      start_time: stringValue(reminder.start_time) || null,
      end_time: stringValue(reminder.end_time) || null,
      text: stringValue(reminder.text) || null,
    },
  };
}

export function normalizedTimeReminderSuggestion(value: unknown) {
  const record = jsonObject(value);
  if (!Object.keys(record).length || record.trigger_type !== "time") {
    return null;
  }
  const startDate = stringValue(record.start_date) ||
    stringValue(record.trigger_date) ||
    stringValue(record.date_window_start);
  const endDate = stringValue(record.end_date) ||
    stringValue(record.date_window_end) ||
    startDate;
  if (
    !startDate ||
    !endDate ||
    !validReminderDate(startDate) ||
    !validReminderDate(endDate) ||
    dateTimeMs(endDate) < dateTimeMs(startDate)
  ) {
    return null;
  }
  const startTime = stringValue(record.start_time) ||
    stringValue(record.trigger_time) ||
    null;
  const endTime = stringValue(record.end_time) || null;
  if (
    (startTime && !validReminderTime(startTime)) ||
    (endTime && !validReminderTime(endTime)) ||
    (!startTime && endTime) ||
    (startTime && endTime &&
      dateTimeMs(endDate, endTime) <= dateTimeMs(startDate, startTime))
  ) {
    return null;
  }
  const triggerValue = stringValue(record.trigger_value) ||
    (startDate === endDate ? startDate : `${startDate}-${endDate}`);
  const durationUnit = normalizedReminderDurationUnit(record.duration_unit);
  return {
    ...record,
    trigger_type: "time",
    trigger_value: triggerValue,
    trigger_text: stringValue(record.trigger_text),
    start_date: startDate,
    end_date: endDate,
    start_time: startTime,
    end_time: endTime,
    trigger_date: startDate,
    date_window_start: normalizedReminderDateWindow(
      record.date_window_start,
      startDate,
    ),
    date_window_end: normalizedReminderDateWindow(
      record.date_window_end,
      endDate,
    ),
    date_precision: normalizedReminderDatePrecision(
      record.date_precision,
      startDate,
      endDate,
    ),
    trigger_time: startTime,
    time_precision: normalizedReminderTimePrecision(
      record.time_precision,
      startTime,
      endTime,
    ),
    timezone: stringValue(record.timezone),
    duration: durationUnit ? normalizedReminderDuration(record.duration) : null,
    duration_unit: durationUnit,
    rationale: stringValue(record.rationale) ||
      "The capture includes a future date or time.",
    confidence: finiteNumber(record.confidence),
  };
}

export function normalizedTimeReminderSuggestions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizedTimeReminderSuggestion(item))
    .filter((item) => item !== null);
}

export function analysisWithCurrentIntent(
  analysis: Record<string, unknown>,
  currentSaveIntent: unknown,
) {
  if (typeof currentSaveIntent !== "string" && currentSaveIntent !== null) {
    return analysis;
  }
  const defaultIntent = jsonObject(analysis.default_intent);
  return {
    ...analysis,
    default_intent: {
      ...defaultIntent,
      category: currentSaveIntent,
      confidence: currentSaveIntent
        ? finiteNumber(defaultIntent.confidence)
        : 0,
      rationale: currentSaveIntent
        ? stringValue(defaultIntent.rationale) || "The user chose this intent."
        : "The user left this capture without an intent.",
    },
  };
}

export function normalizedReviewAnalysis(
  analysis: Record<string, unknown>,
  reviewConfirmedAt?: unknown,
): AnalysisOutput {
  const sanitized = sanitizeAnalysisRationales(analysis);
  const normalizedAnalysis = {
    ...sanitized,
    default_intent: normalizedDefaultIntent(sanitized),
    field_rationales: normalizedFieldRationales(sanitized),
    location_context: normalizedLocationContext(sanitized.location_context),
    suggested_reminders: normalizedTimeReminderSuggestions(
      sanitized.suggested_reminders,
    ),
  };
  const reviewTargets = normalizedReviewTargets(
    reviewTargetsForAnalysis(normalizedAnalysis, reviewConfirmedAt),
  );
  return {
    ...normalizedAnalysis,
    ...normalizeVisitTargetFields(normalizedAnalysis),
    review_targets: reviewTargets,
    needs_review: reviewTargets.length > 0,
  };
}
