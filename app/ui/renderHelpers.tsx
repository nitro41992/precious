import type { ReactElement } from "react";
import { Animated, Pressable, View } from "react-native";
import { FolderMinus } from "phosphor-react-native";

import { matchReasonForCapture } from "../capturePresentation";
import type {
  Capture,
  CaptureImageLoadState,
  Collection,
  CollectionListMode,
  HomeListRow,
  ToastPlacement,
  ToastState
} from "../types";
import {
  BottomAppBar,
  ToastHost
} from "./components";
import {
  CollectionCard,
  CaptureRow,
  CaptureRowInlineSkeleton,
  CaptureSkeletonRows,
  CollectionSkeletonRows
} from "./rows";
import { styles } from "./styles";
import { colors } from "./theme";
import { Text } from "./typography";

export type AppRenderHelpersInput = {
  activeCapturesLoadedOnce: boolean;
  captureImageLoadStates: Record<string, CaptureImageLoadState>;
  captureRowRevealStates: Record<string, boolean>;
  capturesLoading: boolean;
  collectionFeedRevealPending: boolean;
  collectionListFade: Animated.Value;
  collectionRowsFade: Animated.Value;
  failedFavicons: Record<string, boolean>;
  homeFeedRevealPending: boolean;
  homeRowsFade: Animated.Value;
  onAccountActionsPress: () => void;
  onCaptureImageLoadState: (key: string, state: CaptureImageLoadState) => void;
  onCollectionComposerOpen: () => void;
  onCollectionsScreenOpen: (mode: CollectionListMode) => void;
  onCollectionDescriptionChange: (value: string) => void;
  onCollectionPress: (collectionId: string) => void;
  onCollectionTitleChange: (value: string) => void;
  onFaviconFailure: (host: string) => void;
  onOpenCapture: (captureId: string) => void;
  onOpenCaptureFromCollection: (capture: Capture, collectionId: string) => void;
  onOpenRecentCapture: (captureId: string) => void;
  onRecentHomePress: () => void;
  onRecentComposerOpen: () => void;
  onUnlinkCaptureFromCollection: (collectionId: string, capture: Capture) => void;
  searchQuery: string;
  selectedCollection: Collection | null;
  skeletonPulse: Animated.Value;
  toast: ToastState | null;
};

