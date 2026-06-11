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
  reminderIntervalDuration,
  reminderScheduleDraftForSuggestion,
  reminderTimeLabel
} from "../capturePresentation";
import { AiFieldInsight, AnimatedBottomSheet, MotionPressable, SheetHeader, ToggleSwitch } from "../ui/components";
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

function datePrecision(startDate: string, endDate: string): ReminderDatePrecision {
  if (!startDate) return "unknown";
  return startDate === endDate ? "exact" : "date_range";
}

function timePrecision(startTime: string, endTime: string): ReminderTimePrecision {
  if (startTime && endTime) return "time_range";
  if (startTime) return "exact";
  return "unknown";
}

// A reminder can be all-day (no clock time, just the day or range of days) or
// timed. We keep the draft's times exactly as they come in — empty means all-day
// — and only stamp the sensible morning window when the user turns the all-day
// switch off.
const DEFAULT_TIMES = { start: DEFAULT_REMINDER_START_TIME, end: DEFAULT_REMINDER_END_TIME };

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
  fillSide,
  onChange,
  onActiveChange,
  testID
}: {
  label: string;
  value: string;
  dateText: string;
  fillSide: "left" | "right";
  onChange: (next: string) => void;
  onActiveChange: (active: boolean) => void;
  testID?: string;
}) {
  const trackWidthRef = useRef(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Keep the gesture once it starts so the parent ScrollView can't steal it.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event: GestureResponderEvent) => {
        onActiveChangeRef.current(true);
        applyTouch(event.nativeEvent.locationX);
      },
      onPanResponderMove: (event: GestureResponderEvent) => applyTouch(event.nativeEvent.locationX),
      onPanResponderRelease: () => onActiveChangeRef.current(false),
      onPanResponderTerminate: () => onActiveChangeRef.current(false)
    })
  ).current;

  // Map the touch to the thumb centre over the same usable range the thumb is
  // drawn across, clamped so the ends lock at 12:00 AM and 11:45 PM instead of
  // running past the visible track.
  function applyTouch(x: number) {
    const width = trackWidthRef.current;
    if (!width) return;
    const usable = Math.max(1, width - THUMB_WIDTH);
    const center = Math.max(THUMB_WIDTH / 2, Math.min(width - THUMB_WIDTH / 2, x));
    const fraction = (center - THUMB_WIDTH / 2) / usable;
    const minutes = Math.round((fraction * SLIDER_MAX) / SLIDER_STEP) * SLIDER_STEP;
    onChangeRef.current(minutesToClock(Math.max(0, Math.min(SLIDER_MAX, minutes))));
  }

  const usable = Math.max(0, trackWidth - THUMB_WIDTH);
  const fraction = clockToMinutes(value) / SLIDER_MAX;
  const thumbLeft = usable * fraction;
  const thumbCenter = thumbLeft + THUMB_WIDTH / 2;
  const fillStyle = fillSide === "right"
    ? { left: thumbCenter, right: 0 }
    : { left: 0, width: thumbCenter };

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
        <View pointerEvents="none" style={styles.timeSliderTrack} />
        {trackWidth ? <View pointerEvents="none" style={[styles.timeSliderFill, fillStyle]} /> : null}
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
  const initialDraft = useMemo(() => reminderScheduleDraftForSuggestion(reminder), [reminder]);
  const [draft, setDraft] = useState<ReminderScheduleDraft>(initialDraft);
  // A reminder opens all-day when it arrives without a start time: a brand-new
  // manual reminder, or an AI suggestion that's about a day rather than a clock
  // time. An AI suggestion that carries a time opens timed, with its sliders.
  const [isAllDay, setIsAllDay] = useState(() => !initialDraft.startTime);
  // Suppress the out-of-order warning while a slider is being dragged so it can't
  // flicker as the value snaps across the boundary; it settles in on release.
  const [sliderActive, setSliderActive] = useState(false);
  // Remember the last timed values so a round-trip through the all-day switch
  // restores the user's chosen time instead of always snapping back to 9:00.
  const lastTimesRef = useRef(
    initialDraft.startTime ? { start: initialDraft.startTime, end: initialDraft.endTime } : DEFAULT_TIMES
  );

  useEffect(() => {
    if (!visible) return;
    const next = reminderScheduleDraftForSuggestion(reminder);
    setDraft(next);
    setIsAllDay(!next.startTime);
    lastTimesRef.current = next.startTime ? { start: next.startTime, end: next.endTime } : DEFAULT_TIMES;
  }, [reminder, visible]);

  const today = useMemo(() => dateStringFromDate(new Date()), []);
  // Don't disable an already-selected start that's earlier than today (editing
  // an existing reminder); otherwise anchor selection to today forward.
  const minDate = draft.startDate && draft.startDate < today ? draft.startDate : today;
  const sameDay = draft.startDate === draft.endDate;
  const startTimeLabel = reminderTimeLabel(draft.startDate, draft.startTime);
  const endTimeLabel = reminderTimeLabel(draft.endDate, draft.endTime);
  const invalidTimeRange = Boolean(
    sameDay &&
      timeMinutes(draft.endTime) !== null &&
      timeMinutes(draft.startTime) !== null &&
      timeMinutes(draft.endTime)! <= timeMinutes(draft.startTime)!
  );
  const dateInvalid = !draft.startDate || !draft.endDate || draft.endDate < draft.startDate;
  const saveDisabled = dateInvalid || invalidTimeRange;
  // While a slider is dragging, don't reflect the time-range error in the Save
  // button — you can't tap it mid-drag anyway, and toggling it as the value
  // snaps across the boundary reads as a flicker. It settles in on release.
  const confirmDisabled = dateInvalid || (invalidTimeRange && !sliderActive);
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

  function toggleAllDay(next: boolean) {
    setIsAllDay(next);
    if (next) {
      if (draft.startTime) lastTimesRef.current = { start: draft.startTime, end: draft.endTime };
      setTimeRange("", "");
    } else {
      setTimeRange(
        draft.startTime || lastTimesRef.current.start || DEFAULT_REMINDER_START_TIME,
        draft.endTime || lastTimesRef.current.end || DEFAULT_REMINDER_END_TIME
      );
    }
  }

  // Start and end move independently; an out-of-order same-day range is caught
  // by the warning + disabled Save below rather than auto-corrected.
  function handleStartTime(next: string) {
    setTimeRange(next, draft.endTime);
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
        confirmDisabled={confirmDisabled}
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
              {!isAllDay && startTimeLabel ? (
                <Text style={styles.reminderSummaryTime}>
                  {startTimeLabel}
                  {endTimeLabel && endTimeLabel !== startTimeLabel ? ` – ${endTimeLabel}` : ""}
                </Text>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.reminderSummary}>
            <View style={styles.reminderSummaryCol}>
              <Text adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={styles.reminderSummaryDate}>
                {summaryDate(draft.startDate)}
              </Text>
              {!isAllDay && startTimeLabel ? <Text style={styles.reminderSummaryTime}>{startTimeLabel}</Text> : null}
            </View>
            <View style={styles.reminderSummaryArrow}>
              <ArrowRight color={colors.ink} size={20} weight="bold" />
            </View>
            <View style={styles.reminderSummaryCol}>
              <Text adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={styles.reminderSummaryDate}>
                {summaryDate(draft.endDate)}
              </Text>
              {!isAllDay && endTimeLabel ? <Text style={styles.reminderSummaryTime}>{endTimeLabel}</Text> : null}
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
            <View style={styles.reminderFieldSectionHeaderLead}>
              <Clock color={colors.muted} size={18} weight="bold" />
              <Text style={styles.reminderFieldSectionTitle}>Time</Text>
            </View>
            <View style={styles.reminderAllDayToggle}>
              <Text style={styles.reminderAllDayLabel}>All day</Text>
              <ToggleSwitch
                accessibilityLabel="All day, no specific time"
                onValueChange={toggleAllDay}
                testID="pc.reminder.all-day"
                value={isAllDay}
              />
            </View>
          </View>
          {!isAllDay ? (
            <>
              <TimeSlider
                dateText={draft.startDate}
                fillSide="right"
                label="Start"
                onActiveChange={setSliderActive}
                onChange={handleStartTime}
                testID="pc.reminder.start-time"
                value={draft.startTime}
              />
              <TimeSlider
                dateText={draft.endDate}
                fillSide="left"
                label="End"
                onActiveChange={setSliderActive}
                onChange={handleEndTime}
                testID="pc.reminder.end-time"
                value={draft.endTime}
              />
              <View style={styles.reminderWarningSlot}>
                {invalidTimeRange && !sliderActive ? (
                  <View style={styles.reminderWarning}>
                    <Text numberOfLines={1} style={styles.reminderWarningText}>
                      End time must be after the start time.
                    </Text>
                  </View>
                ) : null}
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
      {typeof reminderIndex === "number" && onRemove ? (
        <MotionPressable
          accessibilityRole="button"
          onPress={() => onRemove(reminderIndex)}
          style={({ pressed }) => [styles.sheetActionRow, pressed && styles.subtlePressed]}
          testID="pc.reminder.remove"
        >
          <Trash color={colors.danger} size={20} weight="bold" />
          <Text style={styles.dangerButtonText}>Remove reminder</Text>
        </MotionPressable>
      ) : null}
    </AnimatedBottomSheet>
  );
}
