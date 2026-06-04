import { useEffect, useRef, useState } from "react";
import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import type { GestureResponderEvent } from "react-native";
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
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
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Info,
  MapPin,
  Pencil,
  StickyNote,
  Trash2,
  X
} from "lucide-react-native";

import type { MapSearchCandidate } from "../captureLogic";
import { displayStatus, reviewReasons } from "../captureLogic";
import type {
  Capture,
  CaptureReviewDraft,
  NoteSaveState,
  ReminderDraftAction,
  ReminderScheduleDraft,
  ReviewInsight
} from "../types";
import {
  ADD_INTENT_LABEL,
  INTENT_OPTIONS,
  activeIntentLabel,
  captureFullImageLoadKey,
  captureFullImageUrl,
  captureImageLoadKey,
  captureImageUrl,
  captureIntentLabel,
  captureOpenUrl,
  captureSourceLabel,
  captureStatusLabel,
  formatDateTime,
  linkedCollectionsLabel,
  normalizeIntent,
  isImageCapture,
  reminderDraftKey,
  reminderLabel,
  reviewChecklistCta,
  reviewChecklistTasksForCapture,
  reviewInsightForCapture,
  reviewStatusCue,
  urlEvidenceMessage
} from "../capturePresentation";
import { ReminderEditorSheet } from "../sheets/ReminderEditorSheet";
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
    noteInputRef: RefObject<TextInput | null>;
    reviewMotion: Animated.Value;
    selected: Capture;
    toast: ReactNode;
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
    reminderSheetOpen: boolean;
  };
  actions: {
    closeNoteSheet: () => void;
    deleteCapture: () => void;
    copySource: () => void;
    markFaviconFailed: (host: string) => void;
    openCaptureUrl: (url: string) => void;
    openCollectionPicker: () => void;
    openExternalUrl: (url: string) => void;
    openNoteSheet: () => void;
    openReviewInsight: (insight: ReviewInsight) => void;
    openVisitTargetMaps: (candidate: MapSearchCandidate) => void;
    pasteExpandedUrl: () => void;
    removeReminder: (reminderIndex: number) => void;
    saveReminder: (draft: ReminderScheduleDraft, reminderIndex: number | null) => void;
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
    setReminderSheetOpen: Dispatch<SetStateAction<boolean>>;
    updateSelectedReviewDraft: (patch: Partial<CaptureReviewDraft>) => void;
  };
};

const MIN_IMAGE_SCALE = 1;
const MAX_IMAGE_SCALE = 4;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function touchDistance(touches: ArrayLike<{ pageX: number; pageY: number }>) {
  if (touches.length < 2) return 0;
  const first = touches[0];
  const second = touches[1];
  return Math.hypot(second.pageX - first.pageX, second.pageY - first.pageY);
}

