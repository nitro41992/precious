import { memo, useCallback, useMemo, useState, type ReactElement } from "react";
import { Animated, Pressable, View } from "react-native";
import { Image } from "expo-image";
import { CalendarBlank, Folder, ImageSquare, Lightbulb } from "phosphor-react-native";
import Reanimated from "react-native-reanimated";

import { collectionCollageSlots, hostFromUrl } from "../captureLogic";
import type { Capture, CaptureImageLoadState, Collection } from "../types";
import {
  captureDisplayTitle,
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
import { CollectionMeaningToken, MeaningToken, SkeletonRevealFrame, SourceMark, StatusGlyph } from "./components";
import { cardEntering, cardExiting, cardLayout } from "./motion";
import { Text } from "./typography";

type SkeletonBlockRenderer = ({ style }: { style?: any }) => ReactElement;

type CaptureRowProps = {
  captureImageLoadStates: Record<string, CaptureImageLoadState>;
  captureRowRevealStates: Record<string, boolean>;
  deferFallbackIcon?: boolean;
  deferMediaUntilLoaded?: boolean;
  failedFavicons: Record<string, boolean>;
  forceSkeleton?: boolean;
  hideThumbnail?: boolean;
  item: Capture;
  matchReason?: string;
  onFaviconFailure: (host: string) => void;
  onImageLoadState: (key: string, state: CaptureImageLoadState) => void;
  onPress: () => void;
  renderInlineSkeleton: () => ReactElement | null;
  showCollectionToken?: boolean;
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
  hideThumbnail = false,
  item,
  matchReason,
  onFaviconFailure,
  onImageLoadState,
  onPress,
  renderInlineSkeleton,
  showCollectionToken = true,
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
  const hasMeaningTokens = Boolean(
    intentLabel ||
      reminderText ||
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
      onImageLoadState={onImageLoadState}
    />
  );
  const row = (
    <Pressable
      onPress={onPress}
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
            {reminderText ? (
              <MeaningToken Icon={CalendarBlank} text={reminderText} />
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
  if (!deferMediaUntilLoaded) return row;
  return (
    <SkeletonRevealFrame pending={deferRowUntilImageReady} skeleton={renderInlineSkeleton()}>
      {row}
    </SkeletonRevealFrame>
  );
}

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
    <View key={keyValue} style={withRemoveAction ? styles.collectionCaptureSkeletonRow : styles.captureSkeletonRow}>
      <View style={styles.collectionCaptureSkeletonMain}>
        <SkeletonBlock style={styles.loadingThumbnailMark} />
        <View style={styles.collectionCaptureSkeletonCopy}>
          <SkeletonBlock style={styles.collectionLoadingTitle} />
          <SkeletonBlock style={styles.collectionLoadingLine} />
          <SkeletonBlock style={styles.collectionLoadingLineShort} />
          <SkeletonBlock style={styles.collectionLoadingToken} />
        </View>
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
      <Pressable
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
      </Pressable>
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
    const imageRenderKey = cacheKey ? `${cacheKey}:${imageUri}` : imageUri;
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
  onPress
}: {
  collectionListFade: Animated.Value;
  item: Collection;
  motionEnabled: boolean;
  onPress: () => void;
}) {
  return (
    <Reanimated.View
      entering={motionEnabled ? cardEntering : undefined}
      exiting={motionEnabled ? cardExiting : undefined}
      layout={motionEnabled ? cardLayout : undefined}
      style={styles.collectionCardWrap}
    >
      <Pressable
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
      </Pressable>
    </Reanimated.View>
  );
}
