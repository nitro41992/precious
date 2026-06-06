import { adminClient } from "../supabase.ts";
import { CAPTURE_LIST_SELECT } from "../config.ts";
import { SOURCE_PREVIEW_ROLE } from "../source-previews.ts";
import {
  analysisRequiresReview,
  normalizedReviewAnalysis,
  resolveReviewTargets,
} from "../analysis/review-normalization.ts";
import { scheduleCaptureEmbeddingRefresh } from "./embeddings.ts";

const COLLECTION_PREVIEW_CAPTURE_LIMIT = 4;
const CAPTURE_MEDIA_ROLE = "capture_media";

export {
  applyCollectionChoice,
  clearCollectionSuggestion,
  undoCollectionChoice,
} from "./responses.ts";

export function normalizeCollectionDecision(decision: Record<string, unknown>) {
  const type = decision.type === "existing" ? "existing" : "";
  const confidence = Number(decision.confidence);
  return {
    type,
    collection_id: typeof decision.collection_id === "string" &&
        decision.collection_id.trim()
      ? decision.collection_id.trim()
      : null,
    title: typeof decision.title === "string" ? decision.title.trim() : "",
    description: typeof decision.description === "string"
      ? decision.description.trim()
      : null,
    rationale: typeof decision.rationale === "string"
      ? decision.rationale.trim()
      : "",
    confidence: Number.isFinite(confidence) ? confidence : 0,
  };
}

export function collectionDecisionKey(
  decision: Record<string, unknown>,
  index: number,
) {
  return `${index}:${decision.type || ""}:${
    decision.collectionId || decision.collection_id || decision.title || ""
  }`;
}

export function sameCollectionDecision(
  decision: Record<string, unknown>,
  accepted: Record<string, unknown>,
) {
  const normalized = normalizeCollectionDecision(decision);
  if (
    accepted.collectionId && normalized.collection_id === accepted.collectionId
  ) return true;
  return (
    normalized.type === accepted.type &&
    normalized.title.toLowerCase() ===
      String(accepted.title || "").trim().toLowerCase()
  );
}

export function activeCollectionDecisionRows(
  analysis: Record<string, unknown>,
) {
  return Array.isArray(analysis.collection_decisions)
    ? analysis.collection_decisions as Array<Record<string, unknown>>
    : Array.isArray(analysis.suggested_collections)
    ? analysis.suggested_collections as Array<Record<string, unknown>>
    : [];
}

export function collectionChoiceOverrides(analysis: Record<string, unknown>) {
  return Array.isArray(analysis.collection_choice_overrides)
    ? analysis.collection_choice_overrides.filter((item) =>
      item && typeof item === "object"
    ) as Array<Record<string, unknown>>
    : [];
}

export function choiceRestoredDecisions(override: Record<string, unknown>) {
  return Array.isArray(override.restored_decisions)
    ? override.restored_decisions.filter((item) =>
      item && typeof item === "object"
    ) as Array<Record<string, unknown>>
    : [];
}

export function collectionChoiceOverrideId(
  decision: Record<string, unknown>,
  index: number,
) {
  const collectionId =
    typeof decision.collection_id === "string" && decision.collection_id.trim()
      ? decision.collection_id.trim()
      : typeof decision.collectionId === "string" &&
          decision.collectionId.trim()
      ? decision.collectionId.trim()
      : "";
  return collectionId || `suggestion:${collectionDecisionKey(decision, index)}`;
}

function schemaCacheMissingPreviewColumn(error: unknown) {
  const message = String(
    (error as { message?: unknown; details?: unknown })?.message ||
      (error as { details?: unknown })?.details ||
      error ||
      "",
  );
  return /collection_preview_captures|collection_preview_updated_at|schema cache|column/i
    .test(message);
}

function imageAssetWithRole(
  assets: unknown[],
  role: typeof CAPTURE_MEDIA_ROLE | typeof SOURCE_PREVIEW_ROLE,
) {
  return assets.find((asset) => {
    if (!asset || typeof asset !== "object") return false;
    const record = asset as Record<string, unknown>;
    const mimeType = String(record.mime_type || record.mimeType || "");
    const storagePath = record.storage_path || record.storagePath;
    const publicUrl = record.public_url || record.publicUrl;
    const assetRole = String(record.asset_role || record.assetRole || CAPTURE_MEDIA_ROLE);
    return assetRole === role &&
      mimeType.startsWith("image/") &&
      (typeof storagePath === "string" && storagePath.trim() ||
        typeof publicUrl === "string" && publicUrl.trim());
  }) as Record<string, unknown> | undefined;
}

