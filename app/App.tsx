import "react-native-url-polyfill/auto";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Dimensions,
  Easing,
  Keyboard,
  Linking,
  Platform,
  StatusBar,
  View,
  useWindowDimensions
} from "react-native";
import type { FlatList, TextInput } from "react-native";
import { Image } from "expo-image";
import Reanimated, {
  Easing as ReanimatedEasing,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";

import { AppSheets } from "./sheets/AppSheets";
import { CollectionComposerSheet } from "./sheets/CollectionComposerSheet";
import { CollectionSelectorSheet } from "./sheets/CollectionSelectorSheet";
import { useAppUiEffects } from "./state/useAppUiEffects";
import { useAuthSession } from "./state/useAuthSession";
import { useCaptureFeed } from "./state/useCaptureFeed";
import { useCaptureReview } from "./state/useCaptureReview";
import { useCaptureSearch } from "./state/useCaptureSearch";
import { useCollectionsState } from "./state/useCollections";
import { createAppRenderHelpers } from "./ui/renderHelpers";
import { motionEasing, motionPaneTransition, motionReduceMotion, reviewHeroExpandedScale } from "./ui/motion";
import { styles } from "./ui/styles";
import { appTheme } from "./ui/theme";

import type {
  Capture,
  CaptureComposerMode,
  CaptureImageLoadState,
  CaptureListMode,
  CaptureReviewDraft,
  Collection,
  CollectionCapturesLoadPhase,
  CollectionDraftAction,
  CollectionListMode,
  LinkedCollection,
  LoadPhase,
  NoteSaveState,
  RemoteCaptureDetail,
  RemoteCapturePage,
  RemoteCollectionPage,
  ReminderDraftAction,
  ReminderScheduleDraft,
  ToastState,
} from "./types";
import { DEFAULT_CAPTURE_COMPOSER_MODE } from "./types";
import {
  nativeClipboard,
  nativeStore,
  requestJson
} from "./nativeBridge";

import {
  authCallbackPayload,
  captureDraftKey,
  captureImageCacheKey,
  captureImageLoadKey,
  captureImageUrl,
  cleanedReviewDraft,
  friendlyError,
  isCaptureImageCancel,
  normalizeIntent,
  reminderSuggestionFromSchedule,
  uniqueCaptures,
  uniqueCollections
} from "./capturePresentation";

import {
  CAPTURE_PAGE_SIZE,
  COLLECTION_CAPTURE_PAGE_SIZE,
  cachedCapturePageFromRaw,
  cachedCollectionPageFromRaw,
  captureBelongsToCollection,
  captureDetailUrl,
  captureFromRemote,
  captureListUrl,
  captureMutationUrl,
  collectionFromRemote,
  collectionLinkTimestamp,
  edgeResourceUrl,
  freshLocalProcessingCaptures,
  isFreshLocalProcessingCapture,
  sortCollectionCaptures
} from "./remoteData";
import { AuthScreen } from "./screens/AuthScreen";
import { CaptureReviewScreen } from "./screens/CaptureReviewScreen";
import { CollectionDetailScreen } from "./screens/CollectionDetailScreen";
import { CollectionSearchScreen } from "./screens/CollectionSearchScreen";
import { CollectionsScreen } from "./screens/CollectionsScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { SearchScreen } from "./screens/SearchScreen";

import type { MapSearchCandidate } from "./captureLogic";
import {
  captureIdentityAliases,
  captureIntentPatchBody,
  collectionSelectionActionState,
  capturesForListMode,
  extractHttpUrl,
  isDeleted,
  mergeRemoteCaptures,
  normalizeCaptureLink,
  parseCaptureUrl,
  preserveCaptureRowIdentities,
  reviewTargetsForCapture,
  sortCaptures
} from "./captureLogic";

const TOAST_DEFAULT_MS = 2500;
const DELETE_UNDO_MS = 6000;
const CAPTURES_FRESH_MS = 30_000;
const REVIEW_HANDOFF_OPEN_MS = 220;
const REVIEW_HANDOFF_CLOSE_MS = 180;

type ReviewHandoffRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
};

// Which list the morph flies from/to. Home, collection detail, and search can
// show the same capture at once, so thumbnail refs are registered per surface
// and the handoff resolves its source through its own surface only.
type ReviewHandoffSurface = "home" | "collection" | "search";

type ReviewHandoffState = {
  cacheKey: string;
  // The processing poll can swap a capture's local id for its remote id
  // mid-session; everything that has to find this capture again (the
  // selected-capture match, the thumbnail ref) must go through aliases.
  captureAliases: string[];
  captureId: string;
  direction: "opening" | "closing";
  from: ReviewHandoffRect;
  // The hero image's scale at the review end of the morph. Opening always
  // lands at the expanded scale (scroll resets per mount); closing starts
  // from whatever scale the scroll-driven collapse left the hero at.
  heroScale: number;
  imageUrl: string;
  key: number;
  returnCollectionId: string | null;
  sourceSurface: ReviewHandoffSurface;
};

function reviewHeroTargetRect(windowWidth: number): ReviewHandoffRect {
  const statusInset = Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0;
  const baseHeight = Math.min(520, Math.max(360, windowWidth * 1.18));
  return {
    x: 8,
    y: statusInset + 8,
    width: Math.max(1, windowWidth - 16),
    height: Math.max(220, baseHeight - 16),
    radius: 18
  };
}

function ReviewHandoffOverlay({
  arrived,
  cancelled,
  copyReady,
  handoff,
  heroReady,
  onCopyShown,
  onDone,
  progress,
  target
}: {
  arrived: SharedValue<boolean>;
  cancelled: SharedValue<boolean>;
  copyReady: SharedValue<boolean>;
  handoff: ReviewHandoffState;
  heroReady: SharedValue<boolean>;
  onCopyShown: (key: number) => void;
  onDone: (key: number) => void;
  progress: SharedValue<number>;
  target: SharedValue<ReviewHandoffRect | null>;
}) {
  const direction = handoff.direction;
  const handoffKey = handoff.key;
  const morphDuration = direction === "closing" ? REVIEW_HANDOFF_CLOSE_MS : REVIEW_HANDOFF_OPEN_MS;

  // The whole sequence runs on the UI thread; React is only involved at
  // handoff start and at onDone. Start the morph the moment the target rect
  // lands; later refinements retarget the in-flight interpolation.
  useAnimatedReaction(
    () => Boolean(target.value) && copyReady.value,
    (hasTarget, hadTarget) => {
      if (!hasTarget || hadTarget || cancelled.value) return;
      progress.value = 0;
      // Closing lands with out-quart: the emphasized bezier's deceleration
      // tail spends its last ~50ms visibly creeping the final few pixels
      // into the thumbnail slot, which reads as the image "settling" after
      // the animation already ended. Out-quart front-loads the travel and
      // its terminal creep stays under a pixel — the landing is final.
      progress.value = withTiming(
        1,
        {
          duration: morphDuration,
          easing:
            direction === "closing"
              ? ReanimatedEasing.out(ReanimatedEasing.poly(4))
              : ReanimatedEasing.bezier(0.2, 0, 0, 1),
          reduceMotion: motionReduceMotion
        },
        (finished) => {
          if (finished) arrived.value = true;
        }
      );
    },
    [direction, handoffKey, morphDuration]
  );

  // Resolve with an ATOMIC same-frame swap, never a crossfade: dissolving
  // between two copies of the same pixels dips to ~75% combined opacity at
  // the midpoint and lets the background shimmer through — that dip IS a
  // flicker. The copy and its counterpart (hero / thumbnail) are pixel-
  // identical by construction (pinned source, decode parity, measured rect),
  // so flipping `fade` to 0 swaps them invisibly: the overlay's opacity and
  // the hero's reveal both read `fade` and flip on the same UI frame.
  useAnimatedReaction(
    () => arrived.value && (direction === "closing" || heroReady.value),
    (resolve, wasResolving) => {
      if (!resolve || wasResolving) return;
      // Both directions hand over via the finish COMMIT: Fabric commits are
      // atomic, so unmounting the copy while the content beneath it unhides
      // (hero on open, thumbnail on close) is a guaranteed same-frame swap —
      // no cross-component shared-value wiring (which proved unreliable) and
      // no setNativeProps racing the commit.
      runOnJS(onDone)(handoffKey);
    },
    [direction, handoffKey, onDone]
  );

  const animatedStyle = useAnimatedStyle(() => {
    const value = progress.value;
    const to = target.value || handoff.from;
    return {
      borderRadius: interpolate(value, [0, 1], [handoff.from.radius, to.radius]),
      height: interpolate(value, [0, 1], [handoff.from.height, to.height]),
      left: interpolate(value, [0, 1], [handoff.from.x, to.x]),
      top: interpolate(value, [0, 1], [handoff.from.y, to.y]),
      width: interpolate(value, [0, 1], [handoff.from.width, to.width])
    };
  });

  const imageAnimatedStyle = useAnimatedStyle(() => {
    const fromScale = handoff.direction === "closing" ? handoff.heroScale : 1;
    const toScale = handoff.direction === "closing" ? 1 : handoff.heroScale;
    return {
      transform: [
        {
          scale: interpolate(progress.value, [0, 1], [fromScale, toScale])
        }
      ]
    };
  });

  const source = handoff.cacheKey
    ? { uri: handoff.imageUrl, cacheKey: handoff.cacheKey }
    : { uri: handoff.imageUrl };

  return (
    <Reanimated.View
      pointerEvents="none"
      style={[
        styles.reviewHandoffOverlay,
        {
          height: handoff.from.height,
          left: handoff.from.x,
          top: handoff.from.y,
          width: handoff.from.width
        },
        animatedStyle
      ]}
    >
      <Reanimated.View style={[styles.reviewHandoffImage, imageAnimatedStyle]}>
        <Image
          allowDownscaling={false}
          cachePolicy="memory-disk"
          contentFit="cover"
          onDisplay={() => onCopyShown(handoff.key)}
          onError={() => onCopyShown(handoff.key)}
          recyclingKey={`${handoff.captureId}:${handoff.cacheKey || handoff.imageUrl}`}
          source={source}
          style={styles.reviewHandoffImage}
        />
      </Reanimated.View>
    </Reanimated.View>
  );
}

function ScreenOverlayFrame({
  children,
  handoff,
  progress
}: {
  children: ReactNode;
  handoff: ReviewHandoffState | null;
  progress: SharedValue<number>;
}) {
  const handoffDirection = handoff?.direction ?? null;

  // The frame reads the same progress value that drives the hero morph, so
  // the screen fade stays locked in parallel with the image handoff. Fade
  // only — translating the frame would shift the hero away from the rect the
  // morph measured, making the image land off-target.
  const animatedStyle = useAnimatedStyle(() => {
    if (!handoffDirection) {
      return { opacity: 1 };
    }
    return {
      opacity: handoffDirection === "opening" ? progress.value : 1 - progress.value
    };
  });

  // The animated style is attached ONLY while a handoff is in flight. The
  // worklet-driven opacity lives on the UI thread; the COMMITTED opacity is
  // whatever the frame mounted with (0 — the open morph's takeoff frame).
  // Android can detach and re-attach the React surface while the app is
  // backgrounded (leave via an external link, return through the app
  // switcher), and the re-mount restores committed props: the screen came
  // back alpha-0 yet still owned every touch. Steady-state visibility must
  // be a committed prop, so the resting frame swaps to a plain opacity 1.
  return (
    <Reanimated.View
      pointerEvents={handoff ? "none" : "auto"}
      style={[styles.screenOverlay, handoff ? animatedStyle : styles.screenOverlayResting]}
    >
      {children}
    </Reanimated.View>
  );
}

function TopLevelPane({
  active,
  children,
  direction
}: {
  active: boolean;
  children: ReactNode;
  direction: -1 | 1;
}) {
  const progress = useSharedValue(active ? 1 : 0);
  // The worklet style drives the pane only while a transition is in flight. At
  // rest we drop it so the committed opacity in topLevelPaneActive/Hidden is the
  // sole source: Android re-attaches the surface on background→resume and
  // restores committed props, and a worklet-only opacity comes back as its stale
  // alpha-0 snapshot — an invisible pane that still owns every touch (the same
  // re-attach failure ScreenOverlayFrame documents).
  const [animating, setAnimating] = useState(false);
  const prevActiveRef = useRef(active);
  const everMountedRef = useRef(false);
  // Flip the flag in the same render the active prop changes (not an effect
  // later) so the worklet style is attached before the first painted frame —
  // otherwise the pane flashes the committed target opacity for one frame.
  if (prevActiveRef.current !== active) {
    prevActiveRef.current = active;
    if (!animating) setAnimating(true);
  }

  useEffect(() => {
    // The initial tab rests immediately — no enter flight for the pane that
    // mounts already on screen.
    if (!everMountedRef.current) {
      everMountedRef.current = true;
      progress.value = active ? 1 : 0;
      return;
    }
    // Shared-axis X: the incoming pane decelerates in from its directional
    // offset while the outgoing one accelerates away — the two read as one
    // surface sliding along a shared horizontal axis rather than a flat fade.
    progress.value = withTiming(
      active ? 1 : 0,
      {
        duration: active ? motionPaneTransition.in : motionPaneTransition.out,
        easing: active ? motionEasing.decelerate : motionEasing.accelerate,
        reduceMotion: motionReduceMotion
      },
      (finished) => {
        if (finished) runOnJS(setAnimating)(false);
      }
    );
  }, [active, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const value = progress.value;
    return {
      opacity: interpolate(value, [0, 1], [0, 1]),
      transform: [
        { translateX: interpolate(value, [0, 1], [direction * motionPaneTransition.enterOffset, 0]) },
        { scale: interpolate(value, [0, 1], [0.985, 1]) }
      ]
    };
  });

  return (
    <Reanimated.View
      pointerEvents={active ? "auto" : "none"}
      style={[
        styles.topLevelPane,
        active ? styles.topLevelPaneActive : styles.topLevelPaneHidden,
        animating && animatedStyle
      ]}
    >
      {children}
    </Reanimated.View>
  );
}

// The collection detail's pane transition. The progress shared value lives in
// App so it survives the render-branch swap from "open" to "closing": the
// closing frame picks up the morph from wherever the value sits instead of
// re-popping. Unmount is deferred until the exit lands — onClosed fires from
// the UI thread at progress 0, so the screen leaves the tree in one commit
// while fully invisible (no orphaned row snapshots, no visible re-layout).
function CollectionDetailFrame({
  children,
  direction,
  onClosed,
  onOpened,
  progress
}: {
  children: ReactNode;
  direction: "opening" | "closing";
  onClosed: () => void;
  onOpened: () => void;
  progress: SharedValue<number>;
}) {
  const everMountedRef = useRef(false);
  // The worklet style drives the frame only mid-flight. Once the open lands it
  // rests on committed opacity (screenOverlayResting): the frame's opacity is
  // otherwise worklet-only, so a background→resume surface re-attach restores it
  // as a stale alpha-0 snapshot — an invisible detail page that still owns every
  // touch (the re-attach failure ScreenOverlayFrame documents). The opened
  // plateau is always direction "opening"; closing animates straight to unmount.
  const [animating, setAnimating] = useState(true);
  const prevDirectionRef = useRef(direction);
  // A reopen that interrupts a closing flight flips direction on the already
  // mounted frame — re-arm the worklet in the same render so the reverse flight
  // is driven instead of resting on a stale committed opacity.
  if (prevDirectionRef.current !== direction) {
    prevDirectionRef.current = direction;
    if (!animating) setAnimating(true);
  }

  useEffect(() => {
    if (direction === "opening") {
      // Fresh mounts enter from invisible; a reopen that interrupts a closing
      // flight (frame already mounted) animates up from wherever it is.
      if (!everMountedRef.current) {
        progress.value = 0;
      }
      progress.value = withTiming(
        1,
        {
          duration: motionPaneTransition.in,
          easing: motionEasing.decelerate,
          reduceMotion: motionReduceMotion
        },
        (finished) => {
          if (finished) {
            runOnJS(onOpened)();
            runOnJS(setAnimating)(false);
          }
        }
      );
    } else {
      progress.value = withTiming(
        0,
        {
          duration: motionPaneTransition.out,
          easing: motionEasing.accelerate,
          reduceMotion: motionReduceMotion
        },
        (finished) => {
          if (finished) runOnJS(onClosed)();
        }
      );
    }
    everMountedRef.current = true;
  }, [direction, onClosed, onOpened, progress]);

  // Shared-axis Z: the detail page rises forward from a slightly inset scale
  // while sliding in, so opening a collection reads as moving deeper into the
  // app rather than a sideways swap.
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [motionPaneTransition.enterOffset, 0]) },
      { scale: interpolate(progress.value, [0, 1], [motionPaneTransition.overlayEnterScale, 1]) }
    ]
  }));

  return (
    <Reanimated.View
      pointerEvents={direction === "closing" ? "none" : "auto"}
      style={[styles.screenOverlay, animating ? animatedStyle : styles.screenOverlayResting]}
    >
      {children}
    </Reanimated.View>
  );
}

const CAPTURE_LIST_PERF_PROPS = {
  initialNumToRender: 8,
  maxToRenderPerBatch: 8,
  // Clipping detaches/reattaches row views during scroll on Android, which
  // blanks images mid-scroll and breaks thumbnail measurement for taps that
  // land while the list settles. Rows are memoized; keeping them attached is
  // cheaper than the churn.
  removeClippedSubviews: false,
  showsHorizontalScrollIndicator: false,
  showsVerticalScrollIndicator: false,
  updateCellsBatchingPeriod: 40,
  windowSize: 9
};
const COLLECTION_LIST_PERF_PROPS = {
  initialNumToRender: 12,
  maxToRenderPerBatch: 12,
  removeClippedSubviews: false,
  showsHorizontalScrollIndicator: false,
  showsVerticalScrollIndicator: false,
  updateCellsBatchingPeriod: 40,
  windowSize: 7
};
// Same render profile as the home feed: a small first batch paints the
// visible rows immediately and the rest stream in, instead of blocking the
// JS thread on a full 18-row page (which made entering a >6-capture
// collection visibly stall).
const COLLECTION_CAPTURE_LIST_PERF_PROPS = {
  initialNumToRender: 8,
  maxToRenderPerBatch: 8,
  removeClippedSubviews: false,
  showsHorizontalScrollIndicator: false,
  showsVerticalScrollIndicator: false,
  updateCellsBatchingPeriod: 40,
  windowSize: 9
};
const COLLECTION_CAPTURE_PREFETCH_LIMIT = 8;

function scheduleIdleTask(task: () => void) {
  const idleScheduler = (globalThis as typeof globalThis & {
    requestIdleCallback?: (callback: () => void) => number;
    cancelIdleCallback?: (handle: number) => void;
  }).requestIdleCallback;
  const idleCanceler = (globalThis as typeof globalThis & {
    cancelIdleCallback?: (handle: number) => void;
  }).cancelIdleCallback;
  if (idleScheduler) {
    const handle = idleScheduler(task);
    return () => idleCanceler?.(handle);
  }
  const handle = setTimeout(task, 80);
  return () => clearTimeout(handle);
}

