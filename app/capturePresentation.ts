import {
  BookOpen,
  CalendarDays,
  Image as ImageIcon,
  Link2,
  MapPin,
  ShoppingBag,
  StickyNote
} from "lucide-react-native";

import saveIntents from "../supabase/functions/_shared/save-intents.json";
import type {
  AuthCallbackPayload,
  Capture,
  CaptureReviewDraft,
  Collection,
  CollectionDecision,
  HomeListRow,
  LinkedCollection,
  LucideIconComponent,
  ReminderDatePrecision,
  ReminderDurationUnit,
  ReminderScheduleDraft,
  ReminderSuggestion,
  ReminderTimePrecision,
  ReviewChecklistTask,
  ReviewInsight,
  ReviewRationale,
  ReviewTarget,
  UrlEvidence
} from "./types";
import {
  confidenceRequiresReview,
  displayStatus,
  extractHttpUrl,
  hostFromUrl,
  isArchived,
  normalizeIntent as normalizeKnownIntent,
  reviewTargetsForCapture,
  statusLabel,
  uniqueCapturesByIdentity
} from "./captureLogic";

type SaveIntentConfig = {
  key: string;
  label: string;
  llm_description: string;
  active: boolean;
};

export const INTENT_CONFIG = (saveIntents as SaveIntentConfig[]).filter((intent) => intent.active);
export const INTENT_OPTIONS = INTENT_CONFIG.map((intent) => intent.key);
export const INTENT_LABELS = new Map(INTENT_CONFIG.map((intent) => [intent.key, intent.label]));
export const ADD_INTENT_LABEL = "Add intent";

export const AUTH_CALLBACK_URL = "preciouscaptures://auth/callback";

export const SEARCH_PROMPTS = [
  { label: "Places", query: "places", Icon: MapPin },
  { label: "Links from yesterday", query: "links from yesterday", Icon: Link2 },
  { label: "Things to read", query: "things to read", Icon: BookOpen },
  { label: "Products", query: "products", Icon: ShoppingBag },
  { label: "Travel ideas", query: "travel ideas", Icon: CalendarDays }
];

export function formatDateTime(value: number) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export const REMINDER_DURATION_UNITS: ReminderDurationUnit[] = ["minutes", "hours", "days", "weeks"];
export const DEFAULT_REMINDER_DURATION = 30;
export const DEFAULT_REMINDER_DURATION_UNIT: ReminderDurationUnit = "minutes";

export function isoDateText(value: number | null | undefined) {
  if (!value) return "";
  try {
    return new Date(value).toISOString();
  } catch {
    return "";
  }
}

export function humanize(value: string | undefined) {
  if (!value) return "";
  const intentLabel = INTENT_LABELS.get(value);
  if (intentLabel) return intentLabel;
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function normalizeIntent(value: string | undefined) {
  return normalizeKnownIntent(value, INTENT_OPTIONS);
}

export function activeIntentLabel(value: string | undefined) {
  return value ? INTENT_LABELS.get(value) || "" : "";
}

export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function dateStringFromDate(value: Date) {
  return `${value.getFullYear()}-${padDatePart(value.getMonth() + 1)}-${padDatePart(value.getDate())}`;
}

export function timeStringFromDate(value: Date) {
  return `${padDatePart(value.getHours())}:${padDatePart(value.getMinutes())}`;
}

export function dateFromReminderParts(dateText: string | null | undefined, timeText?: string | null) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateText || ""));
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(String(timeText || ""));
  const now = new Date();
  if (!dateMatch) {
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      timeMatch ? Number(timeMatch[1]) : now.getHours(),
      timeMatch ? Number(timeMatch[2]) : 0
    );
  }
  return new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    timeMatch ? Number(timeMatch[1]) : 9,
    timeMatch ? Number(timeMatch[2]) : 0
  );
}

export function reminderDateLabel(dateText: string | null | undefined) {
  if (!dateText) return "";
  const date = dateFromReminderParts(dateText);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" })
  });
}

export function reminderTimeLabel(dateText: string | null | undefined, timeText: string | null | undefined) {
  if (!timeText) return "";
  return dateFromReminderParts(dateText, timeText).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

export function reminderDurationUnitLabel(unit: ReminderDurationUnit) {
  switch (unit) {
    case "hours":
      return "Hours";
    case "days":
      return "Days";
    case "weeks":
      return "Weeks";
    default:
      return "Minutes";
  }
}

export function reminderDurationLabel(
  duration: number | null | undefined,
  unit: ReminderDurationUnit | null | undefined,
  compact = true
) {
  const value = Number(duration);
  if (!Number.isFinite(value) || value <= 0 || !unit) return "";
  if (compact) {
    const suffix = unit === "minutes" ? "min" : unit === "hours" ? "hr" : unit;
    return `${value} ${value === 1 && unit !== "minutes" ? suffix.replace(/s$/, "") : suffix}`;
  }
  const label = value === 1 ? unit.replace(/s$/, "") : unit;
  return `${value} ${label}`;
}

function validReminderDateText(value: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return false;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1]) &&
    date.getMonth() === Number(match[2]) - 1 &&
    date.getDate() === Number(match[3]);
}

function validReminderTimeText(value: string | null | undefined) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function dateTextValue(value: string | null | undefined) {
  return validReminderDateText(value) ? String(value) : "";
}

function timeTextValue(value: string | null | undefined) {
  return validReminderTimeText(value) ? String(value) : "";
}

function compareDateText(left: string, right: string) {
  return dateFromReminderParts(left).getTime() - dateFromReminderParts(right).getTime();
}

function timeTextMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function addMinutesToTimeText(value: string, minutes: number) {
  const startMinutes = timeTextMinutes(value);
  if (startMinutes === null || !Number.isFinite(minutes) || minutes <= 0) return "";
  const nextMinutes = startMinutes + minutes;
  if (nextMinutes >= 24 * 60) return "";
  return `${padDatePart(Math.floor(nextMinutes / 60))}:${padDatePart(nextMinutes % 60)}`;
}

