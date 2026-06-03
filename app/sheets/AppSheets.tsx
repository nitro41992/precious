import { Pressable, ScrollView, Text, View } from "react-native";
import {
  Bell,
  CircleCheck,
  CircleX,
  Folder,
  Info,
  LogOut,
  PencilLine,
  Target,
  X
} from "lucide-react-native";

import {
  INTENT_OPTIONS,
  activeIntentLabel
} from "../capturePresentation";
import type {
  Capture,
  LucideIconComponent,
  RationaleSheet,
  ReviewChecklistTask,
  ReviewTarget
} from "../types";
import { IconButton } from "../ui/components";
import { styles } from "../ui/styles";
import { colors } from "../ui/theme";

function rationaleSectionIcon(label: string): LucideIconComponent {
  switch (label) {
    case "Collections":
      return Folder;
    case "Reminder idea":
      return Bell;
    default:
      return Target;
  }
}

function rationaleSectionIconStyle(label: string) {
  switch (label) {
    case "Collections":
      return styles.rationaleSheetSectionIconCollection;
    case "Reminder idea":
      return styles.rationaleSheetSectionIconReminder;
    default:
      return styles.rationaleSheetSectionIconIntent;
  }
}

function reviewTaskIcon(target: ReviewTarget): LucideIconComponent {
  switch (target) {
    case "collections":
      return Folder;
    case "reminder":
      return Bell;
    case "analysis":
      return Info;
    default:
      return Target;
  }
}

function reviewTaskIconStyle(target: ReviewTarget) {
  switch (target) {
    case "collections":
      return styles.rationaleSheetSectionIconCollection;
    case "reminder":
      return styles.rationaleSheetSectionIconReminder;
    case "analysis":
      return styles.rationaleSheetSectionIconAnalysis;
    default:
      return styles.rationaleSheetSectionIconIntent;
  }
}

function rationaleSectionTarget(label: string): ReviewTarget | null {
  switch (label) {
    case "Save Intent":
      return "intent";
    case "Collections":
      return "collections";
    case "Reminder idea":
      return "reminder";
    default:
      return null;
  }
}

function ReviewTaskAction({
  accessibilityLabel,
  Icon,
  label,
  onPress,
  tone = "default"
}: {
  accessibilityLabel?: string;
  Icon: LucideIconComponent;
  label: string;
  onPress: () => void;
  tone?: "default" | "primary" | "danger";
}) {
  const iconColor = tone === "primary"
    ? colors.accent
    : tone === "danger"
      ? colors.danger
      : colors.secondary;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel || label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.reviewTaskAction,
        tone === "primary" && styles.reviewTaskActionPrimary,
        tone === "danger" && styles.reviewTaskActionDanger,
        pressed && styles.subtlePressed
      ]}
    >
      <Icon color={iconColor} size={22} strokeWidth={2.35} />
    </Pressable>
  );
}

