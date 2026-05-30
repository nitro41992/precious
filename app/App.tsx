import "react-native-url-polyfill/auto";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
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
import { Image } from "expo-image";
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
  LogOut,
  MapPin,
  Pencil,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  StickyNote,
  X
} from "lucide-react-native";
import Svg, { Circle, Path } from "react-native-svg";

import saveIntents from "../supabase/functions/_shared/save-intents.json";
import type { MapSearchCandidate } from "./captureLogic";
import {
  LOCAL_PROCESSING_GRACE_MS,
  confidenceRequiresReview,
  displayStatus,
  extractHttpUrl,
  hostFromUrl,
  isArchived,
  mapSearchCandidates,
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
  image_url?: string;
};

type Capture = {
  id: string;
  remoteId?: string;
  title: string;
  sourceText: string;
  sourceUrl: string | null;
  siteName?: string;
  summary?: string;
  captureType?: string;
  thumbnailUrl?: string;
  imageAssetUrl?: string;
  imageAssetCacheKey?: string;
  imageAssetMimeType?: string;
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
  visitTarget?: VisitTarget | null;
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
  linkedAt?: number | null;
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

type VisitTarget = {
  name: string;
  query: string;
  confidence: "high" | "medium" | "low";
  evidence: string[];
  verifiedPlace: boolean;
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
type CaptureComposerMode = "link" | "note" | "image";
const DEFAULT_CAPTURE_COMPOSER_MODE: CaptureComposerMode = "link";

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
  captureImage?: () => Promise<string | null>;
  submitExpandedUrl?: (id: string, expandedUrl: string) => Promise<string>;
  getCaptures: () => Promise<string>;
  getCachedCapturePage?: (userId: string, mode: "active" | "archived") => Promise<string | null>;
  setCachedCapturePage?: (
    userId: string,
    mode: "active" | "archived",
    capturesJson: string,
    nextCursor: string | null
  ) => Promise<boolean>;
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
type CollectionCapturesLoadPhase = "idle" | "initial" | "refresh" | "append";
type CaptureImageLoadState = "loaded" | "failed";
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
const CAPTURE_PAGE_SIZE = 18;
const COLLECTION_CAPTURE_PAGE_SIZE = 18;
const RECENT_FEED_REVEAL_COUNT = 8;
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
type NavIconProps = {
  color: string;
  selected?: boolean;
  size?: number;
};
type NavIconComponent = ComponentType<NavIconProps>;

const SETTINGS_ICON_PATH = "M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.37-.31-.6-.22l-2.49 1a7.28 7.28 0 0 0-1.69-.98l-.38-2.65A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.5.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1a.5.5 0 0 0-.6.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65c-.05.32-.08.65-.08.98s.03.66.08.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46c.12.22.37.31.6.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.48 0 .6-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z";

function RecentNavIcon({ color, selected = false, size = 24 }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {selected ? (
        <Path
          d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5h-2v6l5.25 3.15.75-1.23-4-2.37V7Z"
          fill={color}
          fillRule="evenodd"
          clipRule="evenodd"
        />
      ) : (
        <>
          <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth="2.1" />
          <Path
            d="M12 7.2v5.1l3.55 2.13"
            stroke={color}
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </Svg>
  );
}

function CollectionsNavIcon({ color, selected = false, size = 24 }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {selected ? (
        <Path
          d="M3 6.75A2.75 2.75 0 0 1 5.75 4h3.42c.78 0 1.51.35 2 .95l1.05 1.3h6.03A2.75 2.75 0 0 1 21 9v7.25A2.75 2.75 0 0 1 18.25 19H5.75A2.75 2.75 0 0 1 3 16.25v-9.5Z"
          fill={color}
        />
      ) : (
        <Path
          d="M3.5 6.9A2.4 2.4 0 0 1 5.9 4.5h3.18c.68 0 1.33.31 1.77.84l1.13 1.36h6.12a2.4 2.4 0 0 1 2.4 2.4v7a2.4 2.4 0 0 1-2.4 2.4H5.9a2.4 2.4 0 0 1-2.4-2.4V6.9Z"
          stroke={color}
          strokeWidth="2.1"
          strokeLinejoin="round"
        />
      )}
    </Svg>
  );
}

function SettingsNavIcon({ color, selected = false, size = 24 }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={SETTINGS_ICON_PATH}
        fill={selected ? color : "none"}
        stroke={selected ? "none" : color}
        strokeWidth={selected ? 0 : 1.35}
        strokeLinejoin="round"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </Svg>
  );
}

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

function remoteImageAsset(row: Record<string, any>) {
  const assets = Array.isArray(row.capture_assets) ? row.capture_assets : [];
  return assets.find((asset) => {
    const mimeType = String(asset?.mime_type || asset?.mimeType || "");
    const url = asset?.signed_url || asset?.signedUrl || asset?.public_url || asset?.publicUrl;
    const storagePath = asset?.storage_path || asset?.storagePath;
    return mimeType.startsWith("image/") && Boolean((typeof url === "string" && url.trim()) || storagePath);
  });
}

function captureImageUrl(capture: Capture) {
  return (
    capture.imageAssetUrl ||
    capture.thumbnailUrl ||
    capture.urlEvidence?.image_url ||
    ""
  );
}

function captureImageLoadKey(capture: Capture) {
  const imageUri = captureImageUrl(capture);
  return imageUri ? capture.imageAssetCacheKey || imageUri : "";
}

function captureRowRevealKey(capture: Capture) {
  return capture.id;
}

function isImageCapture(capture: Capture) {
  const captureType = String(capture.captureType || "").toLowerCase();
  const mimeType = String(capture.imageAssetMimeType || "").toLowerCase();
  const sourceText = String(capture.sourceText || "").trim();
  return (
    captureType === "image" ||
    captureType === "screenshot" ||
    (captureType === "mixed" && mimeType.startsWith("image/")) ||
    mimeType.startsWith("image/") ||
    /^(selected|shared)\s+(image|screenshot):/i.test(sourceText)
  );
}

function shouldGhostSourceMark(capture: Capture) {
  if (captureImageUrl(capture)) return false;
  if (isImageCapture(capture) && displayStatus(capture) !== "failed") return true;
  return displayStatus(capture) === "processing";
}

function captureOpenUrl(capture: Capture) {
  return capture.sourceUrl || extractHttpUrl(capture.sourceText) || "";
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

function reviewStatusCue(capture: Capture, hasReviewReasons: boolean) {
  if (displayStatus(capture) === "processing") return "Checking source";
  if (displayStatus(capture) === "failed") return "Needs a quick look";
  if (hasReviewReasons) return "Needs a quick look";
  return "Ready";
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

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
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
    capture.visitTarget?.name,
    capture.visitTarget?.query,
    capture.visitTarget?.confidence,
    ...(capture.visitTarget?.evidence || []),
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
  if (matches([
    capture.visitTarget?.name,
    capture.visitTarget?.query,
    ...(capture.visitTarget?.evidence || [])
  ])) {
    return "Matched visit target";
  }
  if (matches((capture.linkedCollections || []).flatMap((collection) => [collection.title, collection.description]))) {
    return "Matched collection";
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

function linkedCollectionsLabel(collections: LinkedCollection[]) {
  if (!collections.length) return "Add collections";
  if (collections.length === 1) return collections[0].title;
  return `${collections[0].title} +${collections.length - 1}`;
}

function collectionCountLabel(count: number) {
  return `${count} ${count === 1 ? "capture" : "captures"}`;
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
  const hasChanges = Boolean(
    next.titleDirty ||
      next.noteDirty ||
      next.intentDirty ||
      next.reminders
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

function isCaptureImageCancel(error: unknown) {
  if (!error) return true;
  const message = error instanceof Error ? error.message : String(error || "");
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";
  return /capture_image_missing|No image was selected/i.test(`${code} ${message}`);
}

function captureFromRemote(row: Record<string, any>): Capture {
  const analysis = row.analysis ?? {};
  const defaultIntent = analysis.default_intent ?? {};
  const imageAsset = remoteImageAsset(row);
  const assetUrl = imageAsset
    ? nullableValue(imageAsset.signed_url || imageAsset.signedUrl || imageAsset.public_url || imageAsset.publicUrl)
    : undefined;
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
    captureType: nullableValue(row.capture_type || row.captureType || analysis.capture_type),
    thumbnailUrl: nullableValue(row.thumbnail_url || row.thumbnailUrl || analysis.thumbnail_url),
    imageAssetUrl: assetUrl,
    imageAssetCacheKey: imageAsset
      ? nullableValue(imageAsset.signed_url_cache_key || imageAsset.signedUrlCacheKey)
      : undefined,
    imageAssetMimeType: imageAsset ? nullableValue(imageAsset.mime_type || imageAsset.mimeType) : undefined,
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
          confidenceRequiresReview(analysis.confidence_label))
    ),
    entities: analysis.entities || [],
    visitTarget: visitTargetFromRemote(analysis),
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

function nullableTimestamp(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function visitTargetFromRemote(analysis: Record<string, any>): VisitTarget | null {
  const name = nullableValue(analysis.visit_target_name);
  const query = nullableValue(analysis.visit_target_query);
  const confidence = analysis.visit_target_confidence;
  if (!name || !query || !["high", "medium", "low"].includes(confidence)) return null;
  return {
    name,
    query,
    confidence,
    evidence: Array.isArray(analysis.visit_target_evidence)
      ? analysis.visit_target_evidence.map(String).filter(Boolean)
      : [],
    verifiedPlace: analysis.verified_place === true
  };
}

function isEdgeCaptureApi(apiUrl: string) {
  return apiUrl.includes("/functions/v1/");
}

function captureListUrl(apiUrl: string, archived = false, params: { limit?: number; before?: string | null } = {}) {
  const url = new URL(isEdgeCaptureApi(apiUrl) ? apiUrl : `${apiUrl}/api/captures`);
  if (!isEdgeCaptureApi(apiUrl)) url.searchParams.set("view", "summary");
  url.searchParams.set("limit", String(params.limit || CAPTURE_PAGE_SIZE));
  url.searchParams.set("archived", archived ? "true" : "false");
  if (params.before) url.searchParams.set("before", params.before);
  return url.toString();
}

function captureMutationUrl(apiUrl: string) {
  return isEdgeCaptureApi(apiUrl) ? apiUrl : `${apiUrl}/api/captures`;
}

function captureDetailUrl(apiUrl: string, captureRef: string) {
  const url = new URL(isEdgeCaptureApi(apiUrl) ? apiUrl : `${apiUrl}/api/captures`);
  url.searchParams.set("clientCaptureKey", captureRef);
  return url.toString();
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
    confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : null,
    linkedAt: nullableTimestamp(row.linked_at || row.linkedAt)
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

function cachedCapturePageFromRaw(raw: string | null | undefined) {
  if (!raw) return { captures: [] as Capture[], nextCursor: null as string | null };
  try {
    const parsed = JSON.parse(raw) as { captures?: unknown; next_cursor?: unknown; nextCursor?: unknown };
    const captures = Array.isArray(parsed.captures)
      ? parsed.captures
          .filter((item): item is Capture => {
            if (!item || typeof item !== "object") return false;
            const capture = item as Partial<Capture>;
            return typeof capture.id === "string" && Number.isFinite(Number(capture.createdAt));
          })
          .map((capture) => ({
            ...capture,
            createdAt: Number(capture.createdAt),
            updatedAt: Number(capture.updatedAt || capture.createdAt),
            processedAt: capture.processedAt ? Number(capture.processedAt) : null
          }))
      : [];
    return {
      captures,
      nextCursor: nullableValue(parsed.next_cursor || parsed.nextCursor) || null
    };
  } catch {
    return { captures: [] as Capture[], nextCursor: null as string | null };
  }
}

function freshLocalProcessingCaptures(raw: string | null | undefined) {
  if (!raw) return [] as Capture[];
  try {
    const now = Date.now();
    const captures = JSON.parse(raw || "[]") as Capture[];
    return sortCaptures(captures.filter((capture) => isFreshLocalProcessingCapture(capture, now)));
  } catch {
    return [];
  }
}

function isFreshLocalProcessingCapture(capture: Capture, now = Date.now()) {
  return (
    !isArchived(capture) &&
    displayStatus(capture) === "processing" &&
    now - capture.createdAt < LOCAL_PROCESSING_GRACE_MS
  );
}

function captureBelongsToCollection(capture: Capture, collectionId: string) {
  return (capture.linkedCollections || []).some((collection) => collection.id === collectionId);
}

function collectionLinkTimestamp(capture: Capture, collectionId: string) {
  const linkedCollection = (capture.linkedCollections || []).find((collection) => collection.id === collectionId);
  return nullableTimestamp(linkedCollection?.linkedAt);
}

function sortCollectionCaptures(captures: Capture[], collectionId: string) {
  return uniqueCaptures(captures).sort((left, right) => {
    const rightLinkedAt = collectionLinkTimestamp(right, collectionId) || 0;
    const leftLinkedAt = collectionLinkTimestamp(left, collectionId) || 0;
    if (rightLinkedAt !== leftLinkedAt) return rightLinkedAt - leftLinkedAt;
    return right.createdAt - left.createdAt;
  });
}

function sameStringSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
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

function SkeletonRevealFrame({
  children,
  pending,
  skeleton
}: {
  children: ReactNode;
  pending: boolean;
  skeleton: ReactNode;
}) {
  const contentOpacity = useRef(new Animated.Value(pending ? 0 : 1)).current;
  const skeletonOpacity = useRef(new Animated.Value(pending ? 1 : 0)).current;
  const [showSkeleton, setShowSkeleton] = useState(pending);

  useEffect(() => {
    if (pending) {
      setShowSkeleton(true);
      contentOpacity.setValue(0);
      skeletonOpacity.setValue(1);
      return;
    }
    const animation = Animated.parallel([
      Animated.timing(contentOpacity, {
        duration: 150,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true
      }),
      Animated.timing(skeletonOpacity, {
        duration: 170,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true
      })
    ]);
    animation.start(({ finished }) => {
      if (finished) setShowSkeleton(false);
    });
    return () => animation.stop();
  }, [contentOpacity, pending, skeletonOpacity]);

  return (
    <View style={styles.skeletonRevealFrame}>
      <Animated.View
        accessibilityElementsHidden={pending}
        importantForAccessibility={pending ? "no-hide-descendants" : "auto"}
        pointerEvents={pending ? "none" : "auto"}
        style={{ opacity: contentOpacity }}
      >
        {children}
      </Animated.View>
      {showSkeleton ? (
        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={[styles.skeletonRevealOverlay, { opacity: skeletonOpacity }]}
        >
          {skeleton}
        </Animated.View>
      ) : null}
    </View>
  );
}

function SourceMark({
  capture,
  failedFavicons,
  imageLoadKey = "",
  imageUnavailable = false,
  onFaviconFailure,
  onImageLoadState,
  size = "row"
}: {
  capture: Capture;
  failedFavicons: Record<string, boolean>;
  imageLoadKey?: string;
  imageUnavailable?: boolean;
  onFaviconFailure: (host: string) => void;
  onImageLoadState?: (key: string, state: CaptureImageLoadState) => void;
  size?: "row" | "detail";
}) {
  const host = captureSourceHost(capture).replace(/^www\./i, "");
  const faviconUri = size === "detail" && !isMapSource(capture) && !failedFavicons[host] ? sourceFaviconUrl(host) : "";
  const imageUri = size === "row" && !imageUnavailable ? captureImageUrl(capture) : "";
  const Icon = sourceIconForCapture(capture);
  const itemStatus = displayStatus(capture);
  const markStyle = size === "detail" ? styles.sourceMarkDetail : styles.sourceMark;
  const iconSize = size === "detail" ? 16 : 20;
  if (imageUri) {
    return (
      <View
        accessibilityLabel={host ? `Image from ${host}` : "Capture image"}
        accessible
        style={styles.captureThumbnailFrame}
      >
        <Image
          cachePolicy="memory-disk"
          contentFit="cover"
          onError={() => {
            if (imageLoadKey) onImageLoadState?.(imageLoadKey, "failed");
          }}
          onLoad={() => {
            if (imageLoadKey) onImageLoadState?.(imageLoadKey, "loaded");
          }}
          source={imageLoadKey ? { uri: imageUri, cacheKey: imageLoadKey } : { uri: imageUri }}
          style={styles.captureThumbnailImage}
          transition={90}
        />
      </View>
    );
  }
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
          cachePolicy="memory-disk"
          contentFit="contain"
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
  const [activeCapturesLoadedOnce, setActiveCapturesLoadedOnce] = useState(false);
  const [archivedCapturesLoading, setArchivedCapturesLoading] = useState(false);
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
  const [remoteSearchError, setRemoteSearchError] = useState("");
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [collectionsMode, setCollectionsMode] = useState<CollectionListMode>("active");
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectionsError, setCollectionsError] = useState("");
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
  const [rationaleSheet, setRationaleSheet] = useState<{ title: string; text: string } | null>(null);
  const [archiveCaptureConfirmOpen, setArchiveCaptureConfirmOpen] = useState(false);
  const [archiveCollectionTarget, setArchiveCollectionTarget] = useState<Collection | null>(null);
  const [faviconFailures, setFaviconFailures] = useState<Record<string, boolean>>({});
  const [savingCapture, setSavingCapture] = useState(false);
  const [pickingCaptureImage, setPickingCaptureImage] = useState(false);
  const [captureImageLoadStates, setCaptureImageLoadStates] = useState<Record<string, CaptureImageLoadState>>({});
  const [captureRowRevealStates, setCaptureRowRevealStates] = useState<Record<string, boolean>>({});
  const [homeFeedReadyKey, setHomeFeedReadyKey] = useState("");
  const [collectionFeedReadyKey, setCollectionFeedReadyKey] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState<"signin" | "signup" | null>(null);
  const latestNoteRef = useRef("");
  const capturesRef = useRef<Capture[]>([]);
  const archivedCapturesRef = useRef<Capture[]>([]);
  const capturePageCacheHydratedRef = useRef<Record<CaptureListMode, string | null>>({ active: null, archived: null });
  const collectionsCacheRef = useRef<Record<CollectionListMode, Collection[]>>({ active: [], archived: [] });
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
    if (!page.captures.length) return false;
    const rows = sortCaptures(
      page.captures.filter((capture) => mode === "archived" ? isArchived(capture) : !isArchived(capture))
    );
    if (!rows.length) return false;
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
      commitCaptureRows("active", (current) => sortCaptures(uniqueCaptures([...current, ...rows])));
      setCapturesNextCursor(page.nextCursor);
      return true;
    }
    return false;
  }

  async function hydrateLocalProcessingCaptures() {
    if (!nativeStore?.getCaptures) return;
    const raw = await nativeStore.getCaptures().catch(() => null);
    const localProcessing = freshLocalProcessingCaptures(raw);
    if (!localProcessing.length) return;
    commitCaptureRows("active", (current) => sortCaptures(uniqueCaptures([...localProcessing, ...current])));
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
      setActiveCapturesLoadedOnce(false);
      setArchivedCapturesLoaded(false);
      setCapturesNextCursor(null);
      setArchivedCapturesNextCursor(null);
      capturesRef.current = [];
      archivedCapturesRef.current = [];
      capturePageCacheHydratedRef.current = { active: null, archived: null };
      setCollections([]);
      collectionsCacheRef.current = { active: [], archived: [] };
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

  const loadCaptures = useCallback(async (
    mode: CaptureListMode = "active",
    options: { append?: boolean; before?: string | null } = {}
  ) => {
    const loadingSetter = mode === "archived" ? setArchivedCapturesLoading : setCapturesLoading;
    const errorSetter = mode === "archived" ? setArchivedCapturesError : setCapturesError;
    loadingSetter(true);
    errorSetter("");
    if (!options.append) {
      await hydrateCachedCapturePage(mode);
      if (mode === "active") await hydrateLocalProcessingCaptures();
    }
    if (config?.apiUrl && session?.accessToken) {
      try {
        const activeSession = await getFreshSession();
        if (!activeSession?.accessToken) throw new Error("Your session expired. Sign in again.");
        const loadWithToken = (accessToken: string) =>
          requestJson<{ captures?: Array<Record<string, any>>; next_cursor?: string | null }>(
            captureListUrl(config.apiUrl, mode === "archived", { before: options.before }),
            {
            headers: {
              accept: "application/json",
              apikey: config.supabaseAnonKey,
              authorization: `Bearer ${accessToken}`
            }
          });
        let json: { captures?: Array<Record<string, any>>; next_cursor?: string | null };
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
      } catch (error) {
        errorSetter(friendlyError(error, mode === "archived" ? "Could not load archived captures" : "Could not load captures"));
        throw error;
      } finally {
        loadingSetter(false);
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
    } catch (error) {
      const text = friendlyError(error, mode === "archived" ? "Could not load archived captures" : "Could not load captures");
      errorSetter(text);
      setMessage(text);
      throw error;
    } finally {
      loadingSetter(false);
      if (mode === "active" && !options.append) setActiveCapturesLoadedOnce(true);
    }
  }, [config, getFreshSession, session]);

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

  const loadCollections = useCallback(async (mode: CollectionListMode = "active") => {
    if (!config?.apiUrl || !session?.accessToken) {
      setCollections([]);
      return;
    }
    const activeSession = await getFreshSession();
    if (!activeSession?.accessToken) throw new Error("Your session expired. Sign in again.");
    const loadWithToken = (accessToken: string) =>
      requestJson<{ collections?: Array<Record<string, any>>; next_cursor?: string | null }>(
        edgeResourceUrl(config.apiUrl, "collections", {
          archived: mode === "archived" ? "true" : "false",
          limit: "50"
        }),
        {
          headers: {
            accept: "application/json",
            apikey: config.supabaseAnonKey,
            authorization: `Bearer ${accessToken}`
          }
        }
      );
    let json: { collections?: Array<Record<string, any>>; next_cursor?: string | null };
    try {
      json = await loadWithToken(activeSession.accessToken);
    } catch (error) {
      if (!isAuthError(error)) throw error;
      const refreshed = await getFreshSession(true);
      if (!refreshed?.accessToken) throw new Error("Your session expired. Sign in again.");
      json = await loadWithToken(refreshed.accessToken);
    }
    const next = (json.collections ?? []).map(collectionFromRemote);
    collectionsCacheRef.current[mode] = next;
    setCollections(next);
  }, [config, getFreshSession, session]);

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
      const activeSession = await getFreshSession();
      if (!activeSession?.accessToken) throw new Error("Your session expired. Sign in again.");
      const loadWithToken = (accessToken: string) =>
        requestJson<{ captures?: Array<Record<string, any>>; next_cursor?: string | null }>(
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
        );
      let json: { captures?: Array<Record<string, any>>; next_cursor?: string | null };
      try {
        json = await loadWithToken(activeSession.accessToken);
      } catch (error) {
        if (!isAuthError(error)) throw error;
        const refreshed = await getFreshSession(true);
        if (!refreshed?.accessToken) throw new Error("Your session expired. Sign in again.");
        json = await loadWithToken(refreshed.accessToken);
      }
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
  }, [config, getFreshSession, session]);

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
      const activeSession = await getFreshSession();
      if (!activeSession?.accessToken) throw new Error("Your session expired. Sign in again.");
      const loadWithToken = (accessToken: string) =>
        requestJson<{ capture?: Record<string, any> }>(captureDetailUrl(config.apiUrl, captureRef), {
          headers: {
            accept: "application/json",
            apikey: config.supabaseAnonKey,
            authorization: `Bearer ${accessToken}`
          }
        });
      let json: { capture?: Record<string, any> };
      try {
        json = await loadWithToken(activeSession.accessToken);
      } catch (error) {
        if (!isAuthError(error)) throw error;
        const refreshed = await getFreshSession(true);
        if (!refreshed?.accessToken) throw new Error("Your session expired. Sign in again.");
        json = await loadWithToken(refreshed.accessToken);
      }
      if (!json.capture) return;
      applyUpdatedCapture(captureFromRemote(json.capture), capture.id);
    } catch (error) {
      captureDetailHydrationRef.current.delete(captureRef);
    }
  }, [config, getFreshSession, session]);

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
      setCollectionCapturesLoading(true);
      setCollectionCapturesLoadPhase(collectionCapturesCacheRef.current[collectionId]?.length ? "refresh" : "initial");
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
    if (cached.length) setCollections(cached);
    else setCollections([]);
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
    capturesRef.current = captures;
  }, [captures]);

  useEffect(() => {
    archivedCapturesRef.current = archivedCaptures;
  }, [archivedCaptures]);

  useEffect(() => {
    setActiveCapturesLoadedOnce(false);
    setHomeFeedReadyKey("");
    setCollectionFeedReadyKey("");
  }, [session?.userId]);

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
  const homeInitialLoading = capturesLoading && !activeCapturesLoadedOnce;
  const visibleHomeRows = homeRows;
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
  const homeFeedRevealPending = Boolean(homeFeedRevealKey && !homeFeedReadyKey);
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
  const collectionFeedRevealPending = Boolean(collectionFeedRevealKey && !collectionFeedReadyKey);
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
        collectionCapturesLoadPhase !== "append"
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
    if (collectionsLoading) {
      collectionListFade.setValue(0);
      return;
    }
    Animated.timing(collectionListFade, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true
    }).start();
  }, [collectionListFade, collections.length, collectionsLoading]);
  const searchPool = useMemo(() => {
    if (searchScope === "archived") return archivedCaptures;
    if (searchScope === "all") return uniqueCaptures([...captures, ...archivedCaptures]);
    return captures;
  }, [archivedCaptures, captures, searchScope]);
  const searchTerm = searchQuery.trim();
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
  const searchResults = remoteSearchActive && !remoteSearchError
    ? remoteSearchResults
    : localSearchResults;

  useEffect(() => {
    if (!remoteSearchActive || !config?.apiUrl || !session?.accessToken) {
      searchRequestSeqRef.current += 1;
      setRemoteSearchResults([]);
      setRemoteSearchLoading(false);
      setRemoteSearchError("");
      return;
    }
    const requestId = searchRequestSeqRef.current + 1;
    searchRequestSeqRef.current = requestId;
    setRemoteSearchLoading(true);
    setRemoteSearchError("");
    setRemoteSearchResults([]);
    const timer = setTimeout(() => {
      const run = async () => {
        try {
          const activeSession = await getFreshSession();
          if (!activeSession?.accessToken) throw new Error("Your session expired. Sign in again.");
          const loadWithToken = (accessToken: string) =>
            requestJson<{ captures?: Array<Record<string, any>> }>(
              edgeResourceUrl(config.apiUrl, "search", {
                q: searchTerm,
                scope: searchScope,
                limit: "50"
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
          if (searchRequestSeqRef.current !== requestId) return;
          setRemoteSearchResults((json.captures ?? []).map(captureFromRemote));
        } catch (error) {
          if (searchRequestSeqRef.current !== requestId) return;
          setRemoteSearchError(friendlyError(error, "Search is using local matches."));
          setRemoteSearchResults([]);
        } finally {
          if (searchRequestSeqRef.current === requestId) setRemoteSearchLoading(false);
        }
      };
      void run();
    }, 220);
    return () => clearTimeout(timer);
  }, [
    config?.apiUrl,
    config?.supabaseAnonKey,
    getFreshSession,
    remoteSearchActive,
    searchScope,
    searchTerm,
    session?.accessToken
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
  const selectedDraftKey = selected ? captureDraftKey(selected) : "";
  const selectedVisitTargetQuery = selected?.visitTarget?.query || "";

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
      savedDraft.intentDirty && savedDraft.intent
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
  }, [captureReturnCollectionId, loadCollectionCaptures, selectedCollection?.status, selectedCollectionId]);

  function showRationale(title: string, rationale: string | null | undefined) {
    const text = cleanSentence(rationale);
    if (!text) return;
    setRationaleSheet({ title, text });
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
    setCollectionsLoading(!collectionsCacheRef.current.active.length);
    try {
      await loadCollections("active");
    } catch (error) {
      setMessage(friendlyError(error, "Could not load collections."));
    } finally {
      setCollectionsLoading(false);
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
      setMessage("Saved. Checking the source now.");
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
      setMessage("Image saved. Checking the source now.");
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
    setActiveCapturesLoadedOnce(false);
    setArchivedCapturesLoaded(false);
    setCapturesNextCursor(null);
    setArchivedCapturesNextCursor(null);
    capturesRef.current = [];
    archivedCapturesRef.current = [];
    capturePageCacheHydratedRef.current = { active: null, archived: null };
    setCollections([]);
    collectionsCacheRef.current = { active: [], archived: [] };
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
    const {
      item,
      onPress,
      testID,
      matchReason,
      showCollectionToken = true,
      deferFallbackIcon = false,
      deferMediaUntilLoaded = false,
      forceSkeleton = false
    } = input;
    const imageLoadKey = captureImageLoadKey(item);
    const imageLoadState = imageLoadKey ? captureImageLoadStates[imageLoadKey] : undefined;
    const revealKey = captureRowRevealKey(item);
    const rowRevealed = Boolean(captureRowRevealStates[revealKey]);
    const deferRowUntilImageReady = Boolean(
      forceSkeleton ||
        (deferMediaUntilLoaded &&
          !rowRevealed &&
          (imageLoadKey ? !imageLoadState : true))
    );
    const itemSummary = consumerSummary(item);
    const supportLine = captureSupportLine(item, itemSummary);
    const intentLabel = captureIntentLabel(item);
    const collectionLabel = showCollectionToken ? item.linkedCollections?.[0]?.title || "" : "";
    const ghostSourceMark = deferFallbackIcon || shouldGhostSourceMark(item);
    const imageLoadingGhost = Boolean(
      !ghostSourceMark &&
        isImageCapture(item) &&
        imageLoadKey &&
        imageLoadState !== "loaded" &&
        imageLoadState !== "failed"
    );
    const sourceMark = (
      <SourceMark
        capture={item}
        failedFavicons={faviconFailures}
        imageLoadKey={imageLoadKey}
        imageUnavailable={imageLoadState === "failed"}
        onFaviconFailure={markFaviconFailed}
        onImageLoadState={markCaptureImageLoadState}
      />
    );
    const row = (
      <Pressable
        android_ripple={{ color: "rgba(31, 122, 91, 0.08)" }}
        onPress={onPress}
        style={({ pressed }) => [styles.captureRow, pressed && styles.captureRowPressed]}
        testID={testID}
      >
        {ghostSourceMark ? (
          <SkeletonBlock style={styles.loadingThumbnailMark} />
        ) : imageLoadingGhost ? (
          <View style={styles.thumbnailRevealSlot}>
            {sourceMark}
            <View pointerEvents="none" style={styles.thumbnailGhostOverlay}>
              <SkeletonBlock style={styles.loadingThumbnailMark} />
            </View>
          </View>
        ) : (
          sourceMark
        )}
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
    if (!deferMediaUntilLoaded) return row;
    return (
      <SkeletonRevealFrame pending={deferRowUntilImageReady} skeleton={renderCaptureRowInlineSkeleton()}>
        {row}
      </SkeletonRevealFrame>
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
      <Animated.View style={{ opacity: collectionListFade }}>
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
      </Animated.View>
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
    const body = (
      <>
        <SkeletonBlock style={styles.loadingThumbnailMark} />
        <View style={styles.captureRowSkeletonCopy}>
          <SkeletonBlock style={styles.collectionLoadingTitle} />
          <SkeletonBlock style={styles.collectionLoadingLine} />
          <SkeletonBlock style={styles.collectionLoadingLineShort} />
          <SkeletonBlock style={styles.collectionLoadingToken} />
        </View>
      </>
    );
    if (withRemoveAction) {
      return (
        <View style={styles.collectionCaptureSkeletonInline}>
          <View style={styles.collectionCaptureMain}>
            <View style={styles.captureRowSkeletonInline}>{body}</View>
          </View>
          <SkeletonBlock style={styles.collectionLoadingAction} />
        </View>
      );
    }
    return <View style={styles.captureRowSkeletonInline}>{body}</View>;
  }

  function renderCaptureSkeletonRow(withRemoveAction = false, key?: number) {
    return (
      <View key={key} style={withRemoveAction ? styles.collectionCaptureSkeletonRow : styles.captureSkeletonRow}>
        <View style={styles.collectionCaptureSkeletonMain}>
          <SkeletonBlock style={styles.loadingThumbnailMark} />
          <View style={styles.collectionCaptureSkeletonCopy}>
            <SkeletonBlock style={styles.collectionLoadingTitle} />
            <SkeletonBlock style={styles.collectionLoadingLine} />
            <SkeletonBlock style={styles.collectionLoadingLineShort} />
            <SkeletonBlock style={styles.collectionLoadingToken} />
          </View>
        </View>
        {withRemoveAction ? <SkeletonBlock style={styles.collectionLoadingAction} /> : null}
      </View>
    );
  }

  function renderCaptureSkeletonRows(count = 3, withRemoveAction = false) {
    return (
      <View style={styles.loadingRows}>
        {Array.from({ length: count }).map((_, item) => renderCaptureSkeletonRow(withRemoveAction, item))}
      </View>
    );
  }

  function collectionSkeletonDescriptionLines(collection: Collection | undefined, index: number) {
    if (collection) return String(collection.description || "").length > 58 ? 2 : 1;
    return index === 0 || index === 2 || index === 5 ? 2 : 1;
  }

  function renderCollectionSkeletonRows(count = 7, withSelectionControl = false, skeletonCollections: Collection[] = []) {
    return (
      <View style={styles.collectionListSkeletonRows}>
        {Array.from({ length: count }).map((_, item) => (
          (() => {
            const descriptionLines = collectionSkeletonDescriptionLines(skeletonCollections[item], item);
            return (
              <View key={item}>
                <View style={withSelectionControl ? styles.collectionChoiceRow : styles.collectionRow}>
                  <View style={withSelectionControl ? styles.collectionChoiceBody : styles.collectionListSkeletonBody}>
                    <View style={styles.collectionRowTop}>
                      <SkeletonBlock style={styles.collectionListSkeletonIcon} />
                      <View style={styles.collectionRowCopy}>
                        <SkeletonBlock style={styles.collectionListSkeletonTitle} />
                        <SkeletonBlock style={styles.collectionListSkeletonMeta} />
                      </View>
                    </View>
                    <View style={styles.collectionListSkeletonSummaryStack}>
                      <SkeletonBlock style={styles.collectionListSkeletonSummary} />
                      {descriptionLines > 1 ? <SkeletonBlock style={styles.collectionListSkeletonSummaryShort} /> : null}
                    </View>
                  </View>
                  {withSelectionControl ? <SkeletonBlock style={styles.collectionSelectionSkeletonControl} /> : null}
                </View>
                {item < count - 1 ? <View style={styles.separator} /> : null}
              </View>
            );
          })()
        ))}
      </View>
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
    if (!snackbar) return null;
    return (
      <View style={[styles.snackbar, withBottomNav && styles.snackbarAboveBottomNav]}>
        <Text style={styles.snackbarText}>{snackbar.text}</Text>
        {snackbar.action && snackbar.actionLabel ? (
          <Pressable onPress={snackbar.action} hitSlop={8}>
            <Text style={styles.snackbarAction}>{snackbar.actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  function renderBottomAppBar(active: "recent" | "collections") {
    const collectionAction = active === "collections";
    const navItems: Array<{
      key: "recent" | "collections" | "settings";
      label: string;
      Icon: NavIconComponent;
      selected: boolean;
      onPress: () => void;
      testID: string;
    }> = [
      {
        key: "recent",
        label: "Recent",
        Icon: RecentNavIcon,
        selected: active === "recent",
        onPress: openRecentHome,
        testID: "pc.nav.recent"
      },
      {
        key: "collections",
        label: "Collections",
        Icon: CollectionsNavIcon,
        selected: active === "collections",
        onPress: () => void openCollectionsScreen("active"),
        testID: "pc.nav.collections"
      },
      {
        key: "settings",
        label: "Settings",
        Icon: SettingsNavIcon,
        selected: false,
        onPress: openAccountActions,
        testID: "pc.nav.settings"
      }
    ];

    return (
      <View pointerEvents="box-none" style={styles.bottomNavLayer}>
        <View style={styles.bottomNavDock}>
          <View style={styles.bottomNavBar}>
            {navItems.map(({ key, label, Icon, selected, onPress, testID }) => (
              <Pressable
                accessibilityLabel={label}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={key}
                onPress={onPress}
                style={({ pressed }) => [
                  styles.bottomNavItem,
                  pressed && styles.bottomNavItemPressed
                ]}
                testID={testID}
              >
                <View style={[styles.bottomNavIconWrap, selected && styles.bottomNavIconWrapSelected]}>
                  <Icon
                    color={selected ? colors.accent : colors.muted}
                    selected={selected}
                    size={24}
                  />
                </View>
              </Pressable>
            ))}
          </View>
          <Pressable
            accessibilityLabel={collectionAction ? "New collection" : "New capture"}
            accessibilityRole="button"
            onPress={collectionAction ? openCollectionComposer : openCaptureComposer}
            style={({ pressed }) => [styles.bottomNavFab, pressed && styles.bottomNavFabPressed]}
            testID={collectionAction ? "pc.nav.collection-create" : "pc.nav.capture"}
          >
            <Plus color={colors.onAccent} size={24} strokeWidth={2.55} />
          </Pressable>
        </View>
      </View>
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
            accessibilityLabel="Close suggestion detail"
            onPress={() => setRationaleSheet(null)}
            style={styles.modalBackdrop}
          />
          <View style={styles.actionSheet}>
            <View style={styles.sheetGrabber} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderCopy}>
                <Text style={styles.sheetTitle}>{rationaleSheet.title}</Text>
                <Text style={styles.sheetSubtitle}>{rationaleSheet.text}</Text>
              </View>
              <IconButton Icon={X} label="Close suggestion detail" onPress={() => setRationaleSheet(null)} />
            </View>
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
    const saveDisabled = !collectionTitle.trim() || !collectionDescription.trim();
    const activeCollection = selectedCollection.status === "active";
    const capturesReadyForCollection = collectionCapturesForId === selectedCollection.id;
    const collectionCapturesBlockingLoading = activeCollection &&
      collectionCapturesLoading &&
      collectionCapturesLoadPhase !== "append";
    const visibleCollectionCaptures = activeCollection &&
      capturesReadyForCollection &&
      (!collectionCapturesBlockingLoading || collectionCaptures.length)
      ? collectionCaptures
      : [];
    const collectionCapturesInitialLoading = activeCollection && !collectionCapturesError && (
      !capturesReadyForCollection ||
      collectionCapturesBlockingLoading ||
      (collectionCapturesLoadPhase === "initial" && !visibleCollectionCaptures.length)
    );
    const collectionCapturesAppending = activeCollection && collectionCapturesLoadPhase === "append";
    const collectionCaptureSkeletonCount = selectedCollection.captureCount > 0
      ? Math.min(selectedCollection.captureCount, 4)
      : 2;
    const collectionDetailBottomPadding = keyboardHeight > 0
      ? Math.min(Math.max(keyboardHeight + 72, 180), 380)
      : 40;
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0}
          style={styles.keyboardScreen}
        >
          <FlatList
            {...CAPTURE_LIST_PERF_PROPS}
            data={visibleCollectionCaptures}
            keyExtractor={(item) => item.id}
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            keyboardShouldPersistTaps="handled"
            ref={collectionDetailListRef}
            renderItem={renderCollectionCapture}
            onEndReached={loadMoreCollectionCaptures}
            onEndReachedThreshold={0.35}
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
                collectionCapturesInitialLoading ? (
                  renderCollectionCaptureSkeletonRows(collectionCaptureSkeletonCount)
                ) : collectionCapturesError ? (
                  <View style={styles.collectionEmpty}>
                    <Text style={styles.emptyTitle}>Could not load collection captures.</Text>
                    <Text style={styles.emptyText}>{collectionCapturesError}</Text>
                    <Pressable onPress={retryLoadCollectionCaptures} style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>Try again</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.collectionEmpty}>
                    <Text style={styles.emptyTitle}>No captures in this collection.</Text>
                    <Text style={styles.emptyText}>Linked captures will appear here.</Text>
                  </View>
                )
              ) : null
            }
            ListFooterComponent={
              <>
                {visibleCollectionCaptures.length && collectionCapturesAppending
                  ? renderListLoadingFooter("Loading more captures...")
                  : null}
                <View style={styles.collectionSettings}>
                  {activeCollection ? (
                    <>
                      <Text style={styles.meta}>Collection settings</Text>
                      <TextInput
                        onChangeText={(value) => {
                          setCollectionDraftDirty(true);
                          setCollectionTitle(value);
                        }}
                        onFocus={scrollCollectionSettingsIntoView}
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
                        onFocus={scrollCollectionSettingsIntoView}
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
              </>
            }
            contentContainerStyle={[styles.collectionDetailContent, { paddingBottom: collectionDetailBottomPadding }]}
          />
        </KeyboardAvoidingView>
        {renderAppSheets()}
        {renderSnackbar()}
      </SafeAreaView>
    );
  }

  if (collectionsOpen) {
    const collectionsBlockingLoading = collectionsLoading && !collectionsError;
    const visibleManagedCollections = collectionsBlockingLoading ? [] : collections;
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <View style={styles.collectionsScreen}>
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
          {collectionsError ? <Text style={styles.errorText}>{collectionsError}</Text> : null}
          <FlatList
            {...COLLECTION_LIST_PERF_PROPS}
            data={visibleManagedCollections}
            keyExtractor={(item) => item.id}
            renderItem={renderCollection}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              collectionsBlockingLoading ? (
                renderCollectionSkeletonRows(collections.length ? Math.min(collections.length, 7) : 7, false, collections)
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
        {renderAppSheets()}
        {!showCollectionForm ? renderBottomAppBar("collections") : null}
        {renderCollectionComposerSheet()}
        {renderSnackbar(!showCollectionForm)}
      </SafeAreaView>
    );
  }

  if (selected && collectionPickerOpen) {
    const currentCollectionIds = (selected.linkedCollections || []).map((collection) => collection.id);
    const selectedCollectionIds = new Set(collectionSelectionIds);
    const selectionChanged = !sameStringSet(collectionSelectionIds, currentCollectionIds);
    const selectionSaving = collectionChoiceSaving === "set-collections";
    const selectionTerm = collectionPickerQuery.trim().toLowerCase();
    const visibleCollections = collectionsLoading
      ? []
      : collections
          .filter((collection) => collection.status === "active")
          .filter((collection) =>
            !selectionTerm ||
            [collection.title, collection.description].join(" ").toLowerCase().includes(selectionTerm)
          );
    const selectionCountText = collectionSelectionIds.length
      ? `${collectionSelectionIds.length} selected`
      : "No collection";
    const renderSelectableCollection = ({ item }: { item: Collection }) => {
      const selectedRow = selectedCollectionIds.has(item.id);
      return (
        <Animated.View style={{ opacity: collectionListFade }}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selectedRow }}
            onPress={() => toggleCollectionSelection(item.id)}
            style={({ pressed }) => [
              styles.collectionChoiceRow,
              pressed && styles.captureRowPressed
            ]}
            testID={`pc.collection.select.${item.id}`}
          >
            <View style={styles.collectionChoiceBody}>
              <View style={styles.collectionRowTop}>
                <View style={styles.collectionIconMark}>
                  <Folder color={colors.accent} size={18} strokeWidth={2.2} />
                </View>
                <View style={styles.collectionRowCopy}>
                  <Text numberOfLines={1} style={styles.captureTitle}>
                    {item.title}
                  </Text>
                  <Text style={styles.meta}>{collectionCountLabel(item.captureCount)}</Text>
                </View>
              </View>
              {item.description ? (
                <Text numberOfLines={2} style={styles.summaryPreview}>
                  {item.description}
                </Text>
              ) : null}
            </View>
            <View style={[styles.collectionSelectionControl, selectedRow && styles.collectionSelectionControlSelected]}>
              {selectedRow ? <Check color={colors.paper} size={15} strokeWidth={3} /> : null}
            </View>
          </Pressable>
        </Animated.View>
      );
    };

    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <View style={styles.collectionSelectorScreen}>
          <View style={styles.collectionSelectorHeader}>
            <View style={styles.detailHeader}>
              <IconButton Icon={ArrowLeft} label="Back" onPress={closeCollectionPicker} />
              <Text style={styles.status}>{selectionCountText}</Text>
            </View>
            <Text style={styles.title}>Collections</Text>
            <Text style={styles.sourceText}>Choose from your existing collections for this capture.</Text>
            <View style={styles.collectionSelectorSearchInput}>
              <Search color={colors.muted} size={18} strokeWidth={2.2} />
              <TextInput
                onChangeText={setCollectionPickerQuery}
                placeholder="Search collections"
                placeholderTextColor={colors.muted}
                style={styles.searchInputNative}
                testID="pc.collection.select.search"
                value={collectionPickerQuery}
              />
            </View>
          </View>
          <FlatList
            {...COLLECTION_LIST_PERF_PROPS}
            data={visibleCollections}
            keyExtractor={(item) => item.id}
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            keyboardShouldPersistTaps="handled"
            renderItem={renderSelectableCollection}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListHeaderComponent={
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: collectionSelectionIds.length === 0 }}
                onPress={() => setCollectionSelectionIds([])}
                style={({ pressed }) => [
                  styles.collectionChoiceRow,
                  pressed && styles.captureRowPressed
                ]}
                testID="pc.collection.select.none"
              >
                <View style={styles.collectionChoiceBody}>
                  <View style={styles.collectionRowTop}>
                    <View style={[styles.collectionNoCollectionIconMark, collectionSelectionIds.length === 0 && styles.collectionNoCollectionIconMarkSelected]}>
                      <X color={collectionSelectionIds.length === 0 ? colors.accent : colors.muted} size={18} strokeWidth={2.2} />
                    </View>
                    <View style={styles.collectionRowCopy}>
                      <Text numberOfLines={1} style={styles.captureTitle}>
                        No collection
                      </Text>
                      <Text style={styles.meta}>Leave this capture ungrouped.</Text>
                    </View>
                  </View>
                </View>
                <View style={[styles.collectionSelectionControl, collectionSelectionIds.length === 0 && styles.collectionSelectionControlSelected]}>
                  {collectionSelectionIds.length === 0 ? <Check color={colors.paper} size={15} strokeWidth={3} /> : null}
                </View>
              </Pressable>
            }
            ListEmptyComponent={
              collectionsLoading ? (
                renderCollectionSkeletonRows(4, true, collections.filter((collection) => collection.status === "active"))
              ) : (
                <View style={styles.collectionEmpty}>
                  <Text style={styles.emptyTitle}>
                    {selectionTerm ? "No matching collections." : "No active collections yet."}
                  </Text>
                  <Text style={styles.emptyText}>Create collections from the Collections tab.</Text>
                </View>
              )
            }
            contentContainerStyle={styles.collectionSelectorListContent}
            style={styles.collectionSelectorList}
          />
          {message ? <Text style={styles.messageInline}>{message}</Text> : null}
        </View>
        <View style={styles.collectionSelectionFooter}>
          <Pressable
            disabled={selectionSaving}
            onPress={() => {
              if (selectionChanged) void saveCollectionSelection();
              else closeCollectionPicker();
            }}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && !selectionSaving && styles.primaryButtonPressed,
              selectionSaving && styles.disabledButton
            ]}
            testID="pc.collection.select.save"
          >
            <Text style={styles.primaryButtonText}>
              {selectionSaving ? "Saving..." : selectionChanged ? "Save collections" : "Done"}
            </Text>
          </Pressable>
        </View>
        {renderSnackbar()}
      </SafeAreaView>
    );
  }

  if (selected) {
    const selectedArchived = isArchived(selected);
    const sourceValue = selected.sourceUrl || selected.sourceText;
    const selectedOpenUrl = captureOpenUrl(selected);
    const selectedImageUrl = captureImageUrl(selected);
    const selectedReviewReasons = reviewReasons(selected);
    const aiIntentValue = normalizeIntent(selected.defaultIntent) || selected.defaultIntent || "";
    const quickIntentValue = draftIntent || aiIntentValue;
    const quickIntentLabel = humanize(quickIntentValue) || "something useful";
    const reminderRows = selected.suggestedReminders || [];
    const collectionRows = selected.linkedCollections || [];
    const collectionRowLabel = linkedCollectionsLabel(collectionRows);
    const primaryReminder = reminderRows[0];
    const primaryReminderKey = primaryReminder ? reminderDraftKey(primaryReminder, 0) : "";
    const primaryReminderRemoved = primaryReminder ? reminderDrafts[primaryReminderKey] === "remove" : false;
    const reminderSentenceValue = primaryReminder && !primaryReminderRemoved
      ? reminderLabel(primaryReminder)
      : "no reminder";
    const selectedReviewState = reviewStatusCue(selected, selectedReviewReasons.length > 0);
    const showReviewStateText = selectedReviewState !== "Ready" && selectedReviewState !== captureStatusLabel(selected);
    const collectionActionPending = collectionChoiceSaving === "set-collections";
    const urlEvidenceNotice = urlEvidenceMessage(selected.urlEvidence);
    const selectedVisitTarget = selected.visitTarget;
    const selectedVisitTargetMapCandidates = selectedVisitTarget ? visitTargetMapCandidates : [];
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
    const reviewHasPendingChanges = Boolean(
      draftTitleDirty ||
        draftNoteDirty ||
        draftIntentDirty ||
        Object.keys(reminderDrafts).length
    );
    const reviewSupportText = draftIntentDirty
      ? `Changed from ${humanize(aiIntentValue) || "the original suggestion"}`
      : "";
    const showReviewFooter = reviewHasPendingChanges || collectionActionPending;
    const noteSheetKeyboardVisible = noteSheetOpen && keyboardHeight > 0;
    const noteWindowAlreadyKeyboardSized = noteSheetKeyboardVisible && Math.abs(windowHeight + keyboardHeight - Dimensions.get("screen").height) < 96;
    const noteVisibleHeight = noteSheetKeyboardVisible && !noteWindowAlreadyKeyboardSized
      ? windowHeight - keyboardHeight
      : windowHeight;
    const noteSheetMaxHeight = noteSheetKeyboardVisible
      ? Math.min(440, Math.max(320, noteVisibleHeight - 24))
      : Math.min(500, Math.max(340, windowHeight * 0.64));
    const noteSheetBottomInset = noteWindowAlreadyKeyboardSized ? 0 : captureKeyboardInset;
    const showStatus = selectedArchived || displayStatus(selected) !== "ready";
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
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
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
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
            <Pressable
              accessibilityHint={selectedOpenUrl ? "Opens the saved source" : undefined}
              accessibilityLabel={selectedOpenUrl ? "Open saved source" : undefined}
              accessibilityRole={selectedOpenUrl ? "button" : undefined}
              disabled={!selectedOpenUrl}
              onPress={() => void openCaptureUrl(selectedOpenUrl)}
              style={({ pressed }) => [
                styles.reviewMediaHeader,
                selectedImageUrl ? styles.reviewMediaHeaderImage : styles.reviewMediaHeaderFallback,
                pressed && Boolean(selectedOpenUrl) && styles.subtlePressed
              ]}
              testID="pc.review.media"
            >
              {selectedImageUrl ? (
                <>
                  <Image
                    cachePolicy="memory-disk"
                    contentFit="cover"
                    source={{ uri: selectedImageUrl }}
                    style={styles.reviewMediaImage}
                    transition={120}
                  />
                  <View style={styles.reviewMediaOverlay}>
                    <View style={styles.reviewMediaSourcePill}>
                      <Text numberOfLines={1} style={styles.reviewMediaSourceText}>
                        {captureSourceLabel(selected)}
                      </Text>
                    </View>
                  </View>
                </>
              ) : (
                <View style={styles.reviewMediaFallbackContent}>
                  <SourceMark
                    capture={selected}
                    failedFavicons={faviconFailures}
                    onFaviconFailure={markFaviconFailed}
                    size="detail"
                  />
                  <View style={styles.reviewMediaFallbackCopy}>
                    <Text numberOfLines={1} style={styles.reviewMediaFallbackTitle}>
                      {captureSourceLabel(selected)}
                    </Text>
                    <Text numberOfLines={2} style={styles.reviewMediaFallbackText}>
                      {captureIntentLabel(selected) || captureStatusLabel(selected)}
                    </Text>
                  </View>
                </View>
              )}
            </Pressable>
            <View style={styles.reviewPrimaryBlock}>
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
            </View>
            <View style={styles.quickEditBlock}>
              <View style={styles.reviewEditRows}>
                <View style={styles.reviewEditRow}>
                  <Text style={styles.editRowLabel}>Intent</Text>
                  <Pressable
                    android_ripple={{ color: "rgba(31, 122, 91, 0.10)" }}
                    onLongPress={() => showRationale("Why this intent?", selected.intentRationale)}
                    onPress={() => setQuickIntentOpen((current) => !current)}
                    style={({ pressed }) => [
                      styles.editRowValue,
                      quickIntentOpen && styles.sentenceChipActive,
                      pressed && styles.subtlePressed
                    ]}
                  >
                    <Text numberOfLines={1} style={styles.editRowValueText}>{quickIntentLabel}</Text>
                  </Pressable>
                </View>
                <View style={styles.reviewEditRow}>
                  <Text style={styles.editRowLabel}>Collections</Text>
                  <Pressable
                    android_ripple={{ color: "rgba(31, 122, 91, 0.10)" }}
                    onPress={() => void openCollectionPicker()}
                    style={({ pressed }) => [
                      styles.editRowValue,
                      pressed && styles.subtlePressed
                    ]}
                    testID="pc.review.collections.open"
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.editRowValueText,
                        !collectionRows.length && styles.editRowPlaceholderText
                      ]}
                    >
                      {collectionRowLabel}
                    </Text>
                  </Pressable>
                </View>
                {primaryReminder ? (
                  <View style={styles.reviewEditRow}>
                    <Text style={styles.editRowLabel}>Reminder idea</Text>
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
                        styles.editRowValue,
                        primaryReminderRemoved && styles.sentenceChipMuted,
                        pressed && styles.subtlePressed
                      ]}
                    >
                      <Text numberOfLines={1} style={[styles.editRowValueText, primaryReminderRemoved && styles.suggestionTextMuted]}>
                        {reminderSentenceValue}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
              {reviewSupportText ? (
                <Text style={styles.reviewSentenceSubtext}>{reviewSupportText}</Text>
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
            </View>
            {selectedVisitTarget && selectedVisitTargetMapCandidates.length ? (
              <View style={styles.sourceBlock}>
                <Text style={styles.meta}>Open in Maps</Text>
                <View style={styles.mapTargetRow}>
                  <MapPin color={colors.muted} size={18} strokeWidth={2.2} />
                  <View style={styles.mapTargetCopy}>
                    <Text numberOfLines={1} style={styles.compactActionText}>{selectedVisitTarget.name}</Text>
                    <Text numberOfLines={2} style={styles.supportingText}>
                      {selectedVisitTarget.query}
                    </Text>
                  </View>
                </View>
                <View style={styles.mapActionRow}>
                  {selectedVisitTargetMapCandidates.map((candidate) => (
                    <Pressable
                      key={`${candidate.provider}:${candidate.url}`}
                      onPress={() => void openVisitTargetMaps(candidate)}
                      style={({ pressed }) => [styles.mapActionButton, pressed && styles.subtlePressed]}
                    >
                      <Text style={styles.inlineAction}>{candidate.label}</Text>
                    </Pressable>
                  ))}
                </View>
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
              <Pressable
                accessibilityRole="button"
                onPress={openNoteSheet}
                style={({ pressed }) => [styles.compactActionRow, pressed && styles.subtlePressed]}
                testID="pc.review.note.open"
              >
                <StickyNote color={colors.muted} size={18} strokeWidth={2.2} />
                <View style={styles.noteActionCopy}>
                  <View style={styles.noteActionHeader}>
                    <Text style={styles.compactActionText}>
                      {noteHasText ? "Note" : "Add note"}
                    </Text>
                    {noteStatusLabel ? (
                      <Text style={[styles.noteSaveState, noteSaveState === "error" && styles.noteSaveStateError]}>
                        {noteStatusLabel}
                      </Text>
                    ) : null}
                  </View>
                  {noteHasText ? (
                    <Text numberOfLines={2} style={styles.noteActionPreview}>{draftNote}</Text>
                  ) : null}
                </View>
                <Pencil color={colors.muted} size={16} strokeWidth={2.2} />
              </Pressable>
            </View>
            <View style={styles.sourceBlock}>
              <View style={styles.sourceDisclosureRow}>
                <View style={styles.sourceDisclosureCopy}>
                  <Text style={styles.meta}>Source</Text>
                  <Text numberOfLines={1} style={styles.reviewSourceMeta}>{captureSourceLabel(selected)}</Text>
                </View>
                <View style={styles.sourceDisclosureActions}>
                  {selectedOpenUrl ? (
                    <IconButton
                      Icon={ExternalLink}
                      label="Open source"
                      onPress={() => void openCaptureUrl(selectedOpenUrl)}
                    />
                  ) : null}
                  {sourceValue ? (
                    <IconButton Icon={Copy} label="Copy source" onPress={() => void copySource()} />
                  ) : null}
                </View>
              </View>
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
        {noteSheetOpen ? (
          <View style={styles.sheetLayer} pointerEvents="box-none">
            <Pressable
              accessibilityLabel="Close note editor"
              onPress={closeNoteSheet}
              style={styles.sheetBackdrop}
            />
            <KeyboardAvoidingView pointerEvents="box-none" style={styles.sheetKeyboard}>
              <Animated.View
                style={[
                  styles.captureSheet,
                  noteSheetKeyboardVisible && styles.captureSheetCompact,
                  {
                    marginBottom: noteSheetBottomInset,
                    maxHeight: noteSheetMaxHeight,
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
                    <Text style={styles.sheetTitle}>Note</Text>
                  </View>
                  <View style={styles.sheetActions}>
                    <IconButton Icon={X} label="Close note editor" onPress={closeNoteSheet} />
                    <IconButton Icon={Check} label="Done" onPress={closeNoteSheet} tone="primary" />
                  </View>
                </View>
                <View
                  style={[
                    styles.captureSheetBody,
                    styles.captureSheetBodyContent,
                    noteSheetKeyboardVisible && styles.captureSheetBodyContentCompact
                  ]}
                >
                  <TextInput
                    multiline
                    onChangeText={(value) => {
                      setDraftNoteDirty(true);
                      setDraftNote(value);
                      updateSelectedReviewDraft({ note: value, noteDirty: true });
                    }}
                    placeholder="Why did you save this?"
                    placeholderTextColor={colors.muted}
                    ref={noteInputRef}
                    style={[styles.captureInput, styles.noteSheetInput]}
                    testID="pc.review.note"
                    value={draftNote}
                  />
                  {noteStatusLabel ? (
                    <Text style={[styles.noteSaveState, noteSaveState === "error" && styles.noteSaveStateError]}>
                      {noteStatusLabel}
                    </Text>
                  ) : null}
                </View>
              </Animated.View>
            </KeyboardAvoidingView>
          </View>
        ) : null}
        {renderAppSheets()}
        {renderSnackbar()}
      </SafeAreaView>
    );
  }

  if (config?.apiUrl && !session) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <ScrollView
          contentContainerStyle={styles.detail}
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
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
        {renderAppSheets()}
      </SafeAreaView>
    );
  }

  if (searchOpen) {
    const searchIsLoading = remoteSearchActive && remoteSearchLoading
      ? true
      : searchScope !== "active" && archivedCapturesLoading && !archivedCapturesLoaded;
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
        <StatusBar barStyle="light-content" />
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
              {...CAPTURE_LIST_PERF_PROPS}
              data={searchResults}
              keyExtractor={(item) => item.id}
              renderItem={renderSearchResult}
              onEndReached={() => {
                if (!remoteSearchActive && searchScope === "archived") loadMoreCaptures("archived");
              }}
              onEndReachedThreshold={0.35}
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
        {renderAppSheets()}
        {renderSnackbar()}
      </SafeAreaView>
    );
  }

  const homeCountLabel = capturesLoading && !homeCaptures.length
    ? "Loading captures"
    : `${homeCaptures.length} recent ${homeCaptures.length === 1 ? "capture" : "captures"}`;
  const composerKeyboardVisible = showCaptureComposer && keyboardHeight > 0;
  const screenHeight = Dimensions.get("screen").height;
  const windowAlreadyKeyboardSized = composerKeyboardVisible && Math.abs(windowHeight + keyboardHeight - screenHeight) < 96;
  const composerVisibleHeight = composerKeyboardVisible && !windowAlreadyKeyboardSized
    ? windowHeight - keyboardHeight
    : windowHeight;
  const composerAvailableHeight = composerKeyboardVisible
    ? Math.max(320, composerVisibleHeight - 24)
    : Math.max(360, windowHeight * 0.72);
  const captureSheetMaxHeight = composerKeyboardVisible
    ? Math.min(430, composerAvailableHeight)
    : Math.min(560, Math.max(340, windowHeight * 0.72));
  const captureSourcePlaceholder = captureMode === "link" ? "Paste a link" : "Write a note";
  const captureSheetBottomInset = windowAlreadyKeyboardSized ? 0 : captureKeyboardInset;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        <View style={styles.header} testID="pc.home.captures">
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={styles.kicker}>{homeCountLabel}</Text>
              <Text style={styles.title}>Recent Captures</Text>
            </View>
            {session ? (
              <IconButton Icon={Search} label="Search saved things" onPress={openSearch} testID="pc.home.search" />
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
          {message ? <Text style={styles.messageInline}>{message}</Text> : null}
        </View>
        <FlatList
          {...CAPTURE_LIST_PERF_PROPS}
          data={visibleHomeRows}
          keyExtractor={(item) => item.id}
          renderItem={renderHomeRow}
          onEndReached={() => loadMoreCaptures("active")}
          onEndReachedThreshold={0.35}
          ItemSeparatorComponent={({ leadingItem }) =>
            leadingItem?.type === "section" ? null : <View style={styles.separator} />
          }
          ListEmptyComponent={
            homeInitialLoading ? (
              renderCaptureSkeletonRows(5)
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
                  onPress={openCaptureComposer}
                  style={styles.primaryButton}
                  testID="pc.capture.empty.open"
                >
                  <Text style={styles.primaryButtonText}>Paste link or note</Text>
                </Pressable>
                <Text style={styles.emptyCue}>You can review details after the capture is saved.</Text>
              </View>
            )
          }
          ListFooterComponent={
            visibleHomeRows.length && capturesLoading && capturesNextCursor
              ? renderListLoadingFooter()
              : null
          }
          contentContainerStyle={visibleHomeRows.length ? styles.listContent : styles.emptyContent}
          keyboardShouldPersistTaps="handled"
        />
      </View>
      {showCaptureComposer ? (
        <View style={styles.sheetLayer} pointerEvents="box-none">
          <Pressable
            accessibilityLabel="Close capture composer"
            onPress={closeCaptureComposer}
            style={styles.sheetBackdrop}
          />
          <KeyboardAvoidingView
            pointerEvents="box-none"
            style={styles.sheetKeyboard}
          >
            <Animated.View
              style={[
                styles.captureSheet,
                composerKeyboardVisible && styles.captureSheetCompact,
                {
                  marginBottom: captureSheetBottomInset,
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
                  <IconButton Icon={X} label="Close" onPress={closeCaptureComposer} />
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
              <View style={styles.captureModeRow}>
                {([
                  { mode: "link", label: "Link", Icon: Link2 },
                  { mode: "note", label: "Note", Icon: StickyNote },
                  { mode: "image", label: "Image", Icon: ImageIcon }
                ] as const).map(({ mode, label, Icon }) => {
                  const imageAction = mode === "image";
                  const selectedMode = !imageAction && captureMode === mode;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      disabled={imageAction && pickingCaptureImage}
                      key={mode}
                      onPress={() => chooseCaptureMode(mode)}
                      style={({ pressed }) => [
                        styles.captureModeChip,
                        selectedMode && styles.captureModeChipSelected,
                        pressed && styles.subtlePressed
                      ]}
                      testID={`pc.capture.mode.${mode}`}
                    >
                      <Icon color={selectedMode ? colors.onAccent : colors.muted} size={16} strokeWidth={2.4} />
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.captureModeText,
                          selectedMode && styles.captureModeTextSelected
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View
                style={[
                  styles.captureSheetBody,
                  styles.captureSheetBodyContent,
                  composerKeyboardVisible && styles.captureSheetBodyContentCompact
                ]}
              >
                <TextInput
                  autoCapitalize={captureMode === "link" ? "none" : "sentences"}
                  autoCorrect={captureMode !== "link"}
                  keyboardType={captureMode === "link" ? "url" : "default"}
                  multiline
                  ref={sourceInputRef}
                  onChangeText={setSourceDraft}
                  placeholder={captureSourcePlaceholder}
                  placeholderTextColor={colors.muted}
                  style={[styles.captureInput, composerKeyboardVisible && styles.captureInputCompact]}
                  testID="pc.capture.source"
                  value={sourceDraft}
                />
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      ) : null}
      {renderAppSheets()}
      {!showCaptureComposer ? renderBottomAppBar("recent") : null}
      {renderSnackbar(!showCaptureComposer)}
    </SafeAreaView>
  );
}

const colors = {
  paper: "#101411",
  surface: "#171c18",
  surfaceContainer: "#1d241f",
  surfaceContainerHigh: "#252d27",
  surfaceContainerHighest: "#303933",
  ink: "#eef5ef",
  muted: "#a6b3aa",
  line: "#37413a",
  soft: "#202821",
  accent: "#7bd7ad",
  accentSoft: "#17382b",
  accentLine: "#2d6b51",
  secondary: "#c1ccbc",
  tertiary: "#d7bf7a",
  onAccent: "#062015",
  processing: "#9fc6e3",
  processingSoft: "#172b39",
  review: "#e2bd76",
  reviewSoft: "#342713",
  danger: "#ffb4a8",
  dangerSoft: "#3a1f1c",
  scrim: "rgba(3, 7, 5, 0.62)"
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
  keyboardScreen: {
    flex: 1
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
  bottomNavLayer: {
    bottom: 0,
    left: 0,
    paddingBottom: Platform.OS === "android" ? 34 : 28,
    paddingHorizontal: 40,
    position: "absolute",
    right: 0,
    zIndex: 24
  },
  bottomNavDock: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  bottomNavBar: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainer,
    borderColor: colors.line,
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "space-between",
    minHeight: 60,
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  bottomNavItem: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 0,
    paddingHorizontal: 2
  },
  bottomNavItemPressed: {
    transform: [{ scale: 0.985 }]
  },
  bottomNavIconWrap: {
    alignItems: "center",
    borderRadius: 22,
    height: 42,
    justifyContent: "center",
    minWidth: 54,
    paddingHorizontal: 12
  },
  bottomNavIconWrapSelected: {},
  bottomNavFab: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 30,
    justifyContent: "center",
    height: 60,
    width: 60
  },
  bottomNavFabPressed: {
    backgroundColor: "#96e5bf",
    transform: [{ scale: 0.965 }]
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
    backgroundColor: colors.surfaceContainer,
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
    maxHeight: 124,
    minHeight: 86,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: "top"
  },
  captureInputCompact: {
    maxHeight: 104,
    minHeight: 80,
    paddingVertical: 10
  },
  collectionSheetTitleInput: {
    maxHeight: 64,
    minHeight: 54,
    paddingVertical: 10,
    textAlignVertical: "center"
  },
  collectionSheetDescriptionInput: {
    minHeight: 96
  },
  captureModeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  captureModeChip: {
    alignItems: "center",
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: 8
  },
  captureModeChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  captureModeText: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "800"
  },
  captureModeTextSelected: {
    color: colors.onAccent
  },
  captureImagePanel: {
    alignItems: "stretch"
  },
  captureImageButton: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.surfaceContainerHighest,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 14
  },
  captureImageButtonDisabled: {
    opacity: 0.56
  },
  captureImageButtonText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800"
  },
  sheetLayer: {
    bottom: 0,
    justifyContent: "flex-end",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 36
  },
  modalLayer: {
    bottom: 0,
    justifyContent: "flex-end",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 40
  },
  modalBackdrop: {
    backgroundColor: colors.scrim,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  actionSheet: {
    backgroundColor: colors.surfaceContainer,
    borderTopColor: colors.line,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
    paddingBottom: Platform.OS === "android" ? 20 : 28,
    paddingHorizontal: 22,
    paddingTop: 8
  },
  sheetBackdrop: {
    backgroundColor: colors.scrim,
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
    backgroundColor: colors.surfaceContainer,
    borderTopColor: colors.line,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 14,
    paddingBottom: Platform.OS === "android" ? 18 : 26,
    paddingHorizontal: 22,
    paddingTop: 8
  },
  captureSheetCompact: {
    gap: 10,
    paddingBottom: Platform.OS === "android" ? 16 : 22
  },
  captureSheetBody: {
    flexShrink: 1,
    minWidth: 0
  },
  captureSheetBodyContent: {
    gap: 14,
    paddingBottom: 8
  },
  captureSheetBodyContentCompact: {
    gap: 10,
    paddingBottom: 12
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
  sheetActionRow: {
    alignItems: "center",
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 62,
    paddingVertical: 12
  },
  sheetActionCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  sheetActionTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800"
  },
  sheetActionDanger: {
    color: colors.danger
  },
  sheetActionText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  destructiveSheetIcon: {
    alignItems: "center",
    backgroundColor: colors.dangerSoft,
    borderColor: "#704038",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    height: 46,
    justifyContent: "center",
    width: 46
  },
  listContent: {
    paddingBottom: 132,
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
    backgroundColor: colors.surfaceContainer,
    borderRadius: 8,
    transform: [{ scale: 0.995 }]
  },
  subtlePressed: {
    backgroundColor: colors.surfaceContainerHigh,
    transform: [{ scale: 0.985 }]
  },
  darkButtonPressed: {
    backgroundColor: colors.surfaceContainerHighest,
    transform: [{ scale: 0.985 }]
  },
  sourceMark: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentLine,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 52,
    justifyContent: "center",
    marginTop: 2,
    overflow: "hidden",
    width: 52
  },
  sourceMarkDetail: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentLine,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 28,
    justifyContent: "center",
    overflow: "hidden",
    width: 28
  },
  sourceMarkProcessing: {
    backgroundColor: colors.processingSoft,
    borderColor: "#2b526b"
  },
  sourceMarkReview: {
    backgroundColor: colors.reviewSoft,
    borderColor: "#6c5324"
  },
  sourceMarkFailed: {
    backgroundColor: colors.dangerSoft,
    borderColor: "#704038"
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
  captureThumbnailFrame: {
    backgroundColor: colors.surfaceContainer,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    height: 58,
    marginTop: 1,
    overflow: "hidden",
    width: 58
  },
  captureThumbnailImage: {
    height: "100%",
    width: "100%"
  },
  thumbnailRevealSlot: {
    height: 60,
    position: "relative",
    width: 58
  },
  thumbnailGhostOverlay: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
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
    backgroundColor: colors.processingSoft
  },
  statusGlyphReview: {
    backgroundColor: colors.reviewSoft
  },
  statusGlyphFailed: {
    backgroundColor: colors.dangerSoft
  },
  statusGlyphArchived: {
    backgroundColor: colors.surfaceContainerHigh
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
    color: colors.danger
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
    flexGrow: 1,
    paddingBottom: 132
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
  skeletonRevealFrame: {
    position: "relative"
  },
  skeletonRevealOverlay: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  skeletonBlock: {
    backgroundColor: colors.surfaceContainerHigh,
    overflow: "hidden"
  },
  skeletonSheen: {
    backgroundColor: "rgba(245, 251, 247, 0.10)",
    bottom: -14,
    position: "absolute",
    top: -14,
    width: 38
  },
  captureSkeletonRow: {
    alignItems: "flex-start",
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 132,
    paddingVertical: 16
  },
  collectionCaptureSkeletonRow: {
    alignItems: "flex-start",
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 156,
    paddingVertical: 16
  },
  collectionCaptureSkeletonMain: {
    alignItems: "flex-start",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minWidth: 0
  },
  collectionCaptureSkeletonCopy: {
    flex: 1,
    gap: 8,
    minWidth: 0,
    paddingTop: 3
  },
  captureRowSkeletonInline: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    minHeight: 76,
    paddingVertical: 14
  },
  collectionCaptureSkeletonInline: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    minHeight: 108,
    paddingVertical: 16
  },
  captureRowSkeletonCopy: {
    flex: 1,
    gap: 8,
    minWidth: 0,
    paddingTop: 3
  },
  collectionListSkeletonRows: {
    paddingTop: 0
  },
  collectionListSkeletonBody: {
    gap: 7
  },
  collectionListSkeletonIcon: {
    borderRadius: 8,
    height: 36,
    width: 36
  },
  collectionListSkeletonTitle: {
    borderRadius: 6,
    height: 18,
    marginTop: 1,
    width: "66%"
  },
  collectionListSkeletonMeta: {
    borderRadius: 6,
    height: 13,
    marginTop: 7,
    width: "38%"
  },
  collectionListSkeletonSummaryStack: {
    gap: 7
  },
  collectionListSkeletonSummary: {
    borderRadius: 6,
    height: 13,
    width: "90%"
  },
  collectionListSkeletonSummaryShort: {
    borderRadius: 6,
    height: 13,
    width: "76%"
  },
  collectionSelectionSkeletonControl: {
    borderRadius: 8,
    flexShrink: 0,
    height: 34,
    marginRight: 2,
    width: 34
  },
  loadingSourceMark: {
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 52,
    marginTop: 2,
    width: 52
  },
  loadingThumbnailMark: {
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    height: 58,
    marginTop: 1,
    width: 58
  },
  collectionLoadingTitle: {
    borderRadius: 6,
    height: 18,
    width: "68%"
  },
  collectionLoadingLine: {
    borderRadius: 6,
    height: 13,
    width: "88%"
  },
  collectionLoadingLineShort: {
    borderRadius: 6,
    height: 13,
    width: "52%"
  },
  collectionLoadingToken: {
    borderRadius: 6,
    height: 14,
    marginTop: 2,
    width: 72
  },
  collectionLoadingAction: {
    borderRadius: 6,
    height: 16,
    marginTop: 9,
    width: 58
  },
  listLoadingFooter: {
    alignItems: "center",
    paddingBottom: 12,
    paddingTop: 12
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
  collectionNoCollectionIconMark: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  collectionNoCollectionIconMarkSelected: {
    backgroundColor: colors.accentSoft
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
  collectionsListContent: {
    paddingBottom: 132
  },
  collectionSelectorScreen: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 14
  },
  collectionSelectorHeader: {
    gap: 12,
    paddingBottom: 12
  },
  collectionSelectorSearchInput: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainer,
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    minHeight: 50,
    paddingHorizontal: 12
  },
  collectionSelectorList: {
    flex: 1
  },
  collectionSelectorListContent: {
    paddingBottom: 118,
    paddingRight: 2
  },
  collectionChoiceRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 76,
    paddingVertical: 15
  },
  collectionChoiceBody: {
    flex: 1,
    gap: 7,
    minWidth: 0
  },
  collectionSelectionControl: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
    height: 34,
    justifyContent: "center",
    marginRight: 2,
    width: 34
  },
  collectionSelectionControlSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  collectionSelectionFooter: {
    backgroundColor: colors.paper,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: Platform.OS === "android" ? 16 : 22,
    paddingHorizontal: 22,
    paddingTop: 10
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
  reviewMediaHeader: {
    backgroundColor: colors.surfaceContainer,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden"
  },
  reviewMediaHeaderImage: {
    aspectRatio: 1.72
  },
  reviewMediaHeaderFallback: {
    minHeight: 94,
    padding: 16
  },
  reviewMediaImage: {
    height: "100%",
    width: "100%"
  },
  reviewMediaOverlay: {
    bottom: 10,
    left: 10,
    position: "absolute",
    right: 10
  },
  reviewMediaSourcePill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(3, 7, 5, 0.68)",
    borderColor: "rgba(238, 245, 239, 0.18)",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: "100%",
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  reviewMediaSourceText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800"
  },
  reviewMediaFallbackContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  reviewMediaFallbackCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  reviewMediaFallbackTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800"
  },
  reviewMediaFallbackText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  quickEditBlock: {
    gap: 12,
    paddingHorizontal: 2
  },
  reviewPrimaryBlock: {
    gap: 8,
    paddingHorizontal: 2
  },
  reviewTitleInput: {
    color: colors.ink,
    fontSize: 27,
    fontWeight: "800",
    lineHeight: 33,
    padding: 0,
    paddingVertical: 2
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
    gap: 7
  },
  reviewEditRows: {
    gap: 2
  },
  reviewEditRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 46,
    paddingVertical: 4
  },
  editRowLabel: {
    color: colors.muted,
    flexShrink: 0,
    fontSize: 13,
    fontWeight: "700",
    width: 92
  },
  editRowValue: {
    alignItems: "center",
    borderBottomColor: colors.accentLine,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-start",
    minHeight: 38,
    minWidth: 0,
    paddingVertical: 4
  },
  editRowValueText: {
    color: colors.ink,
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 21
  },
  editRowPlaceholderText: {
    color: colors.accent
  },
  editRowAction: {
    color: colors.accent,
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20
  },
  reviewPhrase: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    maxWidth: "100%"
  },
  reviewSentenceText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19
  },
  sentenceChip: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 1,
    justifyContent: "center",
    maxWidth: "100%",
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  sentenceChipActive: {
    borderBottomColor: colors.accent
  },
  sentenceChipMuted: {
    borderBottomColor: colors.line,
    opacity: 0.66
  },
  sentenceChipText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19
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
    backgroundColor: colors.surfaceContainerHigh,
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
    backgroundColor: colors.surfaceContainerHigh,
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
    backgroundColor: colors.surfaceContainerHigh,
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
    backgroundColor: colors.surfaceContainerHigh,
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
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  suggestionPillChanged: {
    backgroundColor: colors.reviewSoft
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
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  intentChipText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700"
  },
  intentChipTextSelected: {
    color: colors.onAccent
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
  mapTargetRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 46,
    paddingVertical: 2
  },
  mapTargetCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  mapActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  mapActionButton: {
    alignSelf: "flex-start",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 2
  },
  compactActionRow: {
    alignItems: "center",
    borderRadius: 8,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    minHeight: 50,
    paddingVertical: 4
  },
  compactActionText: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: "700"
  },
  noteActionCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  noteActionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  noteActionPreview: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  noteSheetInput: {
    fontSize: 16,
    lineHeight: 22,
    maxHeight: 260,
    minHeight: 170
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
    backgroundColor: colors.accent,
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  smallButtonText: {
    color: colors.onAccent,
    fontSize: 13,
    fontWeight: "700"
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 21
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 50,
    paddingVertical: 14
  },
  primaryButtonPressed: {
    backgroundColor: "#9be6c2",
    transform: [{ scale: 0.99 }]
  },
  disabledButton: {
    opacity: 0.45
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: "700"
  },
  destructiveButton: {
    backgroundColor: colors.danger
  },
  destructiveButtonText: {
    color: "#2d0b08",
    fontSize: 16,
    fontWeight: "800"
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
    color: colors.danger,
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
    backgroundColor: colors.surfaceContainerHighest,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
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
    right: 22,
    zIndex: 32
  },
  snackbarAboveBottomNav: {
    bottom: Platform.OS === "android" ? 124 : 128
  },
  snackbarText: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19
  },
  snackbarAction: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "800"
  }
});