export function reminderIntervalDuration(
  startDate: string,
  endDate: string,
  startTime?: string | null,
  endTime?: string | null
): { duration: number; durationUnit: ReminderDurationUnit } {
  const safeStartDate = dateTextValue(startDate);
  const safeEndDate = dateTextValue(endDate) || safeStartDate;
  const safeStartTime = timeTextValue(startTime);
  const safeEndTime = timeTextValue(endTime);
  if (safeStartDate && safeEndDate && safeStartTime && safeEndTime) {
    const start = dateFromReminderParts(safeStartDate, safeStartTime).getTime();
    const end = dateFromReminderParts(safeEndDate, safeEndTime).getTime();
    const minutes = Math.max(1, Math.round((end - start) / (60 * 1000)));
    if (minutes % (7 * 24 * 60) === 0) {
      return { duration: minutes / (7 * 24 * 60), durationUnit: "weeks" };
    }
    if (minutes % (24 * 60) === 0) {
      return { duration: minutes / (24 * 60), durationUnit: "days" };
    }
    if (minutes % 60 === 0) {
      return { duration: minutes / 60, durationUnit: "hours" };
    }
    return { duration: minutes, durationUnit: "minutes" };
  }
  if (safeStartDate && safeEndDate) {
    const days = Math.max(
      1,
      Math.round(
        (dateFromReminderParts(safeEndDate).getTime() - dateFromReminderParts(safeStartDate).getTime()) /
          (24 * 60 * 60 * 1000)
      ) + 1
    );
    if (days % 7 === 0) return { duration: days / 7, durationUnit: "weeks" };
    return { duration: days, durationUnit: "days" };
  }
  return { duration: DEFAULT_REMINDER_DURATION, durationUnit: DEFAULT_REMINDER_DURATION_UNIT };
}

const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTH_NAMES = new Map(
  [
    ["jan", 0],
    ["january", 0],
    ["feb", 1],
    ["february", 1],
    ["mar", 2],
    ["march", 2],
    ["apr", 3],
    ["april", 3],
    ["may", 4],
    ["jun", 5],
    ["june", 5],
    ["jul", 6],
    ["july", 6],
    ["aug", 7],
    ["august", 7],
    ["sep", 8],
    ["sept", 8],
    ["september", 8],
    ["oct", 9],
    ["october", 9],
    ["nov", 10],
    ["november", 10],
    ["dec", 11],
    ["december", 11]
  ].map(([name, index]) => [name, index as number])
);

function meridiemTimeText(hourText: string, minuteText: string | undefined, meridiem: string) {
  let hour = Number(hourText);
  const minute = Number(minuteText || "0");
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    return "";
  }
  const normalizedMeridiem = meridiem.toLowerCase();
  if (normalizedMeridiem === "pm" && hour < 12) hour += 12;
  if (normalizedMeridiem === "am" && hour === 12) hour = 0;
  return `${padDatePart(hour)}:${padDatePart(minute)}`;
}

function reminderTimeFromText(value: string) {
  const text = value.replace(/[–—]/g, "-").toLowerCase();
  const range = reminderTimeRangeFromText(text);
  if (range.startTime) return range.startTime;
  const meridiemMatch = /\b([1-9]|1[0-2])(?::([0-5]\d))?\s*(am|pm)\b/i.exec(text);
  if (meridiemMatch) {
    return meridiemTimeText(meridiemMatch[1], meridiemMatch[2], meridiemMatch[3]);
  }
  const twentyFourHourMatch = /(?:^|[^\d])([01]?\d|2[0-3]):([0-5]\d)(?:[^\d]|$)/.exec(text);
  if (!twentyFourHourMatch) return "";
  return `${padDatePart(Number(twentyFourHourMatch[1]))}:${twentyFourHourMatch[2]}`;
}

function reminderTimeRangeFromText(value: string): {
  startTime: string;
  endTime: string;
  timePrecision: ReminderTimePrecision;
} {
  const text = value.replace(/[–—]/g, "-").toLowerCase();
  const meridiemRange = /\b([1-9]|1[0-2])(?::([0-5]\d))?\s*(am|pm)?\s*(?:-|to)\s*([1-9]|1[0-2])(?::([0-5]\d))?\s*(am|pm)\b/i
    .exec(text);
  if (meridiemRange) {
    const endMeridiem = meridiemRange[6];
    const startMeridiem = meridiemRange[3] || endMeridiem;
    return {
      startTime: meridiemTimeText(meridiemRange[1], meridiemRange[2], startMeridiem),
      endTime: meridiemTimeText(meridiemRange[4], meridiemRange[5], endMeridiem),
      timePrecision: "time_range"
    };
  }
  const twentyFourHourRange = /(?:^|[^\d])([01]?\d|2[0-3]):([0-5]\d)\s*(?:-|to)\s*([01]?\d|2[0-3]):([0-5]\d)(?:[^\d]|$)/i
    .exec(text);
  if (twentyFourHourRange) {
    return {
      startTime: `${padDatePart(Number(twentyFourHourRange[1]))}:${twentyFourHourRange[2]}`,
      endTime: `${padDatePart(Number(twentyFourHourRange[3]))}:${twentyFourHourRange[4]}`,
      timePrecision: "time_range"
    };
  }
  const meridiemMatch = /\b([1-9]|1[0-2])(?::([0-5]\d))?\s*(am|pm)\b/i.exec(text);
  if (meridiemMatch) {
    return {
      startTime: meridiemTimeText(meridiemMatch[1], meridiemMatch[2], meridiemMatch[3]),
      endTime: "",
      timePrecision: "exact"
    };
  }
  const twentyFourHourMatch = /(?:^|[^\d])([01]?\d|2[0-3]):([0-5]\d)(?:[^\d]|$)/.exec(text);
  if (twentyFourHourMatch) {
    return {
      startTime: `${padDatePart(Number(twentyFourHourMatch[1]))}:${twentyFourHourMatch[2]}`,
      endTime: "",
      timePrecision: "exact"
    };
  }
  return { startTime: "", endTime: "", timePrecision: "unknown" };
}

