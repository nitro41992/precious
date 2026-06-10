const assert = require("node:assert/strict");
const test = require("node:test");

const {
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
} = require("../app/calendarLogic.js");

function makeEvent(overrides) {
  return {
    id: overrides.id || "e",
    captureId: overrides.captureId ?? null,
    title: overrides.title || "Event",
    startDate: overrides.startDate || "2026-07-03",
    endDate: overrides.endDate || overrides.startDate || "2026-07-03",
    startTime: overrides.startTime || "",
    endTime: overrides.endTime || "",
    allDay: overrides.allDay ?? !overrides.startTime,
    duration: overrides.duration ?? null,
    durationUnit: overrides.durationUnit ?? null,
    datePrecision: overrides.datePrecision || "exact",
    timePrecision: overrides.timePrecision || "unknown",
    timezone: overrides.timezone ?? null,
    source: overrides.source || "analysis",
    status: overrides.status || "detected",
    reminderIndex: overrides.reminderIndex ?? 0,
  };
}

test("precision routing covers all seven precisions", () => {
  const precise = ["exact", "day", "date_range"];
  const fuzzy = ["week", "month_window", "month", "unknown"];
  for (const datePrecision of precise) {
    const event = makeEvent({ datePrecision });
    assert.equal(isPreciseEvent(event), true, `${datePrecision} should be precise`);
    assert.equal(isFuzzyEvent(event), false);
  }
  for (const datePrecision of fuzzy) {
    const event = makeEvent({ datePrecision });
    assert.equal(isPreciseEvent(event), false, `${datePrecision} should be fuzzy`);
    assert.equal(isFuzzyEvent(event), true);
  }
});

test("an invalid start date is neither precise nor fuzzy", () => {
  const event = makeEvent({ startDate: "nope", datePrecision: "exact" });
  assert.equal(isPreciseEvent(event), false);
  assert.equal(isFuzzyEvent(event), false);
});

test("eventsByDay expands a multi-day date_range across each covered day", () => {
  const event = makeEvent({
    startDate: "2026-07-03",
    endDate: "2026-07-05",
    datePrecision: "date_range",
  });
  const byDay = eventsByDay([event]);
  assert.deepEqual(Object.keys(byDay).sort(), ["2026-07-03", "2026-07-04", "2026-07-05"]);
  assert.deepEqual(coveredDays(event), ["2026-07-03", "2026-07-04", "2026-07-05"]);
});

test("eventsByDay places a single exact event on exactly one day", () => {
  const event = makeEvent({ startDate: "2026-07-03", datePrecision: "exact" });
  const byDay = eventsByDay([event]);
  assert.deepEqual(Object.keys(byDay), ["2026-07-03"]);
  assert.equal(byDay["2026-07-03"].length, 1);
});

test("eventsByDay ignores fuzzy events entirely", () => {
  const fuzzy = makeEvent({ datePrecision: "month", startDate: "2026-07-01" });
  assert.deepEqual(eventsByDay([fuzzy]), {});
});

test("fuzzyEventsByMonth buckets fuzzy precisions under their anchor month and excludes precise", () => {
  const events = [
    makeEvent({ id: "a", datePrecision: "month", startDate: "2026-07-01" }),
    makeEvent({ id: "b", datePrecision: "week", startDate: "2026-07-20" }),
    makeEvent({ id: "c", datePrecision: "month_window", startDate: "2026-08-01" }),
    makeEvent({ id: "d", datePrecision: "unknown", startDate: "2026-07-15" }),
    makeEvent({ id: "e", datePrecision: "exact", startDate: "2026-07-03" }),
  ];
  const byMonth = fuzzyEventsByMonth(events);
  assert.deepEqual(byMonth["2026-07"].map((e) => e.id).sort(), ["a", "b", "d"]);
  assert.deepEqual(byMonth["2026-08"].map((e) => e.id), ["c"]);
});

test("dayDotIndex marks only precise-event days with a count", () => {
  const events = [
    makeEvent({ id: "a", startDate: "2026-07-03" }),
    makeEvent({ id: "b", startDate: "2026-07-03" }),
    makeEvent({ id: "c", datePrecision: "month", startDate: "2026-07-01" }),
  ];
  const index = dayDotIndex(events);
  assert.deepEqual(Object.keys(index), ["2026-07-03"]);
  assert.equal(index["2026-07-03"].count, 2);
});

