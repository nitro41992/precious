import { useEffect, useRef, useState } from "react";
import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import type { GestureResponderEvent } from "react-native";
import type { TextInput as NativeTextInput } from "react-native";
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  View
} from "react-native";
import { Image } from "expo-image";
import {
  ArrowLeft,
  Camera,
  CaretRight,
  Check,
  Copy,
  Note as StickyNote,
  Trash as Trash2,
  X
} from "phosphor-react-native";

import type { MapSearchCandidate } from "../captureLogic";
import { displayStatus, reviewReasons } from "../captureLogic";
import type {
  Capture,
  CaptureFieldKind,
  CaptureReviewDraft,
  NoteSaveState,
  ReminderDraftAction,
  ReminderScheduleDraft
} from "../types";
import {
  ADD_INTENT_LABEL,
  INTENT_OPTIONS,
  activeIntentLabel,
  captureFieldRationale,
  captureFieldStates,
  captureFullImageLoadKey,
  captureFullImageUrl,
  captureImageLoadKey,
  captureImageUrl,
  captureIntentLabel,
  captureOpenUrl,
  captureReviewSourceLabel,
  captureSourceLabel,
  captureStatusLabel,
  formatDateTime,
  normalizeIntent,
  isImageCapture,
  reminderDraftKey,
  reminderLabel,
  reviewStatusCue,
  urlEvidenceMessage
} from "../capturePresentation";
import { ReminderEditorSheet } from "../sheets/ReminderEditorSheet";
import { colors } from "../ui/theme";
import { styles } from "../ui/styles";
import { AiFieldInsight, AnimatedBottomSheet, IconButton, SourceMark } from "../ui/components";
import { Text, TextInput } from "../ui/typography";

