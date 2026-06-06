import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import Reanimated, {
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated";
import {
  ArrowLeft,
  Camera,
  CaretRight,
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
  captureFullImageCacheKey,
  captureFullImageUrl,
  captureImageCacheKey,
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
import { motionDuration, motionEasing, motionReduceMotion } from "../ui/motion";
import { appTheme, colors } from "../ui/theme";
import { styles } from "../ui/styles";
import { AiFieldInsight, AnimatedBottomSheet, MotionPressable, ProcessingStatusPill, SheetHeader, SourceMark } from "../ui/components";
import { Text, TextInput } from "../ui/typography";

type ReviewHandoffRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
};

type CaptureReviewScreenProps = {
  data: {
    appSheets: ReactNode;
    captureComposerMotion: Animated.Value;
    captureKeyboardInset: Animated.Value;
    faviconFailures: Record<string, boolean>;
    keyboardHeight: number;
    noteInputRef: RefObject<NativeTextInput | null>;
    reviewMotion: Animated.Value;
    animateReviewChromeForHandoff: boolean;
    hideReviewHeroForHandoff: boolean;
    reviewHandoffKey: number | null;
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
    closeReview: (fromRect?: ReviewHandoffRect | null) => void;
    closeNoteSheet: (options?: { keyboardHidden?: boolean }) => void;
    deleteCapture: () => void;
    copySource: () => void;
    markFaviconFailed: (host: string) => void;
    markReviewHandoffReady: (key: number | null) => void;
    markReviewHandoffTarget: (key: number | null, rect: ReviewHandoffRect) => void;
    openCaptureUrl: (url: string) => void;
    openCollectionPicker: () => void;
    openExternalUrl: (url: string) => void;
    openNoteSheet: () => void;
    openVisitTargetMaps: (candidate: MapSearchCandidate) => void;
    pasteExpandedUrl: () => void;
    removeReminder: (reminderIndex: number) => void;
    saveReminder: (draft: ReminderScheduleDraft, reminderIndex: number | null) => void;
    savePurposeIntent: (intent: string | null) => void;
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
const REVIEW_MEDIA_EXPANDED_IMAGE_SCALE = 1.08;
const REVIEW_MEDIA_COLLAPSED_IMAGE_SCALE = 1.02;

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
  const imageRenderKey = cacheKey || imageUrl;
  const imageSource = useMemo(
    () => cacheKey ? { uri: imageUrl, cacheKey } : { uri: imageUrl },
    [cacheKey, imageUrl]
  );
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
                recyclingKey={imageRenderKey}
                source={imageSource}
                style={styles.imageViewerImage}
              />
            ) : null}
          </Animated.View>
        </View>
        <MotionPressable
          accessibilityLabel="Close image"
          accessibilityRole="button"
          hitSlop={10}
          onPress={onClose}
          style={({ pressed }) => [styles.imageViewerClose, pressed && styles.subtlePressed]}
        >
          <X color={colors.onMediaControl} size={22} weight="bold" />
        </MotionPressable>
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
    faviconFailures,
    keyboardHeight,
    noteInputRef,
    reviewMotion,
    animateReviewChromeForHandoff,
    hideReviewHeroForHandoff,
    reviewHandoffKey,
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
    closeReview,
    closeNoteSheet,
    deleteCapture,
    copySource,
    markFaviconFailed,
    markReviewHandoffReady,
    markReviewHandoffTarget,
    openCaptureUrl,
    openCollectionPicker,
    openExternalUrl,
    openNoteSheet,
    openVisitTargetMaps,
    pasteExpandedUrl,
    removeReminder,
    saveReminder,
    savePurposeIntent,
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
  const selectedImageCacheKey = captureImageCacheKey(selected);
  const selectedFullImageUrl = captureFullImageUrl(selected);
  const selectedFullImageCacheKey = captureFullImageCacheKey(selected);
  const [failedReviewImageUris, setFailedReviewImageUris] = useState<Set<string>>(() => new Set());
  const selectedHeroImageUrl = [selectedImageUrl, selectedFullImageUrl]
    .filter((url, index, urls) => Boolean(url) && urls.indexOf(url) === index)
    .find((url) => !failedReviewImageUris.has(url)) || "";
  const selectedHeroImageCacheKey =
    selectedHeroImageUrl === selectedImageUrl
      ? selectedImageCacheKey
      : selectedHeroImageUrl === selectedFullImageUrl
        ? selectedFullImageCacheKey
        : "";
  // Keyed by cache key only: refreshed signed URLs keep the same cache key, so
  // the rendered image must not reset (and flash) when capture data reloads.
  const selectedHeroImageRenderKey = selectedHeroImageCacheKey || selectedHeroImageUrl;
  const selectedHeroImageSource = useMemo(
    () => selectedHeroImageCacheKey
      ? { uri: selectedHeroImageUrl, cacheKey: selectedHeroImageCacheKey }
      : { uri: selectedHeroImageUrl },
    [selectedHeroImageCacheKey, selectedHeroImageUrl]
  );
  const [loadedReviewImageUris, setLoadedReviewImageUris] = useState<Set<string>>(() => new Set());
  // Two-stage mount: the first commit renders only the media stage so the
  // handoff can measure the hero and start immediately; the detail plane and
  // sheets (opacity 0 during the morph anyway) mount on the next frame.
  const [deferredContentReady, setDeferredContentReady] = useState(false);

  useEffect(() => {
    let innerFrame: number | null = null;
    const frame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => setDeferredContentReady(true));
    });
    return () => {
      cancelAnimationFrame(frame);
      if (innerFrame !== null) cancelAnimationFrame(innerFrame);
    };
  }, []);
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
  const selectedStatus = displayStatus(selected);
  const selectedNeedsReview = selectedStatus === "needs_review";
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
  const showStatus = selectedStatus !== "ready";
  const reviewScrollY = useSharedValue(0);
  const reviewHeroFrameRef = useRef<View | null>(null);
  const reviewWindowWidth = Dimensions.get("window").width;
  const reviewMediaStatusInset = Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0;
  const reviewBaseExpandedMediaHeight = Math.min(520, Math.max(360, reviewWindowWidth * 1.18));
  const reviewBaseSquareMediaHeight = Math.min(reviewBaseExpandedMediaHeight, reviewWindowWidth);
  const reviewExpandedMediaHeight = reviewBaseExpandedMediaHeight + reviewMediaStatusInset;
  const reviewSquareMediaHeight = reviewBaseSquareMediaHeight + reviewMediaStatusInset;
  const reviewAspectShiftDistance = Math.max(96, reviewExpandedMediaHeight - reviewSquareMediaHeight + 96);
  const reviewScrollHandler = useAnimatedScrollHandler((event) => {
    reviewScrollY.value = event.contentOffset.y;
  });
  const reviewMediaStageStyle = useAnimatedStyle(() => ({
    height: interpolate(
      reviewScrollY.value,
      [0, reviewAspectShiftDistance],
      [reviewExpandedMediaHeight, reviewSquareMediaHeight],
      Extrapolation.CLAMP
    )
  }));
  const reviewMediaImageStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(
          reviewScrollY.value,
          [0, reviewAspectShiftDistance],
          [REVIEW_MEDIA_EXPANDED_IMAGE_SCALE, REVIEW_MEDIA_COLLAPSED_IMAGE_SCALE],
          Extrapolation.CLAMP
        )
      }
    ]
  }));
  const hideHeroImageForHandoff = hideReviewHeroForHandoff;
  const reviewDetailMotion = useSharedValue(animateReviewChromeForHandoff ? 0 : 1);
  const reviewMediaChromeMotion = useSharedValue(animateReviewChromeForHandoff ? 0 : 1);
  const reviewMediaChromeStyle = useAnimatedStyle(() => ({
    opacity: reviewMediaChromeMotion.value,
    transform: [
      {
        translateY: (1 - reviewMediaChromeMotion.value) * 3
      }
    ]
  }));
  const reviewDetailStyle = useAnimatedStyle(() => ({
    opacity: reviewDetailMotion.value,
    transform: [
      {
        translateY: (1 - reviewDetailMotion.value) * 8
      }
    ]
  }));

  const reviewHandoffWasActiveRef = useRef(animateReviewChromeForHandoff);

  useEffect(() => {
    const handoffWasActive = reviewHandoffWasActiveRef.current;
    reviewHandoffWasActiveRef.current = animateReviewChromeForHandoff;
    cancelAnimation(reviewDetailMotion);
    cancelAnimation(reviewMediaChromeMotion);
    if (animateReviewChromeForHandoff) {
      // Handoff in flight: the detail plane rises alongside the hero morph,
      // while the media chrome stays hidden (it sits under the morph overlay).
      reviewMediaChromeMotion.value = 0;
      reviewDetailMotion.value = 0;
      // The detail plane mounts one frame after the media stage; start its
      // rise only once it exists.
      if (!deferredContentReady) return;
      reviewDetailMotion.value = withTiming(1, {
        duration: motionDuration.enter,
        easing: motionEasing.standard,
        reduceMotion: motionReduceMotion
      });
      return;
    }
    reviewDetailMotion.value = 1;
    if (handoffWasActive) {
      // Handoff just finished: the overlay is gone, reveal the chrome on top
      // of the now-live hero.
      reviewMediaChromeMotion.value = 0;
      reviewMediaChromeMotion.value = withTiming(1, {
        duration: motionDuration.quick,
        easing: motionEasing.standard,
        reduceMotion: motionReduceMotion
      });
      return;
    }
    reviewMediaChromeMotion.value = 1;
  }, [animateReviewChromeForHandoff, deferredContentReady, reviewDetailMotion, reviewMediaChromeMotion, selected.id]);

  function measureReviewHeroFrame(onMeasured: (rect: ReviewHandoffRect | null) => void) {
    const node = reviewHeroFrameRef.current;
    if (!node) {
      onMeasured(null);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      if (!width || !height) {
        onMeasured(null);
        return;
      }
      onMeasured({ x, y, width, height, radius: 18 });
    });
  }

  useLayoutEffect(() => {
    if (!reviewHandoffKey || !selectedHeroImageUrl) return;
    const frame = requestAnimationFrame(() => {
      measureReviewHeroFrame((rect) => {
        if (rect) markReviewHandoffTarget(reviewHandoffKey, rect);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [reviewHandoffKey, selectedHeroImageUrl, reviewWindowWidth]);

  useEffect(() => {
    setImageViewerOpen(false);
    setImageViewerSource(null);
    setFailedReviewImageUris(new Set());
    setLoadedReviewImageUris(new Set());
  }, [selected.id]);

  useEffect(() => {
    const imageUrls = Array.from(new Set([selectedImageUrl, selectedFullImageUrl].filter(Boolean)));
    if (!imageUrls.length) return;
    void Image.prefetch(imageUrls, "memory-disk").catch(() => {
      // Display rendering still handles image failures; this only warms review media.
    });
  }, [selectedFullImageUrl, selectedImageUrl]);

  function markReviewImageLoaded(imageUri: string) {
    const trimmedUri = imageUri.trim();
    if (!trimmedUri) return;
    setLoadedReviewImageUris((current) => {
      if (current.has(trimmedUri)) return current;
      const next = new Set(current);
      next.add(trimmedUri);
      return next;
    });
  }

  function markReviewImageDisplayed(imageUri: string) {
    const trimmedUri = imageUri.trim();
    if (trimmedUri === selectedHeroImageUrl) markReviewHandoffReady(reviewHandoffKey);
  }

  function markReviewImageFailed(imageUri: string) {
    const trimmedUri = imageUri.trim();
    if (!trimmedUri || loadedReviewImageUris.has(trimmedUri)) return;
    if (trimmedUri === selectedHeroImageUrl) markReviewHandoffReady(reviewHandoffKey);
    setFailedReviewImageUris((current) => {
      if (current.has(trimmedUri)) return current;
      const next = new Set(current);
      next.add(trimmedUri);
      return next;
    });
  }

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

  function closeReviewFromHero() {
    if (!selectedHeroImageUrl) {
      closeReview();
      return;
    }
    measureReviewHeroFrame((rect) => closeReview(rect));
  }

  return (
    <View style={styles.reviewSafe}>
      <StatusBar backgroundColor={colors.transparent} barStyle={appTheme.statusBarStyle} translucent />
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
            <Reanimated.ScrollView
              style={styles.reviewDetailScroller}
              contentContainerStyle={[
                styles.reviewDetailContent,
                styles.reviewDetailContentNoFooter
              ]}
              keyboardShouldPersistTaps="handled"
              onScroll={reviewScrollHandler}
              scrollEventThrottle={16}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              <Reanimated.View style={[styles.reviewMediaStage, reviewMediaStageStyle]}>
                <MotionPressable
                  collapsable={false}
                  ref={reviewHeroFrameRef}
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
                        cacheKey: selectedFullImageUrl ? selectedFullImageCacheKey : selectedImageCacheKey,
                        url: selectedFullImageUrl || selectedImageUrl
                      });
                      setImageViewerOpen(true);
                      return;
                    }
                    if (selectedOpenUrl) void openCaptureUrl(selectedOpenUrl);
                  }}
                  style={({ pressed }) => [
                    styles.reviewMediaHeader,
                    selectedHeroImageUrl ? styles.reviewMediaHeaderImage : styles.reviewMediaHeaderFallback,
                    pressed && selectedMediaPressEnabled && styles.subtlePressed
                  ]}
                  testID="pc.review.media"
                >
                  {selectedHeroImageUrl ? (
                    <>
                      <Reanimated.View
                        style={[
                          styles.reviewMediaImageFrame,
                          { opacity: hideHeroImageForHandoff ? 0 : 1 },
                          reviewMediaImageStyle
                        ]}
                      >
                        <Image
                          cachePolicy="memory-disk"
                          contentFit="cover"
                          onDisplay={() => markReviewImageDisplayed(selectedHeroImageUrl)}
                          onError={() => markReviewImageFailed(selectedHeroImageUrl)}
                          onLoad={() => markReviewImageLoaded(selectedHeroImageUrl)}
                          recyclingKey={selectedHeroImageRenderKey}
                          source={selectedHeroImageSource}
                          style={styles.reviewMediaImage}
                        />
                      </Reanimated.View>
                      <Reanimated.View style={[styles.reviewMediaOverlay, reviewMediaChromeStyle]}>
                        <View style={styles.reviewMediaSourcePill}>
                          <Text numberOfLines={1} style={styles.reviewMediaSourceText}>
                            {captureSourceLabel(selected)}
                          </Text>
                        </View>
                      </Reanimated.View>
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
                </MotionPressable>
                <Reanimated.View pointerEvents="box-none" style={[styles.reviewMediaTopControls, reviewMediaChromeStyle]}>
                  <MotionPressable
                    accessibilityLabel="Back"
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={closeReviewFromHero}
                    style={({ pressed }) => [styles.reviewMediaIconButton, pressed && styles.subtlePressed]}
                  >
                    <ArrowLeft color={colors.onMediaControlStrong} size={22} weight="regular" />
                  </MotionPressable>
                  <View style={styles.reviewMediaRightControls}>
                    {showStatus ? (
                      selectedStatus === "processing" ? (
                        <ProcessingStatusPill label={captureStatusLabel(selected)} variant="review" />
                      ) : (
                        <Text
                          style={[
                            styles.reviewMediaStatusPill,
                            selectedStatus === "needs_review" && styles.statusReview,
                            selectedStatus === "failed" && styles.statusFailed
                          ]}
                        >
                          {captureStatusLabel(selected)}
                        </Text>
                      )
                    ) : null}
                    <MotionPressable
                      accessibilityLabel="Delete capture"
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={deleteCapture}
                      style={({ pressed }) => [
                        styles.reviewMediaIconButton,
                        styles.reviewMediaDangerButton,
                        pressed && styles.subtlePressed
                      ]}
                      testID="pc.capture.delete"
                    >
                      <Trash2 color={colors.danger} size={21} weight="regular" />
                    </MotionPressable>
                  </View>
                </Reanimated.View>
              </Reanimated.View>
              {deferredContentReady ? (
                <Reanimated.View style={[styles.reviewDetailPlane, reviewDetailStyle]}>
                  <View style={styles.reviewPrimaryBlock}>
                    <TextInput
                      multiline
                      onChangeText={(value) => {
                        setDraftTitleDirty(true);
                        setDraftTitle(value);
                        updateSelectedReviewDraft({ title: value, titleDirty: true });
                      }}
                      placeholder="Title"
                      placeholderTextColor={colors.placeholder}
                      style={styles.reviewTitleInput}
                      testID="pc.review.title"
                      value={draftTitle}
                    />
                    <View style={styles.reviewMetaRow}>
                      <View style={styles.reviewSourceCluster}>
                        {selectedSourceIsSharedImage ? (
                          <View style={styles.reviewSourceImageIconPill}>
                            <Camera color={colors.accentTextStrong} size={17} weight="regular" />
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
                          <MotionPressable
                            accessibilityLabel="Copy source"
                            accessibilityRole="button"
                            hitSlop={8}
                            onPress={() => void copySource()}
                            style={({ pressed }) => [styles.reviewSourceCopyButton, pressed && styles.subtlePressed]}
                          >
                            <Copy color={colors.muted} size={18} weight="regular" />
                          </MotionPressable>
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
                          <View style={styles.inlineMeaningLine}>
                            <Text style={styles.inlineMeaningText}>Saved as </Text>
                            <MotionPressable
                              accessibilityLabel={`Purpose: ${purposeField.displayValue}`}
                              accessibilityRole="button"
                              onPress={() => openInlineField("purpose")}
                              style={({ pressed }) => [styles.inlineMeaningPill, pressed && styles.subtlePressed]}
                              testID="pc.review.intent.open"
                            >
                              <Text
                                style={[
                                  styles.inlineMeaningPillText,
                                  !purposeField.hasValue && styles.inlineMeaningChipTextPending
                                ]}
                              >
                                {purposeField.displayValue}
                              </Text>
                            </MotionPressable>
                          </View>
                        ) : null}
                        {collectionField ? (
                          <View style={styles.inlineMeaningLine}>
                            <Text style={styles.inlineMeaningText}>in </Text>
                            <MotionPressable
                              accessibilityLabel={`Collection: ${collectionField.displayValue}`}
                              accessibilityRole="button"
                              onPress={() => openInlineField("collection")}
                              style={({ pressed }) => [styles.inlineMeaningPill, pressed && styles.subtlePressed]}
                              testID="pc.review.collections.open"
                            >
                              <Text
                                style={[
                                  styles.inlineMeaningPillText,
                                  !collectionField.hasValue && styles.inlineMeaningChipTextPending
                                ]}
                              >
                                {collectionField.displayValue}
                              </Text>
                            </MotionPressable>
                          </View>
                        ) : null}
                        {laterField ? (
                          <View style={styles.inlineMeaningLine}>
                            <Text style={styles.inlineMeaningText}>for </Text>
                            <MotionPressable
                              accessibilityLabel={`Later: ${laterField.displayValue}`}
                              accessibilityRole="button"
                              onPress={() => openInlineField("later")}
                              style={({ pressed }) => [styles.inlineMeaningPill, pressed && styles.subtlePressed]}
                              testID="pc.review.reminder.open"
                            >
                              <Text
                                style={[
                                  styles.inlineMeaningPillText,
                                  !laterField.hasValue && styles.inlineMeaningChipTextPending
                                ]}
                              >
                                {laterField.displayValue}
                              </Text>
                            </MotionPressable>
                          </View>
                        ) : null}
                        {showLocationInline ? (
                          <View style={styles.inlineMeaningLine}>
                            <Text style={styles.inlineMeaningText}>at </Text>
                            <MotionPressable
                              accessibilityLabel={resolvedPlace ? `Open ${locationInlineValue} in Maps` : `Search Maps for ${locationInlineValue}`}
                              accessibilityRole={primaryMapCandidate ? "button" : undefined}
                              onPress={primaryMapCandidate ? () => void openVisitTargetMaps(primaryMapCandidate) : undefined}
                              style={({ pressed }) => [styles.inlineMeaningPill, pressed && primaryMapCandidate && styles.subtlePressed]}
                            >
                              <Text style={styles.inlineMeaningPillText}>
                                {locationInlineValue}
                              </Text>
                            </MotionPressable>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>
                  {urlEvidenceNotice ? (
                    <View style={styles.sourceBlock}>
                      <Text style={styles.sectionTitle}>Link evidence</Text>
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
                    <MotionPressable
                      accessibilityRole="button"
                      onPress={openNoteSheet}
                      style={({ pressed }) => [styles.noteActionCard, pressed && styles.subtlePressed]}
                      testID="pc.review.note.open"
                    >
                      <View style={styles.noteActionCardIcon}>
                        <StickyNote color={colors.accentTextStrong} size={21} weight="regular" />
                      </View>
                      <View style={styles.noteActionCopy}>
                        <View style={styles.noteActionHeader}>
                          <Text style={styles.noteActionTitle}>
                            {noteHasText ? "Note" : "Add note"}
                          </Text>
                          {noteStatusLabel ? (
                            <Text style={[styles.noteSaveState, noteSaveState === "error" && styles.noteSaveStateError]}>
                              {noteStatusLabel}
                            </Text>
                          ) : null}
                        </View>
                        <Text numberOfLines={noteHasText ? 2 : 1} style={styles.noteActionPreview}>
                          {noteHasText ? draftNote : "Why did you save this?"}
                        </Text>
                      </View>
                      <CaretRight color={colors.muted} size={18} weight="bold" />
                    </MotionPressable>
                  </View>
                </Reanimated.View>
              ) : null}
              </Reanimated.ScrollView>
          </View>
        </View>
      </Animated.View>
      {!deferredContentReady ? (
        toast
      ) : (
        <>
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
              <SheetHeader
                closeLabel="Close note editor"
                confirmLabel="Done"
                onClose={() => closeNoteSheet()}
                onConfirm={() => closeNoteSheet()}
                title="Note"
              />
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
                  placeholderTextColor={colors.placeholder}
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
            <SheetHeader
              closeLabel="Close Purpose choices"
              onClose={() => setQuickIntentOpen(false)}
              subtitle="Choose what this capture should help you do later."
              title="Purpose"
            />
            {purposeRationale.visible ? (
              <AiFieldInsight insight={purposeRationale} />
            ) : null}
            <View style={styles.purposeOptionGrid}>
              {INTENT_OPTIONS.map((intent) => {
                const selectedIntent = quickIntentValue === intent;
                return (
                  <MotionPressable
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
                  </MotionPressable>
                );
              })}
              <MotionPressable
                accessibilityRole="button"
                onPress={() => {
                  setQuickIntentOpen(false);
                  savePurposeIntent(null);
                }}
                style={({ pressed }) => [
                  styles.purposeOption,
                  styles.purposeOptionWide,
                  !quickIntentValue && styles.purposeOptionSelected,
                  pressed && styles.subtlePressed
                ]}
                testID="pc.intent.option.none"
              >
                <Text style={[styles.purposeOptionText, !quickIntentValue && styles.purposeOptionTextSelected]}>
                  No intent
                </Text>
              </MotionPressable>
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
        </>
      )}
    </View>
  );
}
