import { memo, useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { Animated, View } from "react-native";
import { Image } from "expo-image";
import { CalendarBlank, Folder, ImageSquare, Lightbulb, MinusCircle, Plus, Sparkle } from "phosphor-react-native";
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { collectionCollageSlots, hostFromUrl } from "../captureLogic";
import type { Capture, CaptureImageLoadState, Collection } from "../types";
import {
  captureDisplayTitle,
  captureFaviconHost,
  captureImageLoadKey,
  captureIntentLabel,
  captureRowRevealKey,
  captureRowSourceLabel,
  formatDateTime,
  reminderLabel,
  shouldGhostSourceMark
} from "../capturePresentation";
import { colors } from "./theme";
import { styles } from "./styles";
import { CollectionMeaningToken, MeaningToken, MotionPressable, SkeletonRevealFrame, SourceMark, StatusGlyph } from "./components";
import { cardEntering, motionDuration, motionEasing, motionReduceMotion } from "./motion";
import { Text } from "./typography";

type SkeletonBlockRenderer = ({ style }: { style?: any }) => ReactElement;

type CaptureRowProps = {
  captureImageLoadStates: Record<string, CaptureImageLoadState>;
  captureRowRevealStates: Record<string, boolean>;
  deferFallbackIcon?: boolean;
  deferMediaUntilLoaded?: boolean;
  failedFavicons: Record<string, boolean>;
  forceSkeleton?: boolean;
  item: Capture;
  matchReason?: string;
  onFaviconFailure: (host: string) => void;
  onImageLoadState: (key: string, state: CaptureImageLoadState) => void;
  onPress: () => void;
  onThumbnailImageDisplayed?: (url: string, cacheKey: string) => void;
  renderInlineSkeleton: () => ReactElement | null;
  showCollectionToken?: boolean;
  hideThumbnail?: boolean;
  showInlineSourceIcon?: boolean;
  SkeletonBlock: SkeletonBlockRenderer;
  surface?: "plain" | "card";
  testID?: string;
  thumbnailRef?: (node: View | null) => void;
  trailingAction?: ReactElement | null;
};

export function CaptureRow({
  captureImageLoadStates,
  captureRowRevealStates,
  deferFallbackIcon = false,
  deferMediaUntilLoaded = false,
  failedFavicons,
  forceSkeleton = false,
  item,
  matchReason,
  onFaviconFailure,
  onImageLoadState,
  onPress,
  onThumbnailImageDisplayed,
  renderInlineSkeleton,
  showCollectionToken = true,
  hideThumbnail = false,
  showInlineSourceIcon = false,
  SkeletonBlock,
  surface = "plain",
  testID,
  thumbnailRef,
  trailingAction = null
}: CaptureRowProps) {
  const carded = surface === "card";
  const imageLoadKey = captureImageLoadKey(item);
  const imageLoadState = imageLoadKey ? captureImageLoadStates[imageLoadKey] : undefined;
  const revealKey = captureRowRevealKey(item);
  const rowRevealed = Boolean(captureRowRevealStates[revealKey]);
  const deferRowUntilImageReady = Boolean(
    forceSkeleton ||
      (deferMediaUntilLoaded &&
        !rowRevealed &&
        (imageLoadKey ? !imageLoadState : true))
  );
  const intentLabel = captureIntentLabel(item);
  const collectionTokens = showCollectionToken ? item.linkedCollections || [] : [];
  const reminderText = reminderLabel(
    (item.suggestedReminders || []).find((reminder) => reminder.status !== "removed")
  );
  const suggestionLabel = item.pendingSuggestion?.title?.trim() || "";
  const hasMeaningTokens = Boolean(
    intentLabel ||
      reminderText ||
      suggestionLabel ||
      collectionTokens.some((collection) => collection.title.trim())
  );
  const ghostSourceMark = deferFallbackIcon || shouldGhostSourceMark(item);
  const sourceMark = (
    <SourceMark
      capture={item}
      failedFavicons={failedFavicons}
      imageLoadKey={imageLoadKey}
      imageUnavailable={imageLoadState === "failed"}
      onFaviconFailure={onFaviconFailure}
      onImageDisplayed={onThumbnailImageDisplayed}
      onImageLoadState={onImageLoadState}
    />
  );
  const row = (
    <MotionPressable
      onPress={onPress}
      // No press scale: this row is the shared-element source for the review
      // handoff. The morph copy takes off from the measured layout rect, so
      // a press-scaled card makes the content jut when the copy appears.
      // The pressed background dim is the press feedback instead.
      pressScale={1}
      style={({ pressed }) => [
        styles.captureRow,
        carded && styles.captureRowCard,
        pressed && (carded ? styles.captureRowCardPressed : styles.captureRowPressed)
      ]}
      testID={testID}
    >
      <View collapsable={false} ref={thumbnailRef} style={hideThumbnail && styles.handoffHiddenThumbnail}>
        {ghostSourceMark ? (
          <SkeletonBlock style={styles.loadingThumbnailMark} />
        ) : (
          sourceMark
        )}
      </View>
      <View style={styles.rowContent}>
        <View style={styles.rowTitleLine}>
          <Text numberOfLines={2} style={[styles.captureTitle, carded && styles.captureCardTitle]}>
            {captureDisplayTitle(item)}
          </Text>
          <StatusGlyph capture={item} />
          {trailingAction}
        </View>
        {showInlineSourceIcon ? (
          <View style={styles.rowMetaLine}>
            <SourceMark
              capture={item}
              failedFavicons={failedFavicons}
              onFaviconFailure={onFaviconFailure}
              size="meta"
            />
            <Text numberOfLines={1} style={styles.rowSourceMetaText}>
              {captureRowSourceLabel(item)}
            </Text>
            <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.rowMetaSeparator}>
              ·
            </Text>
            <Text numberOfLines={1} style={styles.rowDateMetaText}>
              {formatDateTime(item.createdAt)}
            </Text>
          </View>
        ) : (
          <Text numberOfLines={1} style={styles.meta}>
            {captureRowSourceLabel(item)} · {formatDateTime(item.createdAt)}
          </Text>
        )}
        {matchReason ? (
          <Text numberOfLines={1} style={styles.searchMatchText}>
            {matchReason}
          </Text>
        ) : null}
        {hasMeaningTokens ? (
          <View style={styles.rowMeaningLine}>
            {intentLabel ? (
              <MeaningToken Icon={Lightbulb} text={intentLabel} />
            ) : null}
            <CollectionMeaningToken collections={collectionTokens} />
            {suggestionLabel ? (
              <MeaningToken Icon={Sparkle} iconColor={colors.accentTextStrong} text={suggestionLabel} />
            ) : null}
            {reminderText ? (
              <MeaningToken Icon={CalendarBlank} text={reminderText} />
            ) : null}
          </View>
        ) : null}
      </View>
    </MotionPressable>
  );
  if (!deferMediaUntilLoaded) return row;
  return (
    <SkeletonRevealFrame pending={deferRowUntilImageReady} skeleton={renderInlineSkeleton()}>
      {row}
    </SkeletonRevealFrame>
  );
}

