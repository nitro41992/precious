import { forwardRef, memo, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import type {
  LayoutChangeEvent,
  PressableProps,
  PressableStateCallbackType,
  ReturnKeyTypeOptions,
  StyleProp,
  TextInput as NativeTextInput,
  ViewStyle
} from "react-native";
import { Animated, Dimensions, Easing, Pressable, View } from "react-native";
import { Image } from "expo-image";
import { CalendarBlank, Camera, CaretLeft, Check, ClockClockwise, Folder, Folders, Gear, HouseSimple, ImageSquare, Info, Link, MagnifyingGlass, Plus, Sparkle, Warning, X } from "phosphor-react-native";
import Reanimated, {
  cancelAnimation,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import type {
  AppIconComponent,
  Capture,
  CaptureComposerMode,
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
import { Text, TextInput } from "./typography";

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

// Refined segmented control for the capture composer: a tonal track with a single
// white thumb that glides under the active label. Premium and quiet — the slide is
// the feedback, so the labels just tint between deep-green (active) and muted.
const CAPTURE_MODE_TRACK_PADDING = 4;
const CAPTURE_MODES = [
  { key: "link" as const, label: "Link", Icon: Link },
  { key: "image" as const, label: "Image", Icon: ImageSquare }
];

export function CaptureModeToggle({
  mode,
  onChange
}: {
  mode: CaptureComposerMode;
  onChange: (mode: CaptureComposerMode) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const progress = useSharedValue(mode === "image" ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(mode === "image" ? 1 : 0, {
      duration: motionDuration.settle,
      easing: motionEasing.emphasized,
      reduceMotion: motionReduceMotion
    });
  }, [mode, progress]);

  const segmentWidth =
    trackWidth > 0 ? (trackWidth - CAPTURE_MODE_TRACK_PADDING * 2) / CAPTURE_MODES.length : 0;
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * segmentWidth }]
  }));

  return (
    <View onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)} style={styles.captureModeTrack}>
      {segmentWidth > 0 ? (
        <Reanimated.View style={[styles.captureModeThumb, { width: segmentWidth }, thumbStyle]} />
      ) : null}
      {CAPTURE_MODES.map(({ key, label, Icon }) => {
        const selected = mode === key;
        const tint = selected ? colors.accentTextStrong : colors.muted;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={key}
            onPress={() => onChange(key)}
            style={({ pressed }) => [
              styles.captureModeSegment,
              pressed && !selected && styles.captureModeSegmentPressed
            ]}
            testID={`pc.capture.mode.${key}`}
          >
            <Icon color={tint} size={16} weight={selected ? "fill" : "bold"} />
            <Text numberOfLines={1} style={[styles.captureModeSegmentText, { color: tint }]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Gentle crossfade whenever swapKey changes: the new content fades up from zero so
// switching capture modes reads as one intentional move rather than a hard cut.
// Imperative (withTiming on swap), so it never stalls on an idle UI thread.
export function FadeSwap({
  swapKey,
  children,
  style
}: {
  swapKey: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = 0;
    opacity.value = withTiming(1, {
      duration: motionDuration.enter,
      easing: motionEasing.standard,
      reduceMotion: motionReduceMotion
    });
  }, [swapKey, opacity]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Reanimated.View style={[style, animatedStyle]}>{children}</Reanimated.View>;
}

// Side-by-side source tiles for adding a photo. Camera and Photos read as two
// equal, tactile choices rather than a single "upload" affordance, so the camera
// option is never overlooked. Shared by the capture composer and the Capture
// Review add-photo flow so both surfaces stay visually in sync.
function ImageSourceTile({
  Icon,
  title,
  helper,
  onPress,
  disabled,
  testID
}: {
  Icon: AppIconComponent;
  title: string;
  helper: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <MotionPressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.imageSourceTile,
        pressed && styles.imageSourceTilePressed,
        disabled && styles.imageSourceTileDisabled
      ]}
      testID={testID}
    >
      <View style={styles.imageSourceTileIcon}>
        <Icon color={colors.accentTextStrong} size={26} weight="bold" />
      </View>
      <Text style={styles.imageSourceTileTitle}>{title}</Text>
      <Text numberOfLines={1} style={styles.imageSourceTileHelper}>{helper}</Text>
    </MotionPressable>
  );
}

export function ImageSourcePicker({
  onCamera,
  onPhotos,
  disabled = false,
  cameraTestID,
  photosTestID
}: {
  onCamera: () => void;
  onPhotos: () => void;
  disabled?: boolean;
  cameraTestID?: string;
  photosTestID?: string;
}) {
  return (
    <View style={styles.imageSourceRow}>
      <ImageSourceTile
        Icon={Camera}
        title="Camera"
        helper="Take a new photo"
        onPress={onCamera}
        disabled={disabled}
        testID={cameraTestID}
      />
      <ImageSourceTile
        Icon={ImageSquare}
        title="Photos"
        helper="Choose from library"
        onPress={onPhotos}
        disabled={disabled}
        testID={photosTestID}
      />
    </View>
  );
}

// Borderless pill switch built on the app's motion system: the thumb slides and
// the track tints with withTiming so it reads as a soft toggle, not a hairline
// control. Reusable wherever a binary on/off is needed.
const TOGGLE_THUMB_TRAVEL = 18;

export function ToggleSwitch({
  value,
  onValueChange,
  accessibilityLabel,
  disabled = false,
  testID
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  accessibilityLabel?: string;
  disabled?: boolean;
  testID?: string;
}) {
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, {
      duration: motionDuration.quick,
      easing: motionEasing.standard,
      reduceMotion: motionReduceMotion
    });
  }, [value, progress]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.surfaceContainerHigh, colors.accent])
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [0, TOGGLE_THUMB_TRAVEL]) }]
  }));

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => onValueChange(!value)}
      testID={testID}
    >
      <Reanimated.View style={[styles.toggleSwitchTrack, disabled && styles.toggleSwitchTrackDisabled, trackStyle]}>
        <Reanimated.View style={[styles.toggleSwitchThumb, thumbStyle]} />
      </Reanimated.View>
    </Pressable>
  );
}

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
          duration: 300,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
          toValue: 1,
          useNativeDriver: true
        }).start();
      });
      return () => cancelAnimationFrame(frame);
    }
    if (!mounted) return;
    Animated.timing(motion, {
      duration: 200,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
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

// Shared sizing for the keyboard-aware bottom sheets (capture composer, note,
// title, collection composer). They all clamp the sheet to the space above the
// keyboard; only the height caps and the resting-height scale differ per sheet,
// so those come in as parameters. The sheet's *position* (riding above the
// keyboard, sliding in/out) is owned by KeyboardSheet's live worklet — this
// helper only decides how tall the sheet may grow. Centralizing it keeps the
// four sheets from drifting apart and means a sizing fix lands in one place.
export function keyboardSheetMetrics({
  active,
  keyboardHeight,
  windowHeight,
  maxWithKeyboard,
  maxWithoutKeyboard,
  withoutKeyboardScale
}: {
  active: boolean;
  keyboardHeight: number;
  windowHeight: number;
  maxWithKeyboard: number;
  maxWithoutKeyboard: number;
  withoutKeyboardScale: number;
}): { keyboardVisible: boolean; maxHeight: number } {
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
  return { keyboardVisible, maxHeight };
}

// Shared shell for the keyboard-aware bottom sheets: backdrop + a bottom-docked
// Reanimated sheet. The sheet's translateY combines two UI-thread inputs so it
// stays glued to the keyboard frame-for-frame on both open AND close:
//   • `open` (0→1) slides the sheet up from off-screen and back down on close.
//   • the live keyboard `height`/`progress` (react-native-keyboard-controller,
//     backed by the OS keyboard animation) lifts the sheet to sit just above the
//     keyboard, with a resting gap that fades in as the keyboard rises.
// Both live in one worklet on the UI thread, so there is no JS/native driver
// split to coordinate and the close no longer lags the keyboard. Each sheet
// supplies only its own children; `maxHeight`/`compact` come from
// keyboardSheetMetrics.
export function KeyboardSheet({
  backdropLabel,
  children,
  compact,
  keyboardSettle = 12,
  maxHeight,
  onBackdropPress,
  open
}: {
  backdropLabel: string;
  children: ReactNode;
  compact: boolean;
  keyboardSettle?: number;
  maxHeight: number;
  onBackdropPress: () => void;
  open: SharedValue<number>;
}) {
  const offscreen = Dimensions.get("screen").height;
  // The slide distance is the sheet's own height (+ a margin), measured on layout
  // — not the whole screen. The sheet is bottom-docked, so sliding down by its own
  // height drops its top exactly to the screen edge: it clears precisely when the
  // open value reaches 0, instead of racing off-screen partway through and
  // finishing ahead of the keyboard. Until measured it starts fully off-screen.
  const sheetTravel = useSharedValue(offscreen);
  const { height, progress } = useReanimatedKeyboardAnimation();
  const sheetStyle = useAnimatedStyle(() => {
    const slide = (1 - open.value) * sheetTravel.value;
    // height.value is 0 when closed and negative while the keyboard is up, so
    // adding it rides the sheet up with the keyboard. On this edge-to-edge window
    // the keyboard inset (measured from the true screen bottom) lands the sheet a
    // touch high, so settle it back down a few px as the keyboard arrives
    // (progress 0→1) to leave a small, even resting gap.
    const settle = interpolate(progress.value, [0, 1], [0, keyboardSettle]);
    return { transform: [{ translateY: slide + height.value + settle }] };
  });
  return (
    <View style={styles.sheetLayer} pointerEvents="box-none">
      <Pressable accessibilityLabel={backdropLabel} onPress={onBackdropPress} style={styles.sheetBackdrop} />
      <View pointerEvents="box-none" style={styles.sheetKeyboard}>
        <Reanimated.View
          onLayout={(event) => {
            sheetTravel.value = event.nativeEvent.layout.height + 40;
          }}
          style={[styles.captureSheet, compact && styles.captureSheetCompact, { maxHeight }, sheetStyle]}
        >
          {children}
        </Reanimated.View>
      </View>
    </View>
  );
}

export function RecentNavIcon({ color, selected = false, size = 24 }: NavIconProps) {
  return <HouseSimple color={color} size={size} weight="regular" />;
}

export function CollectionsNavIcon({ color, selected = false, size = 24 }: NavIconProps) {
  return <Folders color={color} size={size} weight="regular" />;
}

export function CalendarNavIcon({ color, selected = false, size = 24 }: NavIconProps) {
  return <CalendarBlank color={color} size={size} weight="regular" />;
}

export function SettingsNavIcon({ color, selected = false, size = 24 }: NavIconProps) {
  return <Gear color={color} size={size} weight="regular" />;
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
      <Icon color={iconColor} size={20} weight={tone === "primary" || selected ? "bold" : "bold"} />
    </MotionPressable>
  );
}

// A persistent, full-width search affordance for screen headers. It looks like a
// filled input but is a button: tapping it opens the dedicated search screen
// (which owns the real autofocus input + hybrid results), so the bar reads as
// morphing into search. Pressed fill hugs the bar's own rounded surface.
export function SearchBarTrigger({
  placeholder,
  onPress,
  testID
}: {
  placeholder: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <MotionPressable
      accessibilityLabel={placeholder}
      accessibilityRole="search"
      onPress={onPress}
      pressScale={motionPressScale.standard}
      style={({ pressed }) => [styles.searchBarTrigger, pressed && styles.searchBarTriggerPressed]}
      testID={testID}
    >
      <MagnifyingGlass color={colors.muted} size={19} weight="bold" />
      <Text numberOfLines={1} style={styles.searchBarTriggerText}>
        {placeholder}
      </Text>
    </MotionPressable>
  );
}

export function SheetHeader({
  closeLabel,
  confirmDisabled = false,
  confirmLabel = "Done",
  confirmTestID,
  onBack,
  onClose,
  onConfirm,
  subtitle,
  title
}: {
  closeLabel: string;
  confirmDisabled?: boolean;
  confirmLabel?: string;
  confirmTestID?: string;
  onBack?: () => void;
  onClose: () => void;
  onConfirm?: () => void;
  subtitle?: string;
  title: string;
}) {
  return (
    <View style={styles.sheetHeader}>
      <View style={styles.sheetHeaderCopy}>
        {onBack ? (
          <View style={styles.sheetHeaderTitleRow}>
            <MotionPressable
              accessibilityLabel="Back"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onBack}
              style={({ pressed }) => [styles.sheetHeaderBack, pressed && styles.subtlePressed]}
            >
              <CaretLeft color={colors.ink} size={20} weight="bold" />
            </MotionPressable>
            <Text style={styles.sheetTitle}>{title}</Text>
          </View>
        ) : (
          <Text style={styles.sheetTitle}>{title}</Text>
        )}
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

// The two collection fields (name + "what belongs here"), shared by the Collections-tab
// composer and the capture-edit selector's create step so the form lives in one place.
export function CollectionFormFields({
  autoFocusTitle = false,
  description,
  descriptionTestID,
  onDescriptionChange,
  onTitleChange,
  title,
  titleRef,
  titleReturnKeyType,
  titleTestID
}: {
  autoFocusTitle?: boolean;
  description: string;
  descriptionTestID?: string;
  onDescriptionChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  title: string;
  titleRef?: RefObject<NativeTextInput | null>;
  titleReturnKeyType?: ReturnKeyTypeOptions;
  titleTestID?: string;
}) {
  return (
    <>
      <TextInput
        autoFocus={autoFocusTitle}
        maxLength={50}
        onChangeText={onTitleChange}
        placeholder="Title"
        placeholderTextColor={colors.placeholder}
        ref={titleRef}
        returnKeyType={titleReturnKeyType}
        style={[styles.captureInput, styles.collectionSheetTitleInput]}
        testID={titleTestID}
        value={title}
      />
      <TextInput
        maxLength={160}
        multiline
        onChangeText={onDescriptionChange}
        placeholder="What belongs here"
        placeholderTextColor={colors.placeholder}
        style={[styles.captureInput, styles.collectionSheetDescriptionInput]}
        testID={descriptionTestID}
        value={description}
      />
    </>
  );
}

export function AiFieldInsight({ insight }: { insight: CaptureFieldRationale }) {
  return (
    <View style={styles.aiInsight}>
      <View style={styles.aiInsightTag}>
        <Sparkle color={colors.accentTextStrong} size={13} weight="fill" />
        <Text style={styles.aiInsightTagText}>{insight.title || "AI insight"}</Text>
      </View>
      <Text style={styles.aiInsightText}>{insight.text}</Text>
    </View>
  );
}

// Height+opacity collapse for a block whose presence comes and goes (e.g. the
// picker's no-collection insight, which closes once a collection is chosen).
// Driven imperatively with withTiming — never declarative entering/exiting —
// because those stall on an idle UI thread and leave the block painted. We
// measure the natural content height once (the inner View lays out unconstrained
// and is clipped by the parent's fixed height) and interpolate to it.
export function CollapsibleInsight({ visible, children }: { visible: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(visible);
  const [contentHeight, setContentHeight] = useState(0);
  const progress = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    cancelAnimation(progress);
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, {
        duration: motionDuration.enter,
        easing: motionEasing.standard,
        reduceMotion: motionReduceMotion
      });
      return;
    }
    progress.value = withTiming(
      0,
      {
        duration: motionDuration.exit,
        easing: motionEasing.exit,
        reduceMotion: motionReduceMotion
      },
      (finished) => {
        if (finished) runOnJS(setMounted)(false);
      }
    );
  }, [visible, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    height: contentHeight ? interpolate(progress.value, [0, 1], [0, contentHeight]) : undefined
  }));

  if (!mounted) return null;

  return (
    <Reanimated.View style={[styles.collapsibleInsight, animatedStyle]}>
      <View
        onLayout={(event: LayoutChangeEvent) => {
          const height = event.nativeEvent.layout.height;
          if (height > 0 && height !== contentHeight) setContentHeight(height);
        }}
      >
        {children}
      </View>
    </Reanimated.View>
  );
}

