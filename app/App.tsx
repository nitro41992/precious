import "react-native-url-polyfill/auto";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  AppState,
  BackHandler,
  FlatList,
  Linking,
  NativeModules,
  PermissionsAndroid,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import saveIntents from "../supabase/functions/_shared/save-intents.json";

type CaptureStatus = "processing" | "ready" | "needs_review" | "failed";

type Capture = {
  id: string;
  remoteId?: string;
  title: string;
  sourceText: string;
  sourceUrl: string | null;
  siteName?: string;
  summary?: string;
  analysisMode?: string;
  analysisProvider?: string;
  analysisModel?: string;
  analysisError?: string;
  defaultIntent?: string;
  intentRationale?: string;
  confidenceLabel?: string;
  needsReview?: boolean;
  entities?: Array<{ type: string; name: string; evidence: string; confidence: number }>;
  suggestedReminders?: Array<{
    trigger_type: string;
    trigger_value: string;
    rationale: string;
    confidence: number;
    status?: string;
  }>;
  linkedCollections?: LinkedCollection[];
  collectionDecisions?: CollectionDecision[];
  suggestedCollections?: CollectionDecision[];
  searchPhrases?: string[];
  note: string;
  archivedAt?: number | null;
  status: CaptureStatus;
  createdAt: number;
  updatedAt: number;
  processedAt: number | null;
};

type LinkedCollection = {
  id: string;
  title: string;
  description?: string;
  createdBy?: string;
  rationale?: string | null;
  confidence?: number | null;
};

type CollectionDecision = {
  type: "existing" | "new";
  collectionId?: string | null;
  title: string;
  description?: string | null;
  rationale: string;
  confidence: number;
};

type Collection = {
  id: string;
  title: string;
  description: string;
  status: "active" | "archived";
  captureCount: number;
  archivedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type CaptureStore = {
  captureSource: (sourceText: string) => Promise<string>;
  getCaptures: () => Promise<string>;
  updateCapture: (id: string, title: string, note: string, currentSaveIntent: string | null) => Promise<string>;
  archiveCapture: (id: string) => Promise<string>;
  restoreCapture: (id: string) => Promise<string>;
};

type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
};

type AppConfig = {
  apiUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
};

type NativeAuth = {
  getConfig: () => Promise<string>;
  getSession: () => Promise<string | null>;
  refreshSession: () => Promise<string | null>;
  forceRefreshSession?: () => Promise<string | null>;
  persistSession: (
    accessToken: string | null,
    refreshToken: string | null,
    expiresAt: number,
    userId: string | null
  ) => Promise<boolean>;
  clearSession: () => Promise<boolean>;
};

type NativeNetwork = {
  requestJson: (
    url: string,
    method: string,
    headersJson: string | null,
    body: string | null
  ) => Promise<string>;
};

type NativeClipboard = {
  copy: (text: string) => Promise<boolean>;
};

const nativeStore = NativeModules.PreciousCaptureStore as CaptureStore | undefined;
const nativeAuth = NativeModules.PreciousAuth as NativeAuth | undefined;
const nativeNetwork = NativeModules.PreciousNetwork as NativeNetwork | undefined;
const nativeClipboard = NativeModules.PreciousClipboard as NativeClipboard | undefined;

type SaveIntentConfig = {
  key: string;
  label: string;
  llm_description: string;
  active: boolean;
};

const INTENT_CONFIG = (saveIntents as SaveIntentConfig[]).filter((intent) => intent.active);
const INTENT_OPTIONS = INTENT_CONFIG.map((intent) => intent.key);
const INTENT_LABELS = new Map(INTENT_CONFIG.map((intent) => [intent.key, intent.label]));

type CaptureListMode = "active" | "archived";
type HomeMode = "captures" | "collections";
type CollectionListMode = "active" | "archived";

const PROCESSING_REFRESH_MS = 3000;
const LOCAL_PROCESSING_GRACE_MS = 30 * 60 * 1000;

class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function isAuthError(error: unknown) {
  return error instanceof ApiRequestError && (error.status === 401 || error.status === 403);
}

