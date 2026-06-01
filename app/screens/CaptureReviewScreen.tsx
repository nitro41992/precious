import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View
} from "react-native";
import { Image } from "expo-image";
import {
  Archive,
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Info,
  MapPin,
  Pencil,
  StickyNote,
  X
} from "lucide-react-native";

import type { MapSearchCandidate } from "../captureLogic";
import { displayStatus, isArchived, reviewReasons } from "../captureLogic";
import type { Capture, CaptureReviewDraft, NoteSaveState, ReminderDraftAction, ReviewInsight } from "../types";
import {
  ADD_INTENT_LABEL,
  INTENT_OPTIONS,
  activeIntentLabel,
  captureImageUrl,
  captureIntentLabel,
  captureOpenUrl,
  captureSourceLabel,
  captureStatusLabel,
  formatDateTime,
  linkedCollectionsLabel,
  normalizeIntent,
  reminderDraftKey,
  reminderLabel,
  reviewChecklistCta,
  reviewChecklistTasksForCapture,
  reviewInsightForCapture,
  reviewStatusCue,
  urlEvidenceMessage
} from "../capturePresentation";
import { colors } from "../ui/theme";
import { styles } from "../ui/styles";
import { IconButton, SourceMark } from "../ui/components";

type CaptureReviewScreenProps = {
  data: {
    appSheets: ReactNode;
    captureComposerMotion: Animated.Value;
    captureKeyboardInset: Animated.Value;
    captureReturnCollectionId: string | null;
    faviconFailures: Record<string, boolean>;
    keyboardHeight: number;
    message: string;
    noteInputRef: RefObject<TextInput | null>;
    reviewMotion: Animated.Value;
    selected: Capture;
    snackbar: ReactNode;
    visitTargetMapCandidates: MapSearchCandidate[];
    windowHeight: number;
  };
  state: {
    collectionChoiceSaving: string | null;
    draftIntent: string;
    draftIntentDirty: boolean;
    draftNote: string;
    draftNoteDirty: boolean;
    draftTitle: string;
    draftTitleDirty: boolean;
    noteSaveState: NoteSaveState;
    noteSheetOpen: boolean;
    quickIntentOpen: boolean;
    reminderDrafts: Record<string, ReminderDraftAction>;
  };
  actions: {
    closeNoteSheet: () => void;
    confirmArchive: () => void;
    copySource: () => void;
    markFaviconFailed: (host: string) => void;
    openCaptureUrl: (url: string) => void;
    openCollectionPicker: () => void;
    openExternalUrl: (url: string) => void;
    openNoteSheet: () => void;
    openReviewInsight: (insight: ReviewInsight) => void;
    openVisitTargetMaps: (candidate: MapSearchCandidate) => void;
    pasteExpandedUrl: () => void;
    saveReviewDecisions: () => void;
    selectCapture: (captureId: string | null) => void;
    selectCollection: (collectionId: string | null) => void;
    setDraftIntent: (value: string) => void;
    setDraftIntentDirty: (value: boolean) => void;
    setDraftNote: (value: string) => void;
    setDraftNoteDirty: (value: boolean) => void;
    setDraftTitle: (value: string) => void;
    setDraftTitleDirty: (value: boolean) => void;
    setQuickIntentOpen: Dispatch<SetStateAction<boolean>>;
    setReminderDrafts: (value: Record<string, ReminderDraftAction>) => void;
    updateSelectedReviewDraft: (patch: Partial<CaptureReviewDraft>) => void;
  };
};

