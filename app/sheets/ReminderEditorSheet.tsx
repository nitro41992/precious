import { useEffect, useMemo, useRef, useState } from "react";
import type { GestureResponderEvent, LayoutChangeEvent } from "react-native";
import { PanResponder, ScrollView, View } from "react-native";
import { ArrowRight, Clock, Trash } from "phosphor-react-native";

import type { CaptureFieldRationale, ReminderDatePrecision, ReminderScheduleDraft, ReminderSuggestion, ReminderTimePrecision } from "../types";
import {
  DEFAULT_REMINDER_END_TIME,
  DEFAULT_REMINDER_START_TIME,
  dateFromReminderParts,
  dateStringFromDate,
  deviceTimeZone,
  reminderDurationLabel,
  reminderIntervalDuration,
  reminderScheduleDraftForSuggestion,
  reminderTimeLabel
} from "../capturePresentation";
import { AiFieldInsight, AnimatedBottomSheet, MotionPressable, SheetHeader } from "../ui/components";
import { RangeCalendar } from "../ui/RangeCalendar";
import { styles } from "../ui/styles";
import { Text } from "../ui/typography";
import { colors } from "../ui/theme";

const SLIDER_STEP = 15;
const SLIDER_MAX = 24 * 60 - SLIDER_STEP; // last selectable slot: 23:45
const THUMB_WIDTH = 92;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function clockToMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  if (!match) return 9 * 60;
  return Math.max(0, Math.min(SLIDER_MAX, Number(match[1]) * 60 + Number(match[2])));
}

function minutesToClock(minutes: number) {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

function timeMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function addMinutes(value: string, minutes: number) {
  const current = timeMinutes(value);
  if (current === null) return "";
  const next = current + minutes;
  if (next >= 24 * 60) return "";
  return `${pad(Math.floor(next / 60))}:${pad(next % 60)}`;
}

function datePrecision(startDate: string, endDate: string): ReminderDatePrecision {
  if (!startDate) return "unknown";
  return startDate === endDate ? "exact" : "date_range";
}

function timePrecision(startTime: string, endTime: string): ReminderTimePrecision {
  if (startTime && endTime) return "time_range";
  if (startTime) return "exact";
  return "unknown";
}

// Every reminder needs a fire time, so empty times default to a sensible morning
// window. A single-day reminder is just tapping one day on the calendar — there
// is no separate all-day mode.
function withDefaultTimes(draft: ReminderScheduleDraft): ReminderScheduleDraft {
  const startTime = draft.startTime || DEFAULT_REMINDER_START_TIME;
  const endTime = draft.endTime || DEFAULT_REMINDER_END_TIME;
  return { ...draft, startTime, endTime, timePrecision: timePrecision(startTime, endTime) };
}

function summaryDate(dateText: string) {
  if (!dateText) return "";
  return dateFromReminderParts(dateText).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

// Turo-style time slider: drag the pill thumb along a full-day track; the time it
// shows carries AM/PM, so no separate meridiem control is needed. Snaps to 15
// minutes.
function TimeSlider({
  label,
  value,
  dateText,
  onChange,
  testID
}: {
  label: string;
  value: string;
  dateText: string;
  onChange: (next: string) => void;
  testID?: string;
}) {
  const trackWidthRef = useRef(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event: GestureResponderEvent) => applyTouch(event.nativeEvent.locationX),
      onPanResponderMove: (event: GestureResponderEvent) => applyTouch(event.nativeEvent.locationX)
    })
  ).current;

  function applyTouch(x: number) {
    const width = trackWidthRef.current;
    if (!width) return;
    const fraction = Math.max(0, Math.min(1, x / width));
    const minutes = Math.min(SLIDER_MAX, Math.round((fraction * SLIDER_MAX) / SLIDER_STEP) * SLIDER_STEP);
    onChangeRef.current(minutesToClock(minutes));
  }

  const fraction = clockToMinutes(value) / SLIDER_MAX;
  const thumbLeft = trackWidth
    ? Math.max(0, Math.min(trackWidth - THUMB_WIDTH, fraction * trackWidth - THUMB_WIDTH / 2))
    : 0;
  const fillWidth = trackWidth ? Math.max(0, Math.min(trackWidth, fraction * trackWidth)) : 0;

  return (
    <View style={styles.timeSlider} testID={testID}>
      <Text style={styles.timeSliderLabel}>{label}</Text>
      <View
        onLayout={(event: LayoutChangeEvent) => {
          const width = event.nativeEvent.layout.width;
          trackWidthRef.current = width;
          setTrackWidth(width);
        }}
        style={styles.timeSliderTrackWrap}
        {...responder.panHandlers}
      >
        <View style={styles.timeSliderTrack} />
        <View style={[styles.timeSliderFill, { width: fillWidth }]} />
        <View pointerEvents="none" style={[styles.timeSliderThumb, { left: thumbLeft }]}>
          <Text style={styles.timeSliderThumbText}>{reminderTimeLabel(dateText, value)}</Text>
        </View>
      </View>
    </View>
  );
}