test("stackOverlaps gives two overlapping timed events distinct columns", () => {
  const events = [
    makeEvent({ id: "a", startTime: "20:00", endTime: "22:30", allDay: false }),
    makeEvent({ id: "b", startTime: "20:30", endTime: "21:30", allDay: false }),
  ];
  const stacked = stackOverlaps(events);
  assert.equal(stacked.length, 2);
  assert.equal(stacked[0].columnCount, 2);
  assert.equal(stacked[1].columnCount, 2);
  assert.notEqual(stacked[0].column, stacked[1].column);
});

test("stackOverlaps keeps non-overlapping events in a single column", () => {
  const events = [
    makeEvent({ id: "a", startTime: "09:00", endTime: "10:00", allDay: false }),
    makeEvent({ id: "b", startTime: "14:00", endTime: "15:00", allDay: false }),
  ];
  const stacked = stackOverlaps(events);
  assert.equal(stacked.every((s) => s.columnCount === 1), true);
});

test("touching events (end == next start) do not stack", () => {
  const events = [
    makeEvent({ id: "a", startTime: "09:00", endTime: "10:00", allDay: false }),
    makeEvent({ id: "b", startTime: "10:00", endTime: "11:00", allDay: false }),
  ];
  const stacked = stackOverlaps(events);
  assert.equal(stacked.every((s) => s.columnCount === 1), true);
});

test("stackOverlaps derives an end from duration when endTime is missing", () => {
  const events = [
    makeEvent({ id: "a", startTime: "20:00", endTime: "", duration: 2, durationUnit: "hours", allDay: false }),
    makeEvent({ id: "b", startTime: "21:00", endTime: "", duration: 30, durationUnit: "minutes", allDay: false }),
  ];
  const stacked = stackOverlaps(events);
  // a runs 20:00-22:00, b runs 21:00-21:30 -> they overlap -> two columns
  assert.equal(stacked[0].columnCount, 2);
});

test("dayAgenda puts all-day events first, then timed events ordered by start", () => {
  const events = [
    makeEvent({ id: "timed-late", startTime: "18:00", endTime: "19:00", allDay: false }),
    makeEvent({ id: "allday", allDay: true, startTime: "" }),
    makeEvent({ id: "timed-early", startTime: "09:00", endTime: "10:00", allDay: false }),
  ];
  const agenda = dayAgenda(events, "2026-07-03");
  assert.deepEqual(agenda.map((e) => e.id), ["allday", "timed-early", "timed-late"]);
  assert.equal(agenda.every((e) => typeof e.column === "number" && typeof e.columnCount === "number"), true);
});

test("dayOverlapGroups separates all-day events and groups overlapping timed events into clusters", () => {
  const events = [
    makeEvent({ id: "allday", allDay: true, startTime: "" }),
    makeEvent({ id: "morning", startTime: "09:00", endTime: "10:00", allDay: false }),
    makeEvent({ id: "overlap-a", startTime: "20:00", endTime: "22:00", allDay: false }),
    makeEvent({ id: "overlap-b", startTime: "20:30", endTime: "21:00", allDay: false }),
  ];
  const { allDay, groups } = dayOverlapGroups(events, "2026-07-03");
  assert.deepEqual(allDay.map((e) => e.id), ["allday"]);
  // morning is alone; the two evening events share a cluster of 2 columns.
  assert.equal(groups.length, 2);
  const eveningGroup = groups.find((g) => g.length === 2);
  assert.ok(eveningGroup);
  assert.equal(eveningGroup.every((e) => e.columnCount === 2), true);
  assert.deepEqual(eveningGroup.map((e) => e.column).sort(), [0, 1]);
});

test("nextEventDate / prevEventDate skip to the nearest populated date and return null when none", () => {
  const events = [
    makeEvent({ id: "a", startDate: "2026-03-10" }),
    makeEvent({ id: "b", startDate: "2026-09-22" }),
    makeEvent({ id: "c", startDate: "2026-12-01" }),
  ];
  assert.equal(nextEventDate(events, "2026-06-30"), "2026-09-22");
  assert.equal(prevEventDate(events, "2026-06-30"), "2026-03-10");
  assert.equal(nextEventDate(events, "2026-12-31"), null);
  assert.equal(prevEventDate(events, "2026-01-01"), null);
});
