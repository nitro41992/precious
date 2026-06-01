import { Pressable, ScrollView, Text, View } from "react-native";
import {
  Archive,
  Bell,
  Check,
  Folder,
  Info,
  LogOut,
  Pencil,
  Target,
  X
} from "lucide-react-native";

import {
  INTENT_OPTIONS,
  activeIntentLabel
} from "../capturePresentation";
import type {
  Capture,
  Collection,
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

export function AppSheets({
  accountSheetOpen,
  archiveCaptureConfirmOpen,
  archiveCollectionTarget,
  editReviewTask,
  onSignOut,
  rationaleEditTarget,
  rationaleSheet,
  resolveReviewTargets,
  selected,
  setAccountSheetOpen,
  setArchiveCaptureConfirmOpen,
  setArchiveCollectionTarget,
  setArchiveState,
  setCollectionArchiveState,
  setRationaleEditTarget,
  setRationaleSheet
}: {
  accountSheetOpen: boolean;
  archiveCaptureConfirmOpen: boolean;
  archiveCollectionTarget: Collection | null;
  editReviewTask: (task: ReviewChecklistTask) => void;
  onSignOut: () => void;
  rationaleEditTarget: ReviewTarget | null;
  rationaleSheet: RationaleSheet | null;
  resolveReviewTargets: (targets: ReviewTarget[], options?: { currentSaveIntent?: string | null }) => Promise<void> | void;
  selected: Capture | null;
  setAccountSheetOpen: (value: boolean) => void;
  setArchiveCaptureConfirmOpen: (value: boolean) => void;
  setArchiveCollectionTarget: (value: Collection | null) => void;
  setArchiveState: (archived: boolean) => Promise<void> | void;
  setCollectionArchiveState: (collection: Collection, archived: boolean) => Promise<void> | void;
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
            <View style={styles.rationaleSheetHeaderIcon}>
              <Info color={colors.accent} size={22} strokeWidth={2.4} />
            </View>
            <View style={styles.rationaleSheetHeaderCopy}>
              <Text style={styles.sheetTitle}>{rationaleSheet.title}</Text>
              <Text style={styles.rationaleSheetKicker}>How this capture was interpreted</Text>
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
            {rationaleSheet.tasks?.length ? (
              <View style={styles.reviewChecklist}>
                <View style={styles.reviewChecklistHeader}>
                  <Text style={styles.reviewChecklistLabel}>Needs review</Text>
                  <View style={styles.reviewChecklistCount}>
                    <Text style={styles.reviewChecklistCountText}>{rationaleSheet.tasks.length}</Text>
                  </View>
                </View>
                {rationaleSheet.tasks.map((task) => {
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
                            {task.editLabel ? (
                              <IconButton
                                Icon={Pencil}
                                label={task.editLabel}
                                onPress={() => editReviewTask(task)}
                              />
                            ) : null}
                            <IconButton
                              Icon={Check}
                              label={task.confirmLabel}
                              onPress={() => void resolveReviewTargets([task.target])}
                              tone="primary"
                            />
                          </View>
                        </View>
                        <Text style={styles.rationaleSheetText}>{task.rationale}</Text>
                        {showIntentPicker ? (
                          <View style={styles.rationaleIntentOptions}>
                            {INTENT_OPTIONS.map((intent) => (
                              <Pressable
                                accessibilityRole="button"
                                key={intent}
                                onPress={() => void resolveReviewTargets(["intent"], { currentSaveIntent: intent })}
                                style={({ pressed }) => [
                                  styles.rationaleIntentOption,
                                  selected?.defaultIntent === intent && styles.rationaleIntentOptionSelected,
                                  pressed && styles.subtlePressed
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.rationaleIntentOptionText,
                                    selected?.defaultIntent === intent && styles.rationaleIntentOptionTextSelected
                                  ]}
                                >
                                  {activeIntentLabel(intent)}
                                </Text>
                              </Pressable>
                            ))}
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => void resolveReviewTargets(["intent"], { currentSaveIntent: null })}
                              style={({ pressed }) => [
                                styles.rationaleIntentOption,
                                !selected?.defaultIntent && styles.rationaleIntentOptionSelected,
                                pressed && styles.subtlePressed
                              ]}
                            >
                              <Text
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
            {rationaleSheet.sections?.length ? (
              <View style={styles.rationaleSheetSections}>
                {rationaleSheet.sections.map((section) => {
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
          <Pressable
            onPress={() => {
              setRationaleSheet(null);
              setRationaleEditTarget(null);
            }}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (archiveCaptureConfirmOpen && selected) {
    return (
      <View style={styles.modalLayer} pointerEvents="box-none">
        <Pressable
          accessibilityLabel="Cancel archive"
          onPress={() => setArchiveCaptureConfirmOpen(false)}
          style={styles.modalBackdrop}
        />
        <View style={styles.actionSheet}>
          <View style={styles.sheetGrabber} />
          <View style={styles.destructiveSheetIcon}>
            <Archive color={colors.danger} size={22} strokeWidth={2.4} />
          </View>
          <Text style={styles.sheetTitle}>Archive this capture?</Text>
          <Text style={styles.sheetSubtitle}>It leaves Recent Captures but stays searchable from Archived.</Text>
          <Pressable
            onPress={() => void setArchiveState(true)}
            style={[styles.primaryButton, styles.destructiveButton]}
            testID="pc.capture.archive-confirm"
          >
            <Text style={styles.destructiveButtonText}>Archive capture</Text>
          </Pressable>
          <Pressable onPress={() => setArchiveCaptureConfirmOpen(false)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (archiveCollectionTarget) {
    return (
      <View style={styles.modalLayer} pointerEvents="box-none">
        <Pressable
          accessibilityLabel="Cancel archive collection"
          onPress={() => setArchiveCollectionTarget(null)}
          style={styles.modalBackdrop}
        />
        <View style={styles.actionSheet}>
          <View style={styles.sheetGrabber} />
          <View style={styles.destructiveSheetIcon}>
            <Archive color={colors.danger} size={22} strokeWidth={2.4} />
          </View>
          <Text style={styles.sheetTitle}>Archive this collection?</Text>
          <Text style={styles.sheetSubtitle}>Current captures will be removed from it. Restoring brings back only this snapshot.</Text>
          <Pressable
            onPress={() => void setCollectionArchiveState(archiveCollectionTarget, true)}
            style={[styles.primaryButton, styles.destructiveButton]}
            testID="pc.collection.archive-confirm"
          >
            <Text style={styles.destructiveButtonText}>Archive collection</Text>
          </Pressable>
          <Pressable onPress={() => setArchiveCollectionTarget(null)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return null;
}
