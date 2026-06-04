import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { Bell, CalendarDays, Clock, X } from "lucide-react-native";

import type { ReminderDatePrecision, ReminderScheduleDraft, ReminderSuggestion, ReminderTimePrecision } from "../types";
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
import { IconButton } from "../ui/components";
import { styles } from "../ui/styles";
import { colors, fonts, radii, spacing } from "../ui/theme";

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

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function addMinutesToDate(value: Date, minutes: number) {
  const next = new Date(value);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

function roundUpToFiveMinutes(value: Date) {
  const next = new Date(value);
  next.setSeconds(0, 0);
  next.setMilliseconds(0);
  const remainder = next.getMinutes() % 5;
  if (remainder > 0) next.setMinutes(next.getMinutes() + (5 - remainder));
  return next;
}

function thisWeekendRange(referenceDate: Date) {
  const day = referenceDate.getDay();
  const startOffset = day === 0 ? 0 : day === 6 ? 0 : 6 - day;
  const start = addDays(referenceDate, startOffset);
  const end = day === 0 ? start : addDays(start, 1);
  return { start, end };
}

function nextWeekRange(referenceDate: Date) {
  const day = referenceDate.getDay();
  const startOffset = day === 0 ? 1 : 8 - day;
  const start = addDays(referenceDate, startOffset);
  return { start, end: addDays(start, 6) };
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
  reminder,
  reminderIndex,
  visible
}: {
  onClose: () => void;
  onRemove?: (reminderIndex: number) => void;
  onSave: (draft: ReminderScheduleDraft, reminderIndex: number | null) => void;
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

  if (!visible) return null;

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
  const pickerDate = pickerTarget === "endDate" || pickerTarget === "endTime"
    ? draft.endDate || draft.startDate
    : draft.startDate;
  const pickerTime = pickerTarget === "endTime"
    ? draft.endTime || draft.startTime || "09:30"
    : pickerTarget === "startTime"
      ? draft.startTime || "09:00"
      : draft.startTime;
  const pickerValue = dateFromReminderParts(pickerDate, pickerTime);
  const today = new Date();
  const tomorrow = addDays(today, 1);
  const weekend = thisWeekendRange(today);
  const nextWeek = nextWeekRange(today);

  function setDateRange(startDate: string, endDate: string) {
    setDraft((current) => ({
      ...current,
      startDate,
      endDate,
      datePrecision: datePrecision(startDate, endDate),
      timezone: current.timezone || deviceTimeZone()
    }));
  }

  function setFullRange(startDate: string, endDate: string, startTime: string, endTime: string) {
    setDraft((current) => ({
      ...current,
      startDate,
      endDate,
      startTime,
      endTime,
      datePrecision: datePrecision(startDate, endDate),
      timePrecision: timePrecision(startTime, endTime),
      timezone: current.timezone || deviceTimeZone()
    }));
  }

  function setDateRangeFromDates(startDate: Date, endDate = startDate) {
    setDateRange(dateStringFromDate(startDate), dateStringFromDate(endDate));
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

  function setTimeWindow(startTime: string, endTime: string) {
    const startDate = draft.startDate || dateStringFromDate(new Date());
    const endDate = draft.endDate || startDate;
    setFullRange(startDate, endDate, startTime, endTime);
  }

  function setRelativeReminder(minutesFromNow: number) {
    const start = roundUpToFiveMinutes(addMinutesToDate(new Date(), minutesFromNow));
    const end = addMinutesToDate(start, 30);
    setFullRange(
      dateStringFromDate(start),
      dateStringFromDate(end),
      timeStringFromDate(start),
      timeStringFromDate(end)
    );
  }

  const datePresets = [
    {
      id: "today",
      label: "Today",
      meta: "Same day",
      active: draft.startDate === dateStringFromDate(today) && draft.endDate === dateStringFromDate(today),
      onPress: () => setDateRangeFromDates(today)
    },
    {
      id: "tomorrow",
      label: "Tomorrow",
      meta: "Next day",
      active: draft.startDate === dateStringFromDate(tomorrow) && draft.endDate === dateStringFromDate(tomorrow),
      onPress: () => setDateRangeFromDates(tomorrow)
    },
    {
      id: "weekend",
      label: "Weekend",
      meta: "Sat-Sun",
      active: draft.startDate === dateStringFromDate(weekend.start) && draft.endDate === dateStringFromDate(weekend.end),
      onPress: () => setDateRangeFromDates(weekend.start, weekend.end)
    },
    {
      id: "next-week",
      label: "Next week",
      meta: "Mon-Sun",
      active: draft.startDate === dateStringFromDate(nextWeek.start) && draft.endDate === dateStringFromDate(nextWeek.end),
      onPress: () => setDateRangeFromDates(nextWeek.start, nextWeek.end)
    }
  ];
  const timePresets = [
    {
      id: "morning",
      label: "Morning",
      meta: "9-10",
      active: draft.startTime === "09:00" && draft.endTime === "10:00",
      onPress: () => setTimeWindow("09:00", "10:00")
    },
    {
      id: "afternoon",
      label: "Afternoon",
      meta: "2-3",
      active: draft.startTime === "14:00" && draft.endTime === "15:00",
      onPress: () => setTimeWindow("14:00", "15:00")
    },
    {
      id: "evening",
      label: "Evening",
      meta: "6-7",
      active: draft.startTime === "18:00" && draft.endTime === "19:00",
      onPress: () => setTimeWindow("18:00", "19:00")
    },
    {
      id: "no-time",
      label: "No time",
      meta: "All day",
      active: !draft.startTime && !draft.endTime,
      onPress: () => setTimeRange("", "")
    }
  ];
  const soonPresets = [
    {
      id: "thirty",
      label: "30 min",
      meta: "From now",
      onPress: () => setRelativeReminder(30)
    },
    {
      id: "one-hour",
      label: "1 hr",
      meta: "From now",
      onPress: () => setRelativeReminder(60)
    }
  ];

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
        source: reminder?.source === "manual" ? "manual" : reminder ? "ai_prefill" : "manual"
      },
      reminderIndex
    );
  }

  return (
    <View style={styles.modalLayer} pointerEvents="box-none">
      <Pressable accessibilityLabel="Close reminder editor" onPress={onClose} style={styles.modalBackdrop} />
      <View style={[styles.actionSheet, styles.reminderSheet]}>
        <View style={styles.sheetGrabber} />
        <View style={styles.rationaleSheetHeader}>
          <View style={[styles.rationaleSheetHeaderIcon, styles.reminderSheetHeaderIcon]}>
            <Bell color={colors.accent} size={22} strokeWidth={2.4} />
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
          contentContainerStyle={[styles.reminderSheetScrollContent, reminderFlowStyles.scrollContent]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.reviewInsightScroll}
        >
          <View style={reminderFlowStyles.presetBoard}>
            <View style={reminderFlowStyles.presetBoardHeader}>
              <Text style={reminderFlowStyles.presetBoardEyebrow}>Fast set</Text>
              <Text style={reminderFlowStyles.presetBoardTitle}>
                {preview}
              </Text>
            </View>
            <View style={reminderFlowStyles.presetLane}>
              <Text style={reminderFlowStyles.presetLaneLabel}>Date</Text>
              <View style={reminderFlowStyles.presetGrid}>
                {datePresets.map((preset) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: preset.active }}
                    key={preset.id}
                    onPress={preset.onPress}
                    style={({ pressed }) => [
                      reminderFlowStyles.presetChip,
                      preset.active && reminderFlowStyles.presetChipActive,
                      pressed && styles.subtlePressed
                    ]}
                  >
                    <Text style={[reminderFlowStyles.presetChipText, preset.active && reminderFlowStyles.presetChipTextActive]}>
                      {preset.label}
                    </Text>
                    <Text style={[reminderFlowStyles.presetChipMeta, preset.active && reminderFlowStyles.presetChipMetaActive]}>
                      {preset.meta}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={reminderFlowStyles.presetLane}>
              <Text style={reminderFlowStyles.presetLaneLabel}>Time</Text>
              <View style={reminderFlowStyles.presetGrid}>
                {timePresets.map((preset) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: preset.active }}
                    key={preset.id}
                    onPress={preset.onPress}
                    style={({ pressed }) => [
                      reminderFlowStyles.presetChip,
                      preset.active && reminderFlowStyles.presetChipActive,
                      pressed && styles.subtlePressed
                    ]}
                  >
                    <Text style={[reminderFlowStyles.presetChipText, preset.active && reminderFlowStyles.presetChipTextActive]}>
                      {preset.label}
                    </Text>
                    <Text style={[reminderFlowStyles.presetChipMeta, preset.active && reminderFlowStyles.presetChipMetaActive]}>
                      {preset.meta}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={reminderFlowStyles.soonRail}>
              {soonPresets.map((preset) => (
                <Pressable
                  accessibilityRole="button"
                  key={preset.id}
                  onPress={preset.onPress}
                  style={({ pressed }) => [reminderFlowStyles.soonChip, pressed && styles.subtlePressed]}
                >
                  <Text style={reminderFlowStyles.soonChipText}>{preset.label}</Text>
                  <Text style={reminderFlowStyles.soonChipMeta}>{preset.meta}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={reminderFlowStyles.manualPickerHeader}>
            <Text style={reminderFlowStyles.manualPickerTitle}>Fine tune</Text>
            <Text style={reminderFlowStyles.manualPickerCopy}>Use exact dates and times when the presets are close but not quite right.</Text>
          </View>
          <View style={[styles.reminderFieldGroup, reminderFlowStyles.manualGroup]}>
            <View style={[styles.reminderFieldSectionHeader, reminderFlowStyles.manualSectionHeader]}>
              <CalendarDays color={colors.muted} size={18} strokeWidth={2.3} />
              <Text style={styles.reminderFieldLabel}>Date</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPickerTarget((current) => (current === "startDate" ? null : "startDate"))}
              style={({ pressed }) => [styles.reminderFieldRow, reminderFlowStyles.manualRow, pressed && styles.subtlePressed]}
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
              style={({ pressed }) => [styles.reminderFieldRow, reminderFlowStyles.manualRow, pressed && styles.subtlePressed]}
              testID="pc.reminder.end-date"
            >
              <View style={styles.reminderFieldCopy}>
                <Text style={styles.reminderFieldLabel}>Ends</Text>
                <Text style={styles.reminderFieldValue}>{endDateLabel || startDateLabel || "Choose end date"}</Text>
              </View>
            </Pressable>
          </View>
          <View style={[styles.reminderFieldGroup, reminderFlowStyles.manualGroup]}>
            <View style={[styles.reminderFieldSectionHeader, reminderFlowStyles.manualSectionHeader]}>
              <Clock color={colors.muted} size={18} strokeWidth={2.3} />
              <Text style={styles.reminderFieldLabel}>Time</Text>
              {draft.startTime || draft.endTime ? (
                <Pressable onPress={() => setTimeRange("", "")} hitSlop={8}>
                  <Text style={styles.reminderInlineAction}>Clear</Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPickerTarget((current) => (current === "startTime" ? null : "startTime"))}
              style={({ pressed }) => [styles.reminderFieldRow, reminderFlowStyles.manualRow, pressed && styles.subtlePressed]}
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
              style={({ pressed }) => [styles.reminderFieldRow, reminderFlowStyles.manualRow, pressed && styles.subtlePressed]}
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
            <View style={[styles.reminderNativePickerWrap, reminderFlowStyles.nativePickerWrap]}>
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
                themeVariant="dark"
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
          <View style={[styles.reminderSummaryBlock, reminderFlowStyles.summaryBlock]}>
            <Text style={styles.reminderFieldLabel}>Duration</Text>
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
      </View>
    </View>
  );
}

const reminderFlowStyles = StyleSheet.create({
  scrollContent: {
    gap: 16
  },
  presetBoard: {
    backgroundColor: colors.surfaceContainer,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 8,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 26,
    gap: 16,
    padding: 14
  },
  presetBoardHeader: {
    gap: 4
  },
  presetBoardEyebrow: {
    color: colors.cyan,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16
  },
  presetBoardTitle: {
    color: colors.ink,
    fontFamily: fonts.displaySemi,
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 27
  },
  presetLane: {
    gap: 8
  },
  presetLaneLabel: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17
  },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  presetChip: {
    backgroundColor: colors.surfaceContainerHigh,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 6,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 18,
    flexGrow: 1,
    minHeight: 58,
    minWidth: "47%",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  presetChipActive: {
    backgroundColor: colors.accent
  },
  presetChipText: {
    color: colors.ink,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 19
  },
  presetChipTextActive: {
    color: colors.onAccent
  },
  presetChipMeta: {
    color: colors.muted,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
    marginTop: 2
  },
  presetChipMetaActive: {
    color: colors.onAccent
  },
  soonRail: {
    flexDirection: "row",
    gap: 8
  },
  soonChip: {
    backgroundColor: colors.create,
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 18,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 7,
    flex: 1,
    minHeight: 54,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  soonChipText: {
    color: colors.onCreate,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 19
  },
  soonChipMeta: {
    color: colors.onCreate,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
    opacity: 0.82
  },
  manualPickerHeader: {
    gap: 3,
    marginTop: spacing.xs
  },
  manualPickerTitle: {
    color: colors.ink,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21
  },
  manualPickerCopy: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18
  },
  manualGroup: {
    backgroundColor: colors.surface,
    borderTopWidth: 0,
    borderBottomLeftRadius: radii.lg,
    borderBottomRightRadius: radii.sm,
    borderTopLeftRadius: radii.sm,
    borderTopRightRadius: radii.lg,
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  manualSectionHeader: {
    minHeight: 38,
    paddingBottom: 2,
    paddingTop: 4
  },
  manualRow: {
    borderBottomWidth: 0,
    minHeight: 58,
    paddingVertical: 8
  },
  nativePickerWrap: {
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 8,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 18
  },
  summaryBlock: {
    borderWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 18,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 8
  }
});