function nextWeekdayDate(weekdayIndex: number, referenceDate: Date, forceFollowingWeek: boolean) {
  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);
  let delta = (weekdayIndex - date.getDay() + 7) % 7;
  if (forceFollowingWeek && delta === 0) delta = 7;
  date.setDate(date.getDate() + delta);
  return date;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function reminderYearForMonth(month: number, referenceDate: Date) {
  let year = referenceDate.getFullYear();
  if (month < referenceDate.getMonth()) year += 1;
  return year;
}

function reminderDateRangeFromText(value: string, referenceDate = new Date()): {
  startDate: string;
  endDate: string;
  datePrecision: ReminderDatePrecision;
} {
  const text = value.toLowerCase();
  const monthRangeMatch = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+([0-3]?\d)(?:st|nd|rd|th)?\s*(?:-|to)\s*([0-3]?\d)(?:st|nd|rd|th)?(?:,\s*(\d{4}))?\b/i
    .exec(text);
  if (monthRangeMatch) {
    const month = MONTH_NAMES.get(monthRangeMatch[1].toLowerCase());
    const startDay = Number(monthRangeMatch[2]);
    const endDay = Number(monthRangeMatch[3]);
    const year = monthRangeMatch[4] ? Number(monthRangeMatch[4]) : month !== undefined
      ? reminderYearForMonth(month, referenceDate)
      : NaN;
    if (
      month !== undefined &&
      startDay >= 1 &&
      endDay >= startDay &&
      endDay <= daysInMonth(year, month) &&
      Number.isFinite(year)
    ) {
      return {
        startDate: dateStringFromDate(new Date(year, month, startDay)),
        endDate: dateStringFromDate(new Date(year, month, endDay)),
        datePrecision: "date_range"
      };
    }
  }
  const monthMatch = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+([0-3]?\d)(?:st|nd|rd|th)?(?:,\s*(\d{4}))?\b/i
    .exec(text);
  if (monthMatch) {
    const month = MONTH_NAMES.get(monthMatch[1].toLowerCase());
    const day = Number(monthMatch[2]);
    const year = monthMatch[3] ? Number(monthMatch[3]) : month !== undefined
      ? reminderYearForMonth(month, referenceDate)
      : NaN;
    if (month !== undefined && day >= 1 && day <= 31 && Number.isFinite(year)) {
      const date = new Date(year, month, day);
      if (date.getMonth() === month && date.getDate() === day) {
        const dateText = dateStringFromDate(date);
        return { startDate: dateText, endDate: dateText, datePrecision: "exact" };
      }
    }
  }
  const vagueMonthMatch = /\b(early|beginning of|start of|first week of|mid|middle of|late|end of)\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i
    .exec(text);
  if (vagueMonthMatch) {
    const month = MONTH_NAMES.get(vagueMonthMatch[2].toLowerCase());
    if (month !== undefined) {
      const qualifier = vagueMonthMatch[1].toLowerCase();
      const year = reminderYearForMonth(month, referenceDate);
      const lastDay = daysInMonth(year, month);
      const [startDay, endDay] = /mid|middle/.test(qualifier)
        ? [11, 20]
        : /late|end/.test(qualifier)
          ? [21, lastDay]
          : [1, 10];
      return {
        startDate: dateStringFromDate(new Date(year, month, startDay)),
        endDate: dateStringFromDate(new Date(year, month, endDay)),
        datePrecision: "month_window"
      };
    }
  }
  for (const [index, weekday] of WEEKDAY_NAMES.entries()) {
    const match = new RegExp(`\\b(next|this)?\\s*${weekday}\\b`, "i").exec(text);
    if (!match) continue;
    const dateText = dateStringFromDate(nextWeekdayDate(index, referenceDate, match[1]?.toLowerCase() === "next"));
    return { startDate: dateText, endDate: dateText, datePrecision: "exact" };
  }
  return { startDate: "", endDate: "", datePrecision: "unknown" };
}

function reminderDateFromText(value: string, referenceDate = new Date()) {
  return reminderDateRangeFromText(value, referenceDate).startDate;
}

function addDaysToDateText(value: string, days: number) {
  if (!validReminderDateText(value) || !Number.isFinite(days)) return "";
  const date = dateFromReminderParts(value);
  date.setDate(date.getDate() + days);
  return dateStringFromDate(date);
}

function reminderStartDateValue(reminder?: ReminderSuggestion) {
  return dateTextValue(reminder?.start_date) ||
    dateTextValue(reminder?.trigger_date) ||
    dateTextValue(reminder?.date_window_start);
}

function reminderEndDateValue(reminder?: ReminderSuggestion, startDate = "") {
  const explicitEndDate = dateTextValue(reminder?.end_date) || dateTextValue(reminder?.date_window_end);
  if (explicitEndDate) return explicitEndDate;
  const duration = Number(reminder?.duration);
  if (startDate && Number.isFinite(duration) && duration > 0) {
    if (reminder?.duration_unit === "days") return addDaysToDateText(startDate, duration - 1);
    if (reminder?.duration_unit === "weeks") return addDaysToDateText(startDate, duration * 7 - 1);
  }
  return startDate;
}

function reminderStartTimeValue(reminder?: ReminderSuggestion) {
  return timeTextValue(reminder?.start_time) || timeTextValue(reminder?.trigger_time);
}

function reminderEndTimeValue(reminder?: ReminderSuggestion, startTime = "") {
  const explicitEndTime = timeTextValue(reminder?.end_time);
  if (explicitEndTime) return explicitEndTime;
  const duration = Number(reminder?.duration);
  if (!startTime || !Number.isFinite(duration) || duration <= 0) return "";
  if (reminder?.duration_unit === "minutes") return addMinutesToTimeText(startTime, duration);
  if (reminder?.duration_unit === "hours") return addMinutesToTimeText(startTime, duration * 60);
  return "";
}

function datePrecisionForRange(
  startDate: string,
  endDate: string,
  existing?: ReminderDatePrecision | null
): ReminderDatePrecision {
  if (existing && existing !== "day") return existing;
  if (!startDate) return "unknown";
  if (endDate && compareDateText(startDate, endDate) !== 0) return "date_range";
  return "exact";
}

function timePrecisionForRange(
  startTime: string,
  endTime: string,
  existing?: ReminderTimePrecision | null
): ReminderTimePrecision {
  if (existing) return existing;
  if (startTime && endTime) return "time_range";
  if (startTime) return "exact";
  return "unknown";
}

