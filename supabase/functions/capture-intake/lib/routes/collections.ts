import { adminClient } from "../supabase.ts";
import { COLLECTION_LIST_SELECT } from "../config.ts";
import { boundedLimit, isUuid } from "../common.ts";
import { json } from "../http.ts";
import { captureAssetCacheKey, signedCaptureAssetUrl } from "../capture-records.ts";
import { SOURCE_PREVIEW_ROLE } from "../source-previews.ts";
import { activeCollectionCounts, collectionFromRow, linkCaptureToCollection } from "../collections/links.ts";
import { scheduleCaptureEmbeddingRefresh, scheduleCollectionCaptureEmbeddingsRefresh, upsertCollectionEmbedding } from "../collections/embeddings.ts";
import { markCollectionDecisionAccepted } from "../collections/review-decisions.ts";
import { cleanRequiredText } from "../collections/responses.ts";
import { seedStarterCollectionsIfNeeded } from "../collections/starter-collections.ts";

async function signedCollectionPreviewCaptures(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  value: unknown,
) {
  if (!Array.isArray(value)) return [];
  const previewItems = value
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object" && !Array.isArray(item))
    )
    .slice(0, 4);
  const captureIds = previewItems
    .map((item) => String(item.remote_id || item.remoteId || ""))
    .filter((id) => isUuid(id));
  const sourcePreviewByCaptureId = new Map<string, Record<string, unknown>>();
  if (captureIds.length) {
    const sourcePreviewAssets = await supabase
      .from("capture_assets")
      .select("capture_id,storage_path,public_url,mime_type")
      .eq("user_id", userId)
      .eq("asset_role", SOURCE_PREVIEW_ROLE)
      .in("capture_id", captureIds);
    if (sourcePreviewAssets.error) throw sourcePreviewAssets.error;
    for (const asset of sourcePreviewAssets.data ?? []) {
      const record = asset as Record<string, unknown>;
      const captureId = String(record.capture_id || "");
      const mimeType = String(record.mime_type || "");
      const storagePath = String(record.storage_path || "");
      const publicUrl = String(record.public_url || "");
      if (captureId && mimeType.startsWith("image/") && (storagePath || publicUrl)) {
        sourcePreviewByCaptureId.set(captureId, record);
      }
    }
  }
  const items = await Promise.all(
    previewItems
      .map(async (item) => {
        const storagePath = typeof item.image_asset_storage_path === "string"
          ? item.image_asset_storage_path
          : "";
        const publicUrl = typeof item.image_asset_public_url === "string"
          ? item.image_asset_public_url
          : "";
        const mimeType = typeof item.image_asset_mime_type === "string"
          ? item.image_asset_mime_type
          : "";
        const signedUrl = storagePath && mimeType.startsWith("image/")
          ? await signedCaptureAssetUrl(supabase, storagePath, "thumb")
          : null;
        const remoteId = String(item.remote_id || item.remoteId || "");
        const sourcePreviewAsset = sourcePreviewByCaptureId.get(remoteId);
        const sourcePreviewStoragePath = typeof item.source_preview_asset_storage_path === "string"
          ? item.source_preview_asset_storage_path
          : typeof sourcePreviewAsset?.storage_path === "string"
            ? sourcePreviewAsset.storage_path
            : "";
        const sourcePreviewPublicUrl = typeof item.source_preview_asset_public_url === "string"
          ? item.source_preview_asset_public_url
          : typeof sourcePreviewAsset?.public_url === "string"
            ? sourcePreviewAsset.public_url
            : "";
        const sourcePreviewMimeType = typeof item.source_preview_asset_mime_type === "string"
          ? item.source_preview_asset_mime_type
          : typeof sourcePreviewAsset?.mime_type === "string"
            ? sourcePreviewAsset.mime_type
            : "";
        const signedSourcePreviewUrl = sourcePreviewStoragePath && sourcePreviewMimeType.startsWith("image/")
          ? await signedCaptureAssetUrl(supabase, sourcePreviewStoragePath, "thumb")
          : null;
        const primaryImageUrl = signedUrl || publicUrl || signedSourcePreviewUrl || sourcePreviewPublicUrl || null;
        const primaryCacheKey = storagePath
          ? captureAssetCacheKey(storagePath, "thumb")
          : sourcePreviewStoragePath
            ? captureAssetCacheKey(sourcePreviewStoragePath, "thumb")
            : null;
        return {
          id: String(item.id || remoteId || ""),
          remote_id: String(remoteId || item.id || ""),
          title: String(item.title || item.source_url || "Untitled capture"),
          source_url: typeof item.source_url === "string"
            ? item.source_url
            : null,
          thumbnail_url: item.thumbnail_url || null,
          url_evidence_image_url: item.url_evidence_image_url || null,
          image_asset_url: primaryImageUrl,
          image_asset_cache_key: primaryCacheKey,
          image_asset_mime_type: item.image_asset_mime_type || null,
          source_preview_asset_url: signedSourcePreviewUrl || sourcePreviewPublicUrl || null,
          source_preview_asset_cache_key: sourcePreviewStoragePath ? captureAssetCacheKey(sourcePreviewStoragePath, "thumb") : null,
          source_preview_asset_mime_type: sourcePreviewMimeType || null,
          linked_at: item.linked_at || null,
        };
      }),
  );
  return items.filter((item) => item.id);
}

