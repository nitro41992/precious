import { adminClient } from "../supabase.ts";
import { json } from "../http.ts";
import {
  withCaptureState,
  withSignedCaptureAssets,
} from "../capture-records.ts";
import { hydrateResolvedPlaceThumbnail } from "../places.ts";
import {
  analysisRequiresReview,
  normalizedReviewAnalysis,
  resolveReviewTargets,
} from "../analysis/review-normalization.ts";
import { scheduleCaptureEmbeddingRefresh } from "./embeddings.ts";
import {
  activeCollectionDecisionRows,
  attachLinkedCollections,
  choiceRestoredDecisions,
  collectionChoiceOverrideId,
  collectionChoiceOverrides,
  collectionDecisionKey,
  linkCaptureToCollection,
  sameCollectionDecision,
} from "./links.ts";

export function cleanRequiredText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function captureResponse(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  captureId: string,
) {
  const { data, error } = await supabase
    .from("captures")
    .select("*, capture_assets(*)")
    .eq("user_id", userId)
    .eq("id", captureId)
    .single();
  if (error) throw error;
  const rows = await attachLinkedCollections(supabase, userId, [
    data as Record<string, unknown>,
  ]);
  const hydrated = await hydrateResolvedPlaceThumbnail(
    (rows[0] ?? data) as Record<string, unknown>,
  );
  const signed = await withSignedCaptureAssets(
    supabase,
    userId,
    hydrated,
  );
  scheduleCaptureEmbeddingRefresh(
    supabase,
    userId,
    captureId,
    signed as Record<string, unknown>,
  );
  return json({ capture: withCaptureState(signed) });
}

export async function applyCollectionChoice(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  capture: Record<string, unknown>,
  body: Record<string, unknown>,
) {
  const choice = body.choice && typeof body.choice === "object"
    ? body.choice as Record<string, unknown>
    : {};
  const currentAnalysis =
    capture.analysis && typeof capture.analysis === "object"
      ? capture.analysis as Record<string, unknown>
      : {};
  const currentDecisions = activeCollectionDecisionRows(currentAnalysis);
  const suggestionIndex = Number(body.suggestionIndex);
  const source = body.source === "analysis" ? "analysis" : "manual";
  const dismissSuggestions = Boolean(body.dismissCurrentCollectionSuggestions);
  const dismissedDecisions = dismissSuggestions
    ? currentDecisions
    : Number.isInteger(suggestionIndex) && suggestionIndex >= 0 &&
        suggestionIndex < currentDecisions.length
    ? [currentDecisions[suggestionIndex]]
    : [];
  const rationale = typeof body.rationale === "string"
    ? body.rationale
    : typeof dismissedDecisions[0]?.rationale === "string"
    ? String(dismissedDecisions[0].rationale)
    : null;
  const confidence = Number.isFinite(Number(body.confidence))
    ? Number(body.confidence)
    : Number.isFinite(Number(dismissedDecisions[0]?.confidence))
    ? Number(dismissedDecisions[0]?.confidence)
    : null;

  const collectionId = typeof choice.collectionId === "string"
    ? choice.collectionId
    : "";
  if (choice.type === "existing") {
    if (!collectionId) return json({ error: "collectionId is required" }, 400);
    const collection = await supabase
      .from("collections")
      .select("id,status,deleted_at")
      .eq("user_id", userId)
      .eq("id", collectionId)
      .maybeSingle();
    if (collection.error) throw collection.error;
    if (!collection.data) return json({ error: "Collection not found" }, 404);
    if (collection.data.status === "archived" || collection.data.deleted_at) {
      return json({ error: "Deleted collections cannot be linked" }, 400);
    }
  } else {
    return json({ error: "choice.type must be existing" }, 400);
  }

  const captureId = String(capture.id);
  await linkCaptureToCollection(supabase, userId, collectionId, captureId, {
    createdBy: source === "analysis" ? "analysis" : "user",
    rationale,
    confidence,
  });

  const dismissedKeys = new Set(
    dismissedDecisions.map((decision) =>
      collectionDecisionKey(decision, currentDecisions.indexOf(decision))
    ),
  );
  const nextDecisions = currentDecisions.filter((decision, index) => {
    return !dismissedKeys.has(collectionDecisionKey(decision, index));
  });
  const nextAnalysis = normalizedReviewAnalysis(
    {
      ...resolveReviewTargets(
        currentAnalysis,
        ["collections", "analysis"],
        capture.review_confirmed_at,
      ),
      collection_decisions: nextDecisions,
      suggested_collections: [],
      collection_choice_overrides: [],
    },
    capture.review_confirmed_at,
  );
  const update = await supabase
    .from("captures")
    .update({
      analysis: nextAnalysis,
      analysis_state:
        analysisRequiresReview(nextAnalysis, capture.review_confirmed_at)
          ? "needs_review"
          : "ready",
    })
    .eq("user_id", userId)
    .eq("id", captureId);
  if (update.error) throw update.error;
  return await captureResponse(supabase, userId, captureId);
}

