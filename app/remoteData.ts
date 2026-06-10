import type {
  Capture,
  CaptureFieldRationales,
  Collection,
  CollectionChoiceOverride,
  CollectionDecision,
  CollectionPreviewCapture,
  ReminderSuggestion,
  LinkedCollection,
  ResolvedPlace,
  VisitTarget
} from "./types";
import {
  LOCAL_PROCESSING_GRACE_MS,
  displayStatus,
  hostFromUrl,
  isDeleted,
  normalizeReviewTargets,
  sortCaptures
} from "./captureLogic";
import {
  remoteImageAsset,
  reviewRationaleFromRemote,
  uniqueCaptures
} from "./capturePresentation";
import type { CalendarEvent } from "./calendarLogic";

export const CAPTURE_PAGE_SIZE = 18;
export const COLLECTION_CAPTURE_PAGE_SIZE = 18;

function cleanTitleCandidate(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function sourceOnlyTitleCandidate(
  value: unknown,
  sourceUrl: string | null,
  sourceLabel?: string | null
) {
  const title = cleanTitleCandidate(value).toLowerCase();
  if (!title) return true;
  if (/^saved\s+from\s+/i.test(title)) return true;
  if (/^https?:\/\//i.test(title)) return true;
  if (/^(instagram|tiktok|youtube|reddit|facebook|x|twitter)\s+(reel|short|video|post|link|share)$/i.test(title)) {
    return true;
  }
  if (/^[a-z0-9.-]+\/\S+/i.test(title)) return true;
  const host = hostFromUrl(sourceUrl).toLowerCase();
  const source = String(sourceLabel || "").trim().toLowerCase();
  if (host && title.startsWith(`${host}/`)) return true;
  if (host && (title === host || title === host.replace(/^www\./, ""))) return true;
  if (source && title === source) return true;
  return !title.includes(" ") && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(title);
}

function genericRemoteTitle(row: Record<string, any>) {
  const captureType = String(row.capture_type || row.captureType || row.analysis?.capture_type || "").toLowerCase();
  if (row.source_url || row.sourceUrl) return "Saved link";
  if (captureType === "image" || captureType === "screenshot" || captureType === "mixed") return "Saved image";
  if (row.source_text || row.sourceText) return "Saved note";
  return "Saved capture";
}

function bestRemoteTitle(row: Record<string, any>, analysis: Record<string, any>) {
  const sourceUrl = typeof row.source_url === "string"
    ? row.source_url
    : typeof row.sourceUrl === "string"
      ? row.sourceUrl
      : null;
  const sourceLabel = analysis?.url_evidence?.source_domain || analysis?.url_evidence?.site_name || hostFromUrl(sourceUrl);
  const candidates = [
    row.title,
    analysis.display_title,
    row.display_title,
    row.displayTitle,
    analysis.summary
  ];
  for (const candidate of candidates) {
    const title = cleanTitleCandidate(candidate);
    if (title && !sourceOnlyTitleCandidate(title, sourceUrl, sourceLabel)) {
      return title;
    }
  }
  return genericRemoteTitle(row);
}

export function captureFromRemote(row: Record<string, any>): Capture {
  const analysis = row.analysis ?? {};
  const defaultIntent = analysis.default_intent ?? {};
  const imageAsset = remoteImageAsset(row);
  const sourcePreviewAsset = remoteImageAsset(row, "source_preview");
  const assetUrl = imageAsset
    ? nullableValue(imageAsset.signed_url || imageAsset.signedUrl || imageAsset.public_url || imageAsset.publicUrl)
    : undefined;
  const assetFullUrl = imageAsset
    ? nullableValue(imageAsset.signed_full_url || imageAsset.signedFullUrl || imageAsset.public_url || imageAsset.publicUrl)
    : undefined;
  const sourcePreviewAssetUrl = sourcePreviewAsset
    ? nullableValue(sourcePreviewAsset.signed_url || sourcePreviewAsset.signedUrl || sourcePreviewAsset.public_url || sourcePreviewAsset.publicUrl)
    : undefined;
  const archivedAtValue = row.archived_at || analysis.archived_at || null;
  const deletedAtValue =
    row.deleted_at ||
    analysis.deleted_at ||
    (analysis.capture_state === "deleted" || row.capture_state === "deleted" ? row.updated_at || Date.now() : null) ||
    (archivedAtValue || analysis.capture_state === "archived" || row.capture_state === "archived"
      ? archivedAtValue || row.updated_at || Date.now()
      : null);
  const deletePurgeAfterValue = row.delete_purge_after || analysis.delete_purge_after || null;
  const rejectedAtValue = row.rejected_at || analysis.rejected_at || null;
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
  // A resolved AI suggestion is a real (status='suggested') collection the capture is linked to.
  // Normalize it here into a LinkedCollection with status "suggested" so the rest of the app
  // treats suggested and real memberships through one model (see suggestedLinkedCollection).
  const pendingSuggestionRaw = analysis.pending_collection_suggestion;
  const suggestionLink: LinkedCollection | null = pendingSuggestionRaw &&
      typeof pendingSuggestionRaw === "object" &&
      typeof pendingSuggestionRaw.collection_id === "string" &&
      pendingSuggestionRaw.collection_id
    ? {
        id: String(pendingSuggestionRaw.collection_id),
        title: String(pendingSuggestionRaw.title || ""),
        description: String(pendingSuggestionRaw.description || ""),
        createdBy: "analysis",
        rationale: String(pendingSuggestionRaw.rationale || "") || null,
        confidence: Number(pendingSuggestionRaw.confidence) || null,
        linkedAt: null,
        status: "suggested"
      }
    : null;
  const baseLinkedCollections: LinkedCollection[] = Array.isArray(row.linked_collections)
    ? row.linked_collections.map(linkedCollectionFromRemote)
    : Array.isArray(analysis.linked_collections)
      ? analysis.linked_collections.map(linkedCollectionFromRemote)
      : [];
  const linkedCollections = suggestionLink
    ? [...baseLinkedCollections.filter((collection) => collection.id !== suggestionLink.id), suggestionLink]
    : baseLinkedCollections;
  const collectionSuggestionState =
    row.collection_suggestion_state === "pending"
      ? "pending"
      : row.collection_suggestion_state === "ready"
        ? "ready"
        : "none";
  const reviewTargets = Array.isArray(analysis.review_targets)
    ? normalizeReviewTargets(analysis.review_targets)
    : analysis.needs_review || row.analysis_state === "needs_review"
      ? ["analysis" as const]
      : [];
  const visibleNeedsReview = reviewTargets.includes("analysis");
  const remoteHasExtractedData = Boolean(
    row.default_intent ||
      analysis.summary ||
      defaultIntent.category
  );
  return {
    id: String(row.client_capture_key || row.id),
    remoteId: String(row.id || row.client_capture_key || ""),
    title: bestRemoteTitle(row, analysis),
    sourceText: String(row.source_text || ""),
    sourceUrl: typeof row.source_url === "string" ? row.source_url : null,
    siteName: hostFromUrl(typeof row.source_url === "string" ? row.source_url : null),
    summary: analysis.summary || undefined,
    captureType: nullableValue(row.capture_type || row.captureType || analysis.capture_type),
    thumbnailUrl: nullableValue(
      row.thumbnail_url ||
        row.thumbnailUrl ||
        analysis.thumbnail_url ||
        analysis.resolved_place?.thumbnail_url
    ),
    imageAssetUrl: assetUrl,
    imageAssetCacheKey: imageAsset
      ? nullableValue(imageAsset.signed_url_cache_key || imageAsset.signedUrlCacheKey)
      : undefined,
    imageAssetFullUrl: assetFullUrl,
    imageAssetFullCacheKey: imageAsset
      ? nullableValue(imageAsset.signed_full_url_cache_key || imageAsset.signedFullUrlCacheKey)
      : undefined,
    imageAssetMimeType: imageAsset ? nullableValue(imageAsset.mime_type || imageAsset.mimeType) : undefined,
    sourcePreviewAssetUrl,
    sourcePreviewAssetCacheKey: sourcePreviewAsset
      ? nullableValue(sourcePreviewAsset.signed_url_cache_key || sourcePreviewAsset.signedUrlCacheKey)
      : undefined,
    sourcePreviewAssetMimeType: sourcePreviewAsset
      ? nullableValue(sourcePreviewAsset.mime_type || sourcePreviewAsset.mimeType)
      : undefined,
    urlEvidence: analysis.url_evidence || row.urlEvidence || null,
    analysisMode,
    analysisProvider: nullableValue(row.analysis_provider),
    analysisModel: nullableValue(row.analysis_model),
    analysisError: row.analysis_error || undefined,
    aiDefaultIntent: defaultIntent.category || undefined,
    defaultIntent: row.current_save_intent || row.default_intent || defaultIntent.category || undefined,
    intentRationale: row.intent_rationale || defaultIntent.rationale || undefined,
    fieldRationales: fieldRationalesFromRemote(analysis.field_rationales),
    reviewRationale: reviewRationaleFromRemote(analysis.review_rationale),
    reviewRationaleStatus:
      analysis.review_rationale_status === "accepted" || analysis.review_rationale_status === "neutral_fallback"
        ? analysis.review_rationale_status
        : undefined,
    reviewRationaleInvalidReason: nullableValue(analysis.review_rationale_invalid_reason),
    reviewRationaleInvalidField: nullableValue(analysis.review_rationale_invalid_field),
    confidenceLabel: analysis.confidence_label || undefined,
    reviewTargets,
    needsReview: Boolean(
      !reviewConfirmedAtValue && visibleNeedsReview
    ),
    entities: analysis.entities || [],
    visitTarget: visitTargetFromRemote(analysis),
    suggestedReminders: reminderSuggestionsFromRemote(analysis.suggested_reminders),
    linkedCollections,
    collectionDecisions,
    suggestedCollections: collectionDecisions,
    collectionSuggestionState,
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
    deletedAt:
      deletedAtValue
        ? typeof deletedAtValue === "number"
          ? deletedAtValue
          : Date.parse(String(deletedAtValue))
        : null,
    deletePurgeAfter:
      deletePurgeAfterValue
        ? typeof deletePurgeAfterValue === "number"
          ? deletePurgeAfterValue
          : Date.parse(String(deletePurgeAfterValue))
        : null,
    rejectedAt:
      rejectedAtValue || analysis.capture_state === "rejected" || row.capture_state === "rejected"
        ? typeof rejectedAtValue === "number"
          ? rejectedAtValue
          : rejectedAtValue
            ? Date.parse(String(rejectedAtValue))
            : row.updated_at
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
        : row.analysis_state === "failed"
          ? "failed"
        : row.analysis_state === "needs_review" && visibleNeedsReview
          ? "needs_review"
          : remoteHasExtractedData
            ? "ready"
            : "processing",
    createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
    updatedAt: row.updated_at ? Date.parse(row.updated_at) : Date.now(),
    processedAt: row.processed_at ? Date.parse(row.processed_at) : null
  };
}

export function nullableValue(value: unknown) {
  if (value === null || value === undefined) return undefined;
  const text = String(value);
  return text && text !== "null" ? text : undefined;
}

export function nullableTimestamp(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function validReminderDate(value: unknown) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function hasReminderDate(value: Record<string, any>) {
  return [value.start_date, value.trigger_date, value.date_window_start].some(
    validReminderDate
  );
}

export function reminderSuggestionsFromRemote(value: unknown): ReminderSuggestion[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, any> =>
      Boolean(
        item &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          item.trigger_type === "time" &&
          hasReminderDate(item)
      )
    )
    .map((item) => ({
      ...item,
      trigger_type: "time",
      trigger_value: String(item.trigger_value || item.trigger_text || item.start_date || item.trigger_date || ""),
      rationale: String(item.rationale || ""),
      confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : 0
    }));
}

export function fieldRationalesFromRemote(value: unknown): CaptureFieldRationales | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, any>;
  const purpose = row.purpose && typeof row.purpose === "object" && !Array.isArray(row.purpose)
    ? row.purpose as Record<string, any>
    : null;
  const reminder = row.reminder && typeof row.reminder === "object" && !Array.isArray(row.reminder)
    ? row.reminder as Record<string, any>
    : null;
  const collections = Array.isArray(row.collections)
    ? row.collections
        .filter((item): item is Record<string, any> =>
          Boolean(item && typeof item === "object" && !Array.isArray(item))
        )
        .map((item) => ({
          collectionId: nullableValue(item.collection_id || item.collectionId) || null,
          selectionLabel: nullableValue(item.selection_label || item.selectionLabel) || null,
          text: nullableValue(item.text) || null
        }))
        .filter((item) => Boolean(item.collectionId || item.selectionLabel || item.text))
    : [];
  const next: CaptureFieldRationales = {};
  if (purpose) {
    next.purpose = {
      selectionKey: nullableValue(purpose.selection_key || purpose.selectionKey) || null,
      selectionLabel: nullableValue(purpose.selection_label || purpose.selectionLabel) || null,
      text: nullableValue(purpose.text) || null
    };
  }
  if (collections.length) next.collections = collections;
  if (reminder) {
    next.reminder = {
      triggerValue: nullableValue(reminder.trigger_value || reminder.triggerValue) || null,
      startDate: nullableValue(reminder.start_date || reminder.startDate) || null,
      endDate: nullableValue(reminder.end_date || reminder.endDate) || null,
      startTime: nullableValue(reminder.start_time || reminder.startTime) || null,
      endTime: nullableValue(reminder.end_time || reminder.endTime) || null,
      text: nullableValue(reminder.text) || null
    };
  }
  return Object.keys(next).length ? next : undefined;
}

export function visitTargetFromRemote(analysis: Record<string, any>): VisitTarget | null {
  const name = nullableValue(analysis.visit_target_name);
  const query = nullableValue(analysis.visit_target_query);
  const confidence = analysis.visit_target_confidence;
  const resolvedPlace = resolvedPlaceFromRemote(analysis.resolved_place);
  if (!name || !query || !["high", "medium", "low"].includes(confidence)) {
    if (resolvedPlace?.status === "resolved") {
      const resolvedName = resolvedPlace.displayName || resolvedPlace.resolvedQuery || "Saved place";
      const resolvedQuery = resolvedPlace.formattedAddress || resolvedPlace.resolvedQuery || resolvedName;
      return {
        name: resolvedName,
        query: resolvedQuery,
        confidence: "high",
        evidence: [],
        verifiedPlace: true,
        resolvedPlace
      };
    }
    return null;
  }
  return {
    name,
    query,
    confidence,
    evidence: Array.isArray(analysis.visit_target_evidence)
      ? analysis.visit_target_evidence.map(String).filter(Boolean)
      : [],
    verifiedPlace: analysis.verified_place === true || resolvedPlace?.status === "resolved",
    resolvedPlace
  };
}

export function resolvedPlaceFromRemote(value: unknown): ResolvedPlace | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, any>;
  const status = nullableValue(row.status);
  if (
    status !== "resolved" &&
    status !== "not_found" &&
    status !== "ambiguous" &&
    status !== "failed" &&
    status !== "skipped_no_key" &&
    status !== "skipped_no_target"
  ) {
    return null;
  }
  const location = row.location_snapshot && typeof row.location_snapshot === "object"
    ? row.location_snapshot as Record<string, any>
    : null;
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  return {
    status,
    provider: "google_places",
    placeId: nullableValue(row.place_id || row.placeId) || null,
    resourceName: nullableValue(row.resource_name || row.resourceName) || null,
    resolvedQuery: nullableValue(row.resolved_query || row.resolvedQuery) || null,
    resolvedAt: nullableValue(row.resolved_at || row.resolvedAt) || null,
    dataExpiresAt: nullableValue(row.data_expires_at || row.dataExpiresAt) || null,
    displayName: nullableValue(row.display_name_snapshot || row.displayName) || null,
    formattedAddress: nullableValue(row.formatted_address_snapshot || row.formattedAddress) || null,
    location: Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { latitude, longitude }
      : null,
    googleMapsUri: nullableValue(row.google_maps_uri || row.googleMapsUri) || null,
    thumbnailStatus: row.thumbnail_status === "available" ? "available" : "unavailable",
    thumbnailUrl: nullableValue(row.thumbnail_url || row.thumbnailUrl) || null,
    thumbnailAttribution: Array.isArray(row.thumbnail_attribution || row.thumbnailAttribution)
      ? (row.thumbnail_attribution || row.thumbnailAttribution).map((item: Record<string, any>) => ({
        displayName: nullableValue(item.display_name || item.displayName) || null,
        uri: nullableValue(item.uri) || null,
        photoUri: nullableValue(item.photo_uri || item.photoUri) || null
      }))
      : [],
    matchReason: nullableValue(row.match_reason || row.matchReason) || null,
    error: nullableValue(row.error) || null
  };
}