function previewSnapshotItemFromCapture(
  row: Record<string, unknown>,
  linkedAt: unknown,
) {
  const analysis = row.analysis && typeof row.analysis === "object"
    ? row.analysis as Record<string, unknown>
    : {};
  const urlEvidence = analysis.url_evidence && typeof analysis.url_evidence === "object"
    ? analysis.url_evidence as Record<string, unknown>
    : {};
  const assets = Array.isArray(row.capture_assets) ? row.capture_assets : [];
  const imageAsset = imageAssetWithRole(assets, CAPTURE_MEDIA_ROLE);
  const sourcePreviewAsset = imageAssetWithRole(assets, SOURCE_PREVIEW_ROLE);
  const urlEvidenceImageUrl = typeof urlEvidence.image_url === "string"
    ? urlEvidence.image_url
    : typeof urlEvidence.image === "string"
      ? urlEvidence.image
      : null;
  return {
    id: String(row.client_capture_key || row.id || ""),
    remote_id: String(row.id || row.client_capture_key || ""),
    title: String(
      row.display_title ||
        row.title ||
        analysis.display_title ||
        row.source_url ||
        "Untitled capture",
    ),
    source_url: typeof row.source_url === "string" ? row.source_url : null,
    thumbnail_url: row.thumbnail_url || analysis.thumbnail_url ||
      (analysis.resolved_place &&
          typeof analysis.resolved_place === "object"
        ? (analysis.resolved_place as Record<string, unknown>).thumbnail_url
        : null) ||
      urlEvidenceImageUrl ||
      null,
    url_evidence_image_url: urlEvidenceImageUrl,
    image_asset_storage_path: imageAsset
      ? imageAsset.storage_path || imageAsset.storagePath || null
      : null,
    image_asset_public_url: imageAsset
      ? imageAsset.public_url || imageAsset.publicUrl || null
      : null,
    image_asset_mime_type: imageAsset
      ? imageAsset.mime_type || imageAsset.mimeType || null
      : null,
    source_preview_asset_storage_path: sourcePreviewAsset
      ? sourcePreviewAsset.storage_path || sourcePreviewAsset.storagePath || null
      : null,
    source_preview_asset_public_url: sourcePreviewAsset
      ? sourcePreviewAsset.public_url || sourcePreviewAsset.publicUrl || null
      : null,
    source_preview_asset_mime_type: sourcePreviewAsset
      ? sourcePreviewAsset.mime_type || sourcePreviewAsset.mimeType || null
      : null,
    linked_at: linkedAt || null,
  };
}

function previewItemIdentity(item: Record<string, unknown>) {
  return String(item.id || item.remote_id || item.remoteId || "");
}

function previewSnapshotItemHasImage(item: Record<string, unknown>) {
  return [
    item.thumbnail_url,
    item.thumbnailUrl,
    item.image_asset_storage_path,
    item.imageAssetStoragePath,
    item.image_asset_public_url,
    item.imageAssetPublicUrl,
    item.image_asset_url,
    item.imageAssetUrl,
    item.source_preview_asset_storage_path,
    item.sourcePreviewAssetStoragePath,
    item.source_preview_asset_public_url,
    item.sourcePreviewAssetPublicUrl,
    item.source_preview_asset_url,
    item.sourcePreviewAssetUrl,
  ].some((value) => typeof value === "string" && value.trim());
}