// The AI's collection prediction — ONE premium card for both contexts so the
// picker reads the same regardless of capture: the AI proposing a NEW collection
// (Add / Dismiss) or having picked an EXISTING one (capture count + Added toggle).
// Both surface the same prediction shape — title, what belongs in it, and the
// plain-language reason — so the page never reshapes depending on which the AI did.
export function CollectionPredictionCard({
  variant,
  title,
  description,
  rationale,
  captureCountLabel,
  selected = false,
  busy = false,
  onConfirm,
  onDismiss,
  onToggle,
  testID
}: {
  variant: "suggested" | "picked";
  title: string;
  description?: string;
  rationale?: string | null;
  captureCountLabel?: string;
  selected?: boolean;
  busy?: boolean;
  onConfirm?: () => void;
  onDismiss?: () => void;
  onToggle?: () => void;
  testID?: string;
}) {
  return (
    <View style={styles.predictionCard} testID={testID}>
      <View style={styles.predictionCardHeader}>
        <View style={styles.predictionCardIcon}>
          <Sparkle color={colors.accentTextStrong} size={16} weight="fill" />
        </View>
        <Text style={styles.predictionCardLabel}>
          {variant === "suggested" ? "Suggested collection" : "AI pick"}
        </Text>
      </View>
      <Text numberOfLines={2} style={styles.predictionCardTitle}>
        {title}
      </Text>
      {captureCountLabel ? <Text style={styles.predictionCardMeta}>{captureCountLabel}</Text> : null}
      {description ? (
        <Text numberOfLines={3} style={styles.predictionCardDescription}>
          {description}
        </Text>
      ) : null}
      {rationale ? (
        <View style={styles.predictionCardRationale}>
          <Text style={styles.predictionCardRationaleText}>{rationale}</Text>
        </View>
      ) : null}
      {variant === "suggested" ? (
        <View style={styles.predictionCardActions}>
          <MotionPressable
            accessibilityLabel={`Add collection: ${title}`}
            accessibilityRole="button"
            disabled={busy}
            onPress={onConfirm}
            style={({ pressed }) => [
              styles.predictionConfirmButton,
              busy && styles.suggestionDisabled,
              pressed && styles.subtlePressed
            ]}
            testID={testID ? `${testID}.confirm` : undefined}
          >
            <Check color={colors.onAccent} size={16} weight="bold" />
            <Text style={styles.predictionConfirmText}>Add collection</Text>
          </MotionPressable>
          <MotionPressable
            accessibilityLabel={`Dismiss suggestion: ${title}`}
            accessibilityRole="button"
            disabled={busy}
            onPress={onDismiss}
            style={({ pressed }) => [
              styles.predictionDismissButton,
              busy && styles.suggestionDisabled,
              pressed && styles.subtlePressed
            ]}
            testID={testID ? `${testID}.dismiss` : undefined}
          >
            <X color={colors.muted} size={16} weight="bold" />
            <Text style={styles.predictionDismissText}>Dismiss</Text>
          </MotionPressable>
        </View>
      ) : (
        <MotionPressable
          accessibilityLabel={selected ? `Added to capture: ${title}` : `Add to capture: ${title}`}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}
          onPress={onToggle}
          style={({ pressed }) => [
            styles.predictionToggle,
            selected ? styles.predictionToggleOn : styles.predictionToggleOff,
            pressed && styles.subtlePressed
          ]}
          testID={testID ? `${testID}.toggle` : undefined}
        >
          {selected ? (
            <Check color={colors.accentTextStrong} size={16} weight="bold" />
          ) : (
            <Plus color={colors.collectionAccentText} size={16} weight="bold" />
          )}
          <Text style={[styles.predictionToggleText, selected && styles.predictionToggleTextOn]}>
            {selected ? "Added" : "Add to capture"}
          </Text>
        </MotionPressable>
      )}
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
        <Icon color={iconColor} size={iconSize} weight="bold" />
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
      <ClockClockwise color={colors.processing} size={review ? 15 : 13} weight="bold" />
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

// In-progress cue for a capture whose analysis is shown but whose new-Collection suggestion is
// still resolving in the background. Reuses the "Analyzing" pill chrome so the two-phase reveal
// reads as one coherent in-progress language, with a Sparkle to mark it as the collection step.
export function SuggestionPendingToken({
  label = "Finding collection"
}: {
  label?: string;
}) {
  return (
    <View accessibilityLabel={label} accessible style={styles.processingStatusPill}>
      <Sparkle color={colors.processing} size={13} weight="fill" />
      <Text numberOfLines={1} style={styles.processingStatusText}>
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
      <Icon color={iconColor} size={13} weight="bold" />
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
        weight={overflowCount > 0 ? "fill" : "bold"}
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
        // Stays paper-opaque through the title + persistent search bar, then
        // fades out by the gradient's bottom edge — which sits just above the
        // rail/pill banner, so those render crisp (not washed out) below it.
        middleOffset: "0.82",
        middleOpacity: "0.95",
        dropOffset: "0.94",
        dropOpacity: "0.3",
        clearOffset: "1"
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
  onCalendarPress,
  onSettingsPress,
  onFabPress
}: {
  active: "recent" | "collections" | "calendar";
  onRecentPress: () => void;
  onCollectionsPress: () => void;
  onCalendarPress: () => void;
  onSettingsPress: () => void;
  onFabPress: () => void;
}) {
  const navItems: Array<{
    key: "recent" | "collections" | "calendar" | "settings";
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
      key: "calendar",
      label: "Calendar",
      Icon: CalendarNavIcon,
      selected: active === "calendar",
      onPress: onCalendarPress,
      testID: "pc.nav.calendar"
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
        <View style={styles.bottomNavFabShadow}>
          <MotionPressable
            accessibilityLabel="New capture"
            accessibilityRole="button"
            onPress={onFabPress}
            pressScale={motionPressScale.icon}
            style={({ pressed }) => [
              styles.bottomNavFab,
              pressed && styles.bottomNavFabPressed
            ]}
            testID="pc.nav.capture"
          >
            <Plus color={colors.surface} size={28} weight="bold" />
          </MotionPressable>
        </View>
      </View>
    </View>
  );
}