type HomeCaptureRowItemProps = {
  capture: Capture;
  captureImageLoadStates: Record<string, CaptureImageLoadState>;
  captureRowRevealStates: Record<string, boolean>;
  deferFallbackIcon: boolean;
  failedFavicons: Record<string, boolean>;
  forceSkeleton: boolean;
  onCaptureRowImageDisplayed: (capture: Capture, url: string, cacheKey: string) => void;
  onCaptureThumbnailRef: (captureId: string, node: View | null) => void;
  onFaviconFailure: (host: string) => void;
  onImageLoadState: (key: string, state: CaptureImageLoadState) => void;
  onOpenRecentCapture: (capture: Capture) => void;
  SkeletonBlock: SkeletonBlockRenderer;
  testID?: string;
  thumbnailHidden: boolean;
};

// Memoized Home feed row. App-level state changes re-render the whole tree, so
// without this every visible row re-renders on each tap. Capture row objects
// keep identity across data refreshes (preserveCaptureRowIdentities), so the
// comparator can bail unless something this row reads actually changed. The
// per-row onPress/thumbnailRef closures are built INSIDE the memo from stable
// handlers + the (stable-identity) capture, so they don't break bailout.
//
// Excluded from the comparator on purpose: SkeletonBlock and the (unused for
// Home rows) inline-skeleton path are recreated every App render but are
// functionally stable, so comparing them would force needless re-renders.
export const HomeCaptureRowItem = memo(function HomeCaptureRowItem({
  capture,
  captureImageLoadStates,
  captureRowRevealStates,
  deferFallbackIcon,
  failedFavicons,
  forceSkeleton,
  onCaptureRowImageDisplayed,
  onCaptureThumbnailRef,
  onFaviconFailure,
  onImageLoadState,
  onOpenRecentCapture,
  SkeletonBlock,
  testID,
  thumbnailHidden
}: HomeCaptureRowItemProps) {
  const onPress = useCallback(() => onOpenRecentCapture(capture), [onOpenRecentCapture, capture]);
  const thumbnailRef = useCallback(
    (node: View | null) => onCaptureThumbnailRef(capture.id, node),
    [onCaptureThumbnailRef, capture.id]
  );
  const onThumbnailImageDisplayed = useCallback(
    (url: string, cacheKey: string) => onCaptureRowImageDisplayed(capture, url, cacheKey),
    [onCaptureRowImageDisplayed, capture]
  );
  return (
    <CaptureRow
      captureImageLoadStates={captureImageLoadStates}
      captureRowRevealStates={captureRowRevealStates}
      deferFallbackIcon={deferFallbackIcon}
      failedFavicons={failedFavicons}
      forceSkeleton={forceSkeleton}
      hideThumbnail={thumbnailHidden}
      item={capture}
      onFaviconFailure={onFaviconFailure}
      onImageLoadState={onImageLoadState}
      onPress={onPress}
      onThumbnailImageDisplayed={onThumbnailImageDisplayed}
      renderInlineSkeleton={emptyInlineSkeleton}
      showInlineSourceIcon
      SkeletonBlock={SkeletonBlock}
      surface="card"
      testID={testID}
      thumbnailRef={thumbnailRef}
    />
  );
}, (previous, next) => {
  // Re-render only when this row's inputs change: capture identity, its image
  // load state, its reveal state, its favicon-failure entry, the relevant
  // primitive flags, or a (stable) handler identity. The maps are shared and
  // change identity App-wide, so compare just this capture's entries.
  if (
    previous.capture !== next.capture ||
    previous.deferFallbackIcon !== next.deferFallbackIcon ||
    previous.forceSkeleton !== next.forceSkeleton ||
    previous.thumbnailHidden !== next.thumbnailHidden ||
    previous.testID !== next.testID ||
    previous.onOpenRecentCapture !== next.onOpenRecentCapture ||
    previous.onCaptureRowImageDisplayed !== next.onCaptureRowImageDisplayed ||
    previous.onCaptureThumbnailRef !== next.onCaptureThumbnailRef ||
    previous.onFaviconFailure !== next.onFaviconFailure ||
    previous.onImageLoadState !== next.onImageLoadState
  ) {
    return false;
  }
  const imageLoadKey = captureImageLoadKey(next.capture);
  if (imageLoadKey && previous.captureImageLoadStates[imageLoadKey] !== next.captureImageLoadStates[imageLoadKey]) {
    return false;
  }
  const revealKey = captureRowRevealKey(next.capture);
  if (Boolean(previous.captureRowRevealStates[revealKey]) !== Boolean(next.captureRowRevealStates[revealKey])) {
    return false;
  }
  const host = captureFaviconHost(next.capture);
  return Boolean(previous.failedFavicons[host]) === Boolean(next.failedFavicons[host]);
});

