export type CalendarDatePrecision =
  | "exact"
  | "day"
  | "date_range"
  | "week"
  | "month_window"
  | "month"
  | "unknown";
export type CalendarTimePrecision = "exact" | "time_range" | "unknown";
export type CalendarDurationUnit = "minutes" | "hours" | "days" | "weeks";
export type CalendarEventSource = "analysis" | "manual";
export type CalendarEventStatus = "detected" | "confirmed" | "dismissed";

export type CalendarEvent = {
  id: string;
  captureId: string | null;
  title: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  duration: number | null;
  durationUnit: CalendarDurationUnit | null;
  datePrecision: CalendarDatePrecision;
  timePrecision: CalendarTimePrecision;
  timezone: string | null;
  source: CalendarEventSource;
  status: CalendarEventStatus;
  reminderIndex: number | null;
};

export type PositionedEvent = CalendarEvent & { column: number; columnCount: number };

export function isPreciseEvent(event: CalendarEvent): boolean;
export function isFuzzyEvent(event: CalendarEvent): boolean;
export function coveredDays(event: CalendarEvent): string[];
export function eventsByDay(events: CalendarEvent[]): Record<string, CalendarEvent[]>;
export function fuzzyEventsByMonth(events: CalendarEvent[]): Record<string, CalendarEvent[]>;
export function dayDotIndex(events: CalendarEvent[]): Record<string, { count: number }>;
export function stackOverlaps(
  dayEvents: CalendarEvent[],
): Array<{ column: number; columnCount: number; cluster: number; event: CalendarEvent }>;
export function dayAgenda(events: CalendarEvent[], date: string): PositionedEvent[];
export function dayOverlapGroups(
  events: CalendarEvent[],
  date: string,
): { allDay: CalendarEvent[]; groups: PositionedEvent[][] };
export function nextEventDate(events: CalendarEvent[], fromDate: string): string | null;
export function prevEventDate(events: CalendarEvent[], fromDate: string): string | null;
export function addDays(dateStr: string, n: number): string;
