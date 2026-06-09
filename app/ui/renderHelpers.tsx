import type { ReactElement } from "react";
import { Animated, View } from "react-native";
import Reanimated from "react-native-reanimated";

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
  CollectionCaptureRowItem,
  CaptureRowInlineSkeleton,
  CaptureSkeletonRows,
  CollectionGridSkeleton,
  CollectionSkeletonRows,
  HomeCaptureRowItem,
  SearchCaptureRowItem
} from "./rows";
import { styles } from "./styles";
import { rowEntering } from "./motion";

export type AppRenderHelpersInput = {
  activeCapturesLoadedOnce: boolean;
  captureImageLoadStates: Record<string, CaptureImageLoadState>;
  captureRowRevealStates: Record<string, boolean>;
  capturesLoading: boolean;
  collectionFeedRevealPending: boolean;
  collectionItemMotionEnabled: boolean;
  collectionListFade: Animated.Value;
  collectionRowsFade: Animated.Value;
  failedFavicons: Record<string, boolean>;
  homeFeedRevealPending: boolean;
  homeRowsFade: Animated.Value;
  onAccountActionsPress: () => void;
  onCaptureImageLoadState: (key: string, state: CaptureImageLoadState) => void;
  onCaptureRowImageDisplayed: (capture: Capture, url: string, cacheKey: string) => void;
  onCollectionComposerOpen: () => void;
  onCollectionsScreenOpen: (mode: CollectionListMode) => void;
  onCollectionDescriptionChange: (value: string) => void;
  onCollectionPress: (collectionId: string) => void;
  onCollectionTitleChange: (value: string) => void;
  onCaptureThumbnailRef: (captureId: string, node: View | null) => void;
  onCollectionCaptureThumbnailRef: (captureId: string, node: View | null) => void;
  onSearchCaptureThumbnailRef: (captureId: string, node: View | null) => void;
  onFaviconFailure: (host: string) => void;
  onOpenCapture: (captureId: string) => void;
  onOpenCaptureFromCollection: (capture: Capture, collectionId: string) => void;
  onOpenCaptureFromSearch: (capture: Capture) => void;
  onOpenRecentCapture: (capture: Capture) => void;
  onRecentHomePress: () => void;
  onRecentComposerOpen: () => void;
  onUnlinkCaptureFromCollection: (collectionId: string, capture: Capture) => void;
  restoredCollectionId: string | null;
  searchQuery: string;
  selectedCollection: Collection | null;
  handoffHiddenCapture: { aliases: string[]; surface: "home" | "collection" | "search" } | null;
  screenHandoffActive: boolean;
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

  // No per-row exiting OR layout here. Exit animations that outlive the
  // unmounting screen leave orphaned Reanimated snapshots floating over the
  // list — the screen-level pane transition covers departure. The `layout`
  // LinearTransition has the same failure mode on reflow: opening a collection
  // arms it as the handoff completes (`screenHandoffActive` flips false), and
  // the cache-first refresh re-seeds the list while thumbnails load and change
  // row heights. In that window the transition conflicts with `entering` and
  // leaves a stuck transform on the top rows, so cards settle overlapping. Only
  // `entering` stays: it runs on mount and cleans up after itself, softening
  // rows that arrive after first paint (the cache-first refresh, pagination).
  function renderCollectionCapture({ item, index = 0 }: { item: Capture; index?: number }) {
    const collection = input.selectedCollection;
    if (!collection) return null;
    return (
      <Reanimated.View
        entering={input.screenHandoffActive ? undefined : rowEntering(index)}
        style={styles.collectionCaptureRow}
      >
        <Animated.View style={{ opacity: input.collectionRowsFade }}>
          <CollectionCaptureRowItem
            capture={item}
            captureImageLoadStates={input.captureImageLoadStates}
            captureRowRevealStates={input.captureRowRevealStates}
            collectionId={collection.id}
            failedFavicons={input.failedFavicons}
            forceSkeleton={input.collectionFeedRevealPending}
            thumbnailHidden={Boolean(
              input.handoffHiddenCapture?.surface === "collection" &&
                input.handoffHiddenCapture.aliases.includes(item.id)
            )}
            onCaptureRowImageDisplayed={input.onCaptureRowImageDisplayed}
            onCaptureThumbnailRef={input.onCollectionCaptureThumbnailRef}
            onFaviconFailure={input.onFaviconFailure}
            onImageLoadState={input.onCaptureImageLoadState}
            onOpenCaptureFromCollection={input.onOpenCaptureFromCollection}
            onUnlinkCaptureFromCollection={input.onUnlinkCaptureFromCollection}
            SkeletonBlock={SkeletonBlock}
            testID={`pc.collection.capture.row.${item.id}`}
          />
        </Animated.View>
      </Reanimated.View>
    );
  }

  function renderCollection({ item, index = 0 }: { item: Collection; index?: number }) {
    return (
      <CollectionCard
        collectionListFade={input.collectionListFade}
        item={item}
        justRestored={input.restoredCollectionId === item.id}
        motionEnabled={input.collectionItemMotionEnabled}
        motionIndex={index}
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
    // No per-row Reanimated entering/exiting/layout: the home feed is a
    // FlashList, which recycles cells. Layout animations on a recycled cell
    // re-fire on every reuse — that produced the staggered "cascade", the dim
    // mid-fade rows, and cards stuck overlapping (a `layout` transform left
    // mid-flight). The feed reveals as one surface via `homeRowsFade`; a
    // recycled row just swaps its content with no per-cell animation.
    return (
      <Animated.View style={{ opacity: input.homeRowsFade }}>
        <HomeCaptureRowItem
          capture={item.capture}
          captureImageLoadStates={input.captureImageLoadStates}
          captureRowRevealStates={input.captureRowRevealStates}
          deferFallbackIcon={input.capturesLoading && !input.activeCapturesLoadedOnce}
          failedFavicons={input.failedFavicons}
          forceSkeleton={input.homeFeedRevealPending}
          thumbnailHidden={Boolean(
            input.handoffHiddenCapture?.surface === "home" &&
              input.handoffHiddenCapture.aliases.includes(item.capture.id)
          )}
          onCaptureRowImageDisplayed={input.onCaptureRowImageDisplayed}
          onCaptureThumbnailRef={input.onCaptureThumbnailRef}
          onFaviconFailure={input.onFaviconFailure}
          onImageLoadState={input.onCaptureImageLoadState}
          onOpenRecentCapture={input.onOpenRecentCapture}
          SkeletonBlock={SkeletonBlock}
          testID={`pc.capture.row.${item.capture.id}`}
        />
      </Animated.View>
    );
  }

  function renderSearchResult({ item }: { item: Capture }) {
    return (
      <SearchCaptureRowItem
        capture={item}
        captureImageLoadStates={input.captureImageLoadStates}
        captureRowRevealStates={input.captureRowRevealStates}
        failedFavicons={input.failedFavicons}
        matchReason={matchReasonForCapture(item, input.searchQuery)}
        onCaptureRowImageDisplayed={input.onCaptureRowImageDisplayed}
        onCaptureThumbnailRef={input.onSearchCaptureThumbnailRef}
        onFaviconFailure={input.onFaviconFailure}
        onImageLoadState={input.onCaptureImageLoadState}
        onOpenCaptureFromSearch={input.onOpenCaptureFromSearch}
        SkeletonBlock={SkeletonBlock}
        testID={`pc.search.result.${item.id}`}
        thumbnailHidden={Boolean(
          input.handoffHiddenCapture?.surface === "search" &&
            input.handoffHiddenCapture.aliases.includes(item.id)
        )}
      />
    );
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

  function renderCollectionGridSkeleton(count = 6) {
    return <CollectionGridSkeleton count={count} SkeletonBlock={SkeletonBlock} />;
  }

  function renderLoadingRows() {
    return renderCaptureSkeletonRows(3);
  }

  function renderCollectionCaptureSkeletonRows(count = 4) {
    return renderCaptureSkeletonRows(count, true);
  }

  // Pagination footer mirrors the shape of the rows that are loading rather
  // than a plain "Loading more..." line: a run of shimmering skeleton rows
  // reads as content arriving, which makes the wait feel shorter and snappier.
  function renderListLoadingFooter(
    variant: "captures" | "collectionCaptures" | "collections" = "captures"
  ) {
    if (variant === "collections") {
      return renderCollectionSkeletonRows(4);
    }
    return renderCaptureSkeletonRows(4, variant === "collectionCaptures");
  }

  function renderToast(placement: ToastPlacement = "base") {
    return <ToastHost toast={input.toast} placement={placement} />;
  }

  function renderBottomAppBar(active: "recent" | "collections") {
    return (
      <BottomAppBar
        active={active}
        onCollectionsPress={() => input.onCollectionsScreenOpen("active")}
        // The FAB is the single global "add capture" action on every tab.
        onFabPress={input.onRecentComposerOpen}
        onRecentPress={input.onRecentHomePress}
        onSettingsPress={input.onAccountActionsPress}
      />
    );
  }

  return {
    renderBottomAppBar,
    renderCaptureRowInlineSkeleton,
    renderCaptureSkeletonRows,
    renderCollection,
    renderCollectionCapture,
    renderCollectionCaptureSkeletonRows,
    renderCollectionGridSkeleton,
    renderCollectionSkeletonRows,
    renderHomeRow,
    renderListLoadingFooter,
    renderLoadingRows,
    renderSearchResult,
    renderToast,
    SkeletonBlock: SkeletonBlock as ({ style }: { style?: any }) => ReactElement
  };
}