function emptyInlineSkeleton(): ReactElement | null {
  return null;
}

type SearchCaptureRowItemProps = {
  capture: Capture;
  captureImageLoadStates: Record<string, CaptureImageLoadState>;
  captureRowRevealStates: Record<string, boolean>;
  failedFavicons: Record<string, boolean>;
  matchReason?: string;
  onCaptureRowImageDisplayed: (capture: Capture, url: string, cacheKey: string) => void;
  onCaptureThumbnailRef: (captureId: string, node: View | null) => void;
  onFaviconFailure: (host: string) => void;
  onImageLoadState: (key: string, state: CaptureImageLoadState) => void;
  onOpenCaptureFromSearch: (capture: Capture) => void;
  SkeletonBlock: SkeletonBlockRenderer;
  testID?: string;
  thumbnailHidden: boolean;
};

// Memoized search-result row: the same carded design and handoff plumbing as
// HomeCaptureRowItem, plus the search-only match-reason line. Sharing CaptureRow
// keeps the card visuals and the review morph identical to Recents; the per-row
// closures are built inside the memo from stable handlers.
export const SearchCaptureRowItem = memo(function SearchCaptureRowItem({
  capture,
  captureImageLoadStates,
  captureRowRevealStates,
  failedFavicons,
  matchReason,
  onCaptureRowImageDisplayed,
  onCaptureThumbnailRef,
  onFaviconFailure,
  onImageLoadState,
  onOpenCaptureFromSearch,
  SkeletonBlock,
  testID,
  thumbnailHidden
}: SearchCaptureRowItemProps) {
  const onPress = useCallback(() => onOpenCaptureFromSearch(capture), [onOpenCaptureFromSearch, capture]);
  const thumbnailRef = useCallback(
    (node: View | null) => onCaptureThumbnailRef(capture.id, node),
    [onCaptureThumbnailRef, capture.id]
  );
  const onThumbnailImageDisplayed = useCallback(
    (url: string, cacheKey: string) => onCaptureRowImageDisplayed(capture, url, cacheKey),
    [onCaptureRowImageDisplayed, capture]
  );
  return (
    <CaptureRow
      captureImageLoadStates={captureImageLoadStates}
      captureRowRevealStates={captureRowRevealStates}
      failedFavicons={failedFavicons}
      hideThumbnail={thumbnailHidden}
      item={capture}
      matchReason={matchReason}
      onFaviconFailure={onFaviconFailure}
      onImageLoadState={onImageLoadState}
      onPress={onPress}
      onThumbnailImageDisplayed={onThumbnailImageDisplayed}
      renderInlineSkeleton={emptyInlineSkeleton}
      showInlineSourceIcon
      SkeletonBlock={SkeletonBlock}
      surface="card"
      testID={testID}
      thumbnailRef={thumbnailRef}
    />
  );
}, (previous, next) => {
  // Same bailout contract as HomeCaptureRowItem, plus the match reason (which
  // changes with the query) and the search open handler.
  if (
    previous.capture !== next.capture ||
    previous.matchReason !== next.matchReason ||
    previous.thumbnailHidden !== next.thumbnailHidden ||
    previous.testID !== next.testID ||
    previous.onOpenCaptureFromSearch !== next.onOpenCaptureFromSearch ||
    previous.onCaptureRowImageDisplayed !== next.onCaptureRowImageDisplayed ||
    previous.onCaptureThumbnailRef !== next.onCaptureThumbnailRef ||
    previous.onFaviconFailure !== next.onFaviconFailure ||
    previous.onImageLoadState !== next.onImageLoadState
  ) {
    return false;
  }
  const imageLoadKey = captureImageLoadKey(next.capture);
  if (imageLoadKey && previous.captureImageLoadStates[imageLoadKey] !== next.captureImageLoadStates[imageLoadKey]) {
    return false;
  }
  const revealKey = captureRowRevealKey(next.capture);
  if (Boolean(previous.captureRowRevealStates[revealKey]) !== Boolean(next.captureRowRevealStates[revealKey])) {
    return false;
  }
  const host = captureFaviconHost(next.capture);
  return Boolean(previous.failedFavicons[host]) === Boolean(next.failedFavicons[host]);
});

