import { adminClient } from "../supabase.ts";
import { COLLECTION_AUTO_LINK_CONFIDENCE } from "../config.ts";
import {
  analysisRequiresReview,
  normalizedReviewAnalysis,
  resolveReviewTargets,
} from "../analysis/review-normalization.ts";
import { rationaleForAnalysis } from "../analysis/rationales.ts";
import type {
  AnalysisOutput,
  RetrievedCollection,
} from "../types.ts";
import { scheduleCaptureEmbeddingRefresh } from "./embeddings.ts";
import {
  collectionDecisionKey,
  linkCaptureToCollection,
  normalizeCollectionDecision,
  sameCollectionDecision,
} from "./links.ts";

export {
  activeCollectionDecisionRows,
  choiceRestoredDecisions,
  collectionChoiceOverrideId,
  collectionChoiceOverrides,
  collectionDecisionKey,
  normalizeCollectionDecision,
  sameCollectionDecision,
} from "./links.ts";

export async function autoLinkCollectionDecisions(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  captureId: string,
  analysis: AnalysisOutput,
  retrievedCollections: RetrievedCollection[],
): Promise<AnalysisOutput> {
  const retrievedById = new Map(
    retrievedCollections.map((collection) => [collection.id, collection]),
  );
  const decisions = Array.isArray(analysis.collection_decisions)
    ? analysis.collection_decisions.map((item) =>
      normalizeCollectionDecision(item as Record<string, unknown>)
    )
    : [];
  const linked: Array<Record<string, unknown>> = [];
  for (const decision of decisions) {
    if (
      decision.type === "existing" &&
      decision.collection_id &&
      retrievedById.has(decision.collection_id) &&
      decision.confidence >= COLLECTION_AUTO_LINK_CONFIDENCE
    ) {
      const collection = retrievedById.get(decision.collection_id)!;
      const rationale = rationaleForAnalysis(analysis, decision.rationale) ||
        `Matched ${collection.title} because the saved content fits this Collection.`;
      await linkCaptureToCollection(
        supabase,
        userId,
        decision.collection_id,
        captureId,
        {
          createdBy: "analysis",
          rationale,
          confidence: decision.confidence,
        },
      );
      linked.push({
        ...decision,
        title: collection.title,
        description: collection.description,
        rationale,
      });
    }
  }
  return {
    ...analysis,
    collection_decisions: [],
    linked_collections: linked,
  };
}

export async function markCollectionDecisionAccepted(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  captureId: string,
  accepted: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from("captures")
    .select("id, analysis, review_confirmed_at")
    .eq("user_id", userId)
    .or(`id.eq.${captureId},client_capture_key.eq.${captureId}`)
    .maybeSingle();
  if (error || !data) return;
  const analysis = data.analysis && typeof data.analysis === "object"
    ? data.analysis as Record<string, unknown>
    : {};
  const decisions = Array.isArray(analysis.collection_decisions)
    ? analysis.collection_decisions
    : [];
  const nextDecisions = decisions.filter(
    (decision) =>
      !sameCollectionDecision(decision as Record<string, unknown>, accepted),
  );
  const nextAnalysis = normalizedReviewAnalysis(
    {
      ...resolveReviewTargets(
        analysis,
        ["collections", "analysis"],
        data.review_confirmed_at,
      ),
      collection_decisions: nextDecisions,
    },
    data.review_confirmed_at,
  );
  await supabase
    .from("captures")
    .update({
      analysis: nextAnalysis,
      analysis_state:
        analysisRequiresReview(nextAnalysis, data.review_confirmed_at)
          ? "needs_review"
          : "ready",
    })
    .eq("user_id", userId)
    .eq("id", data.id);
  scheduleCaptureEmbeddingRefresh(supabase, userId, String(data.id));
}