async function collectionResponseRows(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  rows: Array<Record<string, unknown>>,
  counts: Map<string, number>,
) {
  return await Promise.all(
    rows.map(async (row) => {
      const collection = collectionFromRow(row, counts);
      return {
        ...collection,
        preview_captures: await signedCollectionPreviewCaptures(
          supabase,
          userId,
          collection.preview_captures,
        ),
      };
    }),
  );
}

export async function handleCollectionsResource(
  request: Request,
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  url: URL,
) {
  if (request.method === "GET") {
    await seedStarterCollectionsIfNeeded(supabase, userId);
    const archived = url.searchParams.get("archived") === "true";
    const limit = boundedLimit(url.searchParams.get("limit"), 50, 100);
    const before = url.searchParams.get("before");
    let query = supabase
      .from("collections")
      .select(COLLECTION_LIST_SELECT)
      .eq("user_id", userId)
      .eq("status", archived ? "archived" : "active")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (before) query = query.lt("created_at", before);
    const { data, error } = await query;
    if (error) throw error;
    const fetchedRows = (data ?? []) as Array<Record<string, unknown>>;
    const rows = fetchedRows.slice(0, limit);
    const counts = await activeCollectionCounts(
      supabase,
      userId,
      rows.map((row) => String(row.id)),
    );
    return json({
      collections: await collectionResponseRows(supabase, userId, rows, counts),
      next_cursor: fetchedRows.length > limit
        ? rows[rows.length - 1]?.created_at || null
        : null,
    });
  }

  const body = await request.json().catch(() => ({}));
  const collectionId = typeof body.collectionId === "string"
    ? body.collectionId
    : "";

  if (request.method === "POST") {
    const title = cleanRequiredText(body.title);
    const description = cleanRequiredText(body.description);
    if (!title || !description) {
      return json({ error: "title and description are required" }, 400);
    }
    const { data, error } = await supabase
      .from("collections")
      .insert({
        user_id: userId,
        title,
        description,
        created_by: "user",
      })
      .select("*")
      .single();
    if (error) throw error;
    await upsertCollectionEmbedding(
      supabase,
      userId,
      data.id,
      title,
      description,
    );
    if (typeof body.captureId === "string" && body.captureId) {
      await linkCaptureToCollection(supabase, userId, data.id, body.captureId, {
        createdBy: "user",
        rationale: typeof body.rationale === "string" ? body.rationale : null,
        confidence: Number.isFinite(Number(body.confidence))
          ? Number(body.confidence)
          : null,
      });
      await markCollectionDecisionAccepted(supabase, userId, body.captureId, {
        type: "new",
        title,
        collectionId: data.id,
      });
    }
    return json({
      collection: collectionFromRow(data as Record<string, unknown>),
    }, 201);
  }

  if (request.method !== "PATCH") return json({ error: "Not found" }, 404);
  if (!collectionId) return json({ error: "collectionId is required" }, 400);

  const existing = await supabase
    .from("collections")
    .select("*")
    .eq("user_id", userId)
    .eq("id", collectionId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) return json({ error: "Collection not found" }, 404);

  if (body.action === "delete" || body.action === "undo_delete") {
    const deleting = body.action === "delete";
    const deletedAt = deleting ? new Date().toISOString() : null;
    const deletePurgeAfter = deleting
      ? new Date(Date.now() + 8000).toISOString()
      : null;
    let result = await supabase
      .from("collections")
      .update({
        deleted_at: deletedAt,
        delete_purge_after: deletePurgeAfter,
        archived_at: deleting ? existing.data.archived_at : null,
        status: deleting ? existing.data.status : "active",
      })
      .eq("user_id", userId)
      .eq("id", collectionId)
      .select("*")
      .single();
    if (
      result.error &&
      /deleted_at|delete_purge_after|schema cache|column/i.test(
        String(result.error.message || result.error.details || ""),
      )
    ) {
      result = await supabase
        .from("collections")
        .update({
          status: deleting ? "archived" : "active",
          archived_at: deleting ? deletedAt : null,
        })
        .eq("user_id", userId)
        .eq("id", collectionId)
        .select("*")
        .single();
    }
    if (result.error) throw result.error;
    return json({
      collection: collectionFromRow(result.data as Record<string, unknown>),
    });
  }

  if (body.action === "archive") {
    const activeLinks = await supabase
      .from("collection_capture_links")
      .select("capture_id")
      .eq("user_id", userId)
      .eq("collection_id", collectionId)
      .is("unlinked_at", null);
    if (activeLinks.error) throw activeLinks.error;
    const snapshot = (activeLinks.data ?? []).map((row) =>
      String((row as Record<string, unknown>).capture_id)
    );
    const archivedAt = new Date().toISOString();
    const unlink = await supabase
      .from("collection_capture_links")
      .update({ unlinked_at: archivedAt, unlink_reason: "collection_archived" })
      .eq("user_id", userId)
      .eq("collection_id", collectionId)
      .is("unlinked_at", null);
    if (unlink.error) throw unlink.error;
    const { data, error } = await supabase
      .from("collections")
      .update({
        status: "archived",
        archived_at: archivedAt,
        archive_link_snapshot: snapshot,
      })
      .eq("user_id", userId)
      .eq("id", collectionId)
      .select("*")
      .single();
    if (error) throw error;
    for (const captureId of snapshot) {
      scheduleCaptureEmbeddingRefresh(supabase, userId, captureId);
    }
    return json({
      collection: collectionFromRow(data as Record<string, unknown>),
    });
  }

  if (body.action === "restore") {
    const snapshot = Array.isArray(existing.data.archive_link_snapshot)
      ? existing.data.archive_link_snapshot.map(String)
      : [];
    const { data, error } = await supabase
      .from("collections")
      .update({ status: "active", archived_at: null })
      .eq("user_id", userId)
      .eq("id", collectionId)
      .select("*")
      .single();
    if (error) throw error;
    for (const captureId of snapshot) {
      await linkCaptureToCollection(supabase, userId, collectionId, captureId, {
        createdBy: "restore",
      });
    }
    return json({
      collection: collectionFromRow(data as Record<string, unknown>),
    });
  }

  const title = body.title === undefined
    ? String(existing.data.title || "")
    : cleanRequiredText(body.title);
  const description = body.description === undefined
    ? String(existing.data.description || "")
    : cleanRequiredText(body.description);
  if (!title || !description) {
    return json({ error: "title and description are required" }, 400);
  }
  const { data, error } = await supabase
    .from("collections")
    .update({ title, description })
    .eq("user_id", userId)
    .eq("id", collectionId)
    .select("*")
    .single();
  if (error) throw error;
  await upsertCollectionEmbedding(
    supabase,
    userId,
    collectionId,
    title,
    description,
  );
  scheduleCollectionCaptureEmbeddingsRefresh(supabase, userId, collectionId);
  return json({
    collection: collectionFromRow(data as Record<string, unknown>),
  });
}
