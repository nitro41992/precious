// Pure, dependency-free calendar math: groups events onto grid days, buckets fuzzy events by
// month, and computes overlap columns for a day's agenda. Kept import-free (no React Native, no
// date library) so Node's test runner can exercise it directly, mirroring captureLogic.js.
// Contains NO semantic interpretation — only structured-field date/time arithmetic.

const PRECISE_PRECISIONS = new Set(["exact", "day", "date_range"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;
const MINUTES_PER_UNIT = { minutes: 1, hours: 60, days: 24 * 60, weeks: 7 * 24 * 60 };
const MAX_RANGE_DAYS = 92; // defensive cap on multi-day expansion
const DEFAULT_TIMED_DURATION_MIN = 60;

function isValidDate(value) {
  return typeof value === "string" && DATE_RE.test(value);
}

// "YYYY-MM-DD" + n days, computed in UTC so DST never shifts the calendar day.
function addDays(dateStr, n) {
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(5, 7));
  const day = Number(dateStr.slice(8, 10));
  const next = new Date(Date.UTC(year, month - 1, day + n));
  return next.toISOString().slice(0, 10);
}

function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}

function timeToMinutes(value) {
  const match = TIME_RE.exec(String(value || ""));
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes < 24 * 60 ? minutes : null;
}

function isPreciseEvent(event) {
  return PRECISE_PRECISIONS.has(event && event.datePrecision) && isValidDate(event && event.startDate);
}

function isFuzzyEvent(event) {
  return Boolean(event && isValidDate(event.startDate)) && !isPreciseEvent(event);
}

// Inclusive list of day strings an event covers, capped so a malformed long range can't explode.
function coveredDays(event) {
  const start = event.startDate;
  if (!isValidDate(start)) return [];
  const end = isValidDate(event.endDate) && event.endDate >= start ? event.endDate : start;
  const days = [start];
  let cursor = start;
  let guard = 0;
  while (cursor < end && guard < MAX_RANGE_DAYS) {
    cursor = addDays(cursor, 1);
    days.push(cursor);
    guard += 1;
  }
  return days;
}

// { "YYYY-MM-DD": CalendarEvent[] } for precise events only, expanding multi-day ranges.
function eventsByDay(events) {
  const byDay = {};
  for (const event of events || []) {
    if (!isPreciseEvent(event)) continue;
    for (const day of coveredDays(event)) {
      (byDay[day] = byDay[day] || []).push(event);
    }
  }
  return byDay;
}

// { "YYYY-MM": CalendarEvent[] } for fuzzy (non-day-pinnable) events, keyed by anchor month.
function fuzzyEventsByMonth(events) {
  const byMonth = {};
  for (const event of events || []) {
    if (!isFuzzyEvent(event)) continue;
    const key = monthKey(event.startDate);
    (byMonth[key] = byMonth[key] || []).push(event);
  }
  return byMonth;
}

// { "YYYY-MM-DD": { count } } — which grid days get a dot, and how busy they are.
function dayDotIndex(events) {
  const byDay = eventsByDay(events);
  const index = {};
  for (const day of Object.keys(byDay)) {
    index[day] = { count: byDay[day].length };
  }
  return index;
}

// Resolve a timed event to [startMin, endMin). endTime wins; else derive from duration; else a
// default block. All-day events return null (handled separately, full-width).
function timedInterval(event) {
  const startMin = timeToMinutes(event.startTime);
  if (event.allDay || startMin === null) return null;
  let endMin = timeToMinutes(event.endTime);
  if (endMin === null || endMin <= startMin) {
    const unit = MINUTES_PER_UNIT[event.durationUnit];
    const durationMin = unit && Number(event.duration) > 0 ? Number(event.duration) * unit : null;
    endMin = durationMin ? startMin + durationMin : startMin + DEFAULT_TIMED_DURATION_MIN;
  }
  endMin = Math.min(endMin, 24 * 60);
  if (endMin <= startMin) endMin = Math.min(startMin + DEFAULT_TIMED_DURATION_MIN, 24 * 60);
  return { startMin, endMin };
}

