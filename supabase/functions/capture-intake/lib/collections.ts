import { adminClient } from "./supabase.ts";
import {
  COLLECTION_AUTO_LINK_CONFIDENCE,
  COLLECTION_LIST_SELECT,
  STARTER_COLLECTION_CREATED_BY,
  STARTER_COLLECTIONS,
} from "./config.ts";
import {
  compactText,
  env,
  errorMessage,
  jsonObject,
  runInBackground,
  stringValue,
} from "./common.ts";
import { json } from "./http.ts";
import {
  archivedFilter,
  withCaptureState,
  withCaptureStates,
  withSignedCaptureAssetRows,
  withSignedCaptureAssets,
} from "./capture-records.ts";
import {
  analysisRequiresReview,
  analysisWithCurrentIntent,
  contentEvidenceProfile,
  normalizedReviewAnalysis,
  rationaleForAnalysis,
  textWithoutUrls,
} from "./analysis.ts";
import {
  evidenceTitleIsGeneric,
  substantiveDescription,
  substantiveText,
} from "./url-evidence.ts";
import type {
  AnalysisOutput,
  CaptureRow,
  RetrievedCollection,
  UrlEvidence,
} from "./types.ts";

export function collectionEmbeddingContent(title: string, description: string) {
  return compactText([title, description], 1600);
}

export function compactJsonText(value: unknown, maxLength = 1600) {
  if (value === null || value === undefined) return null;
  try {
    return JSON.stringify(value).slice(0, maxLength);
  } catch {
    return null;
  }
}

export function captureEmbeddingContent(capture: Record<string, unknown>) {
  const analysis = jsonObject(capture.analysis);
  const defaultIntent = jsonObject(analysis.default_intent);
  const reviewRationale = jsonObject(analysis.review_rationale);
  const urlEvidence = jsonObject(analysis.url_evidence);
  const linkedCollections = Array.isArray(capture.linked_collections)
    ? capture.linked_collections
    : [];
  return compactText([
    stringValue(capture.display_title),
    stringValue(capture.title),
    stringValue(capture.context_note),
    stringValue(capture.source_text),
    stringValue(capture.source_url),
    stringValue(capture.source_app),
    stringValue(capture.current_save_intent),
    stringValue(capture.default_intent),
    stringValue(capture.intent_rationale),
    stringValue(defaultIntent.category),
    stringValue(defaultIntent.rationale),
    stringValue(reviewRationale.focus),
    stringValue(reviewRationale.summary),
    stringValue(reviewRationale.intent),
    stringValue(reviewRationale.collections),
    stringValue(reviewRationale.reminder),
    stringValue(analysis.summary),
    stringValue(analysis.visit_target_name),
    stringValue(analysis.visit_target_query),
    compactJsonText(analysis.visit_target_evidence, 800),
    compactJsonText(analysis.entities, 1200),
    compactJsonText(analysis.suggested_reminders, 1200),
    compactJsonText(analysis.search_phrases, 1000),
    stringValue(urlEvidence.title),
    stringValue(urlEvidence.description),
    stringValue(urlEvidence.readable_text_excerpt),
    stringValue(urlEvidence.site_name),
    stringValue(urlEvidence.platform),
    compactJsonText(urlEvidence.entities, 1000),
    linkedCollections
      .map((collection) => {
        if (!collection || typeof collection !== "object") return "";
        const record = collection as Record<string, unknown>;
        return compactText([
          stringValue(record.title),
          stringValue(record.description),
        ], 600);
      })
      .filter(Boolean)
      .join("\n"),
    stringValue(capture.created_at),
  ], 5000);
}

