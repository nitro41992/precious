import "react-native-url-polyfill/auto";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
type ReviewReason = "intent" | "collection" | "analysis";

type UrlEvidence = {
  status?: "extracted" | "partial_evidence" | "needs_client_resolution" | "insufficient_url_evidence" | "failed";
  evidence_quality?: "high" | "medium" | "low" | "none";
  user_facing_message?: string;
  failure_reason?: string;
  canonical_url?: string;
  client_resolved_url?: string;
  missing_evidence?: string[];
};

type Capture = {
  id: string;
  remoteId?: string;
  title: string;
  sourceText: string;
  sourceUrl: string | null;
  siteName?: string;
  summary?: string;
  urlEvidence?: UrlEvidence | null;
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
  manualCollectionOverrides?: CollectionChoiceOverride[];
  searchPhrases?: string[];
  note: string;
  archivedAt?: number | null;
  reviewConfirmedAt?: number | null;
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

type CollectionChoiceOverride = {
  collectionId: string;
  source?: string;
  restoredDecisions: CollectionDecision[];
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

type ReminderSuggestion = NonNullable<Capture["suggestedReminders"]>[number];
type ReminderDraftAction = "keep" | "remove";
type CollectionDraftAction = "keep" | "remove" | "ignore" | "link" | "create" | "added";
type NoteSaveState = "idle" | "saving" | "saved" | "error";

type ReminderReviewDecision = {
  index: number;
  action: ReminderDraftAction;
};

type CollectionReviewDecision =
  | {
      kind: "linked";
      collectionId: string;
      action: "keep" | "remove";
    }
  | {
      kind: "suggested";
      index: number;
      type: CollectionDecision["type"];
      collectionId?: string | null;
      title: string;
      description?: string | null;
      rationale: string;
      confidence: number;
      action: "ignore" | "link" | "create";
    };

type CaptureReviewDraft = {
  title?: string;
  titleDirty?: boolean;
  note?: string;
  noteDirty?: boolean;
  intent?: string;
  intentDirty?: boolean;
  reminders?: Record<string, ReminderDraftAction>;
  collections?: Record<string, CollectionDraftAction>;
  updatedAt?: number;
};

type CaptureStore = {
  captureSource: (sourceText: string) => Promise<string>;
  submitExpandedUrl?: (id: string, expandedUrl: string) => Promise<string>;
  getCaptures: () => Promise<string>;
  updateCapture: (id: string, title: string, note: string, currentSaveIntent: string | null) => Promise<string>;
  confirmCaptureReview?: (id: string, title: string, note: string, currentSaveIntent: string | null) => Promise<string>;
  getReviewDrafts?: () => Promise<string | null>;
  setReviewDrafts?: (draftsJson: string) => Promise<boolean>;
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
  paste?: () => Promise<string>;
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

function extractHttpUrl(value: string | null | undefined) {
  const match = String(value || "").match(/https?:\/\/\S+/i);
  if (!match) return "";
  try {
    const url = new URL(match[0].replace(/[),.;\]]+$/g, ""));
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
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

function reminderLabel(reminder: ReminderSuggestion | undefined) {
  if (!reminder) return "";
  return reminder.trigger_value || humanize(reminder.trigger_type);
}

function reminderDraftKey(reminder: ReminderSuggestion, index: number) {
  return `${index}:${reminder.trigger_type || ""}:${reminder.trigger_value || ""}`;
}

function linkedCollectionDraftKey(collectionId: string) {
  return `linked:${collectionId}`;
}

function suggestedCollectionDraftKey(collection: CollectionDecision, index: number) {
  return `suggested:${index}:${collection.type}:${collection.collectionId || collection.title}`;
}

function captureDraftKey(capture: Pick<Capture, "id" | "remoteId">) {
  return capture.remoteId || capture.id;
}

function cleanedReviewDraft(draft: CaptureReviewDraft): CaptureReviewDraft | null {
  const next: CaptureReviewDraft = { updatedAt: draft.updatedAt };
  if (draft.titleDirty && typeof draft.title === "string") {
    next.title = draft.title;
    next.titleDirty = true;
  }
  if (draft.noteDirty && typeof draft.note === "string") {
    next.note = draft.note;
    next.noteDirty = true;
  }
  if (draft.intentDirty && draft.intent) {
    next.intent = draft.intent;
    next.intentDirty = true;
  }
  if (draft.reminders && Object.keys(draft.reminders).length) {
    next.reminders = draft.reminders;
  }
  if (draft.collections && Object.keys(draft.collections).length) {
    next.collections = draft.collections;
  }
  const hasChanges = Boolean(
    next.titleDirty ||
      next.noteDirty ||
      next.intentDirty ||
      next.reminders ||
      next.collections
  );
  return hasChanges ? next : null;
}

function cleanSentence(value: string | null | undefined) {
  return String(value || "").trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
}

function conciseText(value: string | null | undefined, maxLength = 110) {
  const text = cleanSentence(value);
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength);
  const breakIndex = Math.max(clipped.lastIndexOf(","), clipped.lastIndexOf(";"), clipped.lastIndexOf(" "));
  return `${clipped.slice(0, breakIndex > 60 ? breakIndex : maxLength).trim()}...`;
}

function becauseSentence(value: string | null | undefined) {
  const text = conciseText(value);
  if (!text) return "";
  const body = text.replace(/^because[:\s]*/i, "");
  return `Because ${body.charAt(0).toLowerCase()}${body.slice(1)}.`;
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

function confidenceRequiresReview(value: string | undefined) {
  return value === "Maybe" || value === "Not sure" || value === "Couldn't tell";
}

function hasUnresolvedCollectionDecisions(capture: Pick<Capture, "collectionDecisions">) {
  return Boolean(capture.collectionDecisions?.length);
}

function reviewReasons(
  capture: Pick<Capture, "status" | "needsReview" | "confidenceLabel" | "collectionDecisions" | "reviewConfirmedAt">
): ReviewReason[] {
  if (capture.reviewConfirmedAt || capture.status === "processing" || capture.status === "failed") return [];
  const reasons: ReviewReason[] = [];
  if (confidenceRequiresReview(capture.confidenceLabel)) reasons.push("intent");
  if (hasUnresolvedCollectionDecisions(capture)) reasons.push("collection");
  if ((capture.needsReview || capture.status === "needs_review") && !reasons.length) reasons.push("analysis");
  return reasons;
}

function reviewReasonLabel(reason: ReviewReason) {
  if (reason === "intent") return "Intent uncertain";
  if (reason === "collection") return "Collection suggestions";
  return "Analysis needs review";
}

function reviewReasonSummary(reasons: ReviewReason[]) {
  return reasons.map(reviewReasonLabel).join(", ");
}

function urlEvidenceMessage(evidence?: UrlEvidence | null) {
  if (!evidence) return "";
  if (evidence.status === "needs_client_resolution") {
    return evidence.user_facing_message || "We couldn't access the exact content from this shared link. Open it once so we can categorize it accurately.";
  }
  if (evidence.status === "insufficient_url_evidence") {
    return evidence.user_facing_message || "We couldn't verify enough public information to categorize this exact link.";
  }
  if (evidence.status === "partial_evidence" || evidence.evidence_quality === "low") {
    return "Categorized from limited public information.";
  }
  return "";
}

function captureNeedsReview(
  capture: Pick<Capture, "status" | "needsReview" | "confidenceLabel" | "collectionDecisions" | "reviewConfirmedAt">
) {
  return reviewReasons(capture).length > 0;
}

function displayStatus(capture: Capture): CaptureStatus {
  if (captureNeedsReview(capture)) return "needs_review";
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
  const reviewConfirmedAtValue = row.review_confirmed_at || analysis.review_confirmed_at || null;
  const analysisMode = nullableValue(row.analysis_mode) || (nullableValue(row.analysis_provider) ? "llm" : undefined);
  const collectionDecisions = Array.isArray(analysis.collection_decisions)
    ? analysis.collection_decisions.map(collectionDecisionFromRemote).filter(Boolean) as CollectionDecision[]
    : Array.isArray(analysis.suggested_collections)
      ? analysis.suggested_collections.map(collectionDecisionFromRemote).filter(Boolean) as CollectionDecision[]
      : [];
  const manualCollectionOverrides = Array.isArray(analysis.collection_choice_overrides)
    ? analysis.collection_choice_overrides.map(collectionChoiceOverrideFromRemote).filter(Boolean) as CollectionChoiceOverride[]
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
    urlEvidence: analysis.url_evidence || row.urlEvidence || null,
    analysisMode,
    analysisProvider: nullableValue(row.analysis_provider),
    analysisModel: nullableValue(row.analysis_model),
    analysisError: row.analysis_error || undefined,
    defaultIntent: row.current_save_intent || row.default_intent || defaultIntent.category || undefined,
    intentRationale: row.intent_rationale || defaultIntent.rationale || undefined,
    confidenceLabel: analysis.confidence_label || undefined,
    needsReview: Boolean(
      !reviewConfirmedAtValue &&
        (analysis.needs_review ||
          row.analysis_state === "needs_review" ||
          confidenceRequiresReview(analysis.confidence_label) ||
          collectionDecisions.length)
    ),
    entities: analysis.entities || [],
    suggestedReminders: analysis.suggested_reminders || [],
    linkedCollections: Array.isArray(row.linked_collections)
      ? row.linked_collections.map(linkedCollectionFromRemote)
      : Array.isArray(analysis.linked_collections)
        ? analysis.linked_collections.map(linkedCollectionFromRemote)
        : [],
    collectionDecisions,
    suggestedCollections: collectionDecisions,
    manualCollectionOverrides,
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
    reviewConfirmedAt:
      reviewConfirmedAtValue
        ? typeof reviewConfirmedAtValue === "number"
          ? reviewConfirmedAtValue
          : Date.parse(String(reviewConfirmedAtValue))
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

function collectionChoiceOverrideFromRemote(row: Record<string, any>): CollectionChoiceOverride | null {
  const collectionId = nullableValue(row.collection_id || row.collectionId);
  if (!collectionId) return null;
  const restoredDecisions = Array.isArray(row.restored_decisions || row.restoredDecisions)
    ? (row.restored_decisions || row.restoredDecisions).map(collectionDecisionFromRemote).filter(Boolean) as CollectionDecision[]
    : [];
  return {
    collectionId,
    source: nullableValue(row.source),
    restoredDecisions
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
  const [captureReturnCollectionId, setCaptureReturnCollectionId] = useState<string | null>(null);
  const [homeMode, setHomeMode] = useState<HomeMode>("captures");
  const [query, setQuery] = useState("");
  const [listMode, setListMode] = useState<CaptureListMode>("active");
  const [collectionListMode, setCollectionListMode] = useState<CollectionListMode>("active");
  const [collectionCaptures, setCollectionCaptures] = useState<Capture[]>([]);
  const [collectionCapturesForId, setCollectionCapturesForId] = useState<string | null>(null);
  const [collectionCapturesLoading, setCollectionCapturesLoading] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [draftIntent, setDraftIntent] = useState("");
  const [quickIntentOpen, setQuickIntentOpen] = useState(false);
  const [reminderDrafts, setReminderDrafts] = useState<Record<string, ReminderDraftAction>>({});
  const [collectionDrafts, setCollectionDrafts] = useState<Record<string, CollectionDraftAction>>({});
  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);
  const [collectionPickerQuery, setCollectionPickerQuery] = useState("");
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
  const [sourceDraft, setSourceDraft] = useState("");
  const [savingCapture, setSavingCapture] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState<"signin" | "signup" | null>(null);
  const latestNoteRef = useRef("");

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

  const loadCollections = useCallback(async (mode: CollectionListMode = collectionListMode) => {
    if (!config?.apiUrl || !session?.accessToken) {
      setCollections([]);
      return;
    }
    const activeSession = await getFreshSession();
    if (!activeSession?.accessToken) throw new Error("Your session expired. Sign in again.");
    const loadWithToken = (accessToken: string) =>
      requestJson<{ collections?: Array<Record<string, any>> }>(
        edgeResourceUrl(config.apiUrl, "collections", {
          archived: mode === "archived" ? "true" : "false"
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

  const loadCollectionCaptures = useCallback(async (collectionId: string) => {
    if (!config?.apiUrl || !session?.accessToken) {
      setCollectionCaptures([]);
      setCollectionCapturesForId(collectionId);
      return;
    }
    setCollectionCapturesLoading(true);
    try {
      const activeSession = await getFreshSession();
      if (!activeSession?.accessToken) throw new Error("Your session expired. Sign in again.");
      const loadWithToken = (accessToken: string) =>
        requestJson<{ captures?: Array<Record<string, any>> }>(
          edgeResourceUrl(config.apiUrl, "collection-captures", {
            collectionId,
            limit: "100"
          }),
          {
            headers: {
              accept: "application/json",
              apikey: config.supabaseAnonKey,
              authorization: `Bearer ${accessToken}`
            }
          }
        );
      let json: { captures?: Array<Record<string, any>> };
      try {
        json = await loadWithToken(activeSession.accessToken);
      } catch (error) {
        if (!isAuthError(error)) throw error;
        const refreshed = await getFreshSession(true);
        if (!refreshed?.accessToken) throw new Error("Your session expired. Sign in again.");
        json = await loadWithToken(refreshed.accessToken);
      }
      setCollectionCaptures((json.captures ?? []).map(captureFromRemote));
      setCollectionCapturesForId(collectionId);
    } finally {
      setCollectionCapturesLoading(false);
    }
  }, [config, getFreshSession, session]);

  const selectCapture = useCallback((captureId: string | null) => {
    setDraftTitleDirty(false);
    setDraftNoteDirty(false);
    setDraftIntentDirty(false);
    setQuickIntentOpen(false);
    setReminderDrafts({});
    setCollectionDrafts({});
    setSelectedId(captureId);
  }, []);

  const selectCollection = useCallback((collectionId: string | null) => {
    setSelectedCollectionId(collectionId);
    setCaptureReturnCollectionId(null);
    setCollectionDraftDirty(false);
    setShowCollectionForm(false);
  }, []);

  const openCapture = useCallback(
    (captureId: string | null) => {
      if (!captureId) return;
      setCaptureReturnCollectionId(null);
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

  const openCaptureFromCollection = useCallback((capture: Capture, collectionId: string) => {
    setSelectedCollectionId(null);
    setCaptureReturnCollectionId(collectionId);
    selectCapture(capture.id);
    setDraftTitle(capture.title);
    setDraftNote(capture.note);
    setDraftIntent(normalizeIntent(capture.defaultIntent));
  }, [selectCapture]);

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
      if (selectedId && captureReturnCollectionId) {
        selectCapture(null);
        selectCollection(captureReturnCollectionId);
        return true;
      }
      selectCapture(null);
      selectCollection(null);
      return true;
    });
    return () => subscription.remove();
  }, [captureReturnCollectionId, selectCapture, selectCollection, selectedCollectionId, selectedId]);

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

  const selected = selectedId
    ? captures.find((capture) => capture.id === selectedId) ??
      collectionCaptures.find((capture) => capture.id === selectedId) ??
      null
    : null;
  const selectedCollection = selectedCollectionId
    ? collections.find((collection) => collection.id === selectedCollectionId) ?? null
    : null;
  const selectedDraftKey = selected ? captureDraftKey(selected) : "";

  useEffect(() => {
    latestNoteRef.current = draftNote;
  }, [draftNote]);

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
      return;
    }
    const savedDraft = reviewDraftsByCapture[captureDraftKey(selected)] || {};
    setDraftTitle(savedDraft.titleDirty && typeof savedDraft.title === "string" ? savedDraft.title : selected.title);
    setDraftNote(savedDraft.noteDirty && typeof savedDraft.note === "string" ? savedDraft.note : selected.note);
    setDraftIntent(
      savedDraft.intentDirty && savedDraft.intent
        ? savedDraft.intent
        : normalizeIntent(selected.defaultIntent)
    );
    setDraftTitleDirty(Boolean(savedDraft.titleDirty));
    setDraftNoteDirty(Boolean(savedDraft.noteDirty));
    setDraftIntentDirty(Boolean(savedDraft.intentDirty));
    setReminderDrafts(savedDraft.reminders || {});
    setCollectionDrafts(savedDraft.collections || {});
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
      }
      return;
    }
    if (selectedCollection?.status === "archived") {
      setCollectionCaptures([]);
      setCollectionCapturesForId(selectedCollectionId);
      return;
    }
    void loadCollectionCaptures(selectedCollectionId).catch((error) => {
      setCollectionCaptures([]);
      setCollectionCapturesForId(selectedCollectionId);
      setMessage((current) => current || friendlyError(error, "Could not load collection captures"));
    });
  }, [captureReturnCollectionId, loadCollectionCaptures, selectedCollection?.status, selectedCollectionId]);

  function showRationale(title: string, rationale: string | null | undefined) {
    const text = cleanSentence(rationale);
    if (!text) return;
    Alert.alert(title, text, [{ text: "Done" }]);
  }

  function applyUpdatedCapture(updatedCapture: Capture, previousId: string) {
    setCaptures((current) =>
      current.map((item) => (item.id === previousId ? updatedCapture : item))
    );
    setCollectionCaptures((current) =>
      current.map((item) => (item.id === previousId ? updatedCapture : item))
    );
  }

  function manualOverrideForCollection(capture: Capture, collectionId: string) {
    return (capture.manualCollectionOverrides || []).find((override) => override.collectionId === collectionId);
  }

  async function saveContextNote(capture: Capture, noteValue: string) {
    const captureKey = captureDraftKey(capture);
    setNoteSaveState("saving");
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
              captureId: capture.remoteId || capture.id,
              note: noteValue.trim()
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
        const updatedCapture = captureFromRemote(json.capture);
        setCaptures((current) =>
          current.map((item) => (item.id === capture.id ? updatedCapture : item))
        );
        setCollectionCaptures((current) =>
          current.map((item) => (item.id === capture.id ? updatedCapture : item))
        );
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
      setCaptures(sortCaptures(next));
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
    const intentOverride = nextIntent && normalizeIntent(nextIntent) ? nextIntent : undefined;
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
              currentSaveIntent: intentOverride || (draftIntentDirty && draftIntent ? draftIntent : undefined)
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
        const updatedCapture = captureFromRemote(json.capture);
        setCaptures((current) =>
          current.map((item) => (item.id === selected.id ? updatedCapture : item))
        );
        setCollectionCaptures((current) =>
          current.map((item) => (item.id === selected.id ? updatedCapture : item))
        );
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
      intentOverride || (draftIntentDirty && draftIntent ? draftIntent : null)
    );
    const next = JSON.parse(raw || "[]") as Capture[];
    setCaptures(sortCaptures(next));
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
              action: "save_review_decisions",
              title: draftTitle.trim(),
              note: draftNote.trim(),
              currentSaveIntent: draftIntentDirty && draftIntent ? draftIntent : undefined,
              reminderDecisions,
              collectionDecisions
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
        const updatedCapture = captureFromRemote(json.capture);
        setCaptures((current) =>
          current.map((item) => (item.id === selected.id ? updatedCapture : item))
        );
        setCollectionCaptures((current) =>
          current.map((item) => (item.id === selected.id ? updatedCapture : item))
        );
        setDraftTitleDirty(false);
        setDraftNoteDirty(false);
        setDraftIntentDirty(false);
        setReminderDrafts({});
        setCollectionDrafts({});
        clearSelectedReviewDraft(selected);
        if (homeMode === "collections") await loadCollections();
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
    setCaptures(sortCaptures(next));
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
        const activeSession = await getFreshSession();
        if (!activeSession?.accessToken) throw new Error("Your session expired. Sign in again.");
        const confirmWithToken = (accessToken: string) =>
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
              currentSaveIntent: draftIntentDirty && draftIntent ? draftIntent : undefined
            }
          });
        let json: { capture: Record<string, any> };
        try {
          json = await confirmWithToken(activeSession.accessToken);
        } catch (error) {
          if (!isAuthError(error)) throw error;
          const refreshed = await getFreshSession(true);
          if (!refreshed?.accessToken) throw new Error("Your session expired. Sign in again.");
          json = await confirmWithToken(refreshed.accessToken);
        }
        const updatedCapture = captureFromRemote(json.capture);
        setCaptures((current) =>
          current.map((item) => (item.id === selected.id ? updatedCapture : item))
        );
        setCollectionCaptures((current) =>
          current.map((item) => (item.id === selected.id ? updatedCapture : item))
        );
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
    setCaptures(sortCaptures(next));
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
      const activeSession = await getFreshSession();
      if (!activeSession?.accessToken) throw new Error("Your session expired. Sign in again.");
      const send = (accessToken: string) =>
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
        });
      let json: { capture: Record<string, any> };
      try {
        json = await send(activeSession.accessToken);
      } catch (error) {
        if (!isAuthError(error)) throw error;
        const refreshed = await getFreshSession(true);
        if (!refreshed?.accessToken) throw new Error("Your session expired. Sign in again.");
        json = await send(refreshed.accessToken);
      }
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

  async function undoCollectionChoice(collection: LinkedCollection) {
    if (!selected) return;
    if (!config?.apiUrl || !session?.accessToken) {
      await undoAddedCollection(collection);
      return;
    }
    const previousId = selected.id;
    setCollectionChoiceSaving(`undo:${collection.id}`);
    try {
      const activeSession = await getFreshSession();
      if (!activeSession?.accessToken) throw new Error("Your session expired. Sign in again.");
      const send = (accessToken: string) =>
        requestJson<{ capture: Record<string, any> }>(captureMutationUrl(config.apiUrl), {
          method: "PATCH",
          headers: {
            apikey: config.supabaseAnonKey,
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: {
            captureId: selected.remoteId || selected.id,
            action: "undo_collection_choice",
            collectionId: collection.id
          }
        });
      let json: { capture: Record<string, any> };
      try {
        json = await send(activeSession.accessToken);
      } catch (error) {
        if (!isAuthError(error)) throw error;
        const refreshed = await getFreshSession(true);
        if (!refreshed?.accessToken) throw new Error("Your session expired. Sign in again.");
        json = await send(refreshed.accessToken);
      }
      applyUpdatedCapture(captureFromRemote(json.capture), previousId);
      await loadCollections("active");
      setMessage("AI suggestion restored.");
    } catch (error) {
      setMessage(friendlyError(error, "Could not undo collection."));
    } finally {
      setCollectionChoiceSaving(null);
    }
  }

  async function openCollectionPicker() {
    setCollectionPickerOpen((current) => !current);
    if (!collectionPickerOpen) {
      void loadCollections("active").catch((error) => {
        setMessage(friendlyError(error, "Could not load collections."));
      });
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

  async function unlinkCaptureFromCollection(collectionId: string, capture: Capture) {
    const captureId = capture.remoteId || capture.id;
    try {
      await collectionRequest<{ ok: boolean }>("collection-links", {
        method: "PATCH",
        body: { action: "unlink", collectionId, captureId }
      });
      setCollectionCaptures((current) => current.filter((item) => item.id !== capture.id));
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
      setMessage("Removed from collection.");
      await loadCaptures();
    } catch (error) {
      setMessage(friendlyError(error, "Could not remove collection."));
    }
  }

  async function unlinkCollectionFromCapture(collectionId: string) {
    if (!selected) return;
    await unlinkCaptureFromCollection(collectionId, selected);
  }

  async function autosaveCollectionDecision(decision: CollectionDecision, index: number) {
    const choice = decision.type === "existing" && decision.collectionId
      ? { type: "existing" as const, collectionId: decision.collectionId }
      : decision.type === "new" && decision.title.trim() && decision.description?.trim()
        ? { type: "new" as const, title: decision.title.trim(), description: decision.description.trim() }
        : null;
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

  async function dismissReminder(reminderIndex: number) {
    if (!selected) return;
    if (config?.apiUrl && session?.accessToken) {
      try {
        const activeSession = await getFreshSession();
        if (!activeSession?.accessToken) throw new Error("Your session expired. Sign in again.");
        const dismissWithToken = (accessToken: string) =>
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
          });
        let json: { capture: Record<string, any> };
        try {
          json = await dismissWithToken(activeSession.accessToken);
        } catch (error) {
          if (!isAuthError(error)) throw error;
          const refreshed = await getFreshSession(true);
          if (!refreshed?.accessToken) throw new Error("Your session expired. Sign in again.");
          json = await dismissWithToken(refreshed.accessToken);
        }
        const updatedCapture = captureFromRemote(json.capture);
        setCaptures((current) =>
          current.map((capture) => (capture.id === selected.id ? updatedCapture : capture))
        );
        setCollectionCaptures((current) =>
          current.map((capture) => (capture.id === selected.id ? updatedCapture : capture))
        );
        setMessage("Reminder removed.");
      } catch (error) {
        setMessage(friendlyError(error, "Could not remove reminder."));
      }
      return;
    }
    setCaptures((current) =>
      current.map((capture) =>
        capture.id === selected.id
          ? {
              ...capture,
              suggestedReminders: (capture.suggestedReminders || []).filter((_, index) => index !== reminderIndex)
            }
          : capture
      )
    );
    setCollectionCaptures((current) =>
      current.map((capture) =>
        capture.id === selected.id
          ? {
              ...capture,
              suggestedReminders: (capture.suggestedReminders || []).filter((_, index) => index !== reminderIndex)
            }
          : capture
      )
    );
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
      setCaptures(sortCaptures(next));
      setMessage("Expanded URL saved. AI extraction is running.");
    } catch (error) {
      setMessage(friendlyError(error, "Could not use the expanded URL."));
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
        const returnCollectionId = captureReturnCollectionId;
        selectCapture(null);
        if (returnCollectionId) selectCollection(returnCollectionId);
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
    setCollectionCaptures([]);
    setCollectionCapturesForId(null);
    setCaptureReturnCollectionId(null);
    selectCapture(null);
    selectCollection(null);
  }

  function renderCapture({ item }: { item: Capture }) {
    const source = item.siteName || hostFromUrl(item.sourceUrl) || item.sourceText.slice(0, 56);
    const itemStatus = displayStatus(item);
    const itemReviewReasons = reviewReasons(item);
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
        {itemReviewReasons.length ? (
          <Text numberOfLines={1} style={styles.reviewReasonPreview}>
            {reviewReasonSummary(itemReviewReasons)}
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

  function renderCollectionCapture({ item }: { item: Capture }) {
    const source = item.siteName || hostFromUrl(item.sourceUrl) || item.sourceText.slice(0, 56);
    const itemStatus = displayStatus(item);
    const itemReviewReasons = reviewReasons(item);
    return (
      <View style={styles.collectionCaptureRow}>
        <Pressable
          onPress={() => {
            if (selectedCollection) openCaptureFromCollection(item, selectedCollection.id);
          }}
          style={({ pressed }) => [styles.collectionCaptureMain, pressed && styles.pressed]}
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
          {itemReviewReasons.length ? (
            <Text numberOfLines={1} style={styles.reviewReasonPreview}>
              {reviewReasonSummary(itemReviewReasons)}
            </Text>
          ) : null}
        </Pressable>
        <Pressable
          onPress={() => {
            if (selectedCollection) void unlinkCaptureFromCollection(selectedCollection.id, item);
          }}
          style={styles.removeButton}
        >
          <Text style={styles.inlineAction}>Remove</Text>
        </Pressable>
      </View>
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
    const activeCollection = selectedCollection.status === "active";
    const capturesReadyForCollection = collectionCapturesForId === selectedCollection.id;
    const visibleCollectionCaptures = activeCollection && capturesReadyForCollection ? collectionCaptures : [];
    const collectionCapturesPending = activeCollection && (!capturesReadyForCollection || collectionCapturesLoading);
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <FlatList
          data={visibleCollectionCaptures}
          keyExtractor={(item) => item.id}
          renderItem={renderCollectionCapture}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            <View style={styles.collectionDetailTop}>
              <View style={styles.detailHeader}>
                <Pressable onPress={() => selectCollection(null)} style={styles.textButton}>
                  <Text style={styles.textButtonText}>Back</Text>
                </Pressable>
                <Text style={styles.status}>
                  {selectedCollection.status === "archived" ? "Archived" : `${selectedCollection.captureCount} captures`}
                </Text>
              </View>
              <Text style={styles.kicker}>Collection</Text>
              <Text style={styles.title}>{selectedCollection.title}</Text>
              <Text style={styles.sourceText}>{selectedCollection.description}</Text>
              {activeCollection ? (
                <View style={styles.sectionHeader}>
                  <Text style={styles.meta}>Captures</Text>
                  {collectionCapturesPending ? <Text style={styles.meta}>Loading...</Text> : null}
                </View>
              ) : (
                <View style={styles.sourceBlock}>
                  <Text style={styles.meta}>Archived collection</Text>
                  <Text style={styles.supportingText}>
                    Restore this collection to bring back its archive-time capture links.
                  </Text>
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            activeCollection ? (
              <View style={styles.collectionEmpty}>
                <Text style={styles.emptyTitle}>
                  {collectionCapturesPending ? "Loading captures..." : "No captures in this collection."}
                </Text>
                {!collectionCapturesPending ? (
                  <Text style={styles.emptyText}>Linked captures will appear here.</Text>
                ) : null}
              </View>
            ) : null
          }
          ListFooterComponent={
            <View style={styles.collectionSettings}>
              {activeCollection ? (
                <>
                  <Text style={styles.meta}>Collection settings</Text>
                  <TextInput
                    onChangeText={(value) => {
                      setCollectionDraftDirty(true);
                      setCollectionTitle(value);
                    }}
                    placeholder="Title"
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
                    placeholder="What belongs in this collection"
                    placeholderTextColor={colors.muted}
                    style={styles.noteInput}
                    value={collectionDescription}
                  />
                  <Pressable
                    disabled={saveDisabled}
                    onPress={() => void saveCollection()}
                    style={[styles.primaryButton, saveDisabled && styles.disabledButton]}
                  >
                    <Text style={styles.primaryButtonText}>Save collection</Text>
                  </Pressable>
                </>
              ) : null}
              <Pressable onPress={() => confirmArchiveCollection(selectedCollection)} style={styles.secondaryButton}>
                <Text style={selectedCollection.status === "archived" ? styles.secondaryButtonText : styles.dangerButtonText}>
                  {selectedCollection.status === "archived" ? "Restore collection" : "Archive collection"}
                </Text>
              </Pressable>
              {message ? <Text style={styles.message}>{message}</Text> : null}
            </View>
          }
          contentContainerStyle={styles.collectionDetailContent}
        />
      </SafeAreaView>
    );
  }

  if (selected) {
    const selectedArchived = isArchived(selected);
    const sourceValue = selected.sourceUrl || selected.sourceText;
    const selectedReviewReasons = reviewReasons(selected);
    const aiIntentValue = normalizeIntent(selected.defaultIntent) || selected.defaultIntent || "";
    const quickIntentValue = draftIntent || aiIntentValue;
    const quickIntentLabel = humanize(quickIntentValue) || "something useful";
    const reminderRows = selected.suggestedReminders || [];
    const collectionRows = selected.linkedCollections || [];
    const collectionSuggestionRows = selected.collectionDecisions || [];
    const replacedCollectionSuggestions = (selected.manualCollectionOverrides || [])
      .filter((override) => override.restoredDecisions.length)
      .flatMap((override) =>
        override.restoredDecisions.map((decision, index) => ({
          override,
          decision,
          key: `${override.collectionId}:${index}:${decision.collectionId || decision.title}`
        }))
      );
    const linkedCollectionIds = new Set(collectionRows.map((collection) => collection.id));
    const activeCollections = collections.filter((collection) => collection.status === "active");
    const collectionPickerTerm = collectionPickerQuery.trim().toLowerCase();
    const collectionPickerRows = activeCollections
      .filter((collection) => !linkedCollectionIds.has(collection.id))
      .filter((collection) =>
        !collectionPickerTerm ||
        [collection.title, collection.description].join(" ").toLowerCase().includes(collectionPickerTerm)
      );
    const collectionCreateDisabled = !collectionCreateTitle.trim() || !collectionCreateDescription.trim();
    const primaryReminder = reminderRows[0];
    const primaryLinkedCollection = collectionRows[0];
    const primaryCollectionDecision = collectionSuggestionRows[0];
    const primaryCollectionTitle = primaryLinkedCollection?.title || primaryCollectionDecision?.title || "";
    const primaryCollectionRationale = primaryLinkedCollection?.rationale || primaryCollectionDecision?.rationale;
    const primaryRationale = primaryReminder?.rationale || primaryCollectionRationale || selected.intentRationale;
    const quickBecause = becauseSentence(primaryRationale);
    const urlEvidenceNotice = urlEvidenceMessage(selected.urlEvidence);
    const noteStatusLabel =
      noteSaveState === "saving"
        ? "Saving..."
        : noteSaveState === "error"
          ? "Could not autosave"
          : noteSaveState === "saved"
            ? "Saved"
            : draftNoteDirty
              ? "Autosaves"
              : "";
    const collectionPickerContent = collectionPickerOpen ? (
      <View style={styles.collectionPicker}>
        <TextInput
          onChangeText={setCollectionPickerQuery}
          placeholder="Search collections"
          placeholderTextColor={colors.muted}
          style={styles.search}
          value={collectionPickerQuery}
        />
        {collectionPickerRows.slice(0, 6).map((collection) => (
          <Pressable
            key={collection.id}
            disabled={Boolean(collectionChoiceSaving)}
            onPress={() => void sendCaptureCollectionChoice({
              choice: { type: "existing", collectionId: collection.id },
              source: "manual",
              dismissCurrentCollectionSuggestions: collectionSuggestionRows.length > 0,
              savingKey: `existing:${collection.id}`
            })}
            style={styles.collectionPickerRow}
          >
            <View style={styles.suggestionValue}>
              <Text style={styles.suggestionText}>{collection.title}</Text>
              <Text numberOfLines={2} style={styles.meta}>{collection.description}</Text>
            </View>
            <Text style={styles.suggestionAction}>
              {collectionChoiceSaving === `existing:${collection.id}` ? "Adding..." : "Add"}
            </Text>
          </Pressable>
        ))}
        {!collectionPickerRows.length ? (
          <Text style={styles.meta}>No matching active collections.</Text>
        ) : null}
        <View style={styles.collectionCreateBox}>
          <Text style={styles.quickLabel}>New collection</Text>
          <TextInput
            onChangeText={setCollectionCreateTitle}
            placeholder="Title"
            placeholderTextColor={colors.muted}
            style={styles.search}
            value={collectionCreateTitle}
          />
          <TextInput
            multiline
            onChangeText={setCollectionCreateDescription}
            placeholder="What belongs here"
            placeholderTextColor={colors.muted}
            style={styles.detailInput}
            value={collectionCreateDescription}
          />
          <Pressable
            disabled={collectionCreateDisabled || Boolean(collectionChoiceSaving)}
            onPress={() => void sendCaptureCollectionChoice({
              choice: {
                type: "new",
                title: collectionCreateTitle.trim(),
                description: collectionCreateDescription.trim()
              },
              source: "manual",
              dismissCurrentCollectionSuggestions: collectionSuggestionRows.length > 0,
              savingKey: "new"
            })}
            style={[styles.smallButton, (collectionCreateDisabled || Boolean(collectionChoiceSaving)) && styles.disabledButton]}
          >
            <Text style={styles.smallButtonText}>
              {collectionChoiceSaving === "new" ? "Creating..." : "Create and add"}
            </Text>
          </Pressable>
        </View>
      </View>
    ) : null;
    const showStatus = selectedArchived || displayStatus(selected) !== "ready";
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <ScrollView contentContainerStyle={styles.detail}>
          <View style={styles.detailHeader}>
            <Pressable
              onPress={() => {
                if (captureReturnCollectionId) {
                  const collectionId = captureReturnCollectionId;
                  selectCapture(null);
                  selectCollection(collectionId);
                } else {
                  selectCapture(null);
                }
              }}
              style={styles.textButton}
            >
              <Text style={styles.textButtonText}>Back</Text>
            </Pressable>
            {showStatus ? (
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
            ) : null}
          </View>
          <Text style={styles.kicker}>Capture review</Text>
          <View style={styles.quickEditBlock}>
            <TextInput
              multiline
              onChangeText={(value) => {
                setDraftTitleDirty(true);
                setDraftTitle(value);
                updateSelectedReviewDraft({ title: value, titleDirty: true });
              }}
              placeholder="Title"
              placeholderTextColor={colors.muted}
              style={styles.reviewTitleInput}
              value={draftTitle}
            />
            <View style={styles.quickTopRow}>
              <View style={styles.quickTopCopy}>
                <Text style={styles.quickLabel}>Intent</Text>
                <View style={styles.quickSentenceRow}>
                  <Pressable
                    onLongPress={() => showRationale("Why this intent?", selected.intentRationale)}
                    style={styles.quickChip}
                  >
                    <Text style={styles.quickChipText}>{quickIntentLabel}</Text>
                  </Pressable>
                  <Pressable onPress={() => setQuickIntentOpen((current) => !current)} hitSlop={8}>
                    <Text style={styles.suggestionAction}>
                      {quickIntentOpen ? "Close" : "Change"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
            {quickIntentOpen ? (
              <View style={styles.quickOptions}>
                {INTENT_OPTIONS.map((intent) => {
                  const selectedIntent = quickIntentValue === intent;
                  return (
                    <Pressable
                      key={intent}
                      onPress={() => {
                        const intentDirty = intent !== aiIntentValue;
                        setDraftIntentDirty(intentDirty);
                        setDraftIntent(intent);
                        updateSelectedReviewDraft({ intent, intentDirty });
                        setQuickIntentOpen(false);
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
            ) : null}
            {draftIntentDirty ? (
              <View style={styles.changeLine}>
                <Text style={styles.changeText}>
                  AI suggested {humanize(aiIntentValue) || "something useful"}
                </Text>
                <Pressable
                  onPress={() => {
                    setDraftIntent(aiIntentValue);
                    setDraftIntentDirty(false);
                    updateSelectedReviewDraft({ intent: aiIntentValue, intentDirty: false });
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.suggestionAction}>Undo</Text>
                </Pressable>
              </View>
            ) : null}
            {quickBecause ? (
              <View style={styles.becauseRow}>
                <Text style={styles.becauseText}>{quickBecause}</Text>
                <Pressable
                  onLongPress={() => showRationale("Why?", primaryRationale)}
                  onPress={() => showRationale("Why?", primaryRationale)}
                  hitSlop={8}
                >
                  <Text style={styles.hintText}>Why</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.suggestionRail}>
              <View style={styles.sectionHeader}>
                <Text style={styles.quickLabel}>AI suggestions</Text>
              </View>
              {reminderRows.length ? (
                reminderRows.slice(0, 3).map((reminder, index) => {
                  const key = reminderDraftKey(reminder, index);
                  const action = reminderDrafts[key] || "keep";
                  const removed = action === "remove";
                  return (
                    <View key={key} style={[styles.suggestionPill, removed && styles.suggestionPillChanged]}>
                      <View style={styles.suggestionLabelColumn}>
                        <Text style={styles.suggestionLabel}>Reminder</Text>
                        <Text style={[styles.suggestionState, removed && styles.suggestionStateChanged]}>
                          {removed ? "Removed" : "AI suggested"}
                        </Text>
                      </View>
                      <Pressable
                        onLongPress={() => showRationale("Why this reminder?", reminder.rationale)}
                        onPress={() => showRationale("Why this reminder?", reminder.rationale)}
                        style={styles.suggestionValue}
                      >
                        <Text style={[styles.suggestionText, removed && styles.suggestionTextMuted]}>
                          {conciseText(reminderLabel(reminder), 64)}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          const next = { ...reminderDrafts };
                          if (removed) delete next[key];
                          else next[key] = "remove";
                          setReminderDrafts(next);
                          updateSelectedReviewDraft({ reminders: next });
                        }}
                        hitSlop={8}
                      >
                        <Text style={styles.suggestionAction}>{removed ? "Undo" : "Remove"}</Text>
                      </Pressable>
                    </View>
                  );
                })
              ) : (
                <View style={styles.suggestionPill}>
                  <Text style={styles.suggestionLabel}>Reminder</Text>
                  <Text style={[styles.suggestionText, styles.suggestionValue]}>None</Text>
                </View>
              )}
              {collectionRows.map((collection) => {
                const key = linkedCollectionDraftKey(collection.id);
                const removed = collectionDrafts[key] === "remove";
                const added = collectionDrafts[key] === "added";
                const hasAiFallback = Boolean(manualOverrideForCollection(selected, collection.id)?.restoredDecisions.length);
                return (
                  <View key={collection.id} style={[styles.suggestionPill, (removed || added || hasAiFallback) && styles.suggestionPillChanged]}>
                    <View style={styles.suggestionLabelColumn}>
                      <Text style={styles.suggestionLabel}>Collection</Text>
                      <Text style={[styles.suggestionState, (removed || added || hasAiFallback) && styles.suggestionStateChanged]}>
                        {removed ? "Removed" : added || hasAiFallback ? "Added" : "Linked"}
                      </Text>
                    </View>
                    <Pressable
                      onLongPress={() => showRationale("Why this collection?", collection.rationale)}
                      onPress={() => showRationale("Why this collection?", collection.rationale)}
                      style={styles.suggestionValue}
                    >
                      <Text style={[styles.suggestionText, removed && styles.suggestionTextMuted]}>
                        {collection.title}
                      </Text>
                    </Pressable>
                      <Pressable
                        onPress={() => {
                          if (added) {
                            void undoAddedCollection(collection);
                            return;
                          }
                          if (removed) {
                            const next = { ...collectionDrafts };
                            delete next[key];
                            setCollectionDrafts(next);
                            updateSelectedReviewDraft({ collections: next });
                            return;
                          }
                          void unlinkCollectionFromCapture(collection.id);
                        }}
                      hitSlop={8}
                    >
                      <Text style={styles.suggestionAction}>
                        {removed || added ? "Undo" : "Remove"}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
              {replacedCollectionSuggestions.map(({ override, decision, key }) => {
                const undoing = collectionChoiceSaving === `undo:${override.collectionId}`;
                return (
                  <View key={key} style={[styles.suggestionPill, styles.suggestionPillChanged]}>
                    <View style={styles.suggestionLabelColumn}>
                      <Text style={styles.suggestionLabel}>Collection</Text>
                      <Text style={[styles.suggestionState, styles.suggestionStateChanged]}>AI suggested</Text>
                    </View>
                    <Pressable
                      onLongPress={() => showRationale("Why this collection?", decision.rationale)}
                      onPress={() => showRationale("Why this collection?", decision.rationale)}
                      style={styles.suggestionValue}
                    >
                      <Text style={[styles.suggestionText, styles.suggestionTextMuted]}>
                        {decision.title}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void undoCollectionChoice({
                        id: override.collectionId,
                        title: decision.title,
                        description: decision.description || undefined,
                        rationale: decision.rationale,
                        confidence: decision.confidence
                      })}
                      hitSlop={8}
                    >
                      <Text style={styles.suggestionAction}>{undoing ? "Restoring..." : "Undo"}</Text>
                    </Pressable>
                  </View>
                );
              })}
              {collectionSuggestionRows.slice(0, 3).map((collection, index) => {
                const key = suggestedCollectionDraftKey(collection, index);
                const action = collectionDrafts[key] || "ignore";
                const staged = action === "link" || action === "create";
                const saving = collectionChoiceSaving === `suggestion:${index}`;
                const defaultAction = collection.type === "new" ? "Create" : "Link";
                return (
                  <View
                    key={key}
                    style={[styles.suggestionPill, staged && styles.suggestionPillChanged]}
                  >
                    <View style={styles.suggestionLabelColumn}>
                      <Text style={styles.suggestionLabel}>Collection</Text>
                      <Text style={[styles.suggestionState, staged && styles.suggestionStateChanged]}>
                        {staged ? (action === "create" ? "Will create" : "Will link") : "AI suggested"}
                      </Text>
                    </View>
                    <Pressable
                      onLongPress={() => showRationale("Why this collection?", collection.rationale)}
                      onPress={() => showRationale("Why this collection?", collection.rationale)}
                      style={styles.suggestionValue}
                    >
                      <Text style={styles.suggestionText}>{collection.title}</Text>
                    </Pressable>
                    <View style={styles.suggestionActions}>
                      <Pressable
                        onPress={() => {
                          if (staged) {
                            const next = { ...collectionDrafts };
                            delete next[key];
                            setCollectionDrafts(next);
                            updateSelectedReviewDraft({ collections: next });
                            return;
                          }
                          void autosaveCollectionDecision(collection, index);
                        }}
                        hitSlop={8}
                      >
                        <Text style={styles.suggestionAction}>{saving ? "Saving..." : staged ? "Undo" : defaultAction}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void openCollectionPicker()}
                        hitSlop={8}
                      >
                        <Text style={styles.suggestionAction}>{collectionPickerOpen ? "Close" : "Different"}</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
              {!collectionRows.length && !collectionSuggestionRows.length && !replacedCollectionSuggestions.length ? (
                <View style={styles.suggestionPill}>
                  <Text style={styles.suggestionLabel}>Collection</Text>
                  <Text style={[styles.suggestionText, styles.suggestionValue]}>None</Text>
                  <Pressable onPress={() => void openCollectionPicker()} hitSlop={8}>
                    <Text style={styles.suggestionAction}>{collectionPickerOpen ? "Close" : "Add collection"}</Text>
                  </Pressable>
                </View>
              ) : null}
              {(!collectionRows.length || collectionSuggestionRows.length) ? collectionPickerContent : null}
            </View>
          </View>
          {selectedReviewReasons.length ? (
            <View style={styles.reviewReasonBlock}>
              <Text style={styles.meta}>Needs review</Text>
              {selectedReviewReasons.map((reason) => (
                <Text key={reason} style={styles.reviewReasonText}>
                  {reviewReasonLabel(reason)}
                </Text>
              ))}
            </View>
          ) : null}
          {urlEvidenceNotice ? (
            <View style={styles.sourceBlock}>
              <Text style={styles.meta}>Link evidence</Text>
              <Text style={styles.supportingText}>{urlEvidenceNotice}</Text>
              {selected.urlEvidence?.status === "needs_client_resolution" && selected.sourceUrl ? (
                <>
                  <Pressable onPress={() => void Linking.openURL(selected.sourceUrl || "")} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Open link</Text>
                  </Pressable>
                  <Pressable onPress={() => void pasteExpandedUrl()} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Paste expanded URL</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : null}
          <View style={styles.sourceBlock}>
            <View style={styles.sectionHeader}>
              <Text style={styles.meta}>Context note</Text>
              {noteStatusLabel ? (
                <Text style={[styles.noteSaveState, noteSaveState === "error" && styles.noteSaveStateError]}>
                  {noteStatusLabel}
                </Text>
              ) : null}
            </View>
            <TextInput
              multiline
              onChangeText={(value) => {
                setDraftNoteDirty(true);
                setDraftNote(value);
                updateSelectedReviewDraft({ note: value, noteDirty: true });
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
          {selected.entities?.length ? (
            <View style={styles.sourceBlock}>
              <Text style={styles.meta}>Detected details</Text>
              {selected.entities.slice(0, 5).map((entity) => (
                <Text key={`${entity.type}-${entity.name}`} style={styles.sourceText}>
                  {entity.name} · {entity.type}
                </Text>
              ))}
            </View>
          ) : null}
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
  processing: "#8a806d",
  danger: "#9f3a2f"
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
  reviewReasonPreview: {
    color: "#9a6b1f",
    fontSize: 13,
    fontWeight: "600"
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
  collectionDetailContent: {
    paddingBottom: 40,
    paddingHorizontal: 22,
    paddingTop: 18
  },
  collectionDetailTop: {
    gap: 12,
    paddingBottom: 8
  },
  collectionCaptureRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    paddingVertical: 16
  },
  collectionCaptureMain: {
    flex: 1,
    gap: 7
  },
  removeButton: {
    paddingVertical: 4
  },
  collectionEmpty: {
    paddingBottom: 24,
    paddingTop: 18
  },
  collectionSettings: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
    marginTop: 8,
    paddingTop: 16
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
  quickEditBlock: {
    backgroundColor: colors.soft,
    borderRadius: 8,
    gap: 14,
    padding: 16
  },
  reviewTitleInput: {
    color: colors.ink,
    fontSize: 25,
    fontWeight: "700",
    lineHeight: 31,
    padding: 0
  },
  quickTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  quickTopCopy: {
    flex: 1,
    gap: 7
  },
  quickLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  quickSentenceRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  quickSentenceText: {
    color: colors.ink,
    fontSize: 19,
    lineHeight: 27
  },
  quickChip: {
    backgroundColor: colors.paper,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  quickChipText: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 24
  },
  quickOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 2
  },
  changeLine: {
    alignItems: "center",
    backgroundColor: colors.paper,
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  changeText: {
    color: colors.muted,
    flex: 1,
    fontSize: 13,
    fontWeight: "700"
  },
  becauseRow: {
    alignItems: "flex-start",
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
    paddingTop: 12
  },
  becauseText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22
  },
  suggestionRail: {
    gap: 8
  },
  collectionPicker: {
    backgroundColor: colors.paper,
    borderRadius: 8,
    gap: 10,
    padding: 10
  },
  collectionPickerRow: {
    alignItems: "center",
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    paddingTop: 10
  },
  collectionCreateBox: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
    paddingTop: 10
  },
  suggestionPill: {
    alignItems: "center",
    backgroundColor: colors.paper,
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  suggestionPillChanged: {
    backgroundColor: "#f3efe6"
  },
  suggestionLabelColumn: {
    gap: 2,
    minWidth: 72
  },
  suggestionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    minWidth: 72,
    textTransform: "uppercase"
  },
  suggestionState: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700"
  },
  suggestionStateChanged: {
    color: colors.ink
  },
  suggestionValue: {
    flex: 1
  },
  suggestionText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20
  },
  suggestionTextMuted: {
    color: colors.muted,
    textDecorationLine: "line-through"
  },
  suggestionAction: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700"
  },
  suggestionActions: {
    alignItems: "flex-end",
    gap: 6
  },
  editBlock: {
    gap: 8
  },
  reviewReasonBlock: {
    backgroundColor: colors.soft,
    borderRadius: 8,
    gap: 6,
    padding: 12
  },
  reviewReasonText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700"
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
  detailInput: {
    backgroundColor: colors.soft,
    borderRadius: 8,
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
    minHeight: 56,
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
  hintText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  noteSaveState: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700"
  },
  noteSaveStateError: {
    color: colors.danger
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