function CaptureImageViewer({
  cacheKey,
  imageUrl,
  onClose,
  title,
  visible
}: {
  cacheKey: string;
  imageUrl: string;
  onClose: () => void;
  title: string;
  visible: boolean;
}) {
  const scaleValue = useRef(new Animated.Value(MIN_IMAGE_SCALE)).current;
  const translateXValue = useRef(new Animated.Value(0)).current;
  const translateYValue = useRef(new Animated.Value(0)).current;
  const currentGestureRef = useRef({
    scale: MIN_IMAGE_SCALE,
    translateX: 0,
    translateY: 0
  });
  const gestureRef = useRef({
    startDistance: 0,
    startScale: MIN_IMAGE_SCALE,
    startTranslateX: 0,
    startTranslateY: 0,
    startX: 0,
    startY: 0
  });

  function setViewerTransform(next: { scale?: number; translateX?: number; translateY?: number }) {
    if (typeof next.scale === "number") {
      currentGestureRef.current.scale = next.scale;
      scaleValue.setValue(next.scale);
    }
    if (typeof next.translateX === "number") {
      currentGestureRef.current.translateX = next.translateX;
      translateXValue.setValue(next.translateX);
    }
    if (typeof next.translateY === "number") {
      currentGestureRef.current.translateY = next.translateY;
      translateYValue.setValue(next.translateY);
    }
  }

  function resetZoom() {
    setViewerTransform({ scale: MIN_IMAGE_SCALE, translateX: 0, translateY: 0 });
  }

  function beginImageTouch(event: GestureResponderEvent) {
    const touches = event.nativeEvent.touches;
    if (touches.length > 1) {
      gestureRef.current.startDistance = touchDistance(touches);
      gestureRef.current.startScale = currentGestureRef.current.scale;
      return;
    }
    gestureRef.current.startX = touches[0]?.pageX ?? 0;
    gestureRef.current.startY = touches[0]?.pageY ?? 0;
    gestureRef.current.startTranslateX = currentGestureRef.current.translateX;
    gestureRef.current.startTranslateY = currentGestureRef.current.translateY;
  }

  function moveImageTouch(event: GestureResponderEvent) {
    const touches = event.nativeEvent.touches;
    if (touches.length > 1) {
      if (!gestureRef.current.startDistance) {
        gestureRef.current.startDistance = touchDistance(touches);
        gestureRef.current.startScale = currentGestureRef.current.scale;
      }
      const distance = touchDistance(touches);
      const nextScale = clamp(
        gestureRef.current.startScale * (distance / Math.max(gestureRef.current.startDistance, 1)),
        MIN_IMAGE_SCALE,
        MAX_IMAGE_SCALE
      );
      if (nextScale <= MIN_IMAGE_SCALE) {
        setViewerTransform({ scale: MIN_IMAGE_SCALE, translateX: 0, translateY: 0 });
        return;
      }
      setViewerTransform({ scale: nextScale });
      return;
    }
    if (currentGestureRef.current.scale <= MIN_IMAGE_SCALE || !touches.length) return;
    const nextX = gestureRef.current.startTranslateX + ((touches[0]?.pageX ?? 0) - gestureRef.current.startX);
    const nextY = gestureRef.current.startTranslateY + ((touches[0]?.pageY ?? 0) - gestureRef.current.startY);
    const panLimit = 170 * currentGestureRef.current.scale;
    setViewerTransform({
      translateX: clamp(nextX, -panLimit, panLimit),
      translateY: clamp(nextY, -panLimit, panLimit)
    });
  }

  function endImageTouch(event: GestureResponderEvent) {
    const touches = event.nativeEvent.touches;
    if (touches.length > 1) {
      gestureRef.current.startDistance = touchDistance(touches);
      gestureRef.current.startScale = currentGestureRef.current.scale;
      return;
    }
    gestureRef.current.startDistance = 0;
    if (touches.length === 1) {
      gestureRef.current.startX = touches[0]?.pageX ?? 0;
      gestureRef.current.startY = touches[0]?.pageY ?? 0;
      gestureRef.current.startTranslateX = currentGestureRef.current.translateX;
      gestureRef.current.startTranslateY = currentGestureRef.current.translateY;
    }
    if (currentGestureRef.current.scale <= MIN_IMAGE_SCALE + 0.02) resetZoom();
  }

  useEffect(() => {
    if (!visible) return;
    resetZoom();
  }, [imageUrl, visible]);

  return (
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
      <View style={styles.imageViewerLayer}>
        <View
          onTouchCancel={endImageTouch}
          onTouchEnd={endImageTouch}
          onTouchMove={moveImageTouch}
          onTouchStart={beginImageTouch}
          style={styles.imageViewerSurface}
        >
          <Animated.View
            style={[
              styles.imageViewerImageWrap,
              {
                transform: [
                  { translateX: translateXValue },
                  { translateY: translateYValue },
                  { scale: scaleValue }
                ]
              }
            ]}
          >
            {imageUrl ? (
              <Image
                cachePolicy="memory-disk"
                contentFit="contain"
                source={cacheKey ? { uri: imageUrl, cacheKey } : { uri: imageUrl }}
                style={styles.imageViewerImage}
              />
            ) : null}
          </Animated.View>
        </View>
        <Pressable
          accessibilityLabel="Close image"
          accessibilityRole="button"
          hitSlop={10}
          onPress={onClose}
          style={({ pressed }) => [styles.imageViewerClose, pressed && styles.subtlePressed]}
        >
          <X color={colors.ink} size={22} strokeWidth={2.4} />
        </Pressable>
        <View pointerEvents="none" style={styles.imageViewerCaption}>
          <Text numberOfLines={1} style={styles.imageViewerCaptionText}>{title}</Text>
        </View>
      </View>
    </Modal>
  );
}