export function CaptureReviewScreen({ actions, data, state }: CaptureReviewScreenProps) {
  const {
    appSheets,
    captureComposerMotion,
    captureKeyboardInset,
    captureReturnCollectionId,
    faviconFailures,
    keyboardHeight,
    message,
    noteInputRef,
    reviewMotion,
    selected,
    snackbar,
    visitTargetMapCandidates,
    windowHeight
  } = data;
  const {
    collectionChoiceSaving,
    draftIntent,
    draftIntentDirty,
    draftNote,
    draftNoteDirty,
    draftTitle,
    noteSaveState,
    noteSheetOpen,
    quickIntentOpen,
    reminderDrafts
  } = state;
  const {
    closeNoteSheet,
    confirmArchive,
    copySource,
    markFaviconFailed,
    openCaptureUrl,
    openCollectionPicker,
    openExternalUrl,
    openNoteSheet,
    openReviewInsight,
    openVisitTargetMaps,
    pasteExpandedUrl,
    saveReviewDecisions,
    selectCapture,
    selectCollection,
    setDraftIntent,
    setDraftIntentDirty,
    setDraftNote,
    setDraftNoteDirty,
    setDraftTitle,
    setDraftTitleDirty,
    setQuickIntentOpen,
    setReminderDrafts,
    updateSelectedReviewDraft
  } = actions;

  const selectedArchived = isArchived(selected);
  const sourceValue = selected.sourceUrl || selected.sourceText;
  const selectedOpenUrl = captureOpenUrl(selected);
  const selectedImageUrl = captureImageUrl(selected);
  const selectedReviewReasons = reviewReasons(selected);
  const aiIntentValue = normalizeIntent(selected.defaultIntent);
  const quickIntentValue = draftIntentDirty ? draftIntent : aiIntentValue;
  const quickIntentLabel = activeIntentLabel(quickIntentValue) || ADD_INTENT_LABEL;
  const reminderRows = selected.suggestedReminders || [];
  const collectionRows = selected.linkedCollections || [];
  const collectionRowLabel = linkedCollectionsLabel(collectionRows);
  const primaryReminder = reminderRows[0];
  const primaryReminderKey = primaryReminder ? reminderDraftKey(primaryReminder, 0) : "";
  const primaryReminderRemoved = primaryReminder ? reminderDrafts[primaryReminderKey] === "remove" : false;
  const reminderSentenceValue = primaryReminder && !primaryReminderRemoved
    ? reminderLabel(primaryReminder)
    : "no reminder";
  const collectionActionPending = collectionChoiceSaving === "set-collections";
  const urlEvidenceNotice = urlEvidenceMessage(selected.urlEvidence);
  const selectedVisitTarget = selected.visitTarget;
  const selectedVisitTargetMapCandidates = selectedVisitTarget ? visitTargetMapCandidates : [];
  const selectedSourceMeta = `${captureSourceLabel(selected)} · ${formatDateTime(selected.createdAt)}`;
  const selectedReviewInsight = reviewInsightForCapture(selected);
  const selectedReviewTasks = reviewChecklistTasksForCapture(selected);
  const selectedNeedsReview = displayStatus(selected) === "needs_review";
  const selectedReviewState = selectedNeedsReview
    ? selectedReviewInsight.focus
    : reviewStatusCue(selected, selectedReviewReasons.length > 0);
  const showReviewStateText = selectedReviewState !== "Ready" && selectedReviewState !== captureStatusLabel(selected);
  const showReviewInsight = Boolean(
    selectedNeedsReview ||
      selected.reviewRationale ||
      selected.intentRationale ||
      activeIntentLabel(selected.defaultIntent) ||
      selected.suggestedReminders?.length ||
      selected.linkedCollections?.some((collection) => collection.rationale)
  );
  const noteStatusLabel =
    noteSaveState === "saving"
      ? "Saving..."
      : noteSaveState === "error"
        ? "Could not autosave"
        : noteSaveState === "saved"
          ? "Saved"
          : draftNoteDirty
            ? "Autosaves"
            : "";
  const noteHasText = Boolean(draftNote.trim());
  const reviewHasPendingChanges = Boolean(
    state.draftTitleDirty ||
      draftNoteDirty ||
      draftIntentDirty ||
      Object.keys(reminderDrafts).length
  );
  const reviewConfirmOnly = selectedNeedsReview && !reviewHasPendingChanges && !collectionActionPending;
  const reviewChecklistLabel = reviewChecklistCta(selectedReviewTasks);
  const reviewSupportText = draftIntentDirty
    ? aiIntentValue
      ? `Changed from ${activeIntentLabel(aiIntentValue)}`
      : "Added intent"
    : "";
  const showReviewFooter = reviewHasPendingChanges || collectionActionPending || reviewConfirmOnly;
  const noteSheetKeyboardVisible = noteSheetOpen && keyboardHeight > 0;
  const noteWindowAlreadyKeyboardSized =
    noteSheetKeyboardVisible && Math.abs(windowHeight + keyboardHeight - Dimensions.get("screen").height) < 96;
  const noteVisibleHeight = noteSheetKeyboardVisible && !noteWindowAlreadyKeyboardSized
    ? windowHeight - keyboardHeight
    : windowHeight;
  const noteSheetMaxHeight = noteSheetKeyboardVisible
    ? Math.min(440, Math.max(320, noteVisibleHeight - 24))
    : Math.min(500, Math.max(340, windowHeight * 0.64));
  const noteSheetBottomInset = noteWindowAlreadyKeyboardSized ? 0 : captureKeyboardInset;
  const showStatus = selectedArchived || displayStatus(selected) !== "ready";

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <Animated.View
        style={[
          styles.reviewShell,
          {
            opacity: reviewMotion,
            transform: [
              {
                translateY: reviewMotion.interpolate({
                  inputRange: [0, 1],
                  outputRange: [12, 0]
                })
              }
            ]
          }
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.reviewShell}
        >
          <ScrollView
            contentContainerStyle={[
              styles.detail,
              styles.reviewDetail,
              !showReviewFooter && styles.reviewDetailNoFooter
            ]}
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.detailHeader}>
              <IconButton
                Icon={ArrowLeft}
                label="Back"
                onPress={() => {
                  if (captureReturnCollectionId) {
                    const collectionId = captureReturnCollectionId;
                    selectCapture(null);
                    selectCollection(collectionId);
                  } else {
                    selectCapture(null);
                  }
                }}
              />
              {showStatus ? (
                <Text
                  style={[
                    styles.status,
                    displayStatus(selected) === "processing" && styles.statusProcessing,
                    displayStatus(selected) === "needs_review" && styles.statusReview,
                    displayStatus(selected) === "failed" && styles.statusFailed
                  ]}
                >
                  {captureStatusLabel(selected)}
                </Text>
              ) : null}
            </View>
            <Pressable
              accessibilityHint={selectedOpenUrl ? "Opens the saved source" : undefined}
              accessibilityLabel={selectedOpenUrl ? "Open saved source" : undefined}
              accessibilityRole={selectedOpenUrl ? "button" : undefined}
              disabled={!selectedOpenUrl}
              onPress={() => void openCaptureUrl(selectedOpenUrl)}
              style={({ pressed }) => [
                styles.reviewMediaHeader,
                selectedImageUrl ? styles.reviewMediaHeaderImage : styles.reviewMediaHeaderFallback,
                pressed && Boolean(selectedOpenUrl) && styles.subtlePressed
              ]}
              testID="pc.review.media"
            >
              {selectedImageUrl ? (
                <>
                  <Image
                    cachePolicy="memory-disk"
                    contentFit="cover"
                    source={{ uri: selectedImageUrl }}
                    style={styles.reviewMediaImage}
                    transition={120}
                  />
                  <View style={styles.reviewMediaOverlay}>
                    <View style={styles.reviewMediaSourcePill}>
                      <Text numberOfLines={1} style={styles.reviewMediaSourceText}>
                        {captureSourceLabel(selected)}
                      </Text>
                    </View>
                  </View>
                </>
              ) : (
                <View style={styles.reviewMediaFallbackContent}>
                  <SourceMark
                    capture={selected}
                    failedFavicons={faviconFailures}
                    onFaviconFailure={markFaviconFailed}
                    size="detail"
                  />
                  <View style={styles.reviewMediaFallbackCopy}>
                    <Text numberOfLines={1} style={styles.reviewMediaFallbackTitle}>
                      {captureSourceLabel(selected)}
                    </Text>
                    <Text numberOfLines={2} style={styles.reviewMediaFallbackText}>
                      {captureIntentLabel(selected) || captureStatusLabel(selected)}
                    </Text>
                  </View>
                </View>
              )}
            </Pressable>
            <View style={styles.reviewPrimaryBlock}>
              <TextInput
                multiline
                onChangeText={(value) => {
                  setDraftTitleDirty(true);
                  setDraftTitle(value);
                  updateSelectedReviewDraft({ title: value, titleDirty: true });
                }}
                placeholder="Title"
                placeholderTextColor={colors.muted}
                style={styles.reviewTitleInput}
                testID="pc.review.title"
                value={draftTitle}
              />
              <View style={styles.reviewSourceRow}>
                <SourceMark
                  capture={selected}
                  failedFavicons={faviconFailures}
                  onFaviconFailure={markFaviconFailed}
                  size="detail"
                />
                <Text numberOfLines={1} style={styles.reviewSourceMeta}>{selectedSourceMeta}</Text>
              </View>
              {showReviewStateText ? (
                <Text style={styles.reviewSentenceSubtext}>{selectedReviewState}</Text>
              ) : null}
            </View>
            <View style={styles.quickEditBlock}>
              <View style={styles.reviewEditRows}>
                <View style={styles.reviewEditRow}>
                  <Text style={styles.editRowLabel}>Intent</Text>
                  <Pressable
                    android_ripple={{ color: "rgba(31, 122, 91, 0.10)" }}
                    onLongPress={() => openReviewInsight(selectedReviewInsight)}
                    onPress={() => setQuickIntentOpen((current) => !current)}
                    style={({ pressed }) => [
                      styles.editRowValue,
                      quickIntentOpen && styles.sentenceChipActive,
                      pressed && styles.subtlePressed
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.editRowValueText,
                        !quickIntentValue && styles.editRowPlaceholderText
                      ]}
                    >
                      {quickIntentLabel}
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.reviewEditRow}>
                  <Text style={styles.editRowLabel}>Collections</Text>
                  <Pressable
                    android_ripple={{ color: "rgba(31, 122, 91, 0.10)" }}
                    onLongPress={() => openReviewInsight(selectedReviewInsight)}
                    onPress={() => void openCollectionPicker()}
                    style={({ pressed }) => [
                      styles.editRowValue,
                      pressed && styles.subtlePressed
                    ]}
                    testID="pc.review.collections.open"
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.editRowValueText,
                        !collectionRows.length && styles.editRowPlaceholderText
                      ]}
                    >
                      {collectionRowLabel}
                    </Text>
                  </Pressable>
                </View>
                {primaryReminder ? (
                  <View style={styles.reviewEditRow}>
                    <Text style={styles.editRowLabel}>Reminder idea</Text>
                    <Pressable
                      android_ripple={{ color: "rgba(31, 122, 91, 0.10)" }}
                      onLongPress={() => openReviewInsight(selectedReviewInsight)}
                      onPress={() => {
                        const next = { ...reminderDrafts };
                        if (primaryReminderRemoved) delete next[primaryReminderKey];
                        else next[primaryReminderKey] = "remove";
                        setReminderDrafts(next);
                        updateSelectedReviewDraft({ reminders: next });
                      }}
                      style={({ pressed }) => [
                        styles.editRowValue,
                        primaryReminderRemoved && styles.sentenceChipMuted,
                        pressed && styles.subtlePressed
                      ]}
                    >
                      <Text numberOfLines={1} style={[styles.editRowValueText, primaryReminderRemoved && styles.suggestionTextMuted]}>
                        {reminderSentenceValue}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
              {reviewSupportText ? (
                <Text style={styles.reviewSentenceSubtext}>{reviewSupportText}</Text>
              ) : null}
              {quickIntentOpen ? (
                <View style={styles.quickOptions}>
                  {INTENT_OPTIONS.map((intent) => {
                    const selectedIntent = quickIntentValue === intent;
                    return (
                      <Pressable
                        key={intent}
                        onPress={() => {
                          const intentDirty = intent !== aiIntentValue;
                          setDraftIntentDirty(intentDirty);
                          setDraftIntent(intent);
                          updateSelectedReviewDraft({ intent, intentDirty });
                          setQuickIntentOpen(false);
                        }}
                        style={[styles.intentChip, selectedIntent && styles.intentChipSelected]}
                      >
                        <Text style={[styles.intentChipText, selectedIntent && styles.intentChipTextSelected]}>
                          {activeIntentLabel(intent)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              {draftIntentDirty ? (
                <View style={styles.changeLine}>
                  <Text style={styles.changeText}>
                    {aiIntentValue
                      ? `Original suggestion: ${activeIntentLabel(aiIntentValue)}`
                      : "Started without intent"}
                  </Text>
                  <Pressable
                    onPress={() => {
                      setDraftIntent(aiIntentValue);
                      setDraftIntentDirty(false);
                      updateSelectedReviewDraft({ intent: aiIntentValue, intentDirty: false });
                    }}
                    hitSlop={8}
                  >
                    <Text style={styles.suggestionAction}>Undo</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
            {showReviewInsight ? (
              <Pressable
                accessibilityHint="Shows why the suggested intent, collection, and reminder were chosen."
                accessibilityLabel="Review insight"
                accessibilityRole="button"
                onPress={() => openReviewInsight(selectedReviewInsight)}
                style={({ pressed }) => [
                  styles.reviewInsightCard,
                  selectedNeedsReview && styles.reviewInsightCardReview,
                  pressed && styles.subtlePressed
                ]}
                testID="pc.review.insight"
              >
                <View style={[styles.reviewInsightIcon, selectedNeedsReview && styles.reviewInsightIconReview]}>
                  <Info color={selectedNeedsReview ? colors.review : colors.accent} size={17} strokeWidth={2.4} />
                </View>
                <View style={styles.reviewInsightCopy}>
                  <View style={styles.reviewInsightHeader}>
                    <Text style={styles.reviewInsightTitle}>
                      {selectedReviewTasks.length ? reviewChecklistLabel : "Review insight"}
                    </Text>
                    {selectedReviewTasks.length ? (
                      <View style={styles.reviewInsightCountBadge}>
                        <Text style={styles.reviewInsightCountText}>{selectedReviewTasks.length}</Text>
                      </View>
                    ) : null}
                    <Text style={styles.reviewInsightAction}>
                      {selectedReviewTasks.length ? "Open" : "Details"}
                    </Text>
                  </View>
                  <Text numberOfLines={2} style={styles.reviewInsightSummary}>
                    {selectedReviewTasks.length ? selectedReviewInsight.focus : selectedReviewInsight.summary}
                  </Text>
                </View>
                <ChevronRight color={colors.muted} size={18} strokeWidth={2.4} />
              </Pressable>
            ) : null}
            {selectedVisitTarget && selectedVisitTargetMapCandidates.length ? (
              <View style={styles.sourceBlock}>
                <Text style={styles.meta}>Open in Maps</Text>
                <View style={styles.mapTargetRow}>
                  <MapPin color={colors.muted} size={18} strokeWidth={2.2} />
                  <View style={styles.mapTargetCopy}>
                    <Text numberOfLines={1} style={styles.compactActionText}>{selectedVisitTarget.name}</Text>
                    <Text numberOfLines={2} style={styles.supportingText}>
                      {selectedVisitTarget.query}
                    </Text>
                  </View>
                </View>
                <View style={styles.mapActionRow}>
                  {selectedVisitTargetMapCandidates.map((candidate) => (
                    <Pressable
                      key={`${candidate.provider}:${candidate.url}`}
                      onPress={() => void openVisitTargetMaps(candidate)}
                      style={({ pressed }) => [styles.mapActionButton, pressed && styles.subtlePressed]}
                    >
                      <Text style={styles.inlineAction}>{candidate.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            {urlEvidenceNotice ? (
              <View style={styles.sourceBlock}>
                <Text style={styles.meta}>Link evidence</Text>
                <Text style={styles.supportingText}>{urlEvidenceNotice}</Text>
                {selected.urlEvidence?.status === "needs_client_resolution" && selected.sourceUrl ? (
                  <>
                    <Pressable onPress={() => void openExternalUrl(selected.sourceUrl || "")} style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>Open link</Text>
                    </Pressable>
                    <Pressable onPress={() => void pasteExpandedUrl()} style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>Paste expanded URL</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            ) : null}
            <View style={styles.sourceBlock}>
              <Pressable
                accessibilityRole="button"
                onPress={openNoteSheet}
                style={({ pressed }) => [styles.compactActionRow, pressed && styles.subtlePressed]}
                testID="pc.review.note.open"
              >
                <StickyNote color={colors.muted} size={18} strokeWidth={2.2} />
                <View style={styles.noteActionCopy}>
                  <View style={styles.noteActionHeader}>
                    <Text style={styles.compactActionText}>
                      {noteHasText ? "Note" : "Add note"}
                    </Text>
                    {noteStatusLabel ? (
                      <Text style={[styles.noteSaveState, noteSaveState === "error" && styles.noteSaveStateError]}>
                        {noteStatusLabel}
                      </Text>
                    ) : null}
                  </View>
                  {noteHasText ? (
                    <Text numberOfLines={2} style={styles.noteActionPreview}>{draftNote}</Text>
                  ) : null}
                </View>
                <Pencil color={colors.muted} size={16} strokeWidth={2.2} />
              </Pressable>
            </View>
            <View style={styles.sourceBlock}>
              <View style={styles.sourceDisclosureRow}>
                <View style={styles.sourceDisclosureCopy}>
                  <Text style={styles.meta}>Source</Text>
                  <Text numberOfLines={1} style={styles.reviewSourceMeta}>{captureSourceLabel(selected)}</Text>
                </View>
                <View style={styles.sourceDisclosureActions}>
                  {selectedOpenUrl ? (
                    <IconButton
                      Icon={ExternalLink}
                      label="Open source"
                      onPress={() => void openCaptureUrl(selectedOpenUrl)}
                    />
                  ) : null}
                  {sourceValue ? (
                    <IconButton Icon={Copy} label="Copy source" onPress={() => void copySource()} />
                  ) : null}
                </View>
              </View>
            </View>
            <Pressable
              onPress={confirmArchive}
              style={({ pressed }) => [styles.destructiveRow, pressed && styles.subtlePressed]}
              testID="pc.capture.archive-toggle"
            >
              <Archive color={selectedArchived ? colors.ink : colors.danger} size={18} strokeWidth={2.2} />
              <Text style={selectedArchived ? styles.secondaryButtonText : styles.dangerButtonText}>
                {selectedArchived ? "Restore capture" : "Archive capture"}
              </Text>
            </Pressable>
            {message ? <Text style={styles.message}>{message}</Text> : null}
          </ScrollView>
          {showReviewFooter ? (
            <View style={styles.reviewFooter}>
              <Pressable
                disabled={collectionActionPending}
                onPress={() => {
                  if (reviewConfirmOnly) openReviewInsight(selectedReviewInsight);
                  else saveReviewDecisions();
                }}
                style={({ pressed }) => [
                  styles.primaryButton,
                  reviewConfirmOnly && styles.reviewConfirmButton,
                  pressed && !collectionActionPending && styles.primaryButtonPressed,
                  collectionActionPending && styles.disabledButton
                ]}
                testID={reviewConfirmOnly ? "pc.review.checklist.open" : "pc.review.save"}
              >
                <Text style={styles.primaryButtonText}>
                  {collectionActionPending ? "Updating collection..." : reviewConfirmOnly ? reviewChecklistLabel : "Save review"}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </Animated.View>
      {noteSheetOpen ? (
        <View style={styles.sheetLayer} pointerEvents="box-none">
          <Pressable
            accessibilityLabel="Close note editor"
            onPress={closeNoteSheet}
            style={styles.sheetBackdrop}
          />
          <KeyboardAvoidingView pointerEvents="box-none" style={styles.sheetKeyboard}>
            <Animated.View
              style={[
                styles.captureSheet,
                noteSheetKeyboardVisible && styles.captureSheetCompact,
                {
                  marginBottom: noteSheetBottomInset,
                  maxHeight: noteSheetMaxHeight,
                  opacity: captureComposerMotion,
                  transform: [
                    {
                      translateY: captureComposerMotion.interpolate({
                        inputRange: [0, 1],
                        outputRange: [28, 0]
                      })
                    }
                  ]
                }
              ]}
            >
              <View style={styles.sheetGrabber} />
              <View style={styles.captureSheetHeader}>
                <View style={styles.sheetHeaderCopy}>
                  <Text style={styles.sheetTitle}>Note</Text>
                </View>
                <View style={styles.sheetActions}>
                  <IconButton Icon={X} label="Close note editor" onPress={closeNoteSheet} />
                  <IconButton Icon={Check} label="Done" onPress={closeNoteSheet} tone="primary" />
                </View>
              </View>
              <View
                style={[
                  styles.captureSheetBody,
                  styles.captureSheetBodyContent,
                  noteSheetKeyboardVisible && styles.captureSheetBodyContentCompact
                ]}
              >
                <TextInput
                  multiline
                  onChangeText={(value) => {
                    setDraftNoteDirty(true);
                    setDraftNote(value);
                    updateSelectedReviewDraft({ note: value, noteDirty: true });
                  }}
                  placeholder="Why did you save this?"
                  placeholderTextColor={colors.muted}
                  ref={noteInputRef}
                  style={[styles.captureInput, styles.noteSheetInput]}
                  testID="pc.review.note"
                  value={draftNote}
                />
                {noteStatusLabel ? (
                  <Text style={[styles.noteSaveState, noteSaveState === "error" && styles.noteSaveStateError]}>
                    {noteStatusLabel}
                  </Text>
                ) : null}
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      ) : null}
      {appSheets}
      {snackbar}
    </SafeAreaView>
  );
}
