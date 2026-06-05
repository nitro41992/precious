import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { Animated, Dimensions, Easing, Pressable, View } from "react-native";
import { Image } from "expo-image";
import { Check, ClockClockwise, Folder, Folders, Gear, HouseSimple, Info, Plus, Sparkle, Warning } from "phosphor-react-native";
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
import { displayStatus, hostFromUrl } from "../captureLogic";
import {
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
import { Text } from "./typography";

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
        ? colors.accent
        : colors.ink;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        selected && styles.iconButtonSelected,
        disabled && styles.iconButtonDisabled,
        pressed && !disabled && styles.subtlePressed
      ]}
      testID={testID}
    >
      <Icon color={iconColor} size={20} weight={tone === "primary" || selected ? "bold" : "regular"} />
    </Pressable>
  );
}

export function AiFieldInsight({ insight }: { insight: CaptureFieldRationale }) {
  return (
    <View style={styles.aiInsight}>
      <View style={styles.aiInsightHeader}>
        <View style={styles.aiInsightIcon}>
          <Sparkle color={colors.accent} size={16} weight="fill" />
        </View>
        <Text style={styles.aiInsightTitle}>{insight.title || "AI insight"}</Text>
      </View>
      <Text style={styles.aiInsightText}>{insight.text}</Text>
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

export function SourceMark({
  capture,
  failedFavicons,
  imageLoadKey = "",
  imageUnavailable = false,
  onFaviconFailure,
  onImageLoadState,
  size = "row"
}: {
  capture: Capture;
  failedFavicons: Record<string, boolean>;
  imageLoadKey?: string;
  imageUnavailable?: boolean;
  onFaviconFailure: (host: string) => void;
  onImageLoadState?: (key: string, state: CaptureImageLoadState) => void;
  size?: "row" | "detail" | "inline" | "meta";
}) {
  const host = captureSourceHost(capture).replace(/^www\./i, "");
  const iconHost =
    hostFromUrl(capture.urlEvidence?.final_url) ||
    hostFromUrl(capture.urlEvidence?.canonical_url) ||
    hostFromUrl(capture.urlEvidence?.client_resolved_url) ||
    host;
  const extractedFavicon = typeof capture.urlEvidence?.favicon === "string" ? capture.urlEvidence.favicon.trim() : "";
  const faviconUri = host && !failedFavicons[host] ? sourceFaviconUrl(iconHost) || extractedFavicon : "";
  const imageUri = size === "row" && !imageUnavailable ? captureImageUrl(capture) : "";
  const Icon = sourceIconForCapture(capture);
  const itemStatus = displayStatus(capture);
  const metaScreenshotPill = size === "meta" && isScreenshotCapture(capture);
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
          source={imageLoadKey ? { uri: imageUri, cacheKey: imageLoadKey } : { uri: imageUri }}
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
        <Icon color={sourceIconColor(itemStatus)} size={iconSize} weight={itemStatus === "ready" ? "regular" : "bold"} />
      )}
    </View>
  );
}

export function sourceIconColor(status: CaptureStatus) {
  if (status === "processing") return colors.processing;
  if (status === "failed") return colors.danger;
  return colors.accent;
}