type CaptureReviewScreenProps = {
  data: {
    appSheets: ReactNode;
    captureComposerMotion: Animated.Value;
    captureKeyboardInset: Animated.Value;
    captureReturnCollectionId: string | null;
    faviconFailures: Record<string, boolean>;
    keyboardHeight: number;
    noteInputRef: RefObject<NativeTextInput | null>;
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
    closeNoteSheet: (options?: { keyboardHidden?: boolean }) => void;
    deleteCapture: () => void;
    copySource: () => void;
    markFaviconFailed: (host: string) => void;
    openCaptureUrl: (url: string) => void;
    openCollectionPicker: () => void;
    openExternalUrl: (url: string) => void;
    openNoteSheet: () => void;
    openVisitTargetMaps: (candidate: MapSearchCandidate) => void;
    pasteExpandedUrl: () => void;
    removeReminder: (reminderIndex: number) => void;
    saveReminder: (draft: ReminderScheduleDraft, reminderIndex: number | null) => void;
    savePurposeIntent: (intent: string | null) => void;
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
          <X color={colors.ink} size={22} weight="bold" />
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
    openVisitTargetMaps,
    pasteExpandedUrl,
    removeReminder,
    saveReminder,
    savePurposeIntent,
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
  const selectedSourceLabel = captureReviewSourceLabel(selected);
  const selectedSourceIsSharedImage = selectedSourceLabel === "Shared Image";
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
  const aiIntentValue = normalizeIntent(selected.defaultIntent);
  const quickIntentValue = draftIntentDirty ? draftIntent : aiIntentValue;
  const reminderRows = selected.suggestedReminders || [];
  const primaryReminderIndex = reminderRows.findIndex((reminder, index) => {
    return reminderDrafts[reminderDraftKey(reminder, index)] !== "remove";
  });
  const primaryReminder = primaryReminderIndex >= 0 ? reminderRows[primaryReminderIndex] : undefined;
  const meaningFields = captureFieldStates(selected);
  const purposeField = meaningFields.find((field) => field.kind === "purpose");
  const collectionField = meaningFields.find((field) => field.kind === "collection");
  const laterField = meaningFields.find((field) => field.kind === "later");
  const purposeRationale = captureFieldRationale(selected, "purpose");
  const reminderRationale = captureFieldRationale(selected, "later");
  const urlEvidenceNotice = urlEvidenceMessage(selected.urlEvidence);
  const selectedVisitTarget = selected.visitTarget;
  const selectedVisitTargetMapCandidates = selectedVisitTarget ? visitTargetMapCandidates : [];
  const resolvedPlace = selectedVisitTarget?.resolvedPlace?.status === "resolved"
    ? selectedVisitTarget.resolvedPlace
    : null;
  const primaryMapCandidate = selectedVisitTargetMapCandidates[0] || null;
  const locationInlineValue = resolvedPlace?.displayName || selectedVisitTarget?.name || "";
  const showLocationInline = Boolean(
    selectedVisitTarget &&
      locationInlineValue
  );
  const selectedCapturedTime = formatDateTime(selected.createdAt);
  const selectedNeedsReview = displayStatus(selected) === "needs_review";
  const selectedReviewState = selectedNeedsReview
    ? "Needs review"
    : reviewStatusCue(selected, selectedReviewReasons.length > 0);
  const showReviewStateText = selectedReviewState !== "Ready" && selectedReviewState !== captureStatusLabel(selected);
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
  const noteSheetKeyboardVisible = noteSheetOpen && keyboardHeight > 0;
  const noteWindowAlreadyKeyboardSized =
    noteSheetKeyboardVisible && Math.abs(windowHeight + keyboardHeight - Dimensions.get("screen").height) < 96;
  const screenHeight = Dimensions.get("screen").height;
  const noteVisibleHeight = noteSheetKeyboardVisible && !noteWindowAlreadyKeyboardSized
    ? windowHeight - keyboardHeight
    : windowHeight;
  const noteKeyboardGap = noteSheetKeyboardVisible ? 16 : 0;
  const noteSheetMaxHeight = noteSheetKeyboardVisible
    ? Math.min(440, Math.max(320, noteVisibleHeight - 24 - noteKeyboardGap))
    : Math.min(500, Math.max(340, windowHeight * 0.64));
  const noteSheetBottomInset = noteWindowAlreadyKeyboardSized
    ? noteKeyboardGap
    : noteSheetKeyboardVisible
      ? Animated.add(captureKeyboardInset, noteKeyboardGap)
      : captureKeyboardInset;
  const showStatus = displayStatus(selected) !== "ready";
  const reviewScrollY = useRef(new Animated.Value(0)).current;
  const reviewWindowWidth = Dimensions.get("window").width;
  const reviewExpandedMediaHeight = Math.min(520, Math.max(360, reviewWindowWidth * 1.18));
  const reviewSquareMediaHeight = Math.min(reviewExpandedMediaHeight, reviewWindowWidth);
  const reviewAspectShiftDistance = Math.max(96, reviewExpandedMediaHeight - reviewSquareMediaHeight + 96);
  const reviewMediaHeight = reviewScrollY.interpolate({
    inputRange: [0, reviewAspectShiftDistance],
    outputRange: [reviewExpandedMediaHeight, reviewSquareMediaHeight],
    extrapolate: "clamp"
  });
  const reviewMediaImageScale = reviewScrollY.interpolate({
    inputRange: [0, reviewAspectShiftDistance],
    outputRange: [1, 0.96],
    extrapolate: "clamp"
  });

  useEffect(() => {
    setImageViewerOpen(false);
    setImageViewerSource(null);
  }, [selected.id]);

  function openInlineField(kind: CaptureFieldKind) {
    if (kind === "purpose") {
      setQuickIntentOpen(true);
      return;
    }
    if (kind === "collection") {
      void openCollectionPicker();
      return;
    }
    if (kind === "later") {
      setReminderSheetOpen(true);
      return;
    }
  }

  function closeImageViewer() {
    setImageViewerOpen(false);
  }

  return (
    <View style={styles.reviewSafe}>
      <StatusBar backgroundColor="transparent" barStyle="light-content" translucent />
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
        <View style={styles.reviewShell}>
          <View style={styles.reviewScrollLayout}>
            <Animated.ScrollView
              style={styles.reviewDetailScroller}
              contentContainerStyle={[
                styles.reviewDetailContent,
                styles.reviewDetailContentNoFooter
              ]}
              keyboardShouldPersistTaps="handled"
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { y: reviewScrollY } } }],
                { useNativeDriver: false }
              )}
              scrollEventThrottle={16}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              <Animated.View style={[styles.reviewMediaStage, { height: reviewMediaHeight }]}>
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
                      <Animated.View
                        style={[
                          styles.reviewMediaImageFrame,
                          { transform: [{ scale: reviewMediaImageScale }] }
                        ]}
                      >
                        <Image
                          cachePolicy="memory-disk"
                          contentFit="cover"
                          source={selectedImageLoadKey ? { uri: selectedImageUrl, cacheKey: selectedImageLoadKey } : { uri: selectedImageUrl }}
                          style={styles.reviewMediaImage}
                        />
                      </Animated.View>
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
                <View pointerEvents="box-none" style={styles.reviewMediaTopControls}>
                  <Pressable
                    accessibilityLabel="Back"
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => {
                      if (captureReturnCollectionId) {
                        const collectionId = captureReturnCollectionId;
                        selectCapture(null);
                        selectCollection(collectionId);
                      } else {
                        selectCapture(null);
                      }
                    }}
                    style={({ pressed }) => [styles.reviewMediaIconButton, pressed && styles.subtlePressed]}
                  >
                    <ArrowLeft color={colors.ink} size={22} weight="regular" />
                  </Pressable>
                  {showStatus ? (
                    <Text
                      style={[
                        styles.reviewMediaStatusPill,
                        displayStatus(selected) === "processing" && styles.statusProcessing,
                        displayStatus(selected) === "needs_review" && styles.statusReview,
                        displayStatus(selected) === "failed" && styles.statusFailed
                      ]}
                    >
                      {captureStatusLabel(selected)}
                    </Text>
                  ) : null}
                </View>
              </Animated.View>
                <View style={styles.reviewDetailPlane}>
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
                    <View style={styles.reviewMetaRow}>
                      <View style={styles.reviewSourceCluster}>
                        {selectedSourceIsSharedImage ? (
                          <View style={styles.reviewSourceImageIconPill}>
                            <Camera color={colors.accent} size={17} weight="regular" />
                          </View>
                        ) : (
                          <SourceMark
                            capture={selected}
                            failedFavicons={faviconFailures}
                            onFaviconFailure={markFaviconFailed}
                            size="inline"
                          />
                        )}
                        <Text numberOfLines={1} style={styles.reviewSourceName}>
                          {selectedSourceLabel}
                          <Text style={styles.reviewSourceTime}> · {selectedCapturedTime}</Text>
                        </Text>
                        {sourceValue ? (
                          <Pressable
                            accessibilityLabel="Copy source"
                            accessibilityRole="button"
                            hitSlop={8}
                            onPress={() => void copySource()}
                            style={({ pressed }) => [styles.reviewSourceCopyButton, pressed && styles.subtlePressed]}
                          >
                            <Copy color={colors.secondary} size={18} weight="regular" />
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                    {showReviewStateText ? (
                      <Text style={styles.reviewSentenceSubtext}>{selectedReviewState}</Text>
                    ) : null}
                  </View>
                  <View style={styles.quickEditBlock}>
                    <View style={styles.inlineMeaningBlock}>
                      <View style={styles.inlineMeaningSentence}>
                        {purposeField ? (
                          <Text style={styles.inlineMeaningLine}>
                            <Text style={styles.inlineMeaningText}>Saved as </Text>
                            <Text
                              accessibilityLabel={`Purpose: ${purposeField.displayValue}`}
                              accessibilityRole="button"
                              onPress={() => openInlineField("purpose")}
                              style={[
                                styles.inlineMeaningChipText,
                                !purposeField.hasValue && styles.inlineMeaningChipTextPending
                              ]}
                              testID="pc.review.intent.open"
                            >
                              {purposeField.displayValue}
                            </Text>
                          </Text>
                        ) : null}
                        {collectionField ? (
                          <Text style={styles.inlineMeaningLine}>
                            <Text style={styles.inlineMeaningText}>in </Text>
                            <Text
                              accessibilityLabel={`Collection: ${collectionField.displayValue}`}
                              accessibilityRole="button"
                              onPress={() => openInlineField("collection")}
                              style={[
                                styles.inlineMeaningChipText,
                                !collectionField.hasValue && styles.inlineMeaningChipTextPending
                              ]}
                              testID="pc.review.collections.open"
                            >
                              {collectionField.displayValue}
                            </Text>
                          </Text>
                        ) : null}
                        {laterField ? (
                          <Text style={styles.inlineMeaningLine}>
                            <Text style={styles.inlineMeaningText}>for </Text>
                            <Text
                              accessibilityLabel={`Later: ${laterField.displayValue}`}
                              accessibilityRole="button"
                              onPress={() => openInlineField("later")}
                              style={[
                                styles.inlineMeaningChipText,
                                !laterField.hasValue && styles.inlineMeaningChipTextPending
                              ]}
                              testID="pc.review.reminder.open"
                            >
                              {laterField.displayValue}
                            </Text>
                          </Text>
                        ) : null}
                        {showLocationInline ? (
                          <Text style={styles.inlineMeaningLine}>
                            <Text style={styles.inlineMeaningText}>at </Text>
                            <Text
                              accessibilityLabel={resolvedPlace ? `Open ${locationInlineValue} in Maps` : `Search Maps for ${locationInlineValue}`}
                              accessibilityRole={primaryMapCandidate ? "button" : undefined}
                              onPress={primaryMapCandidate ? () => void openVisitTargetMaps(primaryMapCandidate) : undefined}
                              style={styles.inlineMeaningChipText}
                            >
                              {locationInlineValue}
                            </Text>
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
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
                  <View style={styles.reviewActionBlock}>
                    <Text style={styles.reviewActionLabel}>Capture actions</Text>
                    <View style={styles.reviewActionGroup}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={openNoteSheet}
                        style={({ pressed }) => [styles.reviewActionRow, pressed && styles.subtlePressed]}
                        testID="pc.review.note.open"
                      >
                        <View style={styles.reviewActionIconWell}>
                          <StickyNote color={colors.secondary} size={19} weight="regular" />
                        </View>
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
                        <CaretRight color={colors.muted} size={18} weight="bold" />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={deleteCapture}
                        style={({ pressed }) => [
                          styles.reviewActionRow,
                          styles.reviewActionRowDivided,
                          pressed && styles.subtlePressed
                        ]}
                        testID="pc.capture.delete"
                      >
                        <View style={[styles.reviewActionIconWell, styles.reviewActionIconWellDanger]}>
                          <Trash2 color={colors.danger} size={19} weight="regular" />
                        </View>
                        <Text style={styles.dangerButtonText}>Delete capture</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </Animated.ScrollView>
          </View>
        </View>
      </Animated.View>
      {noteSheetOpen ? (
        <View style={styles.sheetLayer} pointerEvents="box-none">
          <Pressable
            accessibilityLabel="Close note editor"
            onPress={() => closeNoteSheet()}
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
                  transform: [
                    {
                      translateY: captureComposerMotion.interpolate({
                        inputRange: [0, 1],
                        outputRange: [screenHeight, 0]
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
                  <IconButton Icon={X} label="Close note editor" onPress={() => closeNoteSheet()} />
                  <IconButton Icon={Check} label="Done" onPress={() => closeNoteSheet()} tone="primary" />
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
      <AnimatedBottomSheet
        closeLabel="Close Purpose choices"
        onClose={() => setQuickIntentOpen(false)}
        sheetStyle={[styles.actionSheet, styles.purposeSheet]}
        visible={quickIntentOpen}
      >
            <View style={styles.sheetGrabber} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderCopy}>
                <Text style={styles.sheetTitle}>Purpose</Text>
                <Text style={styles.sheetSubtitle}>Choose what this capture should help you do later.</Text>
              </View>
              <IconButton Icon={X} label="Close Purpose choices" onPress={() => setQuickIntentOpen(false)} />
            </View>
            {purposeRationale.visible ? (
              <AiFieldInsight insight={purposeRationale} />
            ) : null}
            <View style={styles.purposeOptionGrid}>
              {INTENT_OPTIONS.map((intent) => {
                const selectedIntent = quickIntentValue === intent;
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={intent}
                    onPress={() => {
                      setQuickIntentOpen(false);
                      savePurposeIntent(intent);
                    }}
                    style={({ pressed }) => [
                      styles.purposeOption,
                      selectedIntent && styles.purposeOptionSelected,
                      pressed && styles.subtlePressed
                    ]}
                    testID={`pc.intent.option.${intent}`}
                  >
                    <Text style={[styles.purposeOptionText, selectedIntent && styles.purposeOptionTextSelected]}>
                      {activeIntentLabel(intent)}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setQuickIntentOpen(false);
                  savePurposeIntent(null);
                }}
                style={({ pressed }) => [
                  styles.purposeOption,
                  !quickIntentValue && styles.purposeOptionSelected,
                  pressed && styles.subtlePressed
                ]}
                testID="pc.intent.option.none"
              >
                <Text style={[styles.purposeOptionText, !quickIntentValue && styles.purposeOptionTextSelected]}>
                  No intent
                </Text>
              </Pressable>
            </View>
      </AnimatedBottomSheet>
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
        rationale={reminderRationale.visible ? reminderRationale : null}
        visible={reminderSheetOpen}
      />
      {appSheets}
      {toast}
    </View>
  );
}