export function reminderIntervalLabel(
  startDate: string,
  endDate: string,
  startTime?: string | null,
  endTime?: string | null,
  fallback?: string
) {
  const safeStartDate = dateTextValue(startDate);
  const safeEndDate = dateTextValue(endDate) || safeStartDate;
  const safeStartTime = timeTextValue(startTime);
  const safeEndTime = timeTextValue(endTime);
  const startDateLabel = reminderDateLabel(safeStartDate);
  const endDateLabel = safeEndDate && safeEndDate !== safeStartDate
    ? reminderDateLabel(safeEndDate)
    : "";
  const startTimeLabel = reminderTimeLabel(safeStartDate, safeStartTime);
  const endTimeLabel = reminderTimeLabel(safeEndDate || safeStartDate, safeEndTime);
  const dateLabel = startDateLabel && endDateLabel ? `${startDateLabel}-${endDateLabel}` : startDateLabel;
  const timeLabel = startTimeLabel && endTimeLabel
    ? `${startTimeLabel}-${endTimeLabel}`
    : startTimeLabel;
  if (dateLabel && timeLabel) return `${dateLabel}, ${timeLabel}`;
  if (dateLabel) return dateLabel;
  return fallback || "";
}

function inferredReminderParts(reminder?: ReminderSuggestion, referenceDate = new Date()) {
  const text = [reminder?.trigger_value, reminder?.trigger_text]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
  if (!text) {
    return {
      startDate: "",
      endDate: "",
      startTime: "",
      endTime: "",
      datePrecision: "unknown" as ReminderDatePrecision,
      timePrecision: "unknown" as ReminderTimePrecision
    };
  }
  const dateRange = reminderDateRangeFromText(text, referenceDate);
  const timeRange = reminderTimeRangeFromText(text);
  return {
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    startTime: timeRange.startTime,
    endTime: timeRange.endTime,
    datePrecision: dateRange.datePrecision,
    timePrecision: timeRange.timePrecision
  };
}

export function reminderLabel(reminder: ReminderSuggestion | undefined) {
  if (!reminder) return "";
  const startDate = reminderStartDateValue(reminder);
  const endDate = reminderEndDateValue(reminder, startDate);
  const startTime = reminderStartTimeValue(reminder);
  const endTime = reminderEndTimeValue(reminder, startTime);
  if (
    reminder.date_precision === "month_window" &&
    !startTime &&
    reminder.trigger_value
  ) {
    return reminder.trigger_value;
  }
  const intervalLabel = reminderIntervalLabel(startDate, endDate, startTime, endTime);
  const durationLabel = reminderDurationLabel(reminder.duration, reminder.duration_unit);
  if (intervalLabel && startTime) {
    return `${intervalLabel}${durationLabel ? ` · ${durationLabel}` : ""}`;
  }
  if (intervalLabel) return intervalLabel;
  return reminder.trigger_value || reminder.trigger_text || humanize(reminder.trigger_type);
}

export function reminderScheduleDraftForSuggestion(reminder?: ReminderSuggestion): ReminderScheduleDraft {
  const inferredParts = inferredReminderParts(reminder);
  const startDate = reminderStartDateValue(reminder) ||
    inferredParts.startDate ||
    dateStringFromDate(new Date());
  const inferredEndDate = inferredParts.endDate || inferredParts.startDate;
  const explicitEndDate = dateTextValue(reminder?.end_date) || dateTextValue(reminder?.date_window_end);
  const durationEndDate = reminderEndDateValue(reminder, startDate);
  const endDate = explicitEndDate ||
    (inferredEndDate && compareDateText(inferredEndDate, startDate) >= 0 ? inferredEndDate : "") ||
    durationEndDate ||
    startDate;
  const startTime = reminderStartTimeValue(reminder) || inferredParts.startTime || "";
  const endTime = reminderEndTimeValue(reminder, startTime) || inferredParts.endTime || "";
  const derivedDuration = reminderIntervalDuration(startDate, endDate, startTime, endTime);
  return {
    startDate,
    endDate,
    startTime,
    endTime,
    timezone: reminder?.timezone || deviceTimeZone(),
    datePrecision: datePrecisionForRange(startDate, endDate, reminder?.date_precision || inferredParts.datePrecision),
    timePrecision: timePrecisionForRange(startTime, endTime, reminder?.time_precision || inferredParts.timePrecision),
    duration: Number(reminder?.duration) > 0 ? Number(reminder?.duration) : derivedDuration.duration,
    durationUnit: reminder?.duration_unit || derivedDuration.durationUnit,
    triggerText: reminder?.trigger_text || reminder?.trigger_value || "",
    rationale: reminder?.rationale || "",
    source: reminder ? "ai_prefill" : "manual"
  };
}

export function reminderSuggestionFromSchedule(
  draft: ReminderScheduleDraft,
  existing?: ReminderSuggestion
): ReminderSuggestion {
  const derivedDuration = reminderIntervalDuration(draft.startDate, draft.endDate, draft.startTime, draft.endTime);
  const duration = Number.isFinite(Number(draft.duration)) && Number(draft.duration) > 0
    ? Number(draft.duration)
    : derivedDuration.duration;
  const durationUnit = draft.durationUnit || derivedDuration.durationUnit;
  const triggerValue = reminderIntervalLabel(
    draft.startDate,
    draft.endDate,
    draft.startTime,
    draft.endTime,
    draft.triggerText || existing?.trigger_value || ""
  );
  return {
    ...(existing || {}),
    trigger_type: "time",
    trigger_value: triggerValue,
    trigger_text: draft.triggerText || existing?.trigger_text || existing?.trigger_value || undefined,
    start_date: draft.startDate,
    end_date: draft.endDate || draft.startDate,
    start_time: draft.startTime || null,
    end_time: draft.endTime || null,
    trigger_date: draft.startDate,
    date_window_start: draft.startDate,
    date_window_end: draft.endDate || draft.startDate,
    date_precision: draft.datePrecision || datePrecisionForRange(draft.startDate, draft.endDate),
    trigger_time: draft.startTime || null,
    time_precision: draft.timePrecision || timePrecisionForRange(draft.startTime, draft.endTime),
    timezone: draft.timezone || deviceTimeZone(),
    duration,
    duration_unit: durationUnit,
    rationale: draft.rationale || existing?.rationale || "User added this reminder.",
    confidence: existing?.confidence || 1,
    source: draft.source,
    status: "confirmed"
  };
}