function prefetchImageUrls(urls: string[]) {
  const unique = Array.from(new Set(urls.map((url) => String(url || "").trim()).filter(Boolean)));
  if (!unique.length) return;
  void Image.prefetch(unique.slice(0, 16), "memory-disk").catch(() => {
    // Prefetch is opportunistic; normal image rendering still handles failures.
  });
}

function pendingDecisionLinkedCollections(capture: Capture): LinkedCollection[] {
  const linkedIds = new Set((capture.linkedCollections || []).map((collection) => collection.id));
  const next: LinkedCollection[] = [];
  for (const decision of capture.collectionDecisions || []) {
    if (decision.type !== "existing" || !decision.collectionId || linkedIds.has(decision.collectionId)) continue;
    const title = decision.title.trim();
    if (!title) continue;
    linkedIds.add(decision.collectionId);
    next.push({
      id: decision.collectionId,
      title,
      description: decision.description || undefined,
      createdBy: "analysis",
      rationale: decision.rationale || null,
      confidence: Number.isFinite(decision.confidence) ? decision.confidence : null,
      linkedAt: Date.now()
    });
  }
  return next;
}

function hasPendingCollectionDecision(capture: Capture) {
  return pendingDecisionLinkedCollections(capture).length > 0;
}

function searchableCollectionText(collection: Collection) {
  return [collection.title, collection.description]
    .filter(Boolean)
    .map(String)
    .join(" ")
    .toLowerCase();
}

function confirmedLinkedCollectionsForCapture(capture: Capture): LinkedCollection[] {
  if (!reviewTargetsForCapture(capture).includes("collections")) {
    return capture.linkedCollections || [];
  }
  return (capture.linkedCollections || []).filter((collection) => collection.createdBy !== "analysis");
}

