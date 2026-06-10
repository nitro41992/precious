import { useMemo, useRef } from "react";
import { PanResponder, ScrollView, StatusBar, View } from "react-native";
import { ArrowRight, CalendarBlank, CaretLeft, CaretRight, Clock, Plus } from "phosphor-react-native";

import {
  buildMonthGrid,
  dateFromReminderParts,
  dateStringFromDate,
  monthLabel,
  reminderDurationLabel,
  reminderTimeLabel
} from "../capturePresentation";
import { dayDotIndex, dayOverlapGroups, fuzzyEventsByMonth } from "../calendarLogic";
import type { CalendarEvent } from "../calendarLogic";
import { MotionPressable } from "../ui/components";
import { calendarStyles as cs } from "../ui/calendarStyles";
import { styles } from "../ui/styles";
import { appTheme, colors } from "../ui/theme";
import { Text } from "../ui/typography";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const SWIPE_THRESHOLD = 48;

type CalendarScreenProps = {
  data: {
    events: CalendarEvent[];
    eventsError: string | null;
    nextEventDate: string | null;
  };
  state: {
    visibleMonth: { year: number; month: number };
    selectedDate: string | null;
  };
  actions: {
    onPrevMonth: () => void;
    onNextMonth: () => void;
    onToday: () => void;
    onJumpToNextEvent: () => void;
    onSelectDay: (date: string) => void;
    onAddEvent: (date?: string | null) => void;
    onSelectEvent: (event: CalendarEvent) => void;
  };
};

function fuzzyCaption(event: CalendarEvent): string {
  switch (event.datePrecision) {
    case "week":
      return "Sometime that week";
    case "month_window":
      return "Within this period";
    case "unknown":
      return "Date to confirm";
    default:
      return "Sometime this month";
  }
}

function eventTimeLabel(event: CalendarEvent): string {
  if (event.allDay || !event.startTime) return "All day";
  const start = reminderTimeLabel(event.startDate, event.startTime);
  const end = event.endTime ? reminderTimeLabel(event.endDate, event.endTime) : "";
  return end && end !== start ? `${start} – ${end}` : start;
}

function EventCard({ event, onPress }: { event: CalendarEvent; onPress: () => void }) {
  const duration = reminderDurationLabel(event.duration, event.durationUnit, false);
  const timed = !event.allDay && Boolean(event.startTime);
  return (
    <MotionPressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        cs.eventCard,
        event.source === "manual" && cs.eventCardManual,
        pressed && cs.eventCardPressed
      ]}
      testID={`pc.calendar.event.${event.id}`}
    >
      {timed ? <View style={cs.eventAccentEdge} /> : null}
      <Text style={cs.eventTime}>{eventTimeLabel(event)}</Text>
      <Text numberOfLines={2} style={cs.eventTitle}>
        {event.title}
      </Text>
      {duration || event.captureId ? (
        <View style={cs.eventMetaRow}>
          {duration ? <Text style={cs.eventMeta}>{duration}</Text> : null}
          {event.captureId ? <Text style={cs.eventMeta}>From a capture</Text> : null}
        </View>
      ) : null}
    </MotionPressable>
  );
}

