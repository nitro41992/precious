import "react-native-url-polyfill/auto";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Dimensions,
  Easing,
  InteractionManager,
  Keyboard,
  Linking,
  Platform,
  TextInput,
  View,
  useWindowDimensions
} from "react-native";
import { Image } from "expo-image";
import type { FlashListRef } from "@shopify/flash-list";

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
import { styles } from "./ui/styles";

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
import { CollectionsScreen } from "./screens/CollectionsScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { SearchScreen } from "./screens/SearchScreen";

import type { MapSearchCandidate } from "./captureLogic";
import {
  captureIntentPatchBody,
  collectionSelectionActionState,
  capturesForListMode,
  extractHttpUrl,
  isDeleted,
  mergeRemoteCaptures,
  parseCaptureUrl,
  reviewTargetsForCapture,
  sortCaptures
} from "./captureLogic";

const DELETE_UNDO_MS = 8000;

const CAPTURE_LIST_PERF_PROPS = {
  initialNumToRender: 8,
  maxToRenderPerBatch: 8,
  removeClippedSubviews: Platform.OS === "android",
  showsHorizontalScrollIndicator: false,
  showsVerticalScrollIndicator: false,
  updateCellsBatchingPeriod: 40,
  windowSize: 7
};
const COLLECTION_LIST_PERF_PROPS = {
  initialNumToRender: 12,
  maxToRenderPerBatch: 12,
  removeClippedSubviews: Platform.OS === "android",
  showsHorizontalScrollIndicator: false,
  showsVerticalScrollIndicator: false,
  updateCellsBatchingPeriod: 40,
  windowSize: 7
};

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
  const [captureReviewOrigin, setCaptureReviewOrigin] = useState<"recent" | "collection" | "other" | null>(null);
  const [capturesLoading, setCapturesLoading] = useState(false);
  const [capturesLoadPhase, setCapturesLoadPhase] = useState<LoadPhase>("idle");
  const [capturesError, setCapturesError] = useState("");
  const [activeCapturesLoadedOnce, setActiveCapturesLoadedOnce] = useState(false);
  const [archivedCapturesLoading, setArchivedCapturesLoading] = useState(false);
  const [, setArchivedCapturesLoadPhase] = useState<LoadPhase>("idle");
  const [archivedCapturesError, setArchivedCapturesError] = useState("");
  const [archivedCapturesLoaded, setArchivedCapturesLoaded] = useState(false);
  const [capturesNextCursor, setCapturesNextCursor] = useState<string | null>(null);
  const [archivedCapturesNextCursor, setArchivedCapturesNextCursor] = useState<string | null>(null);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
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
  const [reminderSheetOpen, setReminderSheetOpen] = useState(false);
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [faviconFailures, setFaviconFailures] = useState<Record<string, boolean>>({});
  const [savingCapture, setSavingCapture] = useState(false);
  const [pickingCaptureImage, setPickingCaptureImage] = useState(false);
  const [captureImageLoadStates, setCaptureImageLoadStates] = useState<Record<string, CaptureImageLoadState>>({});
  const [captureRowRevealStates, setCaptureRowRevealStates] = useState<Record<string, boolean>>({});
  const [homeFeedReadyKey, setHomeFeedReadyKey] = useState("");
  const [collectionFeedReadyKey, setCollectionFeedReadyKey] = useState("");
  const latestNoteRef = useRef("");
  const capturesRef = useRef<Capture[]>([]);
  const archivedCapturesRef = useRef<Capture[]>([]);
  const activeCapturesLoadedOnceRef = useRef(false);
  const archivedCapturesLoadedRef = useRef(false);
  const capturePageCacheHydratedRef = useRef<Record<CaptureListMode, string | null>>({ active: null, archived: null });
  const collectionPageCacheHydratedRef = useRef<Record<CollectionListMode, string | null>>({ active: null, archived: null });
  const collectionsCacheRef = useRef<Record<CollectionListMode, Collection[]>>({ active: [], archived: [] });
  const collectionsCursorCacheRef = useRef<Record<CollectionListMode, string | null>>({ active: null, archived: null });
  const collectionsLoadedOnceRef = useRef<Record<CollectionListMode, boolean>>({ active: false, archived: false });
  const collectionsModeRef = useRef<CollectionListMode>("active");
  const collectionCapturesCacheRef = useRef<Record<string, Capture[]>>({});
  const collectionCapturesCursorCacheRef = useRef<Record<string, string | null>>({});
  const captureDetailHydrationRef = useRef<Set<string>>(new Set());
  const placeResolutionRef = useRef<Set<string>>(new Set());
  const captureImageLoadStatesRef = useRef<Record<string, CaptureImageLoadState>>({});
  const captureRowRevealStatesRef = useRef<Record<string, boolean>>({});
  const collectionsPrefetchStartedRef = useRef(false);
  const sourceInputRef = useRef<TextInput>(null);
  const noteInputRef = useRef<TextInput>(null);
  const collectionTitleInputRef = useRef<TextInput>(null);
  const collectionDetailListRef = useRef<FlashListRef<Capture>>(null);
  const lastKeyboardHeightRef = useRef(0);
  const captureComposerClosingRef = useRef(false);
  const captureImagePickerActiveRef = useRef(false);
  const searchMotion = useRef(new Animated.Value(0)).current;
  const reviewMotion = useRef(new Animated.Value(0)).current;
  const captureComposerMotion = useRef(new Animated.Value(0)).current;
  const captureKeyboardInset = useRef(new Animated.Value(0)).current;
  const skeletonPulse = useRef(new Animated.Value(0)).current;
  const homeRowsFade = useRef(new Animated.Value(0)).current;
  const collectionRowsFade = useRef(new Animated.Value(0)).current;
  const collectionListFade = useRef(new Animated.Value(0)).current;

  const markCaptureImageLoadState = useCallback((key: string, state: CaptureImageLoadState) => {
    if (!key || captureImageLoadStatesRef.current[key] === state) return;
    const next = { ...captureImageLoadStatesRef.current, [key]: state };
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

  function commitCaptureRows(
    mode: CaptureListMode,
    updater: (current: Capture[]) => Capture[]
  ) {
    if (mode === "archived") {
      const current = capturesForListMode(archivedCapturesRef.current, "archived");
      const next = capturesForListMode(updater(current), "archived");
      archivedCapturesRef.current = next;
      setArchivedCaptures(next);
      return next;
    }
    const current = capturesForListMode(capturesRef.current, "active");
    const next = capturesForListMode(updater(current), "active");
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

  function scrollCollectionSettingsIntoView() {
    requestAnimationFrame(() => {
      collectionDetailListRef.current?.scrollToEnd({ animated: true });
    });
    setTimeout(() => {
      collectionDetailListRef.current?.scrollToEnd({ animated: true });
    }, 260);
  }

  const clearAuthenticatedState = useCallback(() => {
    setCaptures([]);
    setArchivedCaptures([]);
    setCapturesLoadPhase("idle");
    setArchivedCapturesLoadPhase("idle");
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
    if (!authReady || (config?.apiUrl && !session?.accessToken)) {
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
    if (config?.apiUrl && session?.accessToken) {
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
    remoteSearchActive,
    remoteSearchEnhancing,
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
    if (!config?.apiUrl || !session?.accessToken) {
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
    options: { append?: boolean; before?: string | null; phase?: CollectionCapturesLoadPhase } = {}
  ) => {
    const phase = options.phase || (options.append ? "append" : "initial");
    if (!config?.apiUrl || !session?.accessToken) {
      setCollectionCaptures([]);
      setCollectionCapturesForId(collectionId);
      setCollectionCapturesNextCursor(null);
      setCollectionCapturesLoadPhase("idle");
      setCollectionCapturesError("");
      return;
    }
    setCollectionCapturesLoading(true);
    setCollectionCapturesLoadPhase(phase);
    setCollectionCapturesError("");
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
      const merged = options.append
        ? capturesForListMode(
            uniqueCaptures([...(collectionCapturesCacheRef.current[collectionId] || []), ...next]),
            "active"
          )
        : next;
      collectionCapturesCacheRef.current[collectionId] = merged;
      collectionCapturesCursorCacheRef.current[collectionId] = json.next_cursor || null;
      setCollectionCaptures(merged);
      setCollectionCapturesNextCursor(json.next_cursor || null);
      setCollectionCapturesForId(collectionId);
      setCollectionCapturesError("");
    } finally {
      setCollectionCapturesLoading(false);
      setCollectionCapturesLoadPhase("idle");
    }
  }, [config, session, withFreshAccessToken]);

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
    if (!captureRef || !config?.apiUrl || !session?.accessToken) return;
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
      !session?.accessToken ||
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
    setSelectedId(captureId);
  }, []);

  const selectCollection = useCallback((collectionId: string | null) => {
    setCollectionFeedReadyKey("");
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
    setSelectedCollectionId(collectionId);
    setCaptureReturnCollectionId(null);
    setCollectionDraftDirty(false);
    setShowCollectionForm(false);
  }, []);

  const openCapture = useCallback(
    (captureId: string | null) => {
      if (!captureId) return;
      setSearchOpen(false);
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
      selectCapture(capture.id);
      setDraftTitle(capture.title);
      setDraftNote(capture.note);
      setDraftIntent(normalizeIntent(capture.defaultIntent));
    },
    [archivedCaptures, captures, remoteSearchResults, selectCapture]
  );

  const openRecentCapture = useCallback(
    (captureId: string) => {
      openCapture(captureId);
      setCaptureReviewOrigin("recent");
    },
    [openCapture]
  );

  const openCaptureFromCollection = useCallback((capture: Capture, collectionId: string) => {
    setSearchOpen(false);
    setCollectionsOpen(false);
    setSelectedCollectionId(null);
    setCaptureReturnCollectionId(collectionId);
    setCaptureReviewOrigin("collection");
    selectCapture(capture.id);
    setDraftTitle(capture.title);
    setDraftNote(capture.note);
    setDraftIntent(normalizeIntent(capture.defaultIntent));
  }, [selectCapture]);

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
    setMessage("");
    setSearchOpen(true);
  }

  function openRecentHome() {
    selectCapture(null);
    selectCollection(null);
    setSearchOpen(false);
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

  function openCaptureComposer() {
    setShowCollectionForm(false);
    const screenHeight = Dimensions.get("screen").height;
    const estimatedKeyboardHeight = lastKeyboardHeightRef.current || Math.round(screenHeight * (Platform.OS === "ios" ? 0.34 : 0.4));
    setMessage("");
    setCaptureMode(DEFAULT_CAPTURE_COMPOSER_MODE);
    captureComposerClosingRef.current = false;
    setCaptureComposerClosing(false);
    setKeyboardHeight(estimatedKeyboardHeight);
    captureComposerMotion.stopAnimation();
    captureKeyboardInset.stopAnimation();
    captureComposerMotion.setValue(0);
    captureKeyboardInset.setValue(estimatedKeyboardHeight);
    setShowCaptureComposer(true);
  }

  function openCollectionComposer() {
    selectCapture(null);
    selectCollection(null);
    setSearchOpen(false);
    setCollectionsOpen(true);
    setAccountSheetOpen(false);
    setMessage("");
    setCollectionTitle("");
    setCollectionDescription("");
    setCollectionDraftDirty(false);
    setShowCaptureComposer(false);
    const screenHeight = Dimensions.get("screen").height;
    const estimatedKeyboardHeight = lastKeyboardHeightRef.current || Math.round(screenHeight * (Platform.OS === "ios" ? 0.34 : 0.4));
    setKeyboardHeight(estimatedKeyboardHeight);
    captureComposerMotion.stopAnimation();
    captureKeyboardInset.stopAnimation();
    captureComposerMotion.setValue(0);
    captureKeyboardInset.setValue(estimatedKeyboardHeight);
    setShowCollectionForm(true);
  }

  function openNoteSheet() {
    const screenHeight = Dimensions.get("screen").height;
    const estimatedKeyboardHeight = lastKeyboardHeightRef.current || Math.round(screenHeight * (Platform.OS === "ios" ? 0.34 : 0.4));
    setQuickIntentOpen(false);
    setMessage("");
    captureComposerMotion.stopAnimation();
    captureKeyboardInset.stopAnimation();
    captureComposerMotion.setValue(0);
    captureKeyboardInset.setValue(estimatedKeyboardHeight);
    setKeyboardHeight(estimatedKeyboardHeight);
    setNoteSheetOpen(true);
  }

  function closeNoteSheet() {
    Keyboard.dismiss();
    setNoteSheetOpen(false);
    setKeyboardHeight(0);
    captureKeyboardInset.setValue(0);
  }

  function closeCaptureComposer() {
    if (!showCaptureComposer || captureComposerClosing) return;
    captureComposerClosingRef.current = true;
    setCaptureComposerClosing(true);
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(captureComposerMotion, {
        duration: 170,
        easing: Easing.in(Easing.cubic),
        toValue: 0,
        useNativeDriver: false
      }),
      Animated.timing(captureKeyboardInset, {
        duration: 180,
        easing: Easing.in(Easing.cubic),
        toValue: 0,
        useNativeDriver: false
      })
    ]).start(() => {
      resetCaptureComposerSurface();
    });
  }

  function closeCollectionComposer() {
    Keyboard.dismiss();
    setShowCollectionForm(false);
    setCollectionTitle("");
    setCollectionDescription("");
    setCollectionDraftDirty(false);
    setKeyboardHeight(0);
    captureKeyboardInset.setValue(0);
  }

  function chooseCaptureMode(mode: CaptureComposerMode) {
    if (mode === "image") {
      void pickCaptureImage();
      return;
    }
    setCaptureMode(mode);
    requestAnimationFrame(() => sourceInputRef.current?.focus());
  }

  async function openCollectionsScreen(mode: CollectionListMode = collectionsMode) {
    selectCapture(null);
    setSearchOpen(false);
    setAccountSheetOpen(false);
    setCollectionsMode(mode);
    setCollectionsOpen(true);
    setSelectedCollectionId(null);
    const cached = collectionsCacheRef.current[mode];
    if (cached.length || collectionsLoadedOnceRef.current[mode]) setCollections(cached);
    else setCollections([]);
    setCollectionsError("");
    try {
      await loadCollections(mode);
    } catch (error) {
      const text = friendlyError(error, "Could not load collections.");
      setCollectionsError(text);
    }
  }

  function markFaviconFailed(host: string) {
    if (!host) return;
    setFaviconFailures((current) => (current[host] ? current : { ...current, [host]: true }));
  }

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
    setActiveCapturesLoadedOnce(false);
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
    if (!authReady || (config?.apiUrl && !session?.accessToken)) {
      setCapturesLoadPhase("cold");
      return;
    }
    void loadCaptures().catch((error) => {
      setCapturesError((current) => current || friendlyError(error, "Could not load captures"));
    });
  }, [authReady, config?.apiUrl, loadCaptures, session?.accessToken]);

  useEffect(() => {
    if (!config?.apiUrl || !session?.accessToken || collectionsPrefetchStartedRef.current) return;
    collectionsPrefetchStartedRef.current = true;
    const task = InteractionManager.runAfterInteractions(() => {
      void loadCollections("active").catch(() => {
        collectionsPrefetchStartedRef.current = false;
      });
    });
    return () => task.cancel();
  }, [config?.apiUrl, loadCollections, session?.accessToken]);

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

  useEffect(() => {
    prefetchImageUrls(
      collections.flatMap((collection) =>
        (collection.previewCaptures || []).map((capture) => capture.imageAssetUrl || capture.thumbnailUrl || "")
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
    captureReturnCollectionId,
    captures,
    closeCaptureComposer,
    closeCollectionComposer,
    closeNoteSheet,
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
    setCollectionTitle,
    setCollectionsOpen,
    setDraftIntent,
    setDraftNote,
    setDraftTitle,
    setKeyboardHeight,
    setSearchOpen,
    showCaptureComposer,
    showCollectionForm,
    skeletonPulse,
    sourceInputRef
  });

  const selectedDraftKey = selected ? captureDraftKey(selected) : "";

  useEffect(() => {
    if (!selected) return;
    void loadCaptureDetail(selected);
  }, [loadCaptureDetail, selected?.id, selected?.remoteId]);

  useEffect(() => {
    if (!selected) return;
    void resolveCapturePlace(selected);
  }, [
    resolveCapturePlace,
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
    const timer = setTimeout(() => setToast(null), toast.durationMs ?? 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const appSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
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
      if (!captureReturnCollectionId) {
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
  }, [captureReturnCollectionId, loadCollectionCaptures, selectedCollection?.captureCount, selectedCollection?.status, selectedCollectionId]);

  function applyUpdatedCapture(updatedCapture: Capture, previousId: string) {
    const matchesCapture = (item: Capture) =>
      item.id === previousId ||
      item.remoteId === previousId ||
      item.id === updatedCapture.id ||
      Boolean(updatedCapture.remoteId && item.remoteId === updatedCapture.remoteId);
    for (const [collectionId, rows] of Object.entries(collectionCapturesCacheRef.current)) {
      collectionCapturesCacheRef.current[collectionId] = capturesForListMode(
        rows.map((item) => matchesCapture(item) ? updatedCapture : item),
        "active"
      );
    }
    setCaptures((current) =>
      capturesForListMode(current.map((item) => (matchesCapture(item) ? updatedCapture : item)), "active")
    );
    setArchivedCaptures((current) =>
      capturesForListMode(current.map((item) => (matchesCapture(item) ? updatedCapture : item)), "archived")
    );
    setCollectionCaptures((current) =>
      capturesForListMode(current.map((item) => (matchesCapture(item) ? updatedCapture : item)), "active")
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
    if (config?.apiUrl && session?.accessToken) {
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

    if (config?.apiUrl && session?.accessToken) {
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
    if (config?.apiUrl && session?.accessToken) {
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
    if (!config?.apiUrl || !session?.accessToken) throw new Error("Sign in to manage collections.");
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
    if (!config?.apiUrl || !session?.accessToken) {
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
        Keyboard.dismiss();
        setCollectionTitle("");
        setCollectionDescription("");
        setShowCollectionForm(false);
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
    selectCollection(null);
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
    if (config?.apiUrl && session?.accessToken) {
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
    if (config?.apiUrl && session?.accessToken) {
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
    if (config?.apiUrl && session?.accessToken) {
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
    removeCaptureFromVisibleLists(capture);
    selectCapture(null);
    if (returnCollectionId) selectCollection(returnCollectionId);
    setToast(null);
    showToast({
      text: "Capture deleted.",
      tone: "destructive",
      durationMs: DELETE_UNDO_MS,
      actionLabel: "Undo",
      action: () => void undoDeleteCapture(capture, returnCollectionId)
    });
    if (config?.apiUrl && session?.accessToken) {
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
    if (!nativeStore) return;
    try {
      const raw = nativeStore.deleteCapture
        ? await nativeStore.deleteCapture(capture.id)
        : await nativeStore.archiveCapture(capture.id);
      replaceLocalCaptureLists(JSON.parse(raw || "[]") as Capture[]);
    } catch (error) {
      upsertActiveCapture(capture);
      showErrorToast(error, "Could not delete.");
    }
  }

  async function saveCaptureSource() {
    const source = sourceDraft.trim();
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

  async function pickCaptureImage() {
    if (pickingCaptureImage || captureImagePickerActiveRef.current) return;
    if (!nativeStore?.captureImage) {
      showToast("Image upload is unavailable in this build.", "error");
      return;
    }
    captureImagePickerActiveRef.current = true;
    setPickingCaptureImage(true);
    setToast(null);
    try {
      const raw = await nativeStore.captureImage();
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



  const {
    renderBottomAppBar,
    renderCaptureSkeletonRows,
    renderCollection,
    renderCollectionCapture,
    renderCollectionCaptureSkeletonRows,
    renderCollectionSkeletonRows,
    renderHomeRow,
    renderListLoadingFooter,
    renderSearchProgress,
    renderSearchResult,
    renderToast
  } = createAppRenderHelpers({
    activeCapturesLoadedOnce,
    captureImageLoadStates,
    captureRowRevealStates,
    capturesLoading,
    collectionFeedRevealPending,
    collectionListFade,
    collectionRowsFade,
    failedFavicons: faviconFailures,
    homeFeedRevealPending,
    homeRowsFade,
    onAccountActionsPress: openAccountActions,
    onCaptureImageLoadState: markCaptureImageLoadState,
    onCollectionComposerOpen: openCollectionComposer,
    onCollectionDescriptionChange: setCollectionDescription,
    onCollectionPress: selectCollection,
    onCollectionTitleChange: setCollectionTitle,
    onCollectionsScreenOpen: (mode) => void openCollectionsScreen(mode),
    onFaviconFailure: markFaviconFailed,
    onOpenCapture: openCapture,
    onOpenCaptureFromCollection: openCaptureFromCollection,
    onOpenRecentCapture: openRecentCapture,
    onRecentComposerOpen: openCaptureComposer,
    onRecentHomePress: openRecentHome,
    onUnlinkCaptureFromCollection: (collectionId, capture) => void unlinkCaptureFromCollection(collectionId, capture),
    searchQuery,
    selectedCollection,
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
    return (
      <CaptureReviewScreen
        actions={{
          closeNoteSheet,
          copySource,
          deleteCapture: () => void deleteSelectedCapture(),
          markFaviconFailed,
          openCaptureUrl,
          openCollectionPicker: () => void openCollectionPicker(),
          openExternalUrl: (url) => void Linking.openURL(url),
          openNoteSheet,
          openVisitTargetMaps: (candidate) => void openVisitTargetMaps(candidate),
          pasteExpandedUrl: () => void pasteExpandedUrl(),
          removeReminder: (reminderIndex) => void dismissReminder(reminderIndex),
          saveReminder: (draft, reminderIndex) => void saveReminder(draft, reminderIndex),
          savePurposeIntent: (intent) => void savePurposeIntent(intent),
          saveReviewDecisions: () => void saveReviewDecisions(),
          selectCapture,
          selectCollection,
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
          captureReturnCollectionId,
          faviconFailures,
          keyboardHeight,
          noteInputRef,
          reviewMotion,
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
          renderCaptureSkeletonRows,
          renderHomeRow,
          renderListLoadingFooter,
          saveCaptureSource: () => void saveCaptureSource(),
          setSourceDraft
        }}
        data={{
          appSheets: includeChrome ? renderAppSheets() : null,
          bottomAppBar: includeChrome && !showCaptureComposer ? renderBottomAppBar("recent") : null,
          captureComposerMotion,
          captureKeyboardInset,
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

  function renderRecentStack(overlay?: ReactNode) {
    return (
      <View style={styles.screenStack}>
        {renderHomeScreen({ includeChrome: !overlay })}
        {overlay ? (
          <View style={styles.screenOverlay}>
            {overlay}
          </View>
        ) : null}
      </View>
    );
  }


  if (selectedCollection) {
    return (
      <CollectionDetailScreen
        actions={{
          deleteCollection: (collection) => void deleteCollection(collection),
          loadMoreCollectionCaptures,
          renderCollectionCapture,
          renderCollectionCaptureSkeletonRows,
          renderListLoadingFooter,
          retryLoadCollectionCaptures,
          saveCollection: () => void saveCollection(),
          scrollCollectionSettingsIntoView,
          selectCollection,
          setCollectionDescription,
          setCollectionDraftDirty,
          setCollectionTitle
        }}
        data={{
          appSheets: renderAppSheets(),
          collectionCaptures,
          collectionCapturesColdSkeletonVisible,
          collectionCapturesError,
          collectionCapturesForId,
          collectionCapturesLoadPhase,
          collectionCapturesLoading,
          collectionDetailListRef,
          keyboardHeight,
          listPerfProps: CAPTURE_LIST_PERF_PROPS,
          selectedCollection,
          toast: renderToast("footer")
        }}
        state={{
          collectionDescription,
          collectionTitle
        }}
      />
    );
  }

  if (collectionsOpen) {
    return (
      <CollectionsScreen
        actions={{
          loadMoreCollections,
          openCollectionComposer,
          renderCollection,
          renderCollectionSkeletonRows,
          renderListLoadingFooter
        }}
        data={{
          appSheets: renderAppSheets(),
          bottomAppBar: !showCollectionForm ? renderBottomAppBar("collections") : null,
          collectionComposerSheet: renderCollectionComposerSheet(),
          collections,
          collectionsColdSkeletonVisible,
          collectionsError,
          collectionsListPerfProps: COLLECTION_LIST_PERF_PROPS,
          toast: renderToast(showCollectionForm ? "footer" : "bottomNav")
        }}
        state={{
          collectionsLoadPhase,
          collectionsLoading,
          showCollectionForm
        }}
      />
    );
  }

  if (selected) {
    if (captureReviewOrigin === "recent") {
      return renderRecentStack(renderCaptureReviewScreen(selected));
    }
    return renderCaptureReviewScreen(selected);
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
    const searchIsLoading = remoteSearchActive && (remoteSearchLoading || remoteSearchEnhancing);
    const searchProgressLabel = remoteSearchLoading
      ? "Searching saved things"
      : remoteSearchEnhancing
        ? "Refining matches"
        : "";
    const emptyTitle = searchQuery.trim()
      ? "No matches yet."
      : "What do you remember?";
    const emptyText = searchQuery.trim()
      ? "Try a place, product, source, collection, note, date, or why you saved it."
      : "Search looks across titles, notes, sources, collections, reminders, and saved details.";
    return (
      <SearchScreen
        actions={{
          closeSearch: () => setSearchOpen(false),
          renderSearchProgress,
          renderSearchResult,
          setSearchQuery
        }}
        data={{
          appSheets: renderAppSheets(),
          emptyText,
          emptyTitle,
          listPerfProps: CAPTURE_LIST_PERF_PROPS,
          searchIsLoading,
          searchMotion,
          searchProgressLabel,
          searchResults,
          toast: renderToast()
        }}
        state={{
          remoteSearchActive,
          searchQuery
        }}
      />
    );
  }

  return renderRecentStack();

}
