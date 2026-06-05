import type { ComponentType } from "react";
import type { Icon as PhosphorIcon } from "phosphor-react-native";

export type CaptureStatus = "processing" | "ready" | "needs_review" | "failed";
export type ReviewTarget = "intent" | "collections" | "reminder" | "analysis";

export type UrlEvidence = {
  status?: "extracted" | "partial_evidence" | "needs_client_resolution" | "insufficient_url_evidence" | "failed";
  evidence_quality?: "high" | "medium" | "low" | "none";
  user_facing_message?: string;
  failure_reason?: string;
  final_url?: string | null;
  canonical_url?: string;
  client_resolved_url?: string;
  source_domain?: string | null;
  site_name?: string | null;
  missing_evidence?: string[];
  image_url?: string;
  favicon?: string | null;
};

export type ResolvedPlace = {
  status: "resolved" | "not_found" | "ambiguous" | "failed" | "skipped_no_key" | "skipped_no_target";
  provider: "google_places";
  placeId?: string | null;
  resourceName?: string | null;
  resolvedQuery?: string | null;
  resolvedAt?: string | null;
  dataExpiresAt?: string | null;
  displayName?: string | null;
  formattedAddress?: string | null;
  location?: { latitude: number; longitude: number } | null;
  googleMapsUri?: string | null;
  thumbnailStatus?: "available" | "unavailable";
  thumbnailUrl?: string | null;
  thumbnailAttribution?: Array<{
    displayName?: string | null;
    uri?: string | null;
    photoUri?: string | null;
  }>;
  matchReason?: string | null;
  error?: string | null;
};

export type ReviewRationale = {
  focus?: string;
  summary?: string;
  intent?: string;
  collections?: string;
  reminder?: string;
};
export type ReviewRationaleStatus = "accepted" | "neutral_fallback";

export type CaptureFieldKind = "purpose" | "collection" | "later";

export type CaptureFieldState = {
  kind: CaptureFieldKind;
  label: string;
  value: string;
  displayValue: string;
  emptyLabel: string;
  hasValue: boolean;
};

export type CaptureFieldRationale = {
  field: CaptureFieldKind;
  title: string;
  text: string;
  visible: boolean;
};

export type Capture = {
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
  imageAssetFullUrl?: string;
  imageAssetFullCacheKey?: string;
  imageAssetMimeType?: string;
  sourcePreviewAssetUrl?: string;
  sourcePreviewAssetCacheKey?: string;
  sourcePreviewAssetMimeType?: string;
  urlEvidence?: UrlEvidence | null;
  analysisMode?: string;
  analysisProvider?: string;
  analysisModel?: string;
  analysisError?: string;
  aiDefaultIntent?: string;
  defaultIntent?: string;
  intentRationale?: string;
  reviewRationale?: ReviewRationale;
  reviewRationaleStatus?: ReviewRationaleStatus;
  reviewRationaleInvalidReason?: string;
  reviewRationaleInvalidField?: string;
  confidenceLabel?: string;
  needsReview?: boolean;
  reviewTargets?: ReviewTarget[];
  entities?: Array<{ type: string; name: string; evidence: string; confidence: number }>;
  visitTarget?: VisitTarget | null;
  suggestedReminders?: Array<{
    trigger_type: "time";
    trigger_value: string;
    trigger_text?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    trigger_date?: string | null;
    date_window_start?: string | null;
    date_window_end?: string | null;
    date_precision?: ReminderDatePrecision | null;
    trigger_time?: string | null;
    time_precision?: ReminderTimePrecision | null;
    timezone?: string | null;
    duration?: number | null;
    duration_unit?: ReminderDurationUnit | null;
    rationale: string;
    confidence: number;
    source?: string;
    status?: string;
  }>;
  linkedCollections?: LinkedCollection[];
  collectionDecisions?: CollectionDecision[];
  suggestedCollections?: CollectionDecision[];
  manualCollectionOverrides?: CollectionChoiceOverride[];
  searchPhrases?: string[];
  note: string;
  archivedAt?: number | null;
  deletedAt?: number | null;
  deletePurgeAfter?: number | null;
  rejectedAt?: number | null;
  reviewConfirmedAt?: number | null;
  status: CaptureStatus;
  createdAt: number;
  updatedAt: number;
  processedAt: number | null;
};

export type LinkedCollection = {
  id: string;
  title: string;
  description?: string;
  createdBy?: string;
  rationale?: string | null;
  confidence?: number | null;
  linkedAt?: number | null;
};

export type CollectionDecision = {
  type: "existing" | "new";
  collectionId?: string | null;
  title: string;
  description?: string | null;
  rationale: string;
  confidence: number;
};

export type CollectionChoiceOverride = {
  collectionId: string;
  source?: string;
  restoredDecisions: CollectionDecision[];
};

export type VisitTarget = {
  name: string;
  query: string;
  confidence: "high" | "medium" | "low";
  evidence: string[];
  verifiedPlace: boolean;
  resolvedPlace?: ResolvedPlace | null;
};