export function createAppRenderHelpers(input: AppRenderHelpersInput) {
  const skeletonOpacity = input.skeletonPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.48, 0.9]
  });
  const skeletonSheenTranslate = input.skeletonPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [-74, 132]
  });

  function SkeletonBlock({ style }: { style?: any }) {
    return (
      <Animated.View style={[style, styles.skeletonBlock, { opacity: skeletonOpacity }]}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.skeletonSheen,
            { transform: [{ translateX: skeletonSheenTranslate }, { rotate: "18deg" }] }
          ]}
        />
      </Animated.View>
    );
  }

  const searchActivityScale = input.skeletonPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1]
  });
  const searchActivityOpacity = input.skeletonPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.46, 1]
  });

  function SearchActivityMark() {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={styles.searchActivityMark}
      >
        <Animated.View
          style={[
            styles.searchActivityDot,
            {
              opacity: searchActivityOpacity,
              transform: [{ scale: searchActivityScale }]
            }
          ]}
        />
        <Animated.View
          style={[
            styles.searchActivityDot,
            styles.searchActivityDotTrailing,
            {
              opacity: skeletonOpacity,
              transform: [{ scale: input.skeletonPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.76] }) }]
            }
          ]}
        />
      </View>
    );
  }

  function renderSearchProgress(label: string) {
    return (
      <View accessibilityLiveRegion="polite" style={styles.searchProgressRow}>
        <SearchActivityMark />
        <Text style={styles.searchProgressText}>{label}</Text>
      </View>
    );
  }

  function renderCaptureRow(rowInput: {
    item: Capture;
    onPress: () => void;
    testID?: string;
    matchReason?: string;
    showCollectionToken?: boolean;
    showInlineSourceIcon?: boolean;
    surface?: "plain" | "card";
    deferFallbackIcon?: boolean;
    deferMediaUntilLoaded?: boolean;
    forceSkeleton?: boolean;
    trailingAction?: ReactElement | null;
  }) {
    return (
      <CaptureRow
        {...rowInput}
        captureImageLoadStates={input.captureImageLoadStates}
        captureRowRevealStates={input.captureRowRevealStates}
        failedFavicons={input.failedFavicons}
        onFaviconFailure={input.onFaviconFailure}
        onImageLoadState={input.onCaptureImageLoadState}
        renderInlineSkeleton={() => renderCaptureRowInlineSkeleton()}
        SkeletonBlock={SkeletonBlock}
      />
    );
  }

  function renderCollectionCapture({ item }: { item: Capture }) {
    const removeAction = (
      <Pressable
        accessibilityLabel="Remove from collection"
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => {
          if (input.selectedCollection) input.onUnlinkCaptureFromCollection(input.selectedCollection.id, item);
        }}
        style={({ pressed }) => [styles.collectionRemoveIconButton, pressed && styles.collectionRemoveIconButtonPressed]}
      >
        <FolderMinus color={colors.danger} size={22} weight="regular" />
      </Pressable>
    );

    return (
      <Animated.View style={[styles.collectionCaptureRow, { opacity: input.collectionRowsFade }]}>
        {renderCaptureRow({
          showCollectionToken: false,
          item,
          onPress: () => {
            if (input.selectedCollection) input.onOpenCaptureFromCollection(item, input.selectedCollection.id);
          },
          trailingAction: removeAction
        })}
      </Animated.View>
    );
  }

  function renderCollection({ item }: { item: Collection }) {
    return (
      <CollectionCard
        collectionListFade={input.collectionListFade}
        item={item}
        onPress={() => {
          input.onCollectionPress(item.id);
          input.onCollectionTitleChange(item.title);
          input.onCollectionDescriptionChange(item.description);
        }}
      />
    );
  }

  function renderHomeRow({ item }: { item: HomeListRow }) {
    if (item.type === "section") {
      return (
        <Animated.Text style={[styles.groupHeader, { opacity: input.homeFeedRevealPending ? 0 : input.homeRowsFade }]}>
          {item.title}
        </Animated.Text>
      );
    }
    return (
      <Animated.View style={{ opacity: input.homeRowsFade }}>
        {renderCaptureRow({
          item: item.capture,
          deferFallbackIcon: input.capturesLoading && !input.activeCapturesLoadedOnce,
          forceSkeleton: input.homeFeedRevealPending,
          onPress: () => input.onOpenRecentCapture(item.capture.id),
          showInlineSourceIcon: true,
          surface: "card",
          testID: `pc.capture.row.${item.capture.id}`
        })}
      </Animated.View>
    );
  }

  function renderSearchResult({ item }: { item: Capture }) {
    return renderCaptureRow({
      item,
      matchReason: matchReasonForCapture(item, input.searchQuery),
      onPress: () => input.onOpenCapture(item.id),
      testID: `pc.search.result.${item.id}`
    });
  }

  function renderCaptureRowInlineSkeleton(withRemoveAction = false) {
    return <CaptureRowInlineSkeleton SkeletonBlock={SkeletonBlock} withRemoveAction={withRemoveAction} />;
  }

  function renderCaptureSkeletonRows(count = 3, withRemoveAction = false) {
    return <CaptureSkeletonRows count={count} SkeletonBlock={SkeletonBlock} withRemoveAction={withRemoveAction} />;
  }

  function renderCollectionSkeletonRows(count = 7, withSelectionControl = false, skeletonCollections: Collection[] = []) {
    return (
      <CollectionSkeletonRows
        count={count}
        SkeletonBlock={SkeletonBlock}
        skeletonCollections={skeletonCollections}
        withSelectionControl={withSelectionControl}
      />
    );
  }

  function renderLoadingRows() {
    return renderCaptureSkeletonRows(3);
  }

  function renderCollectionCaptureSkeletonRows(count = 4) {
    return renderCaptureSkeletonRows(count, true);
  }

  function renderListLoadingFooter(label = "Loading more captures...") {
    return (
      <View style={styles.listLoadingFooter}>
        <Text style={styles.meta}>{label}</Text>
      </View>
    );
  }

  function renderToast(placement: ToastPlacement = "base") {
    return <ToastHost toast={input.toast} placement={placement} />;
  }

  function renderBottomAppBar(active: "recent" | "collections") {
    return (
      <BottomAppBar
        active={active}
        onCollectionsPress={() => input.onCollectionsScreenOpen("active")}
        onFabPress={active === "collections" ? input.onCollectionComposerOpen : input.onRecentComposerOpen}
        onRecentPress={input.onRecentHomePress}
        onSettingsPress={input.onAccountActionsPress}
      />
    );
  }

  return {
    renderBottomAppBar,
    renderCaptureRow,
    renderCaptureRowInlineSkeleton,
    renderCaptureSkeletonRows,
    renderCollection,
    renderCollectionCapture,
    renderCollectionCaptureSkeletonRows,
    renderCollectionSkeletonRows,
    renderHomeRow,
    renderListLoadingFooter,
    renderLoadingRows,
    renderSearchProgress,
    renderSearchResult,
    renderToast,
    SkeletonBlock: SkeletonBlock as ({ style }: { style?: any }) => ReactElement
  };
}
