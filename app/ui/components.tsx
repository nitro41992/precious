import { forwardRef, memo, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { PressableProps, PressableStateCallbackType, StyleProp, ViewStyle } from "react-native";
import { Animated, Dimensions, Easing, KeyboardAvoidingView, Pressable, View } from "react-native";
import { Image } from "expo-image";
import { Check, ClockClockwise, Folder, Folders, Gear, HouseSimple, Info, Plus, Sparkle, Warning, X } from "phosphor-react-native";
import Reanimated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import type {
  AppIconComponent,
  Capture,
  CaptureFieldRationale,
  CaptureImageLoadState,
  CaptureStatus,
  LinkedCollection,
  NavIconComponent,
  NavIconProps,
  ToastPlacement,
  ToastState,
  ToastTone
} from "../types";
import { markDeleteTraceNextFrame } from "../deleteTrace";
import { displayStatus, hostFromUrl } from "../captureLogic";
import {
  captureFaviconHost,
  captureImageCacheKey,
  captureImageUrl,
  captureSourceHost,
  captureStatusLabel,
  isScreenshotCapture,
  sourceFaviconUrl,
  sourceIconForCapture,
  uniqueStrings
} from "../capturePresentation";
import { colors } from "./theme";
import { styles } from "./styles";
import {
  motionDuration,
  motionEasing,
  motionPressScale,
  motionPressSpring,
  motionReduceMotion,
  statusEntering,
  statusExiting,
  statusLayout,
  toastLayout
} from "./motion";
import { Text } from "./typography";

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

type MotionPressableProps = Omit<PressableProps, "style"> & {
  pressScale?: number;
  style?: PressableProps["style"];
};

export const MotionPressable = forwardRef<View, MotionPressableProps>(function MotionPressable({
  disabled = false,
  onPressIn,
  onPressOut,
  pressScale = motionPressScale.standard,
  style,
  ...props
}: MotionPressableProps, ref) {
  const scale = useSharedValue(1);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    if (!disabled) return;
    cancelAnimation(scale);
    scale.value = 1;
    setPressed(false);
  }, [disabled, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const pressableState: PressableStateCallbackType = { pressed };
  const pressableStyle = [
    typeof style === "function" ? style(pressableState) : style,
    animatedStyle
  ];

  const handlePressIn: PressableProps["onPressIn"] = (event) => {
    onPressIn?.(event);
    if (disabled) return;
    setPressed(true);
    cancelAnimation(scale);
    scale.value = withTiming(pressScale, {
      duration: motionDuration.instant,
      easing: motionEasing.press,
      reduceMotion: motionReduceMotion
    });
  };

  const handlePressOut: PressableProps["onPressOut"] = (event) => {
    onPressOut?.(event);
    if (disabled) return;
    setPressed(false);
    cancelAnimation(scale);
    scale.value = withSpring(1, motionPressSpring);
  };

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      ref={ref}
      style={pressableStyle}
    />
  );
});

