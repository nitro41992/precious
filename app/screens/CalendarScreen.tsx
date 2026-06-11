import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import { Dimensions, ScrollView, StatusBar, View } from "react-native";
import { ArrowRight, CalendarBlank, CaretLeft, CaretRight } from "phosphor-react-native";

import { dateFromReminderParts, dateStringFromDate, monthLabel } from "../capturePresentation";
import { dayAgenda, dayDotIndex, fuzzyEventsByMonth } from "../calendarLogic";
import type { CalendarEvent } from "../calendarLogic";
import type { Capture } from "../types";
import { MotionPressable } from "../ui/components";
import { calendarStyles as cs, CALENDAR_GEOMETRY as G } from "../ui/calendarStyles";
import { styles } from "../ui/styles";
import { appTheme, colors } from "../ui/theme";
import { Text } from "../ui/typography";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const SCREEN_WIDTH = Dimensions.get("window").width;
const MAX_DOTS = 3;

type CalendarScreenProps = {
  data: {
    events: CalendarEvent[];
    eventCaptures: Record<string, Capture>;
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
    onSelectEvent: (event: CalendarEvent) => void;
    renderCaptureRow: (capture: Capture, onPress: () => void) => ReactNode;
  };
};

export function CalendarScreen({ actions, data, state }: CalendarScreenProps) {
  const { events, eventCaptures, eventsError, nextEventDate } = data;
  const { visibleMonth, selectedDate } = state;
  const { onPrevMonth, onNextMonth, onToday, onJumpToNextEvent, onSelectDay, onSelectEvent, renderCaptureRow } =
    actions;

  const railRef = useRef<ScrollView | null>(null);
  const today = useMemo(() => dateStringFromDate(new Date()), []);
  // Only events whose capture actually resolved are renderable — the agenda card IS the capture
  // (DRY), so an event whose capture is gone (e.g. soft-deleted) has nothing to show. Driving dots,
  // agenda, and the fuzzy section from this one filtered list keeps every dot and section header
  // tied to a real, tappable card and never leaves an empty header floating over a void.
  const renderableEvents = useMemo(
    () => events.filter((event) => event.captureId && eventCaptures[event.captureId]),
    [events, eventCaptures]
  );
  const dots = useMemo(() => dayDotIndex(renderableEvents), [renderableEvents]);
  const monthPrefix = `${visibleMonth.year}-${String(visibleMonth.month + 1).padStart(2, "0")}`;

  const days = useMemo(() => {
    const count = new Date(visibleMonth.year, visibleMonth.month + 1, 0).getDate();
    return Array.from({ length: count }, (_, index) => {
      const day = index + 1;
      const date = new Date(visibleMonth.year, visibleMonth.month, day);
      return { day, date: dateStringFromDate(date), weekday: WEEKDAYS[date.getDay()] };
    });
  }, [visibleMonth.year, visibleMonth.month]);

  const fuzzyForMonth = useMemo(
    () => fuzzyEventsByMonth(renderableEvents)[monthPrefix] || [],
    [renderableEvents, monthPrefix]
  );
  const eventDaysThisMonth = useMemo(
    () => Object.keys(dots).filter((date) => date.startsWith(monthPrefix)).sort(),
    [dots, monthPrefix]
  );
  const monthHasContent = eventDaysThisMonth.length > 0 || fuzzyForMonth.length > 0;
  const selectedInMonth = Boolean(selectedDate && selectedDate.startsWith(monthPrefix));

  // Best practice: when a month is shown without a relevant day selected, land on the first day
  // that actually has events so the agenda is never a blank slate (Google/Apple both auto-focus a
  // day). Empty months fall through to the month empty-state instead.
  useEffect(() => {
    if (selectedInMonth || !eventDaysThisMonth.length) return;
    onSelectDay(eventDaysThisMonth[0]);
  }, [selectedInMonth, eventDaysThisMonth, onSelectDay]);

  // Keep the selected day centered in the rail; with no day selected in this month (e.g. a
  // fuzzy-only month), snap back to the 1st so the rail never lingers on the previous month's offset.
  useEffect(() => {
    if (!selectedDate || !selectedDate.startsWith(monthPrefix)) {
      railRef.current?.scrollTo({ x: 0, animated: false });
      return;
    }
    const index = Number(selectedDate.slice(8, 10)) - 1;
    const x = Math.max(0, index * G.railCellWidth - SCREEN_WIDTH / 2 + G.railCellWidth / 2);
    const handle = setTimeout(() => railRef.current?.scrollTo({ x, animated: true }), 60);
    return () => clearTimeout(handle);
  }, [selectedDate, monthPrefix]);

  const dayEvents = useMemo(
    () => (selectedInMonth && selectedDate ? dayAgenda(renderableEvents, selectedDate) : []),
    [renderableEvents, selectedDate, selectedInMonth]
  );
  const selectedDayLabel = selectedDate
    ? dateFromReminderParts(selectedDate).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })
    : "";

  function renderEventCard(event: CalendarEvent) {
    const capture = event.captureId ? eventCaptures[event.captureId] : null;
    if (!capture) return null;
    return <View key={event.id}>{renderCaptureRow(capture, () => onSelectEvent(event))}</View>;
  }

  return (
    <View style={styles.edgeToEdgeSafe}>
      <StatusBar backgroundColor={colors.transparent} barStyle={appTheme.statusBarStyle} translucent />
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
        </View>
      </View>

      <ScrollView
        contentContainerStyle={cs.railContent}
        horizontal
        ref={railRef}
        showsHorizontalScrollIndicator={false}
        style={cs.rail}
      >
        {days.map((entry) => {
          const isSelected = selectedDate === entry.date;
          const isToday = entry.date === today;
          const count = dots[entry.date]?.count ?? 0;
          return (
            <MotionPressable
              accessibilityLabel={entry.date}
              accessibilityRole="button"
              key={entry.date}
              onPress={() => onSelectDay(entry.date)}
              pressScale={0.96}
              style={cs.railCell}
              testID={`pc.calendar.day.${entry.date}`}
            >
              <Text style={[cs.railWeekday, isSelected && cs.railWeekdaySelected]}>{entry.weekday}</Text>
              <View
                style={[cs.railDisc, isToday && !isSelected && cs.railDiscToday, isSelected && cs.railDiscSelected]}
              >
                <Text
                  style={[
                    cs.railNumber,
                    isToday && !isSelected && cs.railNumberToday,
                    isSelected && cs.railNumberSelected
                  ]}
                >
                  {entry.day}
                </Text>
              </View>
              <View style={cs.railDotRow}>
                {Array.from({ length: Math.min(count, MAX_DOTS) }).map((_, i) => (
                  <View key={i} style={[cs.railDot, isSelected && cs.railDotSelected]} />
                ))}
              </View>
            </MotionPressable>
          );
        })}
      </ScrollView>

      {eventsError ? <Text style={cs.errorText}>{eventsError}</Text> : null}

      <ScrollView contentContainerStyle={cs.scrollContent} showsVerticalScrollIndicator={false}>
        {selectedInMonth ? (
          <View style={cs.section}>
            <View style={cs.sectionHeaderRow}>
              <Text numberOfLines={1} style={cs.sectionTitle}>
                {selectedDayLabel}
              </Text>
            </View>
            {dayEvents.length ? (
              dayEvents.map((event) => renderEventCard(event))
            ) : (
              <View style={cs.sectionEmpty}>
                <Text style={cs.sectionEmptyText}>Nothing scheduled</Text>
              </View>
            )}
          </View>
        ) : null}

        {fuzzyForMonth.length ? (
          <View style={cs.section}>
            <View style={cs.sectionHeaderRow}>
              <Text style={cs.sectionTitle}>
                Sometime in {monthLabel(visibleMonth.year, visibleMonth.month).split(" ")[0]}
              </Text>
            </View>
            {fuzzyForMonth.map((event) => renderEventCard(event))}
          </View>
        ) : null}

        {!monthHasContent && !selectedInMonth ? (
          <View style={cs.emptyState}>
            <View style={cs.emptyGlyphWrap}>
              <CalendarBlank color={colors.accentText} size={34} weight="regular" />
            </View>
            <Text style={cs.emptyTitle}>No events this month</Text>
            <Text style={cs.emptyText}>
              Events from your captures land here automatically — capture a date or deadline and it shows up.
            </Text>
            {nextEventDate ? (
              <MotionPressable
                accessibilityRole="button"
                onPress={onJumpToNextEvent}
                style={({ pressed }) => [cs.ghostPill, pressed && cs.ghostPillPressed]}
                testID="pc.calendar.jump-next"
              >
                <Text style={cs.ghostPillText}>Jump to next event</Text>
                <ArrowRight color={colors.accentTextStrong} size={16} weight="bold" />
              </MotionPressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