export function isEdgeCaptureApi(apiUrl: string) {
  return apiUrl.includes("/functions/v1/");
}

export function captureListUrl(apiUrl: string, archived = false, params: { limit?: number; before?: string | null } = {}) {
  const url = new URL(isEdgeCaptureApi(apiUrl) ? apiUrl : `${apiUrl}/api/captures`);
  if (!isEdgeCaptureApi(apiUrl)) url.searchParams.set("view", "summary");
  url.searchParams.set("limit", String(params.limit || CAPTURE_PAGE_SIZE));
  url.searchParams.set("archived", archived ? "true" : "false");
  url.searchParams.set("includeRejectedTombstones", "true");
  if (params.before) url.searchParams.set("before", params.before);
  return url.toString();
}

export function captureMutationUrl(apiUrl: string) {
  return isEdgeCaptureApi(apiUrl) ? apiUrl : `${apiUrl}/api/captures`;
}

export function captureDetailUrl(apiUrl: string, captureRef: string) {
  const url = new URL(isEdgeCaptureApi(apiUrl) ? apiUrl : `${apiUrl}/api/captures`);
  url.searchParams.set("clientCaptureKey", captureRef);
  return url.toString();
}

export function edgeResourceUrl(apiUrl: string, resource: string, params: Record<string, string> = {}) {
  const url = new URL(isEdgeCaptureApi(apiUrl) ? apiUrl : `${apiUrl}/api/captures`);
  url.searchParams.set("resource", resource);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

export function calendarEventsUrl(apiUrl: string, params: { from: string; to: string }) {
  return edgeResourceUrl(apiUrl, "events", { from: params.from, to: params.to });
}

export function calendarEventMutationUrl(apiUrl: string) {
  return edgeResourceUrl(apiUrl, "events");
}

// Postgres `time` serializes as "HH:MM:SS"; the app's reminder utilities expect "HH:mm".
function trimRemoteTime(value: unknown): string {
  const text = String(value || "");
  return /^\d{2}:\d{2}/.test(text) ? text.slice(0, 5) : "";
}

const CALENDAR_DATE_PRECISIONS = new Set([
  "exact",
  "day",
  "date_range",
  "week",
  "month_window",
  "month",
  "unknown"
]);
const CALENDAR_TIME_PRECISIONS = new Set(["exact", "time_range", "unknown"]);
const CALENDAR_DURATION_UNITS = new Set(["minutes", "hours", "days", "weeks"]);

export function eventFromRemote(row: Record<string, any>): CalendarEvent {
  const startDate = String(row.start_date || "");
  const startTime = trimRemoteTime(row.start_time);
  const durationUnit = CALENDAR_DURATION_UNITS.has(String(row.duration_unit))
    ? (String(row.duration_unit) as CalendarEvent["durationUnit"])
    : null;
  return {
    id: String(row.id),
    captureId: nullableValue(row.capture_id) || null,
    title: String(row.title || ""),
    startDate,
    endDate: String(row.end_date || startDate),
    startTime,
    endTime: startTime ? trimRemoteTime(row.end_time) : "",
    allDay: row.all_day === true || !startTime,
    duration: Number.isFinite(Number(row.duration)) && Number(row.duration) > 0
      ? Number(row.duration)
      : null,
    durationUnit,
    datePrecision: CALENDAR_DATE_PRECISIONS.has(String(row.date_precision))
      ? (String(row.date_precision) as CalendarEvent["datePrecision"])
      : "exact",
    timePrecision: CALENDAR_TIME_PRECISIONS.has(String(row.time_precision))
      ? (String(row.time_precision) as CalendarEvent["timePrecision"])
      : "unknown",
    timezone: nullableValue(row.timezone) || null,
    source: row.source === "manual" ? "manual" : "analysis",
    status: row.status === "confirmed" || row.status === "dismissed" ? row.status : "detected",
    reminderIndex: Number.isFinite(Number(row.reminder_index)) ? Number(row.reminder_index) : null
  };
}

export function normalizeCollectionStatus(value: unknown): Collection["status"] {
  return value === "archived" ? "archived" : value === "suggested" ? "suggested" : "active";
}

export function collectionFromRemote(row: Record<string, any>): Collection {
  return {
    id: String(row.id),
    title: String(row.title || ""),
    description: String(row.description || ""),
    status: normalizeCollectionStatus(row.status),
    captureCount: Number(row.capture_count || row.captureCount || 0),
    previewCaptures: collectionPreviewCapturesFromRemote(row.preview_captures || row.previewCaptures),
    archivedAt: nullableValue(row.archived_at),
    deletedAt: nullableValue(row.deleted_at),
    deletePurgeAfter: nullableValue(row.delete_purge_after),
    createdAt: nullableValue(row.created_at),
    updatedAt: nullableValue(row.updated_at)
  };
}

export function collectionPreviewCapturesFromRemote(value: unknown): CollectionPreviewCapture[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, any> =>
      Boolean(item && typeof item === "object" && !Array.isArray(item))
    )
    .map((item) => ({
      id: String(item.id || item.client_capture_key || item.remoteId || item.remote_id || ""),
      remoteId: nullableValue(item.remote_id || item.remoteId) || undefined,
      title: bestRemoteTitle(item, item.analysis || {}),
      sourceUrl: nullableValue(item.source_url || item.sourceUrl) || null,
      thumbnailUrl: nullableValue(item.thumbnail_url || item.thumbnailUrl || item.url_evidence_image_url || item.urlEvidenceImageUrl),
      imageAssetUrl: nullableValue(item.image_asset_url || item.imageAssetUrl),
      imageAssetCacheKey: nullableValue(item.image_asset_cache_key || item.imageAssetCacheKey),
      imageAssetMimeType: nullableValue(item.image_asset_mime_type || item.imageAssetMimeType),
      sourcePreviewAssetUrl: nullableValue(item.source_preview_asset_url || item.sourcePreviewAssetUrl),
      sourcePreviewAssetCacheKey: nullableValue(item.source_preview_asset_cache_key || item.sourcePreviewAssetCacheKey),
      sourcePreviewAssetMimeType: nullableValue(item.source_preview_asset_mime_type || item.sourcePreviewAssetMimeType),
      linkedAt: nullableTimestamp(item.linked_at || item.linkedAt)
    }))
    .filter((item) => item.id);
}