export function AnimatedBottomSheet({
  children,
  closeLabel,
  onClose,
  sheetStyle,
  variant = "modal",
  visible
}: {
  children: ReactNode;
  closeLabel: string;
  onClose: () => void;
  sheetStyle?: StyleProp<ViewStyle>;
  variant?: "modal" | "sheet";
  visible: boolean;
}) {
  const motion = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    motion.stopAnimation();
    if (visible) {
      if (!mounted) {
        setMounted(true);
        return;
      }
      setMounted(true);
      motion.setValue(0);
      const frame = requestAnimationFrame(() => {
        Animated.timing(motion, {
          duration: 165,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true
        }).start();
      });
      return () => cancelAnimationFrame(frame);
    }
    if (!mounted) return;
    Animated.timing(motion, {
      duration: 135,
      easing: Easing.in(Easing.cubic),
      toValue: 0,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [mounted, motion, visible]);

  if (!mounted) return null;

  const offscreenY = Math.max(560, Dimensions.get("screen").height);
  const translateY = motion.interpolate({
    inputRange: [0, 1],
    outputRange: [offscreenY, 0]
  });

  return (
    <View style={variant === "sheet" ? styles.sheetLayer : styles.modalLayer} pointerEvents="box-none">
      <View pointerEvents="none" style={variant === "sheet" ? styles.sheetBackdrop : styles.modalBackdrop} />
      <Pressable accessibilityLabel={closeLabel} onPress={onClose} style={styles.sheetBackdropHit} />
      <Animated.View
        style={[
          sheetStyle,
          {
            transform: [{ translateY }]
          }
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

// Bottom margin for a keyboard sheet: the raw keyboard inset, the inset plus a
// resting gap, or a plain gap when the window is already keyboard-sized.
type KeyboardSheetInset = Animated.Value | Animated.AnimatedAddition<number> | number;

type KeyboardSheetMetrics = {
  keyboardVisible: boolean;
  screenHeight: number;
  maxHeight: number;
  bottomInset: KeyboardSheetInset;
};

// Shared sizing for the keyboard-aware bottom sheets (capture composer, note,
// title, collection composer). They all clamp the sheet to the space above the
// keyboard and pin its bottom to the keyboard inset; only the height caps and
// the resting-height scale differ per sheet, so those come in as parameters.
// Centralizing this keeps the four sheets from drifting apart and means a sizing
// fix lands in one place.
export function keyboardSheetMetrics({
  active,
  keyboardHeight,
  windowHeight,
  keyboardInset,
  maxWithKeyboard,
  maxWithoutKeyboard,
  withoutKeyboardScale
}: {
  active: boolean;
  keyboardHeight: number;
  windowHeight: number;
  keyboardInset: Animated.Value;
  maxWithKeyboard: number;
  maxWithoutKeyboard: number;
  withoutKeyboardScale: number;
}): KeyboardSheetMetrics {
  const keyboardVisible = active && keyboardHeight > 0;
  const screenHeight = Dimensions.get("screen").height;
  // When the OS already shrinks the window to exclude the keyboard
  // (android:windowSoftInputMode=adjustResize), don't subtract the inset twice —
  // just leave the resting gap.
  const windowAlreadyKeyboardSized =
    keyboardVisible && Math.abs(windowHeight + keyboardHeight - screenHeight) < 96;
  const visibleHeight = keyboardVisible && !windowAlreadyKeyboardSized
    ? windowHeight - keyboardHeight
    : windowHeight;
  const keyboardGap = keyboardVisible ? 16 : 0;
  const maxHeight = keyboardVisible
    ? Math.min(maxWithKeyboard, Math.max(320, visibleHeight - 24 - keyboardGap))
    : Math.min(maxWithoutKeyboard, Math.max(340, windowHeight * withoutKeyboardScale));
  const bottomInset: KeyboardSheetInset = windowAlreadyKeyboardSized
    ? keyboardGap
    : keyboardVisible
      ? Animated.add(keyboardInset, keyboardGap)
      : keyboardInset;
  return { keyboardVisible, screenHeight, maxHeight, bottomInset };
}

// Shared shell for the keyboard-aware bottom sheets: backdrop + keyboard-avoiding
// frame + the sliding Animated.View. `motion` (translateY) and `bottomInset`
// (marginBottom) must both be JS-driven Animated values — they share this one
// view, and mixing a native-driven transform with a JS-driven layout prop here
// crashes the keyboard animation. Each sheet supplies only its own children.
export function KeyboardSheet({
  backdropLabel,
  bottomInset,
  children,
  compact,
  maxHeight,
  motion,
  onBackdropPress,
  screenHeight
}: {
  backdropLabel: string;
  bottomInset: KeyboardSheetInset;
  children: ReactNode;
  compact: boolean;
  maxHeight: number;
  motion: Animated.Value;
  onBackdropPress: () => void;
  screenHeight: number;
}) {
  return (
    <View style={styles.sheetLayer} pointerEvents="box-none">
      <Pressable accessibilityLabel={backdropLabel} onPress={onBackdropPress} style={styles.sheetBackdrop} />
      <KeyboardAvoidingView pointerEvents="box-none" style={styles.sheetKeyboard}>
        <Animated.View
          style={[
            styles.captureSheet,
            compact && styles.captureSheetCompact,
            {
              marginBottom: bottomInset,
              maxHeight,
              transform: [
                {
                  translateY: motion.interpolate({
                    inputRange: [0, 1],
                    outputRange: [screenHeight, 0]
                  })
                }
              ]
            }
          ]}
        >
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

export function RecentNavIcon({ color, selected = false, size = 24 }: NavIconProps) {
  return <HouseSimple color={color} size={size} weight={selected ? "fill" : "regular"} />;
}

export function CollectionsNavIcon({ color, selected = false, size = 24 }: NavIconProps) {
  return <Folders color={color} size={size} weight={selected ? "fill" : "regular"} />;
}

export function SettingsNavIcon({ color, selected = false, size = 24 }: NavIconProps) {
  return <Gear color={color} size={size} weight={selected ? "fill" : "regular"} />;
}

export function IconButton({
  Icon,
  label,
  onPress,
  disabled = false,
  selected = false,
  tone = "default",
  testID
}: {
  Icon: AppIconComponent;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  tone?: "default" | "primary" | "danger";
  testID?: string;
}) {
  const iconColor = disabled
    ? colors.muted
    : tone === "danger"
      ? colors.danger
      : tone === "primary" || selected
        ? colors.accentText
        : colors.ink;
  return (
    <MotionPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      pressScale={motionPressScale.icon}
      style={({ pressed }) => [
        styles.iconButton,
        selected && styles.iconButtonSelected,
        disabled && styles.iconButtonDisabled,
        pressed && !disabled && styles.subtlePressed
      ]}
      testID={testID}
    >
      <Icon color={iconColor} size={20} weight={tone === "primary" || selected ? "bold" : "regular"} />
    </MotionPressable>
  );
}

export function SheetHeader({
  closeLabel,
  confirmDisabled = false,
  confirmLabel = "Done",
  confirmTestID,
  onClose,
  onConfirm,
  subtitle,
  title
}: {
  closeLabel: string;
  confirmDisabled?: boolean;
  confirmLabel?: string;
  confirmTestID?: string;
  onClose: () => void;
  onConfirm?: () => void;
  subtitle?: string;
  title: string;
}) {
  return (
    <View style={styles.sheetHeader}>
      <View style={styles.sheetHeaderCopy}>
        <Text style={styles.sheetTitle}>{title}</Text>
        {subtitle ? (
          <Text numberOfLines={2} style={styles.sheetSubtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.sheetActions}>
        <IconButton Icon={X} label={closeLabel} onPress={onClose} />
        {onConfirm ? (
          <IconButton
            Icon={Check}
            label={confirmLabel}
            disabled={confirmDisabled}
            onPress={onConfirm}
            tone="primary"
            testID={confirmTestID}
          />
        ) : null}
      </View>
    </View>
  );
}

export function AiFieldInsight({ insight }: { insight: CaptureFieldRationale }) {
  return (
    <View style={styles.aiInsight}>
      <View style={styles.aiInsightIcon}>
        <Sparkle color={colors.accentTextStrong} size={15} weight="fill" />
      </View>
      <View style={styles.aiInsightCopy}>
        <Text style={styles.aiInsightTitle}>{insight.title || "AI insight"}</Text>
        <Text style={styles.aiInsightText}>{insight.text}</Text>
      </View>
    </View>
  );
}

export function SkeletonRevealFrame({
  children,
  pending,
  skeleton
}: {
  children: ReactNode;
  pending: boolean;
  skeleton: ReactNode;
}) {
  const contentOpacity = useRef(new Animated.Value(pending ? 0 : 1)).current;
  const skeletonOpacity = useRef(new Animated.Value(pending ? 1 : 0)).current;
  const [showSkeleton, setShowSkeleton] = useState(pending);

  useEffect(() => {
    if (pending) {
      setShowSkeleton(true);
      contentOpacity.setValue(0);
      skeletonOpacity.setValue(1);
      return;
    }
    const animation = Animated.parallel([
      Animated.timing(contentOpacity, {
        duration: 150,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true
      }),
      Animated.timing(skeletonOpacity, {
        duration: 170,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true
      })
    ]);
    animation.start(({ finished }) => {
      if (finished) setShowSkeleton(false);
    });
    return () => animation.stop();
  }, [contentOpacity, pending, skeletonOpacity]);

  return (
    <View style={styles.skeletonRevealFrame}>
      <Animated.View
        accessibilityElementsHidden={pending}
        importantForAccessibility={pending ? "no-hide-descendants" : "auto"}
        pointerEvents={pending ? "none" : "auto"}
        style={{ opacity: contentOpacity }}
      >
        {children}
      </Animated.View>
      {showSkeleton ? (
        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={[styles.skeletonRevealOverlay, { opacity: skeletonOpacity }]}
        >
          {skeleton}
        </Animated.View>
      ) : null}
    </View>
  );
}

type SourceMarkProps = {
  capture: Capture;
  failedFavicons: Record<string, boolean>;
  imageLoadKey?: string;
  imageUnavailable?: boolean;
  onFaviconFailure: (host: string) => void;
  onImageDisplayed?: (url: string, cacheKey: string) => void;
  onImageLoadState?: (key: string, state: CaptureImageLoadState) => void;
  size?: "row" | "detail" | "inline" | "meta";
};

export const SourceMark = memo(function SourceMark({
  capture,
  failedFavicons,
  imageLoadKey = "",
  imageUnavailable = false,
  onFaviconFailure,
  onImageDisplayed,
  onImageLoadState,
  size = "row"
}: SourceMarkProps) {
  const host = captureFaviconHost(capture);
  const iconHost =
    hostFromUrl(capture.urlEvidence?.final_url) ||
    hostFromUrl(capture.urlEvidence?.canonical_url) ||
    hostFromUrl(capture.urlEvidence?.client_resolved_url) ||
    host;
  const extractedFavicon = typeof capture.urlEvidence?.favicon === "string" ? capture.urlEvidence.favicon.trim() : "";
  const faviconUri = host && !failedFavicons[host] ? sourceFaviconUrl(iconHost) || extractedFavicon : "";
  const imageUri = size === "row" && !imageUnavailable ? captureImageUrl(capture) : "";
  const imageCacheKey = size === "row" && imageUri ? captureImageCacheKey(capture) : "";
  const imageRenderKey = imageLoadKey || imageCacheKey || imageUri;
  const imageSource = useMemo(
    () => imageCacheKey ? { uri: imageUri, cacheKey: imageCacheKey } : { uri: imageUri },
    [imageCacheKey, imageUri]
  );
  const Icon = sourceIconForCapture(capture);
  const itemStatus = displayStatus(capture);
  const metaScreenshotPill = size === "meta" && isScreenshotCapture(capture);
  const iconColor =
    itemStatus === "ready" && isScreenshotCapture(capture)
      ? colors.accentTextStrong
      : sourceIconColor(itemStatus);
  const markStyle =
    size === "meta"
      ? styles.sourceMarkMeta
      : size === "inline"
        ? styles.sourceMarkInline
        : size === "detail"
          ? styles.sourceMarkDetail
          : styles.sourceMark;
  const iconSize = metaScreenshotPill ? 12 : size === "meta" ? 14 : size === "inline" ? 24 : size === "detail" ? 16 : 42;
  if (imageUri) {
    return (
      <View
        accessibilityLabel={host ? `Image from ${host}` : "Capture image"}
        accessible
        style={styles.captureThumbnailFrame}
      >
        <Image
          cachePolicy="memory-disk"
          contentFit="cover"
          onError={() => {
            if (imageLoadKey) onImageLoadState?.(imageLoadKey, "failed");
          }}
          onLoad={() => {
            if (imageLoadKey) onImageLoadState?.(imageLoadKey, "loaded");
          }}
          // Reports the source this view actually painted. Because the
          // recyclingKey holds previous pixels across same-capture source
          // upgrades, the capture's CURRENT image url is not necessarily
          // what this thumbnail shows — the review handoff must fly the
          // displayed source or the morph pops at takeoff and landing.
          onDisplay={() => onImageDisplayed?.(imageUri, imageCacheKey)}
          // Keyed by capture identity, not asset identity: recyclingKey
          // resets the view to blank when it changes, which is right when a
          // recycled cell shows a different capture but wrong when detail
          // hydration upgrades the SAME capture's source (legacy captures
          // gain imageAssetUrl post-open) — expo-image then holds the old
          // pixels until the new source is ready instead of flashing blank.
          recyclingKey={capture.id || imageRenderKey}
          source={imageSource}
          style={styles.captureThumbnailImage}
        />
      </View>
    );
  }
  return (
    <View
      accessibilityLabel={host ? `Source: ${host}` : "Source"}
      accessible
      style={[
        markStyle,
        metaScreenshotPill && styles.sourceMarkMetaPill,
        size !== "inline" && (size !== "meta" || metaScreenshotPill) && itemStatus === "processing" && styles.sourceMarkProcessing,
        size !== "inline" && (size !== "meta" || metaScreenshotPill) && itemStatus === "failed" && styles.sourceMarkFailed
      ]}
    >
      {faviconUri ? (
        <Image
          cachePolicy="memory-disk"
          contentFit="contain"
          onError={() => onFaviconFailure(host)}
          source={{ uri: faviconUri }}
          style={
            size === "meta"
              ? styles.sourceFaviconMeta
              : size === "inline"
                ? styles.sourceFaviconInline
                : size === "detail"
                  ? styles.sourceFaviconDetail
                  : styles.sourceFavicon
          }
        />
      ) : (
        <Icon color={iconColor} size={iconSize} weight={itemStatus === "ready" ? "regular" : "bold"} />
      )}
    </View>
  );
}, (previous, next) => {
  // Re-render only when something this mark actually reads changes. The
  // failedFavicons map is shared across all rows and gets a new identity on
  // every favicon failure, so compare just this capture's host entry.
  const host = captureFaviconHost(previous.capture);
  return (
    previous.capture === next.capture &&
    previous.imageLoadKey === next.imageLoadKey &&
    previous.imageUnavailable === next.imageUnavailable &&
    previous.size === next.size &&
    previous.onFaviconFailure === next.onFaviconFailure &&
    previous.onImageDisplayed === next.onImageDisplayed &&
    previous.onImageLoadState === next.onImageLoadState &&
    Boolean(previous.failedFavicons[host]) === Boolean(next.failedFavicons[host])
  );
});

export function sourceIconColor(status: CaptureStatus) {
  if (status === "processing") return colors.processing;
  if (status === "failed") return colors.danger;
  return colors.accentText;
}

export function StatusGlyph({ capture }: { capture: Capture }) {
  const status = displayStatus(capture);
  if (status === "ready" || status === "needs_review") return null;
  if (status === "processing") {
    return (
      <Reanimated.View
        entering={statusEntering}
        exiting={statusExiting}
        layout={statusLayout}
      >
        <ProcessingStatusPill label={captureStatusLabel(capture)} variant="row" />
      </Reanimated.View>
    );
  }
  const label = captureStatusLabel(capture);
  return (
    <Reanimated.View
      accessibilityLabel={label}
      accessible
      entering={statusEntering}
      exiting={statusExiting}
      layout={statusLayout}
      style={[
        styles.statusGlyph,
        status === "failed" && styles.statusGlyphFailed
      ]}
    >
      <Warning color={colors.danger} size={15} weight="fill" />
    </Reanimated.View>
  );
}

export function ProcessingStatusPill({
  label = "Analyzing",
  variant = "row"
}: {
  label?: string;
  variant?: "row" | "review";
}) {
  const review = variant === "review";
  return (
    <View
      accessibilityLabel={label}
      accessible
      style={[
        styles.processingStatusPill,
        review && styles.processingStatusPillReview
      ]}
    >
      <View style={[styles.processingStatusIconWell, review && styles.processingStatusIconWellReview]}>
        <View style={styles.processingStatusDot} />
        <ClockClockwise color={colors.processing} size={review ? 16 : 14} weight="bold" />
      </View>
      <Text
        numberOfLines={1}
        style={[
          styles.processingStatusText,
          review && styles.processingStatusTextReview
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function MeaningToken({
  Icon,
  iconColor = colors.muted,
  text
}: {
  Icon: AppIconComponent;
  iconColor?: string;
  text: string;
}) {
  return (
    <View style={styles.meaningToken}>
      <Icon color={iconColor} size={13} weight="regular" />
      <Text numberOfLines={1} style={styles.meaningTokenText}>
        {text}
      </Text>
    </View>
  );
}

export function CollectionMeaningToken({ collections }: { collections: LinkedCollection[] }) {
  const collectionNames = uniqueStrings(collections.map((collection) => collection.title.trim()));
  const primaryCollection = collectionNames[0] || "";
  const overflowCount = Math.max(collectionNames.length - 1, 0);
  if (!primaryCollection) return null;
  return (
    <View
      accessibilityLabel={
        overflowCount
          ? `Collections: ${collectionNames.join(", ")}`
          : `Collection: ${primaryCollection}`
      }
      style={[
        styles.meaningToken,
        styles.collectionMeaningToken,
        overflowCount > 0 && styles.collectionMeaningTokenMulti
      ]}
    >
      <Folder
        color={colors.muted}
        size={13}
        weight={overflowCount > 0 ? "fill" : "regular"}
      />
      <Text numberOfLines={1} style={[styles.meaningTokenText, styles.collectionMeaningTokenText]}>
        {primaryCollection}
      </Text>
      {overflowCount > 0 ? (
        <View style={styles.collectionOverflowBadge}>
          <Text style={styles.collectionOverflowText}>+{overflowCount}</Text>
        </View>
      ) : null}
    </View>
  );
}

// Vertical drift for the toast enter/exit, mirroring the prior Fade*Down feel.
const TOAST_DRIFT = 12;

export function ToastHost({
  toast,
  placement = "base"
}: {
  toast: ToastState | null;
  placement?: ToastPlacement;
}) {
  // `visibleToast` keeps the node mounted through the exit animation. Enter and
  // exit are driven imperatively with withTiming rather than Reanimated's
  // declarative entering/exiting layout animations: those stall when the UI
  // thread is idle (no active gesture/animation), which left timed-out toasts
  // painted on screen until a scroll woke the thread. withTiming schedules its
  // own frames and self-unmounts on completion, so dismissal is reliable.
  const [visibleToast, setVisibleToast] = useState<ToastState | null>(toast);
  const opacity = useSharedValue(toast ? 1 : 0);
  const translateY = useSharedValue(toast ? 0 : TOAST_DRIFT);
  // Tracks whether a toast is currently on screen so an in-place content update
  // (e.g. the batch "N removed" counter) resizes via `layout` instead of
  // replaying the entrance drift.
  const shownRef = useRef(Boolean(toast));

  useEffect(() => {
    if (toast) {
      cancelAnimation(opacity);
      cancelAnimation(translateY);
      const wasHidden = !shownRef.current;
      shownRef.current = true;
      setVisibleToast(toast);
      if (!wasHidden) {
        opacity.value = 1;
        translateY.value = 0;
        return;
      }
      // Start just above the resting spot and settle down into place.
      translateY.value = -TOAST_DRIFT;
      opacity.value = withTiming(1, {
        duration: motionDuration.toastIn,
        easing: motionEasing.emphasized,
        reduceMotion: motionReduceMotion
      });
      translateY.value = withTiming(0, {
        duration: motionDuration.toastIn,
        easing: motionEasing.emphasized,
        reduceMotion: motionReduceMotion
      });
      return;
    }
    shownRef.current = false;
    opacity.value = withTiming(0, {
      duration: motionDuration.toastOut,
      easing: motionEasing.exit,
      reduceMotion: motionReduceMotion
    });
    translateY.value = withTiming(
      TOAST_DRIFT,
      {
        duration: motionDuration.toastOut,
        easing: motionEasing.exit,
        reduceMotion: motionReduceMotion
      },
      (finished) => {
        if (finished) runOnJS(setVisibleToast)(null);
      }
    );
  }, [toast, opacity, translateY]);

  useEffect(() => {
    if (!visibleToast?.trace) return;
    markDeleteTraceNextFrame(visibleToast.trace, "toast_paint", {
      text: visibleToast.text
    });
  }, [visibleToast]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }]
  }));

  if (!visibleToast) return null;
  const tone = visibleToast.tone || "neutral";
  const Icon = toastIconForTone(tone);
  const iconColor = toastColorForTone(tone);
  const toastKey = visibleToast.id ?? [
    visibleToast.text,
    visibleToast.tone || "neutral",
    visibleToast.actionLabel || ""
  ].join(":");
  return (
    <Reanimated.View
      accessibilityLiveRegion="polite"
      accessibilityRole={tone === "error" || tone === "destructive" ? "alert" : "text"}
      key={toastKey}
      layout={toastLayout}
      style={[
        styles.toast,
        placement === "bottomNav" && styles.toastAboveBottomNav,
        placement === "footer" && styles.toastAboveFooter,
        animatedStyle
      ]}
    >
      <View style={[styles.toastIconWell, toastIconWellStyle(tone)]}>
        <Icon color={iconColor} size={17} weight="fill" />
      </View>
      <Text style={styles.toastText}>{visibleToast.text}</Text>
      {visibleToast.action && visibleToast.actionLabel ? (
        <MotionPressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={visibleToast.action}
          style={({ pressed }) => [styles.toastActionButton, pressed && styles.subtlePressed]}
        >
          <Text style={[styles.toastAction, tone === "destructive" && styles.toastActionDestructive]}>
            {visibleToast.actionLabel}
          </Text>
        </MotionPressable>
      ) : null}
    </Reanimated.View>
  );
}

function toastIconForTone(tone: ToastTone) {
  if (tone === "success") return Check;
  if (tone === "error" || tone === "destructive") return Warning;
  if (tone === "processing") return ClockClockwise;
  return Info;
}

function toastColorForTone(tone: ToastTone) {
  if (tone === "success") return colors.accentText;
  if (tone === "error" || tone === "destructive") return colors.danger;
  if (tone === "processing") return colors.processing;
  return colors.ink;
}

function toastIconWellStyle(tone: ToastTone) {
  if (tone === "success") return styles.toastIconWellSuccess;
  if (tone === "error" || tone === "destructive") return styles.toastIconWellError;
  if (tone === "processing") return styles.toastIconWellProcessing;
  return styles.toastIconWellNeutral;
}

export function HeaderContentGradient({ density = "standard" }: { density?: "standard" | "compact" } = {}) {
  const stops = density === "compact"
    ? {
        middleOffset: "0.5",
        middleOpacity: "0.87",
        dropOffset: "0.6",
        dropOpacity: "0.6",
        clearOffset: "0.7"
      }
    : {
        middleOffset: "0.58",
        middleOpacity: "0.86",
        dropOffset: "0.74",
        dropOpacity: "0.24",
        clearOffset: "0.84"
      };

  return (
    <View pointerEvents="none" style={styles.headerContentGradient}>
      <Svg height="100%" preserveAspectRatio="none" width="100%">
        <Defs>
          <LinearGradient id="header-content-fade" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor={colors.paper} stopOpacity="1" />
            <Stop offset="0.34" stopColor={colors.paper} stopOpacity="0.96" />
            <Stop offset={stops.middleOffset} stopColor={colors.paper} stopOpacity={stops.middleOpacity} />
            <Stop offset={stops.dropOffset} stopColor={colors.surfaceContainer} stopOpacity={stops.dropOpacity} />
            <Stop offset={stops.clearOffset} stopColor={colors.paper} stopOpacity="0" />
            <Stop offset="1" stopColor={colors.paper} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect fill="url(#header-content-fade)" height="100%" width="100%" x="0" y="0" />
      </Svg>
    </View>
  );
}

export function BottomAppBar({
  active,
  onRecentPress,
  onCollectionsPress,
  onSettingsPress,
  onFabPress
}: {
  active: "recent" | "collections";
  onRecentPress: () => void;
  onCollectionsPress: () => void;
  onSettingsPress: () => void;
  onFabPress: () => void;
}) {
  const collectionAction = active === "collections";
  const navItems: Array<{
    key: "recent" | "collections" | "settings";
    label: string;
    Icon: NavIconComponent;
    selected: boolean;
    onPress: () => void;
    testID: string;
  }> = [
    {
      key: "recent",
      label: "Recent",
      Icon: RecentNavIcon,
      selected: active === "recent",
      onPress: onRecentPress,
      testID: "pc.nav.recent"
    },
    {
      key: "collections",
      label: "Collections",
      Icon: CollectionsNavIcon,
      selected: active === "collections",
      onPress: onCollectionsPress,
      testID: "pc.nav.collections"
    },
    {
      key: "settings",
      label: "Settings",
      Icon: SettingsNavIcon,
      selected: false,
      onPress: onSettingsPress,
      testID: "pc.nav.settings"
    }
  ];

  return (
    <View pointerEvents="box-none" style={styles.bottomNavLayer}>
      <View pointerEvents="none" style={styles.bottomNavGradient}>
        <Svg height="100%" preserveAspectRatio="none" width="100%">
          <Defs>
            <LinearGradient id="bottom-nav-fade" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0" stopColor={colors.paper} stopOpacity="0" />
              <Stop offset="0.28" stopColor={colors.surfaceContainer} stopOpacity="0.22" />
              <Stop offset="1" stopColor={colors.paper} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect fill="url(#bottom-nav-fade)" height="100%" width="100%" x="0" y="0" />
        </Svg>
      </View>
      <View style={styles.bottomNavDock}>
        <View style={styles.bottomNavBar}>
          {navItems.map(({ key, label, Icon, selected, onPress, testID }) => {
            const selectedColor = key === "collections" ? colors.collectionAccentText : colors.accentText;
            return (
              <MotionPressable
                accessibilityLabel={label}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={key}
                onPress={onPress}
                pressScale={motionPressScale.icon}
                style={({ pressed }) => [
                  styles.bottomNavItem,
                  pressed && styles.bottomNavItemPressed
                ]}
                testID={testID}
              >
                <View
                  style={[
                    styles.bottomNavIconWrap,
                    selected && styles.bottomNavIconWrapSelected
                  ]}
                >
                  <Icon
                    color={selected ? selectedColor : colors.muted}
                    selected={selected}
                    size={26}
                  />
                </View>
              </MotionPressable>
            );
          })}
        </View>
        <View style={[styles.bottomNavFabShadow, collectionAction && styles.bottomNavFabShadowCollection]}>
          <MotionPressable
            accessibilityLabel={collectionAction ? "New collection" : "New capture"}
            accessibilityRole="button"
            onPress={onFabPress}
            pressScale={motionPressScale.icon}
            style={({ pressed }) => [
              styles.bottomNavFab,
              collectionAction && styles.bottomNavFabCollection,
              pressed && styles.bottomNavFabPressed,
              pressed && collectionAction && styles.bottomNavFabCollectionPressed
            ]}
            testID={collectionAction ? "pc.nav.collection-create" : "pc.nav.capture"}
          >
            <Plus color={collectionAction ? colors.onCollectionAccent : colors.onAccent} size={28} weight="thin" />
          </MotionPressable>
        </View>
      </View>
    </View>
  );
}