export function captureSourceLabel(capture: Capture) {
  return capture.siteName || hostFromUrl(capture.sourceUrl) || conciseText(capture.sourceText, 56) || "Shared text";
}

export function captureSourceHost(capture: Capture) {
  return hostFromUrl(capture.sourceUrl) || capture.siteName || "";
}

export function sourceFaviconUrl(host: string) {
  const cleaned = host.replace(/^www\./i, "").trim();
  if (!cleaned || !cleaned.includes(".") || /[\s/]/.test(cleaned)) return "";
  return `https://${cleaned}/favicon.ico`;
}

export function remoteImageAsset(row: Record<string, any>) {
  const assets = Array.isArray(row.capture_assets) ? row.capture_assets : [];
  return assets.find((asset) => {
    const mimeType = String(asset?.mime_type || asset?.mimeType || "");
    const url = asset?.signed_url || asset?.signedUrl || asset?.public_url || asset?.publicUrl;
    const storagePath = asset?.storage_path || asset?.storagePath;
    return mimeType.startsWith("image/") && Boolean((typeof url === "string" && url.trim()) || storagePath);
  });
}

export function captureImageUrl(capture: Capture) {
  return (
    capture.imageAssetUrl ||
    capture.thumbnailUrl ||
    capture.urlEvidence?.image_url ||
    ""
  );
}

export function captureImageLoadKey(capture: Capture) {
  const imageUri = captureImageUrl(capture);
  return imageUri ? capture.imageAssetCacheKey || imageUri : "";
}

export function captureRowRevealKey(capture: Capture) {
  return capture.id;
}

export function isImageCapture(capture: Capture) {
  const captureType = String(capture.captureType || "").toLowerCase();
  const mimeType = String(capture.imageAssetMimeType || "").toLowerCase();
  const sourceText = String(capture.sourceText || "").trim();
  return (
    captureType === "image" ||
    captureType === "screenshot" ||
    (captureType === "mixed" && mimeType.startsWith("image/")) ||
    mimeType.startsWith("image/") ||
    /^(selected|shared)\s+(image|screenshot):/i.test(sourceText)
  );
}

export function shouldGhostSourceMark(capture: Capture) {
  if (captureImageUrl(capture)) return false;
  if (isImageCapture(capture) && displayStatus(capture) !== "failed") return true;
  return displayStatus(capture) === "processing";
}

export function captureOpenUrl(capture: Capture) {
  return capture.sourceUrl || extractHttpUrl(capture.sourceText) || "";
}

export function isMapSource(capture: Capture) {
  const host = captureSourceHost(capture).toLowerCase();
  const url = String(capture.sourceUrl || "").toLowerCase();
  const intent = capture.defaultIntent || "";
  return (
    host.includes("maps") ||
    host === "goo.gl" ||
    host.endsWith(".goo.gl") ||
    url.includes("/maps") ||
    url.includes("maps.app.goo.gl") ||
    url.includes("goo.gl/maps") ||
    intent.includes("place") ||
    intent.includes("trip")
  );
}

export function sourceIconForCapture(capture: Capture): LucideIconComponent {
  const host = captureSourceHost(capture).toLowerCase();
  const intent = capture.defaultIntent || "";
  if (isMapSource(capture)) {
    return MapPin;
  }
  if (intent.includes("buy") || intent.includes("product") || host.includes("amazon") || host.includes("etsy")) {
    return ShoppingBag;
  }
  if (intent.includes("read") || host.includes("medium") || host.includes("substack")) {
    return BookOpen;
  }
  if (host.includes("youtube") || host.includes("instagram") || host.includes("tiktok") || host.includes("photos")) {
    return ImageIcon;
  }
  if (intent.includes("event") || intent.includes("reminder")) return CalendarDays;
  if (capture.sourceUrl) return Link2;
  return StickyNote;
}

export function captureStatusLabel(capture: Capture) {
  if (isArchived(capture)) return "Archived";
  const status = displayStatus(capture);
  if (status === "processing") return "Analyzing";
  if (status === "failed") return "Could not analyze";
  if (status === "needs_review") return "Needs a quick look";
  return statusLabel(status);
}

export function captureIntentLabel(capture: Capture) {
  return activeIntentLabel(capture.defaultIntent);
}

export function auditLikeText(value: string | null | undefined) {
  return /url returned|saved url failed|saved link:|failed to fetch metadata|could not fetch metadata|metadata fetch|metadata|no readable title|readable title|readable description|path suggests|generic evidence|insufficient url|link saved from android share|android share|untitled capture|extraction|analysis|confidence|model|provider/i.test(
    String(value || "")
  );
}

export function consumerSummary(capture: Capture) {
  const cleaned = (capture.summary || "")
    .replace(/\s*[—-]\s*likely\b.*$/i, "")
    .replace(/\.\s*likely\b.*$/i, ".")
    .replace(/\s*[—-]\s*the user\b.*$/i, "")
    .replace(/\.\s*the user\b.*$/i, ".");
  const summary = conciseText(cleaned, 128);
  if (!summary) return "";
  if (auditLikeText(summary)) {
    return "";
  }
  return summary;
}