function hostFromUrl(value: string | null) {
  if (!value) return "";
  try {
    return new URL(value).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function parseCaptureUrl(url: string | null) {
  if (!url) return null;
  const id = url.match(/preciouscaptures:\/\/capture\/([^/?#]+)/)?.[1];
  return id ? decodeURIComponent(id) : null;
}

function formatTime(value: number) {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function humanize(value: string | undefined) {
  if (!value) return "";
  const intentLabel = INTENT_LABELS.get(value);
  if (intentLabel) return intentLabel;
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeIntent(value: string | undefined) {
  if (!value) return "";
  return INTENT_OPTIONS.includes(value) ? value : "";
}

function isArchived(capture: Pick<Capture, "archivedAt">) {
  return Boolean(capture.archivedAt);
}

function statusLabel(status: CaptureStatus) {
  if (status === "processing") return "Processing";
  if (status === "needs_review") return "Needs review";
  if (status === "failed") return "Failed";
  return "Ready";
}

function hasExtractedData(capture: Pick<Capture, "defaultIntent" | "summary" | "analysisProvider" | "analysisMode">) {
  return Boolean(
    capture.defaultIntent ||
      capture.summary ||
      (capture.analysisProvider && capture.analysisProvider !== "none")
  );
}

function displayStatus(capture: Capture): CaptureStatus {
  if (capture.status === "failed" && hasExtractedData(capture)) return "ready";
  return capture.status;
}

function sortCaptures(captures: Capture[]) {
  return [...captures].sort((a, b) => b.createdAt - a.createdAt);
}

function mergeRemoteCaptures(remoteCaptures: Capture[], currentCaptures: Capture[], listMode: CaptureListMode) {
  if (listMode === "archived") return sortCaptures(remoteCaptures);
  const remoteIds = new Set(remoteCaptures.map((capture) => capture.id));
  const now = Date.now();
  const freshLocalProcessing = currentCaptures.filter((capture) => {
    return (
      !remoteIds.has(capture.id) &&
      !isArchived(capture) &&
      displayStatus(capture) === "processing" &&
      now - capture.createdAt < LOCAL_PROCESSING_GRACE_MS
    );
  });
  return sortCaptures([...remoteCaptures, ...freshLocalProcessing]);
}

function friendlyError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (
    /UnknownHostException|Unable to resolve host|No address associated|fetch failed|SocketException|Software caused connection abort|Connection reset|unexpected end of stream|native_request_failed/i.test(
      message
    )
  ) {
    return "Network connection dropped. Try again in a moment.";
  }
  if (/unauthorized|session expired/i.test(message)) {
    return "Your session expired. Sign in again.";
  }
  return message || fallback;
}

function captureFromRemote(row: Record<string, any>): Capture {
  const analysis = row.analysis ?? {};
  const defaultIntent = analysis.default_intent ?? {};
  const archivedAtValue = row.archived_at || analysis.archived_at || null;
  const analysisMode = nullableValue(row.analysis_mode) || (nullableValue(row.analysis_provider) ? "llm" : undefined);
  const collectionDecisions = Array.isArray(analysis.collection_decisions)
    ? analysis.collection_decisions.map(collectionDecisionFromRemote).filter(Boolean) as CollectionDecision[]
    : Array.isArray(analysis.suggested_collections)
      ? analysis.suggested_collections.map(collectionDecisionFromRemote).filter(Boolean) as CollectionDecision[]
      : [];
  const remoteHasExtractedData = Boolean(
    row.default_intent ||
      row.analysis_provider ||
      analysis.summary ||
      defaultIntent.category
  );
  return {
    id: String(row.client_capture_key || row.id),
    remoteId: String(row.id || row.client_capture_key || ""),
    title: String(row.display_title || row.title || analysis.display_title || row.source_url || "Untitled capture"),
    sourceText: String(row.source_text || ""),
    sourceUrl: typeof row.source_url === "string" ? row.source_url : null,
    siteName: hostFromUrl(typeof row.source_url === "string" ? row.source_url : null),
    summary: analysis.summary || undefined,
    analysisMode,
    analysisProvider: nullableValue(row.analysis_provider),
    analysisModel: nullableValue(row.analysis_model),
    analysisError: row.analysis_error || undefined,
    defaultIntent: row.current_save_intent || row.default_intent || defaultIntent.category || undefined,
    intentRationale: row.intent_rationale || defaultIntent.rationale || undefined,
    confidenceLabel: analysis.confidence_label || undefined,
    needsReview: Boolean(analysis.needs_review || row.analysis_state === "needs_review"),
    entities: analysis.entities || [],
    suggestedReminders: analysis.suggested_reminders || [],
    linkedCollections: Array.isArray(row.linked_collections)
      ? row.linked_collections.map(linkedCollectionFromRemote)
      : Array.isArray(analysis.linked_collections)
        ? analysis.linked_collections.map(linkedCollectionFromRemote)
        : [],
    collectionDecisions,
    suggestedCollections: collectionDecisions,
    searchPhrases: analysis.search_phrases || [],
    note: String(row.context_note || ""),
    archivedAt:
      archivedAtValue
        ? typeof archivedAtValue === "number"
          ? archivedAtValue
          : Date.parse(String(archivedAtValue))
        : analysis.capture_state === "archived" || row.capture_state === "archived"
          ? row.updated_at
            ? Date.parse(row.updated_at)
            : Date.now()
          : null,
    status:
      row.analysis_state === "ready"
        ? "ready"
        : row.analysis_state === "needs_review"
          ? "needs_review"
          : row.analysis_state === "failed" && !remoteHasExtractedData
            ? "failed"
            : remoteHasExtractedData
              ? "ready"
              : "processing",
    createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
    updatedAt: row.updated_at ? Date.parse(row.updated_at) : Date.now(),
    processedAt: row.processed_at ? Date.parse(row.processed_at) : null
  };
}

function nullableValue(value: unknown) {
  if (value === null || value === undefined) return undefined;
  const text = String(value);
  return text && text !== "null" ? text : undefined;
}

function isEdgeCaptureApi(apiUrl: string) {
  return apiUrl.includes("/functions/v1/");
}

function captureListUrl(apiUrl: string, archived = false) {
  return isEdgeCaptureApi(apiUrl)
    ? `${apiUrl}?limit=50&archived=${archived ? "true" : "false"}`
    : `${apiUrl}/api/captures?view=summary&limit=50&archived=${archived ? "true" : "false"}`;
}

function captureMutationUrl(apiUrl: string) {
  return isEdgeCaptureApi(apiUrl) ? apiUrl : `${apiUrl}/api/captures`;
}

function edgeResourceUrl(apiUrl: string, resource: string, params: Record<string, string> = {}) {
  const url = new URL(isEdgeCaptureApi(apiUrl) ? apiUrl : `${apiUrl}/api/captures`);
  url.searchParams.set("resource", resource);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function collectionFromRemote(row: Record<string, any>): Collection {
  return {
    id: String(row.id),
    title: String(row.title || ""),
    description: String(row.description || ""),
    status: row.status === "archived" ? "archived" : "active",
    captureCount: Number(row.capture_count || row.captureCount || 0),
    archivedAt: nullableValue(row.archived_at),
    createdAt: nullableValue(row.created_at),
    updatedAt: nullableValue(row.updated_at)
  };
}

function linkedCollectionFromRemote(row: Record<string, any>): LinkedCollection {
  return {
    id: String(row.id || row.collection_id || ""),
    title: String(row.title || ""),
    description: nullableValue(row.description),
    createdBy: nullableValue(row.created_by || row.createdBy),
    rationale: nullableValue(row.rationale) || null,
    confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : null
  };
}

function collectionDecisionFromRemote(row: Record<string, any>): CollectionDecision | null {
  const type = row.type === "existing" ? "existing" : row.type === "new" ? "new" : null;
  if (!type) return null;
  return {
    type,
    collectionId: nullableValue(row.collection_id || row.collectionId) || null,
    title: String(row.title || row.name || ""),
    description: nullableValue(row.description) || null,
    rationale: String(row.rationale || ""),
    confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : 0
  };
}

async function requestJson<T>(
  url: string,
  input: { method?: string; headers?: Record<string, string>; body?: unknown } = {}
): Promise<T> {
  if (!nativeNetwork) {
    throw new Error("Native network bridge is unavailable.");
  }
  const raw = await nativeNetwork.requestJson(
    url,
    input.method ?? "GET",
    JSON.stringify(input.headers ?? {}),
    input.body === undefined ? null : JSON.stringify(input.body)
  );
  const response = JSON.parse(raw || "{}") as { ok: boolean; status: number; body: string };
  const json = response.body ? JSON.parse(response.body) : {};
  if (!response.ok) {
    throw new ApiRequestError(
      json.error_description || json.msg || json.error || `Request failed (${response.status})`,
      response.status
    );
  }
  return json as T;
}

export default function App() {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [homeMode, setHomeMode] = useState<HomeMode>("captures");
  const [query, setQuery] = useState("");
  const [listMode, setListMode] = useState<CaptureListMode>("active");
  const [collectionListMode, setCollectionListMode] = useState<CollectionListMode>("active");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [draftIntent, setDraftIntent] = useState("");
  const [collectionTitle, setCollectionTitle] = useState("");
  const [collectionDescription, setCollectionDescription] = useState("");
  const [collectionDraftDirty, setCollectionDraftDirty] = useState(false);
  const [showCollectionForm, setShowCollectionForm] = useState(false);
  const [draftTitleDirty, setDraftTitleDirty] = useState(false);
  const [draftNoteDirty, setDraftNoteDirty] = useState(false);
  const [draftIntentDirty, setDraftIntentDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [sourceDraft, setSourceDraft] = useState("");
  const [savingCapture, setSavingCapture] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState<"signin" | "signup" | null>(null);

  const getFreshSession = useCallback(async (force = false) => {
    if (!session) return null;
    const raw = force && nativeAuth?.forceRefreshSession
      ? await nativeAuth.forceRefreshSession()
      : await nativeAuth?.refreshSession();
    if (!raw) {
      await nativeAuth?.clearSession();
      setSession(null);
      setCaptures([]);
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

  const loadCaptures = useCallback(async () => {
    if (config?.apiUrl && session?.accessToken) {
      const activeSession = await getFreshSession();
      if (!activeSession?.accessToken) throw new Error("Your session expired. Sign in again.");
      const loadWithToken = (accessToken: string) =>
        requestJson<{ captures?: Array<Record<string, any>> }>(captureListUrl(config.apiUrl, listMode === "archived"), {
          headers: {
            accept: "application/json",
            apikey: config.supabaseAnonKey,
            authorization: `Bearer ${accessToken}`
          }
        });
      let json: { captures?: Array<Record<string, any>> };
      try {
        json = await loadWithToken(activeSession.accessToken);
      } catch (error) {
        if (!isAuthError(error)) throw error;
        const refreshed = await getFreshSession(true);
        if (!refreshed?.accessToken) throw new Error("Your session expired. Sign in again.");
        json = await loadWithToken(refreshed.accessToken);
      }
      const next = ((json.captures ?? []) as Array<Record<string, any>>).map(captureFromRemote);
      setCaptures((current) => mergeRemoteCaptures(next, current, listMode));
      return;
    }

    if (!nativeStore) {
      setMessage("Native capture store is unavailable.");
      return;
    }
    const raw = await nativeStore.getCaptures();
    const next = JSON.parse(raw || "[]") as Capture[];
    setCaptures(sortCaptures(next));
  }, [config, getFreshSession, listMode, session]);

  const loadCollections = useCallback(async () => {
    if (!config?.apiUrl || !session?.accessToken) {
      setCollections([]);
      return;
    }
    const activeSession = await getFreshSession();
    if (!activeSession?.accessToken) throw new Error("Your session expired. Sign in again.");
    const loadWithToken = (accessToken: string) =>
      requestJson<{ collections?: Array<Record<string, any>> }>(
        edgeResourceUrl(config.apiUrl, "collections", {
          archived: collectionListMode === "archived" ? "true" : "false"
        }),
        {
          headers: {
            accept: "application/json",
            apikey: config.supabaseAnonKey,
            authorization: `Bearer ${accessToken}`
          }
        }
      );
    let json: { collections?: Array<Record<string, any>> };
    try {
      json = await loadWithToken(activeSession.accessToken);
    } catch (error) {
      if (!isAuthError(error)) throw error;
      const refreshed = await getFreshSession(true);
      if (!refreshed?.accessToken) throw new Error("Your session expired. Sign in again.");
      json = await loadWithToken(refreshed.accessToken);
    }
    setCollections((json.collections ?? []).map(collectionFromRemote));
  }, [collectionListMode, config, getFreshSession, session]);

  const selectCapture = useCallback((captureId: string | null) => {
    setDraftTitleDirty(false);
    setDraftNoteDirty(false);
    setDraftIntentDirty(false);
    setSelectedId(captureId);
  }, []);

  const selectCollection = useCallback((collectionId: string | null) => {
    setSelectedCollectionId(collectionId);
    setCollectionDraftDirty(false);
    setShowCollectionForm(false);
  }, []);

  const openCapture = useCallback(
    (captureId: string | null) => {
      if (!captureId) return;
      const capture = captures.find((item) => item.id === captureId);
      if (!capture) {
        selectCapture(captureId);
        return;
      }
      selectCapture(capture.id);
      setDraftTitle(capture.title);
      setDraftNote(capture.note);
      setDraftIntent(normalizeIntent(capture.defaultIntent));
    },
    [captures, selectCapture]
  );

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
      const captureId = parseCaptureUrl(url);
      if (captureId) selectCapture(captureId);
    });
  }, [selectCapture]);

  useEffect(() => {
    const linkSubscription = Linking.addEventListener("url", ({ url }) => {
      const captureId = parseCaptureUrl(url);
      if (captureId) selectCapture(captureId);
      void loadCaptures();
    });
    return () => linkSubscription.remove();
  }, [loadCaptures, selectCapture]);

  useEffect(() => {
    const appSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void loadCaptures();
    });
    return () => appSubscription.remove();
  }, [loadCaptures]);

  useEffect(() => {
    void loadCaptures().catch((error) => {
      setMessage((current) => current || friendlyError(error, "Could not load captures"));
    });
  }, [loadCaptures]);

  useEffect(() => {
    if (homeMode !== "collections") return;
    void loadCollections().catch((error) => {
      setMessage((current) => current || friendlyError(error, "Could not load collections"));
    });
  }, [homeMode, loadCollections]);

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
    if (!selectedId && !selectedCollectionId) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      selectCapture(null);
      selectCollection(null);
      return true;
    });
    return () => subscription.remove();
  }, [selectCapture, selectCollection, selectedCollectionId, selectedId]);

  const filteredCaptures = useMemo(() => {
    const term = query.trim().toLowerCase();
    const visible = captures.filter((capture) => isArchived(capture) === (listMode === "archived"));
    if (!term) return visible;
    return visible.filter((capture) =>
      [capture.title, capture.summary ?? "", capture.note, capture.sourceText, capture.sourceUrl ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [captures, listMode, query]);

  const filteredCollections = useMemo(() => {
    const term = query.trim().toLowerCase();
    const visible = collections.filter((collection) => collection.status === collectionListMode);
    if (!term) return visible;
    return visible.filter((collection) =>
      [collection.title, collection.description].join(" ").toLowerCase().includes(term)
    );
  }, [collectionListMode, collections, query]);

  const selected = selectedId ? captures.find((capture) => capture.id === selectedId) ?? null : null;
  const selectedCollection = selectedCollectionId
    ? collections.find((collection) => collection.id === selectedCollectionId) ?? null
    : null;
  const selectedAnalysisMode = nullableValue(selected?.analysisMode);
  const selectedSummary =
    selected?.summary && selected.summary !== selected.sourceUrl && selected.summary !== selected.sourceText
      ? selected.summary
      : undefined;

  async function saveQuickEdit() {
    if (!selected) return;
    if (config?.apiUrl && session?.accessToken) {
      try {
        const activeSession = await getFreshSession();
        if (!activeSession?.accessToken) throw new Error("Your session expired. Sign in again.");
        const saveWithToken = (accessToken: string) =>
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
              currentSaveIntent: draftIntent || undefined
            }
          });
        let json: { capture: Record<string, any> };
        try {
          json = await saveWithToken(activeSession.accessToken);
        } catch (error) {
          if (!isAuthError(error)) throw error;
          const refreshed = await getFreshSession(true);
          if (!refreshed?.accessToken) throw new Error("Your session expired. Sign in again.");
          json = await saveWithToken(refreshed.accessToken);
        }
        setCaptures((current) =>
          current.map((item) => (item.id === selected.id ? captureFromRemote(json.capture) : item))
        );
        setDraftTitleDirty(false);
        setDraftNoteDirty(false);
        setDraftIntentDirty(false);
        setMessage("Saved.");
      } catch (error) {
        setMessage(friendlyError(error, "Could not save."));
      }
      return;
    }
    if (!nativeStore) return;
    const raw = await nativeStore.updateCapture(selected.id, draftTitle.trim(), draftNote.trim(), draftIntent || null);
    const next = JSON.parse(raw || "[]") as Capture[];
    setCaptures(sortCaptures(next));
    setDraftTitleDirty(false);
    setDraftNoteDirty(false);
    setDraftIntentDirty(false);
    setMessage("Saved.");
  }

  async function collectionRequest<T>(
    resource: "collections" | "collection-links",
    input: { method: string; body?: unknown }
  ) {
    if (!config?.apiUrl || !session?.accessToken) throw new Error("Sign in to manage collections.");
    const activeSession = await getFreshSession();
    if (!activeSession?.accessToken) throw new Error("Your session expired. Sign in again.");
    const send = (accessToken: string) =>
      requestJson<T>(edgeResourceUrl(config.apiUrl, resource), {
        method: input.method,
        headers: {
          apikey: config.supabaseAnonKey,
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: input.body
      });
    try {
      return await send(activeSession.accessToken);
    } catch (error) {
      if (!isAuthError(error)) throw error;
      const refreshed = await getFreshSession(true);
      if (!refreshed?.accessToken) throw new Error("Your session expired. Sign in again.");
      return await send(refreshed.accessToken);
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
        setCollections((current) =>
          current.map((item) => (item.id === selectedCollection.id ? collectionFromRemote(json.collection) : item))
        );
      } else {
        const json = await collectionRequest<{ collection: Record<string, any> }>("collections", {
          method: "POST",
          body: { title, description }
        });
        setCollections((current) => [collectionFromRemote(json.collection), ...current]);
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
      await collectionRequest<{ collection: Record<string, any> }>("collections", {
        method: "PATCH",
        body: { collectionId: collection.id, action: archived ? "archive" : "restore" }
      });
      selectCollection(null);
      setMessage(archived ? "Collection archived." : "Collection restored.");
      await loadCollections();
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
    Alert.alert(
      "Archive this collection?",
      "Current captures will be removed from it. Restoring brings back only this snapshot.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Archive", style: "destructive", onPress: () => void setCollectionArchiveState(collection, true) }
      ]
    );
  }

  async function unlinkCollectionFromCapture(collectionId: string) {
    if (!selected) return;
    const captureId = selected.remoteId || selected.id;
    try {
      await collectionRequest<{ ok: boolean }>("collection-links", {
        method: "PATCH",
        body: { action: "unlink", collectionId, captureId }
      });
      setCaptures((current) =>
        current.map((capture) =>
          capture.id === selected.id
            ? {
                ...capture,
                linkedCollections: (capture.linkedCollections || []).filter((collection) => collection.id !== collectionId)
              }
            : capture
        )
      );
      setMessage("Removed from collection.");
    } catch (error) {
      setMessage(friendlyError(error, "Could not remove collection."));
    }
  }

  async function acceptCollectionDecision(decision: CollectionDecision) {
    if (!selected) return;
    const captureId = selected.remoteId || selected.id;
    try {
      if (decision.type === "existing" && decision.collectionId) {
        await collectionRequest<{ ok: boolean }>("collection-links", {
          method: "POST",
          body: {
            collectionId: decision.collectionId,
            captureId,
            rationale: decision.rationale,
            confidence: decision.confidence,
            createdBy: "analysis"
          }
        });
      } else if (decision.type === "new" && decision.title.trim() && decision.description?.trim()) {
        await collectionRequest<{ collection: Record<string, any> }>("collections", {
          method: "POST",
          body: {
            title: decision.title.trim(),
            description: decision.description.trim(),
            captureId,
            rationale: decision.rationale,
            confidence: decision.confidence,
            createdBy: "analysis"
          }
        });
      }
      setCaptures((current) =>
        current.map((capture) =>
          capture.id === selected.id
            ? {
                ...capture,
                collectionDecisions: (capture.collectionDecisions || []).filter((item) => item !== decision),
                suggestedCollections: (capture.suggestedCollections || []).filter((item) => item !== decision)
              }
            : capture
        )
      );
      await loadCaptures();
      if (homeMode === "collections") await loadCollections();
      setMessage("Collection updated.");
    } catch (error) {
      setMessage(friendlyError(error, "Could not update collection."));
    }
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

  async function setArchiveState(archived: boolean) {
    if (!selected) return;
    if (config?.apiUrl && session?.accessToken) {
      try {
        const activeSession = await getFreshSession();
        if (!activeSession?.accessToken) throw new Error("Your session expired. Sign in again.");
        const updateWithToken = (accessToken: string) =>
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
          });
        try {
          await updateWithToken(activeSession.accessToken);
        } catch (error) {
          if (!isAuthError(error)) throw error;
          const refreshed = await getFreshSession(true);
          if (!refreshed?.accessToken) throw new Error("Your session expired. Sign in again.");
          await updateWithToken(refreshed.accessToken);
        }
        selectCapture(null);
        setMessage(archived ? "Archived." : "Restored.");
        await loadCaptures();
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
    setCaptures(sortCaptures(next));
    selectCapture(null);
    setMessage(archived ? "Archived." : "Restored.");
  }

  function confirmArchive() {
    if (!selected) return;
    if (isArchived(selected)) {
      void setArchiveState(false);
      return;
    }
    Alert.alert(
      "Archive this capture?",
      "You can restore it from Archived.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Archive", style: "destructive", onPress: () => void setArchiveState(true) }
      ]
    );
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
      setMessage("Saved. AI extraction is running.");
    } catch (error) {
      setMessage(friendlyError(error, "Could not save capture."));
    } finally {
      setSavingCapture(false);
    }
  }

  async function submitAuth(mode: "signin" | "signup") {
    if (!config?.supabaseUrl || !config.supabaseAnonKey || !nativeAuth) {
      setMessage("Supabase URL and anon key are not configured in the Android build.");
      return;
    }
    setAuthLoading(mode);
    setMessage("");
    try {
      const endpoint =
        mode === "signin"
          ? `${config.supabaseUrl}/auth/v1/token?grant_type=password`
          : `${config.supabaseUrl}/auth/v1/signup`;
      const json = await requestJson<Record<string, any>>(endpoint, {
        method: "POST",
        headers: {
          apikey: config.supabaseAnonKey,
          "content-type": "application/json"
        },
        body: { email: authEmail.trim(), password: authPassword }
      });
      const accessToken = json.access_token;
      const refreshToken = json.refresh_token;
      const userId = json.user?.id;
      const expiresAt = Number(json.expires_at || Math.floor(Date.now() / 1000) + Number(json.expires_in || 3600));
      if (!accessToken || !refreshToken || !userId) {
        throw new Error("Check your email to confirm the account, then sign in.");
      }
      const next = { accessToken, refreshToken, expiresAt, userId };
      await nativeAuth.persistSession(accessToken, refreshToken, expiresAt, userId);
      setSession(next);
      setMessage("");
    } catch (error) {
      setMessage(friendlyError(error, "Sign in failed"));
    } finally {
      setAuthLoading(null);
    }
  }

  async function signOut() {
    await nativeAuth?.clearSession();
    setSession(null);
    setCaptures([]);
    setCollections([]);
    selectCapture(null);
    selectCollection(null);
  }

  function renderCapture({ item }: { item: Capture }) {
    const source = item.siteName || hostFromUrl(item.sourceUrl) || item.sourceText.slice(0, 56);
    const itemStatus = displayStatus(item);
    return (
      <Pressable
        onPress={() => openCapture(item.id)}
        style={({ pressed }) => [styles.captureRow, pressed && styles.pressed]}
      >
        <View style={styles.rowTop}>
          <Text numberOfLines={1} style={styles.captureTitle}>
            {item.title}
          </Text>
          <Text
            style={[
              styles.status,
              itemStatus === "processing" && styles.statusProcessing,
              itemStatus === "needs_review" && styles.statusReview,
              itemStatus === "failed" && styles.statusFailed
            ]}
          >
            {statusLabel(itemStatus)}
          </Text>
        </View>
        <Text numberOfLines={1} style={styles.meta}>
          {source || "Shared text"} · {formatTime(item.createdAt)}
        </Text>
        {item.summary ? (
          <Text numberOfLines={2} style={styles.summaryPreview}>
            {item.summary}
          </Text>
        ) : null}
        {item.defaultIntent ? (
          <Text numberOfLines={1} style={styles.intentPreview}>
            {humanize(item.defaultIntent)} · {item.confidenceLabel || nullableValue(item.analysisMode) || "Analyzed"}
          </Text>
        ) : null}
        {item.note ? (
          <Text numberOfLines={2} style={styles.notePreview}>
            {item.note}
          </Text>
        ) : null}
      </Pressable>
    );
  }

  function renderCollection({ item }: { item: Collection }) {
    return (
      <Pressable
        onPress={() => {
          selectCollection(item.id);
          setCollectionTitle(item.title);
          setCollectionDescription(item.description);
        }}
        style={({ pressed }) => [styles.captureRow, pressed && styles.pressed]}
      >
        <View style={styles.rowTop}>
          <Text numberOfLines={1} style={styles.captureTitle}>
            {item.title}
          </Text>
          <Text style={styles.status}>
            {item.status === "archived" ? "Archived" : `${item.captureCount} captures`}
          </Text>
        </View>
        <Text numberOfLines={2} style={styles.summaryPreview}>
          {item.description}
        </Text>
      </Pressable>
    );
  }

  if (selectedCollection) {
    const saveDisabled = !collectionTitle.trim() || !collectionDescription.trim();
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <ScrollView contentContainerStyle={styles.detail}>
          <View style={styles.detailHeader}>
            <Pressable onPress={() => selectCollection(null)} style={styles.textButton}>
              <Text style={styles.textButtonText}>Back</Text>
            </Pressable>
            <Text style={styles.status}>
              {selectedCollection.status === "archived" ? "Archived" : `${selectedCollection.captureCount} captures`}
            </Text>
          </View>
          <Text style={styles.kicker}>Collection</Text>
          <TextInput
            onChangeText={(value) => {
              setCollectionDraftDirty(true);
              setCollectionTitle(value);
            }}
            placeholder="Title"
            placeholderTextColor={colors.muted}
            style={styles.titleInput}
            value={collectionTitle}
          />
          <View style={styles.editBlock}>
            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              multiline
              onChangeText={(value) => {
                setCollectionDraftDirty(true);
                setCollectionDescription(value);
              }}
              placeholder="What belongs in this collection"
              placeholderTextColor={colors.muted}
              style={styles.noteInput}
              value={collectionDescription}
            />
          </View>
          <Pressable
            disabled={saveDisabled}
            onPress={() => void saveCollection()}
            style={[styles.primaryButton, saveDisabled && styles.disabledButton]}
          >
            <Text style={styles.primaryButtonText}>Save collection</Text>
          </Pressable>
          <Pressable onPress={() => confirmArchiveCollection(selectedCollection)} style={styles.secondaryButton}>
            <Text style={selectedCollection.status === "archived" ? styles.secondaryButtonText : styles.dangerButtonText}>
              {selectedCollection.status === "archived" ? "Restore collection" : "Archive collection"}
            </Text>
          </Pressable>
          {message ? <Text style={styles.message}>{message}</Text> : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (selected) {
    const selectedArchived = isArchived(selected);
    const sourceValue = selected.sourceUrl || selected.sourceText;
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <ScrollView contentContainerStyle={styles.detail}>
          <View style={styles.detailHeader}>
            <Pressable onPress={() => selectCapture(null)} style={styles.textButton}>
              <Text style={styles.textButtonText}>Back</Text>
            </Pressable>
            <Text
              style={[
                styles.status,
                displayStatus(selected) === "processing" && styles.statusProcessing,
                displayStatus(selected) === "needs_review" && styles.statusReview,
                displayStatus(selected) === "failed" && styles.statusFailed
              ]}
            >
              {selectedArchived ? "Archived" : statusLabel(displayStatus(selected))}
            </Text>
          </View>
          <Text style={styles.kicker}>Capture review</Text>
          <TextInput
            multiline
            onChangeText={(value) => {
              setDraftTitleDirty(true);
              setDraftTitle(value);
            }}
            placeholder="Title"
            placeholderTextColor={colors.muted}
            style={styles.titleInput}
            value={draftTitle}
          />
          <View style={styles.editBlock}>
            <Text style={styles.fieldLabel}>Save intent</Text>
            <View style={styles.intentGrid}>
              {INTENT_OPTIONS.map((intent) => {
                const selectedIntent = draftIntent === intent;
                return (
                  <Pressable
                    key={intent}
                    onPress={() => {
                      setDraftIntentDirty(true);
                      setDraftIntent(intent);
                    }}
                    style={[styles.intentChip, selectedIntent && styles.intentChipSelected]}
                  >
                    <Text style={[styles.intentChipText, selectedIntent && styles.intentChipTextSelected]}>
                      {humanize(intent)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={styles.editBlock}>
            <Text style={styles.fieldLabel}>Context note</Text>
            <TextInput
              multiline
              onChangeText={(value) => {
                setDraftNoteDirty(true);
                setDraftNote(value);
              }}
              placeholder="Add why you saved this, if the extraction missed it"
              placeholderTextColor={colors.muted}
              style={styles.noteInput}
              value={draftNote}
            />
          </View>
          <View style={styles.sourceBlock}>
            <View style={styles.sectionHeader}>
              <Text style={styles.meta}>Source</Text>
              {sourceValue ? (
                <Pressable onPress={() => void copySource()} hitSlop={8}>
                  <Text style={styles.inlineAction}>Copy</Text>
                </Pressable>
              ) : null}
            </View>
            <Text selectable style={styles.sourceText}>{sourceValue}</Text>
          </View>
          {selectedSummary ? (
            <View style={styles.sourceBlock}>
              <Text style={styles.meta}>Extracted</Text>
              <Text style={styles.sourceText}>{selectedSummary}</Text>
            </View>
          ) : null}
          {(selected.defaultIntent || selected.intentRationale || selectedAnalysisMode) ? (
            <View style={styles.sourceBlock}>
              <Text style={styles.meta}>Intent</Text>
              {selected.defaultIntent ? (
                <Text style={styles.sourceText}>
                  {humanize(selected.defaultIntent)}
                  {selected.confidenceLabel ? ` · ${selected.confidenceLabel}` : ""}
                </Text>
              ) : null}
              {selected.intentRationale ? (
                <Text style={styles.supportingText}>{selected.intentRationale}</Text>
              ) : null}
              {selectedAnalysisMode ? (
                <Text style={styles.supportingText}>
                  {selectedAnalysisMode === "llm"
                    ? `LLM extraction · ${selected.analysisModel || selected.analysisProvider || "model"}`
                    : `LLM extraction unavailable · ${selectedAnalysisMode}`}
                </Text>
              ) : null}
              {selected.analysisError && selected.analysisError !== "null" ? (
                <Text style={styles.errorText}>{selected.analysisError}</Text>
              ) : null}
            </View>
          ) : null}
          {selected.entities?.length ? (
            <View style={styles.sourceBlock}>
              <Text style={styles.meta}>Entities</Text>
              {selected.entities.slice(0, 5).map((entity) => (
                <Text key={`${entity.type}-${entity.name}`} style={styles.sourceText}>
                  {entity.name} · {entity.type}
                </Text>
              ))}
            </View>
          ) : null}
          {selected.suggestedReminders?.length ? (
            <View style={styles.sourceBlock}>
              <Text style={styles.meta}>Reminders</Text>
              {selected.suggestedReminders.slice(0, 3).map((reminder) => (
                <Text key={`${reminder.trigger_type}-${reminder.trigger_value}`} style={styles.sourceText}>
                  {reminder.trigger_value || humanize(reminder.trigger_type)}
                  {reminder.status ? ` · ${humanize(reminder.status)}` : ""} · {reminder.rationale}
                </Text>
              ))}
            </View>
          ) : null}
          {selected.linkedCollections?.length ? (
            <View style={styles.sourceBlock}>
              <Text style={styles.meta}>Linked collections</Text>
              {selected.linkedCollections.map((collection) => (
                <View key={collection.id} style={styles.collectionActionRow}>
                  <View style={styles.collectionActionText}>
                    <Text style={styles.sourceText}>{collection.title}</Text>
                    {collection.rationale ? (
                      <Text style={styles.supportingText}>{collection.rationale}</Text>
                    ) : null}
                  </View>
                  <Pressable onPress={() => void unlinkCollectionFromCapture(collection.id)} hitSlop={8}>
                    <Text style={styles.inlineAction}>Remove</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          {selected.collectionDecisions?.length ? (
            <View style={styles.sourceBlock}>
              <Text style={styles.meta}>Collection suggestions</Text>
              {selected.collectionDecisions.slice(0, 4).map((collection, index) => (
                <View key={`${collection.type}-${collection.collectionId || collection.title}-${index}`} style={styles.suggestionBlock}>
                  <Text style={styles.sourceText}>
                    {collection.type === "new" ? "New: " : ""}
                    {collection.title}
                  </Text>
                  {collection.description ? (
                    <Text style={styles.supportingText}>{collection.description}</Text>
                  ) : null}
                  <Text style={styles.supportingText}>{collection.rationale}</Text>
                  <Pressable onPress={() => void acceptCollectionDecision(collection)} style={styles.smallButton}>
                    <Text style={styles.smallButtonText}>
                      {collection.type === "new" ? "Create and link" : "Link"}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          <Pressable onPress={() => void saveQuickEdit()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Save</Text>
          </Pressable>
          <Pressable onPress={confirmArchive} style={styles.secondaryButton}>
            <Text style={selectedArchived ? styles.secondaryButtonText : styles.dangerButtonText}>
              {selectedArchived ? "Restore capture" : "Archive capture"}
            </Text>
          </Pressable>
          {message ? <Text style={styles.message}>{message}</Text> : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (config?.apiUrl && !session) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <ScrollView contentContainerStyle={styles.detail} keyboardShouldPersistTaps="handled">
          <Text style={styles.kicker}>Sign in</Text>
          <Text style={styles.title}>Precious Captures</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setAuthEmail}
            placeholder="Email"
            placeholderTextColor={colors.muted}
            style={styles.search}
            value={authEmail}
          />
          <TextInput
            onChangeText={setAuthPassword}
            placeholder="Password"
            placeholderTextColor={colors.muted}
            secureTextEntry
            style={styles.search}
            value={authPassword}
          />
          <Pressable
            disabled={Boolean(authLoading)}
            onPress={() => void submitAuth("signin")}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>
              {authLoading === "signin" ? "Signing in..." : "Sign in"}
            </Text>
          </Pressable>
          <Pressable
            disabled={Boolean(authLoading)}
            onPress={() => void submitAuth("signup")}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>
              {authLoading === "signup" ? "Creating..." : "Create account"}
            </Text>
          </Pressable>
          {message ? <Text style={styles.errorText}>{message}</Text> : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.kicker}>
            {homeMode === "captures"
              ? `${filteredCaptures.length} ${listMode === "archived" ? "archived" : "active"} captures`
              : `${filteredCollections.length} ${collectionListMode} collections`}
          </Text>
          <Text style={styles.title}>Precious Captures</Text>
          {session ? (
            <Pressable onPress={() => void signOut()} style={styles.textButton}>
              <Text style={styles.textButtonText}>Sign out</Text>
            </Pressable>
          ) : null}
        </View>
        <TextInput
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={colors.muted}
          style={styles.search}
          value={query}
        />
        <View style={styles.segmented}>
          {(["captures", "collections"] as const).map((mode) => (
            <Pressable
              key={mode}
              onPress={() => {
                setHomeMode(mode);
                selectCapture(null);
                selectCollection(null);
              }}
              style={[styles.segment, homeMode === mode && styles.segmentSelected]}
            >
              <Text style={[styles.segmentText, homeMode === mode && styles.segmentTextSelected]}>
                {mode === "captures" ? "Captures" : "Collections"}
              </Text>
            </Pressable>
          ))}
        </View>
        {homeMode === "captures" ? (
          <>
            <View style={styles.segmented}>
          {(["active", "archived"] as const).map((mode) => (
            <Pressable
              key={mode}
              onPress={() => {
                setListMode(mode);
                selectCapture(null);
              }}
              style={[styles.segment, listMode === mode && styles.segmentSelected]}
            >
              <Text style={[styles.segmentText, listMode === mode && styles.segmentTextSelected]}>
                {mode === "active" ? "Active" : "Archived"}
              </Text>
            </Pressable>
          ))}
            </View>
            <View style={styles.captureBox}>
              <TextInput
                multiline
                onChangeText={setSourceDraft}
                placeholder="Paste a link or note"
                placeholderTextColor={colors.muted}
                style={styles.captureInput}
                value={sourceDraft}
              />
              <Pressable
                disabled={savingCapture || !sourceDraft.trim()}
                onPress={() => void saveCaptureSource()}
                style={[
                  styles.primaryButton,
                  (savingCapture || !sourceDraft.trim()) && styles.disabledButton
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {savingCapture ? "Saving..." : "Save and analyze"}
                </Text>
              </Pressable>
              {message ? <Text style={styles.message}>{message}</Text> : null}
            </View>
            <FlatList
              data={filteredCaptures}
              keyExtractor={(item) => item.id}
              renderItem={renderCapture}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>
                    {listMode === "archived" ? "No archived captures." : "Share something in."}
                  </Text>
                  <Text style={styles.emptyText}>
                    {listMode === "archived"
                      ? "Archived captures will appear here so you can restore them later."
                      : "Use the Android share sheet from a browser, message, or notes app."}
                  </Text>
                </View>
              }
              contentContainerStyle={filteredCaptures.length ? styles.listContent : styles.emptyContent}
            />
          </>
        ) : (
          <>
            <View style={styles.segmented}>
              {(["active", "archived"] as const).map((mode) => (
                <Pressable
                  key={mode}
                  onPress={() => {
                    setCollectionListMode(mode);
                    selectCollection(null);
                  }}
                  style={[styles.segment, collectionListMode === mode && styles.segmentSelected]}
                >
                  <Text style={[styles.segmentText, collectionListMode === mode && styles.segmentTextSelected]}>
                    {mode === "active" ? "Active" : "Archived"}
                  </Text>
                </Pressable>
              ))}
            </View>
            {collectionListMode === "active" ? (
              <View style={styles.captureBox}>
                {showCollectionForm ? (
                  <>
                    <TextInput
                      onChangeText={(value) => {
                        setCollectionDraftDirty(true);
                        setCollectionTitle(value);
                      }}
                      placeholder="Collection title"
                      placeholderTextColor={colors.muted}
                      style={styles.search}
                      value={collectionTitle}
                    />
                    <TextInput
                      multiline
                      onChangeText={(value) => {
                        setCollectionDraftDirty(true);
                        setCollectionDescription(value);
                      }}
                      placeholder="Description"
                      placeholderTextColor={colors.muted}
                      style={styles.captureInput}
                      value={collectionDescription}
                    />
                    <Pressable
                      disabled={!collectionTitle.trim() || !collectionDescription.trim()}
                      onPress={() => void saveCollection()}
                      style={[
                        styles.primaryButton,
                        (!collectionTitle.trim() || !collectionDescription.trim()) && styles.disabledButton
                      ]}
                    >
                      <Text style={styles.primaryButtonText}>Save collection</Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    onPress={() => {
                      setCollectionTitle("");
                      setCollectionDescription("");
                      setShowCollectionForm(true);
                    }}
                    style={styles.primaryButton}
                  >
                    <Text style={styles.primaryButtonText}>Add collection</Text>
                  </Pressable>
                )}
                {message ? <Text style={styles.message}>{message}</Text> : null}
              </View>
            ) : message ? (
              <Text style={styles.message}>{message}</Text>
            ) : null}
            <FlatList
              data={filteredCollections}
              keyExtractor={(item) => item.id}
              renderItem={renderCollection}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>
                    {collectionListMode === "archived" ? "No archived collections." : "No collections yet."}
                  </Text>
                  <Text style={styles.emptyText}>
                    {collectionListMode === "archived"
                      ? "Archived collections can be restored with their archive-time snapshot."
                      : "Create a bucket with a title and description."}
                  </Text>
                </View>
              }
              contentContainerStyle={filteredCollections.length ? styles.listContent : styles.emptyContent}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const colors = {
  paper: "#fbfbf8",
  ink: "#20201d",
  muted: "#7c7a72",
  line: "#e4e1da",
  soft: "#f2f1ec",
  processing: "#8a806d"
};

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.paper,
    flex: 1,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0
  },
  container: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 18
  },
  header: {
    gap: 4,
    paddingBottom: 18
  },
  kicker: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  title: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 0
  },
  search: {
    backgroundColor: colors.soft,
    borderRadius: 8,
    color: colors.ink,
    fontSize: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  segmented: {
    backgroundColor: colors.soft,
    borderRadius: 8,
    flexDirection: "row",
    marginBottom: 12,
    padding: 3
  },
  segment: {
    alignItems: "center",
    borderRadius: 6,
    flex: 1,
    paddingVertical: 8
  },
  segmentSelected: {
    backgroundColor: colors.paper
  },
  segmentText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  segmentTextSelected: {
    color: colors.ink
  },
  captureBox: {
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
    paddingBottom: 16
  },
  captureInput: {
    backgroundColor: colors.soft,
    borderRadius: 8,
    color: colors.ink,
    fontSize: 15,
    minHeight: 78,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: "top"
  },
  listContent: {
    paddingBottom: 40
  },
  captureRow: {
    gap: 7,
    paddingVertical: 16
  },
  rowTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  captureTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 18,
    fontWeight: "600"
  },
  status: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700"
  },
  statusProcessing: {
    color: colors.processing
  },
  statusReview: {
    color: "#9a6b1f"
  },
  statusFailed: {
    color: "#9f3d2e"
  },
  meta: {
    color: colors.muted,
    fontSize: 13
  },
  notePreview: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 21
  },
  summaryPreview: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21
  },
  intentPreview: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "600",
    textTransform: "capitalize"
  },
  separator: {
    backgroundColor: colors.line,
    height: StyleSheet.hairlineWidth
  },
  pressed: {
    opacity: 0.55
  },
  emptyContent: {
    flexGrow: 1
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    paddingBottom: 80
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8
  },
  emptyText: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    maxWidth: 280
  },
  detail: {
    gap: 16,
    padding: 22
  },
  detailHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  textButton: {
    alignSelf: "flex-start",
    paddingVertical: 8
  },
  textButtonText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "600"
  },
  titleInput: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 34,
    paddingVertical: 6
  },
  editBlock: {
    gap: 8
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700"
  },
  intentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  intentChip: {
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  intentChipSelected: {
    backgroundColor: colors.ink,
    borderColor: colors.ink
  },
  intentChipText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700"
  },
  intentChipTextSelected: {
    color: colors.paper
  },
  noteInput: {
    backgroundColor: colors.soft,
    borderRadius: 8,
    color: colors.ink,
    fontSize: 15,
    minHeight: 104,
    padding: 14,
    textAlignVertical: "top"
  },
  sourceBlock: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
    paddingTop: 16
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  inlineAction: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700"
  },
  sourceText: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22
  },
  supportingText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21
  },
  collectionActionRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  collectionActionText: {
    flex: 1,
    gap: 2
  },
  suggestionBlock: {
    gap: 6,
    paddingBottom: 10
  },
  smallButton: {
    alignSelf: "flex-start",
    backgroundColor: colors.ink,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  smallButtonText: {
    color: colors.paper,
    fontSize: 13,
    fontWeight: "700"
  },
  errorText: {
    color: "#9f3d2e",
    fontSize: 14,
    lineHeight: 21
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: 8,
    paddingVertical: 14
  },
  disabledButton: {
    opacity: 0.45
  },
  primaryButtonText: {
    color: colors.paper,
    fontSize: 16,
    fontWeight: "700"
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 14
  },
  secondaryButtonText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700"
  },
  dangerButtonText: {
    color: "#9f3d2e",
    fontSize: 16,
    fontWeight: "700"
  },
  message: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center"
  }
});