export function CaptureReviewScreen({ actions, data, state }: CaptureReviewScreenProps) {
  const {
    appSheets,
    captureComposerMotion,
    captureKeyboardInset,
    captureReturnCollectionId,
    faviconFailures,
    keyboardHeight,
    noteInputRef,
    reviewMotion,
    selected,
    toast,
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
    reminderDrafts,
    reminderSheetOpen
  } = state;
  const {
    closeNoteSheet,
    deleteCapture,
    copySource,
    markFaviconFailed,
    openCaptureUrl,
    openCollectionPicker,
    openExternalUrl,
    openNoteSheet,
    openReviewInsight,
    openVisitTargetMaps,
    pasteExpandedUrl,
    removeReminder,
    saveReminder,
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
    setReminderSheetOpen,
    updateSelectedReviewDraft
  } = actions;

  const sourceValue = selected.sourceUrl || selected.sourceText;
  const selectedOpenUrl = captureOpenUrl(selected);
  const selectedImageUrl = captureImageUrl(selected);
  const selectedImageLoadKey = captureImageLoadKey(selected);
  const selectedFullImageUrl = captureFullImageUrl(selected);
  const selectedFullImageLoadKey = captureFullImageLoadKey(selected);
  const selectedMediaOpensImage = Boolean(selectedImageUrl && isImageCapture(selected));
  const selectedMediaPressEnabled = selectedMediaOpensImage || Boolean(selectedOpenUrl);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [imageViewerSource, setImageViewerSource] = useState<{ cacheKey: string; url: string } | null>(null);
  const selectedReviewReasons = reviewReasons(selected);
  const intentReviewPending = selectedReviewReasons.includes("intent");
  const collectionReviewPending = selectedReviewReasons.includes("collections");
  const reminderReviewPending = selectedReviewReasons.includes("reminder");
  const aiIntentValue = normalizeIntent(selected.defaultIntent);
  const visibleIntentValue = intentReviewPending ? "" : aiIntentValue;
  const quickIntentValue = draftIntentDirty ? draftIntent : visibleIntentValue;
  const quickIntentLabel = activeIntentLabel(quickIntentValue) || ADD_INTENT_LABEL;
  const reminderRows = reminderReviewPending ? [] : selected.suggestedReminders || [];
  const collectionRows = collectionReviewPending
    ? (selected.linkedCollections || []).filter((collection) => collection.createdBy !== "analysis")
    : selected.linkedCollections || [];
  const collectionRowLabel = linkedCollectionsLabel(collectionRows);
  const primaryReminderIndex = reminderRows.findIndex((reminder, index) => {
    return reminderDrafts[reminderDraftKey(reminder, index)] !== "remove";
  });
  const primaryReminder = primaryReminderIndex >= 0 ? reminderRows[primaryReminderIndex] : undefined;
  const reminderSentenceValue = primaryReminder
    ? reminderLabel(primaryReminder)
    : "Add reminder";
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
  const showStatus = displayStatus(selected) !== "ready";

  useEffect(() => {
    setImageViewerOpen(false);
    setImageViewerSource(null);
  }, [selected.id]);

  function closeImageViewer() {
    setImageViewerOpen(false);
  }

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
              accessibilityHint={
                selectedMediaOpensImage
                  ? "Opens the full image viewer"
                  : selectedOpenUrl
                    ? "Opens the saved source"
                    : undefined
              }
              accessibilityLabel={
                selectedMediaOpensImage
                  ? "Open full image"
                  : selectedOpenUrl
                    ? "Open saved source"
                    : undefined
              }
              accessibilityRole={selectedMediaPressEnabled ? "button" : undefined}
              disabled={!selectedMediaPressEnabled}
              onPress={() => {
                if (selectedMediaOpensImage) {
                  setImageViewerSource({
                    cacheKey: selectedFullImageUrl ? selectedFullImageLoadKey : selectedImageLoadKey,
                    url: selectedFullImageUrl || selectedImageUrl
                  });
                  setImageViewerOpen(true);
                  return;
                }
                if (selectedOpenUrl) void openCaptureUrl(selectedOpenUrl);
              }}
              style={({ pressed }) => [
                styles.reviewMediaHeader,
                selectedImageUrl ? styles.reviewMediaHeaderImage : styles.reviewMediaHeaderFallback,
                pressed && selectedMediaPressEnabled && styles.subtlePressed
              ]}
              testID="pc.review.media"
            >
              {selectedImageUrl ? (
                <>
                  <Image
                    cachePolicy="memory-disk"
                    contentFit="cover"
                    source={selectedImageLoadKey ? { uri: selectedImageUrl, cacheKey: selectedImageLoadKey } : { uri: selectedImageUrl }}
                    style={styles.reviewMediaImage}
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
              <View style={styles.reviewEditRail}>
                <Pressable
                  accessibilityHint="Opens Save Intent choices."
                  accessibilityLabel={`Purpose: ${quickIntentLabel}`}
                  accessibilityRole="button"
                  android_ripple={{ color: "rgba(31, 122, 91, 0.10)" }}
                  onLongPress={() => openReviewInsight(selectedReviewInsight)}
                  onPress={() => setQuickIntentOpen((current) => !current)}
                  style={({ pressed }) => [
                    styles.reviewEditRailIntent,
                    quickIntentOpen && styles.reviewEditRailIntentActive,
                    pressed && styles.reviewEditRailPressed
                  ]}
                  testID="pc.review.intent.open"
                >
                  <Text style={styles.reviewEditRailLabel}>Purpose</Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.reviewEditRailIntentValue,
                      !quickIntentValue && styles.reviewEditRailPlaceholder
                    ]}
                  >
                    {quickIntentLabel}
                  </Text>
                </Pressable>
                <View style={styles.reviewEditRailDivider} />
                <View style={styles.reviewEditRailDetails}>
                  <Pressable
                    accessibilityHint="Opens Collection selection."
                    accessibilityLabel={`Collection: ${collectionRowLabel}`}
                    accessibilityRole="button"
                    android_ripple={{ color: "rgba(31, 122, 91, 0.10)" }}
                    onLongPress={() => openReviewInsight(selectedReviewInsight)}
                    onPress={() => void openCollectionPicker()}
                    style={({ pressed }) => [
                      styles.reviewEditRailDetail,
                      pressed && styles.reviewEditRailPressed
                    ]}
                    testID="pc.review.collections.open"
                  >
                    <Text style={styles.reviewEditRailDetailLabel}>Collection</Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.reviewEditRailDetailValue,
                        !collectionRows.length && styles.reviewEditRailPlaceholder
                      ]}
                    >
                      {collectionRowLabel}
                    </Text>
                  </Pressable>
                  <View style={styles.reviewEditRailDetailDivider} />
                  <Pressable
                    accessibilityHint="Opens the reminder editor."
                    accessibilityLabel={`Later: ${reminderSentenceValue}`}
                    accessibilityRole="button"
                    android_ripple={{ color: "rgba(31, 122, 91, 0.10)" }}
                    onLongPress={() => openReviewInsight(selectedReviewInsight)}
                    onPress={() => setReminderSheetOpen(true)}
                    style={({ pressed }) => [
                      styles.reviewEditRailDetail,
                      pressed && styles.reviewEditRailPressed
                    ]}
                    testID="pc.review.reminder.open"
                  >
                    <Text style={styles.reviewEditRailDetailLabel}>Later</Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.reviewEditRailDetailValue,
                        !primaryReminder && styles.reviewEditRailPlaceholder
                      ]}
                    >
                      {reminderSentenceValue}
                    </Text>
                  </Pressable>
                </View>
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
                          const intentDirty = intent !== visibleIntentValue || intentReviewPending;
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
                  <Pressable
                    onPress={() => {
                      const intentDirty = Boolean(visibleIntentValue) || intentReviewPending;
                      setDraftIntentDirty(intentDirty);
                      setDraftIntent("");
                      updateSelectedReviewDraft({ intent: "", intentDirty });
                      setQuickIntentOpen(false);
                    }}
                    style={[styles.intentChip, !quickIntentValue && styles.intentChipSelected]}
                  >
                    <Text style={[styles.intentChipText, !quickIntentValue && styles.intentChipTextSelected]}>
                      No intent
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              {draftIntentDirty ? (
                <View style={styles.changeLine}>
                  <Text style={styles.changeText}>
                    {intentReviewPending && aiIntentValue
                      ? `Suggestion: ${activeIntentLabel(aiIntentValue)}`
                      : visibleIntentValue
                      ? `Original: ${activeIntentLabel(visibleIntentValue)}`
                      : "Started without intent"}
                  </Text>
                  <Pressable
                    onPress={() => {
                      setDraftIntent(visibleIntentValue);
                      setDraftIntentDirty(false);
                      updateSelectedReviewDraft({ intent: visibleIntentValue, intentDirty: false });
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
              onPress={deleteCapture}
              style={({ pressed }) => [styles.destructiveRow, pressed && styles.subtlePressed]}
              testID="pc.capture.delete"
            >
              <Trash2 color={colors.danger} size={18} strokeWidth={2.2} />
              <Text style={styles.dangerButtonText}>Delete capture</Text>
            </Pressable>
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
      <CaptureImageViewer
        cacheKey={imageViewerSource?.cacheKey || ""}
        imageUrl={imageViewerSource?.url || ""}
        onClose={closeImageViewer}
        title={draftTitle || selected.title}
        visible={imageViewerOpen && Boolean(imageViewerSource?.url)}
      />
      <ReminderEditorSheet
        onClose={() => setReminderSheetOpen(false)}
        onRemove={(reminderIndex) => {
          setReminderSheetOpen(false);
          removeReminder(reminderIndex);
        }}
        onSave={(draft, reminderIndex) => {
          setReminderSheetOpen(false);
          saveReminder(draft, reminderIndex);
        }}
        reminder={primaryReminder}
        reminderIndex={primaryReminder ? primaryReminderIndex : null}
        visible={reminderSheetOpen}
      />
      {appSheets}
      {toast}
    </SafeAreaView>
  );
}
