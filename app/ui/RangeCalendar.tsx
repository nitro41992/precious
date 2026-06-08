import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, View } from "react-native";
import { CaretLeft, CaretRight } from "phosphor-react-native";

import {
  buildMonthGrid,
  dateStringFromDate,
  isWithinRange,
  monthForDate,
  monthLabel,
  nextDateRange,
  shiftMonth
} from "../capturePresentation";
import { IconButton, MotionPressable } from "./components";
import { styles } from "./styles";
import { Text } from "./typography";

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

// Inline, swipeable single-month range calendar (flight-style). The component
// owns only the visible month; the selected range lives in the parent draft and
// flows back in via props, so the two can never drift. Selection logic is the
// pure `nextDateRange` helper.
export function RangeCalendar({
  startDate,
  endDate,
  onChange,
  minDate
}: {
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
  minDate?: string;
}) {
  const [view, setView] = useState(() => monthForDate(startDate));
  const today = useMemo(() => dateStringFromDate(new Date()), []);

  // Re-sync the visible month when the start date changes from outside (e.g. an
  // AI suggestion prefills the draft). Not driven by taps, so selecting a
  // trailing/leading day never yanks the user to another month.
  useEffect(() => {
    if (!startDate) return;
    setView(monthForDate(startDate));
  }, [startDate]);

  const cells = useMemo(() => buildMonthGrid(view.year, view.month), [view.year, view.month]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dx <= -24) setView((current) => shiftMonth(current.year, current.month, 1));
        else if (gesture.dx >= 24) setView((current) => shiftMonth(current.year, current.month, -1));
      }
    })
  ).current;

  return (
    <View style={styles.rangeCalendar}>
      <View style={styles.rangeCalendarHeader}>
        <IconButton
          Icon={CaretLeft}
          label="Previous month"
          onPress={() => setView((current) => shiftMonth(current.year, current.month, -1))}
          testID="pc.reminder.month-prev"
        />
        <Text style={styles.rangeCalendarMonthLabel}>{monthLabel(view.year, view.month)}</Text>
        <IconButton
          Icon={CaretRight}
          label="Next month"
          onPress={() => setView((current) => shiftMonth(current.year, current.month, 1))}
          testID="pc.reminder.month-next"
        />
      </View>
      <View style={styles.rangeWeekRow}>
        {WEEKDAY_INITIALS.map((initial, index) => (
          <Text key={`${initial}-${index}`} style={styles.rangeWeekday}>
            {initial}
          </Text>
        ))}
      </View>
      <View style={styles.rangeGrid} {...panResponder.panHandlers}>
        {cells.map((cell) => {
          const disabled = Boolean(minDate && cell.date < minDate);
          const inRange = isWithinRange(cell.date, startDate, endDate);
          const isStart = Boolean(startDate) && cell.date === startDate;
          const isEnd = Boolean(endDate) && cell.date === endDate;
          const isEndpoint = isStart || isEnd;
          const isToday = cell.date === today;
          const trackStyle = inRange
            ? [
                styles.rangeTrack,
                isStart && isEnd && styles.rangeTrackSingle,
                isStart && !isEnd && styles.rangeTrackStart,
                isEnd && !isStart && styles.rangeTrackEnd
              ]
            : null;
          return (
            <MotionPressable
              accessibilityRole="button"
              disabled={disabled}
              key={cell.date}
              onPress={() => onChange(...rangeArgs(nextDateRange(startDate, endDate, cell.date)))}
              style={styles.rangeCell}
              testID={`pc.reminder.day.${cell.date}`}
            >
              {trackStyle ? <View pointerEvents="none" style={trackStyle} /> : null}
              {isEndpoint ? (
                <View style={styles.rangeEndpoint}>
                  <Text style={styles.rangeEndpointText}>{cell.day}</Text>
                </View>
              ) : (
                <Text
                  style={[
                    styles.rangeDayText,
                    !cell.inMonth && styles.rangeDayOutside,
                    isToday && styles.rangeDayToday,
                    disabled && styles.rangeDayDisabled
                  ]}
                >
                  {cell.day}
                </Text>
              )}
            </MotionPressable>
          );
        })}
      </View>
    </View>
  );
}

function rangeArgs(range: { startDate: string; endDate: string }): [string, string] {
  return [range.startDate, range.endDate];
}
