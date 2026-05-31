import "react-native-url-polyfill/auto";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  BackHandler,
  Dimensions,
  Easing,
  FlatList,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import {
  Archive,
  Bell,
  Check,
  Folder,
  Info,
  LogOut,
  Target,
  X
} from "lucide-react-native";

import { styles } from "./ui/styles";
import { colors } from "./ui/theme";

import {
  BottomAppBar,
  IconButton,
  SkeletonRevealFrame,
  Snackbar
} from "./ui/components";
import {
  CaptureRow,
  CaptureRowInlineSkeleton,
  CaptureSkeletonRows,
  CollectionRow,
  CollectionSkeletonRows
} from "./ui/rows";

import type {
  AppConfig,
  AuthCallbackPayload,
  AuthLoadingState,
  AuthScreenMode,
  AuthSession,
  Capture,
  CaptureComposerMode,
  CaptureImageLoadState,
  CaptureListMode,
  CaptureReviewDraft,
  CaptureStatus,
  Collection,
  CollectionCapturesLoadPhase,
  CollectionDecision,
  CollectionDraftAction,
  CollectionListMode,
  CollectionReviewDecision,
  HomeListRow,
  LinkedCollection,
  LoadPhase,
  LucideIconComponent,
  NoteSaveState,
  RationaleSheet,
  RemoteCaptureDetail,
  RemoteCapturePage,
  RemoteCollectionPage,
  ReminderDraftAction,
  ReminderReviewDecision,
  ReminderSuggestion,
  ReviewInsight,
  SearchRemoteMode,
  SearchScope,
  SnackbarState,
  VisitTarget
} from "./types";
import { DEFAULT_CAPTURE_COMPOSER_MODE } from "./types";
import {
  isAuthError,
  nativeAuth,
  nativeClipboard,
  nativeStore,
  requestJson
} from "./nativeBridge";

import {
  ADD_INTENT_LABEL,
  AUTH_CALLBACK_URL,
  INTENT_OPTIONS,
  activeIntentLabel,
  auditLikeText,
  authCallbackPayload,
  captureDisplayTitle,
  captureDraftKey,
  captureImageLoadKey,
  captureImageUrl,
  captureIntentLabel,
  captureOpenUrl,
  captureRowRevealKey,
  captureSourceHost,
  captureSourceLabel,
  captureStatusLabel,
  captureSupportLine,
  cleanSentence,
  cleanedReviewDraft,
  collectionChoiceFromDecision,
  collectionConfidenceLabel,
  collectionCountLabel,
  conciseText,
  consumerSummary,
  emailInputError,
  formatDateTime,
  friendlyError,
  groupedCaptureRows,
  humanize,
  isCaptureImageCancel,
  isImageCapture,
  isMapSource,
  linkedCollectionDraftKey,
  linkedCollectionsLabel,
  matchReasonForCapture,
  normalizeIntent,
  rawTitleLikeSource,
  reminderDraftKey,
  reminderLabel,
  reviewInsightForCapture,
  reviewStatusCue,
  searchableCaptureText,
  shouldGhostSourceMark,
  sourceFaviconUrl,
  sourceIconForCapture,
  suggestedCollectionDraftKey,
  uniqueCaptures,
  uniqueCollections,
  uniqueStrings,
  urlEvidenceMessage
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
  isEdgeCaptureApi,
  isFreshLocalProcessingCapture,
  sameStringSet,
  sortCollectionCaptures
} from "./remoteData";
import { AuthScreen } from "./screens/AuthScreen";
import { CaptureReviewScreen } from "./screens/CaptureReviewScreen";
import { CollectionDetailScreen } from "./screens/CollectionDetailScreen";
import { CollectionSelectorScreen } from "./screens/CollectionSelectorScreen";
import { CollectionsScreen } from "./screens/CollectionsScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { SearchScreen } from "./screens/SearchScreen";

import type { MapSearchCandidate } from "./captureLogic";
import {
  displayStatus,
  extractHttpUrl,
  isArchived,
  mapSearchCandidates,
  mergeRemoteCaptures,
  mergeSearchResults,
  parseCaptureUrl,
  reviewReasons,
  searchCacheKey,
  sortCaptures
} from "./captureLogic";

const PROCESSING_REFRESH_MS = 3000;
const RECENT_FEED_REVEAL_COUNT = 8;
const INITIAL_SKELETON_DELAY_MS = 180;
const SEARCH_KEYWORD_DEBOUNCE_MS = 120;
const SEARCH_HYBRID_DELAY_MS = 520;
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

function rationaleSectionIcon(label: string): LucideIconComponent {
  switch (label) {
    case "Collections":
      return Folder;
    case "Reminder idea":
      return Bell;
    default:
      return Target;
  }
}

function rationaleSectionIconStyle(label: string) {
  switch (label) {
    case "Collections":
      return styles.rationaleSheetSectionIconCollection;
    case "Reminder idea":
      return styles.rationaleSheetSectionIconReminder;
    default:
      return styles.rationaleSheetSectionIconIntent;
  }
}