export function AppSheets({
  accountSheetOpen,
  clearReviewTask,
  editReviewTask,
  onSignOut,
  rationaleEditTarget,
  rationaleSheet,
  resolveReviewTargets,
  selected,
  setAccountSheetOpen,
  setRationaleEditTarget,
  setRationaleSheet
}: {
  accountSheetOpen: boolean;
  clearReviewTask: (task: ReviewChecklistTask) => void;
  editReviewTask: (task: ReviewChecklistTask) => void;
  onSignOut: () => void;
  rationaleEditTarget: ReviewTarget | null;
  rationaleSheet: RationaleSheet | null;
  resolveReviewTargets: (targets: ReviewTarget[], options?: { currentSaveIntent?: string | null }) => Promise<void> | void;
  selected: Capture | null;
  setAccountSheetOpen: (value: boolean) => void;
  setRationaleEditTarget: (value: ReviewTarget | null) => void;
  setRationaleSheet: (value: RationaleSheet | null) => void;
}) {
  if (accountSheetOpen) {
    return (
      <View style={styles.modalLayer} pointerEvents="box-none">
        <Pressable
          accessibilityLabel="Close account actions"
          onPress={() => setAccountSheetOpen(false)}
          style={styles.modalBackdrop}
        />
        <View style={styles.actionSheet}>
          <View style={styles.sheetGrabber} />
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderCopy}>
              <Text style={styles.sheetTitle}>Settings</Text>
              <Text style={styles.sheetSubtitle}>Manage this device session.</Text>
            </View>
            <IconButton Icon={X} label="Close account actions" onPress={() => setAccountSheetOpen(false)} />
          </View>
          <Pressable
            onPress={() => {
              setAccountSheetOpen(false);
              onSignOut();
            }}
            style={({ pressed }) => [styles.sheetActionRow, pressed && styles.subtlePressed]}
          >
            <LogOut color={colors.danger} size={20} strokeWidth={2.3} />
            <View style={styles.sheetActionCopy}>
              <Text style={[styles.sheetActionTitle, styles.sheetActionDanger]}>Sign out</Text>
              <Text style={styles.sheetActionText}>Remove this session from the phone.</Text>
            </View>
          </Pressable>
        </View>
      </View>
    );
  }

  if (rationaleSheet) {
    const reviewTasks = rationaleSheet.tasks || [];
    const reviewTaskTargets = new Set(reviewTasks.map((task) => task.target));
    const insightSections = (rationaleSheet.sections || []).filter((section) => {
      const target = rationaleSectionTarget(section.label);
      return !target || !reviewTaskTargets.has(target);
    });
    const reviewSubtitle = reviewTasks.length
      ? reviewTasks.length === 1
        ? "1 detail to confirm"
        : `${reviewTasks.length} details to confirm`
      : "How this capture was interpreted";
    return (
      <View style={styles.modalLayer} pointerEvents="box-none">
        <Pressable
          accessibilityLabel="Close review insight"
          onPress={() => {
            setRationaleSheet(null);
            setRationaleEditTarget(null);
          }}
          style={styles.modalBackdrop}
        />
        <View style={[styles.actionSheet, styles.reviewInsightSheet]}>
          <View style={styles.sheetGrabber} />
          <View style={styles.rationaleSheetHeader}>
            <View style={[styles.rationaleSheetHeaderIcon, reviewTasks.length ? styles.rationaleSheetHeaderIconReview : null]}>
              <Info color={reviewTasks.length ? colors.review : colors.accent} size={22} strokeWidth={2.4} />
            </View>
            <View style={styles.rationaleSheetHeaderCopy}>
              <Text style={styles.sheetTitle}>{rationaleSheet.title}</Text>
              <Text style={styles.rationaleSheetKicker}>{reviewSubtitle}</Text>
            </View>
            <IconButton
              Icon={X}
              label="Close review insight"
              onPress={() => {
                setRationaleSheet(null);
                setRationaleEditTarget(null);
              }}
            />
          </View>
          <ScrollView
            contentContainerStyle={styles.reviewInsightScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.reviewInsightScroll}
          >
            {rationaleSheet.text ? (
              <Text style={styles.rationaleSheetLead}>{rationaleSheet.text}</Text>
            ) : null}
            {reviewTasks.length ? (
              <View style={styles.reviewChecklist}>
                <View style={styles.reviewChecklistHeader}>
                  <Text style={styles.reviewChecklistLabel}>Suggested details</Text>
                  <View style={styles.reviewChecklistCount}>
                    <Text style={styles.reviewChecklistCountText}>{reviewTasks.length}</Text>
                  </View>
                </View>
                {reviewTasks.map((task) => {
                  const TaskIcon = reviewTaskIcon(task.target);
                  const showIntentPicker = task.target === "intent" && rationaleEditTarget === "intent";
                  return (
                    <View key={task.target} style={styles.reviewChecklistTask}>
                      <View style={[styles.rationaleSheetSectionIcon, reviewTaskIconStyle(task.target)]}>
                        <TaskIcon color={colors.ink} size={18} strokeWidth={2.4} />
                      </View>
                      <View style={styles.reviewChecklistCopy}>
                        <View style={styles.reviewChecklistTaskTop}>
                          <View style={styles.reviewChecklistTaskText}>
                            <Text style={styles.rationaleSheetLabel}>{task.title}</Text>
                            <Text style={styles.reviewChecklistValue}>{task.value}</Text>
                          </View>
                          <View style={styles.reviewChecklistActions}>
                            <ReviewTaskAction
                              accessibilityLabel={task.confirmLabel}
                              Icon={CircleCheck}
                              label="Confirm"
                              onPress={() => void resolveReviewTargets([task.target])}
                              tone="primary"
                            />
                            {task.editLabel ? (
                              <ReviewTaskAction
                                accessibilityLabel={task.editLabel}
                                Icon={PencilLine}
                                label="Change"
                                onPress={() => editReviewTask(task)}
                              />
                            ) : null}
                            {task.clearLabel ? (
                              <ReviewTaskAction
                                accessibilityLabel={task.clearLabel}
                                Icon={CircleX}
                                label="Clear"
                                onPress={() => clearReviewTask(task)}
                                tone="danger"
                              />
                            ) : null}
                          </View>
                        </View>
                        <Text style={styles.rationaleSheetText}>{task.rationale}</Text>
                        {showIntentPicker ? (
                          <View style={styles.rationaleIntentOptions}>
                            {INTENT_OPTIONS.map((intent) => {
                              const selectedIntent = selected?.defaultIntent === intent;
                              return (
                                <Pressable
                                  accessibilityLabel={`Use ${activeIntentLabel(intent)} intent`}
                                  accessibilityRole="button"
                                  key={intent}
                                  accessibilityState={{ selected: selectedIntent }}
                                  onPress={() => void resolveReviewTargets(["intent"], { currentSaveIntent: intent })}
                                  style={({ pressed }) => [
                                    styles.rationaleIntentOption,
                                    selectedIntent && styles.rationaleIntentOptionSelected,
                                    pressed && styles.subtlePressed
                                  ]}
                                >
                                  <Text
                                    numberOfLines={1}
                                    style={[
                                      styles.rationaleIntentOptionText,
                                      selectedIntent && styles.rationaleIntentOptionTextSelected
                                    ]}
                                  >
                                    {activeIntentLabel(intent)}
                                  </Text>
                                </Pressable>
                              );
                            })}
                            <Pressable
                              accessibilityLabel="Use no intent"
                              accessibilityRole="button"
                              accessibilityState={{ selected: !selected?.defaultIntent }}
                              onPress={() => void resolveReviewTargets(["intent"], { currentSaveIntent: null })}
                              style={({ pressed }) => [
                                styles.rationaleIntentOption,
                                !selected?.defaultIntent && styles.rationaleIntentOptionSelected,
                                pressed && styles.subtlePressed
                              ]}
                            >
                              <Text
                                numberOfLines={1}
                                style={[
                                  styles.rationaleIntentOptionText,
                                  !selected?.defaultIntent && styles.rationaleIntentOptionTextSelected
                                ]}
                              >
                                No intent
                              </Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}
            {insightSections.length ? (
              <View style={styles.rationaleSheetSections}>
                <Text style={styles.rationaleSheetSectionHeader}>AI insight</Text>
                {insightSections.map((section) => {
                  const SectionIcon = rationaleSectionIcon(section.label);
                  return (
                    <View key={section.label} style={styles.rationaleSheetSection}>
                      <View style={[styles.rationaleSheetSectionIcon, rationaleSectionIconStyle(section.label)]}>
                        <SectionIcon color={colors.ink} size={18} strokeWidth={2.4} />
                      </View>
                      <View style={styles.rationaleSheetSectionCopy}>
                        <Text style={styles.rationaleSheetLabel}>{section.label}</Text>
                        <Text style={styles.rationaleSheetText}>{section.text}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    );
  }

  return null;
}
