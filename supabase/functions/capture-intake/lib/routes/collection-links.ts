import { adminClient } from "../supabase.ts";
import { json } from "../http.ts";
import { analysisRequiresReview, normalizedReviewAnalysis, resolveReviewTargets } from "../analysis/review-normalization.ts";
import { linkCaptureToCollection } from "../collections/links.ts";
import { captureResponse } from "../collections/responses.ts";
import { markCollectionDecisionAccepted } from "../collections/review-decisions.ts";
import { scheduleCaptureEmbeddingRefresh } from "../collections/embeddings.ts";

export function collectionIdList(value: unknown) {
  if (!Array.isArray(value)) return null;
  return [
    ...new Set(
      value
        .map((item) => typeof item === "string" ? item.trim() : "")
        .filter(Boolean),
    ),
  ];
}

export async function setCaptureCollections(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  captureRef: string,
  collectionIdsValue: unknown,
) {
  const collectionIds = collectionIdList(collectionIdsValue);
  if (!collectionIds) {
    return json({ error: "collectionIds must be an array" }, 400);
  }

  const capture = await supabase
    .from("captures")
    .select("id, analysis, review_confirmed_at, archived_at, deleted_at")
    .eq("user_id", userId)
    .or(`id.eq.${captureRef},client_capture_key.eq.${captureRef}`)
    .maybeSingle();
  if (capture.error) throw capture.error;
  if (!capture.data) return json({ error: "Capture not found" }, 404);
  if (capture.data.deleted_at || capture.data.archived_at) {
    return json({ error: "Deleted captures cannot be linked" }, 400);
  }
  const captureId = String(capture.data.id);

  if (collectionIds.length) {
    const collections = await supabase
      .from("collections")
      .select("id,status,deleted_at")
      .eq("user_id", userId)
      .in("id", collectionIds);
    if (collections.error) throw collections.error;
    const activeIds = new Set(
      (collections.data ?? [])
        .filter((collection) => collection.status === "active")
        .filter((collection) => !collection.deleted_at)
        .map((collection) => String(collection.id)),
    );
    const missingIds = collectionIds.filter((id) => !activeIds.has(id));
    if (missingIds.length) {
      return json({ error: "Only active collections can be linked" }, 400);
    }
  }

  const currentLinks = await supabase
    .from("collection_capture_links")
    .select("collection_id")
    .eq("user_id", userId)
    .eq("capture_id", captureId)
    .is("unlinked_at", null);
  if (currentLinks.error) throw currentLinks.error;
  const currentIds = new Set(
    (currentLinks.data ?? []).map((row) => String(row.collection_id)),
  );
  const targetIds = new Set(collectionIds);
  const removeIds = [...currentIds].filter((id) => !targetIds.has(id));
  const addIds = [...targetIds].filter((id) => !currentIds.has(id));

  if (removeIds.length) {
    const unlink = await supabase
      .from("collection_capture_links")
      .update({
        unlinked_at: new Date().toISOString(),
        unlink_reason: "user_removed",
      })
      .eq("user_id", userId)
      .eq("capture_id", captureId)
      .in("collection_id", removeIds)
      .is("unlinked_at", null);
    if (unlink.error) throw unlink.error;
  }

  for (const collectionId of addIds) {
    await linkCaptureToCollection(supabase, userId, collectionId, captureId, {
      createdBy: "user",
    });
  }

  const currentAnalysis =
    capture.data.analysis && typeof capture.data.analysis === "object"
      ? capture.data.analysis as Record<string, unknown>
      : {};
  const nextAnalysis = normalizedReviewAnalysis(
    {
      ...resolveReviewTargets(
        currentAnalysis,
        ["collections", "analysis"],
        capture.data.review_confirmed_at,
      ),
      collection_decisions: [],
      suggested_collections: [],
      collection_choice_overrides: [],
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

  return await captureResponse(supabase, userId, captureId);
}

export async function handleCollectionLinksResource(
  request: Request,
  supabase: ReturnType<typeof adminClient>,
  userId: string,
) {
  const body = await request.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";
  if (request.method === "PATCH" && action === "set_capture_collections") {
    const captureId = typeof body.captureId === "string" ? body.captureId : "";
    if (!captureId) return json({ error: "captureId is required" }, 400);
    return await setCaptureCollections(
      supabase,
      userId,
      captureId,
      body.collectionIds,
    );
  }

  const collectionId = typeof body.collectionId === "string"
    ? body.collectionId
    : "";
  const captureId = typeof body.captureId === "string" ? body.captureId : "";
  if (!collectionId || !captureId) {
    return json({ error: "collectionId and captureId are required" }, 400);
  }

  const collection = await supabase
    .from("collections")
    .select("id,title,description,status,deleted_at")
    .eq("user_id", userId)
    .eq("id", collectionId)
    .maybeSingle();
  if (collection.error) throw collection.error;
  if (!collection.data) return json({ error: "Collection not found" }, 404);

  if (request.method === "POST") {
    if (collection.data.status === "archived" || collection.data.deleted_at) {
      return json({ error: "Deleted collections cannot be linked" }, 400);
    }
    const capture = await supabase
      .from("captures")
      .select("id,archived_at,deleted_at")
      .eq("user_id", userId)
      .or(`id.eq.${captureId},client_capture_key.eq.${captureId}`)
      .maybeSingle();
    if (capture.error) throw capture.error;
    if (!capture.data) return json({ error: "Capture not found" }, 404);
    if (capture.data.archived_at || capture.data.deleted_at) {
      return json({ error: "Deleted captures cannot be linked" }, 400);
    }
    await linkCaptureToCollection(supabase, userId, collectionId, captureId, {
      createdBy: body.createdBy === "analysis" ? "analysis" : "user",
      rationale: typeof body.rationale === "string" ? body.rationale : null,
      confidence: Number.isFinite(Number(body.confidence))
        ? Number(body.confidence)
        : null,
    });
    await markCollectionDecisionAccepted(supabase, userId, captureId, {
      type: "existing",
      title: typeof body.title === "string" ? body.title : "",
      collectionId,
    });
    return json({ ok: true });
  }

  if (request.method === "PATCH" && body.action === "unlink") {
    const { error } = await supabase
      .from("collection_capture_links")
      .update({ unlinked_at: new Date().toISOString(), unlink_reason: "user" })
      .eq("user_id", userId)
      .eq("collection_id", collectionId)
      .eq("capture_id", captureId)
      .is("unlinked_at", null);
    if (error) throw error;
    scheduleCaptureEmbeddingRefresh(supabase, userId, captureId);
    return json({ ok: true });
  }

  return json({ error: "Not found" }, 404);
}