type CollectionCaptureRowItemProps = {
  capture: Capture;
  captureImageLoadStates: Record<string, CaptureImageLoadState>;
  captureRowRevealStates: Record<string, boolean>;
  collectionId: string;
  failedFavicons: Record<string, boolean>;
  forceSkeleton: boolean;
  onCaptureRowImageDisplayed: (capture: Capture, url: string, cacheKey: string) => void;
  onCaptureThumbnailRef: (captureId: string, node: View | null) => void;
  onFaviconFailure: (host: string) => void;
  onImageLoadState: (key: string, state: CaptureImageLoadState) => void;
  onOpenCaptureFromCollection: (capture: Capture, collectionId: string) => void;
  onUnlinkCaptureFromCollection: (collectionId: string, capture: Capture) => void;
  SkeletonBlock: SkeletonBlockRenderer;
  testID?: string;
  thumbnailHidden: boolean;
};

// Memoized collection-detail row: same card design and bailout strategy as
// HomeCaptureRowItem, plus the remove-from-collection trailing action. Takes
// the collection ID (not the collection object — its identity churns on every
// refresh and would defeat the bailout); the per-row closures are built inside
// the memo from stable handlers.
export const CollectionCaptureRowItem = memo(function CollectionCaptureRowItem({
  capture,
  captureImageLoadStates,
  captureRowRevealStates,
  collectionId,
  failedFavicons,
  forceSkeleton,
  onCaptureRowImageDisplayed,
  onCaptureThumbnailRef,
  onFaviconFailure,
  onImageLoadState,
  onOpenCaptureFromCollection,
  onUnlinkCaptureFromCollection,
  SkeletonBlock,
  testID,
  thumbnailHidden
}: CollectionCaptureRowItemProps) {
  const onPress = useCallback(
    () => onOpenCaptureFromCollection(capture, collectionId),
    [capture, collectionId, onOpenCaptureFromCollection]
  );
  const thumbnailRef = useCallback(
    (node: View | null) => onCaptureThumbnailRef(capture.id, node),
    [onCaptureThumbnailRef, capture.id]
  );
  const onThumbnailImageDisplayed = useCallback(
    (url: string, cacheKey: string) => onCaptureRowImageDisplayed(capture, url, cacheKey),
    [onCaptureRowImageDisplayed, capture]
  );
  const removeAction = (
    <MotionPressable
      accessibilityLabel="Remove from collection"
      accessibilityRole="button"
      hitSlop={8}
      onPress={() => onUnlinkCaptureFromCollection(collectionId, capture)}
      style={({ pressed }) => [styles.collectionRemoveIconButton, pressed && styles.collectionRemoveIconButtonPressed]}
    >
      {/* Muted minus, not a red trash/X: the action unlinks the capture from
          this collection — it does not delete it — and the previous danger
          tint read as an alert badge rather than an affordance. */}
      <MinusCircle color={colors.muted} size={22} weight="regular" />
    </MotionPressable>
  );
  return (
    <CaptureRow
      captureImageLoadStates={captureImageLoadStates}
      captureRowRevealStates={captureRowRevealStates}
      failedFavicons={failedFavicons}
      forceSkeleton={forceSkeleton}
      hideThumbnail={thumbnailHidden}
      item={capture}
      onFaviconFailure={onFaviconFailure}
      onImageLoadState={onImageLoadState}
      onPress={onPress}
      onThumbnailImageDisplayed={onThumbnailImageDisplayed}
      renderInlineSkeleton={emptyInlineSkeleton}
      showCollectionToken={false}
      showInlineSourceIcon
      SkeletonBlock={SkeletonBlock}
      surface="card"
      testID={testID}
      thumbnailRef={thumbnailRef}
      trailingAction={removeAction}
    />
  );
}, (previous, next) => {
  // Same bailout contract as HomeCaptureRowItem: re-render only when this
  // row's own inputs change. The shared maps change identity App-wide, so
  // compare just this capture's entries.
  if (
    previous.capture !== next.capture ||
    previous.collectionId !== next.collectionId ||
    previous.forceSkeleton !== next.forceSkeleton ||
    previous.thumbnailHidden !== next.thumbnailHidden ||
    previous.testID !== next.testID ||
    previous.onOpenCaptureFromCollection !== next.onOpenCaptureFromCollection ||
    previous.onUnlinkCaptureFromCollection !== next.onUnlinkCaptureFromCollection ||
    previous.onCaptureRowImageDisplayed !== next.onCaptureRowImageDisplayed ||
    previous.onCaptureThumbnailRef !== next.onCaptureThumbnailRef ||
    previous.onFaviconFailure !== next.onFaviconFailure ||
    previous.onImageLoadState !== next.onImageLoadState
  ) {
    return false;
  }
  const imageLoadKey = captureImageLoadKey(next.capture);
  if (imageLoadKey && previous.captureImageLoadStates[imageLoadKey] !== next.captureImageLoadStates[imageLoadKey]) {
    return false;
  }
  const revealKey = captureRowRevealKey(next.capture);
  if (Boolean(previous.captureRowRevealStates[revealKey]) !== Boolean(next.captureRowRevealStates[revealKey])) {
    return false;
  }
  const host = captureFaviconHost(next.capture);
  return Boolean(previous.failedFavicons[host]) === Boolean(next.failedFavicons[host]);
});