export function CalendarScreen({ actions, data, state }: CalendarScreenProps) {
  const { events, eventsError, nextEventDate } = data;
  const { visibleMonth, selectedDate } = state;
  const { onPrevMonth, onNextMonth, onToday, onJumpToNextEvent, onSelectDay, onAddEvent, onSelectEvent } = actions;

  const today = useMemo(() => dateStringFromDate(new Date()), []);
  const cells = useMemo(
    () => buildMonthGrid(visibleMonth.year, visibleMonth.month),
    [visibleMonth.year, visibleMonth.month]
  );
  const dots = useMemo(() => dayDotIndex(events), [events]);
  const monthPrefix = `${visibleMonth.year}-${String(visibleMonth.month + 1).padStart(2, "0")}`;
  const fuzzyForMonth = useMemo(() => fuzzyEventsByMonth(events)[monthPrefix] || [], [events, monthPrefix]);
  const monthHasContent =
    Object.keys(dots).some((date) => date.startsWith(monthPrefix)) || fuzzyForMonth.length > 0;

  const selectedInMonth = Boolean(selectedDate && selectedDate.startsWith(monthPrefix));
  const dayGroups = useMemo(
    () => (selectedInMonth && selectedDate ? dayOverlapGroups(events, selectedDate) : { allDay: [], groups: [] }),
    [events, selectedDate, selectedInMonth]
  );
  const selectedDayLabel = selectedDate
    ? dateFromReminderParts(selectedDate).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })
    : "";

  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dx) > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dx >= SWIPE_THRESHOLD) onPrevMonth();
        else if (gesture.dx <= -SWIPE_THRESHOLD) onNextMonth();
      }
    })
  ).current;

  const rows: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <View style={styles.edgeToEdgeSafe}>
      <StatusBar backgroundColor={colors.transparent} barStyle={appTheme.statusBarStyle} translucent />
      <View style={styles.topAppBarScreen}>
        <View style={cs.header}>
          <Text adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={cs.monthTitle}>
            {monthLabel(visibleMonth.year, visibleMonth.month)}
          </Text>
          <View style={cs.controlStrip}>
            <MotionPressable
              accessibilityLabel="Jump to today"
              accessibilityRole="button"
              onPress={onToday}
              style={({ pressed }) => [cs.todayPill, pressed && cs.todayPillPressed]}
              testID="pc.calendar.today"
            >
              <Text style={cs.todayPillText}>Today</Text>
            </MotionPressable>
            <MotionPressable
              accessibilityLabel="Previous month"
              accessibilityRole="button"
              onPress={onPrevMonth}
              style={({ pressed }) => [cs.iconButton, pressed && cs.iconButtonPressed]}
              testID="pc.calendar.prev"
            >
              <CaretLeft color={colors.ink} size={18} weight="bold" />
            </MotionPressable>
            <MotionPressable
              accessibilityLabel="Next month"
              accessibilityRole="button"
              onPress={onNextMonth}
              style={({ pressed }) => [cs.iconButton, pressed && cs.iconButtonPressed]}
              testID="pc.calendar.next"
            >
              <CaretRight color={colors.ink} size={18} weight="bold" />
            </MotionPressable>
            <MotionPressable
              accessibilityLabel="Add event"
              accessibilityRole="button"
              onPress={() => onAddEvent(selectedDate)}
              style={({ pressed }) => [cs.addButton, pressed && cs.addButtonPressed]}
              testID="pc.calendar.add"
            >
              <Plus color={colors.onAccent} size={20} weight="bold" />
            </MotionPressable>
          </View>
        </View>

        {eventsError ? <Text style={cs.errorText}>{eventsError}</Text> : null}

        <ScrollView contentContainerStyle={cs.scrollContent} showsVerticalScrollIndicator={false}>
          <View {...swipe.panHandlers}>
            <View style={cs.weekRow}>
              {WEEKDAYS.map((label, index) => (
                <View key={`${label}-${index}`} style={cs.weekdayCell}>
                  <Text style={cs.weekdayText}>{label}</Text>
                </View>
              ))}
            </View>

            {rows.map((week, weekIndex) => (
              <View key={weekIndex} style={cs.gridRow}>
                {week.map((cell) => {
                  const dot = dots[cell.date];
                  const isSelected = selectedDate === cell.date;
                  const isToday = cell.date === today;
                  return (
                    <MotionPressable
                      accessibilityLabel={cell.date}
                      accessibilityRole="button"
                      key={cell.date}
                      onPress={() => onSelectDay(cell.date)}
                      style={({ pressed }) => [cs.dayCell, pressed && cs.dayCellPressed]}
                      testID={`pc.calendar.day.${cell.date}`}
                    >
                      <View
                        style={[
                          cs.dayDisc,
                          isToday && !isSelected && cs.dayDiscToday,
                          isSelected && cs.dayDiscSelected
                        ]}
                      >
                        <Text
                          style={[
                            cs.dayNumber,
                            !cell.inMonth && cs.dayNumberOutside,
                            isToday && !isSelected && cs.dayNumberToday,
                            isSelected && cs.dayNumberSelected
                          ]}
                        >
                          {cell.day}
                        </Text>
                      </View>
                      <View style={cs.dotRow}>
                        {dot
                          ? dot.count > 3
                            ? <Text style={cs.dotCountText}>{`${dot.count}`}</Text>
                            : Array.from({ length: dot.count }).map((_, i) => <View key={i} style={cs.dot} />)
                          : null}
                      </View>
                    </MotionPressable>
                  );
                })}
              </View>
            ))}
          </View>

          {selectedInMonth ? (
            <View style={cs.agendaCard}>
              <View style={cs.agendaHeader}>
                <Text numberOfLines={1} style={cs.agendaDate}>
                  {selectedDayLabel}
                </Text>
                <MotionPressable
                  accessibilityLabel="Add event on this day"
                  accessibilityRole="button"
                  onPress={() => onAddEvent(selectedDate)}
                  style={({ pressed }) => [cs.agendaAddPill, pressed && cs.agendaAddPillPressed]}
                  testID="pc.calendar.day-add"
                >
                  <Plus color={colors.accentTextStrong} size={15} weight="bold" />
                  <Text style={cs.agendaAddPillText}>Add</Text>
                </MotionPressable>
              </View>
              {dayGroups.allDay.length || dayGroups.groups.length ? (
                <>
                  {dayGroups.allDay.map((event) => (
                    <EventCard event={event} key={event.id} onPress={() => onSelectEvent(event)} />
                  ))}
                  {dayGroups.groups.map((group, groupIndex) => (
                    <View key={groupIndex} style={cs.agendaGroupRow}>
                      {group.map((event) => (
                        <EventCard event={event} key={event.id} onPress={() => onSelectEvent(event)} />
                      ))}
                    </View>
                  ))}
                </>
              ) : (
                <View style={cs.agendaEmpty}>
                  <Text style={cs.agendaEmptyText}>Nothing scheduled</Text>
                </View>
              )}
            </View>
          ) : null}

          {fuzzyForMonth.length ? (
            <View style={cs.fuzzyCard}>
              <View style={cs.fuzzyHeader}>
                <Clock color={colors.accentTextStrong} size={16} weight="bold" />
                <Text style={cs.fuzzyTitle}>
                  Sometime in {monthLabel(visibleMonth.year, visibleMonth.month).split(" ")[0]}
                </Text>
              </View>
              {fuzzyForMonth.map((event) => (
                <MotionPressable
                  accessibilityRole="button"
                  key={event.id}
                  onPress={() => onSelectEvent(event)}
                  style={({ pressed }) => [cs.fuzzyRow, pressed && cs.fuzzyRowPressed]}
                >
                  <Text numberOfLines={1} style={cs.fuzzyRowTitle}>
                    {event.title}
                  </Text>
                  <Text style={cs.fuzzyRowMeta}>{fuzzyCaption(event)}</Text>
                </MotionPressable>
              ))}
            </View>
          ) : null}

          {!monthHasContent && !selectedInMonth ? (
            <View style={cs.emptyState}>
              <View style={cs.emptyGlyphWrap}>
                <CalendarBlank color={colors.accentText} size={34} weight="regular" />
              </View>
              <Text style={cs.emptyTitle}>No events this month</Text>
              <Text style={cs.emptyText}>
                Events from your captures land here automatically — and you can add your own.
              </Text>
              <View style={cs.emptyActions}>
                <MotionPressable
                  accessibilityRole="button"
                  onPress={() => onAddEvent(selectedDate)}
                  style={({ pressed }) => [cs.primaryPill, pressed && cs.primaryPillPressed]}
                  testID="pc.calendar.empty-add"
                >
                  <Plus color={colors.onAccent} size={16} weight="bold" />
                  <Text style={cs.primaryPillText}>Add event</Text>
                </MotionPressable>
                {nextEventDate ? (
                  <MotionPressable
                    accessibilityRole="button"
                    onPress={onJumpToNextEvent}
                    style={({ pressed }) => [cs.ghostPill, pressed && cs.ghostPillPressed]}
                    testID="pc.calendar.jump-next"
                  >
                    <Text style={cs.ghostPillText}>Next event</Text>
                    <ArrowRight color={colors.accentTextStrong} size={16} weight="bold" />
                  </MotionPressable>
                ) : null}
              </View>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}
