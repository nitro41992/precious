import { adminClient } from "../supabase.ts";
import {
  analysisRequiresReview,
  normalizedReviewAnalysis,
  resolveReviewTargets,
} from "../analysis/review-normalization.ts";
import { scheduleCaptureEmbeddingRefresh } from "./embeddings.ts";

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
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    capture_count: captureCounts.get(id) || 0,
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
      "capture_id, collection_id, created_by, rationale, confidence, linked_at, collections(id,title,description,status)",
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
    if (!collection || collection.status === "archived") continue;
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
        "capture_id, collection_id, rationale, confidence, unlinked_at, collections(id,title,description,status)",
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
      if (!collection || collection.status === "archived") continue;
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