export function linkedCollectionFromRemote(row: Record<string, any>): LinkedCollection {
  return {
    id: String(row.id || row.collection_id || ""),
    title: String(row.title || ""),
    description: nullableValue(row.description),
    createdBy: nullableValue(row.created_by || row.createdBy),
    rationale: nullableValue(row.rationale) || null,
    confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : null,
    linkedAt: nullableTimestamp(row.linked_at || row.linkedAt),
    status: row.status === "suggested" ? "suggested" : "active"
  };
}

// One model for collection membership: a capture's linkedCollections holds both real memberships
// (status "active") and a resolved AI suggestion (status "suggested"). The split helpers live in
// capturePresentation (remoteData imports from it, so they can't live here without a cycle); they
// are re-exported so consumers can pull them from either module.
export { activeLinkedCollections, suggestedLinkedCollection } from "./capturePresentation";

export function collectionDecisionFromRemote(row: Record<string, any>): CollectionDecision | null {
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

export function collectionChoiceOverrideFromRemote(row: Record<string, any>): CollectionChoiceOverride | null {
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

// Fold a legacy `pendingSuggestion` field (older cache shape) into linkedCollections as a
// status:"suggested" entry. No-op for current rows, which already carry it in linkedCollections.
function foldLegacyPendingSuggestion(capture: Partial<Capture>): LinkedCollection[] {
  const linked = Array.isArray(capture.linkedCollections) ? capture.linkedCollections : [];
  const legacy = (capture as Record<string, any>).pendingSuggestion;
  if (!legacy || typeof legacy !== "object" || !legacy.collectionId) return linked;
  if (linked.some((collection) => collection.status === "suggested")) return linked;
  return [
    ...linked.filter((collection) => collection.id !== String(legacy.collectionId)),
    {
      id: String(legacy.collectionId),
      title: String(legacy.title || ""),
      description: String(legacy.description || ""),
      createdBy: "analysis",
      rationale: String(legacy.rationale || "") || null,
      confidence: Number(legacy.confidence) || null,
      linkedAt: null,
      status: "suggested"
    }
  ];
}

export function cachedCapturePageFromRaw(raw: string | null | undefined) {
  if (!raw) return { present: false, captures: [] as Capture[], nextCursor: null as string | null };
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
            archivedAt: capture.archivedAt ? Number(capture.archivedAt) : null,
            deletedAt: capture.deletedAt ? Number(capture.deletedAt) : null,
            deletePurgeAfter: capture.deletePurgeAfter ? Number(capture.deletePurgeAfter) : null,
            processedAt: capture.processedAt ? Number(capture.processedAt) : null,
            // Back-compat: fold a legacy pendingSuggestion (from a cache written by the previous
            // app version) into linkedCollections so the first paint still shows it. The network
            // refresh that follows hydration replaces it with the normalized shape.
            linkedCollections: foldLegacyPendingSuggestion(capture)
          }))
      : [];
    return {
      present: true,
      captures,
      nextCursor: nullableValue(parsed.next_cursor || parsed.nextCursor) || null
    };
  } catch {
    return { present: false, captures: [] as Capture[], nextCursor: null as string | null };
  }
}