export type Collection = {
  id: string;
  title: string;
  description: string;
  status: "active" | "archived";
  captureCount: number;
  previewCaptures: CollectionPreviewCapture[];
  archivedAt?: string | null;
  deletedAt?: string | null;
  deletePurgeAfter?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type CollectionPreviewCapture = {
  id: string;
  remoteId?: string;
  title: string;
  sourceUrl: string | null;
  thumbnailUrl?: string;
  imageAssetUrl?: string;
  imageAssetCacheKey?: string;
  imageAssetMimeType?: string;
  linkedAt?: number | null;
};

export type ReminderSuggestion = NonNullable<Capture["suggestedReminders"]>[number];
export type ReminderDurationUnit = "minutes" | "hours" | "days" | "weeks";
export type ReminderDatePrecision = "exact" | "day" | "date_range" | "week" | "month_window" | "month" | "unknown";
export type ReminderTimePrecision = "exact" | "time_range" | "unknown";
export type ReminderSource = "analysis" | "ai_prefill" | "manual";
export type ReminderScheduleDraft = {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  datePrecision: ReminderDatePrecision;
  timePrecision: ReminderTimePrecision;
  duration: number;
  durationUnit: ReminderDurationUnit;
  triggerText?: string;
  rationale?: string;
  source: ReminderSource;
};
export type ReminderDraftAction = "keep" | "remove";
export type CollectionDraftAction = "keep" | "remove" | "ignore" | "link" | "create" | "added";
export type NoteSaveState = "idle" | "saving" | "saved" | "error";
export type CaptureComposerMode = "link" | "note" | "image";
export const DEFAULT_CAPTURE_COMPOSER_MODE: CaptureComposerMode = "link";

export type ReminderReviewDecision = {
  index: number;
  action: ReminderDraftAction;
};

export type CollectionReviewDecision =
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

export type CaptureReviewDraft = {
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

export type CaptureStore = {
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
  getCachedCollectionPage?: (userId: string, mode: "active" | "archived") => Promise<string | null>;
  setCachedCollectionPage?: (
    userId: string,
    mode: "active" | "archived",
    collectionsJson: string,
    nextCursor: string | null
  ) => Promise<boolean>;
  updateCapture: (id: string, title: string, note: string, currentSaveIntent: string | null) => Promise<string>;
  confirmCaptureReview?: (id: string, title: string, note: string, currentSaveIntent: string | null) => Promise<string>;
  getReviewDrafts?: () => Promise<string | null>;
  setReviewDrafts?: (draftsJson: string) => Promise<boolean>;
  archiveCapture: (id: string) => Promise<string>;
  restoreCapture: (id: string) => Promise<string>;
  deleteCapture?: (id: string) => Promise<string>;
  undoDeleteCapture?: (id: string) => Promise<string>;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
};

export type AppConfig = {
  apiUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
};

export type NativeAuth = {
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

export type NativeNetwork = {
  requestJson: (
    url: string,
    method: string,
    headersJson: string | null,
    body: string | null
  ) => Promise<string>;
};

export type NativeClipboard = {
  copy: (text: string) => Promise<boolean>;
  paste?: () => Promise<string>;
};

export type CaptureListMode = "active" | "archived";
export type CollectionListMode = "active" | "archived";
export type CollectionCapturesLoadPhase = "idle" | "initial" | "refresh" | "append";
export type LoadPhase = "idle" | "cold" | "refresh" | "append" | "ready" | "error";
export type CaptureImageLoadState = "loaded" | "failed";
export type SearchScope = "active" | "archived" | "all";
export type SearchRemoteMode = "keyword" | "hybrid";
export type HomeListRow =
  | { type: "section"; id: string; title: string }
  | { type: "capture"; id: string; capture: Capture };
export type ToastTone = "neutral" | "success" | "error" | "destructive" | "processing";
export type ToastPlacement = "base" | "bottomNav" | "footer";
export type ToastState = {
  text: string;
  tone?: ToastTone;
  durationMs?: number;
  actionLabel?: string;
  action?: () => void;
};

export type AuthScreenMode = "signin" | "check-email";
export type AuthLoadingState = "magiclink" | "oauth" | "callback" | null;
export type AuthCallbackPayload =
  | {
      kind: "session";
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
    }
  | { kind: "error"; message: string };

export type RemoteCapturePage = {
  captures?: Array<Record<string, any>>;
  next_cursor?: string | null;
};

export type RemoteCollectionPage = {
  collections?: Array<Record<string, any>>;
  next_cursor?: string | null;
};

export type RemoteCaptureDetail = {
  capture?: Record<string, any>;
};

export type AppIconComponent = PhosphorIcon;

export type NavIconProps = {
  color: string;
  selected?: boolean;
  size?: number;
};

export type NavIconComponent = ComponentType<NavIconProps>;
