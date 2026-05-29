import "react-native-url-polyfill/auto";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import {
  Alert,
  Animated,
  AppState,
  BackHandler,
  FlatList,
  Image,
  Keyboard,
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
  useWindowDimensions,
  View
} from "react-native";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Check,
  Clock3,
  Copy,
  ExternalLink,
  Folder,
  Image as ImageIcon,
  Info,
  Link2,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
  StickyNote,
  X
} from "lucide-react-native";

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
const SEARCH_PROMPTS = [
  { label: "Places", query: "places", Icon: MapPin },
  { label: "Links from yesterday", query: "links from yesterday", Icon: Link2 },
  { label: "Things to read", query: "things to read", Icon: BookOpen },
  { label: "Products", query: "products", Icon: ShoppingBag },
  { label: "Travel ideas", query: "travel ideas", Icon: CalendarDays }
];

type LucideIconComponent = ComponentType<{
  color?: string;
  size?: number;
  strokeWidth?: number;
}>;

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

function captureSourceHost(capture: Capture) {
  return hostFromUrl(capture.sourceUrl) || capture.siteName || "";
}

function sourceFaviconUrl(host: string) {
  const cleaned = host.replace(/^www\./i, "").trim();
  if (!cleaned || !cleaned.includes(".") || /[\s/]/.test(cleaned)) return "";
  return `https://${cleaned}/favicon.ico`;
}

function isMapSource(capture: Capture) {
  const host = captureSourceHost(capture).toLowerCase();
  const url = String(capture.sourceUrl || "").toLowerCase();
  const intent = capture.defaultIntent || "";
  return (
    host.includes("maps") ||
    host === "goo.gl" ||
    host.endsWith(".goo.gl") ||
    url.includes("/maps") ||
    url.includes("maps.app.goo.gl") ||
    url.includes("goo.gl/maps") ||
    intent.includes("place") ||
    intent.includes("trip")
  );
}

function sourceIconForCapture(capture: Capture): LucideIconComponent {
  const host = captureSourceHost(capture).toLowerCase();
  const intent = capture.defaultIntent || "";
  if (isMapSource(capture)) {
    return MapPin;
  }
  if (intent.includes("buy") || intent.includes("product") || host.includes("amazon") || host.includes("etsy")) {
    return ShoppingBag;
  }
  if (intent.includes("read") || host.includes("medium") || host.includes("substack")) {
    return BookOpen;
  }
  if (host.includes("youtube") || host.includes("instagram") || host.includes("tiktok") || host.includes("photos")) {
    return ImageIcon;
  }
  if (intent.includes("event") || intent.includes("reminder")) return CalendarDays;
  if (capture.sourceUrl) return Link2;
  return StickyNote;
}

function captureStatusLabel(capture: Capture) {
  if (isArchived(capture)) return "Archived";
  const status = displayStatus(capture);
  if (status === "processing") return "Analyzing";
  if (status === "failed") return "Could not analyze";
  if (status === "needs_review") return "Needs a quick look";
  return statusLabel(status);
}

function captureIntentLabel(capture: Capture) {
  return humanize(capture.defaultIntent) || "";
}

function auditLikeText(value: string | null | undefined) {
  return /url returned|saved url failed|saved link:|failed to fetch metadata|could not fetch metadata|metadata fetch|metadata|no readable title|readable title|readable description|path suggests|generic evidence|insufficient url|link saved from android share|android share|untitled capture|extraction|analysis|confidence|model|provider/i.test(
    String(value || "")
  );
}

function consumerSummary(capture: Capture) {
  const cleaned = (capture.summary || "")
    .replace(/\s*[—-]\s*likely\b.*$/i, "")
    .replace(/\.\s*likely\b.*$/i, ".")
    .replace(/\s*[—-]\s*the user\b.*$/i, "")
    .replace(/\.\s*the user\b.*$/i, ".");
  const summary = conciseText(cleaned, 128);
  if (!summary) return "";
  if (auditLikeText(summary)) {
    return "";
  }
  return summary;
}

