import { useEffect, useMemo, useState } from "react";
import { Animated, Easing } from "react-native";

import {
  captureRowRevealKey,
  uniqueStrings
} from "../capturePresentation";
import type {
  Capture,
  Collection,
  CollectionCapturesLoadPhase,
  CollectionListMode,
  LoadPhase
} from "../types";

const RECENT_FEED_REVEAL_COUNT = 8;
const INITIAL_SKELETON_DELAY_MS = 180;

export function useCollectionsState({
  activeCollectionsCacheLength,
  collectionCaptures,
  collectionCapturesForId,
  collectionCapturesLoadPhase,
  collectionCapturesLoading,
  collectionFeedReadyKey,
  collectionListFade,
  collectionRowsFade,
  collections,
  collectionsLoadedOnce,
  collectionsLoadPhase,
  collectionsLoading,
  collectionsMode,
  markCaptureRowsRevealed,
  selectedCollection,
  selectedCollectionId,
  setCollectionFeedReadyKey,
  captureRowRevealStatesRef,
  visibleHomeCapturesForReveal
}: {
  activeCollectionsCacheLength: number;
  collectionCaptures: Capture[];
  collectionCapturesForId: string | null;
  collectionCapturesLoadPhase: CollectionCapturesLoadPhase;
  collectionCapturesLoading: boolean;
  collectionFeedReadyKey: string;
  collectionListFade: Animated.Value;
  collectionRowsFade: Animated.Value;
  collections: Collection[];
  collectionsLoadedOnce: Record<CollectionListMode, boolean>;
  collectionsLoadPhase: LoadPhase;
  collectionsLoading: boolean;
  collectionsMode: CollectionListMode;
  markCaptureRowsRevealed: (keys: string[]) => void;
  selectedCollection: Collection | null;
  selectedCollectionId: string | null;
  setCollectionFeedReadyKey: (value: string) => void;
  captureRowRevealStatesRef: React.MutableRefObject<Record<string, boolean>>;
  visibleHomeCapturesForReveal: Capture[];
}) {
  const [collectionsColdSkeletonVisible, setCollectionsColdSkeletonVisible] = useState(false);
  const [collectionCapturesColdSkeletonVisible, setCollectionCapturesColdSkeletonVisible] = useState(false);

  const collectionCapturesBlockingLoadingForReveal = Boolean(
    selectedCollectionId &&
      collectionCapturesLoading &&
      collectionCapturesLoadPhase !== "append"
  );
  const visibleCollectionCapturesForReveal = useMemo(
    () =>
      selectedCollectionId &&
      collectionCapturesForId === selectedCollectionId &&
      (!collectionCapturesBlockingLoadingForReveal || collectionCaptures.length)
        ? collectionCaptures
        : [],
    [
      collectionCaptures,
      collectionCapturesBlockingLoadingForReveal,
      collectionCapturesForId,
      selectedCollectionId
    ]
  );

  const collectionsColdLoading = collectionsLoadPhase === "cold" &&
    collectionsLoading &&
    !collectionsLoadedOnce[collectionsMode] &&
    !collections.length;
  const activeCollectionsColdLoading = collectionsLoadPhase === "cold" &&
    collectionsLoading &&
    !collectionsLoadedOnce.active &&
    !activeCollectionsCacheLength;

  useEffect(() => {
    if (!collectionsColdLoading && !activeCollectionsColdLoading) {
      setCollectionsColdSkeletonVisible(false);
      return;
    }
    const timer = setTimeout(() => setCollectionsColdSkeletonVisible(true), INITIAL_SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, [activeCollectionsColdLoading, collectionsColdLoading]);

  const collectionRevealCaptures = useMemo(
    () => visibleCollectionCapturesForReveal.slice(0, RECENT_FEED_REVEAL_COUNT),
    [visibleCollectionCapturesForReveal]
  );
  const collectionFeedRevealKey = useMemo(
    () =>
      selectedCollectionId
        ? `${selectedCollectionId}:${collectionRevealCaptures
            .map(captureRowRevealKey)
            .join("|")}`
        : "",
    [collectionRevealCaptures, selectedCollectionId]
  );
  const collectionFeedRevealPending = Boolean(
    collectionFeedRevealKey &&
      !collectionFeedReadyKey &&
      selectedCollectionId &&
      collectionCapturesLoading &&
      collectionCapturesLoadPhase === "initial" &&
      collectionCapturesForId !== selectedCollectionId
  );

  useEffect(() => {
    const blockingCollectionLoad = Boolean(
      selectedCollectionId &&
        collectionCapturesLoading &&
        collectionCapturesLoadPhase !== "append" &&
        (!collectionCaptures.length || collectionCapturesForId !== selectedCollectionId)
    );
    if (blockingCollectionLoad || (selectedCollectionId && collectionCapturesForId !== selectedCollectionId)) {
      collectionRowsFade.setValue(0);
      return;
    }
    if (!selectedCollectionId || collectionCapturesForId !== selectedCollectionId) return;
    Animated.timing(collectionRowsFade, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true
    }).start();
  }, [
    collectionCapturesForId,
    collectionCapturesLoadPhase,
    collectionCapturesLoading,
    collectionCaptures.length,
    collectionRowsFade,
    selectedCollectionId
  ]);

  useEffect(() => {
    const revealKeys = uniqueStrings([
      ...visibleHomeCapturesForReveal,
      ...visibleCollectionCapturesForReveal
    ].map(captureRowRevealKey))
      .filter((key) => !captureRowRevealStatesRef.current[key]);
    if (!revealKeys.length) return;
    const timer = setTimeout(() => markCaptureRowsRevealed(revealKeys), 120);
    return () => clearTimeout(timer);
  }, [
    captureRowRevealStatesRef,
    markCaptureRowsRevealed,
    visibleCollectionCapturesForReveal,
    visibleHomeCapturesForReveal
  ]);

  useEffect(() => {
    if (!collectionFeedRevealKey) {
      if (collectionFeedReadyKey) setCollectionFeedReadyKey("");
      return;
    }
    if (collectionFeedReadyKey) return;
    if (collectionCapturesLoading && collectionCapturesLoadPhase !== "append") return;
    const revealKeys = uniqueStrings(collectionRevealCaptures.map(captureRowRevealKey));
    const delay = 100;
    const timer = setTimeout(() => {
      markCaptureRowsRevealed(revealKeys);
      setCollectionFeedReadyKey(collectionFeedRevealKey);
    }, delay);
    return () => clearTimeout(timer);
  }, [
    collectionCapturesLoadPhase,
    collectionCapturesLoading,
    collectionFeedReadyKey,
    collectionFeedRevealKey,
    collectionRevealCaptures,
    markCaptureRowsRevealed,
    setCollectionFeedReadyKey
  ]);

  useEffect(() => {
    if (collectionsColdLoading || (activeCollectionsColdLoading && !collections.length)) {
      collectionListFade.setValue(0);
      return;
    }
    Animated.timing(collectionListFade, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true
    }).start();
  }, [activeCollectionsColdLoading, collectionListFade, collections.length, collectionsColdLoading]);

  const collectionCapturesColdLoading = Boolean(
    selectedCollectionId &&
      selectedCollection?.status === "active" &&
      selectedCollection.captureCount !== 0 &&
      collectionCapturesLoading &&
      collectionCapturesLoadPhase === "initial" &&
      collectionCapturesForId !== selectedCollectionId
  );

  useEffect(() => {
    if (!collectionCapturesColdLoading) {
      setCollectionCapturesColdSkeletonVisible(false);
      return;
    }
    const timer = setTimeout(() => setCollectionCapturesColdSkeletonVisible(true), INITIAL_SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, [collectionCapturesColdLoading]);

  return {
    activeCollectionsColdLoading,
    collectionCapturesColdLoading,
    collectionCapturesColdSkeletonVisible,
    collectionFeedRevealKey,
    collectionFeedRevealPending,
    collectionsColdLoading,
    collectionsColdSkeletonVisible,
    visibleCollectionCapturesForReveal
  };
}