export function cachedCollectionPageFromRaw(raw: string | null | undefined) {
  if (!raw) return { present: false, collections: [] as Collection[], nextCursor: null as string | null };
  try {
    const parsed = JSON.parse(raw) as { collections?: unknown; next_cursor?: unknown; nextCursor?: unknown };
    const collections = Array.isArray(parsed.collections)
      ? parsed.collections
          .filter((item): item is Collection => {
            if (!item || typeof item !== "object") return false;
            const collection = item as Partial<Collection>;
            return typeof collection.id === "string" && typeof collection.title === "string";
          })
          .map((collection): Collection => ({
            ...collection,
            description: String(collection.description || ""),
            status: normalizeCollectionStatus(collection.status),
            captureCount: Number(collection.captureCount || 0),
            previewCaptures: collectionPreviewCapturesFromRemote(collection.previewCaptures)
          }))
      : [];
    return {
      present: true,
      collections,
      nextCursor: nullableValue(parsed.next_cursor || parsed.nextCursor) || null
    };
  } catch {
    return { present: false, collections: [] as Collection[], nextCursor: null as string | null };
  }
}

export function freshLocalProcessingCaptures(raw: string | null | undefined) {
  if (!raw) return [] as Capture[];
  try {
    const now = Date.now();
    const captures = JSON.parse(raw || "[]") as Capture[];
    return sortCaptures(captures.filter((capture) => isFreshLocalProcessingCapture(capture, now)));
  } catch {
    return [];
  }
}