export function rawTitleLikeSource(capture: Capture) {
  const title = cleanSentence(capture.title).toLowerCase();
  if (!title) return true;
  if (auditLikeText(title)) return true;
  if (/^https?:\/\//i.test(title)) return true;
  const host = captureSourceHost(capture).toLowerCase();
  const source = captureSourceLabel(capture).toLowerCase();
  if (/^[a-z0-9.-]+\/\S+/i.test(title)) return true;
  if (host && title.startsWith(`${host}/`)) return true;
  if (host && (title === host || title === host.replace(/^www\./, ""))) return true;
  if (source && title === source) return true;
  return !title.includes(" ") && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(title);
}

export function captureDisplayTitle(capture: Capture) {
  const title = cleanSentence(capture.title);
  if (title && !rawTitleLikeSource(capture)) return title;
  const summary = consumerSummary(capture);
  if (summary) return conciseText(summary, 72);
  const source = captureSourceLabel(capture);
  if (source && source !== "Shared text") return `Saved from ${source}`;
  return capture.sourceUrl ? "Saved link" : "Saved note";
}

export function captureSupportLine(capture: Capture, visibleSummary: string) {
  if (visibleSummary) return "";
  const status = displayStatus(capture);
  if (status === "processing") return "Saved. Checking the source now.";
  if (status === "failed") return "Saved. Open it to review or try again.";
  if (status === "needs_review") return reviewInsightForCapture(capture).focus;
  const evidence = urlEvidenceMessage(capture.urlEvidence);
  if (evidence) return evidence;
  return "";
}

export function reviewStatusCue(capture: Capture, hasReviewReasons: boolean) {
  if (displayStatus(capture) === "processing") return "Checking source";
  if (displayStatus(capture) === "failed") return "Needs a quick look";
  if (hasReviewReasons) return "Needs a quick look";
  return "Ready";
}

export function recencyGroupLabel(value: number, now = Date.now()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const captured = new Date(value);
  captured.setHours(0, 0, 0, 0);
  const diff = today.getTime() - captured.getTime();
  if (diff <= 0) return "Today";
  if (diff <= 24 * 60 * 60 * 1000) return "Yesterday";
  if (diff <= 7 * 24 * 60 * 60 * 1000) return "This week";
  return "Earlier";
}

export function groupedCaptureRows(captures: Capture[]) {
  const rows: HomeListRow[] = [];
  const seenGroups = new Set<string>();
  for (const capture of captures) {
    const group = recencyGroupLabel(capture.createdAt);
    if (!seenGroups.has(group)) {
      rows.push({ type: "section", id: `section:${group}`, title: group });
      seenGroups.add(group);
    }
    rows.push({ type: "capture", id: capture.id, capture });
  }
  return rows;
}

export function uniqueCaptures(captures: Capture[]) {
  return uniqueCapturesByIdentity(captures);
}

export function uniqueCollections(collections: Collection[]) {
  const seen = new Set<string>();
  return collections.filter((collection) => {
    if (!collection.id || seen.has(collection.id)) return false;
    seen.add(collection.id);
    return true;
  });
}

export function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function captureSearchParts(capture: Capture) {
  return [
    capture.title,
    capture.summary,
    capture.note,
    capture.sourceText,
    capture.sourceUrl,
    capture.siteName,
    capture.defaultIntent,
    humanize(capture.defaultIntent),
    capture.intentRationale,
    capture.visitTarget?.name,
    capture.visitTarget?.query,
    capture.visitTarget?.confidence,
    ...(capture.visitTarget?.evidence || []),
    capture.confidenceLabel,
    captureStatusLabel(capture),
    formatDateTime(capture.createdAt),
    isoDateText(capture.createdAt),
    isoDateText(capture.updatedAt),
    isoDateText(capture.processedAt),
    ...(capture.searchPhrases || []),
    ...(capture.entities || []).flatMap((entity) => [entity.type, entity.name, entity.evidence]),
    ...(capture.linkedCollections || []).flatMap((collection) => [
      collection.title,
      collection.description,
      collection.rationale
    ]),
    ...(capture.suggestedReminders || []).flatMap((reminder) => [
      reminder.trigger_type,
      reminder.trigger_value,
      reminder.trigger_text,
      reminder.start_date,
      reminder.end_date,
      reminder.start_time,
      reminder.end_time,
      reminder.trigger_date,
      reminder.trigger_time,
      reminder.date_window_start,
      reminder.date_window_end,
      reminder.date_precision,
      reminder.time_precision,
      reminder.duration,
      reminder.duration_unit,
      reminder.rationale,
      reminder.status
    ])
  ].filter(Boolean).map(String);
}

export function searchableCaptureText(capture: Capture) {
  return captureSearchParts(capture).join(" ").toLowerCase();
}

export function matchReasonForCapture(capture: Capture, term: string) {
  const query = term.trim().toLowerCase();
  if (!query) return isArchived(capture) ? "Archived capture" : "Recent capture";
  const matches = (values: Array<string | null | undefined>) =>
    values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
  if (matches([capture.title])) return "Matched title";
  if (matches([capture.summary])) return "Matched summary";
  if (matches([capture.note])) return "Matched note";
  if (matches([capture.sourceText, capture.sourceUrl, capture.siteName])) return "Matched source";
  if (matches([capture.defaultIntent, humanize(capture.defaultIntent)])) return "Matched save intent";
  if (matches([
    capture.visitTarget?.name,
    capture.visitTarget?.query,
    ...(capture.visitTarget?.evidence || [])
  ])) {
    return "Matched visit target";
  }
  if (matches((capture.linkedCollections || []).flatMap((collection) => [collection.title, collection.description]))) {
    return "Matched collection";
  }
  if (matches((capture.entities || []).flatMap((entity) => [entity.type, entity.name, entity.evidence]))) {
    return "Matched saved detail";
  }
  if (matches((capture.suggestedReminders || []).flatMap((reminder) => [
    reminder.trigger_type,
    reminder.trigger_value,
    reminder.trigger_text,
    reminder.start_date,
    reminder.end_date,
    reminder.start_time,
    reminder.end_time,
    reminder.trigger_date,
    reminder.trigger_time,
    reminder.date_window_start,
    reminder.date_window_end,
    reminder.date_precision,
    reminder.time_precision,
    String(reminder.duration || ""),
    reminder.duration_unit,
    reminder.rationale
  ]))) {
    return "Matched reminder";
  }
  if (matches([formatDateTime(capture.createdAt), isoDateText(capture.createdAt)])) return "Matched time saved";
  return "Matched saved detail";
}

export function reminderDraftKey(reminder: ReminderSuggestion, index: number) {
  return `${index}:${reminder.trigger_type || ""}:${reminder.trigger_value || ""}`;
}

export function linkedCollectionDraftKey(collectionId: string) {
  return `linked:${collectionId}`;
}

export function suggestedCollectionDraftKey(collection: CollectionDecision, index: number) {
  return `suggested:${index}:${collection.type}:${collection.collectionId || collection.title}`;
}

export function collectionChoiceFromDecision(decision: CollectionDecision) {
  if (decision.type === "existing" && decision.collectionId) {
    return { type: "existing" as const, collectionId: decision.collectionId };
  }
  if (decision.type === "new" && decision.title.trim() && decision.description?.trim()) {
    return {
      type: "new" as const,
      title: decision.title.trim(),
      description: decision.description.trim()
    };
  }
  return null;
}

export function collectionConfidenceLabel(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Selected";
  if (value >= 0.72) return "Looks right";
  if (value >= 0.5) return "Maybe";
  return "Not sure";
}

export function linkedCollectionsLabel(collections: LinkedCollection[]) {
  if (!collections.length) return "Add collections";
  if (collections.length === 1) return collections[0].title;
  return `${collections[0].title} +${collections.length - 1}`;
}

export function reviewRationaleFromRemote(value: unknown): ReviewRationale | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const next: ReviewRationale = {};
  for (const key of ["focus", "summary", "intent", "collections", "reminder"] as const) {
    const text = cleanSentence(typeof record[key] === "string" ? record[key] : "");
    if (text && !auditLikeText(text)) next[key] = text;
  }
  return Object.keys(next).length ? next : undefined;
}