function rawTitleLikeSource(capture: Capture) {
  const title = cleanSentence(capture.title).toLowerCase();
  if (!title) return true;
  if (auditLikeText(title)) return true;
  if (/^https?:\/\//i.test(title)) return true;
  const host = captureSourceHost(capture).toLowerCase();
  const source = captureSourceLabel(capture).toLowerCase();
  if (/^[a-z0-9.-]+\/\S+/i.test(title)) return true;
  if (host && title.startsWith(`${host}/`)) return true;
  if (host && (title === host || title === host.replace(/^www\./, ""))) return true;
  if (source && title === source) return true;
  return !title.includes(" ") && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(title);
}

function captureDisplayTitle(capture: Capture) {
  const title = cleanSentence(capture.title);
  if (title && !rawTitleLikeSource(capture)) return title;
  const summary = consumerSummary(capture);
  if (summary) return conciseText(summary, 72);
  const source = captureSourceLabel(capture);
  if (source && source !== "Shared text") return `Saved from ${source}`;
  return capture.sourceUrl ? "Saved link" : "Saved note";
}

function captureSupportLine(capture: Capture, visibleSummary: string) {
  if (visibleSummary) return "";
  const status = displayStatus(capture);
  if (status === "processing") return "Checking the source now.";
  if (status === "failed") return "Saved. Open it to review or try again.";
  if (status === "needs_review") return "A quick review will help finish this capture.";
  const evidence = urlEvidenceMessage(capture.urlEvidence);
  if (evidence) return evidence;
  return "";
}

function reviewStatusCue(capture: Capture, pendingAutoCollection: boolean, hasReviewReasons: boolean) {
  if (pendingAutoCollection) return "Choosing collection";
  if (displayStatus(capture) === "processing") return "Checking source";
  if (displayStatus(capture) === "failed") return "Needs a quick look";
  if (hasReviewReasons) return "Needs a quick look";
  return "Ready";
}

function shortTrustCue(value: string | null | undefined) {
  const cleaned = cleanSentence(value);
  if (!cleaned) return "";
  if (auditLikeText(cleaned)) return "";
  if (/^suggestion based on saved content\.?$/i.test(cleaned)) return "";
  return "Suggestion detail";
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
  const suppliedMessage = evidence.user_facing_message && !auditLikeText(evidence.user_facing_message)
    ? evidence.user_facing_message
    : "";
  if (evidence.status === "needs_client_resolution") {
    return suppliedMessage || "Saved. Open the link once if you want richer details.";
  }
  if (evidence.status === "insufficient_url_evidence") {
    return suppliedMessage || "Saved with limited public details.";
  }
  if (evidence.status === "partial_evidence" || evidence.evidence_quality === "low") {
    return "Saved with partial source details.";
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
  if (auditLikeText(message) || /stack trace|edge function|supabase|native bridge|request failed/i.test(message)) {
    return fallback;
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

function IconButton({
  Icon,
  label,
  onPress,
  disabled = false,
  selected = false,
  tone = "default",
  testID
}: {
  Icon: LucideIconComponent;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  tone?: "default" | "primary" | "danger";
  testID?: string;
}) {
  const iconColor = disabled
    ? colors.muted
    : tone === "danger"
      ? colors.danger
      : tone === "primary" || selected
        ? colors.accent
        : colors.ink;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        selected && styles.iconButtonSelected,
        disabled && styles.iconButtonDisabled,
        pressed && !disabled && styles.subtlePressed
      ]}
      testID={testID}
    >
      <Icon color={iconColor} size={20} strokeWidth={2.3} />
    </Pressable>
  );
}

function SourceMark({
  capture,
  failedFavicons,
  onFaviconFailure,
  size = "row"
}: {
  capture: Capture;
  failedFavicons: Record<string, boolean>;
  onFaviconFailure: (host: string) => void;
  size?: "row" | "detail";
}) {
  const host = captureSourceHost(capture).replace(/^www\./i, "");
  const faviconUri = !isMapSource(capture) && !failedFavicons[host] ? sourceFaviconUrl(host) : "";
  const Icon = sourceIconForCapture(capture);
  const itemStatus = displayStatus(capture);
  const markStyle = size === "detail" ? styles.sourceMarkDetail : styles.sourceMark;
  const iconSize = size === "detail" ? 16 : 20;
  return (
    <View
      accessibilityLabel={host ? `Source: ${host}` : "Source"}
      accessible
      style={[
        markStyle,
        itemStatus === "processing" && styles.sourceMarkProcessing,
        itemStatus === "needs_review" && styles.sourceMarkReview,
        itemStatus === "failed" && styles.sourceMarkFailed
      ]}
    >
      <Icon color={sourceIconColor(itemStatus)} size={iconSize} strokeWidth={2.3} />
      {faviconUri ? (
        <Image
          onError={() => onFaviconFailure(host)}
          source={{ uri: faviconUri }}
          style={[
            styles.sourceFaviconOverlay,
            size === "detail" ? styles.sourceFaviconDetail : styles.sourceFavicon
          ]}
        />
      ) : null}
    </View>
  );
}

function sourceIconColor(status: CaptureStatus) {
  if (status === "processing") return colors.processing;
  if (status === "needs_review") return colors.review;
  if (status === "failed") return colors.danger;
  return colors.accent;
}

function StatusGlyph({ capture }: { capture: Capture }) {
  const status = displayStatus(capture);
  if (!isArchived(capture) && status === "ready") return null;
  const archived = isArchived(capture);
  const Icon = archived
    ? Archive
    : status === "processing"
      ? Clock3
      : status === "failed"
        ? AlertTriangle
        : Info;
  const label = archived ? "Archived" : captureStatusLabel(capture);
  return (
    <View
      accessibilityLabel={label}
      accessible
      style={[
        styles.statusGlyph,
        status === "processing" && styles.statusGlyphProcessing,
        status === "needs_review" && styles.statusGlyphReview,
        status === "failed" && styles.statusGlyphFailed,
        archived && styles.statusGlyphArchived
      ]}
    >
      <Icon
        color={
          archived
            ? colors.muted
            : status === "processing"
              ? colors.processing
              : status === "failed"
                ? colors.danger
                : colors.review
        }
        size={15}
        strokeWidth={2.5}
      />
    </View>
  );
}

function MeaningToken({ Icon, text }: { Icon: LucideIconComponent; text: string }) {
  return (
    <View style={styles.meaningToken}>
      <Icon color={colors.muted} size={13} strokeWidth={2.2} />
      <Text numberOfLines={1} style={styles.meaningTokenText}>
        {text}
      </Text>
    </View>
  );
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
  const [capturesError, setCapturesError] = useState("");
  const [archivedCapturesLoading, setArchivedCapturesLoading] = useState(false);
  const [archivedCapturesError, setArchivedCapturesError] = useState("");
  const [archivedCapturesLoaded, setArchivedCapturesLoaded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState<SearchScope>("active");
  const [searchScopeOpen, setSearchScopeOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [collectionsMode, setCollectionsMode] = useState<CollectionListMode>("active");
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectionsError, setCollectionsError] = useState("");
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
  const [sourceContextDraft, setSourceContextDraft] = useState("");
  const [showCaptureContext, setShowCaptureContext] = useState(false);
  const [showCaptureComposer, setShowCaptureComposer] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [sourceExpanded, setSourceExpanded] = useState(false);
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [faviconFailures, setFaviconFailures] = useState<Record<string, boolean>>({});
  const [savingCapture, setSavingCapture] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState<"signin" | "signup" | null>(null);
  const latestNoteRef = useRef("");
  const autoAppliedCollectionKeysRef = useRef<Set<string>>(new Set());
  const searchMotion = useRef(new Animated.Value(0)).current;
  const reviewMotion = useRef(new Animated.Value(0)).current;
  const captureComposerMotion = useRef(new Animated.Value(0)).current;

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
      setCollectionsOpen(false);
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
    setCollectionsOpen(false);
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
    setCollectionsOpen(false);
    setMessage("");
    setSearchScopeOpen(false);
    setSearchOpen(true);
  }

  function openAccountActions() {
    Alert.alert(
      "Account",
      "Manage this device session.",
      [
        { text: "Collections", onPress: () => void openCollectionsScreen() },
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: () => void signOut() }
      ]
    );
  }

  async function openCollectionsScreen(mode: CollectionListMode = collectionsMode) {
    selectCapture(null);
    setSearchOpen(false);
    setCollectionsMode(mode);
    setCollectionsOpen(true);
    setSelectedCollectionId(null);
    setCollectionsLoading(true);
    setCollectionsError("");
    try {
      await loadCollections(mode);
    } catch (error) {
      const text = friendlyError(error, "Could not load collections.");
      setCollectionsError(text);
      setMessage(text);
    } finally {
      setCollectionsLoading(false);
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
    if (!selectedId && !selectedCollectionId && !searchOpen && !showCaptureComposer && !collectionsOpen) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (showCaptureComposer) {
        setShowCaptureComposer(false);
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
    captureReturnCollectionId,
    collectionsOpen,
    searchOpen,
    selectCapture,
    selectCollection,
    selectedCollectionId,
    selectedId,
    showCaptureComposer
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
    if (!showCaptureComposer) return;
    captureComposerMotion.setValue(0);
    Animated.spring(captureComposerMotion, {
      damping: 24,
      mass: 0.9,
      stiffness: 300,
      toValue: 1,
      useNativeDriver: false
    }).start();
  }, [captureComposerMotion, showCaptureComposer]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const homeCaptures = useMemo(() => captures.filter((capture) => !isArchived(capture)), [captures]);
  const homeRows = useMemo(() => groupedCaptureRows(homeCaptures), [homeCaptures]);
  const quickLookCount = useMemo(
    () => homeCaptures.filter((capture) => displayStatus(capture) === "needs_review" || displayStatus(capture) === "failed").length,
    [homeCaptures]
  );
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
      setSourceExpanded(false);
      setNoteExpanded(false);
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
    setSourceExpanded(false);
    setNoteExpanded(false);
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
      const context = sourceContextDraft.trim();
      const raw = await nativeStore.captureSource(context ? `${source}\n\n${context}` : source);
      const localCapture = JSON.parse(raw) as Capture;
      setCaptures((current) => [localCapture, ...current.filter((item) => item.id !== localCapture.id)]);
      setSourceDraft("");
      setSourceContextDraft("");
      setShowCaptureContext(false);
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
    setCollectionsOpen(false);
    setSearchOpen(false);
    setSearchQuery("");
    selectCapture(null);
    selectCollection(null);
  }

  function renderCaptureRow(input: {
    item: Capture;
    onPress: () => void;
    testID?: string;
    matchReason?: string;
  }) {
    const { item, onPress, testID, matchReason } = input;
    const itemSummary = consumerSummary(item);
    const supportLine = captureSupportLine(item, itemSummary);
    const intentLabel = captureIntentLabel(item);
    const collectionLabel = item.linkedCollections?.[0]?.title || "";
    return (
      <Pressable
        android_ripple={{ color: "rgba(31, 122, 91, 0.08)" }}
        onPress={onPress}
        style={({ pressed }) => [styles.captureRow, pressed && styles.captureRowPressed]}
        testID={testID}
      >
        <SourceMark capture={item} failedFavicons={faviconFailures} onFaviconFailure={markFaviconFailed} />
        <View style={styles.rowContent}>
          <View style={styles.rowTitleLine}>
            <Text numberOfLines={2} style={styles.captureTitle}>
              {captureDisplayTitle(item)}
            </Text>
            <StatusGlyph capture={item} />
          </View>
          <Text numberOfLines={1} style={styles.meta}>
            {captureSourceLabel(item)} · {formatDateTime(item.createdAt)}
          </Text>
          {matchReason ? (
            <Text numberOfLines={1} style={styles.searchMatchText}>
              {matchReason}
            </Text>
          ) : null}
          {itemSummary ? (
            <Text numberOfLines={2} style={styles.summaryPreview}>
              {itemSummary}
            </Text>
          ) : supportLine ? (
            <Text numberOfLines={2} style={styles.supportPreview}>
              {supportLine}
            </Text>
          ) : null}
          <View style={styles.rowMeaningLine}>
            {intentLabel ? (
              <MeaningToken Icon={BookOpen} text={intentLabel} />
            ) : null}
            {collectionLabel ? (
              <MeaningToken Icon={Folder} text={collectionLabel} />
            ) : null}
            {item.note ? (
              <MeaningToken Icon={StickyNote} text={item.note} />
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  }

  function renderCapture({ item }: { item: Capture }) {
    return renderCaptureRow({
      item,
      onPress: () => openCapture(item.id),
      testID: `pc.capture.row.${item.id}`
    });
  }

  function renderCollectionCapture({ item }: { item: Capture }) {
    return (
      <View style={styles.collectionCaptureRow}>
        <View style={styles.collectionCaptureMain}>
          {renderCaptureRow({
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
        style={({ pressed }) => [styles.collectionRow, pressed && styles.captureRowPressed]}
        testID={`pc.collection.row.${item.id}`}
      >
        <View style={styles.collectionRowTop}>
          <View style={styles.collectionIconMark}>
            <Folder color={item.status === "archived" ? colors.muted : colors.accent} size={18} strokeWidth={2.2} />
          </View>
          <View style={styles.collectionRowCopy}>
            <Text numberOfLines={1} style={styles.captureTitle}>
              {item.title}
            </Text>
            <Text style={styles.meta}>
              {item.status === "archived" ? "Archived" : `${item.captureCount} captures`}
            </Text>
          </View>
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
    return renderCaptureRow({
      item,
      matchReason: matchReasonForCapture(item, searchQuery),
      onPress: () => openCapture(item.id),
      testID: `pc.search.result.${item.id}`
    });
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
                <IconButton Icon={ArrowLeft} label="Back" onPress={() => selectCollection(null)} />
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

  if (collectionsOpen) {
    const collectionSaveDisabled = !collectionTitle.trim() || !collectionDescription.trim();
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.collectionsScreen}>
          <View style={styles.detailHeader}>
            <IconButton Icon={ArrowLeft} label="Back" onPress={() => setCollectionsOpen(false)} />
            <IconButton
              Icon={Plus}
              label="New collection"
              onPress={() => {
                setShowCollectionForm((current) => !current);
                setCollectionTitle("");
                setCollectionDescription("");
                setCollectionDraftDirty(false);
              }}
              selected={showCollectionForm}
              tone="primary"
              testID="pc.collections.new"
            />
          </View>
          <View style={styles.collectionsTitleBlock}>
            <Text style={styles.title}>Collections</Text>
            <Text style={styles.sourceText}>
              Keep projects, trips, recipes, and purchase decisions tidy without making them the main way to browse.
            </Text>
          </View>
          <View style={styles.collectionModeRow}>
            {(["active", "archived"] as const).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => void openCollectionsScreen(mode)}
                style={[
                  styles.scopeChip,
                  styles.collectionModeChip,
                  collectionsMode === mode && styles.scopeChipSelected
                ]}
              >
                <Text style={[styles.scopeChipText, collectionsMode === mode && styles.scopeChipTextSelected]}>
                  {mode === "active" ? "Active" : "Archived"}
                </Text>
              </Pressable>
            ))}
          </View>
          {showCollectionForm ? (
            <View style={styles.collectionCreatePanel}>
              <Text style={styles.sheetTitle}>New collection</Text>
              <TextInput
                onChangeText={(value) => {
                  setCollectionDraftDirty(true);
                  setCollectionTitle(value);
                }}
                placeholder="Title"
                placeholderTextColor={colors.muted}
                style={styles.search}
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
                style={styles.detailInput}
                testID="pc.collections.create.description"
                value={collectionDescription}
              />
              <Pressable
                disabled={collectionSaveDisabled}
                onPress={() => void saveCollection()}
                style={[styles.primaryButton, collectionSaveDisabled && styles.disabledButton]}
                testID="pc.collections.create.save"
              >
                <Text style={styles.primaryButtonText}>Create collection</Text>
              </Pressable>
            </View>
          ) : null}
          {collectionsError ? <Text style={styles.errorText}>{collectionsError}</Text> : null}
          <FlatList
            data={collections}
            keyExtractor={(item) => item.id}
            renderItem={renderCollection}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              collectionsLoading ? (
                renderLoadingRows()
              ) : (
                <View style={styles.collectionEmpty}>
                  <Text style={styles.emptyTitle}>
                    {collectionsMode === "archived" ? "No archived collections." : "No collections yet."}
                  </Text>
                  <Text style={styles.emptyText}>
                    {collectionsMode === "archived"
                      ? "Archived collections will appear here."
                      : "Create one when a group of captures starts to have a purpose."}
                  </Text>
                </View>
              )
            }
            contentContainerStyle={styles.collectionsListContent}
          />
          {message ? <Text style={styles.messageInline}>{message}</Text> : null}
        </View>
        {renderSnackbar()}
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
    const primaryCollectionChoice = primaryCollectionDecision
      ? collectionChoiceFromDecision(primaryCollectionDecision)
      : null;
    const primaryCollectionTitle = primaryLinkedCollection?.title || primaryCollectionDecision?.title || "";
    const primaryCollectionConfidence = primaryLinkedCollection?.confidence ?? primaryCollectionDecision?.confidence ?? null;
    const primaryCollectionRationale = primaryLinkedCollection?.rationale || primaryCollectionDecision?.rationale;
    const primaryRationale = (!primaryReminderRemoved ? primaryReminder?.rationale : "") || primaryCollectionRationale || selected.intentRationale;
    const quickBecause = shortTrustCue(primaryRationale);
    const selectedCollectionState = primaryCollectionTitle ? collectionConfidenceLabel(primaryCollectionConfidence) : "No collection";
    const reminderSentenceValue = primaryReminder && !primaryReminderRemoved
      ? reminderLabel(primaryReminder)
      : "no reminder";
    const pendingAutoCollection = Boolean(collectionChoiceSaving?.startsWith("auto-suggestion:"));
    const selectedReviewState = reviewStatusCue(selected, pendingAutoCollection, selectedReviewReasons.length > 0);
    const showReviewStateText = selectedReviewState !== "Ready" && selectedReviewState !== captureStatusLabel(selected);
    const otherActiveCollectionSuggestions = collectionSuggestionRows
      .slice(primaryCollectionDecision ? 1 : 0, 3)
      .map((decision, offset) => ({ decision, index: (primaryCollectionDecision ? 1 : 0) + offset }));
    const restoredAiCollectionSuggestions = replacedCollectionSuggestions
      .flatMap(({ decision, key }) => [{ decision, key }])
      .filter(({ decision }) => decision.title !== primaryCollectionTitle)
      .slice(0, 3);
    const collectionActionPending = Boolean(collectionChoiceSaving);
    const urlEvidenceNotice = urlEvidenceMessage(selected.urlEvidence);
    const selectedSourceMeta = `${captureSourceLabel(selected)} · ${formatDateTime(selected.createdAt)}`;
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
    const noteHasText = Boolean(draftNote.trim());
    const showNoteEditor = noteExpanded;
    const reviewHasPendingChanges = Boolean(
      draftTitleDirty ||
        draftNoteDirty ||
        draftIntentDirty ||
        Object.keys(reminderDrafts).length ||
        Object.keys(collectionDrafts).length
    );
    const reviewSupportText = draftIntentDirty
      ? `Changed from ${humanize(aiIntentValue) || "the original suggestion"}`
      : !primaryCollectionTitle
        ? "A capture can stay without a collection."
        : "";
    const showReviewFooter = !collectionPickerOpen && (reviewHasPendingChanges || collectionActionPending);
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
              <Text style={styles.quickLabel}>{primaryLinkedCollection ? "Selected" : "Suggestion"}</Text>
              <Text style={styles.suggestionText}>{primaryCollectionTitle}</Text>
              <Text style={styles.meta}>{selectedCollectionState}</Text>
            </View>
            {primaryLinkedCollection ? (
              <View style={styles.suggestionActions}>
                <Pressable onPress={() => void openCollectionSettings(primaryLinkedCollection.id)} hitSlop={8}>
                  <Text style={styles.suggestionAction}>Manage</Text>
                </Pressable>
                <Pressable onPress={() => void unlinkCollectionFromCapture(primaryLinkedCollection.id)} hitSlop={8}>
                  <Text style={styles.suggestionAction}>Remove</Text>
                </Pressable>
              </View>
            ) : primaryCollectionDecision ? (
              <Pressable
                disabled={!primaryCollectionChoice || Boolean(collectionChoiceSaving)}
                onPress={() => void autosaveCollectionDecision(primaryCollectionDecision, 0)}
                hitSlop={8}
              >
                <Text style={styles.suggestionAction}>
                  {collectionChoiceSaving === "suggestion:0" ? "Selecting..." : "Use suggestion"}
                </Text>
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
            <View
              key={collection.id}
              style={styles.collectionPickerRow}
            >
              <View style={styles.suggestionValue}>
                <Text style={styles.suggestionText}>{collection.title}</Text>
                <Text numberOfLines={2} style={styles.meta}>{collection.description}</Text>
              </View>
              <View style={styles.suggestionActions}>
                <Pressable
                  disabled={Boolean(collectionChoiceSaving)}
                  onPress={() => void sendCaptureCollectionChoice({
                    choice: { type: "existing", collectionId: collection.id },
                    source: "manual",
                    dismissCurrentCollectionSuggestions: collectionSuggestionRows.length > 0,
                    savingKey: `existing:${collection.id}`
                  })}
                  hitSlop={8}
                >
                  <Text style={styles.suggestionAction}>
                    {collectionChoiceSaving === `existing:${collection.id}` ? "Selecting..." : "Use"}
                  </Text>
                </Pressable>
                <Pressable onPress={() => void openCollectionSettings(collection.id)} hitSlop={8}>
                  <Text style={styles.suggestionAction}>Manage</Text>
                </Pressable>
              </View>
            </View>
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
            contentContainerStyle={[
              styles.detail,
              styles.reviewDetail,
              !showReviewFooter && styles.reviewDetailNoFooter
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.detailHeader}>
              <IconButton
                Icon={ArrowLeft}
                label="Back"
                onPress={() => {
                  if (captureReturnCollectionId) {
                    const collectionId = captureReturnCollectionId;
                    selectCapture(null);
                    selectCollection(collectionId);
                  } else {
                    selectCapture(null);
                  }
                }}
              />
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
              <View style={styles.reviewSentence}>
                <View style={styles.reviewPhrase}>
                  <Text style={styles.reviewSentenceText}>Saved as</Text>
                  <Pressable
                    android_ripple={{ color: "rgba(31, 122, 91, 0.10)" }}
                    onLongPress={() => showRationale("Why this intent?", selected.intentRationale)}
                    onPress={() => setQuickIntentOpen((current) => !current)}
                    style={({ pressed }) => [
                      styles.sentenceChip,
                      quickIntentOpen && styles.sentenceChipActive,
                      pressed && styles.subtlePressed
                    ]}
                  >
                    <Text numberOfLines={2} style={styles.sentenceChipText}>{quickIntentLabel}</Text>
                  </Pressable>
                </View>
                {primaryCollectionTitle || pendingAutoCollection ? (
                  <View style={styles.reviewPhrase}>
                    <Text style={styles.reviewSentenceText}>in</Text>
                    <Pressable
                      android_ripple={{ color: "rgba(31, 122, 91, 0.10)" }}
                      onLongPress={() => showRationale("Why this collection?", primaryCollectionRationale)}
                      onPress={() => void openCollectionPicker()}
                      style={({ pressed }) => [
                        styles.sentenceChip,
                        collectionPickerOpen && styles.sentenceChipActive,
                        pressed && styles.subtlePressed
                      ]}
                    >
                      <Text numberOfLines={2} style={styles.sentenceChipText}>
                        {pendingAutoCollection ? "choosing..." : primaryCollectionTitle}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
                {primaryReminder ? (
                  <View style={styles.reviewPhrase}>
                    <Text style={styles.reviewSentenceText}>Reminder idea:</Text>
                    <Pressable
                      android_ripple={{ color: "rgba(31, 122, 91, 0.10)" }}
                      onLongPress={() => showRationale("Why this reminder?", primaryReminder.rationale)}
                      onPress={() => {
                        const next = { ...reminderDrafts };
                        if (primaryReminderRemoved) delete next[primaryReminderKey];
                        else next[primaryReminderKey] = "remove";
                        setReminderDrafts(next);
                        updateSelectedReviewDraft({ reminders: next });
                      }}
                      style={({ pressed }) => [
                        styles.sentenceChip,
                        primaryReminderRemoved && styles.sentenceChipMuted,
                        pressed && styles.subtlePressed
                      ]}
                    >
                      <Text numberOfLines={2} style={[styles.sentenceChipText, primaryReminderRemoved && styles.suggestionTextMuted]}>
                        {reminderSentenceValue}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
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
              <View style={styles.reviewSourceRow}>
                <SourceMark
                  capture={selected}
                  failedFavicons={faviconFailures}
                  onFaviconFailure={markFaviconFailed}
                  size="detail"
                />
                <Text numberOfLines={1} style={styles.reviewSourceMeta}>{selectedSourceMeta}</Text>
              </View>
              {showReviewStateText ? (
                <Text style={styles.reviewSentenceSubtext}>{selectedReviewState}</Text>
              ) : null}
              {reviewSupportText ? (
                <Text style={styles.reviewSentenceSubtext}>{reviewSupportText}</Text>
              ) : null}
              {primaryCollectionTitle || pendingAutoCollection ? (
                <View style={styles.collectionInlineActions}>
                  <Pressable
                    onPress={() => void openCollectionPicker()}
                    style={({ pressed }) => [styles.addCollectionButton, pressed && styles.subtlePressed]}
                  >
                    <Text style={styles.inlineAction}>
                      {pendingAutoCollection ? "Choose collection" : "Change collection"}
                    </Text>
                  </Pressable>
                  {primaryLinkedCollection ? (
                    <Pressable
                      onPress={() => void openCollectionSettings(primaryLinkedCollection.id)}
                      style={({ pressed }) => [styles.addCollectionButton, pressed && styles.subtlePressed]}
                    >
                      <Text style={styles.inlineAction}>Manage collection</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <Pressable
                  onPress={() => void openCollectionPicker()}
                  style={({ pressed }) => [styles.addCollectionButton, pressed && styles.subtlePressed]}
                >
                  <Text style={styles.inlineAction}>Add to collection</Text>
                </Pressable>
              )}
              {quickBecause ? (
                <IconButton
                  Icon={Info}
                  label={quickBecause}
                  onPress={() => showRationale("Suggestion", primaryRationale)}
                />
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
                <Text style={styles.meta}>{noteHasText ? "Note" : "Add note"}</Text>
                {noteStatusLabel ? (
                  <Text style={[styles.noteSaveState, noteSaveState === "error" && styles.noteSaveStateError]}>
                    {noteStatusLabel}
                  </Text>
                ) : null}
              </View>
              {showNoteEditor ? (
                <TextInput
                  multiline
                  onChangeText={(value) => {
                    setDraftNoteDirty(true);
                    setDraftNote(value);
                    updateSelectedReviewDraft({ note: value, noteDirty: true });
                  }}
                  placeholder="Why did you save this?"
                  placeholderTextColor={colors.muted}
                  style={styles.noteInput}
                  testID="pc.review.note"
                  value={draftNote}
                />
              ) : (
                <Pressable
                  onPress={() => setNoteExpanded(true)}
                  style={({ pressed }) => [styles.compactActionRow, pressed && styles.subtlePressed]}
                >
                  <StickyNote color={colors.muted} size={18} strokeWidth={2.2} />
                  <Text numberOfLines={1} style={styles.compactActionText}>
                    {noteHasText ? draftNote : "Add note"}
                  </Text>
                  <Pencil color={colors.muted} size={16} strokeWidth={2.2} />
                </Pressable>
              )}
            </View>
            <View style={styles.sourceBlock}>
              <View style={styles.sourceDisclosureRow}>
                <Pressable
                  disabled={!sourceValue}
                  onPress={() => setSourceExpanded((current) => !current)}
                  style={({ pressed }) => [styles.sourceDisclosureCopy, pressed && sourceValue && styles.subtlePressed]}
                >
                  <Text style={styles.meta}>Source</Text>
                  <Text numberOfLines={1} style={styles.reviewSourceMeta}>{captureSourceLabel(selected)}</Text>
                </Pressable>
                <View style={styles.sourceDisclosureActions}>
                  {selected.sourceUrl ? (
                    <IconButton
                      Icon={ExternalLink}
                      label="Open source"
                      onPress={() => void Linking.openURL(selected.sourceUrl || "")}
                    />
                  ) : null}
                  {sourceValue ? (
                    <IconButton Icon={Copy} label="Copy source" onPress={() => void copySource()} />
                  ) : null}
                  {sourceValue ? (
                    <IconButton
                      Icon={MoreHorizontal}
                      label={sourceExpanded ? "Hide source details" : "Show source details"}
                      onPress={() => setSourceExpanded((current) => !current)}
                    />
                  ) : null}
                </View>
              </View>
              {sourceExpanded && sourceValue ? (
                <Text selectable style={styles.sourceText}>{sourceValue}</Text>
              ) : null}
            </View>
            <Pressable
              onPress={confirmArchive}
              style={({ pressed }) => [styles.destructiveRow, pressed && styles.subtlePressed]}
              testID="pc.capture.archive-toggle"
            >
              <Archive color={selectedArchived ? colors.ink : colors.danger} size={18} strokeWidth={2.2} />
              <Text style={selectedArchived ? styles.secondaryButtonText : styles.dangerButtonText}>
                {selectedArchived ? "Restore capture" : "Archive capture"}
              </Text>
            </Pressable>
            {message ? <Text style={styles.message}>{message}</Text> : null}
          </ScrollView>
          {showReviewFooter ? (
          <View style={styles.reviewFooter}>
              <Pressable
                disabled={collectionActionPending}
                onPress={() => void saveReviewDecisions()}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && !collectionActionPending && styles.primaryButtonPressed,
                  collectionActionPending && styles.disabledButton
                ]}
                testID="pc.review.save"
              >
                <Text style={styles.primaryButtonText}>
                  {collectionActionPending ? "Updating collection..." : "Save review"}
                </Text>
              </Pressable>
          </View>
          ) : null}
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
                <IconButton Icon={ArrowLeft} label="Back" onPress={() => setSearchOpen(false)} />
                <View style={styles.searchInputWrap}>
                  <Search color={colors.muted} size={19} strokeWidth={2.3} />
                  <TextInput
                    autoFocus
                    onChangeText={setSearchQuery}
                    placeholder="Search saved things"
                    placeholderTextColor={colors.muted}
                    returnKeyType="search"
                    style={styles.searchInputNative}
                    testID="pc.search.input"
                    value={searchQuery}
                  />
                  {searchQuery ? (
                    <Pressable
                      accessibilityLabel="Clear search"
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => setSearchQuery("")}
                    >
                      <X color={colors.muted} size={18} strokeWidth={2.4} />
                    </Pressable>
                  ) : null}
                </View>
                <IconButton
                  Icon={SlidersHorizontal}
                  label="Search filters"
                  onPress={() => setSearchScopeOpen((current) => !current)}
                  selected={searchScopeOpen}
                />
              </View>
              {showSearchScopes ? (
              <View style={styles.searchAssistRow}>
                <Text style={styles.searchScopeLabel}>
                  {searchScope === "active"
                    ? "Active captures"
                    : searchScope === "archived"
                      ? "Archived captures"
                      : "All captures"}
                </Text>
                <View style={styles.scopeRow}>
                  {(["active", "archived", "all"] as const).map((scope) => (
                    <Pressable
                      key={scope}
                      onPress={() => setSearchScope(scope)}
                      style={({ pressed }) => [
                        styles.scopeChip,
                        searchScope === scope && styles.scopeChipSelected,
                        pressed && styles.subtlePressed
                      ]}
                      testID={`pc.search.scope.${scope}`}
                    >
                      <Text style={[styles.scopeChipText, searchScope === scope && styles.scopeChipTextSelected]}>
                        {scope === "active" ? "Active" : scope === "archived" ? "Archived" : "All"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              ) : null}
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
                    {!searchQuery.trim() && searchScope === "active" ? (
                      <View style={styles.promptChips}>
                        {SEARCH_PROMPTS.map(({ label, query, Icon }) => (
                          <Pressable
                            key={query}
                            onPress={() => setSearchQuery(query)}
                            style={({ pressed }) => [styles.promptChip, pressed && styles.subtlePressed]}
                          >
                            <Icon color={colors.muted} size={15} strokeWidth={2.2} />
                            <Text style={styles.promptChipText}>{label}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
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
  const captureSheetKeyboardOffset = Platform.OS === "android" && showCaptureComposer ? keyboardHeight : 0;
  const captureSheetMaxHeight = captureSheetKeyboardOffset
    ? Math.max(220, windowHeight - captureSheetKeyboardOffset - 40)
    : undefined;

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
              <IconButton Icon={Settings} label="Account and settings" onPress={openAccountActions} />
            ) : null}
          </View>
          {quickLookCount ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const first = homeCaptures.find((capture) => displayStatus(capture) === "needs_review" || displayStatus(capture) === "failed");
                if (first) openCapture(first.id);
              }}
              style={({ pressed }) => [styles.quickLookSummary, pressed && styles.subtlePressed]}
              testID="pc.home.quick-look"
            >
              <Info color={colors.review} size={15} strokeWidth={2.4} />
              <Text style={styles.quickLookSummaryText}>
                {quickLookCount === 1 ? "1 needs a quick look" : `${quickLookCount} need a quick look`}
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.homeActionRow}>
            <Pressable
              android_ripple={{ color: "rgba(31, 122, 91, 0.08)" }}
              onPress={openSearch}
              style={({ pressed }) => [styles.searchAffordance, pressed && styles.subtlePressed]}
              testID="pc.home.search"
            >
              <Search color={colors.muted} size={20} strokeWidth={2.3} />
              <View style={styles.searchAffordanceCopy}>
                <Text style={styles.searchAffordanceText}>Search anything you saved</Text>
                <Text numberOfLines={1} style={styles.searchAffordanceMeta}>
                  Places, notes, sources, collections
                </Text>
              </View>
              <SlidersHorizontal color={colors.accent} size={18} strokeWidth={2.3} />
            </Pressable>
            <Pressable
              android_ripple={{ color: "rgba(31, 122, 91, 0.10)" }}
              accessibilityLabel="Paste link or note"
              onPress={() => setShowCaptureComposer(true)}
              style={({ pressed }) => [styles.fallbackCaptureToggle, pressed && styles.subtlePressed]}
              testID="pc.capture.open"
            >
              <Plus color={colors.paper} size={25} strokeWidth={2.4} />
            </Pressable>
          </View>
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
      {showCaptureComposer ? (
        <View style={styles.sheetLayer} pointerEvents="box-none">
          <Pressable
            accessibilityLabel="Close capture composer"
            onPress={() => setShowCaptureComposer(false)}
            style={styles.sheetBackdrop}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            pointerEvents="box-none"
            style={styles.sheetKeyboard}
          >
            <Animated.View
              style={[
                styles.captureSheet,
                {
                  marginBottom: captureSheetKeyboardOffset,
                  maxHeight: captureSheetMaxHeight,
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
                  <Text style={styles.sheetTitle}>New capture</Text>
                </View>
                <View style={styles.sheetActions}>
                  <IconButton Icon={X} label="Close" onPress={() => setShowCaptureComposer(false)} />
                  <IconButton
                    Icon={Check}
                    label={savingCapture ? "Saving capture" : "Save capture"}
                    disabled={savingCapture || !sourceDraft.trim()}
                    onPress={() => void saveCaptureSource()}
                    tone="primary"
                    testID="pc.capture.save"
                  />
                </View>
              </View>
              <ScrollView
                contentContainerStyle={styles.captureSheetBodyContent}
                keyboardShouldPersistTaps="handled"
                style={styles.captureSheetBody}
              >
                <TextInput
                  autoFocus
                  multiline
                  onChangeText={setSourceDraft}
                  placeholder="Paste a link or note"
                  placeholderTextColor={colors.muted}
                  style={styles.captureInput}
                  testID="pc.capture.source"
                  value={sourceDraft}
                />
                {showCaptureContext ? (
                  <TextInput
                    multiline
                    onChangeText={setSourceContextDraft}
                    placeholder="Why did you save this?"
                    placeholderTextColor={colors.muted}
                    style={styles.captureContextInput}
                    testID="pc.capture.context"
                    value={sourceContextDraft}
                  />
                ) : (
                  <Pressable
                    onPress={() => setShowCaptureContext(true)}
                    style={({ pressed }) => [styles.addContextButton, pressed && styles.subtlePressed]}
                  >
                    <Plus color={colors.muted} size={16} strokeWidth={2.3} />
                    <Text style={styles.inlineAction}>Add context</Text>
                  </Pressable>
                )}
              </ScrollView>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      ) : null}
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
    letterSpacing: 0
  },
  title: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 31
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44
  },
  iconButtonSelected: {
    backgroundColor: colors.accentSoft
  },
  iconButtonDisabled: {
    opacity: 0.42
  },
  quickLookSummary: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.reviewSoft,
    borderRadius: 8,
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
    minHeight: 36,
    paddingHorizontal: 10
  },
  quickLookSummaryText: {
    color: colors.review,
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
    backgroundColor: colors.soft,
    borderColor: "transparent",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 10
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
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20
  },
  searchAffordanceMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17
  },
  searchAffordanceAction: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "800"
  },
  fallbackCaptureToggle: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 28,
    justifyContent: "center",
    minHeight: 56,
    width: 56
  },
  searchScreen: {
    flex: 1
  },
  searchTop: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 6
  },
  searchBarRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  searchInputWrap: {
    alignItems: "center",
    backgroundColor: colors.soft,
    borderRadius: 8,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 50,
    paddingHorizontal: 12
  },
  searchInputNative: {
    color: colors.ink,
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    minHeight: 48,
    paddingVertical: 10
  },
  searchAssistRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    paddingTop: 8
  },
  searchScopeLabel: {
    color: colors.muted,
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15
  },
  scopeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4
  },
  scopeChip: {
    alignItems: "center",
    borderRadius: 6,
    justifyContent: "center",
    minHeight: 28,
    paddingHorizontal: 7
  },
  scopeChipSelected: {
    backgroundColor: colors.soft
  },
  scopeChipText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700"
  },
  scopeChipTextSelected: {
    color: colors.ink
  },
  captureInput: {
    backgroundColor: colors.soft,
    borderRadius: 8,
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
    minHeight: 74,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: "top"
  },
  captureContextInput: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 21,
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 10,
    textAlignVertical: "top"
  },
  addContextButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 2
  },
  sheetLayer: {
    bottom: 0,
    justifyContent: "flex-end",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  sheetBackdrop: {
    backgroundColor: "rgba(29, 33, 31, 0.18)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  sheetKeyboard: {
    flex: 1,
    justifyContent: "flex-end",
    width: "100%"
  },
  captureSheet: {
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 14,
    paddingBottom: Platform.OS === "android" ? 18 : 26,
    paddingHorizontal: 22,
    paddingTop: 8
  },
  captureSheetBody: {
    flexShrink: 1
  },
  captureSheetBodyContent: {
    gap: 14,
    paddingBottom: 2
  },
  sheetGrabber: {
    alignSelf: "center",
    backgroundColor: colors.line,
    borderRadius: 3,
    height: 5,
    width: 44
  },
  captureSheetHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  sheetActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  listContent: {
    paddingBottom: 40,
    paddingTop: 0
  },
  searchResultsContent: {
    paddingBottom: 180,
    paddingTop: 4,
    paddingHorizontal: 22
  },
  searchEmptyContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 28
  },
  groupHeader: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    paddingBottom: 2,
    paddingTop: 16
  },
  captureRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    minHeight: 76,
    paddingHorizontal: 0,
    paddingVertical: 14
  },
  captureRowPressed: {
    backgroundColor: "rgba(31, 122, 91, 0.06)",
    borderRadius: 8,
    transform: [{ scale: 0.995 }]
  },
  subtlePressed: {
    backgroundColor: colors.soft,
    transform: [{ scale: 0.985 }]
  },
  darkButtonPressed: {
    backgroundColor: "#2a302d",
    transform: [{ scale: 0.985 }]
  },
  sourceMark: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderColor: "#c6dfd4",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 38,
    justifyContent: "center",
    marginTop: 2,
    overflow: "hidden",
    width: 38
  },
  sourceMarkDetail: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderColor: "#c6dfd4",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 28,
    justifyContent: "center",
    overflow: "hidden",
    width: 28
  },
  sourceMarkProcessing: {
    backgroundColor: "#e6edf3",
    borderColor: "#cbd7e2"
  },
  sourceMarkReview: {
    backgroundColor: colors.reviewSoft,
    borderColor: "#e0d3b8"
  },
  sourceMarkFailed: {
    backgroundColor: "#f5e9e6",
    borderColor: "#e5c8c1"
  },
  sourceFavicon: {
    height: 22,
    width: 22
  },
  sourceFaviconDetail: {
    height: 16,
    width: 16
  },
  sourceFaviconOverlay: {
    position: "absolute"
  },
  statusGlyph: {
    alignItems: "center",
    backgroundColor: colors.soft,
    borderRadius: 8,
    flexShrink: 0,
    height: 28,
    justifyContent: "center",
    width: 28
  },
  statusGlyphProcessing: {
    backgroundColor: "#e6edf3"
  },
  statusGlyphReview: {
    backgroundColor: colors.reviewSoft
  },
  statusGlyphFailed: {
    backgroundColor: "#f5e9e6"
  },
  statusGlyphArchived: {
    backgroundColor: "#eef1ee"
  },
  rowContent: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  rowTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  rowTitleLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  captureTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 22
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
  notePreview: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 21
  },
  summaryPreview: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  supportPreview: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19
  },
  rowMeaningLine: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 1
  },
  meaningToken: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    maxWidth: "100%"
  },
  meaningTokenText: {
    color: colors.muted,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
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
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8
  },
  emptyText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 280
  },
  promptChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    maxWidth: 320,
    paddingTop: 10
  },
  promptChip: {
    alignItems: "center",
    backgroundColor: colors.soft,
    borderRadius: 8,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12
  },
  promptChipText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700"
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
  collectionRow: {
    gap: 7,
    minHeight: 74,
    paddingVertical: 15
  },
  collectionRowTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  collectionIconMark: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  collectionRowCopy: {
    flex: 1,
    minWidth: 0
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
  collectionsScreen: {
    flex: 1,
    gap: 14,
    paddingHorizontal: 22,
    paddingTop: 16
  },
  collectionsTitleBlock: {
    gap: 6
  },
  collectionModeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  collectionModeChip: {
    minHeight: 34,
    paddingHorizontal: 10
  },
  collectionCreatePanel: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    padding: 12
  },
  collectionsListContent: {
    paddingBottom: 40
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
  reviewDetailNoFooter: {
    paddingBottom: 44
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
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 14,
    padding: 14
  },
  reviewTitleInput: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 28,
    padding: 0
  },
  reviewSourceRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 30
  },
  reviewSourceMeta: {
    color: colors.muted,
    flex: 1,
    fontSize: 13,
    lineHeight: 18
  },
  reviewSentence: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 2
  },
  reviewPhrase: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    maxWidth: "100%"
  },
  reviewSentenceText: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: "700",
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
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20
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
    fontWeight: "700"
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
  collectionInlineActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
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
  compactActionRow: {
    alignItems: "center",
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: 12
  },
  compactActionText: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: "700"
  },
  sourceDisclosureRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    minHeight: 50
  },
  sourceDisclosureCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  sourceDisclosureActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2
  },
  destructiveRow: {
    alignItems: "center",
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    minHeight: 52,
    paddingTop: 12
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
  primaryButtonPressed: {
    backgroundColor: "#2a302d",
    transform: [{ scale: 0.99 }]
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
