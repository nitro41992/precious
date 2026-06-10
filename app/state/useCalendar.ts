import { useCallback, useState } from "react";

import type { CalendarEvent } from "../calendarLogic";

export type CalendarVisibleMonth = { year: number; month: number };

function currentMonth(): CalendarVisibleMonth {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

// Calendar UI state: the loaded events, the visible month, the tapped day (and its detail sheet),
// and the editor sheet target. Data fetching (loadEvents) lives in App.tsx because it needs the
// session/config; this hook only owns view state, mirroring how the other screen state hooks work.
export function useCalendarState() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [visibleMonth, setVisibleMonth] = useState<CalendarVisibleMonth>(currentMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [nextEventDate, setNextEventDate] = useState<string | null>(null);
  // Editor target: an existing event (edit) or a seed date for a new manual event (create).
  const [editorEvent, setEditorEvent] = useState<CalendarEvent | null>(null);
  const [editorDate, setEditorDate] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const openEventEditor = useCallback((target: { event?: CalendarEvent | null; date?: string | null }) => {
    setEditorEvent(target.event ?? null);
    setEditorDate(target.date ?? (target.event ? target.event.startDate : null));
    setEditorOpen(true);
  }, []);

  const closeEventEditor = useCallback(() => {
    setEditorOpen(false);
    setEditorEvent(null);
    setEditorDate(null);
  }, []);

  return {
    events,
    setEvents,
    eventsLoading,
    setEventsLoading,
    eventsError,
    setEventsError,
    visibleMonth,
    setVisibleMonth,
    selectedDate,
    setSelectedDate,
    nextEventDate,
    setNextEventDate,
    editorEvent,
    editorDate,
    editorOpen,
    openEventEditor,
    closeEventEditor
  };
}

export type CalendarState = ReturnType<typeof useCalendarState>;
