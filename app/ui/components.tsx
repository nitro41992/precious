import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { AlertTriangle, Check, Clock3, Folder, Info, Plus, Settings } from "lucide-react-native";
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
  isImageCapture,
  isMapSource,
  sourceFaviconUrl,
  sourceIconForCapture,
  uniqueStrings
} from "../capturePresentation";
import { colors } from "./theme";
import { styles } from "./styles";

function LucideNavIcon({
  Icon,
  color,
  selected = false,
  size = 24
}: NavIconProps & { Icon: LucideIconComponent }) {
  return <Icon color={color} size={size} strokeWidth={selected ? 2.65 : 2.25} />;
}

function sourceMonogramFromHost(host: string) {
  const cleaned = host
    .replace(/^www\./i, "")
    .replace(/^m\./i, "")
    .toLowerCase();
  const brand = cleaned
    .split(".")
    .find((part) => part && !["app", "co", "com", "go", "goo", "gl", "io", "ly", "net", "org"].includes(part));
  if (!brand) return "";
  if (brand.length === 1) return brand.toUpperCase();
  return brand.slice(0, 3).toUpperCase();
}

function sourceMonogramForCapture(capture: Capture, host: string) {
  const source = `${host} ${capture.siteName || ""} ${capture.sourceUrl || ""}`.toLowerCase();
  const captureType = String(capture.captureType || "").toLowerCase();
  if (isMapSource(capture)) return "MAP";
  if (source.includes("instagram")) return "IG";
  if (source.includes("reddit")) return "RED";
  if (source.includes("facebook") || source.includes("fb.watch")) return "FB";
  if (source.includes("tiktok")) return "TT";
  if (source.includes("youtube") || source.includes("youtu.be")) return "YT";
  if (source.includes("substack")) return "SUB";
  if (source.includes("medium")) return "MED";
  if (source.includes("amazon")) return "AMZ";
  if (source.includes("etsy")) return "ETSY";
  if (source.includes("threads")) return "THR";
  if (source.includes("x.com") || source.includes("twitter")) return "X";
  if (captureType === "note" || (!capture.sourceUrl && !isImageCapture(capture))) return "NOTE";
  if (isImageCapture(capture)) return "IMG";
  return sourceMonogramFromHost(host) || "WEB";
}

export function RecentNavIcon({ color, selected = false, size = 24 }: NavIconProps) {
  if (selected) {
    return (
      <Svg height={size} viewBox="0 0 24 24" width={size}>
        <Circle cx="12" cy="12" fill={color} r="9.5" />
        <Path
          d="M12 7.2v5.05l3.45 2.08"
          fill="none"
          stroke={colors.paper}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.35"
        />
      </Svg>
    );
  }
  return <LucideNavIcon Icon={Clock3} color={color} selected={selected} size={size} />;
}

export function CollectionsNavIcon({ color, selected = false, size = 24 }: NavIconProps) {
  if (selected) {
    return (
      <Svg height={size} viewBox="0 0 24 24" width={size}>
        <Path
          d="M3.25 7.15A2.65 2.65 0 0 1 5.9 4.5h3.4c.72 0 1.4.32 1.86.88l1.08 1.32h5.86a2.65 2.65 0 0 1 2.65 2.65v6.9a2.65 2.65 0 0 1-2.65 2.65H5.9a2.65 2.65 0 0 1-2.65-2.65v-9.1Z"
          fill={color}
        />
        <Path
          d="M7.2 11.35h9.6"
          fill="none"
          stroke={colors.paper}
          strokeLinecap="round"
          strokeWidth="2.25"
        />
      </Svg>
    );
  }
  return <LucideNavIcon Icon={Folder} color={color} selected={selected} size={size} />;
}

export function SettingsNavIcon({ color, selected = false, size = 24 }: NavIconProps) {
  return <LucideNavIcon Icon={Settings} color={color} selected={selected} size={size} />;
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
  const iconColor = sourceIconColor(itemStatus, size);
  const sourceMonogram = sourceMonogramForCapture(capture, host);
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
      {faviconUri ? (
        <Image
          cachePolicy="memory-disk"
          contentFit="contain"
          onError={() => onFaviconFailure(host)}
          source={{ uri: faviconUri }}
          style={size === "detail" ? styles.sourceFaviconDetail : styles.sourceFavicon}
        />
      ) : size === "row" ? (
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          numberOfLines={1}
          style={[
            styles.sourceMarkText,
            sourceMonogram.length > 3 && styles.sourceMarkTextLong,
            { color: iconColor }
          ]}
        >
          {sourceMonogram}
        </Text>
      ) : (
        <Icon color={iconColor} size={iconSize} strokeWidth={2.3} />
      )}
    </View>
  );
}

export function sourceIconColor(status: CaptureStatus, size: "row" | "detail" = "row") {
  if (status === "processing" || status === "failed") return colors.paper;
  if (size === "detail" && status === "ready") return colors.accent;
  return colors.onAccent;
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
              <View style={styles.bottomNavIconWrap}>
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
          <Plus color={colors.onCreate} size={24} strokeWidth={2.55} />
        </Pressable>
      </View>
    </View>
  );
}
