import { adminClient } from "../supabase.ts";
import { COLLECTION_LIST_SELECT } from "../config.ts";
import { boundedLimit } from "../common.ts";
import { json } from "../http.ts";
import { activeCollectionCounts, collectionFromRow, linkCaptureToCollection } from "../collections/links.ts";
import { scheduleCaptureEmbeddingRefresh, scheduleCollectionCaptureEmbeddingsRefresh, upsertCollectionEmbedding } from "../collections/embeddings.ts";
import { markCollectionDecisionAccepted } from "../collections/review-decisions.ts";
import { cleanRequiredText } from "../collections/responses.ts";
import { seedStarterCollectionsIfNeeded } from "../collections/starter-collections.ts";

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
      collections: rows.map((row) => collectionFromRow(row, counts)),
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