// Find a single capture in the raw native-store JSON by id (or remoteId). Used
// by the notification deep-link open to surface the just-finished capture
// instantly, before the hosted feed reloads. Tolerant of missing/garbled JSON.
export function pickCaptureFromRaw(raw: string | null | undefined, captureId: string): Capture | null {
  if (!raw || !captureId) return null;
  try {
    const captures = JSON.parse(raw || "[]") as Capture[];
    return (
      captures.find((capture) => capture.id === captureId || capture.remoteId === captureId) ?? null
    );
  } catch {
    return null;
  }
}

export function isFreshLocalProcessingCapture(capture: Capture, now = Date.now()) {
  return (
    !isDeleted(capture) &&
    displayStatus(capture) === "processing" &&
    now - capture.createdAt < LOCAL_PROCESSING_GRACE_MS
  );
}

export function captureBelongsToCollection(capture: Capture, collectionId: string) {
  return (capture.linkedCollections || []).some((collection) => collection.id === collectionId);
}

export function collectionLinkTimestamp(capture: Capture, collectionId: string) {
  const linkedCollection = (capture.linkedCollections || []).find((collection) => collection.id === collectionId);
  return nullableTimestamp(linkedCollection?.linkedAt);
}

export function sortCollectionCaptures(captures: Capture[], collectionId: string) {
  return uniqueCaptures(captures).sort((left, right) => {
    const rightLinkedAt = collectionLinkTimestamp(right, collectionId) || 0;
    const leftLinkedAt = collectionLinkTimestamp(left, collectionId) || 0;
    if (rightLinkedAt !== leftLinkedAt) return rightLinkedAt - leftLinkedAt;
    return right.createdAt - left.createdAt;
  });
}

export function sameStringSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}