export default function App() {
  const { height: windowHeight } = useWindowDimensions();
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [archivedCaptures, setArchivedCaptures] = useState<Capture[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [captureReturnCollectionId, setCaptureReturnCollectionId] = useState<string | null>(null);
  const [captureReviewOrigin, setCaptureReviewOrigin] = useState<"recent" | "collection" | "search" | "other" | null>(null);
  const [capturesLoading, setCapturesLoading] = useState(false);
  const [capturesLoadPhase, setCapturesLoadPhase] = useState<LoadPhase>("idle");
  const [capturesError, setCapturesError] = useState("");
  const [activeCapturesLoadedOnce, setActiveCapturesLoadedOnce] = useState(false);
  const [activeCaptureTotalCount, setActiveCaptureTotalCount] = useState<number | null>(null);
  const [archivedCapturesLoading, setArchivedCapturesLoading] = useState(false);
  const [, setArchivedCapturesLoadPhase] = useState<LoadPhase>("idle");
  const [archivedCapturesError, setArchivedCapturesError] = useState("");
  const [archivedCapturesLoaded, setArchivedCapturesLoaded] = useState(false);
  const [capturesNextCursor, setCapturesNextCursor] = useState<string | null>(null);
  const [archivedCapturesNextCursor, setArchivedCapturesNextCursor] = useState<string | null>(null);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [collectionSearchOpen, setCollectionSearchOpen] = useState(false);
  const [collectionSearchQuery, setCollectionSearchQuery] = useState("");
  const [collectionsMode, setCollectionsMode] = useState<CollectionListMode>("active");
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectionsLoadPhase, setCollectionsLoadPhase] = useState<LoadPhase>("idle");
  const [collectionsError, setCollectionsError] = useState("");
  const [collectionsLoadedOnce, setCollectionsLoadedOnce] = useState<Record<CollectionListMode, boolean>>({
    active: false,
    archived: false
  });
  const [collectionsNextCursor, setCollectionsNextCursor] = useState<Record<CollectionListMode, string | null>>({
    active: null,
    archived: null
  });
  const [collectionCaptures, setCollectionCaptures] = useState<Capture[]>([]);
  const [collectionCapturesForId, setCollectionCapturesForId] = useState<string | null>(null);
  const [collectionCapturesLoading, setCollectionCapturesLoading] = useState(false);
  const [collectionCapturesLoadPhase, setCollectionCapturesLoadPhase] = useState<CollectionCapturesLoadPhase>("idle");
  const [collectionCapturesError, setCollectionCapturesError] = useState("");
  const [collectionCapturesNextCursor, setCollectionCapturesNextCursor] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [draftIntent, setDraftIntent] = useState("");
  const [quickIntentOpen, setQuickIntentOpen] = useState(false);
  const [reminderDrafts, setReminderDrafts] = useState<Record<string, ReminderDraftAction>>({});
  const [collectionDrafts, setCollectionDrafts] = useState<Record<string, CollectionDraftAction>>({});
  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);
  const [collectionPickerQuery, setCollectionPickerQuery] = useState("");
  const [collectionSelectionIds, setCollectionSelectionIds] = useState<string[]>([]);
  const [collectionChoiceSaving, setCollectionChoiceSaving] = useState<string | null>(null);
  const [reviewDraftsByCapture, setReviewDraftsByCapture] = useState<Record<string, CaptureReviewDraft>>({});
  const [reviewDraftsLoaded, setReviewDraftsLoaded] = useState(false);
  const [noteSaveState, setNoteSaveState] = useState<NoteSaveState>("idle");
  const [collectionTitle, setCollectionTitle] = useState("");
  const [collectionDescription, setCollectionDescription] = useState("");
  const [collectionDraftDirty, setCollectionDraftDirty] = useState(false);
  const [showCollectionForm, setShowCollectionForm] = useState(false);
  const [draftTitleDirty, setDraftTitleDirty] = useState(false);
  const [draftNoteDirty, setDraftNoteDirty] = useState(false);
  const [draftIntentDirty, setDraftIntentDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [sourceDraft, setSourceDraft] = useState("");
  const [captureMode, setCaptureMode] = useState<CaptureComposerMode>(DEFAULT_CAPTURE_COMPOSER_MODE);
  const [showCaptureComposer, setShowCaptureComposer] = useState(false);
  const [captureComposerClosing, setCaptureComposerClosing] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [noteSheetOpen, setNoteSheetOpen] = useState(false);
  const [titleSheetOpen, setTitleSheetOpen] = useState(false);
  const [reminderSheetOpen, setReminderSheetOpen] = useState(false);
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [faviconFailures, setFaviconFailures] = useState<Record<string, boolean>>({});
  const [savingCapture, setSavingCapture] = useState(false);
  const [pickingCaptureImage, setPickingCaptureImage] = useState(false);
  const [captureImageLoadStates, setCaptureImageLoadStates] = useState<Record<string, CaptureImageLoadState>>({});
  const [captureRowRevealStates, setCaptureRowRevealStates] = useState<Record<string, boolean>>({});
  const [homeFeedReadyKey, setHomeFeedReadyKey] = useState("");
  const [collectionFeedReadyKey, setCollectionFeedReadyKey] = useState("");
  const [reviewHandoff, setReviewHandoff] = useState<ReviewHandoffState | null>(null);
  // Set once the morph copy's image has actually displayed: only then may
  // the content beneath it (origin thumbnail, closing hero) be hidden —
  // hiding earlier flashes the slot empty while the copy is still blank.
  const [reviewHandoffCopyShownKey, setReviewHandoffCopyShownKey] = useState<number | null>(null);
  const [closingReviewCapture, setClosingReviewCapture] = useState<Capture | null>(null);
  // Frozen snapshot of the collection whose detail screen is animating out.
  // Keeps the screen mounted (and pixel-stable) through the exit flight;
  // cleared in one commit once the pane lands at opacity 0.
  const [closingCollectionDetail, setClosingCollectionDetail] = useState<Collection | null>(null);
  // True from the open tap until the enter flight lands: the collections
  // pane's chrome stays mounted while the detail is semi-transparent, exactly
  // like the review handoff keeps pane chrome alive during its flights.
  const [collectionDetailEntering, setCollectionDetailEntering] = useState(false);
  const collectionDetailClosingRef = useRef(false);
  const selectedCollectionRef = useRef<Collection | null>(null);
  // The search screen stays mounted beneath a review opened from search so the
  // close morph can measure the live row; read imperatively in the close path
  // to avoid stale-closure churn (mirrors selectedCollectionRef).
  const searchOpenRef = useRef(false);
  const latestNoteRef = useRef("");
  const capturesRef = useRef<Capture[]>([]);
  const activeCapturesFetchedAtRef = useRef(0);
  const archivedCapturesRef = useRef<Capture[]>([]);
  const activeCapturesLoadedOnceRef = useRef(false);
  const archivedCapturesLoadedRef = useRef(false);
  const selectedCollectionIdRef = useRef<string | null>(null);
  const capturePageCacheHydratedRef = useRef<Record<CaptureListMode, string | null>>({ active: null, archived: null });
  const collectionPageCacheHydratedRef = useRef<Record<CollectionListMode, string | null>>({ active: null, archived: null });
  const collectionsCacheRef = useRef<Record<CollectionListMode, Collection[]>>({ active: [], archived: [] });
  const collectionsCursorCacheRef = useRef<Record<CollectionListMode, string | null>>({ active: null, archived: null });
  const collectionsLoadedOnceRef = useRef<Record<CollectionListMode, boolean>>({ active: false, archived: false });
  const collectionsModeRef = useRef<CollectionListMode>("active");
  const collectionCapturesCacheRef = useRef<Record<string, Capture[]>>({});
  const collectionCapturesCursorCacheRef = useRef<Record<string, string | null>>({});
  const collectionCapturePrefetchStartedRef = useRef<Set<string>>(new Set());
  const captureDetailHydrationRef = useRef<Set<string>>(new Set());
  const placeResolutionRef = useRef<Set<string>>(new Set());
  const captureImageLoadStatesRef = useRef<Record<string, CaptureImageLoadState>>({});
  const captureRowRevealStatesRef = useRef<Record<string, boolean>>({});
  const collectionsPrefetchStartedRef = useRef(false);
  const sourceInputRef = useRef<TextInput>(null);
  const noteInputRef = useRef<TextInput>(null);
  const titleInputRef = useRef<TextInput>(null);
  const collectionTitleInputRef = useRef<TextInput>(null);
  const collectionDetailListRef = useRef<FlatList<Capture>>(null);
  const captureThumbnailRefs = useRef<Record<string, View | null>>({});
  const handoffRootRef = useRef<View | null>(null);
  const reviewHeroRectRef = useRef<ReviewHandoffRect | null>(null);
  const reviewHandoffRef = useRef<ReviewHandoffState | null>(null);
  const reviewHandoffKeyRef = useRef(0);
  const lastKeyboardHeightRef = useRef(0);
  const captureComposerClosingRef = useRef(false);
  const captureImagePickerActiveRef = useRef(false);
  const searchMotion = useRef(new Animated.Value(0)).current;
  const reviewMotion = useRef(new Animated.Value(1)).current;
  // Single clock for the hero morph and the review screen fade — both read
  // this value so the image handoff and the view transition run in parallel.
  // The whole handoff lifecycle (target measured → morph → arrived → ready →
  // crossfade) lives in shared values so it never re-renders the tree
  // mid-transition; React commits only at handoff start and finish.
  const reviewHandoffProgress = useSharedValue(1);
  // The collection detail pane transition's clock. Lives here (not in the
  // frame) so the open→closing branch swap keeps the value — the exit picks
  // up from wherever the enter left it.
  const collectionDetailProgress = useSharedValue(0);
  const reviewHandoffTarget = useSharedValue<ReviewHandoffRect | null>(null);
  const reviewHandoffArrived = useSharedValue(false);
  const reviewHandoffHeroReady = useSharedValue(false);
  // True once the morph copy's image has displayed; the flight cannot start
  // (and nothing beneath the copy may hide) until it has pixels.
  const reviewHandoffCopyReady = useSharedValue(false);
  // Set when back interrupts an in-flight open: blocks a late-arriving
  // target from starting the forward morph mid-reversal.
  const reviewHandoffCancelled = useSharedValue(false);
  const captureComposerMotion = useRef(new Animated.Value(0)).current;
  const captureKeyboardInset = useRef(new Animated.Value(0)).current;
  const skeletonPulse = useRef(new Animated.Value(0)).current;
  const homeRowsFade = useRef(new Animated.Value(0)).current;
  const collectionRowsFade = useRef(new Animated.Value(0)).current;
  const collectionListFade = useRef(new Animated.Value(0)).current;

  const registerCaptureThumbnailRef = useCallback((
    surface: ReviewHandoffSurface,
    captureId: string,
    node: View | null
  ) => {
    // Keep the last node on detach: react-freeze detaches refs when a pane
    // freezes, but the native view stays alive — the closing morph still
    // needs to measure it and restore its opacity. Stale nodes from truly
    // unmounted rows measure as zero and are handled by the origin fallback.
    if (node) {
      captureThumbnailRefs.current[`${surface}:${captureId}`] = node;
    }
  }, []);

  const registerHomeCaptureThumbnailRef = useCallback(
    (captureId: string, node: View | null) => registerCaptureThumbnailRef("home", captureId, node),
    [registerCaptureThumbnailRef]
  );

  const registerCollectionCaptureThumbnailRef = useCallback(
    (captureId: string, node: View | null) => registerCaptureThumbnailRef("collection", captureId, node),
    [registerCaptureThumbnailRef]
  );

  const registerSearchCaptureThumbnailRef = useCallback(
    (captureId: string, node: View | null) => registerCaptureThumbnailRef("search", captureId, node),
    [registerCaptureThumbnailRef]
  );

  useEffect(() => {
    reviewHandoffRef.current = reviewHandoff;
  }, [reviewHandoff]);

  const findHandoffThumbnailNode = useCallback((surface: ReviewHandoffSurface, aliases: string[]) => {
    for (const alias of aliases) {
      const node = captureThumbnailRefs.current[`${surface}:${alias}`];
      if (node) return node;
    }
    return null;
  }, []);

  const markReviewHandoffReady = useCallback((key: number | null) => {
    if (!key || reviewHandoffRef.current?.key !== key) return;
    reviewHandoffHeroReady.value = true;
  }, [reviewHandoffHeroReady]);

  const markReviewHandoffCopyShown = useCallback((key: number) => {
    if (reviewHandoffRef.current?.key !== key) return;
    reviewHandoffCopyReady.value = true;
    setReviewHandoffCopyShownKey(key);
  }, [reviewHandoffCopyReady]);

  const reviewOriginRectRef = useRef<{ captureId: string; rect: ReviewHandoffRect } | null>(null);
  // selectCapture is created by a hook further down; the closing-handoff
  // fallback (declared earlier) reaches it through this ref.
  const selectCaptureRef = useRef<(captureId: string | null) => void>(() => {});

  const normalizeHandoffWindowRect = useCallback((
    rect: ReviewHandoffRect,
    onMeasured: (normalized: ReviewHandoffRect) => void
  ) => {
    // Measure the root offset fresh every time: window coordinates shift as
    // Android settles edge-to-edge insets, so a cached offset from launch
    // can belong to a different coordinate system than the rect being
    // normalized — landing the morph a status-bar-height off target.
    const root = handoffRootRef.current;
    if (!root) {
      onMeasured(rect);
      return;
    }
    root.measureInWindow((rootX, rootY, rootWidth, rootHeight) => {
      if (!rootWidth || !rootHeight) {
        onMeasured(rect);
        return;
      }
      onMeasured({
        ...rect,
        x: rect.x - rootX,
        y: rect.y - rootY
      });
    });
  }, []);

  const markReviewHandoffTarget = useCallback((key: number | null, rect: ReviewHandoffRect) => {
    normalizeHandoffWindowRect(rect, (normalized) => {
      reviewHeroRectRef.current = normalized;
      if (!key || reviewHandoffRef.current?.key !== key) return;
      // Only opening handoffs target the hero. During closing the review
      // screen re-measures its hero with the closing key; writing that rect
      // here would race the card measurement and hijack the return morph.
      if (reviewHandoffRef.current.direction !== "opening") return;
      const current = reviewHandoffTarget.value;
      if (
        current &&
        current.x === normalized.x &&
        current.y === normalized.y &&
        current.width === normalized.width &&
        current.height === normalized.height &&
        current.radius === normalized.radius
      ) {
        return;
      }
      reviewHandoffTarget.value = normalized;
    });
  }, [normalizeHandoffWindowRect, reviewHandoffTarget]);

  const measureClosingHandoffTarget = useCallback((handoff: ReviewHandoffState) => {
    // The live measurement is the close target's single authority — the
    // flight does not start until it lands (startReviewCloseHandoff leaves
    // the target null). The rect the opening morph launched from can be
    // stale (rows tapped right after a scroll measure mid-settle), so it is
    // only the fallback when the live measurement fails outright.
    const applyOriginFallback = () => {
      const origin = reviewOriginRectRef.current;
      if (origin && origin.captureId === handoff.captureId) {
        if (reviewHandoffRef.current?.key !== handoff.key) return;
        reviewHandoffTarget.value = origin.rect;
        return;
      }
      setClosingReviewCapture(null);
      reviewHandoffRef.current = null;
      setReviewHandoff(null);
      selectCaptureRef.current(null);
    };
    const thumbnailNode = findHandoffThumbnailNode(handoff.sourceSurface, handoff.captureAliases);
    if (!thumbnailNode) {
      applyOriginFallback();
      return;
    }
    thumbnailNode.measureInWindow((x, y, width, height) => {
      if (!width || !height) {
        applyOriginFallback();
        return;
      }
      normalizeHandoffWindowRect({ x, y, width, height, radius: 14 }, (normalized) => {
        if (reviewHandoffRef.current?.key !== handoff.key) return;
        reviewHandoffTarget.value = normalized;
      });
    });
  }, [findHandoffThumbnailNode, normalizeHandoffWindowRect, reviewHandoffTarget]);

  const closingMeasureKeyRef = useRef<number | null>(null);

  useEffect(() => {
    if (!reviewHandoff || reviewHandoff.direction !== "closing") return;
    if (closingMeasureKeyRef.current === reviewHandoff.key) return;
    closingMeasureKeyRef.current = reviewHandoff.key;
    let innerFrame: number | null = null;
    const frame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        measureClosingHandoffTarget(reviewHandoff);
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      if (innerFrame !== null) cancelAnimationFrame(innerFrame);
    };
  }, [measureClosingHandoffTarget, reviewHandoff, selectedId]);

  const startReviewHandoff = useCallback((
    capture: Capture,
    sourceSurface: ReviewHandoffSurface,
    open: () => void
  ) => {
    // Fly the source the row thumbnail has actually PAINTED, not the
    // capture's current image url: the thumbnail holds its previous pixels
    // across same-capture source upgrades (recyclingKey design), so after a
    // poll upgrades a row's asset — or the new url 403s — the data and the
    // screen disagree. Flying the data url made the copy pop over the row
    // with a different crop at takeoff, and mismatch again at the close
    // landing. The displayed source is ground truth for both ends.
    const displayed = displayedRowImagesRef.current.get(capture.id);
    // Don't treat a failed image as flyable. The row only paints an image when
    // one loads; a failed load leaves the icon on screen, so flying
    // captureImageUrl there flew pixels the user never saw AND stranded the
    // morph when the hero image failed too (the icon vanished, nothing opened).
    // A failed image → no imageUrl → the link takes the editorial open path
    // below. "Displayed" or "still loading" still counts as an image.
    const loadKey = captureImageLoadKey(capture);
    const rowImageFailed = Boolean(loadKey && captureImageLoadStatesRef.current[loadKey] === "failed");
    const imageUrl = displayed?.url || (rowImageFailed ? "" : captureImageUrl(capture));
    const thumbnailNode = captureThumbnailRefs.current[`${sourceSurface}:${capture.id}`];
    // No image to fly → no shared-element morph: the link opens to the
    // editorial (title-led) detail with its own fade-rise entrance. This also
    // means a failed/absent image can never strand a half-started morph.
    if (!imageUrl || !thumbnailNode) {
      open();
      return;
    }
    // Wait one frame before measuring: a tap that lands while the list is
    // still settling would otherwise capture a rect the row has already
    // scrolled away from, popping the morph copy in at the wrong spot.
    requestAnimationFrame(() => thumbnailNode.measureInWindow((x, y, width, height) => {
      if (!width || !height) {
        open();
        return;
      }
      normalizeHandoffWindowRect({ x, y, width, height, radius: 14 }, (from) => {
        const key = reviewHandoffKeyRef.current + 1;
        reviewHandoffKeyRef.current = key;
        const nextHandoff: ReviewHandoffState = {
          cacheKey: displayed ? displayed.cacheKey : captureImageCacheKey(capture),
          captureAliases: captureIdentityAliases(capture),
          captureId: capture.id,
          direction: "opening",
          from,
          heroScale: reviewHeroExpandedScale,
          imageUrl,
          key,
          returnCollectionId: null,
          sourceSurface
        };
        reviewOriginRectRef.current = { captureId: capture.id, rect: from };
        // The morph starts only once the review screen has mounted and
        // measured its hero (target lands), so image and view move together.
        reviewHandoffProgress.value = 0;
        reviewHandoffArrived.value = false;
        reviewHandoffHeroReady.value = false;
        reviewHandoffCopyReady.value = false;
        reviewHandoffCancelled.value = false;
        reviewHandoffTarget.value = null;
        reviewHandoffRef.current = nextHandoff;
        setReviewHandoff(nextHandoff);
        open();
      });
    }));
  }, [
    findHandoffThumbnailNode,
    normalizeHandoffWindowRect,
    reviewHandoffArrived,
    reviewHandoffCancelled,
    reviewHandoffHeroReady,
    reviewHandoffProgress,
    reviewHandoffTarget
  ]);

  // Last source each row thumbnail actually painted (expo-image onDisplay),
  // keyed by every capture identity alias. Read imperatively by the handoff
  // (no re-renders): the morph must fly the pixels on screen, which diverge
  // from the capture's current image url while a source upgrade is loading —
  // or forever, when the upgraded url fails.
  const displayedRowImagesRef = useRef(new Map<string, { cacheKey: string; url: string }>());

  const recordCaptureRowImageDisplayed = useCallback((capture: Capture, url: string, cacheKey: string) => {
    if (!url) return;
    const entry = { cacheKey, url };
    for (const alias of captureIdentityAliases(capture)) {
      displayedRowImagesRef.current.set(alias, entry);
    }
  }, []);

  const markCaptureImageLoadState = useCallback((key: string, state: CaptureImageLoadState) => {
    const currentState = captureImageLoadStatesRef.current[key];
    if (!key || currentState === state || (currentState === "loaded" && state === "failed")) return;
    const next = { ...captureImageLoadStatesRef.current, [key]: state };
    captureImageLoadStatesRef.current = next;
    setCaptureImageLoadStates(next);
  }, []);

  const clearSupersededCaptureImageFailures = useCallback((rows: Capture[]) => {
    const activeKeys = new Set(rows.map(captureImageLoadKey).filter(Boolean));
    if (!activeKeys.size) return;
    let changed = false;
    const next = { ...captureImageLoadStatesRef.current };
    for (const [key, state] of Object.entries(next)) {
      if (state === "failed" && !activeKeys.has(key)) {
        delete next[key];
        changed = true;
      }
    }
    if (!changed) return;
    captureImageLoadStatesRef.current = next;
    setCaptureImageLoadStates(next);
  }, []);

  const markCaptureRowsRevealed = useCallback((keys: string[]) => {
    const missing = keys.filter((key) => key && !captureRowRevealStatesRef.current[key]);
    if (!missing.length) return;
    const next = { ...captureRowRevealStatesRef.current };
    missing.forEach((key) => {
      next[key] = true;
    });
    captureRowRevealStatesRef.current = next;
    setCaptureRowRevealStates(next);
  }, []);

  // Re-signed asset URLs must not replace row identity: unchanged rows keep
  // their objects (no image reloads, no re-renders), and a fully unchanged
  // list keeps its array so poll/refresh cycles are render no-ops. Rows whose
  // image previously failed do take the fresh URLs.
  function captureNeedsFreshRow(capture: Capture) {
    const loadKey = captureImageLoadKey(capture);
    return Boolean(loadKey && captureImageLoadStatesRef.current[loadKey] === "failed");
  }

  function commitCaptureRows(
    mode: CaptureListMode,
    updater: (current: Capture[]) => Capture[]
  ) {
    if (mode === "archived") {
      const current = capturesForListMode(archivedCapturesRef.current, "archived");
      const next = preserveCaptureRowIdentities(
        current,
        capturesForListMode(updater(current), "archived"),
        captureNeedsFreshRow
      );
      archivedCapturesRef.current = next;
      setArchivedCaptures(next);
      return next;
    }
    const current = capturesForListMode(capturesRef.current, "active");
    const next = preserveCaptureRowIdentities(
      current,
      capturesForListMode(updater(current), "active"),
      captureNeedsFreshRow
    );
    capturesRef.current = next;
    setCaptures(next);
    return next;
  }

  function writeCachedCapturePage(mode: CaptureListMode, rows: Capture[], nextCursor: string | null) {
    if (!session?.userId || !nativeStore?.setCachedCapturePage) return;
    void nativeStore.setCachedCapturePage(
      session.userId,
      mode,
      JSON.stringify(rows.slice(0, CAPTURE_PAGE_SIZE + 4)),
      nextCursor
    ).catch(() => {
      // The cache is only a startup speed aid; live network data remains authoritative.
    });
  }

  async function hydrateCachedCapturePage(mode: CaptureListMode) {
    if (!session?.userId || !nativeStore?.getCachedCapturePage) return false;
    if (capturePageCacheHydratedRef.current[mode] === session.userId) return false;
    capturePageCacheHydratedRef.current[mode] = session.userId;
    const raw = await nativeStore.getCachedCapturePage(session.userId, mode).catch(() => null);
    const page = cachedCapturePageFromRaw(raw);
    if (!page.present) return false;
    const rows = sortCaptures(capturesForListMode(page.captures, mode));
    if (mode === "archived") {
      if (!archivedCapturesRef.current.length) {
        commitCaptureRows("archived", () => rows);
        setArchivedCapturesLoaded(true);
        setArchivedCapturesNextCursor(page.nextCursor);
        return true;
      }
      return false;
    }
    const currentActiveRows = capturesForListMode(capturesRef.current, "active");
    const canSeedActiveRows =
      !currentActiveRows.length || currentActiveRows.every((capture) => isFreshLocalProcessingCapture(capture));
    if (canSeedActiveRows) {
      commitCaptureRows("active", (current) => sortCaptures(uniqueCaptures([...rows, ...current])));
      setCapturesNextCursor(page.nextCursor);
      if (rows.length) setActiveCapturesLoadedOnce(true);
      return true;
    }
    if (currentActiveRows.length) setActiveCapturesLoadedOnce(true);
    return false;
  }

  function writeCachedCollectionPage(mode: CollectionListMode, rows: Collection[], nextCursor: string | null) {
    if (!session?.userId || !nativeStore?.setCachedCollectionPage) return;
    void nativeStore.setCachedCollectionPage(
      session.userId,
      mode,
      JSON.stringify(rows.slice(0, 54)),
      nextCursor
    ).catch(() => {
      // Collection cache only improves first paint; network data remains authoritative.
    });
  }

  async function hydrateCachedCollectionPage(mode: CollectionListMode) {
    if (!session?.userId || !nativeStore?.getCachedCollectionPage) return false;
    if (collectionPageCacheHydratedRef.current[mode] === session.userId) return false;
    collectionPageCacheHydratedRef.current[mode] = session.userId;
    const raw = await nativeStore.getCachedCollectionPage(session.userId, mode).catch(() => null);
    const page = cachedCollectionPageFromRaw(raw);
    if (!page.present) return false;
    collectionsCacheRef.current[mode] = page.collections;
    collectionsCursorCacheRef.current[mode] = page.nextCursor;
    setCollectionsLoadedOnce((current) => ({ ...current, [mode]: true }));
    setCollectionsNextCursor((current) => ({ ...current, [mode]: page.nextCursor }));
    if (collectionsModeRef.current === mode) setCollections(page.collections);
    return true;
  }

  async function hydrateLocalProcessingCaptures() {
    if (!nativeStore?.getCaptures) return;
    const raw = await nativeStore.getCaptures().catch(() => null);
    const localProcessing = freshLocalProcessingCaptures(raw);
    if (!localProcessing.length) return;
    commitCaptureRows("active", (current) => sortCaptures(uniqueCaptures([...current, ...localProcessing])));
  }

  function knownCapturesForCollection(collectionId: string) {
    const cached = capturesForListMode(collectionCapturesCacheRef.current[collectionId] || [], "active");
    if (cached.length) return uniqueCaptures(cached);
    const known = uniqueCaptures([
      ...capturesForListMode(capturesRef.current, "active")
        .filter((capture) => captureBelongsToCollection(capture, collectionId))
    ]);
    if (!known.length) return [];
    const hasCollectionOrder = known.every((capture) => collectionLinkTimestamp(capture, collectionId));
    return hasCollectionOrder ? sortCollectionCaptures(known, collectionId) : [];
  }

  const clearAuthenticatedState = useCallback(() => {
    setCaptures([]);
    setArchivedCaptures([]);
    setCapturesLoadPhase("idle");
    setArchivedCapturesLoadPhase("idle");
    setActiveCaptureTotalCount(null);
    setActiveCapturesLoadedOnce(false);
    setArchivedCapturesLoaded(false);
    setCapturesNextCursor(null);
    setArchivedCapturesNextCursor(null);
    capturesRef.current = [];
    archivedCapturesRef.current = [];
    activeCapturesLoadedOnceRef.current = false;
    archivedCapturesLoadedRef.current = false;
    capturePageCacheHydratedRef.current = { active: null, archived: null };
    setCollections([]);
    collectionsCacheRef.current = { active: [], archived: [] };
    collectionsCursorCacheRef.current = { active: null, archived: null };
    collectionsLoadedOnceRef.current = { active: false, archived: false };
    collectionPageCacheHydratedRef.current = { active: null, archived: null };
    setCollectionsLoadedOnce({ active: false, archived: false });
    setCollectionsNextCursor({ active: null, archived: null });
    setCollectionsLoadPhase("idle");
    collectionCapturesCacheRef.current = {};
    collectionCapturesCursorCacheRef.current = {};
    captureImageLoadStatesRef.current = {};
    captureRowRevealStatesRef.current = {};
    setCaptureImageLoadStates({});
    setCaptureRowRevealStates({});
    setHomeFeedReadyKey("");
    setCollectionFeedReadyKey("");
    collectionDetailClosingRef.current = false;
    setClosingCollectionDetail(null);
    setCollectionDetailEntering(false);
    setCollectionCaptures([]);
    setCollectionCapturesForId(null);
    setCollectionCapturesNextCursor(null);
    setCollectionCapturesLoadPhase("idle");
    setCollectionCapturesError("");
    captureDetailHydrationRef.current.clear();
    placeResolutionRef.current.clear();
    collectionsPrefetchStartedRef.current = false;
    setCaptureReturnCollectionId(null);
    setCaptureReviewOrigin(null);
    setCollectionsOpen(false);
    setCollectionSearchOpen(false);
    setCollectionSearchQuery("");
    setSearchOpen(false);
    setSearchQuery("");
    setSelectedId(null);
    setSelectedCollectionId(null);
    setCollectionDraftDirty(false);
    setShowCollectionForm(false);
    setDraftTitleDirty(false);
    setDraftNoteDirty(false);
    setDraftIntentDirty(false);
    setQuickIntentOpen(false);
    setReminderDrafts({});
    setCollectionDrafts({});
    setNoteSheetOpen(false);
    setCollectionPickerOpen(false);
    setCollectionPickerQuery("");
    setCollectionSelectionIds([]);
    setReminderSheetOpen(false);
  }, []);

  const showToast = useCallback((next: ToastState | string, tone: ToastState["tone"] = "neutral") => {
    setToast(typeof next === "string" ? { text: next, tone } : next);
  }, []);

  const showErrorToast = useCallback((error: unknown, fallback: string) => {
    showToast({ text: friendlyError(error, fallback), tone: "error" });
  }, [showToast]);

  const {
    authEmail,
    authLoading,
    authPendingEmail,
    authReady,
    authScreen,
    backToSignIn,
    config,
    handleAuthCallbackUrl,
    sendEmailAuthLink,
    session,
    setAuthEmail,
    signOut,
    startGoogleSignIn,
    withFreshAccessToken
  } = useAuthSession({
    onClearAuthenticatedState: clearAuthenticatedState,
    onMessage: setMessage
  });


  const loadCaptures = useCallback(async (
    mode: CaptureListMode = "active",
    options: { append?: boolean; before?: string | null } = {}
  ) => {
    const loadingSetter = mode === "archived" ? setArchivedCapturesLoading : setCapturesLoading;
    const phaseSetter = mode === "archived" ? setArchivedCapturesLoadPhase : setCapturesLoadPhase;
    const errorSetter = mode === "archived" ? setArchivedCapturesError : setCapturesError;
    if (!authReady || (config?.apiUrl && !session)) {
      if (!options.append) phaseSetter("cold");
      return;
    }
    const knownLoaded = mode === "archived"
      ? archivedCapturesLoadedRef.current
      : activeCapturesLoadedOnceRef.current;
    phaseSetter(options.append ? "append" : knownLoaded ? "refresh" : "cold");
    loadingSetter(true);
    errorSetter("");
    if (!options.append) {
      await hydrateCachedCapturePage(mode);
      if (mode === "active") await hydrateLocalProcessingCaptures();
    }
    let succeeded = false;
    if (config?.apiUrl && session) {
      try {
        const json = await withFreshAccessToken(async (accessToken) => {
          return await requestJson(
            captureListUrl(config.apiUrl, mode === "archived", { before: options.before }),
            {
              headers: {
                accept: "application/json",
                apikey: config.supabaseAnonKey,
                authorization: `Bearer ${accessToken}`
              }
            }
          ) as RemoteCapturePage;
        });
        const next = ((json.captures ?? []) as Array<Record<string, any>>).map(captureFromRemote);
        if (!options.append) clearSupersededCaptureImageFailures(next);
        if (mode === "archived") {
          const rows = commitCaptureRows("archived", (current) =>
            options.append ? sortCaptures(uniqueCaptures([...current, ...next])) : sortCaptures(next)
          );
          setArchivedCapturesLoaded(true);
          setArchivedCapturesNextCursor(json.next_cursor || null);
          if (!options.append) writeCachedCapturePage("archived", rows, json.next_cursor || null);
        } else {
          const rows = commitCaptureRows("active", (current) =>
            options.append
              ? sortCaptures(uniqueCaptures([...current, ...next]))
              : mergeRemoteCaptures(next, current, "active")
          );
          if (typeof json.total_count === "number" && Number.isFinite(json.total_count)) {
            setActiveCaptureTotalCount(json.total_count);
          }
          setCapturesNextCursor(json.next_cursor || null);
          if (!options.append) writeCachedCapturePage("active", rows, json.next_cursor || null);
        }
        succeeded = true;
      } catch (error) {
        errorSetter(friendlyError(error, mode === "archived" ? "Could not load archived captures" : "Could not load captures"));
        phaseSetter("error");
        throw error;
      } finally {
        loadingSetter(false);
        if (succeeded) phaseSetter("ready");
        if (succeeded && mode === "active") activeCapturesFetchedAtRef.current = Date.now();
        if (mode === "active" && !options.append) setActiveCapturesLoadedOnce(true);
      }
      return;
    }

    try {
      if (!nativeStore) {
        throw new Error("Native capture store is unavailable.");
      }
      const raw = await nativeStore.getCaptures();
      const next = JSON.parse(raw || "[]") as Capture[];
      const active = capturesForListMode(next, "active");
      const archived = capturesForListMode(next, "archived");
      if (mode === "archived") {
        commitCaptureRows("archived", () => sortCaptures(archived));
        setArchivedCapturesLoaded(true);
        setArchivedCapturesNextCursor(null);
      } else {
        commitCaptureRows("active", () => sortCaptures(active));
        commitCaptureRows("archived", () => sortCaptures(archived));
        setActiveCaptureTotalCount(active.length);
        setArchivedCapturesLoaded(true);
        setCapturesNextCursor(null);
        setArchivedCapturesNextCursor(null);
      }
      succeeded = true;
    } catch (error) {
      const text = friendlyError(error, mode === "archived" ? "Could not load archived captures" : "Could not load captures");
      errorSetter(text);
      phaseSetter("error");
      throw error;
    } finally {
      loadingSetter(false);
      if (succeeded) phaseSetter("ready");
      if (succeeded && mode === "active") activeCapturesFetchedAtRef.current = Date.now();
      if (mode === "active" && !options.append) setActiveCapturesLoadedOnce(true);
    }
  }, [authReady, config, session, withFreshAccessToken]);

  const loadMoreCaptures = useCallback((mode: CaptureListMode = "active") => {
    const cursor = mode === "archived" ? archivedCapturesNextCursor : capturesNextCursor;
    const loading = mode === "archived" ? archivedCapturesLoading : capturesLoading;
    if (!cursor || loading) return;
    void loadCaptures(mode, { append: true, before: cursor }).catch((error) => {
      showErrorToast(error, "Could not load more captures");
    });
  }, [
    archivedCapturesLoading,
    archivedCapturesNextCursor,
    capturesLoading,
    capturesNextCursor,
    loadCaptures,
    showErrorToast
  ]);

  const loadArchivedCapturesForSearch = useCallback(
    () => loadCaptures("archived"),
    [loadCaptures]
  );

  const {
    currentSearchKey,
    remoteSearchActive,
    remoteSearchEnhancing,
    remoteSearchKey,
    remoteSearchLoading,
    remoteSearchResults,
    searchOpen,
    searchQuery,
    searchResults,
    searchScope,
    searchScopeOpen,
    setSearchOpen,
    setSearchQuery
  } = useCaptureSearch({
    captures,
    config,
    session,
    withFreshAccessToken
  });

  const loadCollections = useCallback(async (
    mode: CollectionListMode = "active",
    options: { append?: boolean; before?: string | null } = {}
  ) => {
    const knownLoaded = collectionsLoadedOnceRef.current[mode] || collectionsCacheRef.current[mode].length > 0;
    setCollectionsLoadPhase(options.append ? "append" : knownLoaded ? "refresh" : "cold");
    setCollectionsLoading(true);
    setCollectionsError("");
    if (!options.append) await hydrateCachedCollectionPage(mode);
    if (!config?.apiUrl || !session) {
      collectionsCacheRef.current[mode] = [];
      collectionsCursorCacheRef.current[mode] = null;
      setCollectionsNextCursor((current) => ({ ...current, [mode]: null }));
      setCollectionsLoadedOnce((current) => ({ ...current, [mode]: true }));
      if (collectionsModeRef.current === mode) setCollections([]);
      setCollectionsLoading(false);
      setCollectionsLoadPhase("ready");
      return;
    }
    let succeeded = false;
    try {
      const json = await withFreshAccessToken(async (accessToken) => {
        return await requestJson(
          edgeResourceUrl(config.apiUrl, "collections", {
            archived: mode === "archived" ? "true" : "false",
            limit: "50",
            ...(options.before ? { before: options.before } : {})
          }),
          {
            headers: {
              accept: "application/json",
              apikey: config.supabaseAnonKey,
              authorization: `Bearer ${accessToken}`
            }
          }
        ) as RemoteCollectionPage;
      });
      const next = (json.collections ?? []).map(collectionFromRemote);
      const rows = options.append
        ? uniqueCollections([...(collectionsCacheRef.current[mode] || []), ...next])
        : next;
      collectionsCacheRef.current[mode] = rows;
      collectionsCursorCacheRef.current[mode] = json.next_cursor || null;
      setCollectionsNextCursor((current) => ({ ...current, [mode]: json.next_cursor || null }));
      setCollectionsLoadedOnce((current) => ({ ...current, [mode]: true }));
      collectionCapturePrefetchStartedRef.current = new Set();
      if (collectionsModeRef.current === mode) setCollections(rows);
      if (!options.append) writeCachedCollectionPage(mode, rows, json.next_cursor || null);
      succeeded = true;
    } catch (error) {
      setCollectionsLoadPhase("error");
      throw error;
    } finally {
      setCollectionsLoading(false);
      if (succeeded) setCollectionsLoadPhase("ready");
    }
  }, [config, session, withFreshAccessToken]);

  const loadMoreCollections = useCallback(() => {
    const cursor = collectionsNextCursor[collectionsMode];
    if (!cursor || collectionsLoading) return;
    void loadCollections(collectionsMode, { append: true, before: cursor }).catch((error) => {
      showErrorToast(error, "Could not load more collections");
    });
  }, [collectionsLoading, collectionsMode, collectionsNextCursor, loadCollections, showErrorToast]);

  const loadCollectionCaptures = useCallback(async (
    collectionId: string,
    options: { append?: boolean; before?: string | null; phase?: CollectionCapturesLoadPhase; prefetch?: boolean } = {}
  ) => {
    const prefetch = Boolean(options.prefetch);
    const phase = options.phase || (options.append ? "append" : "initial");
    if (!config?.apiUrl || !session) {
      if (prefetch) return;
      setCollectionCaptures([]);
      setCollectionCapturesForId(collectionId);
      setCollectionCapturesNextCursor(null);
      setCollectionCapturesLoadPhase("idle");
      setCollectionCapturesError("");
      return;
    }
    if (!prefetch) {
      setCollectionCapturesLoading(true);
      setCollectionCapturesLoadPhase(phase);
      setCollectionCapturesError("");
    }
    try {
      const json = await withFreshAccessToken(async (accessToken) => {
        return await requestJson(
          edgeResourceUrl(config.apiUrl, "collection-captures", {
            collectionId,
            limit: String(COLLECTION_CAPTURE_PAGE_SIZE),
            ...(options.before ? { before: options.before } : {})
          }),
          {
            headers: {
              accept: "application/json",
              apikey: config.supabaseAnonKey,
              authorization: `Bearer ${accessToken}`
            }
          }
        ) as RemoteCapturePage;
      });
      const next = capturesForListMode((json.captures ?? []).map(captureFromRemote), "active");
      if (!options.append) clearSupersededCaptureImageFailures(next);
      const merged = options.append
        ? capturesForListMode(
            uniqueCaptures([...(collectionCapturesCacheRef.current[collectionId] || []), ...next]),
            "active"
          )
        : next;
      collectionCapturesCacheRef.current[collectionId] = merged;
      collectionCapturesCursorCacheRef.current[collectionId] = json.next_cursor || null;
      if (!prefetch || selectedCollectionIdRef.current === collectionId) {
        setCollectionCaptures(merged);
        setCollectionCapturesNextCursor(json.next_cursor || null);
        setCollectionCapturesForId(collectionId);
        setCollectionCapturesError("");
      }
    } finally {
      if (!prefetch || selectedCollectionIdRef.current === collectionId) {
        setCollectionCapturesLoading(false);
        setCollectionCapturesLoadPhase("idle");
      }
    }
  }, [clearSupersededCaptureImageFailures, config, session, withFreshAccessToken]);

  const loadMoreCollectionCaptures = useCallback(() => {
    if (!selectedCollectionId || !collectionCapturesNextCursor || collectionCapturesLoading) return;
    void loadCollectionCaptures(selectedCollectionId, {
      append: true,
      before: collectionCapturesNextCursor,
      phase: "append"
    }).catch((error) => {
      showErrorToast(error, "Could not load more collection captures");
    });
  }, [
    collectionCapturesLoading,
    collectionCapturesNextCursor,
    loadCollectionCaptures,
    selectedCollectionId,
    showErrorToast
  ]);

  const retryLoadCollectionCaptures = useCallback(() => {
    if (!selectedCollectionId || collectionCapturesLoading) return;
    setCollectionCapturesError("");
    void loadCollectionCaptures(selectedCollectionId, { phase: "initial" }).catch((error) => {
      const text = friendlyError(error, "Could not load collection captures");
      setCollectionCaptures([]);
      setCollectionCapturesForId(selectedCollectionId);
      setCollectionCapturesNextCursor(null);
      setCollectionCapturesError(text);
    });
  }, [collectionCapturesLoading, loadCollectionCaptures, selectedCollectionId]);

  const loadCaptureDetail = useCallback(async (capture: Capture) => {
    const captureRef = capture.remoteId || capture.id;
    if (!captureRef || !config?.apiUrl || !session) return;
    if (captureDetailHydrationRef.current.has(captureRef)) return;
    captureDetailHydrationRef.current.add(captureRef);
    try {
      const json = await withFreshAccessToken(async (accessToken) => {
        return await requestJson(captureDetailUrl(config.apiUrl, captureRef), {
          headers: {
            accept: "application/json",
            apikey: config.supabaseAnonKey,
            authorization: `Bearer ${accessToken}`
          }
        }) as RemoteCaptureDetail;
      });
      if (!json.capture) return;
      applyUpdatedCapture(captureFromRemote(json.capture), capture.id);
    } catch (error) {
      captureDetailHydrationRef.current.delete(captureRef);
    }
  }, [config, session, withFreshAccessToken]);

  const resolveCapturePlace = useCallback(async (capture: Capture) => {
    const captureRef = capture.remoteId || capture.id;
    const resolvedPlaceStatus = capture.visitTarget?.resolvedPlace?.status || "missing";
    const shouldAttemptResolution = [
      "missing",
      "failed",
      "skipped_no_key",
      "skipped_no_target"
    ].includes(resolvedPlaceStatus);
    const placeResolutionKey = `${captureRef}:${resolvedPlaceStatus}`;
    if (
      !captureRef ||
      !capture.visitTarget ||
      !shouldAttemptResolution ||
      !config?.apiUrl ||
      !session ||
      placeResolutionRef.current.has(placeResolutionKey)
    ) {
      return;
    }
    placeResolutionRef.current.add(placeResolutionKey);
    try {
      const json = await withFreshAccessToken((accessToken) =>
        requestJson<{ capture: Record<string, any> }>(captureMutationUrl(config.apiUrl), {
          method: "PATCH",
          headers: {
            apikey: config.supabaseAnonKey,
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: {
            captureId: captureRef,
            action: "resolve_place"
          }
        })
      );
      if (json.capture) {
        applyUpdatedCapture(captureFromRemote(json.capture), capture.id);
      }
    } catch (error) {
      placeResolutionRef.current.delete(placeResolutionKey);
    }
  }, [config, session, withFreshAccessToken]);

  const selectCapture = useCallback((captureId: string | null) => {
    setDraftTitleDirty(false);
    setDraftNoteDirty(false);
    setDraftIntentDirty(false);
    setQuickIntentOpen(false);
    setReminderDrafts({});
    setReminderSheetOpen(false);
    setCollectionDrafts({});
    setNoteSheetOpen(false);
    setCollectionPickerOpen(false);
    setCollectionPickerQuery("");
    setCollectionSelectionIds([]);
    // Deselecting ends the review trip; the return marker would otherwise
    // linger and skew the collection-captures lifecycle effect.
    if (!captureId) setCaptureReturnCollectionId(null);
    setSelectedId(captureId);
  }, []);

  selectCaptureRef.current = selectCapture;

  const selectCollection = useCallback((collectionId: string | null) => {
    setCollectionFeedReadyKey("");
    // Selecting a collection (or instant-clearing the selection) supersedes
    // any in-flight animated close; the frame animates up from wherever the
    // interrupted exit left it.
    collectionDetailClosingRef.current = false;
    setClosingCollectionDetail(null);
    if (collectionId) {
      const collection = [...collectionsCacheRef.current.active, ...collectionsCacheRef.current.archived]
        .find((item) => item.id === collectionId);
      const hasNoCaptures = collection?.captureCount === 0;
      const hasCachedActiveCaptures =
        capturesForListMode(collectionCapturesCacheRef.current[collectionId] || [], "active").length > 0;
      setCollectionCapturesLoading(!hasNoCaptures);
      setCollectionCapturesLoadPhase(
        hasNoCaptures ? "idle" : hasCachedActiveCaptures ? "refresh" : "initial"
      );
      setCollectionCapturesError("");
    }
    setCollectionDetailEntering(Boolean(collectionId));
    setSelectedCollectionId(collectionId);
    setCaptureReturnCollectionId(null);
    setCollectionDraftDirty(false);
    setShowCollectionForm(false);
  }, []);

  // Animated close: one commit swaps the detail to the closing branch (frame
  // direction flips, screen content frozen via the snapshot), the pane fades
  // out on the UI thread, and finishCloseCollectionDetail unmounts it while
  // fully invisible. Idempotent under repeated back presses mid-flight.
  const closeCollectionDetail = useCallback(() => {
    const collection = selectedCollectionRef.current;
    if (!collection || collectionDetailClosingRef.current) return;
    selectCollection(null);
    collectionDetailClosingRef.current = true;
    setClosingCollectionDetail(collection);
  }, [selectCollection]);

  const finishCloseCollectionDetail = useCallback(() => {
    if (!collectionDetailClosingRef.current) return;
    collectionDetailClosingRef.current = false;
    setClosingCollectionDetail(null);
    setCollectionDetailEntering(false);
  }, []);

  // The enter flight landed: the detail fully covers the collections pane, so
  // its chrome can leave the tree (one commit, invisible to the user).
  const finishOpenCollectionDetail = useCallback(() => {
    setCollectionDetailEntering(false);
  }, []);

  const finishReviewHandoff = useCallback((key: number) => {
    const current = reviewHandoffRef.current;
    if (!current || current.key !== key) return;
    reviewHandoffRef.current = null;
    setReviewHandoff(null);
    if (current.direction === "closing") {
      setClosingReviewCapture(null);
      // Collection-origin reviews need no special return path: the detail
      // screen stayed mounted beneath the review, so deselecting the capture
      // simply uncovers it.
      selectCapture(null);
    }
  }, [selectCapture]);

  const openCapture = useCallback(
    (captureId: string | null) => {
      if (!captureId) return;
      setSearchOpen(false);
      setCollectionSearchOpen(false);
      setCollectionsOpen(false);
      setCaptureReturnCollectionId(null);
      setCaptureReviewOrigin("other");
      const capture =
        captures.find((item) => item.id === captureId) ??
        archivedCaptures.find((item) => item.id === captureId) ??
        remoteSearchResults.find((item) => item.id === captureId);
      if (!capture) {
        selectCapture(captureId);
        return;
      }
      setDraftTitle(capture.title);
      setDraftNote(capture.note);
      setDraftIntent(normalizeIntent(capture.defaultIntent));
      selectCapture(capture.id);
    },
    [archivedCaptures, captures, remoteSearchResults, selectCapture]
  );

  const openRecentCapture = useCallback(
    (capture: Capture) => {
      startReviewHandoff(capture, "home", () => {
        openCapture(capture.id);
        setCaptureReviewOrigin("recent");
      });
    },
    [openCapture, startReviewHandoff]
  );

  const openCaptureFromCollection = useCallback((capture: Capture, collectionId: string) => {
    startReviewHandoff(capture, "collection", () => {
      setSearchOpen(false);
      setCollectionSearchOpen(false);
      // The collection stays selected: the detail remains mounted beneath
      // the review, so the close morph lands on the live row and the list
      // keeps its scroll position across the round trip.
      setCaptureReturnCollectionId(collectionId);
      setCaptureReviewOrigin("collection");
      setDraftTitle(capture.title);
      setDraftNote(capture.note);
      setDraftIntent(normalizeIntent(capture.defaultIntent));
      selectCapture(capture.id);
    });
  }, [selectCapture, startReviewHandoff]);

  const openCaptureFromSearch = useCallback((capture: Capture) => {
    startReviewHandoff(capture, "search", () => {
      // The search screen stays mounted (searchOpen stays true): it remains
      // beneath the review, so the close morph lands on the live result row
      // and the query/results/scroll survive the round trip.
      setCaptureReturnCollectionId(null);
      setCaptureReviewOrigin("search");
      setDraftTitle(capture.title);
      setDraftNote(capture.note);
      setDraftIntent(normalizeIntent(capture.defaultIntent));
      selectCapture(capture.id);
    });
  }, [selectCapture, startReviewHandoff]);

  const startReviewCloseHandoff = useCallback((
    capture: Capture,
    options?: {
      fromRect?: ReviewHandoffRect | null;
      heroScale?: number;
      imageCacheKey?: string;
      imageUrl?: string;
      returnCollectionId?: string | null;
      returnSurface?: ReviewHandoffSurface;
    }
  ) => {
    const fromRect = options?.fromRect;
    const heroScale = options?.heroScale ?? reviewHeroExpandedScale;
    // Fly the source the hero is actually rendering (its pinned open-time
    // URL) when the screen provides it. Deriving from the hydrated capture
    // flew an upgraded asset the row thumbnail never showed — the landing
    // swap then visibly changed pixels.
    const imageUrl = options?.imageUrl || captureImageUrl(capture);
    if (!imageUrl) return false;
    const start = (from: ReviewHandoffRect) => {
      const key = reviewHandoffKeyRef.current + 1;
      reviewHandoffKeyRef.current = key;
      const nextHandoff: ReviewHandoffState = {
        cacheKey: options?.imageUrl
          ? options.imageCacheKey || ""
          : captureImageCacheKey(capture),
        captureAliases: captureIdentityAliases(capture),
        captureId: capture.id,
        direction: "closing",
        from,
        heroScale,
        imageUrl,
        key,
        returnCollectionId: options?.returnCollectionId ?? null,
        sourceSurface:
          options?.returnSurface ?? (options?.returnCollectionId ? "collection" : "home")
      };
      reviewHandoffProgress.value = 0;
      reviewHandoffArrived.value = false;
      reviewHandoffHeroReady.value = true;
      reviewHandoffCopyReady.value = false;
      reviewHandoffCancelled.value = false;
      // The flight starts only once the LIVE thumbnail measurement lands
      // (the start reaction waits for a target). Presetting the open-time
      // origin rect here made the morph take off toward a stale position —
      // rows tapped right after a scroll were measured mid-settle — and then
      // visibly re-aim when the live rect arrived. The live measurement and
      // the copy's image-display gate take the same few frames, so waiting
      // costs no takeoff latency; the origin rect remains the fallback when
      // the live measurement fails (measureClosingHandoffTarget).
      reviewHandoffTarget.value = null;
      reviewHandoffRef.current = nextHandoff;
      // Keep the capture selected (drafts and all) while the return morph
      // runs — clearing it here visibly blanked the still-fading screen.
      // finishReviewHandoff deselects once the morph lands.
      setReviewHandoff(nextHandoff);
    };
    if (fromRect) {
      normalizeHandoffWindowRect(fromRect, start);
    } else {
      start(reviewHeroRectRef.current || reviewHeroTargetRect(Dimensions.get("window").width));
    }
    return true;
  }, [
    normalizeHandoffWindowRect,
    reviewHandoffArrived,
    reviewHandoffHeroReady,
    reviewHandoffProgress,
    reviewHandoffTarget,
    selectCapture
  ]);

  async function openCaptureUrl(url: string) {
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      showToast("Could not open source.", "error");
    }
  }

  function openSearch() {
    selectCapture(null);
    selectCollection(null);
    setCollectionsOpen(false);
    setCollectionSearchOpen(false);
    setMessage("");
    setSearchOpen(true);
  }

  function openRecentHome() {
    selectCapture(null);
    selectCollection(null);
    setSearchOpen(false);
    setCollectionSearchOpen(false);
    setCollectionsOpen(false);
    setAccountSheetOpen(false);
    setMessage("");
  }

  function openAccountActions() {
    setAccountSheetOpen(true);
  }

  function resetCaptureComposerSurface() {
    captureComposerMotion.stopAnimation();
    captureKeyboardInset.stopAnimation();
    setShowCaptureComposer(false);
    setCaptureComposerClosing(false);
    captureComposerClosingRef.current = false;
    setCaptureMode(DEFAULT_CAPTURE_COMPOSER_MODE);
    setKeyboardHeight(0);
    captureComposerMotion.setValue(0);
    captureKeyboardInset.setValue(0);
  }

  function animateCaptureSheetClose(
    onClosed: () => void,
    options: { keyboardHidden?: boolean } = {}
  ) {
    captureComposerMotion.stopAnimation();
    captureKeyboardInset.stopAnimation();
    captureComposerClosingRef.current = true;
    setCaptureComposerClosing(true);
    if (options.keyboardHidden) {
      onClosed();
      setKeyboardHeight(0);
      captureKeyboardInset.setValue(0);
      captureComposerMotion.setValue(0);
      setCaptureComposerClosing(false);
      captureComposerClosingRef.current = false;
      return;
    }
    const closeDuration = 125;
    const keyboardWasVisible = keyboardHeight > 0;
    const keyboardSettleDuration = Platform.OS === "android" ? 190 : 160;
    Keyboard.dismiss();
    const closeAnimation = keyboardWasVisible
      ? Animated.sequence([
          Animated.timing(captureKeyboardInset, {
            duration: keyboardSettleDuration,
            easing: Easing.out(Easing.cubic),
            toValue: 0,
            useNativeDriver: false
          }),
          Animated.timing(captureComposerMotion, {
            duration: closeDuration,
            easing: Easing.in(Easing.cubic),
            toValue: 0,
            // JS-driven to match the keyboard marginBottom inset it shares a view with.
            useNativeDriver: false
          })
        ])
      : Animated.timing(captureComposerMotion, {
          duration: closeDuration,
          easing: Easing.in(Easing.cubic),
          toValue: 0,
          // JS-driven to match the keyboard marginBottom inset it shares a view with.
          useNativeDriver: false
        });
    closeAnimation.start(() => {
      onClosed();
      setKeyboardHeight(0);
      captureKeyboardInset.setValue(0);
      captureComposerMotion.setValue(0);
      requestAnimationFrame(() => {
        setCaptureComposerClosing(false);
        captureComposerClosingRef.current = false;
      });
    });
  }

  // Snap the shared sheet animation surface to its open resting state. With the
  // keyboard up, prime the inset to the last/estimated keyboard height so the
  // sheet opens already docked above the keyboard; calm opens (the collection
  // editor) start with the keyboard down. Shared by every keyboard sheet so the
  // priming can't drift between them.
  function primeSheetSurface({ keyboardUp }: { keyboardUp: boolean }) {
    captureComposerMotion.stopAnimation();
    captureKeyboardInset.stopAnimation();
    captureComposerMotion.setValue(0);
    if (!keyboardUp) {
      captureKeyboardInset.setValue(0);
      return;
    }
    const screenHeight = Dimensions.get("screen").height;
    const estimatedKeyboardHeight =
      lastKeyboardHeightRef.current || Math.round(screenHeight * (Platform.OS === "ios" ? 0.34 : 0.4));
    lastKeyboardHeightRef.current = estimatedKeyboardHeight;
    captureKeyboardInset.setValue(estimatedKeyboardHeight);
    setKeyboardHeight(estimatedKeyboardHeight);
  }

  function openCaptureComposer() {
    setShowCollectionForm(false);
    setMessage("");
    setCaptureMode(DEFAULT_CAPTURE_COMPOSER_MODE);
    captureComposerClosingRef.current = false;
    setCaptureComposerClosing(false);
    primeSheetSurface({ keyboardUp: true });
    setShowCaptureComposer(true);
  }

  function openCollectionComposer() {
    selectCapture(null);
    selectCollection(null);
    setSearchOpen(false);
    setCollectionSearchOpen(false);
    setCollectionsOpen(true);
    setAccountSheetOpen(false);
    setMessage("");
    setCollectionTitle("");
    setCollectionDescription("");
    setCollectionDraftDirty(false);
    setShowCaptureComposer(false);
    primeSheetSurface({ keyboardUp: true });
    setShowCollectionForm(true);
  }

  // Edit mode for the collection sheet: the detail pencil opens the same
  // composer prefilled by the useAppUiEffects draft sync (selectedCollection
  // stays set, so the sheet renders its edit header and delete row). No
  // keyboard priming — the sheet opens calm with the keyboard down.
  function openCollectionEditor() {
    // Re-seed from the current collection on every open. The draft-sync effect
    // only fires when selectedCollectionId/collections change, so reopening the
    // editor for the same collection (e.g. after a gesture-back that cleared the
    // fields) would otherwise leave the sheet blank.
    const collection = selectedCollectionRef.current;
    if (collection) {
      setCollectionTitle(collection.title);
      setCollectionDescription(collection.description);
    }
    setCollectionDraftDirty(false);
    primeSheetSurface({ keyboardUp: false });
    setShowCollectionForm(true);
  }

  function openNoteSheet() {
    setQuickIntentOpen(false);
    setMessage("");
    primeSheetSurface({ keyboardUp: true });
    setNoteSheetOpen(true);
  }

  function closeNoteSheet(options?: { keyboardHidden?: boolean }) {
    if (!noteSheetOpen || captureComposerClosing) return;
    animateCaptureSheetClose(() => {
      setNoteSheetOpen(false);
    }, options);
  }

  function openTitleSheet() {
    setQuickIntentOpen(false);
    setMessage("");
    primeSheetSurface({ keyboardUp: true });
    setTitleSheetOpen(true);
  }

  function closeTitleSheet(options?: { keyboardHidden?: boolean }) {
    if (!titleSheetOpen || captureComposerClosing) return;
    animateCaptureSheetClose(() => {
      setTitleSheetOpen(false);
    }, options);
  }

  function closeCaptureComposer(options?: { keyboardHidden?: boolean }) {
    if (!showCaptureComposer || captureComposerClosing) return;
    animateCaptureSheetClose(() => {
      setShowCaptureComposer(false);
      setCaptureMode(DEFAULT_CAPTURE_COMPOSER_MODE);
    }, options);
  }

  function closeCollectionComposer(options?: { keyboardHidden?: boolean }) {
    if (!showCollectionForm || captureComposerClosing) return;
    animateCaptureSheetClose(() => {
      setShowCollectionForm(false);
      setCollectionTitle("");
      setCollectionDescription("");
      setCollectionDraftDirty(false);
    }, options);
  }

  function chooseCaptureMode(mode: CaptureComposerMode) {
    setCaptureMode(mode);
    if (mode === "link") {
      requestAnimationFrame(() => sourceInputRef.current?.focus());
    } else {
      Keyboard.dismiss();
    }
  }

  async function openCollectionsScreen(mode: CollectionListMode = collectionsMode) {
    selectCapture(null);
    setSearchOpen(false);
    setCollectionSearchOpen(false);
    setAccountSheetOpen(false);
    setCollectionsMode(mode);
    setCollectionsOpen(true);
    setSelectedCollectionId(null);
    const cached = collectionsCacheRef.current[mode];
    if (cached.length || collectionsLoadedOnceRef.current[mode]) setCollections(cached);
    else setCollections([]);
    setCollectionsError("");
    if (cached.length || collectionsLoadedOnceRef.current[mode]) return;
    try {
      await loadCollections(mode);
    } catch (error) {
      const text = friendlyError(error, "Could not load collections.");
      setCollectionsError(text);
    }
  }

  function openCollectionSearch() {
    selectCapture(null);
    selectCollection(null);
    setSearchOpen(false);
    setAccountSheetOpen(false);
    setCollectionSearchQuery("");
    setCollectionSearchOpen(true);
  }

  function closeCollectionSearch() {
    setCollectionSearchOpen(false);
    setCollectionSearchQuery("");
  }

  const markFaviconFailed = useCallback((host: string) => {
    if (!host) return;
    setFaviconFailures((current) => (current[host] ? current : { ...current, [host]: true }));
  }, []);

  function replaceLocalCaptureLists(next: Capture[]) {
    commitCaptureRows("active", () => sortCaptures(capturesForListMode(next, "active")));
    commitCaptureRows("archived", () => sortCaptures(capturesForListMode(next, "archived")));
  }



  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (authCallbackPayload(url)) return;
      const captureId = parseCaptureUrl(url);
      if (captureId) selectCapture(captureId);
    });
  }, [selectCapture]);

  useEffect(() => {
    capturesRef.current = captures;
  }, [captures]);

  useEffect(() => {
    archivedCapturesRef.current = archivedCaptures;
  }, [archivedCaptures]);

  useEffect(() => {
    activeCapturesLoadedOnceRef.current = activeCapturesLoadedOnce;
  }, [activeCapturesLoadedOnce]);

  useEffect(() => {
    archivedCapturesLoadedRef.current = archivedCapturesLoaded;
  }, [archivedCapturesLoaded]);

  useEffect(() => {
    if (!selectedId) setCaptureReviewOrigin(null);
  }, [selectedId]);

  useEffect(() => {
    collectionsLoadedOnceRef.current = collectionsLoadedOnce;
  }, [collectionsLoadedOnce]);

  useEffect(() => {
    collectionsModeRef.current = collectionsMode;
  }, [collectionsMode]);

  useEffect(() => {
    selectedCollectionIdRef.current = selectedCollectionId;
  }, [selectedCollectionId]);

  useEffect(() => {
    if (
      !collectionsOpen ||
      selectedCollectionId ||
      collectionsMode !== "active" ||
      collectionsLoading ||
      !config?.apiUrl ||
      !session
    ) {
      return;
    }
    const candidates = collections
      .filter((collection) => collection.status === "active" && collection.captureCount > 0)
      .slice(0, COLLECTION_CAPTURE_PREFETCH_LIMIT);
    if (!candidates.length) return;
    let cancelled = false;
    const cancelIdleTask = scheduleIdleTask(() => {
      void candidates.reduce<Promise<void>>(async (previous, collection) => {
        await previous;
        if (cancelled) return;
        const expectedRows = Math.min(collection.captureCount, COLLECTION_CAPTURE_PAGE_SIZE);
        const cachedRows = capturesForListMode(collectionCapturesCacheRef.current[collection.id] || [], "active");
        if (cachedRows.length >= expectedRows || collectionCapturePrefetchStartedRef.current.has(collection.id)) return;
        collectionCapturePrefetchStartedRef.current.add(collection.id);
        await loadCollectionCaptures(collection.id, { prefetch: true }).catch(() => {
          collectionCapturePrefetchStartedRef.current.delete(collection.id);
        });
      }, Promise.resolve());
    });
    return () => {
      cancelled = true;
      cancelIdleTask();
    };
  }, [
    collections,
    collectionsLoading,
    collectionsMode,
    collectionsOpen,
    config?.apiUrl,
    loadCollectionCaptures,
    selectedCollectionId,
    session?.userId
  ]);

  useEffect(() => {
    setActiveCapturesLoadedOnce(false);
    setActiveCaptureTotalCount(null);
    setCapturesLoadPhase("idle");
    setArchivedCapturesLoadPhase("idle");
    setCollectionsLoadedOnce({ active: false, archived: false });
    setCollectionsNextCursor({ active: null, archived: null });
    setHomeFeedReadyKey("");
    setCollectionFeedReadyKey("");
    activeCapturesLoadedOnceRef.current = false;
    archivedCapturesLoadedRef.current = false;
    capturePageCacheHydratedRef.current = { active: null, archived: null };
    collectionsLoadedOnceRef.current = { active: false, archived: false };
    collectionPageCacheHydratedRef.current = { active: null, archived: null };
    collectionsCursorCacheRef.current = { active: null, archived: null };
  }, [session?.userId]);

  useEffect(() => {
    const linkSubscription = Linking.addEventListener("url", ({ url }) => {
      if (authCallbackPayload(url)) {
        void handleAuthCallbackUrl(url);
        return;
      }
      const captureId = parseCaptureUrl(url);
      if (captureId) selectCapture(captureId);
      void loadCaptures();
    });
    return () => linkSubscription.remove();
  }, [handleAuthCallbackUrl, loadCaptures, selectCapture]);

  useEffect(() => {
    if (!authReady || (config?.apiUrl && !session)) {
      setCapturesLoadPhase("cold");
      return;
    }
    void loadCaptures().catch((error) => {
      setCapturesError((current) => current || friendlyError(error, "Could not load captures"));
    });
  }, [authReady, config?.apiUrl, loadCaptures, session?.userId]);

  useEffect(() => {
    if (!config?.apiUrl || !session || collectionsPrefetchStartedRef.current) return;
    collectionsPrefetchStartedRef.current = true;
    return scheduleIdleTask(() => {
      void loadCollections("active").catch(() => {
        collectionsPrefetchStartedRef.current = false;
      });
    });
  }, [config?.apiUrl, loadCollections, session?.userId]);

  const selected = selectedId
    ? captures.find((capture) => capture.id === selectedId) ??
      archivedCaptures.find((capture) => capture.id === selectedId) ??
      collectionCaptures.find((capture) => capture.id === selectedId) ??
      remoteSearchResults.find((capture) => capture.id === selectedId) ??
      null
    : null;
  const selectedCollection = selectedCollectionId
    ? collections.find((collection) => collection.id === selectedCollectionId) ?? null
    : null;
  // The animated close (declared earlier) snapshots the collection through
  // this ref; assigned every render like selectCaptureRef.
  selectedCollectionRef.current = selectedCollection;
  searchOpenRef.current = searchOpen;

  // The review screen registers its hero-measured close here so hardware/
  // gesture back runs the same scroll-aware return morph as the back button.
  const reviewHeroCloseRef = useRef<(() => void) | null>(null);

  // Back during an in-flight open reverses the morph from wherever it is —
  // the shared progress clock takes the screen fade back down with it.
  const cancelReviewOpeningHandoff = useCallback((handoff: ReviewHandoffState) => {
    if (reviewHandoffArrived.value) return; // reveal underway; finish is imminent
    reviewHandoffCancelled.value = true;
    const remaining = Math.max(80, REVIEW_HANDOFF_CLOSE_MS * reviewHandoffProgress.value);
    const key = handoff.key;
    reviewHandoffProgress.value = withTiming(
      0,
      {
        duration: remaining,
        easing: ReanimatedEasing.bezier(0.2, 0, 0, 1),
        reduceMotion: motionReduceMotion
      },
      (finished) => {
        if (finished) runOnJS(abandonReviewOpen)(key);
      }
    );
  }, [reviewHandoffArrived, reviewHandoffCancelled, reviewHandoffProgress]);

  function abandonReviewOpen(key: number) {
    if (reviewHandoffRef.current?.key !== key) return;
    reviewHandoffRef.current = null;
    setReviewHandoff(null);
    selectCaptureRef.current(null);
  }

  const closeSelectedCapture = useCallback((options?: {
    allowHandoff?: boolean;
    fromRect?: ReviewHandoffRect | null;
    heroScale?: number;
    imageCacheKey?: string;
    imageUrl?: string;
  }) => {
    if (!selected) return;
    if (reviewHandoff) {
      if (reviewHandoff.direction === "opening") cancelReviewOpeningHandoff(reviewHandoff);
      return;
    }
    // Collection- and search-origin reviews morph back only while their source
    // list is still mounted beneath (it carries the live row the copy lands on).
    const closesToCollection =
      captureReviewOrigin === "collection" && Boolean(selectedCollectionRef.current);
    const closesToSearch = captureReviewOrigin === "search" && searchOpenRef.current;
    if (
      (captureReviewOrigin === "recent" || closesToCollection || closesToSearch) &&
      options?.allowHandoff !== false &&
      startReviewCloseHandoff(selected, {
        ...options,
        returnCollectionId: closesToCollection ? captureReturnCollectionId : null,
        returnSurface: closesToSearch ? "search" : undefined
      })
    ) {
      return;
    }
    selectCapture(null);
  }, [
    cancelReviewOpeningHandoff,
    captureReturnCollectionId,
    captureReviewOrigin,
    reviewHandoff,
    selectCapture,
    selected,
    startReviewCloseHandoff
  ]);

  const requestCloseSelectedCapture = useCallback(() => {
    if (reviewHeroCloseRef.current) {
      reviewHeroCloseRef.current();
      return;
    }
    closeSelectedCapture();
  }, [closeSelectedCapture]);

  const collectionSearchResults = useMemo(() => {
    const term = collectionSearchQuery.trim().toLowerCase();
    const activeCollections = collections.filter((collection) => collection.status === "active");
    if (!term) return [];
    return activeCollections.filter((collection) => searchableCollectionText(collection).includes(term));
  }, [collectionSearchQuery, collections]);

  useEffect(() => {
    prefetchImageUrls(
      collections.flatMap((collection) =>
        (collection.previewCaptures || []).map((capture) =>
          capture.imageAssetUrl || capture.sourcePreviewAssetUrl || capture.thumbnailUrl || ""
        )
      )
    );
  }, [collections]);

  useEffect(() => {
    if (!selectedCollectionId || collectionCapturesForId !== selectedCollectionId) return;
    prefetchImageUrls(collectionCaptures.slice(0, 12).map(captureImageUrl));
  }, [collectionCaptures, collectionCapturesForId, selectedCollectionId]);

  const { visitTargetMapCandidates } = useCaptureReview({ selected });

  const {
    homeColdSkeletonVisible,
    homeFeedRevealPending,
    homeInitialLoading,
    homeRows,
    visibleHomeCapturesForReveal,
    visibleHomeRows
  } = useCaptureFeed({
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
  });

  const {
    collectionCapturesColdSkeletonVisible,
    collectionFeedRevealPending,
    collectionsColdSkeletonVisible
  } = useCollectionsState({
    activeCollectionsCacheLength: collectionsCacheRef.current.active.length,
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
  });

  useAppUiEffects({
    accountSheetOpen,
    captureComposerClosing,
    captureComposerClosingRef,
    captureComposerMotion,
    captureImagePickerActiveRef,
    captureKeyboardInset,
    captureMode,
    captures,
    closeCaptureComposer,
    closeCollectionComposer,
    closeCollectionDetail,
    closeCollectionPicker,
    closeNoteSheet,
    closeTitleSheet,
    closeSelectedCapture: requestCloseSelectedCapture,
    collectionSearchOpen,
    collectionPickerOpen,
    collectionDraftDirty,
    collectionTitleInputRef,
    collections,
    collectionsOpen,
    draftIntentDirty,
    draftNoteDirty,
    draftTitleDirty,
    lastKeyboardHeightRef,
    noteInputRef,
    noteSheetOpen,
    titleInputRef,
    titleSheetOpen,
    pickingCaptureImage,
    reviewMotion,
    searchMotion,
    searchOpen,
    selectCapture,
    selectCollection,
    selectedCollectionId,
    selectedId,
    setAccountSheetOpen,
    setCollectionDescription,
    setCollectionSearchOpen,
    setCollectionTitle,
    setCollectionsOpen,
    setDraftIntent,
    setDraftNote,
    setDraftTitle,
    setKeyboardHeight,
    setQuickIntentOpen,
    setReminderSheetOpen,
    setSearchOpen,
    quickIntentOpen,
    reminderSheetOpen,
    showCaptureComposer,
    showCollectionForm,
    skeletonPulse,
    sourceInputRef
  });

  const selectedDraftKey = selected ? captureDraftKey(selected) : "";

  // Hydrate detail only once the handoff transition has settled: the fetch
  // response re-renders the whole tree, which mid-transition reads as flicker.
  const reviewHandoffInFlight = Boolean(reviewHandoff);

  useEffect(() => {
    if (!selected || reviewHandoffInFlight) return;
    void loadCaptureDetail(selected);
  }, [loadCaptureDetail, reviewHandoffInFlight, selected?.id, selected?.remoteId]);

  useEffect(() => {
    if (!selected || reviewHandoffInFlight) return;
    void resolveCapturePlace(selected);
  }, [
    resolveCapturePlace,
    reviewHandoffInFlight,
    selected?.id,
    selected?.remoteId,
    selected?.visitTarget?.name,
    selected?.visitTarget?.query,
    selected?.visitTarget?.resolvedPlace?.status
  ]);

  useEffect(() => {
    latestNoteRef.current = draftNote;
  }, [draftNote]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.durationMs ?? TOAST_DEFAULT_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const appSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        // Refetch on foreground only when the list is actually stale; a quick
        // app switch should not repaint the feed.
        if (Date.now() - activeCapturesFetchedAtRef.current < CAPTURES_FRESH_MS) return;
        void loadCaptures();
      } else if (nativeStore?.setReviewDrafts) {
        void nativeStore.setReviewDrafts(JSON.stringify(reviewDraftsByCapture));
        if (selected && draftNoteDirty) {
          void saveContextNote(selected, draftNote);
        }
      }
    });
    return () => appSubscription.remove();
  }, [draftNote, draftNoteDirty, loadCaptures, reviewDraftsByCapture, selected]);

  useEffect(() => {
    if (!selected || !draftNoteDirty) return;
    setNoteSaveState("idle");
    const timer = setTimeout(() => {
      void saveContextNote(selected, draftNote);
    }, 900);
    return () => clearTimeout(timer);
  }, [draftNote, draftNoteDirty, selected]);

  function updateSelectedReviewDraft(patch: Partial<CaptureReviewDraft>) {
    if (!selected) return;
    const key = captureDraftKey(selected);
    setReviewDraftsByCapture((current) => {
      const nextDraft = cleanedReviewDraft({
        ...(current[key] || {}),
        ...patch,
        updatedAt: Date.now()
      });
      const next = { ...current };
      if (nextDraft) next[key] = nextDraft;
      else delete next[key];
      return next;
    });
  }

  function clearSelectedReviewDraft(capture: Capture) {
    const key = captureDraftKey(capture);
    setReviewDraftsByCapture((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function clearAutosavedNoteDraft(captureKey: string, noteValue: string) {
    setReviewDraftsByCapture((current) => {
      const existing = current[captureKey];
      if (!existing || existing.note !== noteValue) return current;
      const nextDraft = cleanedReviewDraft({
        ...existing,
        note: undefined,
        noteDirty: false,
        updatedAt: Date.now()
      });
      const next = { ...current };
      if (nextDraft) next[captureKey] = nextDraft;
      else delete next[captureKey];
      return next;
    });
  }

  useEffect(() => {
    if (!nativeStore?.getReviewDrafts) {
      setReviewDraftsLoaded(true);
      return;
    }
    nativeStore.getReviewDrafts().then((raw) => {
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, CaptureReviewDraft>;
      setReviewDraftsByCapture(parsed && typeof parsed === "object" ? parsed : {});
    }).catch(() => {
      setReviewDraftsByCapture({});
    }).finally(() => {
      setReviewDraftsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!reviewDraftsLoaded || !nativeStore?.setReviewDrafts) return;
    void nativeStore.setReviewDrafts(JSON.stringify(reviewDraftsByCapture));
  }, [reviewDraftsByCapture, reviewDraftsLoaded]);

  useEffect(() => {
    if (!selected) {
      setDraftTitle("");
      setDraftNote("");
      setDraftIntent("");
      setDraftTitleDirty(false);
      setDraftNoteDirty(false);
      setDraftIntentDirty(false);
      setReminderDrafts({});
      setCollectionDrafts({});
      setQuickIntentOpen(false);
      setCollectionPickerOpen(false);
      setCollectionPickerQuery("");
      setNoteSheetOpen(false);
      return;
    }
    const savedDraft = reviewDraftsByCapture[captureDraftKey(selected)] || {};
    setDraftTitle(savedDraft.titleDirty && typeof savedDraft.title === "string" ? savedDraft.title : selected.title);
    setDraftNote(savedDraft.noteDirty && typeof savedDraft.note === "string" ? savedDraft.note : selected.note);
    setDraftIntent(
      savedDraft.intentDirty && typeof savedDraft.intent === "string"
        ? savedDraft.intent
        : normalizeIntent(selected.defaultIntent)
    );
    setDraftTitleDirty(Boolean(savedDraft.titleDirty));
    setDraftNoteDirty(Boolean(savedDraft.noteDirty));
    setDraftIntentDirty(Boolean(savedDraft.intentDirty));
    setReminderDrafts(savedDraft.reminders || {});
    setCollectionDrafts({});
    setNoteSaveState("idle");
    setQuickIntentOpen(false);
    setCollectionPickerOpen(false);
    setCollectionPickerQuery("");
  }, [reviewDraftsByCapture, selectedDraftKey]);

  useEffect(() => {
    if (!selectedCollectionId) {
      // Keep the rows while the detail is animating out (or parked beneath a
      // review trip) — clearing them mid-fade blanks the closing screen.
      if (!captureReturnCollectionId && !closingCollectionDetail) {
        setCollectionCaptures([]);
        setCollectionCapturesForId(null);
        setCollectionCapturesNextCursor(null);
      }
      setCollectionCapturesLoading(false);
      setCollectionCapturesLoadPhase("idle");
      setCollectionCapturesError("");
      return;
    }
    if (selectedCollection?.status === "archived") {
      setCollectionCaptures([]);
      setCollectionCapturesForId(selectedCollectionId);
      setCollectionCapturesNextCursor(null);
      setCollectionCapturesLoading(false);
      setCollectionCapturesLoadPhase("idle");
      setCollectionCapturesError("");
      return;
    }
    if (selectedCollection?.captureCount === 0) {
      collectionCapturesCacheRef.current[selectedCollectionId] = [];
      collectionCapturesCursorCacheRef.current[selectedCollectionId] = null;
      setCollectionCaptures([]);
      setCollectionCapturesForId(selectedCollectionId);
      setCollectionCapturesNextCursor(null);
      setCollectionCapturesLoading(false);
      setCollectionCapturesLoadPhase("idle");
      setCollectionCapturesError("");
      return;
    }
    const cached = knownCapturesForCollection(selectedCollectionId);
    if (cached.length) {
      collectionCapturesCacheRef.current[selectedCollectionId] = cached;
      setCollectionCaptures(cached);
      setCollectionCapturesForId(selectedCollectionId);
      setCollectionCapturesNextCursor(collectionCapturesCursorCacheRef.current[selectedCollectionId] || null);
    }
    setCollectionCapturesError("");
    void loadCollectionCaptures(selectedCollectionId, { phase: cached.length ? "refresh" : "initial" }).catch((error) => {
      const text = friendlyError(error, "Could not load collection captures");
      if (!cached.length) {
        setCollectionCaptures([]);
        setCollectionCapturesForId(selectedCollectionId);
        setCollectionCapturesNextCursor(null);
        setCollectionCapturesError(text);
      }
    });
  }, [captureReturnCollectionId, closingCollectionDetail, loadCollectionCaptures, selectedCollection?.captureCount, selectedCollection?.status, selectedCollectionId]);

  function applyUpdatedCapture(updatedCapture: Capture, previousId: string) {
    const matchesCapture = (item: Capture) =>
      item.id === previousId ||
      item.remoteId === previousId ||
      item.id === updatedCapture.id ||
      Boolean(updatedCapture.remoteId && item.remoteId === updatedCapture.remoteId);
    // When the cache key is unchanged it is the same asset with a freshly
    // signed URL — keep the URL the views are already rendering so image
    // sources stay stable (a source swap restarts the native load: flicker).
    // Failed images do take the fresh URL.
    const stableAssetUrl = (
      previousUrl: string | undefined,
      nextUrl: string | undefined,
      previousKey: string | undefined,
      nextKey: string | undefined,
      imageFailed: boolean
    ) => {
      if (!imageFailed && previousUrl && previousKey && previousKey === nextKey) return previousUrl;
      return nextUrl || previousUrl;
    };
    const preserveKnownImageFields = (item: Capture): Capture => {
      const imageFailed = captureNeedsFreshRow(item);
      return {
        ...updatedCapture,
        thumbnailUrl: updatedCapture.thumbnailUrl || item.thumbnailUrl,
        imageAssetUrl: stableAssetUrl(
          item.imageAssetUrl,
          updatedCapture.imageAssetUrl,
          item.imageAssetCacheKey,
          updatedCapture.imageAssetCacheKey,
          imageFailed
        ),
        imageAssetCacheKey: updatedCapture.imageAssetCacheKey || item.imageAssetCacheKey,
        imageAssetFullUrl: stableAssetUrl(
          item.imageAssetFullUrl,
          updatedCapture.imageAssetFullUrl,
          item.imageAssetFullCacheKey,
          updatedCapture.imageAssetFullCacheKey,
          imageFailed
        ),
        imageAssetFullCacheKey: updatedCapture.imageAssetFullCacheKey || item.imageAssetFullCacheKey,
        imageAssetMimeType: updatedCapture.imageAssetMimeType || item.imageAssetMimeType,
        sourcePreviewAssetUrl: stableAssetUrl(
          item.sourcePreviewAssetUrl,
          updatedCapture.sourcePreviewAssetUrl,
          item.sourcePreviewAssetCacheKey,
          updatedCapture.sourcePreviewAssetCacheKey,
          imageFailed
        ),
        sourcePreviewAssetCacheKey: updatedCapture.sourcePreviewAssetCacheKey || item.sourcePreviewAssetCacheKey,
        sourcePreviewAssetMimeType: updatedCapture.sourcePreviewAssetMimeType || item.sourcePreviewAssetMimeType,
        urlEvidence: updatedCapture.urlEvidence || item.urlEvidence
      };
    };
    for (const [collectionId, rows] of Object.entries(collectionCapturesCacheRef.current)) {
      if (!rows.some(matchesCapture)) continue;
      collectionCapturesCacheRef.current[collectionId] = capturesForListMode(
        rows.map((item) => matchesCapture(item) ? preserveKnownImageFields(item) : item),
        "active"
      );
    }
    setCaptures((current) => {
      if (!current.some(matchesCapture)) return current;
      return capturesForListMode(current.map((item) => (matchesCapture(item) ? preserveKnownImageFields(item) : item)), "active");
    });
    setArchivedCaptures((current) => {
      if (!current.some(matchesCapture)) return current;
      return capturesForListMode(current.map((item) => (matchesCapture(item) ? preserveKnownImageFields(item) : item)), "archived");
    });
    setCollectionCaptures((current) =>
      capturesForListMode(current.map((item) => (matchesCapture(item) ? preserveKnownImageFields(item) : item)), "active")
    );
  }

  function removeCaptureFromVisibleLists(capture: Capture) {
    const matchesCapture = (item: Capture) =>
      item.id === capture.id ||
      item.remoteId === capture.id ||
      item.id === capture.remoteId ||
      Boolean(capture.remoteId && item.remoteId === capture.remoteId);
    commitCaptureRows("active", (current) => current.filter((item) => !matchesCapture(item)));
    commitCaptureRows("archived", (current) => current.filter((item) => !matchesCapture(item)));
    for (const [collectionId, rows] of Object.entries(collectionCapturesCacheRef.current)) {
      collectionCapturesCacheRef.current[collectionId] = rows.filter((item) => !matchesCapture(item));
    }
    setCollectionCaptures((current) => current.filter((item) => !matchesCapture(item)));
  }

  function upsertActiveCapture(capture: Capture) {
    commitCaptureRows("active", (current) =>
      sortCaptures(uniqueCaptures([capture, ...current.filter((item) => item.id !== capture.id && item.remoteId !== capture.remoteId)]))
    );
  }

  function removeCollectionFromKnownCaptures(collectionId: string) {
    const removeCollection = (capture: Capture): Capture => ({
      ...capture,
      linkedCollections: (capture.linkedCollections || []).filter((collection) => collection.id !== collectionId)
    });
    commitCaptureRows("active", (current) => current.map(removeCollection));
    commitCaptureRows("archived", (current) => current.map(removeCollection));
    for (const [cachedCollectionId, rows] of Object.entries(collectionCapturesCacheRef.current)) {
      collectionCapturesCacheRef.current[cachedCollectionId] = rows.map(removeCollection);
    }
    setCollectionCaptures((current) => current.map(removeCollection));
  }

  async function saveContextNote(capture: Capture, noteValue: string) {
    const captureKey = captureDraftKey(capture);
    setNoteSaveState("saving");
    if (config?.apiUrl && session && capture.remoteId) {
      try {
        const json = await withFreshAccessToken((accessToken) =>
          requestJson<{ capture: Record<string, any> }>(captureMutationUrl(config.apiUrl), {
            method: "PATCH",
            headers: {
              apikey: config.supabaseAnonKey,
              authorization: `Bearer ${accessToken}`,
              "content-type": "application/json"
            },
            body: {
              captureId: capture.remoteId || capture.id,
              note: noteValue.trim()
            }
          })
        );
        const updatedCapture = captureFromRemote(json.capture);
        applyUpdatedCapture(updatedCapture, capture.id);
        if (latestNoteRef.current === noteValue) {
          setDraftNoteDirty(false);
          clearAutosavedNoteDraft(captureKey, noteValue);
          setNoteSaveState("saved");
        }
      } catch (error) {
        setNoteSaveState("error");
      }
      return;
    }

    if (!nativeStore) return;
    try {
      const raw = await nativeStore.updateCapture(capture.id, capture.title, noteValue.trim(), null);
      const next = JSON.parse(raw || "[]") as Capture[];
      replaceLocalCaptureLists(next);
      if (latestNoteRef.current === noteValue) {
        setDraftNoteDirty(false);
        clearAutosavedNoteDraft(captureKey, noteValue);
        setNoteSaveState("saved");
      }
    } catch (error) {
      setNoteSaveState("error");
    }
  }

  async function saveReviewDecisions() {
    if (!selected) return;
    const currentSaveIntent = draftIntentDirty ? draftIntent || null : undefined;

    if (config?.apiUrl && session) {
      try {
        const body: Record<string, unknown> = {
          captureId: selected.remoteId || selected.id,
          title: draftTitle.trim(),
          note: draftNote.trim()
        };
        if (currentSaveIntent !== undefined) body.currentSaveIntent = currentSaveIntent;
        const json = await withFreshAccessToken((accessToken) =>
          requestJson<{ capture: Record<string, any> }>(captureMutationUrl(config.apiUrl), {
            method: "PATCH",
            headers: {
              apikey: config.supabaseAnonKey,
              authorization: `Bearer ${accessToken}`,
              "content-type": "application/json"
            },
            body
          })
        );
        const updatedCapture = captureFromRemote(json.capture);
        applyUpdatedCapture(updatedCapture, selected.id);
        setDraftTitleDirty(false);
        setDraftNoteDirty(false);
        setDraftIntentDirty(false);
        setReminderDrafts({});
        setCollectionDrafts({});
        clearSelectedReviewDraft(selected);
        showToast("Review saved.", "success");
      } catch (error) {
        showErrorToast(error, "Could not save review.");
      }
      return;
    }

    if (!nativeStore) return;
    const raw = await nativeStore.updateCapture(
      selected.id,
      draftTitle.trim(),
      draftNote.trim(),
      draftIntentDirty ? draftIntent || null : selected.defaultIntent || null
    );
    replaceLocalCaptureLists(JSON.parse(raw || "[]") as Capture[]);
    setDraftTitleDirty(false);
    setDraftNoteDirty(false);
    setDraftIntentDirty(false);
    setReminderDrafts({});
    setCollectionDrafts({});
    clearSelectedReviewDraft(selected);
    showToast("Review saved.", "success");
  }

  async function savePurposeIntent(intent: string | null) {
    if (!selected) return;
    if (config?.apiUrl && session) {
      try {
        const json = await withFreshAccessToken((accessToken) =>
          requestJson<{ capture: Record<string, any> }>(captureMutationUrl(config.apiUrl), {
            method: "PATCH",
            headers: {
              apikey: config.supabaseAnonKey,
              authorization: `Bearer ${accessToken}`,
              "content-type": "application/json"
            },
            body: captureIntentPatchBody(selected.remoteId || selected.id, intent)
          })
        );
        const updatedCapture = captureFromRemote(json.capture);
        applyUpdatedCapture(updatedCapture, selected.id);
        setDraftIntent(normalizeIntent(updatedCapture.defaultIntent));
        setDraftIntentDirty(false);
        setQuickIntentOpen(false);
        showToast("Purpose updated.", "success");
      } catch (error) {
        showErrorToast(error, "Could not update purpose.");
      }
      return;
    }

    if (!nativeStore) return;
    try {
      const raw = await nativeStore.updateCapture(
        selected.id,
        selected.title,
        selected.note,
        intent
      );
      replaceLocalCaptureLists(JSON.parse(raw || "[]") as Capture[]);
      setDraftIntent(intent || "");
      setDraftIntentDirty(false);
      setQuickIntentOpen(false);
      showToast("Purpose updated.", "success");
    } catch (error) {
      showErrorToast(error, "Could not update purpose.");
    }
  }

  async function collectionRequest<T>(
    resource: "collections" | "collection-links",
    input: { method: string; body?: unknown }
  ) {
    if (!config?.apiUrl || !session) throw new Error("Sign in to manage collections.");
    return withFreshAccessToken((accessToken) =>
      requestJson<T>(edgeResourceUrl(config.apiUrl, resource), {
        method: input.method,
        headers: {
          apikey: config.supabaseAnonKey,
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: input.body
      })
    );
  }

  function closeCollectionPicker() {
    setCollectionPickerOpen(false);
    setCollectionPickerQuery("");
    setCollectionSelectionIds([]);
  }

  function toggleCollectionSelection(collectionId: string) {
    setCollectionSelectionIds((current) =>
      current.includes(collectionId)
        ? current.filter((id) => id !== collectionId)
        : [...current, collectionId]
    );
  }

  async function updateCaptureCollections(
    collectionIds: string[],
    options: { closePicker?: boolean; toastMessage?: string } = {}
  ) {
    if (!selected) return;
    if (!config?.apiUrl || !session) {
      showToast("Sign in to manage collections.", "error");
      return;
    }
    const previousId = selected.id;
    setCollectionChoiceSaving("set-collections");
    try {
      const json = await collectionRequest<{ capture: Record<string, any> }>("collection-links", {
        method: "PATCH",
        body: {
          action: "set_capture_collections",
          captureId: selected.remoteId || selected.id,
          collectionIds
        }
      });
      const updatedCapture = captureFromRemote(json.capture);
      applyUpdatedCapture(updatedCapture, previousId);
      collectionCapturesCacheRef.current = {};
      setCollectionCaptures((current) =>
        capturesForListMode(
          current.map((item) =>
            item.id === previousId || item.remoteId === previousId ? updatedCapture : item
          ),
          "active"
        )
      );
      if (options.closePicker !== false) closeCollectionPicker();
      await loadCollections("active");
      showToast(options.toastMessage || "Collections updated.", "success");
    } catch (error) {
      showErrorToast(error, "Could not update collections.");
    } finally {
      setCollectionChoiceSaving(null);
    }
  }

  async function saveCollectionSelection() {
    if (!selected) return;
    const currentIds = (selected.linkedCollections || []).map((collection) => collection.id);
    const selectionAction = collectionSelectionActionState(selected, collectionSelectionIds, currentIds);
    if (!selectionAction.shouldSave) {
      closeCollectionPicker();
      return;
    }
    await updateCaptureCollections(collectionSelectionIds);
  }

  async function openCollectionPicker() {
    if (!selected) return;
    setCollectionPickerQuery("");
    setCollectionSelectionIds(confirmedLinkedCollectionsForCapture(selected).map((collection) => collection.id));
    setCollectionPickerOpen(true);
    try {
      await loadCollections("active");
    } catch (error) {
      showErrorToast(error, "Could not load collections.");
    }
  }

  async function saveCollection() {
    const title = collectionTitle.trim();
    const description = collectionDescription.trim();
    if (!title || !description) return;
    try {
      if (selectedCollection) {
        const json = await collectionRequest<{ collection: Record<string, any> }>("collections", {
          method: "PATCH",
          body: { collectionId: selectedCollection.id, title, description }
        });
        const updated = {
          ...collectionFromRemote(json.collection),
          captureCount: selectedCollection.captureCount
        };
        collectionsCacheRef.current[updated.status] = collectionsCacheRef.current[updated.status].map((item) =>
          item.id === updated.id ? updated : item
        );
        setCollections((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        closeCollectionComposer();
      } else {
        const json = await collectionRequest<{ collection: Record<string, any> }>("collections", {
          method: "POST",
          body: { title, description }
        });
        const created = collectionFromRemote(json.collection);
        collectionsCacheRef.current.active = [
          created,
          ...collectionsCacheRef.current.active.filter((item) => item.id !== created.id)
        ];
        if (collectionsMode === "active") setCollections((current) => [created, ...current]);
        closeCollectionComposer();
      }
      setCollectionDraftDirty(false);
      showToast("Collection saved.", "success");
    } catch (error) {
      showErrorToast(error, "Could not save collection.");
    }
  }

  async function undoDeleteCollection(collection: Collection) {
    try {
      const json = await collectionRequest<{ collection: Record<string, any> }>("collections", {
        method: "PATCH",
        body: { collectionId: collection.id, action: "undo_delete" }
      });
      const restored = collectionFromRemote(json.collection);
      collectionsCacheRef.current.active = uniqueCollections([restored, ...collectionsCacheRef.current.active]);
      setCollections((current) => uniqueCollections([restored, ...current]));
      setToast(null);
      showToast("Collection restored.", "success");
      await loadCollections("active");
      await loadCaptures();
    } catch (error) {
      showErrorToast(error, "Could not undo delete.");
    }
  }

  async function deleteCollection(collection: Collection) {
    const previousCollections = collections;
    const previousCache = {
      active: collectionsCacheRef.current.active,
      archived: collectionsCacheRef.current.archived
    };
    // Animated close; the frozen closingCollectionDetail snapshot keeps the
    // fading screen pixel-stable while the caches mutate beneath it.
    closeCollectionDetail();
    collectionsCacheRef.current.active = collectionsCacheRef.current.active.filter((item) => item.id !== collection.id);
    collectionsCacheRef.current.archived = collectionsCacheRef.current.archived.filter((item) => item.id !== collection.id);
    setCollections((current) => current.filter((item) => item.id !== collection.id));
    collectionCapturesCacheRef.current[collection.id] = [];
    removeCollectionFromKnownCaptures(collection.id);
    setToast(null);
    showToast({
      text: "Collection deleted.",
      tone: "destructive",
      durationMs: DELETE_UNDO_MS,
      actionLabel: "Undo",
      action: () => void undoDeleteCollection(collection)
    });
    try {
      await collectionRequest<{ collection: Record<string, any> }>("collections", {
        method: "PATCH",
        body: { collectionId: collection.id, action: "delete" }
      });
      await loadCollections("active");
      await loadCaptures();
    } catch (error) {
      collectionsCacheRef.current = previousCache;
      setCollections(previousCollections);
      showErrorToast(error, "Could not delete collection.");
    }
  }

  async function unlinkCaptureFromCollection(collectionId: string, capture: Capture) {
    const captureId = capture.remoteId || capture.id;
    const removedCollection = (capture.linkedCollections || []).find((collection) => collection.id === collectionId);
    try {
      await collectionRequest<{ ok: boolean }>("collection-links", {
        method: "PATCH",
        body: { action: "unlink", collectionId, captureId }
      });
      collectionCapturesCacheRef.current[collectionId] = (collectionCapturesCacheRef.current[collectionId] || [])
        .filter((item) => item.id !== capture.id);
      setCollectionCaptures((current) => current.filter((item) => item.id !== capture.id));
      (["active", "archived"] as const).forEach((mode) => {
        collectionsCacheRef.current[mode] = collectionsCacheRef.current[mode].map((collection) =>
          collection.id === collectionId
            ? { ...collection, captureCount: Math.max(0, collection.captureCount - 1) }
            : collection
        );
      });
      setCollections((current) =>
        current.map((collection) =>
          collection.id === collectionId
            ? { ...collection, captureCount: Math.max(0, collection.captureCount - 1) }
            : collection
        )
      );
      setCaptures((current) =>
        capturesForListMode(
          current.map((capture) =>
            capture.id === captureId || capture.remoteId === captureId
              ? {
                  ...capture,
                  linkedCollections: (capture.linkedCollections || []).filter((collection) => collection.id !== collectionId)
                }
              : capture
          ),
          "active"
        )
      );
      setToast(null);
      if (removedCollection) {
        showToast({
          text: "Removed from collection.",
          actionLabel: "Undo",
          action: () => void restoreCollectionLink(collectionId, capture, removedCollection)
        });
      } else {
        showToast({ text: "Removed from collection." });
      }
      await loadCaptures();
    } catch (error) {
      showErrorToast(error, "Could not remove collection.");
    }
  }

  async function restoreCollectionLink(collectionId: string, capture: Capture, collection: LinkedCollection) {
    const captureId = capture.remoteId || capture.id;
    try {
      await collectionRequest<{ ok: boolean }>("collection-links", {
        method: "POST",
        body: {
          collectionId,
          captureId,
          createdBy: collection.createdBy === "analysis" ? "analysis" : "user",
          rationale: collection.rationale,
          confidence: collection.confidence,
          title: collection.title
        }
      });
      const restoredCollection = { ...collection, linkedAt: Date.now() };
      const addCollection = (item: Capture) =>
        item.id === capture.id || item.remoteId === captureId
          ? {
              ...item,
              linkedCollections: (item.linkedCollections || []).some((linked) => linked.id === collectionId)
                ? item.linkedCollections
                : [...(item.linkedCollections || []), restoredCollection]
            }
          : item;
      collectionCapturesCacheRef.current[collectionId] = [
        addCollection(capture),
        ...(collectionCapturesCacheRef.current[collectionId] || []).filter((item) => item.id !== capture.id)
      ].filter((item) => !isDeleted(item));
      collectionsCacheRef.current.active = collectionsCacheRef.current.active.map((item) =>
        item.id === collectionId ? { ...item, captureCount: item.captureCount + 1 } : item
      );
      setCollections((current) =>
        current.map((item) => item.id === collectionId ? { ...item, captureCount: item.captureCount + 1 } : item)
      );
      setCaptures((current) => capturesForListMode(current.map(addCollection), "active"));
      setCollectionCaptures((current) => [
        addCollection(capture),
        ...current.filter((item) => item.id !== capture.id)
      ].filter((item) => !isDeleted(item)));
      setToast(null);
      showToast("Collection restored.", "success");
      await loadCaptures();
    } catch (error) {
      showErrorToast(error, "Could not restore collection.");
    }
  }

  async function dismissReminder(reminderIndex: number) {
    if (!selected) return;
    if (config?.apiUrl && session) {
      try {
        const json = await withFreshAccessToken((accessToken) =>
          requestJson<{ capture: Record<string, any> }>(captureMutationUrl(config.apiUrl), {
            method: "PATCH",
            headers: {
              apikey: config.supabaseAnonKey,
              authorization: `Bearer ${accessToken}`,
              "content-type": "application/json"
            },
            body: {
              captureId: selected.remoteId || selected.id,
              action: "dismiss_reminder",
              reminderIndex
            }
          })
        );
        const updatedCapture = captureFromRemote(json.capture);
        applyUpdatedCapture(updatedCapture, selected.id);
        showToast("Reminder removed.", "success");
      } catch (error) {
        showErrorToast(error, "Could not remove reminder.");
      }
      return;
    }
    const removeReminder = (capture: Capture) => {
      if (capture.id !== selected.id) return capture;
      return {
        ...capture,
        suggestedReminders: (capture.suggestedReminders || []).filter((_, index) => index !== reminderIndex)
      };
    };
    setCaptures((current) => capturesForListMode(current.map(removeReminder), "active"));
    setArchivedCaptures((current) => capturesForListMode(current.map(removeReminder), "archived"));
    setCollectionCaptures((current) => capturesForListMode(current.map(removeReminder), "active"));
    setReminderDrafts({});
    showToast("Reminder removed.", "success");
  }

  async function saveReminder(draft: ReminderScheduleDraft, reminderIndex: number | null) {
    if (!selected) return;
    if (config?.apiUrl && session) {
      try {
        const json = await withFreshAccessToken((accessToken) =>
          requestJson<{ capture: Record<string, any> }>(captureMutationUrl(config.apiUrl), {
            method: "PATCH",
            headers: {
              apikey: config.supabaseAnonKey,
              authorization: `Bearer ${accessToken}`,
              "content-type": "application/json"
            },
            body: {
              captureId: selected.remoteId || selected.id,
              action: "save_reminder",
              reminderIndex,
              reminder: {
                start_date: draft.startDate,
                end_date: draft.endDate,
                start_time: draft.startTime,
                end_time: draft.endTime,
                trigger_date: draft.startDate,
                trigger_time: draft.startTime,
                date_window_start: draft.startDate,
                date_window_end: draft.endDate,
                date_precision: draft.datePrecision,
                time_precision: draft.timePrecision,
                timezone: draft.timezone,
                duration: draft.duration,
                duration_unit: draft.durationUnit,
                trigger_text: draft.triggerText || "",
                rationale: draft.rationale || "",
                source: draft.source
              }
            }
          })
        );
        const updatedCapture = captureFromRemote(json.capture);
        applyUpdatedCapture(updatedCapture, selected.id);
        setReminderDrafts({});
        showToast("Reminder saved.", "success");
      } catch (error) {
        showErrorToast(error, "Could not save reminder.");
      }
      return;
    }

    const existingReminders = selected.suggestedReminders || [];
    const existingReminder = typeof reminderIndex === "number"
      ? existingReminders[reminderIndex]
      : undefined;
    const nextReminder = reminderSuggestionFromSchedule(draft, existingReminder);
    const nextReminders = [...existingReminders];
    if (
      typeof reminderIndex === "number" &&
      reminderIndex >= 0 &&
      reminderIndex < nextReminders.length
    ) {
      nextReminders[reminderIndex] = nextReminder;
    } else {
      nextReminders.unshift(nextReminder);
    }
    const updatedCapture: Capture = {
      ...selected,
      suggestedReminders: nextReminders
    };
    applyUpdatedCapture(updatedCapture, selected.id);
    setReminderDrafts({});
    showToast("Reminder saved.", "success");
  }

  async function copySource() {
    if (!selected) return;
    const source = selected.sourceUrl || selected.sourceText;
    if (!source) return;
    try {
      if (!nativeClipboard) throw new Error("Clipboard is unavailable.");
      await nativeClipboard?.copy(source);
      showToast("Source copied.", "success");
    } catch (error) {
      showErrorToast(error, "Could not copy source.");
    }
  }

  async function openVisitTargetMaps(candidate: MapSearchCandidate) {
    try {
      await Linking.openURL(candidate.url);
    } catch {
      showToast(`Could not open ${candidate.label}.`, "error");
    }
  }

  async function pasteExpandedUrl() {
    if (!selected) return;
    if (!nativeStore?.submitExpandedUrl || !nativeClipboard?.paste) {
      showToast("Copy the expanded URL, then paste it as a new capture.");
      return;
    }
    try {
      const clipboardText = await nativeClipboard.paste();
      const expandedUrl = extractHttpUrl(clipboardText);
      if (!expandedUrl) {
        showToast("Copy the expanded URL first, then tap Paste expanded URL.", "error");
        return;
      }
      const raw = await nativeStore.submitExpandedUrl(selected.id, expandedUrl);
      const next = JSON.parse(raw || "[]") as Capture[];
      replaceLocalCaptureLists(next);
      showToast({ text: "Expanded URL saved. Checking the source now.", tone: "processing" });
    } catch (error) {
      showErrorToast(error, "Could not use the expanded URL.");
    }
  }

  async function undoDeleteCapture(capture: Capture, returnCollectionId: string | null = null) {
    const captureRef = capture.remoteId || capture.id;
    if (config?.apiUrl && session && capture.remoteId) {
      try {
        const json = await withFreshAccessToken((accessToken) =>
          requestJson<{ capture: Record<string, any> }>(captureMutationUrl(config.apiUrl), {
            method: "PATCH",
            headers: {
              apikey: config.supabaseAnonKey,
              authorization: `Bearer ${accessToken}`,
              "content-type": "application/json"
            },
            body: {
              captureId: captureRef,
              action: "undo_delete"
            }
          })
        );
        const restoredCapture = captureFromRemote(json.capture);
        upsertActiveCapture(restoredCapture);
        if (returnCollectionId) {
          collectionCapturesCacheRef.current[returnCollectionId] = [];
          void loadCollectionCaptures(returnCollectionId, { phase: "refresh" }).catch(() => {});
        }
        setToast(null);
        showToast("Capture restored.", "success");
        collectionCapturesCacheRef.current = {};
        collectionCapturesCursorCacheRef.current = {};
        collectionCapturePrefetchStartedRef.current = new Set();
        await loadCaptures();
        if (collectionsOpen || selectedCollectionId || returnCollectionId) await loadCollections("active");
      } catch (error) {
        showErrorToast(error, "Could not undo delete.");
      }
      return;
    }
    if (!nativeStore) return;
    const raw = nativeStore.undoDeleteCapture
      ? await nativeStore.undoDeleteCapture(capture.id)
      : await nativeStore.restoreCapture(capture.id);
    replaceLocalCaptureLists(JSON.parse(raw || "[]") as Capture[]);
    setToast(null);
    showToast("Capture restored.", "success");
  }

  async function deleteSelectedCapture() {
    if (!selected) return;
    const capture = selected;
    const returnCollectionId = captureReturnCollectionId;
    const clearLocalCapture = async () => {
      if (!nativeStore) return false;
      try {
        const raw = nativeStore.deleteCapture
          ? await nativeStore.deleteCapture(capture.id)
          : await nativeStore.archiveCapture(capture.id);
        replaceLocalCaptureLists(JSON.parse(raw || "[]") as Capture[]);
        return true;
      } catch {
        return false;
      }
    };
    removeCaptureFromVisibleLists(capture);
    // The collection detail (when this review came from one) stayed mounted
    // beneath the review, so deselecting simply uncovers it.
    selectCapture(null);
    setToast(null);
    showToast({
      text: "Capture deleted.",
      tone: "destructive",
      durationMs: DELETE_UNDO_MS,
      actionLabel: "Undo",
      action: () => void undoDeleteCapture(capture, returnCollectionId)
    });
    if (config?.apiUrl && session && capture.remoteId) {
      try {
        await withFreshAccessToken((accessToken) =>
          requestJson<{ capture: Record<string, any> }>(captureMutationUrl(config.apiUrl), {
            method: "PATCH",
            headers: {
              apikey: config.supabaseAnonKey,
              authorization: `Bearer ${accessToken}`,
              "content-type": "application/json"
            },
            body: {
              captureId: capture.remoteId || capture.id,
              action: "delete"
            }
          })
        );
        await clearLocalCapture();
        collectionCapturesCacheRef.current = {};
        collectionCapturesCursorCacheRef.current = {};
        await loadCaptures();
        if (collectionsOpen || selectedCollectionId || returnCollectionId) await loadCollections("active");
      } catch (error) {
        upsertActiveCapture(capture);
        showErrorToast(error, "Could not delete.");
      }
      return;
    }
    const deletedLocal = await clearLocalCapture();
    if (!deletedLocal) {
      upsertActiveCapture(capture);
      showErrorToast(new Error("Local capture store unavailable."), "Could not delete.");
    }
  }

  async function saveCaptureSource() {
    const source = normalizeCaptureLink(sourceDraft);
    if (!source) return;
    if (!nativeStore) {
      showToast("Native capture worker is unavailable.", "error");
      return;
    }
    setSavingCapture(true);
    setToast(null);
    try {
      const raw = await nativeStore.captureSource(source);
      const localCapture = JSON.parse(raw) as Capture;
      commitCaptureRows("active", (current) => [localCapture, ...current.filter((item) => item.id !== localCapture.id)]);
      setSourceDraft("");
      closeCaptureComposer();
    } catch (error) {
      showErrorToast(error, "Could not save capture.");
    } finally {
      setSavingCapture(false);
    }
  }

  async function saveCaptureImage(source: "camera" | "library") {
    if (pickingCaptureImage || captureImagePickerActiveRef.current) return;
    const captureImage =
      source === "camera" ? nativeStore?.captureCameraImage : nativeStore?.captureImage;
    if (!captureImage) {
      showToast(
        source === "camera"
          ? "Camera capture is unavailable in this build."
          : "Image upload is unavailable in this build.",
        "error"
      );
      return;
    }
    captureImagePickerActiveRef.current = true;
    setPickingCaptureImage(true);
    setToast(null);
    try {
      const raw = await captureImage();
      if (!raw) return;
      const localCapture = JSON.parse(raw) as Capture;
      commitCaptureRows("active", (current) => [localCapture, ...current.filter((item) => item.id !== localCapture.id)]);
      setSourceDraft("");
    } catch (error) {
      if (isCaptureImageCancel(error)) return;
      showErrorToast(error, "Could not save image.");
    } finally {
      captureImagePickerActiveRef.current = false;
      setPickingCaptureImage(false);
      if (showCaptureComposer || captureComposerClosingRef.current) {
        resetCaptureComposerSurface();
      }
    }
  }

  async function pickCaptureImage() {
    await saveCaptureImage("library");
  }

  async function takeCapturePhoto() {
    await saveCaptureImage("camera");
  }

  const handleCollectionPress = useCallback((collectionId: string) => {
    setCollectionSearchOpen(false);
    selectCollection(collectionId);
  }, [selectCollection]);

  const {
    renderBottomAppBar,
    renderCaptureSkeletonRows,
    renderCollection,
    renderCollectionCapture,
    renderCollectionCaptureSkeletonRows,
    renderCollectionSkeletonRows,
    renderHomeRow,
    renderListLoadingFooter,
    renderSearchResult,
    renderToast
  } = createAppRenderHelpers({
    activeCapturesLoadedOnce,
    captureImageLoadStates,
    captureRowRevealStates,
    capturesLoading,
    collectionFeedRevealPending,
    collectionItemMotionEnabled: Boolean(
      collectionsOpen && !selected && !selectedCollection && !closingCollectionDetail && !collectionSearchOpen && !reviewHandoff
    ),
    collectionListFade,
    collectionRowsFade,
    failedFavicons: faviconFailures,
    homeFeedRevealPending,
    homeRowsFade,
    onAccountActionsPress: openAccountActions,
    onCaptureImageLoadState: markCaptureImageLoadState,
    onCaptureRowImageDisplayed: recordCaptureRowImageDisplayed,
    onCollectionComposerOpen: openCollectionComposer,
    onCollectionDescriptionChange: setCollectionDescription,
    onCollectionPress: handleCollectionPress,
    onCollectionTitleChange: setCollectionTitle,
    onCaptureThumbnailRef: registerHomeCaptureThumbnailRef,
    onCollectionCaptureThumbnailRef: registerCollectionCaptureThumbnailRef,
    onSearchCaptureThumbnailRef: registerSearchCaptureThumbnailRef,
    onCollectionsScreenOpen: (mode) => void openCollectionsScreen(mode),
    onFaviconFailure: markFaviconFailed,
    onOpenCapture: openCapture,
    onOpenCaptureFromCollection: openCaptureFromCollection,
    onOpenCaptureFromSearch: openCaptureFromSearch,
    onOpenRecentCapture: openRecentCapture,
    onRecentComposerOpen: openCaptureComposer,
    onRecentHomePress: openRecentHome,
    onUnlinkCaptureFromCollection: (collectionId, capture) => void unlinkCaptureFromCollection(collectionId, capture),
    searchQuery,
    // The closing snapshot keeps detail rows functional while the pane fades
    // out (selectedCollection is already null by then).
    selectedCollection: selectedCollection ?? closingCollectionDetail,
    handoffHiddenCapture:
      reviewHandoff && reviewHandoffCopyShownKey === reviewHandoff.key
        ? { aliases: reviewHandoff.captureAliases, surface: reviewHandoff.sourceSurface }
        : null,
    screenHandoffActive: Boolean(reviewHandoff),
    skeletonPulse,
    toast
  });

  function renderCollectionComposerSheet() {
    return (
      <CollectionComposerSheet
        captureComposerMotion={captureComposerMotion}
        captureKeyboardInset={captureKeyboardInset}
        collectionDescription={collectionDescription}
        collectionTitle={collectionTitle}
        collectionTitleInputRef={collectionTitleInputRef}
        keyboardHeight={keyboardHeight}
        onClose={closeCollectionComposer}
        onDelete={(collection) => {
          closeCollectionComposer();
          void deleteCollection(collection);
        }}
        onCollectionDescriptionChange={(value) => {
          setCollectionDraftDirty(true);
          setCollectionDescription(value);
        }}
        onCollectionTitleChange={(value) => {
          setCollectionDraftDirty(true);
          setCollectionTitle(value);
        }}
        onSave={() => void saveCollection()}
        selectedCollection={selectedCollection}
        showCollectionForm={showCollectionForm}
        windowHeight={windowHeight}
      />
    );
  }

  function renderAppSheets() {
    return (
      <>
        <AppSheets
          accountSheetOpen={accountSheetOpen}
          onSignOut={() => void signOut()}
          setAccountSheetOpen={setAccountSheetOpen}
        />
        {selected ? (
          <CollectionSelectorSheet
            actions={{
              closeCollectionPicker,
              renderCollectionSkeletonRows,
              saveCollectionSelection: () => void saveCollectionSelection(),
              setCollectionPickerQuery,
              setCollectionSelectionIds,
              toggleCollectionSelection
            }}
            data={{
              collectionListFade,
              collections,
              collectionsColdSkeletonVisible,
              collectionsListPerfProps: COLLECTION_LIST_PERF_PROPS,
              selected,
              toast: null
            }}
            state={{
              activeCollectionsLoadedOnce: collectionsLoadedOnce.active,
              collectionChoiceSaving,
              collectionPickerOpen,
              collectionPickerQuery,
              collectionSelectionIds,
              collectionsLoadPhase,
              collectionsLoading
            }}
          />
        ) : null}
      </>
    );
  }

  function renderCaptureReviewScreen(capture: Capture) {
    const activeReviewHandoff =
      reviewHandoff &&
      reviewHandoff.captureAliases.some(
        (alias) => alias === capture.id || alias === capture.remoteId
      )
        ? reviewHandoff
        : null;
    // The hero/chrome reveal under the crossfade is worklet-driven from
    // reviewHandoffFade inside the screen; these flags change only at handoff
    // start and finish.
    const reviewHeroHiddenForHandoff = Boolean(
      activeReviewHandoff?.direction === "closing" &&
        reviewHandoffCopyShownKey === activeReviewHandoff.key
    );
    const animateReviewChromeForHandoff = Boolean(
      activeReviewHandoff?.direction === "opening"
    );
    return (
      <CaptureReviewScreen
        actions={{
          closeReview: closeSelectedCapture,
          closeNoteSheet,
          closeTitleSheet,
          copySource,
          deleteCapture: () => void deleteSelectedCapture(),
          markReviewHandoffReady,
          markReviewHandoffTarget,
          markFaviconFailed,
          openCaptureUrl,
          openCollectionPicker: () => void openCollectionPicker(),
          openExternalUrl: (url) => void Linking.openURL(url),
          openNoteSheet,
          openTitleSheet,
          openVisitTargetMaps: (candidate) => void openVisitTargetMaps(candidate),
          pasteExpandedUrl: () => void pasteExpandedUrl(),
          removeReminder: (reminderIndex) => void dismissReminder(reminderIndex),
          saveReminder: (draft, reminderIndex) => void saveReminder(draft, reminderIndex),
          savePurposeIntent: (intent) => void savePurposeIntent(intent),
          setDraftIntent,
          setDraftIntentDirty,
          setDraftNote,
          setDraftNoteDirty,
          setDraftTitle,
          setDraftTitleDirty,
          setQuickIntentOpen,
          setReminderSheetOpen,
          updateSelectedReviewDraft
        }}
        data={{
          appSheets: renderAppSheets(),
          captureComposerMotion,
          captureKeyboardInset,
          faviconFailures,
          keyboardHeight,
          noteInputRef,
          titleInputRef,
          reviewMotion,
          animateReviewChromeForHandoff,
          hideReviewHeroForHandoff: reviewHeroHiddenForHandoff,
          reviewHandoffKey: activeReviewHandoff?.key ?? null,
          // The hero pins this source on mount so it renders the exact
          // pixels the opening morph flew (the row's DISPLAYED source,
          // which can lag the capture's current image url mid-upgrade).
          reviewHandoffPinSource:
            activeReviewHandoff?.direction === "opening" && activeReviewHandoff.imageUrl
              ? { cacheKey: activeReviewHandoff.cacheKey, url: activeReviewHandoff.imageUrl }
              : null,
          reviewHeroCloseRef,
          selected: capture,
          toast: renderToast("footer"),
          visitTargetMapCandidates,
          windowHeight
        }}
        state={{
          collectionChoiceSaving,
          draftIntent,
          draftIntentDirty,
          draftNote,
          draftNoteDirty,
          draftTitle,
          draftTitleDirty,
          noteSaveState,
          noteSheetOpen,
          titleSheetOpen,
          quickIntentOpen,
          reminderDrafts,
          reminderSheetOpen
        }}
      />
    );
  }

  function renderHomeScreen({ includeChrome = true }: { includeChrome?: boolean } = {}) {
    return (
      <HomeScreen
        actions={{
          chooseCaptureMode,
          closeCaptureComposer,
          loadCaptures: () => void loadCaptures(),
          loadMoreActiveCaptures: () => loadMoreCaptures("active"),
          openCaptureComposer,
          openSearch,
          pickCaptureImage: () => void pickCaptureImage(),
          renderCaptureSkeletonRows,
          renderHomeRow,
          renderListLoadingFooter,
          saveCaptureSource: () => void saveCaptureSource(),
          setSourceDraft,
          takeCapturePhoto: () => void takeCapturePhoto()
        }}
        data={{
          appSheets: includeChrome ? renderAppSheets() : null,
          bottomAppBar: includeChrome && !showCaptureComposer ? renderBottomAppBar("recent") : null,
          captureComposerMotion,
          captureKeyboardInset,
          homeCaptureTotalCount: activeCaptureTotalCount,
          homeCaptures: homeRows,
          listPerfProps: CAPTURE_LIST_PERF_PROPS,
          toast: includeChrome ? renderToast(showCaptureComposer ? "footer" : "bottomNav") : null,
          sourceInputRef,
          visibleHomeRows,
          windowHeight
        }}
        state={{
          captureMode,
          capturesError,
          capturesLoading,
          capturesNextCursor,
          activeCapturesLoadedOnce,
          homeColdSkeletonVisible,
          homeInitialLoading,
          keyboardHeight,
          pickingCaptureImage,
          savingCapture,
          sessionActive: Boolean(session),
          showCaptureComposer,
          sourceDraft
        }}
      />
    );
  }

  function renderCollectionsScreen({ includeChrome = true }: { includeChrome?: boolean } = {}) {
    return (
      <CollectionsScreen
        actions={{
          loadMoreCollections,
          openCollectionComposer,
          openCollectionSearch,
          renderCollection,
          renderCollectionSkeletonRows,
          renderListLoadingFooter
        }}
        data={{
          appSheets: includeChrome ? renderAppSheets() : null,
          bottomAppBar: includeChrome && !showCollectionForm ? renderBottomAppBar("collections") : null,
          collectionComposerSheet: includeChrome ? renderCollectionComposerSheet() : null,
          collections,
          collectionsColdSkeletonVisible,
          collectionsError,
          collectionsListPerfProps: COLLECTION_LIST_PERF_PROPS,
          toast: includeChrome ? renderToast(showCollectionForm ? "footer" : "bottomNav") : null
        }}
        state={{
          collectionsLoadPhase,
          collectionsLoading,
          showCollectionForm
        }}
      />
    );
  }

  // The search screen, rendered both as the primary overlay and (chrome
  // suppressed) beneath a capture review opened from search — the same mounted
  // frame in both, so the close morph lands on the live row and the query /
  // results / scroll survive the review round trip.
  function renderSearchOverlay({ includeChrome = true }: { includeChrome?: boolean } = {}) {
    // A single "a search that could still change results is in flight" flag.
    // Covers the gap between the query changing and the remote key catching up,
    // so the empty state never flashes before results land. The screen masks it
    // for instant/cached responses and only surfaces a steady cue when slow.
    const searchPending =
      remoteSearchActive &&
      (remoteSearchLoading || remoteSearchEnhancing || remoteSearchKey !== currentSearchKey);
    const emptyTitle = searchQuery.trim()
      ? "No matches yet."
      : "What do you remember?";
    const emptyText = searchQuery.trim()
      ? "Try a place, product, source, collection, note, date, or why you saved it."
      : "Search looks across titles, notes, sources, collections, reminders, and saved details.";
    // Absolute-fill wrapper so the search screen keeps the SAME tree position
    // (the underlay slot) whether or not a review is open over it — a position
    // change would remount it, refiring autoFocus, popping the keyboard, and
    // resetting the result list's scroll mid-morph.
    return (
      <View style={styles.screenOverlay}>
        <SearchScreen
          actions={{
            closeSearch: () => setSearchOpen(false),
            renderSearchResult,
            setSearchQuery
          }}
          data={{
            appSheets: includeChrome ? renderAppSheets() : null,
            emptyText,
            emptyTitle,
            listPerfProps: CAPTURE_LIST_PERF_PROPS,
            renderSkeletonRows: renderCaptureSkeletonRows,
            searchMotion,
            searchPending,
            searchResults,
            toast: includeChrome ? renderToast() : null
          }}
          state={{
            searchQuery
          }}
        />
      </View>
    );
  }

  function renderTopLevelStack({
    active = "recent",
    underlay = null,
    overlay = null,
    overlayHandoff = null
  }: {
    active?: "recent" | "collections";
    // The source list kept mounted beneath a review overlay (collection detail
    // or search), so the close morph lands on the live row.
    underlay?: ReactNode;
    overlay?: ReactNode;
    overlayHandoff?: ReviewHandoffState | null;
  } = {}) {
    const overlayVisible = Boolean(overlay) || Boolean(underlay);
    // The tab bar / gradient / FAB only change while the pane is fully
    // covered — never during a flight. Unmounting them at the open tap
    // popped the bottom of the screen mid-morph (the review is still mostly
    // transparent); on close they must already be there for the landing.
    // The collection detail's pane transition gets the same treatment via
    // its entering/closing flags.
    const paneChromeVisible =
      !overlayVisible ||
      Boolean(reviewHandoff) ||
      collectionDetailEntering ||
      Boolean(closingCollectionDetail);
    return (
      <View collapsable={false} ref={handoffRootRef} style={styles.screenStack}>
        <TopLevelPane active={active === "recent"} direction={-1}>
          {renderHomeScreen({ includeChrome: active === "recent" && paneChromeVisible })}
        </TopLevelPane>
        <TopLevelPane active={active === "collections"} direction={1}>
          {renderCollectionsScreen({ includeChrome: active === "collections" && paneChromeVisible })}
        </TopLevelPane>
        {underlay}
        {overlay ? (
          <ScreenOverlayFrame handoff={overlayHandoff} progress={reviewHandoffProgress}>
            {overlay}
          </ScreenOverlayFrame>
        ) : null}
        {reviewHandoff ? (
          <ReviewHandoffOverlay
            arrived={reviewHandoffArrived}
            cancelled={reviewHandoffCancelled}
            copyReady={reviewHandoffCopyReady}
            handoff={reviewHandoff}
            heroReady={reviewHandoffHeroReady}
            onCopyShown={markReviewHandoffCopyShown}
            onDone={finishReviewHandoff}
            progress={reviewHandoffProgress}
            target={reviewHandoffTarget}
          />
        ) : null}
      </View>
    );
  }

  function renderBootScreen() {
    return (
      <View style={styles.bootBlank}>
        <StatusBar barStyle={appTheme.statusBarStyle} />
      </View>
    );
  }

  // The collection detail pane. Rendered for the open detail, for the frozen
  // snapshot animating out, and (chrome suppressed) beneath a capture review
  // opened from the collection — the same mounted frame in all three, so the
  // list keeps its scroll position across the review round trip.
  function renderCollectionDetailOverlay(
    collection: Collection,
    { direction, includeChrome = true }: { direction: "opening" | "closing"; includeChrome?: boolean }
  ) {
    return (
      <CollectionDetailFrame
        direction={direction}
        onClosed={finishCloseCollectionDetail}
        onOpened={finishOpenCollectionDetail}
        progress={collectionDetailProgress}
      >
        <CollectionDetailScreen
          actions={{
            closeCollectionDetail,
            loadMoreCollectionCaptures,
            openCollectionEditor,
            renderCollectionCapture,
            renderCollectionCaptureSkeletonRows,
            renderListLoadingFooter,
            retryLoadCollectionCaptures
          }}
          data={{
            appSheets: includeChrome ? (
              <>
                {renderAppSheets()}
                {renderCollectionComposerSheet()}
              </>
            ) : null,
            collectionCaptures,
            collectionCapturesColdSkeletonVisible,
            collectionCapturesError,
            collectionCapturesForId,
            collectionCapturesLoadPhase,
            collectionCapturesLoading,
            collectionDetailListRef,
            listPerfProps: COLLECTION_CAPTURE_LIST_PERF_PROPS,
            selectedCollection: collection,
            toast: includeChrome ? renderToast("footer") : null
          }}
        />
      </CollectionDetailFrame>
    );
  }

  if (!authReady) {
    return renderBootScreen();
  }

  // Review opened from a collection: the detail stays mounted beneath the
  // review overlay so the close morph lands on the live row and the list
  // keeps its scroll position. Checked before the plain detail branch.
  if (selected && captureReviewOrigin === "collection" && selectedCollection) {
    return renderTopLevelStack({
      active: "collections",
      underlay: renderCollectionDetailOverlay(selectedCollection, {
        direction: "opening",
        includeChrome: false
      }),
      overlay: renderCaptureReviewScreen(selected),
      overlayHandoff: reviewHandoff?.captureId === selected.id ? reviewHandoff : null
    });
  }

  // Review opened from search: the search screen stays mounted beneath the
  // review overlay so the close morph lands on the live result row and the
  // query/results/scroll survive the round trip. Checked before the plain
  // searchOpen branch.
  if (selected && captureReviewOrigin === "search" && searchOpen) {
    return renderTopLevelStack({
      active: "recent",
      underlay: renderSearchOverlay({ includeChrome: false }),
      overlay: renderCaptureReviewScreen(selected),
      overlayHandoff: reviewHandoff?.captureId === selected.id ? reviewHandoff : null
    });
  }

  if (selectedCollection) {
    return renderTopLevelStack({
      active: "collections",
      underlay: renderCollectionDetailOverlay(selectedCollection, { direction: "opening" })
    });
  }

  if (closingCollectionDetail) {
    return renderTopLevelStack({
      active: "collections",
      underlay: renderCollectionDetailOverlay(closingCollectionDetail, { direction: "closing" })
    });
  }

  if (collectionSearchOpen) {
    return renderTopLevelStack({
      active: "collections",
      overlay: (
        <CollectionSearchScreen
          actions={{
            closeCollectionSearch,
            renderCollection,
            setCollectionSearchQuery
          }}
          data={{
            appSheets: renderAppSheets(),
            collectionSearchMotion: searchMotion,
            collectionSearchResults,
            listPerfProps: COLLECTION_LIST_PERF_PROPS,
            toast: renderToast()
          }}
          state={{
            collectionSearchQuery
          }}
        />
      )
    });
  }

  if (collectionsOpen) {
    return renderTopLevelStack({ active: "collections" });
  }

  if (selected) {
    if (captureReviewOrigin === "recent") {
      return renderTopLevelStack({
        active: "recent",
        overlay: renderCaptureReviewScreen(selected),
        overlayHandoff: reviewHandoff?.captureId === selected.id ? reviewHandoff : null
      });
    }
    if (captureReviewOrigin === "collection") {
      return renderTopLevelStack({ active: "collections", overlay: renderCaptureReviewScreen(selected) });
    }
    return renderCaptureReviewScreen(selected);
  }

  if (closingReviewCapture && reviewHandoff?.direction === "closing") {
    return renderTopLevelStack({
      active: "recent",
      overlay: renderCaptureReviewScreen(closingReviewCapture),
      overlayHandoff: reviewHandoff
    });
  }

  if (authReady && config?.apiUrl && !session) {
    return (
      <AuthScreen
        actions={{
          backToSignIn,
          sendEmailAuthLink: () => void sendEmailAuthLink(),
          setAuthEmail,
          startGoogleSignIn: () => void startGoogleSignIn()
        }}
        data={{
          appSheets: renderAppSheets(),
          message
        }}
        state={{
          authEmail,
          authLoading,
          authPendingEmail,
          authScreen
        }}
      />
    );
  }

  if (searchOpen) {
    // Search lives in the underlay slot (not overlay) so it holds the same tree
    // position when a review opens over it — see renderSearchOverlay.
    return renderTopLevelStack({
      active: "recent",
      underlay: renderSearchOverlay()
    });
  }

  return renderTopLevelStack({ active: "recent" });

}
