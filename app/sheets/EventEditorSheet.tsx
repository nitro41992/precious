import { useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { CalendarBlank, CaretDown, Clock, Trash } from "phosphor-react-native";

import type { CalendarEvent } from "../calendarLogic";
import {
  DEFAULT_REMINDER_END_TIME,
  DEFAULT_REMINDER_START_TIME,
  dateFromReminderParts,
  dateStringFromDate,
  deviceTimeZone,
  reminderIntervalDuration
} from "../capturePresentation";
import { AnimatedBottomSheet, MotionPressable, SheetHeader, ToggleSwitch } from "../ui/components";
import { RangeCalendar } from "../ui/RangeCalendar";
import { TimeSlider } from "./ReminderEditorSheet";
import { calendarStyles as cs } from "../ui/calendarStyles";
import { styles } from "../ui/styles";
import { Text, TextInput } from "../ui/typography";
import { colors } from "../ui/theme";

type EventDraft = {
  title: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  timezone: string;
};

function timeMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function draftFromTarget(
  event: CalendarEvent | null,
  seedDate: string | null,
  today: string
): EventDraft {
  const startDate = event?.startDate || seedDate || today;
  return {
    title: event?.title || "",
    startDate,
    endDate: event?.endDate || startDate,
    startTime: event?.startTime || "",
    endTime: event?.endTime || "",
    allDay: event ? event.allDay : true,
    timezone: event?.timezone || deviceTimeZone()
  };
}

export function EventEditorSheet({
  event,
  onClose,
  onDelete,
  onSave,
  seedDate,
  visible
}: {
  event: CalendarEvent | null;
  onClose: () => void;
  onDelete?: (eventId: string) => void;
  onSave: (body: Record<string, unknown>, eventId?: string | null) => void;
  seedDate: string | null;
  visible: boolean;
}) {
  const today = useMemo(() => dateStringFromDate(new Date()), []);
  const [draft, setDraft] = useState<EventDraft>(() => draftFromTarget(event, seedDate, today));
  const [sliderActive, setSliderActive] = useState(false);
  // The date is already known (the tapped day, or today), so the picker stays collapsed behind a
  // compact summary — no second full-screen calendar unless you actually want to change the date.
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDraft(draftFromTarget(event, seedDate, today));
    setShowDatePicker(false);
  }, [event, seedDate, today, visible]);

  const dateSummary = useMemo(() => {
    const format = (value: string) =>
      dateFromReminderParts(value).toLocaleDateString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric"
      });
    if (!draft.startDate) return "Pick a date";
    return draft.startDate === draft.endDate
      ? format(draft.startDate)
      : `${format(draft.startDate)} – ${format(draft.endDate)}`;
  }, [draft.startDate, draft.endDate]);

  const minDate = draft.startDate && draft.startDate < today ? draft.startDate : today;
  const sameDay = draft.startDate === draft.endDate;
  const invalidTimeRange = Boolean(
    !draft.allDay &&
      sameDay &&
      timeMinutes(draft.endTime) !== null &&
      timeMinutes(draft.startTime) !== null &&
      timeMinutes(draft.endTime)! <= timeMinutes(draft.startTime)!
  );
  const dateInvalid = !draft.startDate || !draft.endDate || draft.endDate < draft.startDate;
  const saveDisabled = !draft.title.trim() || dateInvalid || invalidTimeRange;
  const confirmDisabled = !draft.title.trim() || dateInvalid || (invalidTimeRange && !sliderActive);

  function setDateRange(startDate: string, endDate: string) {
    setDraft((current) => ({ ...current, startDate, endDate }));
  }

  function toggleAllDay(next: boolean) {
    setDraft((current) => ({
      ...current,
      allDay: next,
      startTime: next ? "" : current.startTime || DEFAULT_REMINDER_START_TIME,
      endTime: next ? "" : current.endTime || DEFAULT_REMINDER_END_TIME
    }));
  }

  function save() {
    if (saveDisabled) return;
    const startTime = draft.allDay ? "" : draft.startTime;
    const endTime = draft.allDay ? "" : draft.endTime;
    const duration = reminderIntervalDuration(draft.startDate, draft.endDate, startTime, endTime);
    onSave(
      {
        title: draft.title.trim(),
        start_date: draft.startDate,
        end_date: draft.endDate,
        start_time: startTime || null,
        end_time: endTime || null,
        all_day: draft.allDay,
        timezone: draft.timezone || deviceTimeZone(),
        date_precision: draft.startDate === draft.endDate ? "exact" : "date_range",
        time_precision: startTime && endTime ? "time_range" : startTime ? "exact" : "unknown",
        duration: duration.duration,
        duration_unit: duration.durationUnit
      },
      event ? event.id : null
    );
  }

  // Detected (capture-backed) events are edited through the capture itself, so the editor only
  // offers delete for manual events the user created here.
  const canDelete = Boolean(event && event.source === "manual" && onDelete);

  return (
    <AnimatedBottomSheet
      closeLabel="Close event editor"
      onClose={onClose}
      sheetStyle={[styles.actionSheet, styles.reminderSheet]}
      visible={visible}
    >
      <View style={styles.sheetGrabber} />
      <SheetHeader
        closeLabel="Close event editor"
        confirmDisabled={confirmDisabled}
        confirmLabel="Save event"
        confirmTestID="pc.event.save"
        onClose={onClose}
        onConfirm={save}
        title={event ? "Edit event" : "New event"}
      />
      <ScrollView
        contentContainerStyle={styles.reminderSheetScrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.reminderSheetScroll}
      >
        <TextInput
          onChangeText={(value) => setDraft((current) => ({ ...current, title: value }))}
          placeholder="Event title"
          placeholderTextColor={colors.placeholder}
          style={cs.eventTitleField}
          testID="pc.event.title"
          value={draft.title}
        />
        <MotionPressable
          accessibilityLabel="Change date"
          accessibilityRole="button"
          onPress={() => setShowDatePicker((open) => !open)}
          style={({ pressed }) => [cs.eventDateRow, pressed && cs.eventDateRowPressed]}
          testID="pc.event.date"
        >
          <CalendarBlank color={colors.accentText} size={18} weight="bold" />
          <Text style={cs.eventDateValue}>{dateSummary}</Text>
          <CaretDown
            color={colors.muted}
            size={16}
            style={showDatePicker ? { transform: [{ rotate: "180deg" }] } : undefined}
            weight="bold"
          />
        </MotionPressable>
        {showDatePicker ? (
          <RangeCalendar
            endDate={draft.endDate}
            minDate={minDate}
            onChange={setDateRange}
            startDate={draft.startDate}
          />
        ) : null}
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
                testID="pc.event.all-day"
                value={draft.allDay}
              />
            </View>
          </View>
          {!draft.allDay ? (
            <>
              <TimeSlider
                dateText={draft.startDate}
                fillSide="right"
                label="Start"
                onActiveChange={setSliderActive}
                onChange={(next) => setDraft((current) => ({ ...current, startTime: next }))}
                testID="pc.event.start-time"
                value={draft.startTime}
              />
              <TimeSlider
                dateText={draft.endDate}
                fillSide="left"
                label="End"
                onActiveChange={setSliderActive}
                onChange={(next) => setDraft((current) => ({ ...current, endTime: next }))}
                testID="pc.event.end-time"
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
      {canDelete ? (
        <MotionPressable
          accessibilityRole="button"
          onPress={() => event && onDelete && onDelete(event.id)}
          style={({ pressed }) => [styles.sheetActionRow, pressed && styles.subtlePressed]}
          testID="pc.event.delete"
        >
          <Trash color={colors.danger} size={20} weight="bold" />
          <Text style={styles.dangerButtonText}>Delete event</Text>
        </MotionPressable>
      ) : null}
    </AnimatedBottomSheet>
  );
}