export function rationaleLine(value: string | null | undefined) {
  const text = cleanSentence(value);
  if (!text || auditLikeText(text)) return "";
  return text;
}

export function reviewFocusForCapture(capture: Capture, intentText: string) {
  const rationale = capture.reviewRationale || {};
  const providedFocus = rationaleLine(rationale.focus);
  if (providedFocus) return conciseText(providedFocus, 88);
  if (displayStatus(capture) === "failed") return "Review source details";
  const reviewTargets = reviewTargetsForCapture(capture);
  if (reviewTargets.includes("collections")) {
    const collectionsLabel = linkedCollectionsLabel(capture.linkedCollections || []);
    return collectionsLabel === "Add collections"
      ? "Check Collections"
      : `Check Collections: ${collectionsLabel}`;
  }
  if (reviewTargets.includes("reminder")) return "Confirm Reminder idea";
  if (confidenceRequiresReview(capture.confidenceLabel)) {
    const intentLabel = activeIntentLabel(capture.defaultIntent);
    return intentLabel ? `Confirm Save Intent: ${intentLabel}` : "Choose a Save Intent";
  }
  if (capture.needsReview) return "Review the suggested fields";
  return conciseText(intentText, 88) || "Review the suggested fields";
}

const REVIEW_CHECKLIST_ORDER: ReviewTarget[] = ["intent", "collections", "reminder", "analysis"];

export function reviewChecklistCta(tasks: ReviewChecklistTask[]) {
  if (!tasks.length) return "Review insight";
  return tasks.length === 1 ? "Review 1 item" : `Review ${tasks.length} items`;
}

export function reviewChecklistTasksForCapture(capture: Capture): ReviewChecklistTask[] {
  const targets = new Set(reviewTargetsForCapture(capture));
  if (!targets.size) return [];
  const rationale = capture.reviewRationale || {};
  const primaryReminder = (capture.suggestedReminders || [])[0];
  const collectionsLabel = linkedCollectionsLabel(capture.linkedCollections || []);
  const intentValue = activeIntentLabel(capture.defaultIntent);
  const intentTask: ReviewChecklistTask = {
    target: "intent",
    title: "Save Intent",
    value: intentValue || "No intent",
    rationale:
      rationaleLine(rationale.intent) ||
      rationaleLine(capture.intentRationale) ||
      (intentValue
        ? `Confirm ${intentValue} is the right action for this capture.`
        : "Choose an action only if the saved content clearly supports one."),
    confirmLabel: intentValue ? `Keep ${intentValue}` : "Keep no intent",
    editLabel: intentValue ? "Change Save Intent" : "Choose Save Intent"
  };
  const collectionsTask: ReviewChecklistTask = {
    target: "collections",
    title: "Collections",
    value: collectionsLabel === "Add collections" ? "No collection" : collectionsLabel,
    rationale:
      rationaleLine(rationale.collections) ||
      (capture.linkedCollections || [])
        .map((collection) => rationaleLine(collection.rationale))
        .find(Boolean) ||
      "Keep it unfiled unless one of your existing Collections fits.",
    confirmLabel: collectionsLabel === "Add collections" ? "Keep no collection" : `Keep ${collectionsLabel}`,
    editLabel: "Change Collections"
  };
  const reminderTask: ReviewChecklistTask = {
    target: "reminder",
    title: "Reminder",
    value: primaryReminder ? reminderLabel(primaryReminder) : "Add reminder",
    rationale:
      rationaleLine(rationale.reminder) ||
      rationaleLine(primaryReminder?.rationale) ||
      "Confirm this only if the idea should stay with the capture.",
    confirmLabel: primaryReminder ? `Keep ${reminderLabel(primaryReminder)}` : "Keep no reminder",
    editLabel: primaryReminder ? "Change Reminder" : "Add Reminder"
  };
  const analysisTask: ReviewChecklistTask = {
    target: "analysis",
    title: "Analysis",
    value: "Source details",
    rationale:
      rationaleLine(rationale.summary) ||
      "Confirm the extracted details look usable, or edit the title and note before saving.",
    confirmLabel: "Mark analysis reviewed"
  };
  const byTarget: Record<ReviewTarget, ReviewChecklistTask> = {
    intent: intentTask,
    collections: collectionsTask,
    reminder: reminderTask,
    analysis: analysisTask
  };
  return REVIEW_CHECKLIST_ORDER
    .filter((target) => targets.has(target))
    .map((target) => byTarget[target]);
}

