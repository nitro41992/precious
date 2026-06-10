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

// Undo loads the row a whole-suggestion dismiss soft-deleted, so it must look past
// the deleted_at guard that loadSuggestionRow applies to live suggestions.
async function loadDismissedSuggestionRow(
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
  if (!data || data.status !== "suggested") return null;
  return data as Record<string, unknown>;
}

async function activeMemberLinks(
  supabase: Supabase,
  userId: string,
  collectionId: string,
) {
  const { data, error } = await supabase
    .from("collection_capture_links")
    .select("capture_id, rationale, confidence")
    .eq("user_id", userId)
    .eq("collection_id", collectionId)
    .is("unlinked_at", null);
  if (error) throw error;
  return (data ?? []) as Array<Record<string, unknown>>;
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

// The inverse of clearPendingSuggestionForCaptures: when a whole-suggestion dismiss is
// undone, every re-linked member capture must surface its pending_collection_suggestion
// marker again. The group title/description come from the (un-deleted) suggestion row and
// each capture's rationale/confidence from its own link row.
async function restorePendingSuggestionForCaptures(
  supabase: Supabase,
  userId: string,
  collectionId: string,
  suggestion: Record<string, unknown>,
  links: Array<Record<string, unknown>>,
) {
  const title = String(suggestion.title || "");
  const description = String(suggestion.description || "");
  for (const link of links) {
    const captureId = String(link.capture_id || "");
    if (!captureId) continue;
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
      : {};
    const next = {
      ...analysis,
      pending_collection_suggestion: {
        collection_id: collectionId,
        title,
        description,
        rationale: typeof link.rationale === "string" ? link.rationale : "",
        confidence: Number.isFinite(Number(link.confidence))
          ? Number(link.confidence)
          : null,
      },
    };
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

// Reverse a single-capture suggestion dismiss (the per-capture minus-circle undo): re-link
// the one capture, drop its never-re-suggest record, restore its pending marker, and
// un-delete the suggestion if removing this capture had emptied and soft-deleted it.
// Scoped to one capture — the inverse of dismissSuggestionForCapture, the way
// undoDismissCollectionSuggestion is the inverse of dismissCollectionSuggestion.
async function undoDismissSuggestionForCapture(
  supabase: Supabase,
  userId: string,
  collectionId: string,
  captureId: string,
) {
  // The dismiss soft-deletes the suggestion when it removes the last capture, so look
  // past the live-only guard the way the whole-group undo does.
  const suggestion = await loadDismissedSuggestionRow(supabase, userId, collectionId);
  if (!suggestion) return json({ error: "Suggestion not found" }, 404);

  await supabase
    .from("collections")
    .update({ deleted_at: null, delete_purge_after: null })
    .eq("user_id", userId)
    .eq("id", collectionId);
  await supabase
    .from("collection_capture_links")
    .update({ unlinked_at: null, unlink_reason: null })
    .eq("user_id", userId)
    .eq("collection_id", collectionId)
    .eq("capture_id", captureId)
    .eq("unlink_reason", "suggestion_dismissed");
  await supabase
    .from("collection_suggestion_dismissals")
    .delete()
    .eq("user_id", userId)
    .eq("collection_id", collectionId)
    .eq("capture_id", captureId);

  const links = await activeMemberLinks(supabase, userId, collectionId);
  const restored = links.filter((link) => String(link.capture_id || "") === captureId);
  await restorePendingSuggestionForCaptures(
    supabase,
    userId,
    collectionId,
    suggestion,
    restored,
  );
  await refreshCollectionPreviewFromActiveLinks(supabase, userId, collectionId);
  return await captureResponse(supabase, userId, captureId);
}

// Dismiss a whole pending suggestion at once (the intentional action in the suggestion
// detail view): every member capture is unlinked, never re-suggested for this group, and
// loses its pending_collection_suggestion marker, then the suggestion is soft-deleted.
// Reversible via undoDismissCollectionSuggestion within the purge window.
export async function dismissCollectionSuggestion(
  supabase: Supabase,
  userId: string,
  collectionId: string,
) {
  const suggestion = await loadSuggestionRow(supabase, userId, collectionId);
  if (!suggestion) return null;
  const memberIds = await activeMemberCaptureIds(supabase, userId, collectionId);
  const now = new Date().toISOString();

  if (memberIds.length) {
    await supabase
      .from("collection_suggestion_dismissals")
      .upsert(
        memberIds.map((captureId) => ({
          user_id: userId,
          collection_id: collectionId,
          capture_id: captureId,
        })),
        { onConflict: "collection_id,capture_id" },
      );
  }
  await supabase
    .from("collection_capture_links")
    .update({ unlinked_at: now, unlink_reason: "suggestion_dismissed" })
    .eq("user_id", userId)
    .eq("collection_id", collectionId)
    .is("unlinked_at", null);
  await clearPendingSuggestionForCaptures(supabase, userId, collectionId, memberIds);
  // Keep a purge window (matching collection delete) so the Undo toast can reverse it.
  await supabase
    .from("collections")
    .update({
      deleted_at: now,
      delete_purge_after: new Date(Date.parse(now) + 8000).toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", collectionId);
  return { captureIds: memberIds };
}

// Reverse a whole-suggestion dismiss: un-delete the suggestion, re-link the members that
// were unlinked by the dismiss, drop the dismissal records, and restore each capture's
// pending_collection_suggestion marker.
export async function undoDismissCollectionSuggestion(
  supabase: Supabase,
  userId: string,
  collectionId: string,
) {
  const suggestion = await loadDismissedSuggestionRow(supabase, userId, collectionId);
  if (!suggestion) return null;

  await supabase
    .from("collections")
    .update({ deleted_at: null, delete_purge_after: null })
    .eq("user_id", userId)
    .eq("id", collectionId);
  await supabase
    .from("collection_capture_links")
    .update({ unlinked_at: null, unlink_reason: null })
    .eq("user_id", userId)
    .eq("collection_id", collectionId)
    .eq("unlink_reason", "suggestion_dismissed");
  await supabase
    .from("collection_suggestion_dismissals")
    .delete()
    .eq("user_id", userId)
    .eq("collection_id", collectionId);

  const links = await activeMemberLinks(supabase, userId, collectionId);
  await restorePendingSuggestionForCaptures(
    supabase,
    userId,
    collectionId,
    suggestion,
    links,
  );
  await refreshCollectionPreviewFromActiveLinks(supabase, userId, collectionId);
  return await collectionWithCount(supabase, userId, {
    ...suggestion,
    deleted_at: null,
    delete_purge_after: null,
  });
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

  if (body.action === "dismiss") {
    const result = await dismissCollectionSuggestion(supabase, userId, collectionId);
    if (!result) return json({ error: "Suggestion not found" }, 404);
    return json(result);
  }

  if (body.action === "undo_dismiss") {
    const collection = await undoDismissCollectionSuggestion(
      supabase,
      userId,
      collectionId,
    );
    if (!collection) return json({ error: "Suggestion not found" }, 404);
    return json({ collection });
  }

  if (body.action === "undo_dismiss_for_capture") {
    const captureId = typeof body.captureId === "string" ? body.captureId : "";
    if (!isUuid(captureId)) {
      return json({ error: "captureId is required" }, 400);
    }
    return await undoDismissSuggestionForCapture(
      supabase,
      userId,
      collectionId,
      captureId,
    );
  }

  return json({ error: "Unsupported action" }, 400);
}