export function CaptureRowInlineSkeleton({
  SkeletonBlock,
  withRemoveAction = false
}: {
  SkeletonBlock: SkeletonBlockRenderer;
  withRemoveAction?: boolean;
}) {
  const body = (
    <>
      <SkeletonBlock style={styles.loadingThumbnailMark} />
      <View style={styles.captureRowSkeletonCopy}>
        <SkeletonBlock style={styles.collectionLoadingTitle} />
        <SkeletonBlock style={styles.collectionLoadingLine} />
        <SkeletonBlock style={styles.collectionLoadingLineShort} />
        <SkeletonBlock style={styles.collectionLoadingToken} />
      </View>
    </>
  );
  if (withRemoveAction) {
    return (
      <View style={styles.collectionCaptureSkeletonInline}>
        <View style={styles.collectionCaptureMain}>
          <View style={styles.captureRowSkeletonInline}>{body}</View>
        </View>
        <SkeletonBlock style={styles.collectionLoadingAction} />
      </View>
    );
  }
  return <View style={styles.captureRowSkeletonInline}>{body}</View>;
}

// A standalone loading row mirrors the real carded capture row by reusing the
// exact same card styles (captureRow + captureRowCard). So the skeleton reads
// as "a card is loading here" — same white surface, radius, inset, and
// geometry — instead of a flat placeholder that looks foreign on the feed.
// Shared by every capture-card surface: Recents cold load + pagination, and
// collection-detail cold load + pagination (via withRemoveAction).
function CaptureSkeletonRow({
  SkeletonBlock,
  keyValue,
  withRemoveAction = false
}: {
  SkeletonBlock: SkeletonBlockRenderer;
  keyValue?: number;
  withRemoveAction?: boolean;
}) {
  return (
    <View key={keyValue} style={[styles.captureRow, styles.captureRowCard]}>
      <SkeletonBlock style={styles.loadingThumbnailMark} />
      <View style={styles.captureRowSkeletonCopy}>
        <SkeletonBlock style={styles.collectionLoadingTitle} />
        <SkeletonBlock style={styles.collectionLoadingLine} />
        <SkeletonBlock style={styles.collectionLoadingLineShort} />
        <SkeletonBlock style={styles.collectionLoadingToken} />
      </View>
      {withRemoveAction ? <SkeletonBlock style={styles.collectionLoadingAction} /> : null}
    </View>
  );
}