export function StatusGlyph({ capture }: { capture: Capture }) {
  const status = displayStatus(capture);
  if (status === "ready" || status === "needs_review") return null;
  const Icon = status === "processing"
      ? ClockClockwise
      : Warning;
  const label = captureStatusLabel(capture);
  const iconColor = status === "processing"
      ? colors.processing
      : colors.danger;
  return (
    <View
      accessibilityLabel={label}
      accessible
      style={[
        styles.statusGlyph,
        status === "processing" && styles.statusGlyphProcessing,
        status === "failed" && styles.statusGlyphFailed
      ]}
    >
      <Icon color={iconColor} size={15} weight="fill" />
      {status === "processing" ? (
        <Text numberOfLines={1} style={styles.statusGlyphProcessingText}>
          Analyzing
        </Text>
      ) : null}
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
        color={colors.collectionAccent}
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

export function ToastHost({
  toast,
  placement = "base"
}: {
  toast: ToastState | null;
  placement?: ToastPlacement;
}) {
  const animation = useRef(new Animated.Value(toast ? 1 : 0)).current;
  const [visibleToast, setVisibleToast] = useState<ToastState | null>(toast);

  useEffect(() => {
    if (toast) {
      setVisibleToast(toast);
      animation.setValue(0);
      Animated.timing(animation, {
        duration: 190,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true
      }).start();
      return;
    }
    Animated.timing(animation, {
      duration: 130,
      easing: Easing.in(Easing.cubic),
      toValue: 0,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (finished) setVisibleToast(null);
    });
  }, [animation, toast]);

  if (!visibleToast) return null;
  const tone = visibleToast.tone || "neutral";
  const Icon = toastIconForTone(tone);
  const iconColor = toastColorForTone(tone);
  const translateY = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0]
  });
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessibilityRole={tone === "error" || tone === "destructive" ? "alert" : "text"}
      style={[
        styles.toast,
        placement === "bottomNav" && styles.toastAboveBottomNav,
        placement === "footer" && styles.toastAboveFooter,
        {
          opacity: animation,
          transform: [{ translateY }]
        }
      ]}
    >
      <View style={[styles.toastIconWell, toastIconWellStyle(tone)]}>
        <Icon color={iconColor} size={17} weight="fill" />
      </View>
      <Text style={styles.toastText}>{visibleToast.text}</Text>
      {visibleToast.action && visibleToast.actionLabel ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={visibleToast.action}
          style={({ pressed }) => [styles.toastActionButton, pressed && styles.subtlePressed]}
        >
          <Text style={[styles.toastAction, tone === "destructive" && styles.toastActionDestructive]}>
            {visibleToast.actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

function toastIconForTone(tone: ToastTone) {
  if (tone === "success") return Check;
  if (tone === "error" || tone === "destructive") return Warning;
  if (tone === "processing") return ClockClockwise;
  return Info;
}

function toastColorForTone(tone: ToastTone) {
  if (tone === "success") return colors.accent;
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
            <Stop offset="0" stopColor={colors.surface} stopOpacity="1" />
            <Stop offset="0.34" stopColor={colors.surface} stopOpacity="0.96" />
            <Stop offset={stops.middleOffset} stopColor={colors.surface} stopOpacity={stops.middleOpacity} />
            <Stop offset={stops.dropOffset} stopColor={colors.surface} stopOpacity={stops.dropOpacity} />
            <Stop offset={stops.clearOffset} stopColor={colors.surface} stopOpacity="0" />
            <Stop offset="1" stopColor={colors.surface} stopOpacity="0" />
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
              <Stop offset="0.28" stopColor={colors.paper} stopOpacity="0.18" />
              <Stop offset="1" stopColor={colors.paper} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect fill="url(#bottom-nav-fade)" height="100%" width="100%" x="0" y="0" />
        </Svg>
      </View>
      <View style={styles.bottomNavDock}>
        <View style={styles.bottomNavBar}>
          {navItems.map(({ key, label, Icon, selected, onPress, testID }) => {
            const selectedColor = key === "collections" ? colors.collectionAccent : colors.accent;
            return (
              <Pressable
                accessibilityLabel={label}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={key}
                onPress={onPress}
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
                    size={22}
                  />
                </View>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          accessibilityLabel={collectionAction ? "New collection" : "New capture"}
          accessibilityRole="button"
          onPress={onFabPress}
          style={({ pressed }) => [
            styles.bottomNavFab,
            collectionAction && styles.bottomNavFabCollection,
            pressed && styles.bottomNavFabPressed,
            pressed && collectionAction && styles.bottomNavFabCollectionPressed
          ]}
          testID={collectionAction ? "pc.nav.collection-create" : "pc.nav.capture"}
        >
          <Plus color={colors.onAccent} size={20} weight="bold" />
        </Pressable>
      </View>
    </View>
  );
}