export function reviewInsightForCapture(capture: Capture): ReviewInsight {
  const rationale = capture.reviewRationale || {};
  const collectionRationale = (capture.linkedCollections || [])
    .map((collection) => rationaleLine(collection.rationale))
    .find(Boolean) || "";
  const reminderRationale = (capture.suggestedReminders || [])
    .map((reminder) => rationaleLine(reminder.rationale))
    .find(Boolean) || "";
  const intentText =
    rationaleLine(rationale.intent) ||
    rationaleLine(capture.intentRationale);
  const collectionsText =
    rationaleLine(rationale.collections) ||
    collectionRationale;
  const reminderText =
    rationaleLine(rationale.reminder) ||
    reminderRationale;
  const summary =
    rationaleLine(rationale.summary) ||
    conciseText([intentText, collectionsText, reminderText].filter(Boolean).join(" "), 140);
  const focus = reviewFocusForCapture(capture, intentText);
  return {
    focus,
    summary,
    sections: [
      { label: "Save Intent", text: intentText },
      { label: "Collections", text: collectionsText },
      { label: "Reminder idea", text: reminderText }
    ].filter((section) => Boolean(section.text))
  };
}

export function collectionCountLabel(count: number) {
  return `${count} ${count === 1 ? "capture" : "captures"}`;
}

export function captureDraftKey(capture: Pick<Capture, "id" | "remoteId">) {
  return capture.remoteId || capture.id;
}

export function cleanedReviewDraft(draft: CaptureReviewDraft): CaptureReviewDraft | null {
  const next: CaptureReviewDraft = { updatedAt: draft.updatedAt };
  if (draft.titleDirty && typeof draft.title === "string") {
    next.title = draft.title;
    next.titleDirty = true;
  }
  if (draft.noteDirty && typeof draft.note === "string") {
    next.note = draft.note;
    next.noteDirty = true;
  }
  if (draft.intentDirty) {
    next.intent = typeof draft.intent === "string" ? draft.intent : "";
    next.intentDirty = true;
  }
  if (draft.reminders && Object.keys(draft.reminders).length) {
    next.reminders = draft.reminders;
  }
  const hasChanges = Boolean(
    next.titleDirty ||
      next.noteDirty ||
      next.intentDirty ||
      next.reminders
  );
  return hasChanges ? next : null;
}

export function cleanSentence(value: string | null | undefined) {
  return String(value || "").trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
}

export function conciseText(value: string | null | undefined, maxLength = 110) {
  const text = cleanSentence(value);
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength);
  const breakIndex = Math.max(clipped.lastIndexOf(","), clipped.lastIndexOf(";"), clipped.lastIndexOf(" "));
  return `${clipped.slice(0, breakIndex > 60 ? breakIndex : maxLength).trim()}...`;
}

export function urlEvidenceMessage(evidence?: UrlEvidence | null) {
  if (!evidence) return "";
  const suppliedMessage = evidence.user_facing_message && !auditLikeText(evidence.user_facing_message)
    ? evidence.user_facing_message
    : "";
  if (evidence.status === "needs_client_resolution") {
    return suppliedMessage || "Saved. Open the link once if you want richer details.";
  }
  if (evidence.status === "insufficient_url_evidence") {
    return suppliedMessage || "Saved with limited public details.";
  }
  if (evidence.status === "partial_evidence" || evidence.evidence_quality === "low") {
    return suppliedMessage || "Saved with partial source details.";
  }
  return "";
}

export function friendlyError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/anonymous sign-ins are disabled/i.test(message)) {
    return "Choose Google or email link to sign in.";
  }
  if (/signup|signups|registration/i.test(message) && /disabled|not allowed/i.test(message)) {
    return "Account creation is not enabled yet. Turn on email signups in Supabase Auth.";
  }
  if (/email/i.test(message) && /provider/i.test(message) && /disabled/i.test(message)) {
    return "Email sign-in is not enabled yet in Supabase Auth.";
  }
  if (/redirect|uri|url/i.test(message) && /not allowed|not supported|invalid/i.test(message)) {
    return `The confirmation link is not allowed yet. Add ${AUTH_CALLBACK_URL} in Supabase Auth URL settings.`;
  }
  if (/rate limit|too many requests|over_email_send_rate_limit/i.test(message)) {
    return "A confirmation email was already sent. Wait a minute before trying again.";
  }
  if (
    /UnknownHostException|Unable to resolve host|No address associated|fetch failed|SocketException|Software caused connection abort|Connection reset|unexpected end of stream|native_request_failed/i.test(
      message
    )
  ) {
    return "Network connection dropped. Try again in a moment.";
  }
  if (/unauthorized|session expired/i.test(message)) {
    return "Your session expired. Sign in again.";
  }
  if (auditLikeText(message) || /stack trace|edge function|supabase|native bridge|request failed/i.test(message)) {
    return fallback;
  }
  return message || fallback;
}

export function emailInputError(email: string) {
  if (!email) {
    return "Enter your email address.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Enter a valid email address.";
  }
  return "";
}

export function authCallbackPayload(url: string | null | undefined): AuthCallbackPayload | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const route = `${parsed.host}${parsed.pathname}`.replace(/^\/+/, "");
  if (parsed.protocol !== "preciouscaptures:" || route !== "auth/callback") return null;

  const params = new URLSearchParams(parsed.search);
  if (parsed.hash.startsWith("#")) {
    new URLSearchParams(parsed.hash.slice(1)).forEach((value, key) => params.set(key, value));
  }
  const error = params.get("error_description") || params.get("error");
  if (error) {
    return { kind: "error", message: error.replace(/\+/g, " ") };
  }

  const accessToken = params.get("access_token") || "";
  const refreshToken = params.get("refresh_token") || "";
  const expiresAt = Number(params.get("expires_at")) ||
    Math.floor(Date.now() / 1000) + Number(params.get("expires_in") || 3600);
  if (!accessToken || !refreshToken) {
    return { kind: "error", message: "This confirmation link is incomplete. Send yourself a new link." };
  }
  return { kind: "session", accessToken, refreshToken, expiresAt };
}

export function isCaptureImageCancel(error: unknown) {
  if (!error) return true;
  const message = error instanceof Error ? error.message : String(error || "");
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";
  return /capture_image_missing|No image was selected/i.test(`${code} ${message}`);
}
