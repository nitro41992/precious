import "react-native-url-polyfill/auto";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  AppState,
  BackHandler,
  Easing,
  FlatList,
  KeyboardAvoidingView,
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
import {
  confidenceRequiresReview,
  displayStatus,
  extractHttpUrl,
  hostFromUrl,
  isArchived,
  mergeRemoteCaptures,
  normalizeIntent as normalizeKnownIntent,
  parseCaptureUrl,
  reviewReasons,
  sortCaptures,
  statusLabel
} from "./captureLogic";

type CaptureStatus = "processing" | "ready" | "needs_review" | "failed";

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
type CollectionListMode = "active" | "archived";
type SearchScope = "active" | "archived" | "all";
type HomeListRow =
  | { type: "section"; id: string; title: string }
  | { type: "capture"; id: string; capture: Capture };
type SnackbarState = {
  text: string;
  actionLabel?: string;
  action?: () => void;
};

const PROCESSING_REFRESH_MS = 3000;

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

function formatDateTime(value: number) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function isoDateText(value: number | null | undefined) {
  if (!value) return "";
  try {
    return new Date(value).toISOString();
  } catch {
    return "";
  }
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
  return normalizeKnownIntent(value, INTENT_OPTIONS);
}

function reminderLabel(reminder: ReminderSuggestion | undefined) {
  if (!reminder) return "";
  return reminder.trigger_value || humanize(reminder.trigger_type);
}

function captureSourceLabel(capture: Capture) {
  return capture.siteName || hostFromUrl(capture.sourceUrl) || conciseText(capture.sourceText, 56) || "Shared text";
}

function captureStatusLabel(capture: Capture) {
  if (isArchived(capture)) return "Archived";
  const status = displayStatus(capture);
  if (status === "processing") return "Analyzing";
  if (status === "failed") return "Could not analyze";
  return statusLabel(status);
}

function captureMeaningLine(capture: Capture) {
  if (!capture.defaultIntent) return "";
  return `Saved as ${humanize(capture.defaultIntent)}`;
}

function captureVisibleStatus(capture: Capture) {
  const status = displayStatus(capture);
  if (isArchived(capture) || status === "processing" || status === "needs_review" || status === "failed") {
    return captureStatusLabel(capture);
  }
  return "";
}

function consumerSummary(capture: Capture) {
  const cleaned = (capture.summary || "")
    .replace(/\s*[—-]\s*likely\b.*$/i, "")
    .replace(/\.\s*likely\b.*$/i, ".")
    .replace(/\s*[—-]\s*the user\b.*$/i, "")
    .replace(/\.\s*the user\b.*$/i, ".");
  const summary = conciseText(cleaned, 128);
  if (!summary) return "";
  if (/url returned|generic evidence|insufficient url|extraction|analysis|confidence|model|provider/i.test(summary)) {
    return "";
  }
  return summary;
}

function reviewStatusCue(capture: Capture, pendingAutoCollection: boolean, hasReviewReasons: boolean) {
  if (pendingAutoCollection) return "Choosing collection";
  if (displayStatus(capture) === "processing") return "Checking source";
  if (displayStatus(capture) === "failed") return "Needs a quick look";
  if (hasReviewReasons) return "Needs a quick look";
  return "Ready";
}

function shortTrustCue(value: string | null | undefined) {
  if (!cleanSentence(value)) return "";
  return "Suggestion based on saved content.";
}

function recencyGroupLabel(value: number, now = Date.now()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const captured = new Date(value);
  captured.setHours(0, 0, 0, 0);
  const diff = today.getTime() - captured.getTime();
  if (diff <= 0) return "Today";
  if (diff <= 24 * 60 * 60 * 1000) return "Yesterday";
  if (diff <= 7 * 24 * 60 * 60 * 1000) return "This week";
  return "Earlier";
}

function groupedCaptureRows(captures: Capture[]) {
  const rows: HomeListRow[] = [];
  const seenGroups = new Set<string>();
  for (const capture of captures) {
    const group = recencyGroupLabel(capture.createdAt);
    if (!seenGroups.has(group)) {
      rows.push({ type: "section", id: `section:${group}`, title: group });
      seenGroups.add(group);
    }
    rows.push({ type: "capture", id: capture.id, capture });
  }
  return rows;
}

