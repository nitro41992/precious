import { useState } from "react";

import type { CalendarEvent } from "../calendarLogic";
import type { Capture } from "../types";

export type CalendarVisibleMonth = { year: number; month: number };

function currentMonth(): CalendarVisibleMonth {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

// Calendar UI state: the loaded events (and the capture cards behind them), the visible month, and
// the selected day. Data fetching lives in App.tsx because it needs the session/config; this hook
// only owns view state, mirroring the other screen state hooks. Events are capture-derived, so
// there is no manual create/edit state here.
export function useCalendarState() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  // Capture cards behind the events, keyed by remote capture id, so the agenda renders the real
  // CaptureRow and tapping opens the capture review.
  const [eventCaptures, setEventCaptures] = useState<Record<string, Capture>>({});
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [visibleMonth, setVisibleMonth] = useState<CalendarVisibleMonth>(currentMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [nextEventDate, setNextEventDate] = useState<string | null>(null);

  return {
    events,
    setEvents,
    eventCaptures,
    setEventCaptures,
    eventsLoading,
    setEventsLoading,
    eventsError,
    setEventsError,
    visibleMonth,
    setVisibleMonth,
    selectedDate,
    setSelectedDate,
    nextEventDate,
    setNextEventDate
  };
}

export type CalendarState = ReturnType<typeof useCalendarState>;