export default function App() {
  const { height: windowHeight } = useWindowDimensions();
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [archivedCaptures, setArchivedCaptures] = useState<Capture[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [captureReturnCollectionId, setCaptureReturnCollectionId] = useState<string | null>(null);
  const [capturesLoading, setCapturesLoading] = useState(false);
  const [capturesLoadPhase, setCapturesLoadPhase] = useState<LoadPhase>("idle");
  const [homeColdSkeletonVisible, setHomeColdSkeletonVisible] = useState(false);
  const [capturesError, setCapturesError] = useState("");
  const [activeCapturesLoadedOnce, setActiveCapturesLoadedOnce] = useState(false);
  const [archivedCapturesLoading, setArchivedCapturesLoading] = useState(false);
  const [archivedCapturesLoadPhase, setArchivedCapturesLoadPhase] = useState<LoadPhase>("idle");
  const [archivedCapturesError, setArchivedCapturesError] = useState("");
  const [archivedCapturesLoaded, setArchivedCapturesLoaded] = useState(false);
  const [capturesNextCursor, setCapturesNextCursor] = useState<string | null>(null);
  const [archivedCapturesNextCursor, setArchivedCapturesNextCursor] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState<SearchScope>("active");
  const [searchScopeOpen, setSearchScopeOpen] = useState(false);
  const [remoteSearchResults, setRemoteSearchResults] = useState<Capture[]>([]);
  const [remoteSearchLoading, setRemoteSearchLoading] = useState(false);
  const [remoteSearchEnhancing, setRemoteSearchEnhancing] = useState(false);
  const [remoteSearchKey, setRemoteSearchKey] = useState("");
  const [remoteSearchError, setRemoteSearchError] = useState("");
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [collectionsMode, setCollectionsMode] = useState<CollectionListMode>("active");
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectionsLoadPhase, setCollectionsLoadPhase] = useState<LoadPhase>("idle");
  const [collectionsColdSkeletonVisible, setCollectionsColdSkeletonVisible] = useState(false);
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
  const [collectionCapturesColdSkeletonVisible, setCollectionCapturesColdSkeletonVisible] = useState(false);
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
  const [collectionCreateTitle, setCollectionCreateTitle] = useState("");
  const [collectionCreateDescription, setCollectionCreateDescription] = useState("");
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
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null);
  const [visitTargetMapCandidates, setVisitTargetMapCandidates] = useState<MapSearchCandidate[]>([]);
  const [sourceDraft, setSourceDraft] = useState("");
  const [captureMode, setCaptureMode] = useState<CaptureComposerMode>(DEFAULT_CAPTURE_COMPOSER_MODE);
  const [showCaptureComposer, setShowCaptureComposer] = useState(false);
  const [captureComposerClosing, setCaptureComposerClosing] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [noteSheetOpen, setNoteSheetOpen] = useState(false);
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [rationaleSheet, setRationaleSheet] = useState<RationaleSheet | null>(null);
  const [archiveCaptureConfirmOpen, setArchiveCaptureConfirmOpen] = useState(false);
  const [archiveCollectionTarget, setArchiveCollectionTarget] = useState<Collection | null>(null);
  const [faviconFailures, setFaviconFailures] = useState<Record<string, boolean>>({});
  const [savingCapture, setSavingCapture] = useState(false);
  const [pickingCaptureImage, setPickingCaptureImage] = useState(false);
  const [captureImageLoadStates, setCaptureImageLoadStates] = useState<Record<string, CaptureImageLoadState>>({});
  const [captureRowRevealStates, setCaptureRowRevealStates] = useState<Record<string, boolean>>({});
  const [homeFeedReadyKey, setHomeFeedReadyKey] = useState("");
  const [collectionFeedReadyKey, setCollectionFeedReadyKey] = useState("");
  const [authScreen, setAuthScreen] = useState<AuthScreenMode>("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPendingEmail, setAuthPendingEmail] = useState("");
  const [authLoading, setAuthLoading] = useState<AuthLoadingState>(null);
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
  const captureImageLoadStatesRef = useRef<Record<string, CaptureImageLoadState>>({});
  const captureRowRevealStatesRef = useRef<Record<string, boolean>>({});
  const collectionsPrefetchStartedRef = useRef(false);
  const sourceInputRef = useRef<TextInput>(null);
  const noteInputRef = useRef<TextInput>(null);
  const collectionTitleInputRef = useRef<TextInput>(null);
  const collectionDetailListRef = useRef<FlatList<Capture>>(null);
  const searchRequestSeqRef = useRef(0);
  const searchResultsCacheRef = useRef<Record<string, Capture[]>>({});
  const searchResultsModeRef = useRef<Record<string, SearchRemoteMode>>({});
  const lastKeyboardHeightRef = useRef(0);
  const captureComposerClosingRef = useRef(false);
  const captureImagePickerActiveRef = useRef(false);
  const pendingAuthCallbackUrlRef = useRef<string | null>(null);
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
      const next = updater(archivedCapturesRef.current);
      archivedCapturesRef.current = next;
      setArchivedCaptures(next);
      return next;
    }
    const next = updater(capturesRef.current);
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
    const rows = sortCaptures(
      page.captures.filter((capture) => mode === "archived" ? isArchived(capture) : !isArchived(capture))
    );
    if (mode === "archived") {
      if (!archivedCapturesRef.current.length) {
        commitCaptureRows("archived", () => rows);
        setArchivedCapturesLoaded(true);
        setArchivedCapturesNextCursor(page.nextCursor);
        return true;
      }
      return false;
    }
    const currentActiveRows = capturesRef.current;
    const canSeedActiveRows =
      !currentActiveRows.length || currentActiveRows.every((capture) => isFreshLocalProcessingCapture(capture));
    if (canSeedActiveRows) {
      commitCaptureRows("active", (current) => sortCaptures(uniqueCaptures([...rows, ...current])));
      setCapturesNextCursor(page.nextCursor);
      setActiveCapturesLoadedOnce(true);
      return true;
    }
    setActiveCapturesLoadedOnce(true);
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
    const cached = collectionCapturesCacheRef.current[collectionId] || [];
    if (cached.length) return uniqueCaptures(cached);
    const known = uniqueCaptures([
      ...capturesRef.current.filter((capture) => captureBelongsToCollection(capture, collectionId)),
      ...archivedCapturesRef.current.filter((capture) => captureBelongsToCollection(capture, collectionId))
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

  function clearAuthenticatedState() {
    setSession(null);
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
    setCollectionCapturesNextCursor(null);
    setCollectionCapturesLoadPhase("idle");
    setCollectionCapturesError("");
    searchResultsCacheRef.current = {};
    searchResultsModeRef.current = {};
  }

  const getFreshSession = useCallback(async (force = false) => {
    if (!session) return null;
    const raw = force && nativeAuth?.forceRefreshSession
      ? await nativeAuth.forceRefreshSession()
      : await nativeAuth?.refreshSession();
    if (!raw) {
      await nativeAuth?.clearSession();
      clearAuthenticatedState();
      return null;
    }
    const next = JSON.parse(raw) as AuthSession;
    if (
      next.accessToken !== session.accessToken ||
      next.refreshToken !== session.refreshToken ||
      next.expiresAt !== session.expiresAt
    ) {
      setSession(next);
    }
    return next;
  }, [session]);

  const withFreshAccessToken = useCallback(async function withFreshAccessToken<T>(
    send: (accessToken: string) => Promise<T>
  ): Promise<T> {
    const activeSession = await getFreshSession();
    if (!activeSession?.accessToken) throw new Error("Your session expired. Sign in again.");
    try {
      return await send(activeSession.accessToken);
    } catch (error) {
      if (!isAuthError(error)) throw error;
      const refreshed = await getFreshSession(true);
      if (!refreshed?.accessToken) throw new Error("Your session expired. Sign in again.");
      return await send(refreshed.accessToken);
    }
  }, [getFreshSession]);

  const loadCaptures = useCallback(async (
    mode: CaptureListMode = "active",
    options: { append?: boolean; before?: string | null } = {}
  ) => {
    const loadingSetter = mode === "archived" ? setArchivedCapturesLoading : setCapturesLoading;
    const phaseSetter = mode === "archived" ? setArchivedCapturesLoadPhase : setCapturesLoadPhase;
    const errorSetter = mode === "archived" ? setArchivedCapturesError : setCapturesError;
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
      const active = next.filter((capture) => !isArchived(capture));
      const archived = next.filter(isArchived);
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
      setMessage(text);
      throw error;
    } finally {
      loadingSetter(false);
      if (succeeded) phaseSetter("ready");
      if (mode === "active" && !options.append) setActiveCapturesLoadedOnce(true);
    }
  }, [config, session, withFreshAccessToken]);

  const loadMoreCaptures = useCallback((mode: CaptureListMode = "active") => {
    const cursor = mode === "archived" ? archivedCapturesNextCursor : capturesNextCursor;
    const loading = mode === "archived" ? archivedCapturesLoading : capturesLoading;
    if (!cursor || loading) return;
    void loadCaptures(mode, { append: true, before: cursor }).catch((error) => {
      setMessage((current) => current || friendlyError(error, "Could not load more captures"));
    });
  }, [
    archivedCapturesLoading,
    archivedCapturesNextCursor,
    capturesLoading,
    capturesNextCursor,
    loadCaptures
  ]);

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
      setMessage((current) => current || friendlyError(error, "Could not load more collections"));
    });
  }, [collectionsLoading, collectionsMode, collectionsNextCursor, loadCollections]);

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
      const next = (json.captures ?? []).map(captureFromRemote);
      const merged = options.append
        ? uniqueCaptures([...(collectionCapturesCacheRef.current[collectionId] || []), ...next])
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
      setMessage((current) => current || friendlyError(error, "Could not load more collection captures"));
    });
  }, [
    collectionCapturesLoading,
    collectionCapturesNextCursor,
    loadCollectionCaptures,
    selectedCollectionId
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
      setMessage((current) => current || text);
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

  const selectCapture = useCallback((captureId: string | null) => {
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
    setSelectedId(captureId);
  }, []);

  const selectCollection = useCallback((collectionId: string | null) => {
    setCollectionFeedReadyKey("");
    if (collectionId) {
      const collection = [...collectionsCacheRef.current.active, ...collectionsCacheRef.current.archived]
        .find((item) => item.id === collectionId);
      const hasNoCaptures = collection?.captureCount === 0;
      setCollectionCapturesLoading(!hasNoCaptures);
      setCollectionCapturesLoadPhase(
        hasNoCaptures ? "idle" : collectionCapturesCacheRef.current[collectionId]?.length ? "refresh" : "initial"
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

  const openCaptureFromCollection = useCallback((capture: Capture, collectionId: string) => {
    setSearchOpen(false);
    setCollectionsOpen(false);
    setSelectedCollectionId(null);
    setCaptureReturnCollectionId(collectionId);
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
      setMessage("Could not open source.");
    }
  }

  function openSearch() {
    selectCapture(null);
    selectCollection(null);
    setCollectionsOpen(false);
    setMessage("");
    setSearchScopeOpen(false);
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
      setMessage(text);
    }
  }

  function markFaviconFailed(host: string) {
    if (!host) return;
    setFaviconFailures((current) => (current[host] ? current : { ...current, [host]: true }));
  }

  function replaceLocalCaptureLists(next: Capture[]) {
    setCaptures(sortCaptures(next.filter((capture) => !isArchived(capture))));
    setArchivedCaptures(sortCaptures(next.filter(isArchived)));
  }

  async function persistSupabaseSession(accessToken: string, refreshToken: string, expiresAt: number) {
    if (!config?.supabaseUrl || !config.supabaseAnonKey || !nativeAuth) {
      throw new Error("Supabase URL and anon key are not configured in the Android build.");
    }
    const user = await requestJson<{ id?: string; user?: { id?: string } }>(`${config.supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: config.supabaseAnonKey,
        authorization: `Bearer ${accessToken}`
      }
    });
    const userId = user.id || user.user?.id;
    if (!userId) throw new Error("Could not finish sign in.");
    const next = { accessToken, refreshToken, expiresAt, userId };
    await nativeAuth.persistSession(accessToken, refreshToken, expiresAt, userId);
    setSession(next);
    setMessage("");
    setAuthScreen("signin");
  }

  async function handleAuthCallbackUrl(url: string | null | undefined) {
    const payload = authCallbackPayload(url);
    if (!payload) return false;
    if (!config?.supabaseUrl || !config.supabaseAnonKey || !nativeAuth) {
      pendingAuthCallbackUrlRef.current = url || null;
      return true;
    }
    if (payload.kind === "error") {
      setAuthScreen("signin");
      setMessage(payload.message || "The confirmation link could not be used.");
      return true;
    }
    setAuthLoading("callback");
    setMessage("Finishing sign in...");
    try {
      await persistSupabaseSession(payload.accessToken, payload.refreshToken, payload.expiresAt);
    } catch (error) {
      setAuthScreen("signin");
      setMessage(friendlyError(error, "Could not finish sign in."));
    } finally {
      setAuthLoading(null);
    }
    return true;
  }

  useEffect(() => {
    nativeAuth?.getConfig().then((raw) => {
      setConfig(JSON.parse(raw || "{}") as AppConfig);
    }).catch(() => {
      setConfig({ apiUrl: "", supabaseUrl: "", supabaseAnonKey: "" });
    });
    nativeAuth?.getSession().then((raw) => {
      if (raw) setSession(JSON.parse(raw) as AuthSession);
    }).catch(() => setSession(null));
    if (Platform.OS === "android" && Platform.Version >= 33) {
      void PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    }

    Linking.getInitialURL().then((url) => {
      if (authCallbackPayload(url)) {
        pendingAuthCallbackUrlRef.current = url;
        return;
      }
      const captureId = parseCaptureUrl(url);
      if (captureId) selectCapture(captureId);
    });
  }, [selectCapture]);

  useEffect(() => {
    if (!config || !pendingAuthCallbackUrlRef.current) return;
    const url = pendingAuthCallbackUrlRef.current;
    pendingAuthCallbackUrlRef.current = null;
    void handleAuthCallbackUrl(url);
  }, [config]);

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
    searchResultsCacheRef.current = {};
    searchResultsModeRef.current = {};
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
  }, [loadCaptures, selectCapture]);

  useEffect(() => {
    void loadCaptures().catch((error) => {
      setMessage((current) => current || friendlyError(error, "Could not load captures"));
    });
  }, [loadCaptures]);

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

  useEffect(() => {
    if (!searchOpen || searchScope === "active" || archivedCapturesLoaded || archivedCapturesLoading) return;
    void loadCaptures("archived").catch((error) => {
      setMessage((current) => current || friendlyError(error, "Could not load archived captures"));
    });
  }, [archivedCapturesLoaded, archivedCapturesLoading, loadCaptures, searchOpen, searchScope]);

  useEffect(() => {
    if (!selectedId) return;
    const capture = captures.find((item) => item.id === selectedId);
    if (!capture) return;
    if (!draftTitleDirty) setDraftTitle(capture.title);
    if (!draftNoteDirty) setDraftNote(capture.note);
    if (!draftIntentDirty) setDraftIntent(normalizeIntent(capture.defaultIntent));
  }, [captures, draftIntentDirty, draftNoteDirty, draftTitleDirty, selectedId]);

  useEffect(() => {
    if (!selectedCollectionId) return;
    const collection = collections.find((item) => item.id === selectedCollectionId);
    if (!collection || collectionDraftDirty) return;
    setCollectionTitle(collection.title);
    setCollectionDescription(collection.description);
  }, [collectionDraftDirty, collections, selectedCollectionId]);

  useEffect(() => {
    if (
      !selectedId &&
      !selectedCollectionId &&
      !searchOpen &&
      !showCaptureComposer &&
      !showCollectionForm &&
      !noteSheetOpen &&
      !collectionsOpen &&
      !accountSheetOpen &&
      !rationaleSheet &&
      !archiveCaptureConfirmOpen &&
      !archiveCollectionTarget
    ) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (archiveCollectionTarget) {
        setArchiveCollectionTarget(null);
        return true;
      }
      if (archiveCaptureConfirmOpen) {
        setArchiveCaptureConfirmOpen(false);
        return true;
      }
      if (rationaleSheet) {
        setRationaleSheet(null);
        return true;
      }
      if (accountSheetOpen) {
        setAccountSheetOpen(false);
        return true;
      }
      if (showCaptureComposer) {
        closeCaptureComposer();
        return true;
      }
      if (showCollectionForm) {
        closeCollectionComposer();
        return true;
      }
      if (noteSheetOpen) {
        closeNoteSheet();
        return true;
      }
      if (searchOpen) {
        setSearchOpen(false);
        return true;
      }
      if (selectedId && captureReturnCollectionId) {
        selectCapture(null);
        selectCollection(captureReturnCollectionId);
        return true;
      }
      if (selectedCollectionId) {
        selectCollection(null);
        return true;
      }
      if (collectionsOpen) {
        setCollectionsOpen(false);
        return true;
      }
      selectCapture(null);
      selectCollection(null);
      return true;
    });
    return () => subscription.remove();
  }, [
    accountSheetOpen,
    archiveCaptureConfirmOpen,
    archiveCollectionTarget,
    captureReturnCollectionId,
    collectionsOpen,
    rationaleSheet,
    searchOpen,
    selectCapture,
    selectCollection,
    selectedCollectionId,
    selectedId,
    showCaptureComposer,
    showCollectionForm,
    noteSheetOpen
  ]);

  useEffect(() => {
    if (!searchOpen) return;
    searchMotion.setValue(0);
    Animated.spring(searchMotion, {
      damping: 22,
      mass: 0.9,
      stiffness: 260,
      toValue: 1,
      useNativeDriver: false
    }).start();
  }, [searchMotion, searchOpen]);

  useEffect(() => {
    if (!selectedId) return;
    reviewMotion.setValue(0);
    Animated.spring(reviewMotion, {
      damping: 22,
      mass: 0.9,
      stiffness: 260,
      toValue: 1,
      useNativeDriver: false
    }).start();
  }, [reviewMotion, selectedId]);

  useEffect(() => {
    skeletonPulse.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonPulse, {
          duration: 820,
          easing: Easing.inOut(Easing.cubic),
          toValue: 1,
          useNativeDriver: true
        }),
        Animated.timing(skeletonPulse, {
          duration: 820,
          easing: Easing.inOut(Easing.cubic),
          toValue: 0,
          useNativeDriver: true
        })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [skeletonPulse]);

  useEffect(() => {
    if ((!showCaptureComposer && !showCollectionForm && !noteSheetOpen) || captureComposerClosing) return;
    captureComposerMotion.setValue(0);
    Animated.spring(captureComposerMotion, {
      damping: 24,
      mass: 0.9,
      stiffness: 300,
      toValue: 1,
      useNativeDriver: false
    }).start();
  }, [captureComposerClosing, captureComposerMotion, noteSheetOpen, showCaptureComposer, showCollectionForm]);

  useEffect(() => {
    if (!showCaptureComposer || captureComposerClosing || pickingCaptureImage) return;
    const frame = requestAnimationFrame(() => {
      sourceInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [captureComposerClosing, captureMode, pickingCaptureImage, showCaptureComposer]);

  useEffect(() => {
    if (!showCollectionForm) return;
    const frame = requestAnimationFrame(() => {
      collectionTitleInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [showCollectionForm]);

  useEffect(() => {
    if (!noteSheetOpen) return;
    const frame = requestAnimationFrame(() => {
      noteInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [noteSheetOpen]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      if (captureComposerClosingRef.current || captureImagePickerActiveRef.current) return;
      const nextHeight = event.endCoordinates.height;
      lastKeyboardHeightRef.current = nextHeight;
      setKeyboardHeight(nextHeight);
      if (Platform.OS === "ios") Keyboard.scheduleLayoutAnimation(event);
      Animated.timing(captureKeyboardInset, {
        duration: Math.max(140, Math.min(event.duration || 240, 340)),
        easing: Easing.out(Easing.cubic),
        toValue: nextHeight,
        useNativeDriver: false
      }).start();
    });
    const hideSubscription = Keyboard.addListener(hideEvent, (event) => {
      if (captureImagePickerActiveRef.current) return;
      if (!captureComposerClosingRef.current) setKeyboardHeight(0);
      if (Platform.OS === "ios") Keyboard.scheduleLayoutAnimation(event);
      Animated.timing(captureKeyboardInset, {
        duration: Math.max(120, Math.min(event.duration || 200, 300)),
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: false
      }).start();
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [captureKeyboardInset]);

  const homeCaptures = useMemo(() => captures.filter((capture) => !isArchived(capture)), [captures]);
  const homeRows = useMemo(() => groupedCaptureRows(homeCaptures), [homeCaptures]);
  const homeInitialLoading = (capturesLoadPhase === "cold" || capturesLoadPhase === "idle") &&
    !activeCapturesLoadedOnce &&
    !capturesError &&
    !homeRows.length;
  const visibleHomeRows = homeRows;
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
  const quickLookCount = useMemo(
    () => homeCaptures.filter((capture) => displayStatus(capture) === "needs_review" || displayStatus(capture) === "failed").length,
    [homeCaptures]
  );
  const collectionsColdLoading = collectionsLoadPhase === "cold" &&
    collectionsLoading &&
    !collectionsLoadedOnce[collectionsMode] &&
    !collections.length;
  const activeCollectionsColdLoading = collectionsLoadPhase === "cold" &&
    collectionsLoading &&
    !collectionsLoadedOnce.active &&
    !collectionsCacheRef.current.active.length;
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
    markCaptureRowsRevealed,
    visibleCollectionCapturesForReveal,
    visibleHomeCapturesForReveal
  ]);
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
    markCaptureRowsRevealed
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
    markCaptureRowsRevealed
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
  const searchPool = useMemo(() => {
    if (searchScope === "archived") return archivedCaptures;
    if (searchScope === "all") return uniqueCaptures([...captures, ...archivedCaptures]);
    return captures;
  }, [archivedCaptures, captures, searchScope]);
  const searchTerm = searchQuery.trim();
  const currentSearchKey = searchCacheKey(searchScope, searchTerm);
  const remoteSearchActive = Boolean(
    searchOpen &&
      searchTerm &&
      config?.apiUrl &&
      session?.accessToken &&
      isEdgeCaptureApi(config.apiUrl)
  );
  const localSearchResults = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return [];
    return searchPool.filter((capture) => searchableCaptureText(capture).includes(term));
  }, [searchPool, searchQuery]);
  const remoteSearchReadyForQuery = Boolean(
    remoteSearchActive &&
      currentSearchKey &&
      remoteSearchKey === currentSearchKey &&
      !remoteSearchError
  );
  const searchResults = remoteSearchReadyForQuery
    ? mergeSearchResults(localSearchResults, remoteSearchResults)
    : localSearchResults;

  useEffect(() => {
    if (!remoteSearchActive || !config?.apiUrl || !session?.accessToken) {
      searchRequestSeqRef.current += 1;
      setRemoteSearchLoading(false);
      setRemoteSearchEnhancing(false);
      setRemoteSearchError("");
      if (!searchTerm) {
        setRemoteSearchResults([]);
        setRemoteSearchKey("");
      }
      return;
    }
    if (!currentSearchKey) return;
    const requestId = searchRequestSeqRef.current + 1;
    searchRequestSeqRef.current = requestId;
    const cached = searchResultsCacheRef.current[currentSearchKey];
    if (cached) {
      setRemoteSearchResults(cached);
      setRemoteSearchKey(currentSearchKey);
      setRemoteSearchLoading(false);
      setRemoteSearchEnhancing(true);
    } else {
      setRemoteSearchLoading(true);
      setRemoteSearchEnhancing(false);
    }
    setRemoteSearchError("");
    const runSearch = async (mode: SearchRemoteMode) => {
        try {
          const json = await withFreshAccessToken((accessToken) =>
            requestJson<{ captures?: Array<Record<string, any>> }>(
              edgeResourceUrl(config.apiUrl, "search", {
                q: searchTerm,
                scope: searchScope,
                mode,
                limit: "50"
              }),
              {
                headers: {
                  accept: "application/json",
                  apikey: config.supabaseAnonKey,
                  authorization: `Bearer ${accessToken}`
                }
              }
            )
          );
          if (searchRequestSeqRef.current !== requestId) return;
          if (mode === "keyword" && searchResultsModeRef.current[currentSearchKey] === "hybrid") return;
          const rows = (json.captures ?? []).map(captureFromRemote);
          const existing = searchResultsCacheRef.current[currentSearchKey] || [];
          const nextRows = mode === "hybrid" ? mergeSearchResults(existing, rows) : rows;
          searchResultsCacheRef.current[currentSearchKey] = nextRows;
          searchResultsModeRef.current[currentSearchKey] = mode;
          setRemoteSearchResults(nextRows);
          setRemoteSearchKey(currentSearchKey);
          setRemoteSearchLoading(false);
          setRemoteSearchEnhancing(mode === "keyword");
        } catch (error) {
          if (searchRequestSeqRef.current !== requestId) return;
          if (mode === "keyword") {
            setRemoteSearchLoading(false);
            setRemoteSearchEnhancing(true);
            return;
          }
          if (!searchResultsCacheRef.current[currentSearchKey]?.length) {
            setRemoteSearchError(friendlyError(error, "Search is using local matches."));
          }
          setRemoteSearchEnhancing(false);
          setRemoteSearchLoading(false);
        } finally {
          if (searchRequestSeqRef.current === requestId && mode === "hybrid") {
            setRemoteSearchEnhancing(false);
          }
        }
      };
    const keywordTimer = setTimeout(() => void runSearch("keyword"), SEARCH_KEYWORD_DEBOUNCE_MS);
    const hybridTimer = setTimeout(() => void runSearch("hybrid"), SEARCH_HYBRID_DELAY_MS);
    return () => {
      clearTimeout(keywordTimer);
      clearTimeout(hybridTimer);
    };
  }, [
    config?.apiUrl,
    config?.supabaseAnonKey,
    currentSearchKey,
    remoteSearchActive,
    searchScope,
    searchTerm,
    session?.accessToken,
    withFreshAccessToken
  ]);

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
  const collectionCapturesColdLoading = Boolean(
    selectedCollectionId &&
      selectedCollection?.status === "active" &&
      selectedCollection.captureCount !== 0 &&
      collectionCapturesLoading &&
      collectionCapturesLoadPhase === "initial" &&
      collectionCapturesForId !== selectedCollectionId
  );
  const selectedDraftKey = selected ? captureDraftKey(selected) : "";
  const selectedVisitTargetQuery = selected?.visitTarget?.query || "";

  useEffect(() => {
    if (!collectionCapturesColdLoading) {
      setCollectionCapturesColdSkeletonVisible(false);
      return;
    }
    const timer = setTimeout(() => setCollectionCapturesColdSkeletonVisible(true), INITIAL_SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, [collectionCapturesColdLoading]);

  useEffect(() => {
    if (!selected) return;
    void loadCaptureDetail(selected);
  }, [loadCaptureDetail, selected?.id, selected?.remoteId]);

  useEffect(() => {
    latestNoteRef.current = draftNote;
  }, [draftNote]);

  useEffect(() => {
    const candidates = mapSearchCandidates(selectedVisitTargetQuery, Platform.OS);
    if (!candidates.length) {
      setVisitTargetMapCandidates([]);
      return;
    }
    let cancelled = false;
    setVisitTargetMapCandidates([]);
    Promise.all(
      candidates.map(async (candidate) => {
        try {
          return await Linking.canOpenURL(candidate.url) ? candidate : null;
        } catch {
          return null;
        }
      })
    ).then((availableCandidates) => {
      if (cancelled) return;
      setVisitTargetMapCandidates(
        availableCandidates.filter((candidate): candidate is MapSearchCandidate => Boolean(candidate))
      );
    });
    return () => {
      cancelled = true;
    };
  }, [selectedVisitTargetQuery]);

  useEffect(() => {
    if (!snackbar) return;
    const timer = setTimeout(() => setSnackbar(null), 6000);
    return () => clearTimeout(timer);
  }, [snackbar]);

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
      setCollectionCreateTitle("");
      setCollectionCreateDescription("");
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
    setCollectionCreateTitle("");
    setCollectionCreateDescription("");
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
      setMessage((current) => current || text);
    });
  }, [captureReturnCollectionId, loadCollectionCaptures, selectedCollection?.captureCount, selectedCollection?.status, selectedCollectionId]);

  function openReviewInsight(insight: ReviewInsight) {
    const text = insight.summary || insight.focus;
    if (!text) return;
    setRationaleSheet({
      title: "Review insight",
      text,
      sections: insight.sections
    });
  }

  function applyUpdatedCapture(updatedCapture: Capture, previousId: string) {
    const matchesCapture = (item: Capture) =>
      item.id === previousId ||
      item.remoteId === previousId ||
      item.id === updatedCapture.id ||
      Boolean(updatedCapture.remoteId && item.remoteId === updatedCapture.remoteId);
    for (const [collectionId, rows] of Object.entries(collectionCapturesCacheRef.current)) {
      collectionCapturesCacheRef.current[collectionId] = rows.map((item) =>
        matchesCapture(item) ? updatedCapture : item
      );
    }
    setCaptures((current) =>
      current.map((item) => (matchesCapture(item) ? updatedCapture : item))
    );
    setArchivedCaptures((current) =>
      current.map((item) => (matchesCapture(item) ? updatedCapture : item))
    );
    setCollectionCaptures((current) =>
      current.map((item) => (matchesCapture(item) ? updatedCapture : item))
    );
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

  async function saveQuickEdit(nextIntent?: string) {
    if (!selected) return;
    const intentOverride =
      nextIntent === ""
        ? null
        : nextIntent && normalizeIntent(nextIntent)
          ? nextIntent
          : undefined;
    const currentSaveIntent =
      intentOverride !== undefined
        ? intentOverride
        : draftIntentDirty
          ? draftIntent || null
          : undefined;
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
              title: draftTitle.trim(),
              note: draftNote.trim(),
              currentSaveIntent
            }
          })
        );
        const updatedCapture = captureFromRemote(json.capture);
        applyUpdatedCapture(updatedCapture, selected.id);
        setDraftTitleDirty(false);
        setDraftNoteDirty(false);
        setDraftIntentDirty(false);
        setMessage("Applied.");
      } catch (error) {
        setMessage(friendlyError(error, "Could not save."));
      }
      return;
    }
    if (!nativeStore) return;
    const raw = await nativeStore.updateCapture(
      selected.id,
      draftTitle.trim(),
      draftNote.trim(),
      currentSaveIntent === undefined ? null : currentSaveIntent
    );
    const next = JSON.parse(raw || "[]") as Capture[];
    replaceLocalCaptureLists(next);
    setDraftTitleDirty(false);
    setDraftNoteDirty(false);
    setDraftIntentDirty(false);
    setMessage("Applied.");
  }

  async function saveReviewDecisions() {
    if (!selected) return;
    const reminderDecisions: ReminderReviewDecision[] = (selected.suggestedReminders || [])
      .map((reminder, index) => ({
        index,
        action: reminderDrafts[reminderDraftKey(reminder, index)] || "keep"
      }))
      .filter((decision) => decision.action === "remove");
    const collectionDecisions: CollectionReviewDecision[] = [
      ...(selected.linkedCollections || [])
        .map((collection) => ({
          kind: "linked" as const,
          collectionId: collection.id,
          action: collectionDrafts[linkedCollectionDraftKey(collection.id)] === "remove" ? "remove" as const : "keep" as const
        }))
        .filter((decision) => decision.action === "remove"),
      ...(selected.collectionDecisions || [])
        .map((collection, index) => {
          const action = collectionDrafts[suggestedCollectionDraftKey(collection, index)] || "ignore";
          const reviewAction: "ignore" | "link" | "create" =
            action === "link" || action === "create" ? action : "ignore";
          return {
            kind: "suggested" as const,
            index,
            type: collection.type,
            collectionId: collection.collectionId,
            title: collection.title,
            description: collection.description,
            rationale: collection.rationale,
            confidence: collection.confidence,
            action: reviewAction
          };
        })
        .filter((decision) => decision.action === "link" || decision.action === "create")
    ];
    const currentSaveIntent = draftIntentDirty ? draftIntent || null : undefined;

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
              action: "save_review_decisions",
              title: draftTitle.trim(),
              note: draftNote.trim(),
              currentSaveIntent,
              reminderDecisions,
              collectionDecisions
            }
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
        setMessage("Saved.");
      } catch (error) {
        setMessage(friendlyError(error, "Could not save."));
      }
      return;
    }

    if (!nativeStore) return;
    const raw = await nativeStore.updateCapture(
      selected.id,
      draftTitle.trim(),
      draftNote.trim(),
      draftIntentDirty && draftIntent ? draftIntent : null
    );
    const next = (JSON.parse(raw || "[]") as Capture[]).map((capture) => {
      if (capture.id !== selected.id) return capture;
      return {
        ...capture,
        needsReview: false,
        reviewTargets: [],
        status: "ready" as const,
        suggestedReminders: (capture.suggestedReminders || []).filter((reminder, index) => {
          return reminderDrafts[reminderDraftKey(reminder, index)] !== "remove";
        }),
        linkedCollections: (capture.linkedCollections || []).filter((collection) => {
          return collectionDrafts[linkedCollectionDraftKey(collection.id)] !== "remove";
        }),
        collectionDecisions: (capture.collectionDecisions || []).filter((collection, index) => {
          const action = collectionDrafts[suggestedCollectionDraftKey(collection, index)] || "ignore";
          return action !== "link" && action !== "create";
        })
      };
    });
    replaceLocalCaptureLists(next);
    setDraftTitleDirty(false);
    setDraftNoteDirty(false);
    setDraftIntentDirty(false);
    setReminderDrafts({});
    setCollectionDrafts({});
    clearSelectedReviewDraft(selected);
    setMessage("Saved.");
  }

  async function confirmReview() {
    if (!selected) return;
    if (config?.apiUrl && session?.accessToken) {
      try {
        const currentSaveIntent = draftIntentDirty ? draftIntent || null : undefined;
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
              action: "confirm_review",
              title: draftTitle.trim(),
              note: draftNote.trim(),
              currentSaveIntent
            }
          })
        );
        const updatedCapture = captureFromRemote(json.capture);
        applyUpdatedCapture(updatedCapture, selected.id);
        setDraftTitleDirty(false);
        setDraftNoteDirty(false);
        setDraftIntentDirty(false);
        setMessage("Review confirmed.");
      } catch (error) {
        setMessage(friendlyError(error, "Could not confirm review."));
      }
      return;
    }
    if (!nativeStore?.confirmCaptureReview) return;
    const raw = await nativeStore.confirmCaptureReview(
      selected.id,
      draftTitle.trim(),
      draftNote.trim(),
      draftIntentDirty && draftIntent ? draftIntent : null
    );
    const next = JSON.parse(raw || "[]") as Capture[];
    replaceLocalCaptureLists(next);
    setCollectionCaptures((current) =>
      current.map((item) => next.find((capture) => capture.id === item.id) ?? item)
    );
    setDraftTitleDirty(false);
    setDraftNoteDirty(false);
    setDraftIntentDirty(false);
    setMessage("Review confirmed.");
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

  async function sendCaptureCollectionChoice(input: {
    choice: { type: "existing"; collectionId: string } | { type: "new"; title: string; description: string };
    source: "manual" | "analysis";
    suggestionIndex?: number;
    dismissCurrentCollectionSuggestions?: boolean;
    rationale?: string | null;
    confidence?: number | null;
    savingKey: string;
  }) {
    if (!selected) return;
    if (!config?.apiUrl || !session?.accessToken) {
      setMessage("Sign in to manage collections.");
      return;
    }
    const previousId = selected.id;
    setCollectionChoiceSaving(input.savingKey);
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
            action: "apply_collection_choice",
            choice: input.choice,
            source: input.source,
            suggestionIndex: input.suggestionIndex,
            dismissCurrentCollectionSuggestions: input.dismissCurrentCollectionSuggestions,
            rationale: input.rationale,
            confidence: input.confidence
          }
        })
      );
      const updatedCapture = captureFromRemote(json.capture);
      applyUpdatedCapture(updatedCapture, previousId);
      setCollectionPickerOpen(false);
      setCollectionPickerQuery("");
      setCollectionCreateTitle("");
      setCollectionCreateDescription("");
      await loadCollections("active");
      setMessage("Collection updated.");
    } catch (error) {
      setMessage(friendlyError(error, "Could not update collection."));
    } finally {
      setCollectionChoiceSaving(null);
    }
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

  async function saveCollectionSelection() {
    if (!selected) return;
    const currentIds = (selected.linkedCollections || []).map((collection) => collection.id);
    if (sameStringSet(collectionSelectionIds, currentIds)) {
      closeCollectionPicker();
      return;
    }
    if (!config?.apiUrl || !session?.accessToken) {
      setMessage("Sign in to manage collections.");
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
          collectionIds: collectionSelectionIds
        }
      });
      const updatedCapture = captureFromRemote(json.capture);
      applyUpdatedCapture(updatedCapture, previousId);
      collectionCapturesCacheRef.current = {};
      setCollectionCaptures((current) =>
        current.map((item) =>
          item.id === previousId || item.remoteId === previousId ? updatedCapture : item
        )
      );
      closeCollectionPicker();
      await loadCollections("active");
      setMessage("Collections updated.");
    } catch (error) {
      setMessage(friendlyError(error, "Could not update collections."));
    } finally {
      setCollectionChoiceSaving(null);
    }
  }

  async function openCollectionPicker() {
    if (!selected) return;
    setCollectionPickerQuery("");
    setCollectionSelectionIds((selected.linkedCollections || []).map((collection) => collection.id));
    setCollectionPickerOpen(true);
    try {
      await loadCollections("active");
    } catch (error) {
      setMessage(friendlyError(error, "Could not load collections."));
    }
  }

  async function openCollectionSettings(collectionId: string) {
    setCollectionPickerOpen(false);
    setCollectionPickerQuery("");
    setCollectionCreateTitle("");
    setCollectionCreateDescription("");
    if (!selected) setCollectionsOpen(true);
    if (!collections.some((collection) => collection.id === collectionId)) {
      try {
        await loadCollections("active");
      } catch (error) {
        setMessage(friendlyError(error, "Could not load collection."));
      }
    }
    selectCollection(collectionId);
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
      setMessage("Collection saved.");
    } catch (error) {
      setMessage(friendlyError(error, "Could not save collection."));
    }
  }

  async function setCollectionArchiveState(collection: Collection, archived: boolean) {
    try {
      setArchiveCollectionTarget(null);
      await collectionRequest<{ collection: Record<string, any> }>("collections", {
        method: "PATCH",
        body: { collectionId: collection.id, action: archived ? "archive" : "restore" }
      });
      selectCollection(null);
      collectionCapturesCacheRef.current[collection.id] = [];
      setMessage(archived ? "Collection archived." : "Collection restored.");
      await loadCollections(collectionsMode);
      await loadCaptures();
    } catch (error) {
      setMessage(friendlyError(error, archived ? "Could not archive collection." : "Could not restore collection."));
    }
  }

  function confirmArchiveCollection(collection: Collection) {
    if (collection.status === "archived") {
      void setCollectionArchiveState(collection, false);
      return;
    }
    setArchiveCollectionTarget(collection);
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
        current.map((capture) =>
          capture.id === captureId || capture.remoteId === captureId
            ? {
                ...capture,
                linkedCollections: (capture.linkedCollections || []).filter((collection) => collection.id !== collectionId)
              }
            : capture
        )
      );
      setMessage("");
      if (removedCollection) {
        setSnackbar({
          text: "Removed from collection.",
          actionLabel: "Undo",
          action: () => void restoreCollectionLink(collectionId, capture, removedCollection)
        });
      } else {
        setSnackbar({ text: "Removed from collection." });
      }
      await loadCaptures();
    } catch (error) {
      setMessage(friendlyError(error, "Could not remove collection."));
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
      ];
      collectionsCacheRef.current.active = collectionsCacheRef.current.active.map((item) =>
        item.id === collectionId ? { ...item, captureCount: item.captureCount + 1 } : item
      );
      setCollections((current) =>
        current.map((item) => item.id === collectionId ? { ...item, captureCount: item.captureCount + 1 } : item)
      );
      setCaptures((current) => current.map(addCollection));
      setCollectionCaptures((current) => [
        addCollection(capture),
        ...current.filter((item) => item.id !== capture.id)
      ]);
      setSnackbar(null);
      setMessage("Collection restored.");
      await loadCaptures();
    } catch (error) {
      setMessage(friendlyError(error, "Could not restore collection."));
    }
  }

  async function unlinkCollectionFromCapture(collectionId: string) {
    if (!selected) return;
    await unlinkCaptureFromCollection(collectionId, selected);
  }

  async function autosaveCollectionDecision(decision: CollectionDecision, index: number) {
    const choice = collectionChoiceFromDecision(decision);
    if (!choice) return;
    await sendCaptureCollectionChoice({
      choice,
      source: "analysis",
      suggestionIndex: index,
      rationale: decision.rationale,
      confidence: decision.confidence,
      savingKey: `suggestion:${index}`
    });
  }

  async function undoAddedCollection(collection: LinkedCollection) {
    if (!selected) return;
    const key = linkedCollectionDraftKey(collection.id);
    try {
      await unlinkCaptureFromCollection(collection.id, selected);
      const nextDrafts = { ...collectionDrafts };
      delete nextDrafts[key];
      setCollectionDrafts(nextDrafts);
      updateSelectedReviewDraft({ collections: nextDrafts });
    } catch {
      // unlinkCaptureFromCollection already reports the error.
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
        setMessage("Reminder removed.");
      } catch (error) {
        setMessage(friendlyError(error, "Could not remove reminder."));
      }
      return;
    }
    const removeReminder = (capture: Capture) =>
      capture.id === selected.id
        ? {
            ...capture,
            suggestedReminders: (capture.suggestedReminders || []).filter((_, index) => index !== reminderIndex)
          }
        : capture;
    setCaptures((current) => current.map(removeReminder));
    setArchivedCaptures((current) => current.map(removeReminder));
    setCollectionCaptures((current) => current.map(removeReminder));
    setMessage("Reminder removed.");
  }

  async function copySource() {
    if (!selected) return;
    const source = selected.sourceUrl || selected.sourceText;
    if (!source) return;
    try {
      if (!nativeClipboard) throw new Error("Clipboard is unavailable.");
      await nativeClipboard?.copy(source);
      setMessage("Source copied.");
    } catch (error) {
      setMessage(friendlyError(error, "Could not copy source."));
    }
  }

  async function openVisitTargetMaps(candidate: MapSearchCandidate) {
    try {
      await Linking.openURL(candidate.url);
    } catch {
      setMessage(`Could not open ${candidate.label}.`);
    }
  }

  async function pasteExpandedUrl() {
    if (!selected) return;
    if (!nativeStore?.submitExpandedUrl || !nativeClipboard?.paste) {
      setMessage("Copy the expanded URL, then paste it as a new capture.");
      return;
    }
    try {
      const clipboardText = await nativeClipboard.paste();
      const expandedUrl = extractHttpUrl(clipboardText);
      if (!expandedUrl) {
        setMessage("Copy the expanded URL first, then tap Paste expanded URL.");
        return;
      }
      const raw = await nativeStore.submitExpandedUrl(selected.id, expandedUrl);
      const next = JSON.parse(raw || "[]") as Capture[];
      replaceLocalCaptureLists(next);
      setMessage("Expanded URL saved. Checking the source now.");
    } catch (error) {
      setMessage(friendlyError(error, "Could not use the expanded URL."));
    }
  }

  async function setArchiveState(archived: boolean) {
    if (!selected) return;
    setArchiveCaptureConfirmOpen(false);
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
              captureId: selected.remoteId || selected.id,
              action: archived ? "archive" : "restore"
            }
          })
        );
        const returnCollectionId = captureReturnCollectionId;
        selectCapture(null);
        if (returnCollectionId) selectCollection(returnCollectionId);
        setMessage(archived ? "Archived." : "Restored.");
        setArchivedCapturesLoaded(false);
        collectionCapturesCacheRef.current = {};
        collectionCapturesCursorCacheRef.current = {};
        await loadCaptures();
        if (collectionsOpen || selectedCollectionId) await loadCollections(collectionsMode);
      } catch (error) {
        setMessage(friendlyError(error, archived ? "Could not archive." : "Could not restore."));
      }
      return;
    }
    if (!nativeStore) return;
    const raw = archived
      ? await nativeStore.archiveCapture(selected.id)
      : await nativeStore.restoreCapture(selected.id);
    const next = JSON.parse(raw || "[]") as Capture[];
    replaceLocalCaptureLists(next);
    const returnCollectionId = captureReturnCollectionId;
    selectCapture(null);
    if (returnCollectionId) selectCollection(returnCollectionId);
    setMessage(archived ? "Archived." : "Restored.");
  }

  function confirmArchive() {
    if (!selected) return;
    if (isArchived(selected)) {
      void setArchiveState(false);
      return;
    }
    setArchiveCaptureConfirmOpen(true);
  }

  async function saveCaptureSource() {
    const source = sourceDraft.trim();
    if (!source) return;
    if (!nativeStore) {
      setMessage("Native capture worker is unavailable.");
      return;
    }
    setSavingCapture(true);
    setMessage("");
    try {
      const raw = await nativeStore.captureSource(source);
      const localCapture = JSON.parse(raw) as Capture;
      setCaptures((current) => [localCapture, ...current.filter((item) => item.id !== localCapture.id)]);
      setSourceDraft("");
      closeCaptureComposer();
    } catch (error) {
      setMessage(friendlyError(error, "Could not save capture."));
    } finally {
      setSavingCapture(false);
    }
  }

  async function pickCaptureImage() {
    if (pickingCaptureImage || captureImagePickerActiveRef.current) return;
    if (!nativeStore?.captureImage) {
      setMessage("Image upload is unavailable in this build.");
      return;
    }
    captureImagePickerActiveRef.current = true;
    setPickingCaptureImage(true);
    setMessage("");
    try {
      const raw = await nativeStore.captureImage();
      if (!raw) return;
      const localCapture = JSON.parse(raw) as Capture;
      setCaptures((current) => [localCapture, ...current.filter((item) => item.id !== localCapture.id)]);
      setSourceDraft("");
    } catch (error) {
      if (isCaptureImageCancel(error)) return;
      setMessage(friendlyError(error, "Could not save image."));
    } finally {
      captureImagePickerActiveRef.current = false;
      setPickingCaptureImage(false);
      if (showCaptureComposer || captureComposerClosingRef.current) {
        resetCaptureComposerSurface();
      }
    }
  }

  async function startGoogleSignIn() {
    if (!config?.supabaseUrl || !config.supabaseAnonKey) {
      setMessage("Supabase URL and anon key are not configured in the Android build.");
      return;
    }
    setAuthLoading("oauth");
    setMessage("");
    try {
      const params = new URLSearchParams({
        provider: "google",
        redirect_to: AUTH_CALLBACK_URL
      });
      await Linking.openURL(`${config.supabaseUrl}/auth/v1/authorize?${params.toString()}`);
    } catch (error) {
      setMessage(friendlyError(error, "Could not open Google sign in."));
    } finally {
      setAuthLoading(null);
    }
  }

  async function sendSupabaseAuthEmailLink(email: string) {
    if (!config?.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error("Supabase URL and anon key are not configured in the Android build.");
    }
    await requestJson<Record<string, any>>(`${config.supabaseUrl}/auth/v1/otp?redirect_to=${encodeURIComponent(AUTH_CALLBACK_URL)}`, {
      method: "POST",
      headers: {
        apikey: config.supabaseAnonKey,
        "content-type": "application/json"
      },
      body: {
        email,
        data: {},
        create_user: true,
        gotrue_meta_security: {}
      }
    });
  }

  async function sendEmailAuthLink() {
    if (!config?.supabaseUrl || !config.supabaseAnonKey) {
      setMessage("Supabase URL and anon key are not configured in the Android build.");
      return;
    }
    const email = authEmail.trim();
    const inputError = emailInputError(email);
    if (inputError) {
      setMessage(inputError);
      return;
    }
    setAuthLoading("magiclink");
    setMessage("");
    try {
      await sendSupabaseAuthEmailLink(email);
      setAuthPendingEmail(email);
      setAuthScreen("check-email");
      setMessage("");
    } catch (error) {
      setMessage(friendlyError(error, "Could not send the sign-in link."));
    } finally {
      setAuthLoading(null);
    }
  }

  function backToSignIn() {
    setAuthScreen("signin");
    setMessage("");
  }

  async function signOut() {
    await nativeAuth?.clearSession();
    setSession(null);
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
    captureDetailHydrationRef.current.clear();
    captureImageLoadStatesRef.current = {};
    captureRowRevealStatesRef.current = {};
    setCaptureImageLoadStates({});
    setCaptureRowRevealStates({});
    setHomeFeedReadyKey("");
    collectionsPrefetchStartedRef.current = false;
    setCollectionCaptures([]);
    setCollectionCapturesNextCursor(null);
    setCollectionCapturesForId(null);
    setCollectionCapturesLoadPhase("idle");
    setCollectionCapturesError("");
    setCaptureReturnCollectionId(null);
    setCollectionsOpen(false);
    setSearchOpen(false);
    setSearchQuery("");
    setRemoteSearchResults([]);
    setRemoteSearchError("");
    setRemoteSearchLoading(false);
    setRemoteSearchEnhancing(false);
    setRemoteSearchKey("");
    searchResultsCacheRef.current = {};
    searchResultsModeRef.current = {};
    selectCapture(null);
    selectCollection(null);
  }

  const skeletonOpacity = skeletonPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.48, 0.9]
  });
  const skeletonSheenTranslate = skeletonPulse.interpolate({
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

  const searchActivityScale = skeletonPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1]
  });
  const searchActivityOpacity = skeletonPulse.interpolate({
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
              transform: [{ scale: skeletonPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.76] }) }]
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

  function renderCaptureRow(input: {
    item: Capture;
    onPress: () => void;
    testID?: string;
    matchReason?: string;
    showCollectionToken?: boolean;
    deferFallbackIcon?: boolean;
    deferMediaUntilLoaded?: boolean;
    forceSkeleton?: boolean;
  }) {
    return (
      <CaptureRow
        {...input}
        captureImageLoadStates={captureImageLoadStates}
        captureRowRevealStates={captureRowRevealStates}
        failedFavicons={faviconFailures}
        onFaviconFailure={markFaviconFailed}
        onImageLoadState={markCaptureImageLoadState}
        renderInlineSkeleton={() => renderCaptureRowInlineSkeleton()}
        SkeletonBlock={SkeletonBlock}
      />
    );
  }

  function renderCollectionCapture({ item }: { item: Capture }) {
    const imageLoadKey = captureImageLoadKey(item);
    const imageLoadState = imageLoadKey ? captureImageLoadStates[imageLoadKey] : undefined;
    const revealKey = captureRowRevealKey(item);
    const rowRevealed = Boolean(captureRowRevealStates[revealKey]);
    const deferRowUntilImageReady = Boolean(
      collectionFeedRevealPending ||
        (!rowRevealed &&
          (imageLoadKey ? !imageLoadState : true))
    );
    return (
      <SkeletonRevealFrame pending={deferRowUntilImageReady} skeleton={renderCaptureRowInlineSkeleton(true)}>
        <Animated.View style={[styles.collectionCaptureRow, { opacity: collectionRowsFade }]}>
          <View style={styles.collectionCaptureMain}>
            {renderCaptureRow({
              showCollectionToken: false,
              item,
              onPress: () => {
                if (selectedCollection) openCaptureFromCollection(item, selectedCollection.id);
              }
            })}
          </View>
          <Pressable
            onPress={() => {
              if (selectedCollection) void unlinkCaptureFromCollection(selectedCollection.id, item);
            }}
            style={styles.removeButton}
          >
            <Text style={styles.inlineAction}>Remove</Text>
          </Pressable>
        </Animated.View>
      </SkeletonRevealFrame>
    );
  }

  function renderCollection({ item }: { item: Collection }) {
    return (
      <CollectionRow
        collectionListFade={collectionListFade}
        item={item}
        onPress={() => {
          selectCollection(item.id);
          setCollectionTitle(item.title);
          setCollectionDescription(item.description);
        }}
      />
    );
  }

  function renderHomeRow({ item }: { item: HomeListRow }) {
    if (item.type === "section") {
      return (
        <Animated.Text style={[styles.groupHeader, { opacity: homeFeedRevealPending ? 0 : homeRowsFade }]}>
          {item.title}
        </Animated.Text>
      );
    }
    return (
      <Animated.View style={{ opacity: homeRowsFade }}>
        {renderCaptureRow({
          item: item.capture,
          deferFallbackIcon: capturesLoading && !activeCapturesLoadedOnce,
          deferMediaUntilLoaded: true,
          forceSkeleton: homeFeedRevealPending,
          onPress: () => openCapture(item.capture.id),
          testID: `pc.capture.row.${item.capture.id}`
        })}
      </Animated.View>
    );
  }

  function renderSearchResult({ item }: { item: Capture }) {
    return renderCaptureRow({
      item,
      matchReason: matchReasonForCapture(item, searchQuery),
      onPress: () => openCapture(item.id),
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

  function renderSnackbar(withBottomNav = false) {
    return <Snackbar snackbar={snackbar} withBottomNav={withBottomNav} />;
  }

  function renderBottomAppBar(active: "recent" | "collections") {
    return (
      <BottomAppBar
        active={active}
        onCollectionsPress={() => void openCollectionsScreen("active")}
        onFabPress={active === "collections" ? openCollectionComposer : openCaptureComposer}
        onRecentPress={openRecentHome}
        onSettingsPress={openAccountActions}
      />
    );
  }

  function renderCollectionComposerSheet() {
    if (!showCollectionForm || selectedCollection) return null;
    const keyboardVisible = keyboardHeight > 0;
    const screenHeight = Dimensions.get("screen").height;
    const windowAlreadyKeyboardSized = keyboardVisible && Math.abs(windowHeight + keyboardHeight - screenHeight) < 96;
    const visibleHeight = keyboardVisible && !windowAlreadyKeyboardSized
      ? windowHeight - keyboardHeight
      : windowHeight;
    const sheetMaxHeight = keyboardVisible
      ? Math.min(430, Math.max(320, visibleHeight - 24))
      : Math.min(440, Math.max(340, windowHeight * 0.62));
    const sheetBottomInset = windowAlreadyKeyboardSized ? 0 : captureKeyboardInset;
    const saveDisabled = !collectionTitle.trim() || !collectionDescription.trim();

    return (
      <View style={styles.sheetLayer} pointerEvents="box-none">
        <Pressable
          accessibilityLabel="Close collection composer"
          onPress={closeCollectionComposer}
          style={styles.sheetBackdrop}
        />
        <KeyboardAvoidingView pointerEvents="box-none" style={styles.sheetKeyboard}>
          <Animated.View
            style={[
              styles.captureSheet,
              keyboardVisible && styles.captureSheetCompact,
              {
                marginBottom: sheetBottomInset,
                maxHeight: sheetMaxHeight,
                opacity: captureComposerMotion,
                transform: [
                  {
                    translateY: captureComposerMotion.interpolate({
                      inputRange: [0, 1],
                      outputRange: [28, 0]
                    })
                  }
                ]
              }
            ]}
          >
            <View style={styles.sheetGrabber} />
            <View style={styles.captureSheetHeader}>
              <View style={styles.sheetHeaderCopy}>
                <Text style={styles.sheetTitle}>New collection</Text>
              </View>
              <View style={styles.sheetActions}>
                <IconButton Icon={X} label="Close" onPress={closeCollectionComposer} />
                <IconButton
                  Icon={Check}
                  label="Create collection"
                  disabled={saveDisabled}
                  onPress={() => void saveCollection()}
                  tone="primary"
                  testID="pc.collections.create.save"
                />
              </View>
            </View>
            <View
              style={[
                styles.captureSheetBody,
                styles.captureSheetBodyContent,
                keyboardVisible && styles.captureSheetBodyContentCompact
              ]}
            >
              <TextInput
                onChangeText={(value) => {
                  setCollectionDraftDirty(true);
                  setCollectionTitle(value);
                }}
                placeholder="Title"
                placeholderTextColor={colors.muted}
                ref={collectionTitleInputRef}
                returnKeyType="next"
                style={[styles.captureInput, styles.collectionSheetTitleInput]}
                testID="pc.collections.create.title"
                value={collectionTitle}
              />
              <TextInput
                multiline
                onChangeText={(value) => {
                  setCollectionDraftDirty(true);
                  setCollectionDescription(value);
                }}
                placeholder="What belongs here"
                placeholderTextColor={colors.muted}
                style={[styles.captureInput, styles.collectionSheetDescriptionInput]}
                testID="pc.collections.create.description"
                value={collectionDescription}
              />
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  function renderAppSheets() {
    if (accountSheetOpen) {
      return (
        <View style={styles.modalLayer} pointerEvents="box-none">
          <Pressable
            accessibilityLabel="Close account actions"
            onPress={() => setAccountSheetOpen(false)}
            style={styles.modalBackdrop}
          />
          <View style={styles.actionSheet}>
            <View style={styles.sheetGrabber} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderCopy}>
                <Text style={styles.sheetTitle}>Settings</Text>
                <Text style={styles.sheetSubtitle}>Manage this device session.</Text>
              </View>
              <IconButton Icon={X} label="Close account actions" onPress={() => setAccountSheetOpen(false)} />
            </View>
            <Pressable
              onPress={() => {
                setAccountSheetOpen(false);
                void signOut();
              }}
              style={({ pressed }) => [styles.sheetActionRow, pressed && styles.subtlePressed]}
            >
              <LogOut color={colors.danger} size={20} strokeWidth={2.3} />
              <View style={styles.sheetActionCopy}>
                <Text style={[styles.sheetActionTitle, styles.sheetActionDanger]}>Sign out</Text>
                <Text style={styles.sheetActionText}>Remove this session from the phone.</Text>
              </View>
            </Pressable>
          </View>
        </View>
      );
    }

    if (rationaleSheet) {
      return (
        <View style={styles.modalLayer} pointerEvents="box-none">
          <Pressable
            accessibilityLabel="Close review insight"
            onPress={() => setRationaleSheet(null)}
            style={styles.modalBackdrop}
          />
          <View style={[styles.actionSheet, styles.reviewInsightSheet]}>
            <View style={styles.sheetGrabber} />
            <View style={styles.rationaleSheetHeader}>
              <View style={styles.rationaleSheetHeaderIcon}>
                <Info color={colors.accent} size={22} strokeWidth={2.4} />
              </View>
              <View style={styles.rationaleSheetHeaderCopy}>
                <Text style={styles.sheetTitle}>{rationaleSheet.title}</Text>
                <Text style={styles.rationaleSheetKicker}>How this capture was interpreted</Text>
              </View>
              <IconButton Icon={X} label="Close review insight" onPress={() => setRationaleSheet(null)} />
            </View>
            {rationaleSheet.text ? (
              <Text style={styles.rationaleSheetLead}>{rationaleSheet.text}</Text>
            ) : null}
            {rationaleSheet.sections?.length ? (
              <View style={styles.rationaleSheetSections}>
                {rationaleSheet.sections.map((section) => {
                  const SectionIcon = rationaleSectionIcon(section.label);
                  return (
                    <View key={section.label} style={styles.rationaleSheetSection}>
                      <View style={[styles.rationaleSheetSectionIcon, rationaleSectionIconStyle(section.label)]}>
                        <SectionIcon color={colors.ink} size={18} strokeWidth={2.4} />
                      </View>
                      <View style={styles.rationaleSheetSectionCopy}>
                        <Text style={styles.rationaleSheetLabel}>{section.label}</Text>
                        <Text style={styles.rationaleSheetText}>{section.text}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}
            <Pressable onPress={() => setRationaleSheet(null)} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Done</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    if (archiveCaptureConfirmOpen && selected) {
      return (
        <View style={styles.modalLayer} pointerEvents="box-none">
          <Pressable
            accessibilityLabel="Cancel archive"
            onPress={() => setArchiveCaptureConfirmOpen(false)}
            style={styles.modalBackdrop}
          />
          <View style={styles.actionSheet}>
            <View style={styles.sheetGrabber} />
            <View style={styles.destructiveSheetIcon}>
              <Archive color={colors.danger} size={22} strokeWidth={2.4} />
            </View>
            <Text style={styles.sheetTitle}>Archive this capture?</Text>
            <Text style={styles.sheetSubtitle}>It leaves Recent Captures but stays searchable from Archived.</Text>
            <Pressable
              onPress={() => void setArchiveState(true)}
              style={[styles.primaryButton, styles.destructiveButton]}
              testID="pc.capture.archive-confirm"
            >
              <Text style={styles.destructiveButtonText}>Archive capture</Text>
            </Pressable>
            <Pressable onPress={() => setArchiveCaptureConfirmOpen(false)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    if (archiveCollectionTarget) {
      return (
        <View style={styles.modalLayer} pointerEvents="box-none">
          <Pressable
            accessibilityLabel="Cancel archive collection"
            onPress={() => setArchiveCollectionTarget(null)}
            style={styles.modalBackdrop}
          />
          <View style={styles.actionSheet}>
            <View style={styles.sheetGrabber} />
            <View style={styles.destructiveSheetIcon}>
              <Archive color={colors.danger} size={22} strokeWidth={2.4} />
            </View>
            <Text style={styles.sheetTitle}>Archive this collection?</Text>
            <Text style={styles.sheetSubtitle}>Current captures will be removed from it. Restoring brings back only this snapshot.</Text>
            <Pressable
              onPress={() => void setCollectionArchiveState(archiveCollectionTarget, true)}
              style={[styles.primaryButton, styles.destructiveButton]}
              testID="pc.collection.archive-confirm"
            >
              <Text style={styles.destructiveButtonText}>Archive collection</Text>
            </Pressable>
            <Pressable onPress={() => setArchiveCollectionTarget(null)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return null;
  }


  if (selectedCollection) {
    return (
      <CollectionDetailScreen
        actions={{
          confirmArchiveCollection,
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
          message,
          selectedCollection,
          snackbar: renderSnackbar()
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
          openCollectionsScreen: (mode) => void openCollectionsScreen(mode),
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
          message,
          snackbar: renderSnackbar(!showCollectionForm)
        }}
        state={{
          collectionsLoadPhase,
          collectionsLoading,
          collectionsMode,
          showCollectionForm
        }}
      />
    );
  }

  if (selected && collectionPickerOpen) {
    return (
      <CollectionSelectorScreen
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
          message,
          selected,
          snackbar: renderSnackbar()
        }}
        state={{
          activeCollectionsLoadedOnce: collectionsLoadedOnce.active,
          collectionChoiceSaving,
          collectionPickerQuery,
          collectionSelectionIds,
          collectionsLoadPhase,
          collectionsLoading
        }}
      />
    );
  }

  if (selected) {
    return (
      <CaptureReviewScreen
        actions={{
          closeNoteSheet,
          confirmArchive,
          confirmReview: () => void confirmReview(),
          copySource,
          markFaviconFailed,
          openCaptureUrl,
          openCollectionPicker: () => void openCollectionPicker(),
          openExternalUrl: (url) => void Linking.openURL(url),
          openNoteSheet,
          openReviewInsight,
          openVisitTargetMaps: (candidate) => void openVisitTargetMaps(candidate),
          pasteExpandedUrl: () => void pasteExpandedUrl(),
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
          setReminderDrafts,
          updateSelectedReviewDraft
        }}
        data={{
          appSheets: renderAppSheets(),
          captureComposerMotion,
          captureKeyboardInset,
          captureReturnCollectionId,
          faviconFailures,
          keyboardHeight,
          message,
          noteInputRef,
          reviewMotion,
          selected,
          snackbar: renderSnackbar(),
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
          reminderDrafts
        }}
      />
    );
  }

  if (config?.apiUrl && !session) {
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
    const searchIsLoading = remoteSearchActive && (remoteSearchLoading || remoteSearchEnhancing)
      ? true
      : searchScope !== "active" && archivedCapturesLoading && !archivedCapturesLoaded;
    const searchProgressLabel = remoteSearchLoading
      ? "Searching saved things"
      : remoteSearchEnhancing
        ? "Refining matches"
        : searchScope !== "active" && archivedCapturesLoading && !archivedCapturesLoaded
          ? "Loading archived captures"
          : "";
    const showSearchScopes = searchScopeOpen || Boolean(searchQuery.trim());
    const emptyTitle = searchQuery.trim()
      ? "No matches yet."
      : searchScope === "archived"
        ? "No archived captures."
        : "What do you remember?";
    const emptyText = searchQuery.trim()
      ? "Try a place, product, source, collection, note, date, or why you saved it."
      : searchScope === "archived"
        ? "Archived captures stay searchable here after you move them out of Recent Captures."
        : "Search looks across titles, notes, sources, collections, reminders, and saved details.";
    return (
      <SearchScreen
        actions={{
          closeSearch: () => setSearchOpen(false),
          loadMoreArchivedCaptures: () => loadMoreCaptures("archived"),
          renderSearchProgress,
          renderSearchResult,
          setSearchQuery,
          setSearchScope,
          toggleSearchScopeOpen: () => setSearchScopeOpen((current) => !current)
        }}
        data={{
          appSheets: renderAppSheets(),
          archivedCapturesError,
          emptyText,
          emptyTitle,
          listPerfProps: CAPTURE_LIST_PERF_PROPS,
          searchIsLoading,
          searchMotion,
          searchProgressLabel,
          searchResults,
          showSearchScopes,
          snackbar: renderSnackbar()
        }}
        state={{
          archivedCapturesLoaded,
          archivedCapturesLoading,
          remoteSearchActive,
          searchQuery,
          searchScope,
          searchScopeOpen
        }}
      />
    );
  }

  return (
    <HomeScreen
      actions={{
        chooseCaptureMode,
        closeCaptureComposer,
        loadCaptures: () => void loadCaptures(),
        loadMoreActiveCaptures: () => loadMoreCaptures("active"),
        openCapture,
        openCaptureComposer,
        openSearch,
        renderCaptureSkeletonRows,
        renderHomeRow,
        renderListLoadingFooter,
        saveCaptureSource: () => void saveCaptureSource(),
        setSourceDraft
      }}
      data={{
        appSheets: renderAppSheets(),
        bottomAppBar: !showCaptureComposer ? renderBottomAppBar("recent") : null,
        captureComposerMotion,
        captureKeyboardInset,
        homeCaptures: homeRows,
        listPerfProps: CAPTURE_LIST_PERF_PROPS,
        snackbar: renderSnackbar(!showCaptureComposer),
        sourceInputRef,
        visibleHomeRows,
        windowHeight
      }}
      state={{
        captureMode,
        capturesError,
        capturesLoading,
        capturesNextCursor,
        homeColdSkeletonVisible,
        homeInitialLoading,
        keyboardHeight,
        message,
        pickingCaptureImage,
        quickLookCount,
        savingCapture,
        sessionActive: Boolean(session),
        showCaptureComposer,
        sourceDraft
      }}
    />
  );

}
