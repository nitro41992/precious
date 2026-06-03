import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { AlertTriangle, Check, Clock3, Folder, Info, Plus } from "lucide-react-native";
import Svg, { Circle, Path } from "react-native-svg";

import type {
  Capture,
  CaptureImageLoadState,
  CaptureStatus,
  LinkedCollection,
  LucideIconComponent,
  NavIconComponent,
  NavIconProps,
  ToastPlacement,
  ToastState,
  ToastTone
} from "../types";
import { displayStatus } from "../captureLogic";
import {
  captureImageUrl,
  captureSourceHost,
  captureStatusLabel,
  isMapSource,
  sourceFaviconUrl,
  sourceIconForCapture,
  uniqueStrings
} from "../capturePresentation";
import { colors } from "./theme";
import { styles } from "./styles";

const SETTINGS_ICON_PATH = "M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.37-.31-.6-.22l-2.49 1a7.28 7.28 0 0 0-1.69-.98l-.38-2.65A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.5.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1a.5.5 0 0 0-.6.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65c-.05.32-.08.65-.08.98s.03.66.08.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46c.12.22.37.31.6.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.48 0 .6-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z";

export function RecentNavIcon({ color, selected = false, size = 24 }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {selected ? (
        <Path
          d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5h-2v6l5.25 3.15.75-1.23-4-2.37V7Z"
          fill={color}
          fillRule="evenodd"
          clipRule="evenodd"
        />
      ) : (
        <>
          <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth="2.1" />
          <Path
            d="M12 7.2v5.1l3.55 2.13"
            stroke={color}
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </Svg>
  );
}

export function CollectionsNavIcon({ color, selected = false, size = 24 }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {selected ? (
        <Path
          d="M3 6.75A2.75 2.75 0 0 1 5.75 4h3.42c.78 0 1.51.35 2 .95l1.05 1.3h6.03A2.75 2.75 0 0 1 21 9v7.25A2.75 2.75 0 0 1 18.25 19H5.75A2.75 2.75 0 0 1 3 16.25v-9.5Z"
          fill={color}
        />
      ) : (
        <Path
          d="M3.5 6.9A2.4 2.4 0 0 1 5.9 4.5h3.18c.68 0 1.33.31 1.77.84l1.13 1.36h6.12a2.4 2.4 0 0 1 2.4 2.4v7a2.4 2.4 0 0 1-2.4 2.4H5.9a2.4 2.4 0 0 1-2.4-2.4V6.9Z"
          stroke={color}
          strokeWidth="2.1"
          strokeLinejoin="round"
        />
      )}
    </Svg>
  );
}

export function SettingsNavIcon({ color, selected = false, size = 24 }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={SETTINGS_ICON_PATH}
        fill={selected ? color : "none"}
        stroke={selected ? "none" : color}
        strokeWidth={selected ? 0 : 1.35}
        strokeLinejoin="round"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </Svg>
  );
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
  Icon: LucideIconComponent;
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
      <Icon color={iconColor} size={20} strokeWidth={2.3} />
    </Pressable>
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
  size?: "row" | "detail";
}) {
  const host = captureSourceHost(capture).replace(/^www\./i, "");
  const faviconUri = size === "detail" && !isMapSource(capture) && !failedFavicons[host] ? sourceFaviconUrl(host) : "";
  const imageUri = size === "row" && !imageUnavailable ? captureImageUrl(capture) : "";
  const Icon = sourceIconForCapture(capture);
  const itemStatus = displayStatus(capture);
  const markStyle = size === "detail" ? styles.sourceMarkDetail : styles.sourceMark;
  const iconSize = size === "detail" ? 16 : 20;
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
        itemStatus === "processing" && styles.sourceMarkProcessing,
        itemStatus === "needs_review" && styles.sourceMarkReview,
        itemStatus === "failed" && styles.sourceMarkFailed
      ]}
    >
      <Icon color={sourceIconColor(itemStatus)} size={iconSize} strokeWidth={2.3} />
      {faviconUri ? (
        <Image
          cachePolicy="memory-disk"
          contentFit="contain"
          onError={() => onFaviconFailure(host)}
          source={{ uri: faviconUri }}
          style={[
            styles.sourceFaviconOverlay,
            size === "detail" ? styles.sourceFaviconDetail : styles.sourceFavicon
          ]}
        />
      ) : null}
    </View>
  );
}

export function sourceIconColor(status: CaptureStatus) {
  if (status === "processing") return colors.processing;
  if (status === "needs_review") return colors.review;
  if (status === "failed") return colors.danger;
  return colors.accent;
}

export function StatusGlyph({ capture }: { capture: Capture }) {
  const status = displayStatus(capture);
  if (status === "ready") return null;
  const Icon = status === "processing"
      ? Clock3
      : status === "failed"
        ? AlertTriangle
        : Info;
  const label = captureStatusLabel(capture);
  const iconColor = status === "processing"
      ? colors.processing
      : status === "failed"
        ? colors.danger
        : colors.review;
  return (
    <View
      accessibilityLabel={label}
      accessible
      style={[
        styles.statusGlyph,
        status === "processing" && styles.statusGlyphProcessing,
        status === "needs_review" && styles.statusGlyphReview,
        status === "failed" && styles.statusGlyphFailed
      ]}
    >
      <Icon color={iconColor} size={15} strokeWidth={2.5} />
      {status === "processing" ? (
        <Text numberOfLines={1} style={styles.statusGlyphProcessingText}>
          Analyzing
        </Text>
      ) : null}
    </View>
  );
}

export function MeaningToken({ Icon, text }: { Icon: LucideIconComponent; text: string }) {
  return (
    <View style={styles.meaningToken}>
      <Icon color={colors.muted} size={13} strokeWidth={2.2} />
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
      <Folder color={overflowCount > 0 ? colors.accent : colors.muted} size={13} strokeWidth={2.2} />
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
        <Icon color={iconColor} size={17} strokeWidth={2.7} />
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
  if (tone === "error" || tone === "destructive") return AlertTriangle;
  if (tone === "processing") return Clock3;
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
      <View style={styles.bottomNavDock}>
        <View style={styles.bottomNavBar}>
          {navItems.map(({ key, label, Icon, selected, onPress, testID }) => (
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
              <View style={[styles.bottomNavIconWrap, selected && styles.bottomNavIconWrapSelected]}>
                <Icon
                  color={selected ? colors.accent : colors.muted}
                  selected={selected}
                  size={24}
                />
              </View>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityLabel={collectionAction ? "New collection" : "New capture"}
          accessibilityRole="button"
          onPress={onFabPress}
          style={({ pressed }) => [styles.bottomNavFab, pressed && styles.bottomNavFabPressed]}
          testID={collectionAction ? "pc.nav.collection-create" : "pc.nav.capture"}
        >
          <Plus color={colors.onAccent} size={24} strokeWidth={2.55} />
        </Pressable>
      </View>
    </View>
  );
}
