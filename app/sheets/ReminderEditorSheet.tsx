import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { Bell, Calendar, Clock, X } from "phosphor-react-native";

import type { CaptureFieldRationale, ReminderDatePrecision, ReminderScheduleDraft, ReminderSuggestion, ReminderTimePrecision } from "../types";
import {
  dateFromReminderParts,
  dateStringFromDate,
  deviceTimeZone,
  reminderDateLabel,
  reminderDurationLabel,
  reminderIntervalDuration,
  reminderIntervalLabel,
  reminderScheduleDraftForSuggestion,
  reminderTimeLabel,
  timeStringFromDate
} from "../capturePresentation";
import { AiFieldInsight, AnimatedBottomSheet, IconButton } from "../ui/components";
import { styles } from "../ui/styles";
import { Text } from "../ui/typography";
import { appTheme, colors } from "../ui/theme";

type PickerMode = "date" | "time" | null;
type PickerTarget = "startDate" | "endDate" | "startTime" | "endTime" | null;

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
  return `${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`;
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
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);

  useEffect(() => {
    if (!visible) return;
    const nextDraft = reminderScheduleDraftForSuggestion(reminder);
    setDraft(nextDraft);
    setPickerTarget(null);
  }, [reminder, visible]);

  const pickerMode: PickerMode = pickerTarget === "startDate" || pickerTarget === "endDate"
    ? "date"
    : pickerTarget === "startTime" || pickerTarget === "endTime"
      ? "time"
      : null;
  const startDateLabel = reminderDateLabel(draft.startDate);
  const endDateLabel = reminderDateLabel(draft.endDate);
  const startTimeLabel = reminderTimeLabel(draft.startDate, draft.startTime);
  const endTimeLabel = reminderTimeLabel(draft.endDate || draft.startDate, draft.endTime);
  const derivedDuration = reminderIntervalDuration(draft.startDate, draft.endDate, draft.startTime, draft.endTime);
  const previewDuration = reminderDurationLabel(derivedDuration.duration, derivedDuration.durationUnit, false);
  const preview = reminderIntervalLabel(draft.startDate, draft.endDate, draft.startTime, draft.endTime) ||
    "Choose when this should resurface";
  const sameDayTimeRange = draft.startDate === draft.endDate && draft.startTime && draft.endTime;
  const invalidTimeRange = Boolean(
    sameDayTimeRange &&
      timeMinutes(draft.endTime) !== null &&
      timeMinutes(draft.startTime) !== null &&
      timeMinutes(draft.endTime)! <= timeMinutes(draft.startTime)!
  );
  const invalidPartialTime = Boolean(!draft.startTime && draft.endTime);
  const saveDisabled = !draft.startDate ||
    !draft.endDate ||
    draft.endDate < draft.startDate ||
    invalidTimeRange ||
    invalidPartialTime;
  const draftChanged = [
    "startDate",
    "endDate",
    "startTime",
    "endTime",
    "timezone",
    "triggerText"
  ].some((key) => String(draft[key as keyof ReminderScheduleDraft] || "") !== String(initialDraft[key as keyof ReminderScheduleDraft] || ""));
  const pickerDate = pickerTarget === "endDate" || pickerTarget === "endTime"
    ? draft.endDate || draft.startDate
    : draft.startDate;
  const pickerTime = pickerTarget === "endTime"
    ? draft.endTime || draft.startTime || "09:30"
    : pickerTarget === "startTime"
      ? draft.startTime || "09:00"
      : draft.startTime;
  const pickerValue = dateFromReminderParts(pickerDate, pickerTime);

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

  function handlePickerValue(date: Date) {
    if (pickerTarget === "startDate") {
      const nextStartDate = dateStringFromDate(date);
      const nextEndDate = draft.endDate && draft.endDate >= nextStartDate ? draft.endDate : nextStartDate;
      setDateRange(nextStartDate, nextEndDate);
    } else if (pickerTarget === "endDate") {
      const nextEndDate = dateStringFromDate(date);
      const nextStartDate = draft.startDate && draft.startDate <= nextEndDate ? draft.startDate : nextEndDate;
      setDateRange(nextStartDate, nextEndDate);
    } else if (pickerTarget === "startTime") {
      const nextStartTime = timeStringFromDate(date);
      const nextEndTime = draft.endTime && (!sameDayTimeRange || timeMinutes(draft.endTime)! > timeMinutes(nextStartTime)!)
        ? draft.endTime
        : addMinutes(nextStartTime, 30);
      setTimeRange(nextStartTime, nextEndTime);
    } else if (pickerTarget === "endTime") {
      setTimeRange(draft.startTime, timeStringFromDate(date));
    }
    if (Platform.OS === "android") setPickerTarget(null);
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
        <View style={styles.rationaleSheetHeader}>
          <View style={[styles.rationaleSheetHeaderIcon, styles.reminderSheetHeaderIcon]}>
            <Bell color={colors.accent} size={22} weight="regular" />
          </View>
          <View style={styles.rationaleSheetHeaderCopy}>
            <Text style={styles.sheetTitle}>Reminder</Text>
            <Text numberOfLines={1} style={styles.rationaleSheetKicker}>
              {preview}
            </Text>
          </View>
          <IconButton Icon={X} label="Close reminder editor" onPress={onClose} />
        </View>
        <ScrollView
          contentContainerStyle={styles.reminderSheetScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.reminderSheetScroll}
        >
          {rationale?.visible && !draftChanged ? (
            <AiFieldInsight insight={rationale} />
          ) : null}
          <View style={styles.reminderFieldGroup}>
            <View style={styles.reminderFieldSectionHeader}>
              <Calendar color={colors.muted} size={18} weight="regular" />
              <Text style={styles.reminderFieldSectionTitle}>Date</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPickerTarget((current) => (current === "startDate" ? null : "startDate"))}
              style={({ pressed }) => [styles.reminderFieldRow, pressed && styles.subtlePressed]}
              testID="pc.reminder.start-date"
            >
              <View style={styles.reminderFieldCopy}>
                <Text style={styles.reminderFieldLabel}>Starts</Text>
                <Text style={styles.reminderFieldValue}>{startDateLabel || "Choose start date"}</Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPickerTarget((current) => (current === "endDate" ? null : "endDate"))}
              style={({ pressed }) => [styles.reminderFieldRow, pressed && styles.subtlePressed]}
              testID="pc.reminder.end-date"
            >
              <View style={styles.reminderFieldCopy}>
                <Text style={styles.reminderFieldLabel}>Ends</Text>
                <Text style={styles.reminderFieldValue}>{endDateLabel || startDateLabel || "Choose end date"}</Text>
              </View>
            </Pressable>
          </View>
          <View style={styles.reminderFieldGroup}>
            <View style={styles.reminderFieldSectionHeader}>
              <Clock color={colors.muted} size={18} weight="regular" />
              <Text style={styles.reminderFieldSectionTitle}>Time</Text>
              {draft.startTime || draft.endTime ? (
                <Pressable onPress={() => setTimeRange("", "")} hitSlop={8}>
                  <Text style={styles.reminderInlineAction}>Clear</Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPickerTarget((current) => (current === "startTime" ? null : "startTime"))}
              style={({ pressed }) => [styles.reminderFieldRow, pressed && styles.subtlePressed]}
              testID="pc.reminder.start-time"
            >
              <View style={styles.reminderFieldCopy}>
                <Text style={styles.reminderFieldLabel}>Starts</Text>
                <Text style={[styles.reminderFieldValue, !startTimeLabel && styles.editRowPlaceholderText]}>
                  {startTimeLabel || "Add start time"}
                </Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPickerTarget((current) => (current === "endTime" ? null : "endTime"))}
              style={({ pressed }) => [styles.reminderFieldRow, pressed && styles.subtlePressed]}
              testID="pc.reminder.end-time"
            >
              <View style={styles.reminderFieldCopy}>
                <Text style={styles.reminderFieldLabel}>Ends</Text>
                <Text style={[styles.reminderFieldValue, !endTimeLabel && styles.editRowPlaceholderText]}>
                  {endTimeLabel || "Add end time"}
                </Text>
              </View>
            </Pressable>
          </View>
          {pickerMode ? (
            <View style={styles.reminderNativePickerWrap}>
              <DateTimePicker
                accentColor={colors.accent}
                display={pickerMode === "date" && Platform.OS === "ios" ? "inline" : "default"}
                mode={pickerMode}
                negativeButton={{ label: "Cancel" }}
                onDismiss={() => setPickerTarget(null)}
                onValueChange={(_, date) => handlePickerValue(date)}
                positiveButton={{ label: "Use" }}
                presentation="dialog"
                testID={`pc.reminder.${pickerTarget}.picker`}
                themeVariant={appTheme.dateTimePickerThemeVariant}
                timeZoneName={draft.timezone || deviceTimeZone()}
                value={pickerValue}
              />
              {Platform.OS === "ios" ? (
                <Pressable onPress={() => setPickerTarget(null)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Done</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <View style={styles.reminderSummaryBlock}>
            <Text style={styles.reminderFieldSectionTitle}>Duration</Text>
            <Text style={styles.reminderSummaryText}>
              {invalidPartialTime
                ? "Add a start time first"
                : invalidTimeRange
                  ? "End time must be after start time"
                  : previewDuration}
            </Text>
          </View>
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          disabled={saveDisabled}
          onPress={save}
          style={({ pressed }) => [
            styles.primaryButton,
            saveDisabled && styles.disabledButton,
            pressed && !saveDisabled && styles.primaryButtonPressed
          ]}
          testID="pc.reminder.save"
        >
          <Text style={styles.primaryButtonText}>Save reminder</Text>
        </Pressable>
        {typeof reminderIndex === "number" && onRemove ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onRemove(reminderIndex)}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.subtlePressed]}
            testID="pc.reminder.remove"
          >
            <Text style={styles.dangerButtonText}>Remove reminder</Text>
          </Pressable>
        ) : null}
    </AnimatedBottomSheet>
  );
}