export function confirmedReminderSuggestions(
  analysis: Record<string, unknown>,
) {
  const reminders = Array.isArray(analysis.suggested_reminders)
    ? analysis.suggested_reminders
    : [];
  return reminders.map((reminder) => {
    if (!reminder || typeof reminder !== "object" || Array.isArray(reminder)) {
      return reminder;
    }
    return { ...(reminder as Record<string, unknown>), status: "confirmed" };
  });
}

export function dismissReminderSuggestion(
  analysis: Record<string, unknown>,
  reminderIndex: unknown,
) {
  const index = Number(reminderIndex);
  const reminders = Array.isArray(analysis.suggested_reminders)
    ? analysis.suggested_reminders
    : [];
  if (!Number.isInteger(index) || index < 0 || index >= reminders.length) {
    return reminders;
  }
  return reminders.filter((_, itemIndex) => itemIndex !== index);
}

export function reviewReminderSuggestions(
  analysis: Record<string, unknown>,
  decisions: unknown,
) {
  const removeIndices = new Set(
    (Array.isArray(decisions) ? decisions : [])
      .filter((decision) => {
        return decision && typeof decision === "object" &&
          (decision as Record<string, unknown>).action === "remove";
      })
      .map((decision) => Number((decision as Record<string, unknown>).index))
      .filter(Number.isInteger),
  );
  const reminders = Array.isArray(analysis.suggested_reminders)
    ? analysis.suggested_reminders
    : [];
  return reminders.filter((_, index) => !removeIndices.has(index));
}

export function reviewCollectionDecisions(
  analysis: Record<string, unknown>,
  decisions: unknown,
) {
  const acceptedKeys = new Set(
    (Array.isArray(decisions) ? decisions : [])
      .filter((decision) => {
        if (!decision || typeof decision !== "object") return false;
        const record = decision as Record<string, unknown>;
        return record.kind === "suggested" &&
          (record.action === "link" || record.action === "create");
      })
      .map((decision) =>
        collectionDecisionKey(
          decision as Record<string, unknown>,
          Number((decision as Record<string, unknown>).index),
        )
      ),
  );
  const current = Array.isArray(analysis.collection_decisions)
    ? analysis.collection_decisions
    : Array.isArray(analysis.suggested_collections)
    ? analysis.suggested_collections
    : [];
  return current.filter((decision, index) => {
    return !acceptedKeys.has(
      collectionDecisionKey(decision as Record<string, unknown>, index),
    );
  });
}

export async function applyCollectionReviewDecisions(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  captureId: string,
  decisions: unknown,
) {
  for (const item of Array.isArray(decisions) ? decisions : []) {
    if (!item || typeof item !== "object") continue;
    const decision = item as Record<string, unknown>;
    if (
      decision.kind === "linked" && decision.action === "remove" &&
      typeof decision.collectionId === "string"
    ) {
      const { error } = await supabase
        .from("collection_capture_links")
        .update({
          unlinked_at: new Date().toISOString(),
          unlink_reason: "user_removed",
        })
        .eq("user_id", userId)
        .eq("collection_id", decision.collectionId)
        .eq("capture_id", captureId)
        .is("unlinked_at", null);
      if (error) throw error;
      continue;
    }

    if (decision.kind !== "suggested" || decision.action !== "link") continue;
    const collectionId = typeof decision.collectionId === "string"
      ? decision.collectionId
      : "";
    const rationale = typeof decision.rationale === "string"
      ? decision.rationale
      : null;
    const confidence = Number(decision.confidence);
    if (!collectionId) continue;
    const collection = await supabase
      .from("collections")
      .select("id,status")
      .eq("user_id", userId)
      .eq("id", collectionId)
      .maybeSingle();
    if (collection.error) throw collection.error;
    if (!collection.data || collection.data.status === "archived") continue;
    await linkCaptureToCollection(supabase, userId, collectionId, captureId, {
      createdBy: "analysis",
      rationale,
      confidence: Number.isFinite(confidence) ? confidence : null,
    });
  }
}

export function acceptPendingCollectionDecisions(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  captureId: string,
  analysis: Record<string, unknown>,
) {
  void supabase;
  void userId;
  void captureId;
  void analysis;
}