export function ReminderEditorSheet({
  onClose,
  onRemove,
  onSave,
  rationale,
  reminder,
  reminderIndex,
  visible
}: {
  onClose: () => void;
  onRemove?: (reminderIndex: number) => void;
  onSave: (draft: ReminderScheduleDraft, reminderIndex: number | null) => void;
  rationale?: CaptureFieldRationale | null;
  reminder?: ReminderSuggestion;
  reminderIndex: number | null;
  visible: boolean;
}) {
  const initialDraft = useMemo(() => withDefaultTimes(reminderScheduleDraftForSuggestion(reminder)), [reminder]);
  const [draft, setDraft] = useState<ReminderScheduleDraft>(initialDraft);

  useEffect(() => {
    if (!visible) return;
    setDraft(withDefaultTimes(reminderScheduleDraftForSuggestion(reminder)));
  }, [reminder, visible]);

  const today = useMemo(() => dateStringFromDate(new Date()), []);
  // Don't disable an already-selected start that's earlier than today (editing
  // an existing reminder); otherwise anchor selection to today forward.
  const minDate = draft.startDate && draft.startDate < today ? draft.startDate : today;
  const sameDay = draft.startDate === draft.endDate;
  const startTimeLabel = reminderTimeLabel(draft.startDate, draft.startTime);
  const endTimeLabel = reminderTimeLabel(draft.endDate, draft.endTime);
  const derivedDuration = reminderIntervalDuration(draft.startDate, draft.endDate, draft.startTime, draft.endTime);
  const previewDuration = reminderDurationLabel(derivedDuration.duration, derivedDuration.durationUnit, false);
  const invalidTimeRange = Boolean(
    sameDay &&
      timeMinutes(draft.endTime) !== null &&
      timeMinutes(draft.startTime) !== null &&
      timeMinutes(draft.endTime)! <= timeMinutes(draft.startTime)!
  );
  const saveDisabled = !draft.startDate || !draft.endDate || draft.endDate < draft.startDate || invalidTimeRange;
  const draftChanged = [
    "startDate",
    "endDate",
    "startTime",
    "endTime",
    "timezone",
    "triggerText"
  ].some((key) => String(draft[key as keyof ReminderScheduleDraft] || "") !== String(initialDraft[key as keyof ReminderScheduleDraft] || ""));

  function setDateRange(startDate: string, endDate: string) {
    setDraft((current) => ({
      ...current,
      startDate,
      endDate,
      datePrecision: datePrecision(startDate, endDate),
      timezone: current.timezone || deviceTimeZone()
    }));
  }

  function setTimeRange(startTime: string, endTime: string) {
    setDraft((current) => ({
      ...current,
      startTime,
      endTime,
      timePrecision: timePrecision(startTime, endTime),
      timezone: current.timezone || deviceTimeZone()
    }));
  }

  function handleStartTime(next: string) {
    // Keep the end after the start on a same-day range.
    const keepEnd = draft.endTime &&
      (draft.startDate !== draft.endDate || timeMinutes(draft.endTime)! > timeMinutes(next)!);
    const nextEnd = keepEnd ? draft.endTime : addMinutes(next, 30) || next;
    setTimeRange(next, nextEnd);
  }

  function handleEndTime(next: string) {
    setTimeRange(draft.startTime, next);
  }

  function save() {
    if (saveDisabled) return;
    const duration = reminderIntervalDuration(draft.startDate, draft.endDate, draft.startTime, draft.endTime);
    onSave(
      {
        ...draft,
        datePrecision: datePrecision(draft.startDate, draft.endDate),
        timePrecision: timePrecision(draft.startTime, draft.endTime),
        duration: duration.duration,
        durationUnit: duration.durationUnit,
        timezone: draft.timezone || deviceTimeZone(),
        source: reminder && !draftChanged && reminder.source !== "manual" ? "ai_prefill" : "manual"
      },
      reminderIndex
    );
  }

  return (
    <AnimatedBottomSheet
      closeLabel="Close reminder editor"
      onClose={onClose}
      sheetStyle={[styles.actionSheet, styles.reminderSheet]}
      visible={visible}
    >
      <View style={styles.sheetGrabber} />
      <SheetHeader
        closeLabel="Close reminder editor"
        confirmDisabled={saveDisabled}
        confirmLabel="Save reminder"
        confirmTestID="pc.reminder.save"
        onClose={onClose}
        onConfirm={save}
        title="Reminder"
      />
      <ScrollView
        contentContainerStyle={styles.reminderSheetScrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.reminderSheetScroll}
      >
        {rationale?.visible && !draftChanged ? <AiFieldInsight insight={rationale} /> : null}
        {sameDay ? (
          <View style={styles.reminderSummary}>
            <View style={styles.reminderSummaryColSingle}>
              <Text adjustsFontSizeToFit minimumFontScale={0.8} numberOfLines={1} style={styles.reminderSummaryDate}>
                {summaryDate(draft.startDate)}
              </Text>
              <Text style={styles.reminderSummaryTime}>
                {startTimeLabel}
                {endTimeLabel && endTimeLabel !== startTimeLabel ? ` – ${endTimeLabel}` : ""}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.reminderSummary}>
            <View style={styles.reminderSummaryCol}>
              <Text adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={styles.reminderSummaryDate}>
                {summaryDate(draft.startDate)}
              </Text>
              <Text style={styles.reminderSummaryTime}>{startTimeLabel}</Text>
            </View>
            <View style={styles.reminderSummaryArrow}>
              <ArrowRight color={colors.ink} size={20} weight="bold" />
            </View>
            <View style={styles.reminderSummaryCol}>
              <Text adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={styles.reminderSummaryDate}>
                {summaryDate(draft.endDate)}
              </Text>
              <Text style={styles.reminderSummaryTime}>{endTimeLabel}</Text>
            </View>
          </View>
        )}
        <RangeCalendar
          endDate={draft.endDate}
          minDate={minDate}
          onChange={setDateRange}
          startDate={draft.startDate}
        />
        <View style={styles.reminderFieldGroup}>
          <View style={styles.reminderFieldSectionHeader}>
            <Clock color={colors.muted} size={18} weight="regular" />
            <Text style={styles.reminderFieldSectionTitle}>Time</Text>
          </View>
          <TimeSlider
            dateText={draft.startDate}
            label="Start"
            onChange={handleStartTime}
            testID="pc.reminder.start-time"
            value={draft.startTime}
          />
          <TimeSlider
            dateText={draft.endDate}
            label="End"
            onChange={handleEndTime}
            testID="pc.reminder.end-time"
            value={draft.endTime}
          />
        </View>
        <View style={styles.reminderSummaryBlock}>
          <Text style={styles.reminderFieldSectionTitle}>Duration</Text>
          <Text style={styles.reminderSummaryText}>
            {invalidTimeRange ? "End time must be after start time" : previewDuration}
          </Text>
        </View>
      </ScrollView>
      {typeof reminderIndex === "number" && onRemove ? (
        <MotionPressable
          accessibilityRole="button"
          onPress={() => onRemove(reminderIndex)}
          style={({ pressed }) => [styles.sheetActionRow, pressed && styles.subtlePressed]}
          testID="pc.reminder.remove"
        >
          <Trash color={colors.danger} size={20} weight="regular" />
          <Text style={styles.dangerButtonText}>Remove reminder</Text>
        </MotionPressable>
      ) : null}
    </AnimatedBottomSheet>
  );
}
