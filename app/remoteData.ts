import type {
  Capture,
  Collection,
  CollectionChoiceOverride,
  CollectionDecision,
  LinkedCollection,
  VisitTarget
} from "./types";
import {
  LOCAL_PROCESSING_GRACE_MS,
  confidenceRequiresReview,
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

export const CAPTURE_PAGE_SIZE = 18;
export const COLLECTION_CAPTURE_PAGE_SIZE = 18;

export function captureFromRemote(row: Record<string, any>): Capture {
  const analysis = row.analysis ?? {};
  const defaultIntent = analysis.default_intent ?? {};
  const imageAsset = remoteImageAsset(row);
  const assetUrl = imageAsset
    ? nullableValue(imageAsset.signed_url || imageAsset.signedUrl || imageAsset.public_url || imageAsset.publicUrl)
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
  const reviewTargets = normalizeReviewTargets(analysis.review_targets);
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
    reviewRationale: reviewRationaleFromRemote(analysis.review_rationale),
    confidenceLabel: analysis.confidence_label || undefined,
    reviewTargets,
    needsReview: Boolean(
      !reviewConfirmedAtValue &&
        (analysis.needs_review ||
          row.analysis_state === "needs_review" ||
          reviewTargets.length > 0 ||
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

export function visitTargetFromRemote(analysis: Record<string, any>): VisitTarget | null {
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

export function collectionFromRemote(row: Record<string, any>): Collection {
  return {
    id: String(row.id),
    title: String(row.title || ""),
    description: String(row.description || ""),
    status: row.status === "archived" ? "archived" : "active",
    captureCount: Number(row.capture_count || row.captureCount || 0),
    archivedAt: nullableValue(row.archived_at),
    deletedAt: nullableValue(row.deleted_at),
    deletePurgeAfter: nullableValue(row.delete_purge_after),
    createdAt: nullableValue(row.created_at),
    updatedAt: nullableValue(row.updated_at)
  };
}

export function linkedCollectionFromRemote(row: Record<string, any>): LinkedCollection {
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
            processedAt: capture.processedAt ? Number(capture.processedAt) : null
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
            status: collection.status === "archived" ? "archived" : "active",
            captureCount: Number(collection.captureCount || 0)
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