export function CaptureSkeletonRows({
  count = 3,
  SkeletonBlock,
  withRemoveAction = false
}: {
  count?: number;
  SkeletonBlock: SkeletonBlockRenderer;
  withRemoveAction?: boolean;
}) {
  return (
    <View style={styles.loadingRows}>
      {Array.from({ length: count }).map((_, item) => (
        <CaptureSkeletonRow
          key={item}
          keyValue={item}
          SkeletonBlock={SkeletonBlock}
          withRemoveAction={withRemoveAction}
        />
      ))}
    </View>
  );
}

function collectionSkeletonDescriptionLines(collection: Collection | undefined, index: number) {
  if (collection) return String(collection.description || "").length > 58 ? 2 : 1;
  return index === 0 || index === 2 || index === 5 ? 2 : 1;
}

export function CollectionSkeletonRows({
  count = 7,
  SkeletonBlock,
  skeletonCollections = [],
  withSelectionControl = false
}: {
  count?: number;
  SkeletonBlock: SkeletonBlockRenderer;
  skeletonCollections?: Collection[];
  withSelectionControl?: boolean;
}) {
  return (
    <View style={styles.collectionListSkeletonRows}>
      {Array.from({ length: count }).map((_, item) => {
        const descriptionLines = collectionSkeletonDescriptionLines(skeletonCollections[item], item);
        return (
          <View key={item}>
            <View style={withSelectionControl ? styles.collectionChoiceRow : styles.collectionRow}>
              <View style={withSelectionControl ? styles.collectionChoiceBody : styles.collectionListSkeletonBody}>
                <View style={styles.collectionRowTop}>
                  <SkeletonBlock style={styles.collectionListSkeletonIcon} />
                  <View style={styles.collectionRowCopy}>
                    <SkeletonBlock style={styles.collectionListSkeletonTitle} />
                    <SkeletonBlock style={styles.collectionListSkeletonMeta} />
                  </View>
                </View>
                <View style={styles.collectionListSkeletonSummaryStack}>
                  <SkeletonBlock style={styles.collectionListSkeletonSummary} />
                  {descriptionLines > 1 ? <SkeletonBlock style={styles.collectionListSkeletonSummaryShort} /> : null}
                </View>
              </View>
              {withSelectionControl ? <SkeletonBlock style={styles.collectionSelectionSkeletonControl} /> : null}
            </View>
            {item < count - 1 ? <View style={styles.separator} /> : null}
          </View>
        );
      })}
    </View>
  );
}

export function CollectionRow({
  collectionListFade,
  item,
  onPress
}: {
  collectionListFade: Animated.Value;
  item: Collection;
  onPress: () => void;
}) {
  return (
    <Animated.View style={{ opacity: collectionListFade }}>
      <MotionPressable
        onPress={onPress}
        style={({ pressed }) => [styles.collectionRow, pressed && styles.captureRowPressed]}
        testID={`pc.collection.row.${item.id}`}
      >
        <View style={styles.collectionRowTop}>
          <View style={styles.collectionIconMark}>
            <Folder color={colors.collectionAccentText} size={18} weight="regular" />
          </View>
          <View style={styles.collectionRowCopy}>
            <Text numberOfLines={1} style={styles.captureTitle}>
              {item.title}
            </Text>
            <Text style={styles.meta}>
              {item.captureCount} captures
            </Text>
          </View>
        </View>
        <Text numberOfLines={2} style={styles.summaryPreview}>
          {item.description}
        </Text>
      </MotionPressable>
    </Animated.View>
  );
}

function collectionPreviewImageUrl(item: Collection["previewCaptures"][number]) {
  return String(item.imageAssetUrl || item.sourcePreviewAssetUrl || item.thumbnailUrl || "").trim();
}