// Greedy interval-graph coloring: assigns each timed event a { column, columnCount } so
// overlapping events lay out side by side. Events that merely touch (end == next start) do NOT
// stack. All-day events are excluded here (rendered full-width by the caller).
function stackOverlaps(dayEvents) {
  const timed = [];
  for (const event of dayEvents || []) {
    const interval = timedInterval(event);
    if (interval) timed.push({ event, startMin: interval.startMin, endMin: interval.endMin });
  }
  timed.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const result = [];
  let cluster = [];
  let clusterEnd = -Infinity;
  let clusterId = 0;
  const flush = () => {
    const columnEnds = [];
    for (const item of cluster) {
      let placed = -1;
      for (let c = 0; c < columnEnds.length; c += 1) {
        if (columnEnds[c] <= item.startMin) {
          columnEnds[c] = item.endMin;
          placed = c;
          break;
        }
      }
      if (placed < 0) {
        columnEnds.push(item.endMin);
        placed = columnEnds.length - 1;
      }
      item.column = placed;
    }
    const columnCount = columnEnds.length;
    for (const item of cluster) {
      result.push({ column: item.column, columnCount, cluster: clusterId, event: item.event });
    }
    cluster = [];
    clusterId += 1;
  };

  for (const item of timed) {
    if (cluster.length && item.startMin >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  if (cluster.length) flush();
  return result;
}

// A day's content shaped for rendering: all-day events (full width) plus timed events grouped
// into overlap clusters. Each cluster is a row of events laid out side by side (sorted by column),
// so the UI can render overlapping events in parallel columns.
function dayOverlapGroups(events, date) {
  if (!isValidDate(date)) return { allDay: [], groups: [] };
  const dayEvents = eventsByDay(events)[date] || [];
  const allDay = dayEvents.filter(
    (event) => event.allDay || timeToMinutes(event.startTime) === null,
  );
  const positioned = stackOverlaps(dayEvents);
  const byCluster = [];
  for (const item of positioned) {
    (byCluster[item.cluster] = byCluster[item.cluster] || []).push({
      ...item.event,
      column: item.column,
      columnCount: item.columnCount,
    });
  }
  const groups = byCluster
    .filter(Boolean)
    .map((group) => group.sort((a, b) => a.column - b.column));
  return { allDay, groups };
}

// A single day's agenda: all-day events first (full width), then timed events ordered by start
// time, each annotated with { column, columnCount } for side-by-side overlap layout.
function dayAgenda(events, date) {
  if (!isValidDate(date)) return [];
  const dayEvents = eventsByDay(events)[date] || [];
  const allDay = dayEvents
    .filter((event) => event.allDay || timeToMinutes(event.startTime) === null)
    .map((event) => ({ ...event, column: 0, columnCount: 1 }));
  const stacked = stackOverlaps(dayEvents)
    .map(({ column, columnCount, event }) => ({
      ...event,
      column,
      columnCount,
      _startMin: timeToMinutes(event.startTime),
    }))
    .sort((a, b) => a._startMin - b._startMin || a.column - b.column);
  return [...allDay, ...stacked.map(({ _startMin, ...rest }) => rest)];
}

// Nearest event anchor strictly after fromDate (for "jump to next event" across empty months).
function nextEventDate(events, fromDate) {
  let best = null;
  for (const event of events || []) {
    if (!isValidDate(event.startDate) || event.startDate <= fromDate) continue;
    if (best === null || event.startDate < best) best = event.startDate;
  }
  return best;
}

// Nearest event anchor strictly before fromDate.
function prevEventDate(events, fromDate) {
  let best = null;
  for (const event of events || []) {
    if (!isValidDate(event.startDate) || event.startDate >= fromDate) continue;
    if (best === null || event.startDate > best) best = event.startDate;
  }
  return best;
}

module.exports = {
  isPreciseEvent,
  isFuzzyEvent,
  coveredDays,
  eventsByDay,
  fuzzyEventsByMonth,
  dayDotIndex,
  stackOverlaps,
  dayAgenda,
  dayOverlapGroups,
  nextEventDate,
  prevEventDate,
  addDays,
};
