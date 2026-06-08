import { adminClient } from "../supabase.ts";
import { isUuid } from "../common.ts";
import { json } from "../http.ts";
import {
  analysisRequiresReview,
  normalizedReviewAnalysis,
  resolveReviewTargets,
} from "../analysis/review-normalization.ts";
import {
  activeCollectionCounts,
  collectionFromRow,
  linkCaptureToCollection,
  refreshCollectionPreviewAfterCaptureRemoval,
  refreshCollectionPreviewFromActiveLinks,
  scheduleCaptureEmbeddingRefresh,
} from "../collections.ts";
import { captureResponse } from "../collections/responses.ts";

type Supabase = ReturnType<typeof adminClient>;

async function loadSuggestionRow(
  supabase: Supabase,
  userId: string,
  collectionId: string,
) {
  const { data, error } = await supabase
    .from("collections")
    .select("*")
    .eq("user_id", userId)
    .eq("id", collectionId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "suggested" || data.deleted_at) return null;
  return data as Record<string, unknown>;
}

async function activeMemberCaptureIds(
  supabase: Supabase,
  userId: string,
  collectionId: string,
) {
  const { data, error } = await supabase
    .from("collection_capture_links")
    .select("capture_id")
    .eq("user_id", userId)
    .eq("collection_id", collectionId)
    .is("unlinked_at", null);
  if (error) throw error;
  return (data ?? [])
    .map((row) => String((row as Record<string, unknown>).capture_id || ""))
    .filter(Boolean);
}

// Once a suggestion becomes (or merges into) a real Collection, the member captures
// surface it as a normal linked Collection, so the pending_collection_suggestion marker
// must be removed from their analysis.
async function clearPendingSuggestionForCaptures(
  supabase: Supabase,
  userId: string,
  collectionId: string,
  captureIds: string[],
) {
  for (const captureId of captureIds) {
    const { data, error } = await supabase
      .from("captures")
      .select("id, analysis, review_confirmed_at")
      .eq("user_id", userId)
      .eq("id", captureId)
      .maybeSingle();
    if (error || !data) continue;
    const analysis = data.analysis && typeof data.analysis === "object" &&
        !Array.isArray(data.analysis)
      ? data.analysis as Record<string, unknown>
      : null;
    if (!analysis) continue;
    const pending = analysis.pending_collection_suggestion;
    const pendingId = pending && typeof pending === "object"
      ? String((pending as Record<string, unknown>).collection_id || "")
      : "";
    if (pendingId !== collectionId) continue;
    const next = { ...analysis };
    delete next.pending_collection_suggestion;
    const normalized = normalizedReviewAnalysis(
      resolveReviewTargets(next, ["collections", "analysis"], data.review_confirmed_at),
      data.review_confirmed_at,
    );
    await supabase
      .from("captures")
      .update({
        analysis: normalized,
        analysis_state:
          analysisRequiresReview(normalized, data.review_confirmed_at)
            ? "needs_review"
            : "ready",
      })
      .eq("user_id", userId)
      .eq("id", data.id);
    scheduleCaptureEmbeddingRefresh(supabase, userId, String(data.id));
  }
}

async function collectionWithCount(
  supabase: Supabase,
  userId: string,
  row: Record<string, unknown>,
) {
  const counts = await activeCollectionCounts(supabase, userId, [String(row.id)]);
  return collectionFromRow(row, counts);
}

