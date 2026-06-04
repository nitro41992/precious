import { useEffect, useMemo, useState } from "react";
import { Animated, Easing } from "react-native";

import {
  capturesForListMode,
  displayStatus
} from "../captureLogic";
import {
  captureRowRevealKey,
  groupedCaptureRows,
  uniqueStrings
} from "../capturePresentation";
import type {
  Capture,
  HomeListRow,
  LoadPhase
} from "../types";

const PROCESSING_REFRESH_MS = 3000;
const RECENT_FEED_REVEAL_COUNT = 8;

function needsQuickLook(capture: Capture) {
  const status = displayStatus(capture);
  return status === "needs_review" || status === "failed";
}

export function useCaptureFeed({
  activeCapturesLoadedOnce,
  captureRowRevealStatesRef,
  captures,
  capturesError,
  capturesLoadPhase,
  capturesLoading,
  homeFeedReadyKey,
  homeRowsFade,
  loadCaptures,
  markCaptureRowsRevealed,
  setHomeFeedReadyKey
}: {
  activeCapturesLoadedOnce: boolean;
  captureRowRevealStatesRef: React.MutableRefObject<Record<string, boolean>>;
  captures: Capture[];
  capturesError: string;
  capturesLoadPhase: LoadPhase;
  capturesLoading: boolean;
  homeFeedReadyKey: string;
  homeRowsFade: Animated.Value;
  loadCaptures: () => Promise<void>;
  markCaptureRowsRevealed: (keys: string[]) => void;
  setHomeFeedReadyKey: (value: string) => void;
}) {
  const [homeColdSkeletonVisible, setHomeColdSkeletonVisible] = useState(false);
  const [homeReviewFilterActive, setHomeReviewFilterActive] = useState(false);
  const hasProcessingCapture = useMemo(
    () => captures.some((capture) => displayStatus(capture) === "processing"),
    [captures]
  );

  useEffect(() => {
    if (!hasProcessingCapture) return;
    const timer = setInterval(() => {
      void loadCaptures().catch(() => {
        // Keep foreground polling quiet; explicit loads still surface errors.
      });
    }, PROCESSING_REFRESH_MS);
    return () => clearInterval(timer);
  }, [hasProcessingCapture, loadCaptures]);

  const homeCaptures = useMemo(() => capturesForListMode(captures, "active"), [captures]);
  const homeRows = useMemo(() => groupedCaptureRows(homeCaptures), [homeCaptures]);
  const reviewQueueCaptures = useMemo(
    () => homeCaptures.filter(needsQuickLook),
    [homeCaptures]
  );
  const quickLookCount = reviewQueueCaptures.length;
  const visibleHomeCaptures = homeReviewFilterActive ? reviewQueueCaptures : homeCaptures;
  const visibleHomeRows = useMemo(() => groupedCaptureRows(visibleHomeCaptures), [visibleHomeCaptures]);
  const homeInitialLoading = (capturesLoadPhase === "cold" || capturesLoadPhase === "idle") &&
    !activeCapturesLoadedOnce &&
    !capturesError &&
    !homeRows.length;

  useEffect(() => {
    setHomeColdSkeletonVisible(homeInitialLoading);
  }, [homeInitialLoading]);

  useEffect(() => {
    if (!quickLookCount && homeReviewFilterActive) setHomeReviewFilterActive(false);
  }, [homeReviewFilterActive, quickLookCount]);

  const homeRevealCaptures = useMemo(
    () =>
      visibleHomeRows
        .flatMap((row) => row.type === "capture" ? [row.capture] : [])
        .slice(0, RECENT_FEED_REVEAL_COUNT),
    [visibleHomeRows]
  );
  const homeFeedRevealKey = useMemo(
    () =>
      homeRevealCaptures
        .map(captureRowRevealKey)
        .join("|"),
    [homeRevealCaptures]
  );
  const homeFeedRevealPending = Boolean(
    homeFeedRevealKey &&
      !homeFeedReadyKey &&
      capturesLoadPhase === "cold" &&
      capturesLoading &&
      !activeCapturesLoadedOnce
  );
  const visibleHomeCapturesForReveal = useMemo(
    () => visibleHomeCaptures,
    [visibleHomeCaptures]
  );

  useEffect(() => {
    if (capturesLoading && !activeCapturesLoadedOnce && !visibleHomeRows.length) {
      homeRowsFade.setValue(0);
      return;
    }
    if (!activeCapturesLoadedOnce && !visibleHomeRows.length) return;
    Animated.timing(homeRowsFade, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true
    }).start();
  }, [activeCapturesLoadedOnce, capturesLoading, homeRowsFade, visibleHomeRows.length]);

  useEffect(() => {
    const revealKeys = uniqueStrings(visibleHomeCapturesForReveal.map(captureRowRevealKey))
      .filter((key) => !captureRowRevealStatesRef.current[key]);
    if (!revealKeys.length) return;
    const timer = setTimeout(() => markCaptureRowsRevealed(revealKeys), 120);
    return () => clearTimeout(timer);
  }, [captureRowRevealStatesRef, markCaptureRowsRevealed, visibleHomeCapturesForReveal]);

  useEffect(() => {
    if (!homeFeedRevealKey) {
      if (homeFeedReadyKey) setHomeFeedReadyKey("");
      return;
    }
    if (homeFeedReadyKey) return;
    if (!activeCapturesLoadedOnce || capturesLoading) return;
    const revealKeys = uniqueStrings(homeRevealCaptures.map(captureRowRevealKey));
    const delay = 100;
    const timer = setTimeout(() => {
      markCaptureRowsRevealed(revealKeys);
      setHomeFeedReadyKey(homeFeedRevealKey);
    }, delay);
    return () => clearTimeout(timer);
  }, [
    activeCapturesLoadedOnce,
    capturesLoading,
    homeFeedReadyKey,
    homeFeedRevealKey,
    homeRevealCaptures,
    markCaptureRowsRevealed,
    setHomeFeedReadyKey
  ]);

  return {
    homeCaptures,
    homeColdSkeletonVisible,
    homeFeedRevealKey,
    homeFeedRevealPending,
    homeInitialLoading,
    homeReviewFilterActive,
    homeRows,
    quickLookCount,
    setHomeReviewFilterActive,
    visibleHomeCapturesForReveal,
    visibleHomeRows
  };
}