function uniqueCaptures(captures: Capture[]) {
  const seen = new Set<string>();
  return captures.filter((capture) => {
    const key = capture.remoteId || capture.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function captureSearchParts(capture: Capture) {
  return [
    capture.title,
    capture.summary,
    capture.note,
    capture.sourceText,
    capture.sourceUrl,
    capture.siteName,
    capture.defaultIntent,
    humanize(capture.defaultIntent),
    capture.intentRationale,
    capture.confidenceLabel,
    captureStatusLabel(capture),
    formatDateTime(capture.createdAt),
    isoDateText(capture.createdAt),
    isoDateText(capture.updatedAt),
    isoDateText(capture.processedAt),
    ...(capture.searchPhrases || []),
    ...(capture.entities || []).flatMap((entity) => [entity.type, entity.name, entity.evidence]),
    ...(capture.linkedCollections || []).flatMap((collection) => [
      collection.title,
      collection.description,
      collection.rationale
    ]),
    ...(capture.collectionDecisions || []).flatMap((collection) => [
      collection.title,
      collection.description,
      collection.rationale
    ]),
    ...(capture.manualCollectionOverrides || []).flatMap((override) =>
      override.restoredDecisions.flatMap((collection) => [
        collection.title,
        collection.description,
        collection.rationale
      ])
    ),
    ...(capture.suggestedReminders || []).flatMap((reminder) => [
      reminder.trigger_type,
      reminder.trigger_value,
      reminder.rationale,
      reminder.status
    ])
  ].filter(Boolean).map(String);
}

function searchableCaptureText(capture: Capture) {
  return captureSearchParts(capture).join(" ").toLowerCase();
}

function matchReasonForCapture(capture: Capture, term: string) {
  const query = term.trim().toLowerCase();
  if (!query) return isArchived(capture) ? "Archived capture" : "Recent capture";
  const matches = (values: Array<string | null | undefined>) =>
    values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
  if (matches([capture.title])) return "Matched title";
  if (matches([capture.summary])) return "Matched summary";
  if (matches([capture.note])) return "Matched note";
  if (matches([capture.sourceText, capture.sourceUrl, capture.siteName])) return "Matched source";
  if (matches([capture.defaultIntent, humanize(capture.defaultIntent)])) return "Matched save intent";
  if (matches((capture.linkedCollections || []).flatMap((collection) => [collection.title, collection.description]))) {
    return "Matched collection";
  }
  if (matches((capture.collectionDecisions || []).flatMap((collection) => [collection.title, collection.description, collection.rationale]))) {
    return "Matched collection suggestion";
  }
  if (matches((capture.entities || []).flatMap((entity) => [entity.type, entity.name, entity.evidence]))) {
    return "Matched saved detail";
  }
  if (matches((capture.suggestedReminders || []).flatMap((reminder) => [
    reminder.trigger_type,
    reminder.trigger_value,
    reminder.rationale
  ]))) {
    return "Matched reminder idea";
  }
  if (matches([formatDateTime(capture.createdAt), isoDateText(capture.createdAt)])) return "Matched time saved";
  return "Matched saved detail";
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

function collectionChoiceFromDecision(decision: CollectionDecision) {
  if (decision.type === "existing" && decision.collectionId) {
    return { type: "existing" as const, collectionId: decision.collectionId };
  }
  if (decision.type === "new" && decision.title.trim() && decision.description?.trim()) {
    return {
      type: "new" as const,
      title: decision.title.trim(),
      description: decision.description.trim()
    };
  }
  return null;
}

function collectionConfidenceLabel(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Selected";
  if (value >= 0.72) return "Looks right";
  if (value >= 0.5) return "Maybe";
  return "Not sure";
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
  const [archivedCaptures, setArchivedCaptures] = useState<Capture[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [captureReturnCollectionId, setCaptureReturnCollectionId] = useState<string | null>(null);
  const [capturesLoading, setCapturesLoading] = useState(false);
  const [capturesError, setCapturesError] = useState("");
  const [archivedCapturesLoading, setArchivedCapturesLoading] = useState(false);
  const [archivedCapturesError, setArchivedCapturesError] = useState("");
  const [archivedCapturesLoaded, setArchivedCapturesLoaded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState<SearchScope>("active");
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
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null);
  const [sourceDraft, setSourceDraft] = useState("");
  const [showCaptureComposer, setShowCaptureComposer] = useState(false);
  const [savingCapture, setSavingCapture] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState<"signin" | "signup" | null>(null);
  const latestNoteRef = useRef("");
  const autoAppliedCollectionKeysRef = useRef<Set<string>>(new Set());
  const searchMotion = useRef(new Animated.Value(0)).current;
  const reviewMotion = useRef(new Animated.Value(0)).current;

  const getFreshSession = useCallback(async (force = false) => {
    if (!session) return null;
    const raw = force && nativeAuth?.forceRefreshSession
      ? await nativeAuth.forceRefreshSession()
      : await nativeAuth?.refreshSession();
    if (!raw) {
      await nativeAuth?.clearSession();
      setSession(null);
      setCaptures([]);
      setArchivedCaptures([]);
      setArchivedCapturesLoaded(false);
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

  const loadCaptures = useCallback(async (mode: CaptureListMode = "active") => {
    const loadingSetter = mode === "archived" ? setArchivedCapturesLoading : setCapturesLoading;
    const errorSetter = mode === "archived" ? setArchivedCapturesError : setCapturesError;
    loadingSetter(true);
    errorSetter("");
    if (config?.apiUrl && session?.accessToken) {
      try {
        const activeSession = await getFreshSession();
        if (!activeSession?.accessToken) throw new Error("Your session expired. Sign in again.");
        const loadWithToken = (accessToken: string) =>
          requestJson<{ captures?: Array<Record<string, any>> }>(captureListUrl(config.apiUrl, mode === "archived"), {
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
        if (mode === "archived") {
          setArchivedCaptures(sortCaptures(next));
          setArchivedCapturesLoaded(true);
        } else {
          setCaptures((current) => mergeRemoteCaptures(next, current, "active"));
        }
      } catch (error) {
        errorSetter(friendlyError(error, mode === "archived" ? "Could not load archived captures" : "Could not load captures"));
        throw error;
      } finally {
        loadingSetter(false);
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
        setArchivedCaptures(sortCaptures(archived));
        setArchivedCapturesLoaded(true);
      } else {
        setCaptures(sortCaptures(active));
        setArchivedCaptures(sortCaptures(archived));
        setArchivedCapturesLoaded(true);
      }
    } catch (error) {
      const text = friendlyError(error, mode === "archived" ? "Could not load archived captures" : "Could not load captures");
      errorSetter(text);
      setMessage(text);
      throw error;
    } finally {
      loadingSetter(false);
    }
  }, [config, getFreshSession, session]);

  const loadCollections = useCallback(async (mode: CollectionListMode = "active") => {
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
  }, [config, getFreshSession, session]);

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
      setSearchOpen(false);
      setCaptureReturnCollectionId(null);
      const capture =
        captures.find((item) => item.id === captureId) ??
        archivedCaptures.find((item) => item.id === captureId);
      if (!capture) {
        selectCapture(captureId);
        return;
      }
      selectCapture(capture.id);
      setDraftTitle(capture.title);
      setDraftNote(capture.note);
      setDraftIntent(normalizeIntent(capture.defaultIntent));
    },
    [archivedCaptures, captures, selectCapture]
  );

  const openCaptureFromCollection = useCallback((capture: Capture, collectionId: string) => {
    setSearchOpen(false);
    setSelectedCollectionId(null);
    setCaptureReturnCollectionId(collectionId);
    selectCapture(capture.id);
    setDraftTitle(capture.title);
    setDraftNote(capture.note);
    setDraftIntent(normalizeIntent(capture.defaultIntent));
  }, [selectCapture]);

  function openSearch() {
    selectCapture(null);
    selectCollection(null);
    setMessage("");
    setSearchOpen(true);
  }

  function openAccountActions() {
    Alert.alert(
      "Account",
      "Manage this device session.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: () => void signOut() }
      ]
    );
  }

  function replaceLocalCaptureLists(next: Capture[]) {
    setCaptures(sortCaptures(next.filter((capture) => !isArchived(capture))));
    setArchivedCaptures(sortCaptures(next.filter(isArchived)));
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
    if (!selectedId && !selectedCollectionId && !searchOpen) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (searchOpen) {
        setSearchOpen(false);
        return true;
      }
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
  }, [captureReturnCollectionId, searchOpen, selectCapture, selectCollection, selectedCollectionId, selectedId]);

  useEffect(() => {
    if (!searchOpen) return;
    searchMotion.setValue(0);
    Animated.timing(searchMotion, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: false
    }).start();
  }, [searchMotion, searchOpen]);

  useEffect(() => {
    if (!selectedId) return;
    reviewMotion.setValue(0);
    Animated.timing(reviewMotion, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: false
    }).start();
  }, [reviewMotion, selectedId]);

  const homeCaptures = useMemo(() => captures.filter((capture) => !isArchived(capture)), [captures]);
  const homeRows = useMemo(() => groupedCaptureRows(homeCaptures), [homeCaptures]);
  const searchPool = useMemo(() => {
    if (searchScope === "archived") return archivedCaptures;
    if (searchScope === "all") return uniqueCaptures([...captures, ...archivedCaptures]);
    return captures;
  }, [archivedCaptures, captures, searchScope]);
  const searchResults = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return [];
    return searchPool.filter((capture) => searchableCaptureText(capture).includes(term));
  }, [searchPool, searchQuery]);

  const selected = selectedId
    ? captures.find((capture) => capture.id === selectedId) ??
      archivedCaptures.find((capture) => capture.id === selectedId) ??
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
    if (!selected || !config?.apiUrl || !session?.accessToken || collectionChoiceSaving) return;
    if ((selected.linkedCollections || []).length) return;
    const topDecision = (selected.collectionDecisions || [])[0];
    if (!topDecision) return;
    if (topDecision.type !== "existing" || !topDecision.collectionId || topDecision.confidence < 0.72) return;
    const choice = collectionChoiceFromDecision(topDecision);
    if (!choice) return;
    const autoKey = `${captureDraftKey(selected)}:${suggestedCollectionDraftKey(topDecision, 0)}`;
    if (autoAppliedCollectionKeysRef.current.has(autoKey)) return;
    autoAppliedCollectionKeysRef.current.add(autoKey);
    void sendCaptureCollectionChoice({
      choice,
      source: "analysis",
      suggestionIndex: 0,
      dismissCurrentCollectionSuggestions: true,
      rationale: topDecision.rationale,
      confidence: topDecision.confidence,
      savingKey: `auto-suggestion:${autoKey}`
    });
  }, [
    collectionChoiceSaving,
    config?.apiUrl,
    selected?.id,
    selected?.remoteId,
    selected?.linkedCollections?.length,
    selected?.collectionDecisions?.length,
    session?.accessToken
  ]);

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
    const matchesCapture = (item: Capture) =>
      item.id === previousId ||
      item.remoteId === previousId ||
      item.id === updatedCapture.id ||
      Boolean(updatedCapture.remoteId && item.remoteId === updatedCapture.remoteId);
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
      intentOverride || (draftIntentDirty && draftIntent ? draftIntent : null)
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
    const removedCollection = (capture.linkedCollections || []).find((collection) => collection.id === collectionId);
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
      const addCollection = (item: Capture) =>
        item.id === capture.id || item.remoteId === captureId
          ? {
              ...item,
              linkedCollections: (item.linkedCollections || []).some((linked) => linked.id === collectionId)
                ? item.linkedCollections
                : [...(item.linkedCollections || []), collection]
            }
          : item;
      setCaptures((current) => current.map(addCollection));
      setCollectionCaptures((current) => current.map(addCollection));
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
        setArchivedCapturesLoaded(false);
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
      setShowCaptureComposer(false);
      setMessage("Saved. Checking the source now.");
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
    setArchivedCaptures([]);
    setArchivedCapturesLoaded(false);
    setCollections([]);
    setCollectionCaptures([]);
    setCollectionCapturesForId(null);
    setCaptureReturnCollectionId(null);
    setSearchOpen(false);
    setSearchQuery("");
    selectCapture(null);
    selectCollection(null);
  }

  function renderCapture({ item }: { item: Capture }) {
    const itemStatus = displayStatus(item);
    const itemStatusText = captureVisibleStatus(item);
    const itemSummary = consumerSummary(item);
    return (
      <Pressable
        onPress={() => openCapture(item.id)}
        style={({ pressed }) => [styles.captureRow, pressed && styles.pressed]}
        testID={`pc.capture.row.${item.id}`}
      >
        <View style={styles.rowTitleLine}>
          <Text numberOfLines={2} style={styles.captureTitle}>
            {item.title}
          </Text>
        </View>
        <View style={styles.rowMetaLine}>
          <Text numberOfLines={1} style={styles.meta}>
            {captureSourceLabel(item)} · {formatDateTime(item.createdAt)}
          </Text>
          {itemStatusText ? (
            <Text
              style={[
                styles.statusPill,
                itemStatus === "processing" && styles.statusPillProcessing,
                itemStatus === "needs_review" && styles.statusPillReview,
                itemStatus === "failed" && styles.statusPillFailed
              ]}
            >
              {itemStatusText}
            </Text>
          ) : null}
        </View>
        {itemSummary ? (
          <Text numberOfLines={2} style={styles.summaryPreview}>
            {itemSummary}
          </Text>
        ) : null}
        {item.defaultIntent ? (
          <Text numberOfLines={1} style={styles.intentPreview}>
            {captureMeaningLine(item)}
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
    const itemStatus = displayStatus(item);
    const itemStatusText = captureVisibleStatus(item);
    const itemSummary = consumerSummary(item);
    return (
      <View style={styles.collectionCaptureRow}>
        <Pressable
          onPress={() => {
            if (selectedCollection) openCaptureFromCollection(item, selectedCollection.id);
          }}
          style={({ pressed }) => [styles.collectionCaptureMain, pressed && styles.pressed]}
        >
          <View style={styles.rowTitleLine}>
            <Text numberOfLines={2} style={styles.captureTitle}>
              {item.title}
            </Text>
          </View>
          <View style={styles.rowMetaLine}>
            <Text numberOfLines={1} style={styles.meta}>
              {captureSourceLabel(item)} · {formatDateTime(item.createdAt)}
            </Text>
            {itemStatusText ? (
              <Text
                style={[
                  styles.statusPill,
                  itemStatus === "processing" && styles.statusPillProcessing,
                  itemStatus === "needs_review" && styles.statusPillReview,
                  itemStatus === "failed" && styles.statusPillFailed
                ]}
              >
                {itemStatusText}
              </Text>
            ) : null}
          </View>
          {itemSummary ? (
            <Text numberOfLines={2} style={styles.summaryPreview}>
              {itemSummary}
            </Text>
          ) : null}
          {item.defaultIntent ? (
            <Text numberOfLines={1} style={styles.intentPreview}>
              {captureMeaningLine(item)}
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
        testID={`pc.collection.row.${item.id}`}
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

  function renderHomeRow({ item }: { item: HomeListRow }) {
    if (item.type === "section") {
      return <Text style={styles.groupHeader}>{item.title}</Text>;
    }
    return renderCapture({ item: item.capture });
  }

  function renderSearchResult({ item }: { item: Capture }) {
    const itemStatus = displayStatus(item);
    const itemStatusText = captureVisibleStatus(item);
    const itemSummary = consumerSummary(item);
    return (
      <Pressable
        onPress={() => openCapture(item.id)}
        style={({ pressed }) => [styles.captureRow, pressed && styles.pressed]}
        testID={`pc.search.result.${item.id}`}
      >
        <View style={styles.rowTitleLine}>
          <Text numberOfLines={2} style={styles.captureTitle}>
            {item.title}
          </Text>
        </View>
        <View style={styles.rowMetaLine}>
          <Text numberOfLines={1} style={styles.meta}>
            {captureSourceLabel(item)} · {formatDateTime(item.createdAt)}
          </Text>
          {itemStatusText ? (
            <Text
              style={[
                styles.statusPill,
                itemStatus === "processing" && styles.statusPillProcessing,
                itemStatus === "needs_review" && styles.statusPillReview,
                itemStatus === "failed" && styles.statusPillFailed
              ]}
            >
              {itemStatusText}
            </Text>
          ) : null}
        </View>
        <Text numberOfLines={1} style={styles.searchMatchText}>
          {matchReasonForCapture(item, searchQuery)}
        </Text>
        {itemSummary ? (
          <Text numberOfLines={2} style={styles.summaryPreview}>
            {itemSummary}
          </Text>
        ) : null}
        {item.defaultIntent ? (
          <Text numberOfLines={1} style={styles.intentPreview}>
            {captureMeaningLine(item)}
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

  function renderLoadingRows() {
    return (
      <View style={styles.loadingRows}>
        {[0, 1, 2].map((item) => (
          <View key={item} style={styles.loadingRow}>
            <View style={styles.loadingTitle} />
            <View style={styles.loadingLine} />
            <View style={styles.loadingLineShort} />
          </View>
        ))}
      </View>
    );
  }

  function renderSnackbar() {
    if (!snackbar) return null;
    return (
      <View style={styles.snackbar}>
        <Text style={styles.snackbarText}>{snackbar.text}</Text>
        {snackbar.action && snackbar.actionLabel ? (
          <Pressable onPress={snackbar.action} hitSlop={8}>
            <Text style={styles.snackbarAction}>{snackbar.actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
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
                    testID="pc.collection.detail.title"
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
                    testID="pc.collection.detail.description"
                    value={collectionDescription}
                  />
                  <Pressable
                    disabled={saveDisabled}
                    onPress={() => void saveCollection()}
                    style={[styles.primaryButton, saveDisabled && styles.disabledButton]}
                    testID="pc.collection.detail.save"
                  >
                    <Text style={styles.primaryButtonText}>Save collection</Text>
                  </Pressable>
                </>
              ) : null}
              <Pressable
                onPress={() => confirmArchiveCollection(selectedCollection)}
                style={styles.secondaryButton}
                testID="pc.collection.archive-toggle"
              >
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
    const activeSuggestionKeys = new Set(
      collectionSuggestionRows.map((decision) => decision.collectionId || decision.title.toLowerCase())
    );
    const linkedCollectionKeys = new Set(
      collectionRows.flatMap((collection) => [collection.id, collection.title.toLowerCase()])
    );
    const replacedCollectionSuggestions = (selected.manualCollectionOverrides || [])
      .filter((override) => override.restoredDecisions.length)
      .flatMap((override) =>
        override.restoredDecisions.map((decision, index) => ({
          override,
          decision,
          key: `${override.collectionId}:${index}:${decision.collectionId || decision.title}`
        }))
      )
      .filter(({ decision }) => !activeSuggestionKeys.has(decision.collectionId || decision.title.toLowerCase()))
      .filter(({ decision }) => !linkedCollectionKeys.has(decision.collectionId || decision.title.toLowerCase()));
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
    const primaryReminderKey = primaryReminder ? reminderDraftKey(primaryReminder, 0) : "";
    const primaryReminderRemoved = primaryReminder ? reminderDrafts[primaryReminderKey] === "remove" : false;
    const primaryLinkedCollection = collectionRows[0];
    const primaryCollectionDecision = collectionSuggestionRows[0];
    const primaryCollectionTitle = primaryLinkedCollection?.title || primaryCollectionDecision?.title || "";
    const primaryCollectionConfidence = primaryLinkedCollection?.confidence ?? primaryCollectionDecision?.confidence ?? null;
    const primaryCollectionRationale = primaryLinkedCollection?.rationale || primaryCollectionDecision?.rationale;
    const primaryRationale = (!primaryReminderRemoved ? primaryReminder?.rationale : "") || primaryCollectionRationale || selected.intentRationale;
    const quickBecause = shortTrustCue(primaryRationale);
    const selectedCollectionState = primaryCollectionTitle ? collectionConfidenceLabel(primaryCollectionConfidence) : "No collection";
    const reminderSentenceValue = primaryReminder && !primaryReminderRemoved
      ? reminderLabel(primaryReminder)
      : "no reminder";
    const reminderStateLabel = primaryReminder
      ? primaryReminderRemoved
        ? "Removed"
        : collectionConfidenceLabel(primaryReminder.confidence)
      : "None";
    const pendingAutoCollection = Boolean(collectionChoiceSaving?.startsWith("auto-suggestion:"));
    const selectedReviewState = reviewStatusCue(selected, pendingAutoCollection, selectedReviewReasons.length > 0);
    const otherActiveCollectionSuggestions = collectionSuggestionRows
      .slice(primaryCollectionDecision ? 1 : 0, 3)
      .map((decision, offset) => ({ decision, index: (primaryCollectionDecision ? 1 : 0) + offset }));
    const restoredAiCollectionSuggestions = replacedCollectionSuggestions
      .flatMap(({ decision, key }) => [{ decision, key }])
      .filter(({ decision }) => decision.title !== primaryCollectionTitle)
      .slice(0, 3);
    const collectionActionPending = Boolean(collectionChoiceSaving);
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
        <View style={styles.sheetHeader}>
          <View style={styles.sheetHeaderCopy}>
            <Text style={styles.sheetTitle}>Collection</Text>
            <Text style={styles.sheetSubtitle}>Choose where this capture belongs.</Text>
          </View>
          <Pressable onPress={() => setCollectionPickerOpen(false)} hitSlop={8} style={styles.sheetCloseButton}>
            <Text style={styles.inlineAction}>Close</Text>
          </Pressable>
        </View>

        {primaryCollectionTitle ? (
          <View style={styles.currentChoiceRow}>
            <View style={styles.suggestionValue}>
              <Text style={styles.quickLabel}>Selected</Text>
              <Text style={styles.suggestionText}>{primaryCollectionTitle}</Text>
              <Text style={styles.meta}>{selectedCollectionState}</Text>
            </View>
            {primaryLinkedCollection ? (
              <Pressable onPress={() => void unlinkCollectionFromCapture(primaryLinkedCollection.id)} hitSlop={8}>
                <Text style={styles.suggestionAction}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {otherActiveCollectionSuggestions.length || restoredAiCollectionSuggestions.length ? (
          <View style={styles.sheetSection}>
            <Text style={styles.quickLabel}>Other suggestions</Text>
            {otherActiveCollectionSuggestions.map(({ decision, index }) => (
              <Pressable
                key={suggestedCollectionDraftKey(decision, index)}
                disabled={Boolean(collectionChoiceSaving)}
                onPress={() => void autosaveCollectionDecision(decision, index)}
                style={styles.collectionPickerRow}
              >
                <View style={styles.suggestionValue}>
                  <Text style={styles.suggestionText}>{decision.title}</Text>
                  <Text numberOfLines={2} style={styles.meta}>{collectionConfidenceLabel(decision.confidence)}</Text>
                </View>
                <Text style={styles.suggestionAction}>
                  {collectionChoiceSaving === `suggestion:${index}` ? "Selecting..." : "Use suggestion"}
                </Text>
              </Pressable>
            ))}
            {restoredAiCollectionSuggestions.map(({ decision, key }) => {
              const choice = collectionChoiceFromDecision(decision);
              return (
                <Pressable
                  key={key}
                  disabled={!choice || Boolean(collectionChoiceSaving)}
                  onPress={() => {
                    if (!choice) return;
                    void sendCaptureCollectionChoice({
                      choice,
                      source: "analysis",
                      rationale: decision.rationale,
                      confidence: decision.confidence,
                      savingKey: `restored:${key}`
                    });
                  }}
                  style={styles.collectionPickerRow}
                >
                  <View style={styles.suggestionValue}>
                    <Text style={styles.suggestionText}>{decision.title}</Text>
                    <Text numberOfLines={2} style={styles.meta}>{collectionConfidenceLabel(decision.confidence)}</Text>
                  </View>
                  <Text style={styles.suggestionAction}>
                    {collectionChoiceSaving === `restored:${key}` ? "Selecting..." : "Use suggestion"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={styles.sheetSection}>
          <Text style={styles.quickLabel}>Find collection</Text>
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
                {collectionChoiceSaving === `existing:${collection.id}` ? "Selecting..." : "Use"}
              </Text>
            </Pressable>
          ))}
          {!collectionPickerRows.length ? (
            <Text style={styles.meta}>No matching active collections.</Text>
          ) : null}
        </View>

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
              {collectionChoiceSaving === "new" ? "Creating..." : "Create collection"}
            </Text>
          </Pressable>
        </View>
      </View>
    ) : null;
    const showStatus = selectedArchived || displayStatus(selected) !== "ready";
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <Animated.View
          style={[
            styles.reviewShell,
            {
              opacity: reviewMotion,
              transform: [
                {
                  translateY: reviewMotion.interpolate({
                    inputRange: [0, 1],
                    outputRange: [12, 0]
                  })
                }
              ]
            }
          ]}
        >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.reviewShell}
        >
          <ScrollView
            contentContainerStyle={[styles.detail, styles.reviewDetail]}
            keyboardShouldPersistTaps="handled"
          >
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
                  {captureStatusLabel(selected)}
                </Text>
              ) : null}
            </View>
            <View style={styles.quickEditBlock}>
              <View style={styles.reviewHeroTop}>
                <Text style={styles.kicker}>Meaning</Text>
                <Text style={styles.reviewState}>{selectedReviewState}</Text>
              </View>
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
                testID="pc.review.title"
                value={draftTitle}
              />
              <View style={styles.reviewSentence}>
                <Text style={styles.reviewSentenceText}>Saved as</Text>
                <Pressable
                  onLongPress={() => showRationale("Why this intent?", selected.intentRationale)}
                  onPress={() => setQuickIntentOpen((current) => !current)}
                  style={[styles.sentenceChip, quickIntentOpen && styles.sentenceChipActive]}
                >
                  <Text numberOfLines={2} style={styles.sentenceChipText}>{quickIntentLabel}</Text>
                </Pressable>
                {primaryCollectionTitle || pendingAutoCollection ? (
                  <>
                    <Text style={styles.reviewSentenceText}>in</Text>
                    <Pressable
                      onLongPress={() => showRationale("Why this collection?", primaryCollectionRationale)}
                      onPress={() => void openCollectionPicker()}
                      style={[styles.sentenceChip, collectionPickerOpen && styles.sentenceChipActive]}
                    >
                      <Text numberOfLines={2} style={styles.sentenceChipText}>
                        {pendingAutoCollection ? "choosing..." : primaryCollectionTitle}
                      </Text>
                    </Pressable>
                  </>
                ) : null}
                {primaryReminder ? (
                  <>
                    <Text style={styles.reviewSentenceText}>Reminder idea:</Text>
                    <Pressable
                      onLongPress={() => showRationale("Why this reminder?", primaryReminder.rationale)}
                      onPress={() => {
                        const next = { ...reminderDrafts };
                        if (primaryReminderRemoved) delete next[primaryReminderKey];
                        else next[primaryReminderKey] = "remove";
                        setReminderDrafts(next);
                        updateSelectedReviewDraft({ reminders: next });
                      }}
                      style={[styles.sentenceChip, primaryReminderRemoved && styles.sentenceChipMuted]}
                    >
                      <Text numberOfLines={2} style={[styles.sentenceChipText, primaryReminderRemoved && styles.suggestionTextMuted]}>
                        {reminderSentenceValue}
                      </Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
              <Text style={styles.reviewSentenceSubtext}>
                {draftIntentDirty
                  ? `Changed from ${humanize(aiIntentValue) || "the original suggestion"}`
                  : primaryCollectionTitle
                    ? selectedCollectionState
                    : "A capture can stay without a collection."}
                {primaryReminder ? ` · Reminder ${reminderStateLabel.toLowerCase()}` : ""}
              </Text>
              {!primaryCollectionTitle && !pendingAutoCollection ? (
                <Pressable onPress={() => void openCollectionPicker()} style={styles.addCollectionButton}>
                  <Text style={styles.inlineAction}>Add to collection</Text>
                </Pressable>
              ) : null}
              {quickBecause ? (
                <View style={styles.rationaleBlock}>
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
                  Original suggestion: {humanize(aiIntentValue) || "something useful"}
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
              {collectionPickerContent}
            </View>
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
              placeholder="Add why you saved this, if anything is missing"
              placeholderTextColor={colors.muted}
              style={styles.noteInput}
              testID="pc.review.note"
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
            <Pressable onPress={confirmArchive} style={styles.secondaryButton} testID="pc.capture.archive-toggle">
              <Text style={selectedArchived ? styles.secondaryButtonText : styles.dangerButtonText}>
                {selectedArchived ? "Restore capture" : "Archive capture"}
              </Text>
            </Pressable>
            {message ? <Text style={styles.message}>{message}</Text> : null}
          </ScrollView>
          <View style={styles.reviewFooter}>
            <Pressable
              disabled={collectionActionPending}
              onPress={() => void saveReviewDecisions()}
              style={[styles.primaryButton, collectionActionPending && styles.disabledButton]}
              testID="pc.review.save"
            >
              <Text style={styles.primaryButtonText}>
                {collectionActionPending ? "Updating collection..." : "Save review"}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
        </Animated.View>
        {renderSnackbar()}
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
            testID="pc.auth.email"
            value={authEmail}
          />
          <TextInput
            onChangeText={setAuthPassword}
            placeholder="Password"
            placeholderTextColor={colors.muted}
            secureTextEntry
            style={styles.search}
            testID="pc.auth.password"
            value={authPassword}
          />
          <Pressable
            disabled={Boolean(authLoading)}
            onPress={() => void submitAuth("signin")}
            style={styles.primaryButton}
            testID="pc.auth.sign-in"
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

  if (searchOpen) {
    const searchIsLoading = searchScope !== "active" && archivedCapturesLoading && !archivedCapturesLoaded;
    const emptyTitle = searchQuery.trim()
      ? "No matches yet."
      : searchScope === "archived"
        ? "No archived captures."
        : "Start with what you remember.";
    const emptyText = searchQuery.trim()
      ? "Try a place, product, source, collection, note, date, or why you saved it."
      : searchScope === "archived"
        ? "Archived captures stay searchable here after you move them out of Recent Captures."
        : "Search looks across titles, notes, sources, collections, reminders, and saved details.";
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <Animated.View
          style={[
            styles.searchScreen,
            {
              opacity: searchMotion,
              transform: [
                {
                  translateY: searchMotion.interpolate({
                    inputRange: [0, 1],
                    outputRange: [12, 0]
                  })
                }
              ]
            }
          ]}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.searchScreen}
          >
            <View style={styles.searchTop}>
              <View style={styles.searchBarRow}>
                <Pressable onPress={() => setSearchOpen(false)} style={styles.searchBackButton}>
                  <Text style={styles.textButtonText}>Back</Text>
                </Pressable>
                <TextInput
                  autoFocus
                  onChangeText={setSearchQuery}
                  placeholder="Search anything you saved"
                  placeholderTextColor={colors.muted}
                  returnKeyType="search"
                  style={styles.searchInputLarge}
                  testID="pc.search.input"
                  value={searchQuery}
                />
              </View>
              <View style={styles.scopeRow}>
                {(["active", "archived", "all"] as const).map((scope) => (
                  <Pressable
                    key={scope}
                    onPress={() => setSearchScope(scope)}
                    style={[styles.scopeChip, searchScope === scope && styles.scopeChipSelected]}
                    testID={`pc.search.scope.${scope}`}
                  >
                    <Text style={[styles.scopeChipText, searchScope === scope && styles.scopeChipTextSelected]}>
                      {scope === "active" ? "Active" : scope === "archived" ? "Archived" : "All"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {archivedCapturesError && searchScope !== "active" ? (
                <Text style={styles.errorText}>{archivedCapturesError}</Text>
              ) : null}
            </View>
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              renderItem={renderSearchResult}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              ListEmptyComponent={
                searchIsLoading ? (
                  renderLoadingRows()
                ) : (
                  <View style={styles.searchEmpty}>
                    <Text style={styles.emptyTitle}>{emptyTitle}</Text>
                    <Text style={styles.emptyText}>{emptyText}</Text>
                  </View>
                )
              }
              contentContainerStyle={searchResults.length ? styles.searchResultsContent : styles.searchEmptyContent}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
            />
          </KeyboardAvoidingView>
        </Animated.View>
        {renderSnackbar()}
      </SafeAreaView>
    );
  }

  const homeCountLabel = capturesLoading && !homeCaptures.length
    ? "Loading captures"
    : `${homeCaptures.length} recent ${homeCaptures.length === 1 ? "capture" : "captures"}`;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.container}>
        <View style={styles.header} testID="pc.home.captures">
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={styles.kicker}>{homeCountLabel}</Text>
              <Text style={styles.title}>Recent Captures</Text>
            </View>
            {session ? (
              <Pressable onPress={openAccountActions} style={styles.accountButton} hitSlop={8}>
                <Text style={styles.accountButtonText}>Account</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.homeActionRow}>
            <Pressable
              onPress={openSearch}
              style={({ pressed }) => [styles.searchAffordance, pressed && styles.pressed]}
              testID="pc.home.search"
            >
              <View style={styles.searchAffordanceCopy}>
                <Text style={styles.searchAffordanceText}>Search anything you saved</Text>
                <Text numberOfLines={1} style={styles.searchAffordanceMeta}>
                  Places, notes, sources, collections
                </Text>
              </View>
              <Text style={styles.searchAffordanceAction}>Search</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Paste link or note"
              onPress={() => setShowCaptureComposer((current) => !current)}
              style={({ pressed }) => [styles.fallbackCaptureToggle, pressed && styles.pressed]}
              testID="pc.capture.open"
            >
              <Text style={styles.fallbackCaptureToggleText}>+</Text>
            </Pressable>
          </View>
          {showCaptureComposer ? (
            <View style={styles.captureBox}>
              <TextInput
                multiline
                onChangeText={setSourceDraft}
                placeholder="Paste a link or note"
                placeholderTextColor={colors.muted}
                style={styles.captureInput}
                testID="pc.capture.source"
                value={sourceDraft}
              />
              <Pressable
                disabled={savingCapture || !sourceDraft.trim()}
                onPress={() => void saveCaptureSource()}
                style={[
                  styles.primaryButton,
                  (savingCapture || !sourceDraft.trim()) && styles.disabledButton
                ]}
                testID="pc.capture.save"
              >
                <Text style={styles.primaryButtonText}>
                  {savingCapture ? "Saving..." : "Save capture"}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {message ? <Text style={styles.messageInline}>{message}</Text> : null}
        </View>
        <FlatList
          data={homeRows}
          keyExtractor={(item) => item.id}
          renderItem={renderHomeRow}
          ItemSeparatorComponent={({ leadingItem }) =>
            leadingItem?.type === "section" ? null : <View style={styles.separator} />
          }
          ListEmptyComponent={
            capturesLoading ? (
              renderLoadingRows()
            ) : capturesError ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Could not load captures.</Text>
                <Text style={styles.emptyText}>{capturesError}</Text>
                <Pressable onPress={() => void loadCaptures()} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Try again</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Share something in.</Text>
                <Text style={styles.emptyText}>
                  Use the share sheet from a browser, message, notes app, or photos.
                </Text>
                <Pressable
                  onPress={() => setShowCaptureComposer(true)}
                  style={styles.primaryButton}
                  testID="pc.capture.empty.open"
                >
                  <Text style={styles.primaryButtonText}>Paste link or note</Text>
                </Pressable>
                <Text style={styles.emptyCue}>You can review details after the capture is saved.</Text>
              </View>
            )
          }
          contentContainerStyle={homeRows.length ? styles.listContent : styles.emptyContent}
          keyboardShouldPersistTaps="handled"
        />
      </View>
      {renderSnackbar()}
    </SafeAreaView>
  );
}

const colors = {
  paper: "#f8faf7",
  surface: "#ffffff",
  ink: "#1d211f",
  muted: "#66706a",
  line: "#dce4de",
  soft: "#edf4ef",
  accent: "#1f7a5b",
  accentSoft: "#dcefe7",
  processing: "#5d7187",
  review: "#9a6b1f",
  reviewSoft: "#f3efe6",
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
    paddingTop: 16
  },
  header: {
    gap: 4,
    paddingBottom: 14
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  headerCopy: {
    flex: 1,
    gap: 4
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
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 31
  },
  accountButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 4
  },
  accountButtonText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700"
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
  searchAffordance: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: "row",
    gap: 5,
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  homeActionRow: {
    alignItems: "stretch",
    flexDirection: "row",
    gap: 10,
    marginTop: 13
  },
  searchAffordanceCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  searchAffordanceText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21
  },
  searchAffordanceMeta: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  searchAffordanceAction: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "800"
  },
  fallbackCaptureToggle: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 58,
    width: 50
  },
  fallbackCaptureToggleText: {
    color: colors.paper,
    fontSize: 26,
    fontWeight: "500",
    lineHeight: 30
  },
  searchScreen: {
    flex: 1
  },
  searchTop: {
    paddingHorizontal: 22,
    paddingTop: 14
  },
  searchBarRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  searchBackButton: {
    justifyContent: "center",
    minHeight: 50
  },
  searchInputLarge: {
    backgroundColor: colors.soft,
    borderRadius: 8,
    flex: 1,
    color: colors.ink,
    fontSize: 17,
    fontWeight: "600",
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  scopeRow: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 12
  },
  scopeChip: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 12
  },
  scopeChipSelected: {
    backgroundColor: colors.ink,
    borderColor: colors.ink
  },
  scopeChipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  scopeChipTextSelected: {
    color: colors.paper
  },
  captureBox: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    marginTop: 10,
    padding: 12
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
    paddingBottom: 40,
    paddingTop: 2
  },
  searchResultsContent: {
    paddingBottom: 180,
    paddingTop: 10,
    paddingHorizontal: 22
  },
  searchEmptyContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 20
  },
  groupHeader: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    paddingBottom: 2,
    paddingTop: 18
  },
  captureRow: {
    gap: 7,
    minHeight: 74,
    paddingVertical: 15
  },
  rowTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  rowTitleLine: {
    alignItems: "flex-start",
    flexDirection: "row"
  },
  rowMetaLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 20
  },
  captureTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 23
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
    color: colors.review
  },
  statusFailed: {
    color: "#9f3d2e"
  },
  meta: {
    color: colors.muted,
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18
  },
  statusPill: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    flexShrink: 0
  },
  statusPillProcessing: {
    color: colors.processing
  },
  statusPillReview: {
    color: colors.review
  },
  statusPillFailed: {
    color: colors.danger
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
    color: colors.accent,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18
  },
  searchMatchText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18
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
  searchEmpty: {
    gap: 8,
    paddingTop: 22
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
  emptyCue: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 280
  },
  loadingRows: {
    gap: 1,
    paddingTop: 10
  },
  loadingRow: {
    gap: 8,
    paddingVertical: 16
  },
  loadingTitle: {
    backgroundColor: colors.soft,
    borderRadius: 6,
    height: 18,
    width: "74%"
  },
  loadingLine: {
    backgroundColor: colors.soft,
    borderRadius: 6,
    height: 13,
    width: "92%"
  },
  loadingLineShort: {
    backgroundColor: colors.soft,
    borderRadius: 6,
    height: 13,
    width: "58%"
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
  reviewShell: {
    flex: 1
  },
  reviewDetail: {
    paddingBottom: 118
  },
  reviewFooter: {
    backgroundColor: colors.paper,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: Platform.OS === "android" ? 16 : 22,
    paddingHorizontal: 22,
    paddingTop: 10
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
    gap: 14,
    paddingBottom: 2
  },
  reviewHeroTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  reviewState: {
    color: colors.accent,
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "right"
  },
  reviewTitleInput: {
    color: colors.ink,
    fontSize: 25,
    fontWeight: "700",
    lineHeight: 31,
    padding: 0
  },
  reviewSentence: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingTop: 2
  },
  reviewSentenceText: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 28
  },
  sentenceChip: {
    backgroundColor: colors.accentSoft,
    borderColor: "#c6dfd4",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 1,
    justifyContent: "center",
    maxWidth: "100%",
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  sentenceChipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent
  },
  sentenceChipMuted: {
    backgroundColor: "#f1f1ee"
  },
  sentenceChipText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 21
  },
  reviewSentenceSubtext: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19
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
  addCollectionButton: {
    alignSelf: "flex-start",
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12
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
  rationaleBlock: {
    alignItems: "center",
    backgroundColor: colors.soft,
    borderRadius: 8,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  becauseText: {
    color: colors.muted,
    flex: 1,
    fontSize: 14,
    lineHeight: 20
  },
  reviewCallout: {
    backgroundColor: colors.reviewSoft,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  reviewCalloutCopy: {
    gap: 3
  },
  reviewCalloutLabel: {
    color: colors.review,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  reviewCalloutText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20
  },
  suggestionRail: {
    gap: 8
  },
  collectionPicker: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    padding: 12
  },
  sheetHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  sheetHeaderCopy: {
    flex: 1,
    gap: 3
  },
  sheetTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800"
  },
  sheetSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  sheetCloseButton: {
    minHeight: 44,
    justifyContent: "center"
  },
  sheetSection: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
    paddingTop: 12
  },
  currentChoiceRow: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    flexDirection: "row",
    gap: 10,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  collectionPickerRow: {
    alignItems: "center",
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    minHeight: 50,
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
    justifyContent: "center",
    minHeight: 44,
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
    justifyContent: "center",
    minHeight: 50,
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
    justifyContent: "center",
    minHeight: 50,
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
  },
  messageInline: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    paddingTop: 8
  },
  snackbar: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: 8,
    bottom: Platform.OS === "android" ? 16 : 22,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    left: 22,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 10,
    position: "absolute",
    right: 22
  },
  snackbarText: {
    color: colors.paper,
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19
  },
  snackbarAction: {
    color: colors.accentSoft,
    fontSize: 14,
    fontWeight: "800"
  }
});