export function retrievalQueryForCapture(
  capture: CaptureRow,
  urlEvidence: UrlEvidence | null,
) {
  const profile = contentEvidenceProfile(capture, urlEvidence);
  const urlTitle = urlEvidence?.title &&
      (profile.source_fallback_allowed || !evidenceTitleIsGeneric(urlEvidence))
    ? urlEvidence.title
    : null;
  const urlDescription = urlEvidence &&
      (profile.source_fallback_allowed || substantiveDescription(urlEvidence))
    ? urlEvidence.description
    : null;
  const urlText = urlEvidence &&
      (profile.source_fallback_allowed || substantiveText(urlEvidence))
    ? urlEvidence.text?.slice(0, 1400)
    : null;
  return compactText([
    profile.source_fallback_allowed
      ? capture.source_text
      : textWithoutUrls(capture.source_text),
    profile.source_fallback_allowed ? capture.source_url : null,
    urlTitle,
    urlDescription,
    urlText,
    typeof (capture as Record<string, unknown>).context_note === "string"
      ? String((capture as Record<string, unknown>).context_note)
      : null,
  ]);
}

export function embeddingLiteral(values: number[]) {
  return `[${values.map((value) => Number(value) || 0).join(",")}]`;
}

export async function createEmbedding(input: string) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env("OPENAI_API_KEY")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: input || "untitled collection",
    }),
  });
  const raw = await response.json();
  if (!response.ok) {
    throw new Error(
      raw.error?.message || `OpenAI embeddings failed with ${response.status}`,
    );
  }
  const embedding = raw.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error("OpenAI embedding response did not include an embedding");
  }
  return embedding.map(Number);
}

export async function upsertCollectionEmbedding(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  collectionId: string,
  title: string,
  description: string,
) {
  const content = collectionEmbeddingContent(title, description);
  const embedding = await createEmbedding(content);
  const { error } = await supabase.from("collection_embeddings").upsert({
    user_id: userId,
    collection_id: collectionId,
    content,
    embedding: embeddingLiteral(embedding),
  }, { onConflict: "collection_id" });
  if (error) throw error;
}

export async function upsertCaptureEmbeddingForRow(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  capture: Record<string, unknown>,
) {
  const rows = await attachLinkedCollections(supabase, userId, [capture]);
  const hydrated = (rows[0] || capture) as Record<string, unknown>;
  const content = captureEmbeddingContent(hydrated);
  if (!content) return;
  const embedding = await createEmbedding(content);
  const { error } = await supabase.from("capture_embeddings").upsert({
    user_id: userId,
    capture_id: String(hydrated.id),
    content,
    embedding: embeddingLiteral(embedding),
  }, { onConflict: "capture_id" });
  if (error) throw error;
}