function collectionPreviewSignature(collection: Collection) {
  return (collection.previewCaptures || []).map((item) => [
    item.id,
    collectionPreviewImageUrl(item),
    item.imageAssetCacheKey || "",
    item.sourcePreviewAssetCacheKey || "",
    item.title || "",
    item.sourceUrl || ""
  ].join("|")).join(";");
}

const CollectionCollageTile = memo(function CollectionCollageTile({
  item,
  onImageError,
  style
}: {
  item: Collection["previewCaptures"][number] | null;
  onImageError?: (imageUri: string) => void;
  style?: any;
}) {
  const imageUri = item ? collectionPreviewImageUrl(item) : "";
  const cacheKey = item?.imageAssetCacheKey || item?.sourcePreviewAssetCacheKey || imageUri;
  const host = hostFromUrl(item?.sourceUrl || "");
  const imageSource = useMemo(
    () => cacheKey ? { uri: imageUri, cacheKey } : { uri: imageUri },
    [cacheKey, imageUri]
  );
  if (imageUri) {
    const imageRenderKey = cacheKey || imageUri;
    return (
      <View style={[styles.collectionCollageTile, style]}>
        <Image
          accessibilityLabel={item?.title ? `Preview: ${item.title}` : "Collection preview"}
          cachePolicy="memory-disk"
          contentFit="cover"
          onError={() => onImageError?.(imageUri)}
          recyclingKey={imageRenderKey}
          source={imageSource}
          style={styles.collectionCollageImage}
        />
      </View>
    );
  }
  return (
    <View style={[styles.collectionCollageTile, styles.collectionCollageFallbackTile, style]}>
      {item ? (
        <>
          <ImageSquare color={colors.muted} size={24} weight="regular" />
          {host ? (
            <Text numberOfLines={1} style={styles.collectionCollageFallbackHost}>
              {host}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
});

export const CollectionCollage = memo(function CollectionCollage({ collection }: { collection: Collection }) {
  const [failedImageUris, setFailedImageUris] = useState<Set<string>>(() => new Set());
  const allSlots = useMemo(
    () => collectionCollageSlots(collection.previewCaptures || [], 4),
    [collection.previewCaptures]
  );
  const slots = useMemo(
    () => allSlots.filter((slot) => !failedImageUris.has(collectionPreviewImageUrl(slot))),
    [allSlots, failedImageUris]
  );
  const handleImageError = useCallback((imageUri: string) => {
    const trimmedUri = imageUri.trim();
    if (!trimmedUri) return;
    setFailedImageUris((current) => {
      if (current.has(trimmedUri)) return current;
      const next = new Set(current);
      next.add(trimmedUri);
      return next;
    });
  }, []);
  if (!slots.length) {
    return (
      <View
        accessibilityLabel={collection.captureCount > 0 ? "No collection thumbnails" : "Empty collection"}
        accessible
        style={[styles.collectionCollageFrame, styles.collectionCollageEmpty]}
      />
    );
  }
  if (slots.length === 1) {
    return (
      <View style={styles.collectionCollageFrame}>
        <CollectionCollageTile
          item={slots[0]}
          onImageError={handleImageError}
          style={styles.collectionCollageFillTile}
        />
      </View>
    );
  }
  if (slots.length === 2) {
    return (
      <View style={styles.collectionCollageFrame}>
        <View style={styles.collectionCollageRow}>
          <CollectionCollageTile
            item={slots[0]}
            onImageError={handleImageError}
            style={styles.collectionCollageHalfTile}
          />
          <CollectionCollageTile
            item={slots[1]}
            onImageError={handleImageError}
            style={styles.collectionCollageHalfTile}
          />
        </View>
      </View>
    );
  }
  if (slots.length === 3) {
    return (
      <View style={styles.collectionCollageFrame}>
        <View style={styles.collectionCollageRow}>
          <CollectionCollageTile
            item={slots[0]}
            onImageError={handleImageError}
            style={styles.collectionCollageLargeTile}
          />
          <View style={styles.collectionCollageStack}>
            <CollectionCollageTile
              item={slots[1]}
              onImageError={handleImageError}
              style={styles.collectionCollageStackTile}
            />
            <CollectionCollageTile
              item={slots[2]}
              onImageError={handleImageError}
              style={styles.collectionCollageStackTile}
            />
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.collectionCollageFrame}>
      <View style={styles.collectionCollageGrid}>
        {slots.map((slot) => (
          <CollectionCollageTile
            key={slot.id}
            item={slot}
            onImageError={handleImageError}
            style={styles.collectionCollageGridTile}
          />
        ))}
      </View>
    </View>
  );
}, (previous, next) => (
  previous.collection.id === next.collection.id &&
  previous.collection.captureCount === next.collection.captureCount &&
  collectionPreviewSignature(previous.collection) === collectionPreviewSignature(next.collection)
));

export function CollectionCard({
  item,
  motionEnabled,
  motionIndex = 0,
  justRestored = false,
  onPress
}: {
  collectionListFade: Animated.Value;
  item: Collection;
  motionEnabled: boolean;
  motionIndex?: number;
  justRestored?: boolean;
  onPress: () => void;
}) {
  // Entrance handling for this recycled FlashList grid:
  // - Normal mount (initial reveal): declarative `cardEntering` stagger.
  // - Undo-restore: an inserted card reuses a recycled cell rather than
  //   mounting, so declarative `entering` never fires and the card would snap
  //   in with no motion. Drive a fade+scale "pop" imperatively off the
  //   `justRestored` prop with `withTiming` — FlashList-proof and smooth even
  //   when the UI thread is idle. No `exiting`/`layout` (they cascaded janky on
  //   reflow), matching the home and collection-captures feeds.
  const restorePop = useSharedValue(justRestored ? 0 : 1);
  useEffect(() => {
    if (!justRestored) return;
    restorePop.value = 0;
    restorePop.value = withTiming(1, {
      duration: motionDuration.settle,
      easing: motionEasing.decelerate,
      reduceMotion: motionReduceMotion
    });
  }, [justRestored, restorePop]);
  const restoreStyle = useAnimatedStyle(() => {
    if (!justRestored) return {};
    return {
      opacity: restorePop.value,
      transform: [{ scale: 0.9 + restorePop.value * 0.1 }]
    };
  });

  return (
    <Reanimated.View
      entering={!justRestored && motionEnabled ? cardEntering(motionIndex) : undefined}
      style={[styles.collectionCardWrap, restoreStyle]}
    >
      <MotionPressable
        onPress={onPress}
        style={({ pressed }) => [styles.collectionCard, pressed && styles.collectionCardPressed]}
        testID={`pc.collection.card.${item.id}`}
      >
        <CollectionCollage collection={item} />
        <View style={styles.collectionCardCopy}>
          <Text numberOfLines={2} style={styles.collectionCardTitle}>
            {item.title}
          </Text>
          <Text numberOfLines={1} style={styles.collectionCardMeta}>
            {item.captureCount} {item.captureCount === 1 ? "capture" : "captures"}
          </Text>
        </View>
      </MotionPressable>
    </Reanimated.View>
  );
}

// A pending AI suggestion in the Collections tab. Marked as not-yet-real with a tonal accent
// fill and a Sparkle "Suggested" pill (no borders), with a single action to make it real.
export function CollectionSuggestionGridCard({
  item,
  busy = false,
  onPersist,
  onPress
}: {
  item: Collection;
  busy?: boolean;
  onPersist: () => void;
  onPress: () => void;
}) {
  return (
    <View style={styles.suggestionGridWrap}>
      <MotionPressable
        accessibilityLabel={`Open suggestion: ${item.title}`}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.collectionCard, styles.suggestionGridCard, pressed && styles.collectionCardPressed]}
        testID={`pc.collection.suggestion.open.${item.id}`}
      >
        <View>
          <CollectionCollage collection={item} />
          <View style={styles.suggestionGridBadge}>
            <Sparkle color={colors.accentTextStrong} size={12} weight="fill" />
            <Text style={styles.suggestionGridBadgeText}>Suggested</Text>
          </View>
        </View>
        <View style={styles.collectionCardCopy}>
          <Text numberOfLines={2} style={styles.collectionCardTitle}>
            {item.title}
          </Text>
          <Text numberOfLines={1} style={styles.collectionCardMeta}>
            {item.captureCount} {item.captureCount === 1 ? "capture" : "captures"}
          </Text>
        </View>
        <MotionPressable
          accessibilityLabel={`Add collection: ${item.title}`}
          accessibilityRole="button"
          disabled={busy}
          onPress={onPersist}
          style={({ pressed }) => [
            styles.suggestionGridAdd,
            busy && styles.suggestionDisabled,
            pressed && styles.subtlePressed
          ]}
          testID={`pc.collection.suggestion.persist.${item.id}`}
        >
          <Plus color={colors.onAccent} size={15} weight="bold" />
          <Text style={styles.suggestionGridAddText}>Add to collections</Text>
        </MotionPressable>
      </MotionPressable>
    </View>
  );
}