async function updateCollectionPreviewForNewCapture(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  collectionId: string,
  captureId: string,
) {
  const collection = await supabase
    .from("collections")
    .select("collection_preview_captures")
    .eq("user_id", userId)
    .eq("id", collectionId)
    .maybeSingle();
  if (collection.error) {
    if (schemaCacheMissingPreviewColumn(collection.error)) return;
    throw collection.error;
  }

  const capture = await supabase
    .from("captures")
    .select(CAPTURE_LIST_SELECT)
    .eq("user_id", userId)
    .eq("id", captureId)
    .maybeSingle();
  if (capture.error) throw capture.error;
  if (!capture.data) return;

  const linked = await supabase
    .from("collection_capture_links")
    .select("linked_at")
    .eq("user_id", userId)
    .eq("collection_id", collectionId)
    .eq("capture_id", captureId)
    .is("unlinked_at", null)
    .maybeSingle();
  if (linked.error) throw linked.error;

  const nextItem = previewSnapshotItemFromCapture(
    capture.data as unknown as Record<string, unknown>,
    linked.data?.linked_at || new Date().toISOString(),
  );
  if (!nextItem.id) return;

  const existing = Array.isArray(collection.data?.collection_preview_captures)
    ? collection.data.collection_preview_captures as Array<Record<string, unknown>>
    : [];
  const existingWithImages = existing.filter(previewSnapshotItemHasImage);
  if (!previewSnapshotItemHasImage(nextItem)) {
    if (existingWithImages.length !== existing.length) {
      const updated = await supabase
        .from("collections")
        .update({
          collection_preview_captures: existingWithImages.slice(
            0,
            COLLECTION_PREVIEW_CAPTURE_LIMIT,
          ),
          collection_preview_updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("id", collectionId);
      if (updated.error && !schemaCacheMissingPreviewColumn(updated.error)) {
        throw updated.error;
      }
    }
    return;
  }
  const nextId = previewItemIdentity(nextItem);
  const nextPreview = [
    nextItem,
    ...existingWithImages.filter((item) => previewItemIdentity(item) !== nextId),
  ].slice(0, COLLECTION_PREVIEW_CAPTURE_LIMIT);

  const updated = await supabase
    .from("collections")
    .update({
      collection_preview_captures: nextPreview,
      collection_preview_updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", collectionId);
  if (updated.error && !schemaCacheMissingPreviewColumn(updated.error)) {
    throw updated.error;
  }
}

function previewItemMatchesCaptureId(
  item: Record<string, unknown>,
  captureIds: Set<string>,
) {
  const aliases = [
    item.remote_id,
    item.remoteId,
    item.id,
  ].map((value) => String(value || "")).filter(Boolean);
  return aliases.some((alias) => captureIds.has(alias));
}

async function collectionPreviewFromActiveLinks(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  collectionId: string,
) {
  const links = await supabase
    .from("collection_capture_links")
    .select(`linked_at, captures(${CAPTURE_LIST_SELECT})`)
    .eq("user_id", userId)
    .eq("collection_id", collectionId)
    .is("unlinked_at", null)
    .order("linked_at", { ascending: false })
    .limit(100);
  if (links.error) throw links.error;

  const preview: Array<Record<string, unknown>> = [];
  for (const row of links.data ?? []) {
    const record = row as Record<string, unknown>;
    const captures = record.captures;
    const capture = Array.isArray(captures) ? captures[0] : captures;
    if (!capture || typeof capture !== "object") continue;
    const captureRow = capture as Record<string, unknown>;
    if (
      captureRow.archived_at || captureRow.deleted_at || captureRow.rejected_at
    ) {
      continue;
    }
    const item = previewSnapshotItemFromCapture(captureRow, record.linked_at);
    if (item.id && previewSnapshotItemHasImage(item)) preview.push(item);
    if (preview.length >= COLLECTION_PREVIEW_CAPTURE_LIMIT) break;
  }
  return preview;
}

export async function refreshCollectionPreviewFromActiveLinks(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  collectionId: string,
) {
  const collection = await supabase
    .from("collections")
    .select("collection_preview_captures")
    .eq("user_id", userId)
    .eq("id", collectionId)
    .maybeSingle();
  if (collection.error) {
    if (schemaCacheMissingPreviewColumn(collection.error)) return;
    throw collection.error;
  }

  const existing = Array.isArray(collection.data?.collection_preview_captures)
    ? collection.data.collection_preview_captures as Array<Record<string, unknown>>
    : [];
  const nextPreview = await collectionPreviewFromActiveLinks(
    supabase,
    userId,
    collectionId,
  );
  if (JSON.stringify(existing) === JSON.stringify(nextPreview)) return;

  const updated = await supabase
    .from("collections")
    .update({
      collection_preview_captures: nextPreview,
      collection_preview_updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", collectionId);
  if (updated.error && !schemaCacheMissingPreviewColumn(updated.error)) {
    throw updated.error;
  }
}

export async function refreshCollectionPreviewAfterCaptureRemoval(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  collectionId: string,
  captureIds: string[],
) {
  const removedIds = new Set(captureIds.map((id) => id.trim()).filter(Boolean));
  if (!removedIds.size) return;

  const collection = await supabase
    .from("collections")
    .select("collection_preview_captures")
    .eq("user_id", userId)
    .eq("id", collectionId)
    .maybeSingle();
  if (collection.error) {
    if (schemaCacheMissingPreviewColumn(collection.error)) return;
    throw collection.error;
  }

  const existing = Array.isArray(collection.data?.collection_preview_captures)
    ? collection.data.collection_preview_captures as Array<Record<string, unknown>>
    : [];
  if (
    !existing.some((item) => previewItemMatchesCaptureId(item, removedIds))
  ) {
    return;
  }

  await refreshCollectionPreviewFromActiveLinks(supabase, userId, collectionId);
}

export async function linkCaptureToCollection(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  collectionId: string,
  captureId: string,
  fields: {
    createdBy?: string;
    rationale?: string | null;
    confidence?: number | null;
  } = {},
) {
  const active = await supabase
    .from("collection_capture_links")
    .select("id")
    .eq("user_id", userId)
    .eq("collection_id", collectionId)
    .eq("capture_id", captureId)
    .is("unlinked_at", null)
    .maybeSingle();
  if (active.error) throw active.error;
  if (active.data) return active.data;

  const { data, error } = await supabase
    .from("collection_capture_links")
    .insert({
      user_id: userId,
      collection_id: collectionId,
      capture_id: captureId,
      created_by: fields.createdBy || "user",
      rationale: fields.rationale || null,
      confidence: fields.confidence ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  await updateCollectionPreviewForNewCapture(
    supabase,
    userId,
    collectionId,
    captureId,
  );
  scheduleCaptureEmbeddingRefresh(supabase, userId, captureId);
  return data;
}

export function collectionFromRow(
  row: Record<string, unknown>,
  captureCounts = new Map<string, number>(),
) {
  const id = String(row.id);
  return {
    id,
    title: String(row.title || ""),
    description: String(row.description || ""),
    status: String(row.status || "active"),
    created_by: String(row.created_by || "user"),
    archived_at: row.archived_at || null,
    deleted_at: row.deleted_at || null,
    delete_purge_after: row.delete_purge_after || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    capture_count: captureCounts.get(id) || 0,
    preview_captures: Array.isArray(row.collection_preview_captures)
      ? row.collection_preview_captures
      : [],
    collection_preview_updated_at: row.collection_preview_updated_at || null,
  };
}

export async function activeCollectionCounts(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  collectionIds: string[],
) {
  const counts = new Map<string, number>();
  if (!collectionIds.length) return counts;
  const grouped = await supabase.rpc("active_collection_capture_counts", {
    p_user_id: userId,
    p_collection_ids: collectionIds,
  });
  if (!grouped.error) {
    for (const row of grouped.data ?? []) {
      const record = row as Record<string, unknown>;
      counts.set(
        String(record.collection_id),
        Number(record.capture_count || 0),
      );
    }
    return counts;
  }

  const { data, error } = await supabase
    .from("collection_capture_links")
    .select("collection_id")
    .eq("user_id", userId)
    .in("collection_id", collectionIds)
    .is("unlinked_at", null);
  if (error) throw error;
  for (const row of data ?? []) {
    const id = String((row as Record<string, unknown>).collection_id);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

export async function attachLinkedCollections(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  rows: Array<Record<string, unknown>>,
  options: { includeRemovedOverrides?: boolean } = {},
) {
  const includeRemovedOverrides = options.includeRemovedOverrides ?? false;
  const captureIds = rows.map((row) => String(row.id)).filter(Boolean);
  if (!captureIds.length) return rows;
  const { data, error } = await supabase
    .from("collection_capture_links")
    .select(
      "capture_id, collection_id, created_by, rationale, confidence, linked_at, collections(id,title,description,status,deleted_at)",
    )
    .eq("user_id", userId)
    .in("capture_id", captureIds)
    .is("unlinked_at", null);
  if (error) return rows;
  const byCapture = new Map<string, Array<Record<string, unknown>>>();
  const activeCollectionIdsByCapture = new Map<string, Set<string>>();
  for (const link of data ?? []) {
    const record = link as Record<string, unknown>;
    const collection = record.collections as Record<string, unknown> | null;
    if (!collection || collection.status === "archived" || collection.deleted_at) continue;
    const captureId = String(record.capture_id);
    const collectionId = String(collection.id);
    const item = {
      id: collectionId,
      title: String(collection.title || ""),
      description: String(collection.description || ""),
      created_by: String(record.created_by || "user"),
      rationale: record.rationale || null,
      confidence: record.confidence ?? null,
      linked_at: record.linked_at || null,
    };
    byCapture.set(captureId, [...(byCapture.get(captureId) || []), item]);
    activeCollectionIdsByCapture.set(
      captureId,
      new Set([
        ...(activeCollectionIdsByCapture.get(captureId) || []),
        collectionId,
      ]),
    );
  }
  const removed = includeRemovedOverrides
    ? await supabase
      .from("collection_capture_links")
      .select(
        "capture_id, collection_id, rationale, confidence, unlinked_at, collections(id,title,description,status,deleted_at)",
      )
      .eq("user_id", userId)
      .eq("created_by", "analysis")
      .in("capture_id", captureIds)
      .not("unlinked_at", "is", null)
      .order("unlinked_at", { ascending: false })
    : { data: [], error: null };
  const overridesByCapture = new Map<string, Array<Record<string, unknown>>>();
  if (!removed.error) {
    for (const link of removed.data ?? []) {
      const record = link as Record<string, unknown>;
      const captureId = String(record.capture_id || "");
      const collectionId = String(record.collection_id || "");
      if (
        !captureId || !collectionId ||
        activeCollectionIdsByCapture.get(captureId)?.has(collectionId)
      ) continue;
      if (
        overridesByCapture.get(captureId)?.some((override) =>
          override.collection_id === collectionId
        )
      ) continue;
      const collection = record.collections as Record<string, unknown> | null;
      if (!collection || collection.status === "archived" || collection.deleted_at) continue;
      overridesByCapture.set(captureId, [
        ...(overridesByCapture.get(captureId) || []),
        {
          collection_id: collectionId,
          source: "analysis",
          restored_decisions: [
            {
              type: "existing",
              collection_id: collectionId,
              title: String(collection.title || ""),
              description: typeof collection.description === "string"
                ? collection.description
                : null,
              rationale: typeof record.rationale === "string"
                ? record.rationale
                : "",
              confidence: Number.isFinite(Number(record.confidence))
                ? Number(record.confidence)
                : 0,
            },
          ],
          applied_at: record.unlinked_at || null,
        },
      ]);
    }
  }
  return rows.map((row) => {
    const captureId = String(row.id);
    const analysis = row.analysis && typeof row.analysis === "object"
      ? row.analysis as Record<string, unknown>
      : {};
    const existingOverrides = collectionChoiceOverrides(analysis);
    const existingOverrideIds = new Set(
      existingOverrides.map((override) => String(override.collection_id || "")),
    );
    const recoveredOverrides = (overridesByCapture.get(captureId) || [])
      .filter((override) =>
        !existingOverrideIds.has(String(override.collection_id || ""))
      );
    return {
      ...row,
      analysis: recoveredOverrides.length
        ? {
          ...analysis,
          collection_choice_overrides: [
            ...existingOverrides,
            ...recoveredOverrides,
          ],
        }
        : row.analysis,
      linked_collections: byCapture.get(captureId) || [],
    };
  });
}

export async function preserveAiCollectionSuggestionForUnlink(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  captureId: string,
  collectionId: string,
) {
  const link = await supabase
    .from("collection_capture_links")
    .select(
      "created_by, rationale, confidence, collections(id,title,description)",
    )
    .eq("user_id", userId)
    .eq("collection_id", collectionId)
    .eq("capture_id", captureId)
    .is("unlinked_at", null)
    .maybeSingle();
  if (link.error) throw link.error;
  if (!link.data || link.data.created_by !== "analysis") return;

  const capture = await supabase
    .from("captures")
    .select("id, analysis, review_confirmed_at")
    .eq("user_id", userId)
    .eq("id", captureId)
    .maybeSingle();
  if (capture.error) throw capture.error;
  if (!capture.data) return;

  const collection = Array.isArray(link.data.collections)
    ? link.data.collections[0] as Record<string, unknown> | undefined
    : link.data.collections as Record<string, unknown> | undefined;
  if (!collection) return;

  const currentAnalysis =
    capture.data.analysis && typeof capture.data.analysis === "object"
      ? capture.data.analysis as Record<string, unknown>
      : {};
  const restoredDecision = {
    type: "existing",
    collection_id: collectionId,
    title: String(collection.title || ""),
    description: typeof collection.description === "string"
      ? collection.description
      : null,
    rationale: typeof link.data.rationale === "string"
      ? link.data.rationale
      : "",
    confidence: Number.isFinite(Number(link.data.confidence))
      ? Number(link.data.confidence)
      : 0,
  };
  const overrides = collectionChoiceOverrides(currentAnalysis)
    .filter((override) =>
      String(override.collection_id || "") !== collectionId
    );
  overrides.push({
    collection_id: collectionId,
    source: "analysis",
    restored_decisions: [restoredDecision],
    applied_at: new Date().toISOString(),
  });
  const nextAnalysis = normalizedReviewAnalysis(
    {
      ...resolveReviewTargets(
        currentAnalysis,
        ["collections", "analysis"],
        capture.data.review_confirmed_at,
      ),
      collection_choice_overrides: overrides,
    },
    capture.data.review_confirmed_at,
  );
  const update = await supabase
    .from("captures")
    .update({
      analysis: nextAnalysis,
      analysis_state:
        analysisRequiresReview(nextAnalysis, capture.data.review_confirmed_at)
          ? "needs_review"
          : "ready",
    })
    .eq("user_id", userId)
    .eq("id", captureId);
  if (update.error) throw update.error;
}