export async function refreshCaptureEmbedding(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  captureId: string,
  capture?: Record<string, unknown>,
) {
  let row = capture;
  if (!row || String(row.id || "") !== captureId) {
    const { data, error } = await supabase
      .from("captures")
      .select("*")
      .eq("user_id", userId)
      .eq("id", captureId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return;
    row = data as Record<string, unknown>;
  }
  await upsertCaptureEmbeddingForRow(supabase, userId, row);
}

export function scheduleCaptureEmbeddingRefresh(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  captureId: string,
  capture?: Record<string, unknown>,
) {
  runInBackground(
    refreshCaptureEmbedding(supabase, userId, captureId, capture),
  );
}

export async function refreshCollectionCaptureEmbeddings(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  collectionId: string,
) {
  const { data, error } = await supabase
    .from("collection_capture_links")
    .select("capture_id")
    .eq("user_id", userId)
    .eq("collection_id", collectionId)
    .is("unlinked_at", null)
    .limit(100);
  if (error) throw error;
  await Promise.all(
    (data ?? [])
      .map((row) => String((row as Record<string, unknown>).capture_id || ""))
      .filter(Boolean)
      .map((captureId) => refreshCaptureEmbedding(supabase, userId, captureId)),
  );
}

export function scheduleCollectionCaptureEmbeddingsRefresh(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  collectionId: string,
) {
  runInBackground(
    refreshCollectionCaptureEmbeddings(supabase, userId, collectionId),
  );
}

export function shouldSeedStarterCollections(
  existingCollectionCount: number | null,
) {
  return existingCollectionCount === 0;
}

export function starterCollectionRows(userId: string, now = new Date()) {
  return STARTER_COLLECTIONS.map((collection, index) => ({
    user_id: userId,
    title: collection.title,
    description: collection.description,
    created_by: STARTER_COLLECTION_CREATED_BY,
    created_at: new Date(now.getTime() - index).toISOString(),
    updated_at: now.toISOString(),
  }));
}

export async function seedStarterCollectionsIfNeeded(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
) {
  const existing = await supabase
    .from("collections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (existing.error) throw existing.error;
  if (!shouldSeedStarterCollections(existing.count)) return;

  const { data, error } = await supabase
    .from("collections")
    .upsert(starterCollectionRows(userId), {
      ignoreDuplicates: true,
      onConflict: "user_id,title",
    })
    .select(COLLECTION_LIST_SELECT);
  if (error) throw error;

  runInBackground(
    Promise.all(
      ((data ?? []) as Array<Record<string, unknown>>).map((collection) =>
        upsertCollectionEmbedding(
          supabase,
          userId,
          String(collection.id),
          String(collection.title || ""),
          String(collection.description || ""),
        )
      ),
    ),
  );
}

export async function retrieveCollectionsForCapture(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  capture: CaptureRow,
  urlEvidence: UrlEvidence | null,
): Promise<RetrievedCollection[]> {
  const queryText = retrievalQueryForCapture(capture, urlEvidence);
  if (!queryText) return [];
  const embedding = await createEmbedding(queryText);
  const { data, error } = await supabase.rpc("match_collections_for_capture", {
    p_user_id: userId,
    p_query_text: queryText,
    p_query_embedding: embeddingLiteral(embedding),
    p_match_count: 3,
  });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    title: String(row.title || ""),
    description: String(row.description || ""),
    keyword_rank: typeof row.keyword_rank === "number"
      ? row.keyword_rank
      : null,
    semantic_rank: typeof row.semantic_rank === "number"
      ? row.semantic_rank
      : null,
    keyword_score: typeof row.keyword_score === "number"
      ? row.keyword_score
      : null,
    semantic_score: typeof row.semantic_score === "number"
      ? row.semantic_score
      : null,
    rrf_score: typeof row.rrf_score === "number" ? row.rrf_score : null,
  })).slice(0, 3);
}

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

export function cleanRequiredText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
    { ...analysis, needs_review: false, collection_decisions: nextDecisions },
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

export function collectionDecisionKey(
  decision: Record<string, unknown>,
  index: number,
) {
  return `${index}:${decision.type || ""}:${
    decision.collectionId || decision.collection_id || decision.title || ""
  }`;
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
    let collectionId = typeof decision.collectionId === "string"
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

export async function acceptPendingCollectionDecisions(
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
  const signed = await withSignedCaptureAssets(
    supabase,
    userId,
    (rows[0] ?? data) as Record<string, unknown>,
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

  let collectionId = typeof choice.collectionId === "string"
    ? choice.collectionId
    : "";
  if (choice.type === "existing") {
    if (!collectionId) return json({ error: "collectionId is required" }, 400);
    const collection = await supabase
      .from("collections")
      .select("id,status")
      .eq("user_id", userId)
      .eq("id", collectionId)
      .maybeSingle();
    if (collection.error) throw collection.error;
    if (!collection.data) return json({ error: "Collection not found" }, 404);
    if (collection.data.status === "archived") {
      return json({ error: "Archived collections cannot be linked" }, 400);
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
      ...currentAnalysis,
      needs_review: false,
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
      ...currentAnalysis,
      needs_review: false,
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
      .select("rationale, confidence, collections(id,title,description,status)")
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
    if (collection && collection.status !== "archived") {
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
      needs_review: false,
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
      ...currentAnalysis,
      needs_review: false,
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
