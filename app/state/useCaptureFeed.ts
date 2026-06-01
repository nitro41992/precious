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
const INITIAL_SKELETON_DELAY_MS = 180;

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
  const homeInitialLoading = (capturesLoadPhase === "cold" || capturesLoadPhase === "idle") &&
    !activeCapturesLoadedOnce &&
    !capturesError &&
    !homeRows.length;
  const visibleHomeRows: HomeListRow[] = homeRows;

  useEffect(() => {
    if (!homeInitialLoading) {
      setHomeColdSkeletonVisible(false);
      return;
    }
    const timer = setTimeout(() => setHomeColdSkeletonVisible(true), INITIAL_SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, [homeInitialLoading]);

  const homeRevealCaptures = useMemo(
    () =>
      homeRows
        .flatMap((row) => row.type === "capture" ? [row.capture] : [])
        .slice(0, RECENT_FEED_REVEAL_COUNT),
    [homeRows]
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
    () => homeCaptures,
    [homeCaptures]
  );
  const quickLookCount = useMemo(
    () => homeCaptures.filter((capture) => displayStatus(capture) === "needs_review" || displayStatus(capture) === "failed").length,
    [homeCaptures]
  );

  useEffect(() => {
    if (capturesLoading && !activeCapturesLoadedOnce && !homeRows.length) {
      homeRowsFade.setValue(0);
      return;
    }
    if (!activeCapturesLoadedOnce && !homeRows.length) return;
    Animated.timing(homeRowsFade, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true
    }).start();
  }, [activeCapturesLoadedOnce, capturesLoading, homeRows.length, homeRowsFade]);

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
    homeRows,
    quickLookCount,
    visibleHomeCapturesForReveal,
    visibleHomeRows
  };
}