export async function clearCollectionSuggestion(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  capture: Record<string, unknown>,
  body: Record<string, unknown>,
) {
  const currentAnalysis =
    capture.analysis && typeof capture.analysis === "object"
      ? capture.analysis as Record<string, unknown>
      : {};
  const currentDecisions = activeCollectionDecisionRows(currentAnalysis);
  const suggestionIndex = Number(body.suggestionIndex);
  const dismissedEntries =
    Number.isInteger(suggestionIndex) && suggestionIndex >= 0 &&
      suggestionIndex < currentDecisions.length
      ? [{
        decision: currentDecisions[suggestionIndex],
        index: suggestionIndex,
      }]
      : currentDecisions.map((decision, index) => ({ decision, index }));
  if (!dismissedEntries.length) {
    return await captureResponse(supabase, userId, String(capture.id));
  }

  const dismissedKeys = new Set(
    dismissedEntries.map(({ decision, index }) =>
      collectionDecisionKey(decision, index)
    ),
  );
  const dismissedOverrideIds = new Set(
    dismissedEntries.map(({ decision, index }) =>
      collectionChoiceOverrideId(decision, index)
    ),
  );
  const overrides = collectionChoiceOverrides(currentAnalysis)
    .filter((override) =>
      !dismissedOverrideIds.has(String(override.collection_id || ""))
    );
  for (const { decision, index } of dismissedEntries) {
    overrides.push({
      collection_id: collectionChoiceOverrideId(decision, index),
      source: "clear",
      restored_decisions: [decision],
      applied_at: new Date().toISOString(),
    });
  }

  const nextDecisions = currentDecisions.filter((decision, index) => {
    return !dismissedKeys.has(collectionDecisionKey(decision, index));
  });
  const nextAnalysis = normalizedReviewAnalysis(
    {
      ...resolveReviewTargets(
        currentAnalysis,
        ["collections", "analysis"],
        capture.review_confirmed_at,
      ),
      collection_decisions: nextDecisions,
      suggested_collections: [],
      collection_choice_overrides: overrides,
    },
    capture.review_confirmed_at,
  );
  const update = await supabase
    .from("captures")
    .update({
      analysis: nextAnalysis,
      analysis_state:
        analysisRequiresReview(nextAnalysis, capture.review_confirmed_at)
          ? "needs_review"
          : "ready",
    })
    .eq("user_id", userId)
    .eq("id", String(capture.id));
  if (update.error) throw update.error;
  return await captureResponse(supabase, userId, String(capture.id));
}

export async function undoCollectionChoice(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  capture: Record<string, unknown>,
  body: Record<string, unknown>,
) {
  const collectionId = typeof body.collectionId === "string"
    ? body.collectionId
    : "";
  if (!collectionId) return json({ error: "collectionId is required" }, 400);
  const captureId = String(capture.id);
  const currentAnalysis =
    capture.analysis && typeof capture.analysis === "object"
      ? capture.analysis as Record<string, unknown>
      : {};
  const overrides = collectionChoiceOverrides(currentAnalysis);
  const override = overrides.find((item) =>
    String(item.collection_id || "") === collectionId
  );
  let restoredDecisions = override ? choiceRestoredDecisions(override) : [];
  if (!restoredDecisions.length) {
    const removed = await supabase
      .from("collection_capture_links")
      .select("rationale, confidence, collections(id,title,description,status,deleted_at)")
      .eq("user_id", userId)
      .eq("collection_id", collectionId)
      .eq("capture_id", captureId)
      .eq("created_by", "analysis")
      .not("unlinked_at", "is", null)
      .order("unlinked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (removed.error) throw removed.error;
    const collection = Array.isArray(removed.data?.collections)
      ? removed.data?.collections[0] as Record<string, unknown> | undefined
      : removed.data?.collections as Record<string, unknown> | undefined;
    if (collection && collection.status !== "archived" && !collection.deleted_at) {
      restoredDecisions = [
        {
          type: "existing",
          collection_id: collectionId,
          title: String(collection.title || ""),
          description: typeof collection.description === "string"
            ? collection.description
            : null,
          rationale: typeof removed.data?.rationale === "string"
            ? removed.data.rationale
            : "",
          confidence: Number.isFinite(Number(removed.data?.confidence))
            ? Number(removed.data?.confidence)
            : 0,
        },
      ];
    }
  }

  const unlinkAt = new Date().toISOString();
  const unlinkQuery = supabase
    .from("collection_capture_links")
    .update({
      unlinked_at: unlinkAt,
      unlink_reason: restoredDecisions.length ? "user_restore_ai" : "user_undo",
    })
    .eq("user_id", userId)
    .eq("capture_id", captureId)
    .is("unlinked_at", null);
  const unlink = await unlinkQuery.eq("collection_id", collectionId);
  if (unlink.error) throw unlink.error;

  const nextDecisions = [...activeCollectionDecisionRows(currentAnalysis)];
  for (const restored of restoredDecisions) {
    if (
      !nextDecisions.some((decision) =>
        sameCollectionDecision(decision, restored)
      )
    ) {
      nextDecisions.push(restored);
    }
  }
  const nextAnalysis = normalizedReviewAnalysis(
    {
      ...currentAnalysis,
      collection_decisions: nextDecisions,
      suggested_collections: [],
      collection_choice_overrides: overrides.filter((item) =>
        String(item.collection_id || "") !== collectionId
      ),
    },
    capture.review_confirmed_at,
  );
  const update = await supabase
    .from("captures")
    .update({
      analysis: nextAnalysis,
      analysis_state:
        analysisRequiresReview(nextAnalysis, capture.review_confirmed_at)
          ? "needs_review"
          : "ready",
    })
    .eq("user_id", userId)
    .eq("id", captureId);
  if (update.error) throw update.error;
  return await captureResponse(supabase, userId, captureId);
}