// Persist a whole pending suggestion into a real Collection: every grouped capture keeps
// its link, the row flips to active. If the title somehow collides with an existing real
// Collection (the unique index normally prevents this), merge the members into it instead.
export async function persistCollectionSuggestion(
  supabase: Supabase,
  userId: string,
  collectionId: string,
) {
  const suggestion = await loadSuggestionRow(supabase, userId, collectionId);
  if (!suggestion) return null;
  const normalizedTitle = String(suggestion.title || "").trim().toLowerCase();
  const memberIds = await activeMemberCaptureIds(supabase, userId, collectionId);

  const collide = await supabase
    .from("collections")
    .select("*")
    .eq("user_id", userId)
    .eq("normalized_title", normalizedTitle)
    .is("deleted_at", null)
    .neq("status", "suggested")
    .neq("id", collectionId)
    .maybeSingle();
  if (collide.error) throw collide.error;

  if (collide.data) {
    const targetId = String(collide.data.id);
    const now = new Date().toISOString();
    const links = await supabase
      .from("collection_capture_links")
      .select("capture_id, rationale, confidence")
      .eq("user_id", userId)
      .eq("collection_id", collectionId)
      .is("unlinked_at", null);
    if (links.error) throw links.error;
    for (const link of links.data ?? []) {
      const record = link as Record<string, unknown>;
      await linkCaptureToCollection(
        supabase,
        userId,
        targetId,
        String(record.capture_id),
        {
          createdBy: "analysis",
          rationale: typeof record.rationale === "string" ? record.rationale : null,
          confidence: Number.isFinite(Number(record.confidence))
            ? Number(record.confidence)
            : null,
        },
      );
    }
    await supabase
      .from("collection_capture_links")
      .update({ unlinked_at: now, unlink_reason: "suggestion_merged" })
      .eq("user_id", userId)
      .eq("collection_id", collectionId)
      .is("unlinked_at", null);
    await supabase
      .from("collections")
      .update({ deleted_at: now, delete_purge_after: now })
      .eq("user_id", userId)
      .eq("id", collectionId);
    await refreshCollectionPreviewFromActiveLinks(supabase, userId, targetId);
    await clearPendingSuggestionForCaptures(supabase, userId, collectionId, memberIds);
    return await collectionWithCount(
      supabase,
      userId,
      collide.data as Record<string, unknown>,
    );
  }

  const flipped = await supabase
    .from("collections")
    .update({ status: "active" })
    .eq("user_id", userId)
    .eq("id", collectionId)
    .select("*")
    .single();
  if (flipped.error) throw flipped.error;
  await clearPendingSuggestionForCaptures(supabase, userId, collectionId, memberIds);
  return await collectionWithCount(
    supabase,
    userId,
    flipped.data as Record<string, unknown>,
  );
}

// Remove a single capture from a pending suggestion and never re-suggest it for that
// capture. If the suggestion is left with no captures, soft-delete it.
async function dismissSuggestionForCapture(
  supabase: Supabase,
  userId: string,
  collectionId: string,
  captureId: string,
) {
  const suggestion = await loadSuggestionRow(supabase, userId, collectionId);
  if (!suggestion) return json({ error: "Suggestion not found" }, 404);
  const now = new Date().toISOString();

  await supabase
    .from("collection_suggestion_dismissals")
    .upsert(
      { user_id: userId, collection_id: collectionId, capture_id: captureId },
      { onConflict: "collection_id,capture_id" },
    );
  await supabase
    .from("collection_capture_links")
    .update({ unlinked_at: now, unlink_reason: "suggestion_dismissed" })
    .eq("user_id", userId)
    .eq("collection_id", collectionId)
    .eq("capture_id", captureId)
    .is("unlinked_at", null);
  await refreshCollectionPreviewAfterCaptureRemoval(
    supabase,
    userId,
    collectionId,
    [captureId],
  );
  await clearPendingSuggestionForCaptures(supabase, userId, collectionId, [captureId]);

  const remaining = await activeMemberCaptureIds(supabase, userId, collectionId);
  if (!remaining.length) {
    await supabase
      .from("collections")
      .update({ deleted_at: now, delete_purge_after: now })
      .eq("user_id", userId)
      .eq("id", collectionId);
  }
  return await captureResponse(supabase, userId, captureId);
}

export async function handleCollectionSuggestionsResource(
  request: Request,
  supabase: Supabase,
  userId: string,
) {
  if (request.method !== "PATCH") return json({ error: "Not found" }, 404);
  const body = await request.json().catch(() => ({}));
  const collectionId = typeof body.collectionId === "string" ? body.collectionId : "";
  if (!isUuid(collectionId)) {
    return json({ error: "collectionId is required" }, 400);
  }

  if (body.action === "persist") {
    const collection = await persistCollectionSuggestion(
      supabase,
      userId,
      collectionId,
    );
    if (!collection) return json({ error: "Suggestion not found" }, 404);
    return json({ collection });
  }

  if (body.action === "dismiss_for_capture") {
    const captureId = typeof body.captureId === "string" ? body.captureId : "";
    if (!isUuid(captureId)) {
      return json({ error: "captureId is required" }, 400);
    }
    return await dismissSuggestionForCapture(
      supabase,
      userId,
      collectionId,
      captureId,
    );
  }

  return json({ error: "Unsupported action" }, 400);
}
