import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, ReactNode, RefObject, SetStateAction } from "react";
import type { GestureResponderEvent } from "react-native";
import type { TextInput as NativeTextInput } from "react-native";
import {
  Animated,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
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
  MapPin,
  Note as StickyNote,
  PencilSimple,
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
  captureOpenUrl,
  captureReviewSourceLabel,
  captureSourceLabel,
  captureStatusLabel,
  formatDateTime,
  normalizeIntent,
  isImageCapture,
  reminderDraftKey,
  reminderLabel,
  reminderLabelParts,
  reviewStatusCue,
  urlEvidenceMessage
} from "../capturePresentation";
import { ReminderEditorSheet } from "../sheets/ReminderEditorSheet";
import { motionDuration, motionEasing, motionReduceMotion, reviewHeroExpandedScale } from "../ui/motion";
import { appTheme, colors } from "../ui/theme";
import { styles } from "../ui/styles";
import { AiFieldInsight, AnimatedBottomSheet, CollectionSuggestionCard, KeyboardSheet, MotionPressable, ProcessingStatusPill, SheetHeader, SourceMark, keyboardSheetMetrics } from "../ui/components";
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
    titleInputRef: RefObject<NativeTextInput | null>;
    reviewMotion: Animated.Value;
    animateReviewChromeForHandoff: boolean;
    hideReviewHeroForHandoff: boolean;
    reviewHandoffKey: number | null;
    reviewHandoffPinSource: { cacheKey: string; url: string } | null;
    reviewHeroCloseRef: MutableRefObject<(() => void) | null>;
    selected: Capture;
    toast: ReactNode;
    visitTargetMapCandidates: MapSearchCandidate[];
    windowHeight: number;
  };
  state: {
    collectionChoiceSaving: string | null;
    suggestionBusy: boolean;
    draftIntent: string;
    draftIntentDirty: boolean;
    draftNote: string;
    draftNoteDirty: boolean;
    draftTitle: string;
    draftTitleDirty: boolean;
    noteSaveState: NoteSaveState;
    noteSheetOpen: boolean;
    titleSheetOpen: boolean;
    quickIntentOpen: boolean;
    reminderDrafts: Record<string, ReminderDraftAction>;
    reminderSheetOpen: boolean;
  };
  actions: {
    closeReview: (options?: {
      allowHandoff?: boolean;
      fromRect?: ReviewHandoffRect | null;
      heroScale?: number;
      imageCacheKey?: string;
      imageUrl?: string;
    }) => void;
    closeNoteSheet: (options?: { keyboardHidden?: boolean }) => void;
    closeTitleSheet: (options?: { keyboardHidden?: boolean }) => void;
    deleteCapture: () => void;
    copySource: () => void;
    markFaviconFailed: (host: string) => void;
    markReviewHandoffReady: (key: number | null) => void;
    markReviewHandoffTarget: (key: number | null, rect: ReviewHandoffRect) => void;
    confirmSuggestion: (collectionId: string) => void;
    dismissSuggestion: (collectionId: string, captureId: string) => void;
    openCaptureUrl: (url: string) => void;
    openCollectionPicker: () => void;
    openExternalUrl: (url: string) => void;
    openNoteSheet: () => void;
    openTitleSheet: () => void;
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
    titleInputRef,
    reviewMotion,
    animateReviewChromeForHandoff,
    hideReviewHeroForHandoff,
    reviewHandoffKey,
    reviewHandoffPinSource,
    reviewHeroCloseRef,
    selected,
    toast,
    visitTargetMapCandidates,
    windowHeight
  } = data;
  const {
    collectionChoiceSaving,
    suggestionBusy,
    draftIntent,
    draftIntentDirty,
    draftNote,
    draftNoteDirty,
    draftTitle,
    noteSaveState,
    noteSheetOpen,
    titleSheetOpen,
    quickIntentOpen,
    reminderDrafts,
    reminderSheetOpen
  } = state;
  const {
    closeReview,
    closeNoteSheet,
    closeTitleSheet,
    deleteCapture,
    copySource,
    markFaviconFailed,
    markReviewHandoffReady,
    markReviewHandoffTarget,
    confirmSuggestion,
    dismissSuggestion,
    openCaptureUrl,
    openCollectionPicker,
    openExternalUrl,
    openNoteSheet,
    openTitleSheet,
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
  const [loadedReviewImageUris, setLoadedReviewImageUris] = useState<Set<string>>(() => new Set());
  const heroCandidateUrl = [selectedImageUrl, selectedFullImageUrl]
    .filter((url, index, urls) => Boolean(url) && urls.indexOf(url) === index)
    .find((url) => !failedReviewImageUris.has(url)) || "";
  const heroCandidateCacheKey =
    heroCandidateUrl === selectedImageUrl
      ? selectedImageCacheKey
      : heroCandidateUrl === selectedFullImageUrl
        ? selectedFullImageCacheKey
        : "";
  // Pin the hero source through the open flight. The morph flies the row
  // thumbnail's DISPLAYED pixels; the hero must show those exact pixels or the
  // landing visibly re-crops. We hold the pin until the flight has fully landed
  // (see the post-landing upgrade below), then swap up to a higher-res variant.
  // Failed pins fall through to the next candidate.
  const pinnedHeroRef = useRef<{ captureId: string; url: string; cacheKey: string } | null>(null);
  if (pinnedHeroRef.current && pinnedHeroRef.current.captureId !== selected.id) {
    pinnedHeroRef.current = null;
  }
  if (pinnedHeroRef.current && failedReviewImageUris.has(pinnedHeroRef.current.url)) {
    pinnedHeroRef.current = null;
  }
  if (!pinnedHeroRef.current) {
    // Prefer the source the opening morph is flying (the row thumbnail's
    // DISPLAYED pixels, which can lag the capture's current image url while
    // a source upgrade loads — or forever when it fails). The hero must show
    // those exact pixels or the landing swap visibly re-crops. Skip it once
    // it has failed here; the candidate chain takes over.
    const handoffPinUrl =
      reviewHandoffPinSource?.url && !failedReviewImageUris.has(reviewHandoffPinSource.url)
        ? reviewHandoffPinSource.url
        : "";
    if (handoffPinUrl) {
      pinnedHeroRef.current = {
        cacheKey: reviewHandoffPinSource?.cacheKey || "",
        captureId: selected.id,
        url: handoffPinUrl
      };
    } else if (heroCandidateUrl) {
      pinnedHeroRef.current = {
        cacheKey: heroCandidateCacheKey,
        captureId: selected.id,
        url: heroCandidateUrl
      };
    }
  }
  // Post-landing resolution upgrade. All server image variants now share the
  // original's intrinsic aspect ratio, so under contentFit="cover" swapping the
  // pinned (often low-res thumb) source for the highest-res variant re-frames
  // identically — the hero just sharpens in place. We only swap once the open
  // flight has fully landed (reviewHandoffKey == null, so we never re-aim a
  // copy mid-flight) and the upgrade source has actually decoded (it's in the
  // loaded set, fed by the prefetch effect below). A failed upgrade clears and
  // falls back to the pin.
  const adoptedUpgradeRef = useRef<{ captureId: string; url: string; cacheKey: string } | null>(null);
  if (adoptedUpgradeRef.current && adoptedUpgradeRef.current.captureId !== selected.id) {
    adoptedUpgradeRef.current = null;
  }
  if (adoptedUpgradeRef.current && failedReviewImageUris.has(adoptedUpgradeRef.current.url)) {
    adoptedUpgradeRef.current = null;
  }
  const pinnedHeroUrl = pinnedHeroRef.current?.url || "";
  const bestUpgradeSourceUrl = [selectedFullImageUrl, selectedImageUrl]
    .filter(Boolean)
    .find((url) => !failedReviewImageUris.has(url)) || "";
  const upgradeCandidateUrl =
    bestUpgradeSourceUrl && bestUpgradeSourceUrl !== pinnedHeroUrl ? bestUpgradeSourceUrl : "";
  const upgradeCandidateCacheKey =
    upgradeCandidateUrl === selectedFullImageUrl
      ? selectedFullImageCacheKey
      : upgradeCandidateUrl === selectedImageUrl
        ? selectedImageCacheKey
        : "";
  if (
    !adoptedUpgradeRef.current &&
    reviewHandoffKey == null &&
    upgradeCandidateUrl &&
    loadedReviewImageUris.has(upgradeCandidateUrl)
  ) {
    adoptedUpgradeRef.current = {
      cacheKey: upgradeCandidateCacheKey,
      captureId: selected.id,
      url: upgradeCandidateUrl
    };
  }
  const selectedHeroImageUrl =
    adoptedUpgradeRef.current?.url || pinnedHeroRef.current?.url || heroCandidateUrl;
  const selectedHeroImageCacheKey =
    adoptedUpgradeRef.current?.cacheKey || pinnedHeroRef.current?.cacheKey || heroCandidateCacheKey;
  // Keyed by capture identity: recyclingKey resets the view to blank when it
  // changes, which must only happen when the hero shows a different capture —
  // never when detail hydration upgrades this capture's source (legacy
  // captures gain imageAssetUrl right after the open animation completes).
  // expo-image holds the previous pixels until the new source is decoded.
  const selectedHeroImageRenderKey = selected.id;
  const selectedHeroImageSource = useMemo(
    () => selectedHeroImageCacheKey
      ? { uri: selectedHeroImageUrl, cacheKey: selectedHeroImageCacheKey }
      : { uri: selectedHeroImageUrl },
    [selectedHeroImageCacheKey, selectedHeroImageUrl]
  );
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
  const laterParts = laterField?.hasValue ? reminderLabelParts(reminderRows[0]) : null;
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
  const {
    keyboardVisible: noteSheetKeyboardVisible,
    screenHeight,
    maxHeight: noteSheetMaxHeight,
    bottomInset: noteSheetBottomInset
  } = keyboardSheetMetrics({
    active: noteSheetOpen,
    keyboardHeight,
    windowHeight,
    keyboardInset: captureKeyboardInset,
    maxWithKeyboard: 440,
    maxWithoutKeyboard: 500,
    withoutKeyboardScale: 0.64
  });
  const {
    keyboardVisible: titleSheetKeyboardVisible,
    maxHeight: titleSheetMaxHeight,
    bottomInset: titleSheetBottomInset
  } = keyboardSheetMetrics({
    active: titleSheetOpen,
    keyboardHeight,
    windowHeight,
    keyboardInset: captureKeyboardInset,
    maxWithKeyboard: 440,
    maxWithoutKeyboard: 500,
    withoutKeyboardScale: 0.64
  });
  const showStatus = selectedStatus !== "ready";
  const reviewScrollY = useSharedValue(0);
  const reviewScrollRef = useRef<ScrollView | null>(null);
  const reviewScrollLayoutRef = useRef<View | null>(null);
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
          [reviewHeroExpandedScale, REVIEW_MEDIA_COLLAPSED_IMAGE_SCALE],
          Extrapolation.CLAMP
        )
      }
    ]
  }));
  const hideHeroImageForHandoff = hideReviewHeroForHandoff;
  // Hidden while a handoff covers it; revealed by the finish COMMIT — the
  // same Fabric commit that unmounts the morph copy. Commit atomicity makes
  // the handover a guaranteed same-frame swap of identical pixels (never a
  // crossfade: blending two copies dips opacity and the background shimmers
  // through; and never cross-component shared-value wiring, which missed).
  const reviewHeroHidden = hideHeroImageForHandoff || animateReviewChromeForHandoff;
  const reviewHeroVisibilityStyle = { opacity: reviewHeroHidden ? 0 : 1 };
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

  // Links with no preview image open straight to the editorial (title-led)
  // detail — there is no hero to morph from, so the whole screen fades and
  // rises in as one piece. Image captures keep their shared-element morph.
  const reviewIsEditorial = !selectedHeroImageUrl;
  const editorialEnter = useSharedValue(reviewIsEditorial ? 0 : 1);
  useEffect(() => {
    if (!reviewIsEditorial) {
      editorialEnter.value = 1;
      return;
    }
    editorialEnter.value = 0;
    editorialEnter.value = withTiming(1, {
      duration: motionDuration.enter,
      easing: motionEasing.standard,
      reduceMotion: motionReduceMotion
    });
  }, [editorialEnter, reviewIsEditorial, selected.id]);
  const editorialEnterStyle = useAnimatedStyle(() => ({
    opacity: editorialEnter.value,
    transform: [{ translateY: (1 - editorialEnter.value) * 14 }]
  }));

  const reviewHandoffWasActiveRef = useRef(animateReviewChromeForHandoff);

  useEffect(() => {
    const handoffWasActive = reviewHandoffWasActiveRef.current;
    reviewHandoffWasActiveRef.current = animateReviewChromeForHandoff;
    cancelAnimation(reviewDetailMotion);
    cancelAnimation(reviewMediaChromeMotion);
    if (animateReviewChromeForHandoff) {
      // Handoff in flight: the detail plane rises alongside the hero morph,
      // while the media chrome stays hidden (it sits under the morph overlay)
      // until the crossfade reveal above kicks in.
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
      // Handoff finished; the crossfade reveal may still be mid-flight —
      // continue it to fully visible from wherever it is (no reset).
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

  // Measure (= start the morph) only after the deferred content has
  // committed: the morph clock runs on wall time, so a heavy commit during
  // the flight drops frames and the animation visibly jump-cuts. With the
  // measurement gated on stage 2, every mount commit lands BEFORE the first
  // morph frame and the flight itself is commit-free.
  useLayoutEffect(() => {
    if (!reviewHandoffKey || !selectedHeroImageUrl || !deferredContentReady) return;
    const frame = requestAnimationFrame(() => {
      measureReviewHeroFrame((rect) => {
        if (rect) markReviewHandoffTarget(reviewHandoffKey, rect);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [deferredContentReady, reviewHandoffKey, selectedHeroImageUrl, reviewWindowWidth]);

  // Hardware/gesture back must run the same scroll-aware hero return as the
  // back button; keep the latest closure registered with the app shell.
  useEffect(() => {
    reviewHeroCloseRef.current = closeReviewFromHero;
    return () => {
      reviewHeroCloseRef.current = null;
    };
  });

  useEffect(() => {
    setImageViewerOpen(false);
    setImageViewerSource(null);
    setFailedReviewImageUris(new Set());
    setLoadedReviewImageUris(new Set());
    // An in-place capture re-target (the processing poll can swap a local id
    // for its remote id) must land in the scroll-prepared state: scrollY 0,
    // hero zoomed to the expanded scale, stage at full height.
    reviewScrollY.value = 0;
    reviewScrollRef.current?.scrollTo({ animated: false, y: 0 });
  }, [reviewScrollY, selected.id]);

  useEffect(() => {
    const imageUrls = Array.from(new Set([selectedImageUrl, selectedFullImageUrl].filter(Boolean)));
    if (!imageUrls.length) return;
    let cancelled = false;
    // Warm review media off-screen AND record which URLs have decoded. The hero
    // only ever renders the pinned source, so its onLoad never fires for the
    // upgrade variant — this prefetch resolution is the loaded signal the
    // post-landing upgrade gates on, so the swap is a cache hit with no flash.
    for (const url of imageUrls) {
      void Image.prefetch(url, "memory-disk")
        .then((loaded) => {
          if (!cancelled && loaded) markReviewImageLoaded(url);
        })
        .catch(() => {
          // Display rendering still handles image failures; this only warms review media.
        });
    }
    return () => {
      cancelled = true;
    };
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
    // Only the currently rendered hero may trigger the URL fail-over —
    // errors from stale/superseded sources must not swap (and blank) the
    // image the user is looking at.
    if (trimmedUri !== selectedHeroImageUrl) return;
    markReviewHandoffReady(reviewHandoffKey);
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
      // Editorial (no-image) detail has no hero to morph from — it fades out.
      closeReview();
      return;
    }
    const layoutNode = reviewScrollLayoutRef.current;
    if (!layoutNode) {
      closeReview({ allowHandoff: false });
      return;
    }
    // The morph must take over exactly where the scroll-driven collapse left
    // the hero: same rect, same interpolated image scale. ONE scrollY sample
    // drives position, height and zoom — the same value the on-screen
    // worklets render from — so the derived rect and scale can never
    // disagree with each other or with the visual. (Measuring the hero node
    // itself raced settling scrolls: the async rect and the sync scale were
    // sampled at different instants, and the copy took off at the wrong
    // spot and zoom.)
    const scrollY = reviewScrollY.value;
    // Halt any in-flight momentum so the hero cannot drift between this
    // sample and the copy's first painted frame.
    reviewScrollRef.current?.scrollTo({ animated: false, y: scrollY });
    const collapseProgress = Math.min(
      1,
      Math.max(0, scrollY / reviewAspectShiftDistance)
    );
    const stageHeight =
      reviewExpandedMediaHeight +
      (reviewSquareMediaHeight - reviewExpandedMediaHeight) * collapseProgress;
    const heroScale =
      reviewHeroExpandedScale +
      (REVIEW_MEDIA_COLLAPSED_IMAGE_SCALE - reviewHeroExpandedScale) * collapseProgress;
    // Only the scroll layout's window origin is measured — it is static
    // while content scrolls, so this measurement cannot go stale.
    layoutNode.measureInWindow((layoutX, layoutY, layoutWidth) => {
      const rect = {
        // The header card insets the stage by 8 on the sides/bottom and by
        // the status inset + 8 on top (styles.reviewMediaHeaderImage).
        x: layoutX + 8,
        y: layoutY - scrollY + reviewMediaStatusInset + 8,
        width: layoutWidth - 16,
        height: stageHeight - reviewMediaStatusInset - 16,
        radius: 18
      };
      // Scrolled mostly out of view: nothing to hand off — close plainly
      // instead of flying an unclipped copy across content.
      if (rect.y < -rect.height * 0.5) {
        closeReview({ allowHandoff: false });
        return;
      }
      // Fly the exact source the hero is rendering (the pinned open-time
      // URL) — deriving it from the hydrated capture flew an upgraded asset
      // the row thumbnail never showed, so the landing swap changed pixels.
      closeReview({
        fromRect: rect,
        heroScale,
        imageCacheKey: selectedHeroImageCacheKey,
        imageUrl: selectedHeroImageUrl
      });
    });
  }

  // Back / status / delete — shared by the image hero (floating over the
  // media) and the editorial header (in normal flow above the title).
  const topControls = (
    <>
      <MotionPressable
        accessibilityLabel="Back"
        accessibilityRole="button"
        hitSlop={8}
        onPress={closeReviewFromHero}
        style={({ pressed }) => [
          styles.reviewMediaIconButton,
          // White circle with a dark icon everywhere, matching the delete
          // button — on the editorial paper and over photo heroes alike.
          styles.reviewMediaIconButtonInverse,
          pressed && styles.subtlePressed
        ]}
      >
        <ArrowLeft color={colors.ink} size={22} weight="regular" />
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
    </>
  );

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
          <View collapsable={false} ref={reviewScrollLayoutRef} style={styles.reviewScrollLayout}>
            <Reanimated.ScrollView
              ref={reviewScrollRef}
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
              {reviewIsEditorial ? (
                // No preview image: skip the tall media hero entirely. A
                // compact control bar sits over the paper and the title (in
                // the detail plane below) becomes the hero.
                <Reanimated.View
                  pointerEvents="box-none"
                  style={[styles.reviewEditorialBar, editorialEnterStyle]}
                >
                  {topControls}
                </Reanimated.View>
              ) : (
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
                      styles.reviewMediaHeaderImage,
                      pressed && selectedMediaPressEnabled && styles.subtlePressed
                    ]}
                    testID="pc.review.media"
                  >
                    <Reanimated.View
                      style={[
                        styles.reviewMediaImageFrame,
                        reviewHeroVisibilityStyle,
                        reviewMediaImageStyle
                      ]}
                    >
                      <Image
                        // Decode at full quality like the morph overlay
                        // copy does: the crossfade hands over between the
                        // two, and a downscaled-vs-full decode of the same
                        // source reads as a subtle flicker at the seam.
                        allowDownscaling={false}
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
                  </MotionPressable>
                  <Reanimated.View pointerEvents="box-none" style={[styles.reviewMediaTopControls, reviewMediaChromeStyle]}>
                    {topControls}
                  </Reanimated.View>
                </Reanimated.View>
              )}
              {deferredContentReady ? (
                <Reanimated.View
                  style={[
                    styles.reviewDetailPlane,
                    reviewIsEditorial ? editorialEnterStyle : reviewDetailStyle
                  ]}
                >
                  <View style={styles.reviewPrimaryBlock}>
                    <MotionPressable
                      accessibilityLabel="Edit title"
                      accessibilityRole="button"
                      onPress={openTitleSheet}
                      style={({ pressed }) => [styles.reviewTitleRow, pressed && styles.subtlePressed]}
                    >
                      <Text
                        style={[styles.reviewTitleText, !draftTitle.trim() && styles.reviewTitleTextEmpty]}
                        testID="pc.review.title"
                      >
                        {draftTitle.trim() || "Add a title"}
                      </Text>
                      <View style={styles.reviewTitleEditButton}>
                        <PencilSimple color={colors.muted} size={18} weight="regular" />
                      </View>
                    </MotionPressable>
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
                    <Text style={styles.reviewActionLabel}>Saved as</Text>
                    <View style={styles.propertyRowsCard}>
                      {purposeField ? (
                        <MotionPressable
                          accessibilityLabel={`Purpose: ${purposeField.displayValue}`}
                          accessibilityRole="button"
                          onPress={() => openInlineField("purpose")}
                          pressScale={1}
                          style={({ pressed }) => [styles.propertyRow, pressed && styles.propertyRowPressed]}
                          testID="pc.review.intent.open"
                        >
                          <Text style={styles.propertyRowLabel}>Purpose</Text>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.propertyRowValue,
                              !purposeField.hasValue && styles.propertyRowValuePending
                            ]}
                          >
                            {purposeField.displayValue}
                          </Text>
                          <CaretRight color={colors.placeholder} size={17} weight="bold" />
                        </MotionPressable>
                      ) : null}
                      {collectionField ? (
                        <MotionPressable
                          accessibilityLabel={`Collection: ${collectionField.displayValue}`}
                          accessibilityRole="button"
                          onPress={() => openInlineField("collection")}
                          pressScale={1}
                          style={({ pressed }) => [styles.propertyRow, pressed && styles.propertyRowPressed]}
                          testID="pc.review.collections.open"
                        >
                          <Text style={styles.propertyRowLabel}>Collection</Text>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.propertyRowValue,
                              !collectionField.hasValue && styles.propertyRowValuePending
                            ]}
                          >
                            {collectionField.displayValue}
                          </Text>
                          <CaretRight color={colors.placeholder} size={17} weight="bold" />
                        </MotionPressable>
                      ) : null}
                      {laterField ? (
                        <MotionPressable
                          accessibilityLabel={`When: ${laterField.displayValue}`}
                          accessibilityRole="button"
                          onPress={() => openInlineField("later")}
                          pressScale={1}
                          style={({ pressed }) => [styles.propertyRow, pressed && styles.propertyRowPressed]}
                          testID="pc.review.reminder.open"
                        >
                          <Text style={styles.propertyRowLabel}>When</Text>
                          {laterParts?.timeLabel ? (
                            <View style={styles.propertyRowValueColumn}>
                              <Text numberOfLines={1} style={styles.propertyRowValue}>
                                {laterParts.dateLabel}
                              </Text>
                              <Text numberOfLines={1} style={styles.propertyRowValueSub}>
                                {laterParts.timeLabel}
                              </Text>
                            </View>
                          ) : (
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.propertyRowValue,
                                !laterField.hasValue && styles.propertyRowValuePending
                              ]}
                            >
                              {laterParts?.dateLabel || laterField.displayValue}
                            </Text>
                          )}
                          <CaretRight color={colors.placeholder} size={17} weight="bold" />
                        </MotionPressable>
                      ) : null}
                      {showLocationInline ? (
                        <MotionPressable
                          accessibilityLabel={resolvedPlace ? `Open ${locationInlineValue} in Maps` : `Search Maps for ${locationInlineValue}`}
                          accessibilityRole={primaryMapCandidate ? "button" : undefined}
                          onPress={primaryMapCandidate ? () => void openVisitTargetMaps(primaryMapCandidate) : undefined}
                          pressScale={1}
                          style={({ pressed }) => [styles.propertyRow, pressed && primaryMapCandidate && styles.propertyRowPressed]}
                        >
                          <Text style={styles.propertyRowLabel}>Location</Text>
                          <Text numberOfLines={1} style={styles.propertyRowValue}>
                            {locationInlineValue}
                          </Text>
                          {primaryMapCandidate ? (
                            <MapPin color={colors.placeholder} size={17} weight="regular" />
                          ) : null}
                        </MotionPressable>
                      ) : null}
                    </View>
                  </View>
                  {selected.pendingSuggestion ? (
                    <View style={styles.reviewSuggestionBlock}>
                      <CollectionSuggestionCard
                        busy={suggestionBusy}
                        confirmLabel="Create collection"
                        onConfirm={() => confirmSuggestion(selected.pendingSuggestion!.collectionId)}
                        onDismiss={() =>
                          dismissSuggestion(
                            selected.pendingSuggestion!.collectionId,
                            selected.remoteId || selected.id
                          )
                        }
                        suggestion={selected.pendingSuggestion}
                        testID="pc.review.suggestion"
                      />
                    </View>
                  ) : null}
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
        <KeyboardSheet
          backdropLabel="Close note editor"
          bottomInset={noteSheetBottomInset}
          compact={noteSheetKeyboardVisible}
          maxHeight={noteSheetMaxHeight}
          motion={captureComposerMotion}
          onBackdropPress={() => closeNoteSheet()}
          screenHeight={screenHeight}
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
        </KeyboardSheet>
      ) : null}
      {titleSheetOpen ? (
        <KeyboardSheet
          backdropLabel="Close title editor"
          bottomInset={titleSheetBottomInset}
          compact={titleSheetKeyboardVisible}
          maxHeight={titleSheetMaxHeight}
          motion={captureComposerMotion}
          onBackdropPress={() => closeTitleSheet()}
          screenHeight={screenHeight}
        >
          <View style={styles.sheetGrabber} />
          <SheetHeader
            closeLabel="Close title editor"
            confirmLabel="Done"
            onClose={() => closeTitleSheet()}
            onConfirm={() => closeTitleSheet()}
            title="Title"
          />
          <View
            style={[
              styles.captureSheetBody,
              styles.captureSheetBodyContent,
              titleSheetKeyboardVisible && styles.captureSheetBodyContentCompact
            ]}
          >
            <TextInput
              multiline
              onChangeText={(value) => {
                setDraftTitleDirty(true);
                setDraftTitle(value);
                updateSelectedReviewDraft({ title: value, titleDirty: true });
              }}
              placeholder="Title"
              placeholderTextColor={colors.placeholder}
              ref={titleInputRef}
              style={[styles.captureInput, styles.noteSheetInput]}
              testID="pc.review.title.input"
              value={draftTitle}
            />
          </View>
        </KeyboardSheet>
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
