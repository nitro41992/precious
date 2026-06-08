import { adminClient } from "../supabase.ts";
import { compactText } from "../common.ts";
import {
  contentEvidenceProfile,
  looksLikeFileOrGeneratedMarker,
  textWithoutUrls,
} from "../analysis/content-evidence.ts";
import {
  evidenceTitleIsGeneric,
  substantiveDescription,
  substantiveText,
} from "../url-evidence/platforms.ts";
import type {
  CaptureRow,
  CollectionContext,
  RetrievedCollection,
  UrlEvidence,
} from "../types.ts";
import { createEmbedding, embeddingLiteral } from "./embeddings.ts";

export const COLLECTION_RETRIEVAL_MATCH_COUNT = 20;
export const COLLECTION_PROMPT_CANDIDATE_COUNT = 10;

export function retrievalQueryForCapture(
  capture: CaptureRow,
  urlEvidence: UrlEvidence | null,
  collectionContext: CollectionContext | null = null,
) {
  const profile = contentEvidenceProfile(capture, urlEvidence);
  const contextText = collectionContextText(collectionContext);
  const sourceText = profile.source_fallback_allowed
    ? capture.source_text
    : textWithoutUrls(capture.source_text);
  const safeSourceText = contextText && looksLikeFileOrGeneratedMarker(
      textWithoutUrls(sourceText),
    )
    ? null
    : sourceText;
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
    safeSourceText,
    profile.source_fallback_allowed ? capture.source_url : null,
    urlTitle,
    urlDescription,
    urlText,
    contextText,
    typeof (capture as Record<string, unknown>).context_note === "string"
      ? String((capture as Record<string, unknown>).context_note)
      : null,
  ]);
}

function collectionContextText(collectionContext: CollectionContext | null) {
  if (!collectionContext) return "";
  return compactText([
    collectionContext.inferred_title,
    collectionContext.short_summary,
    collectionContext.visible_text.join(" "),
    collectionContext.entities.map((entity) =>
      compactText([entity.type, entity.name, entity.evidence], 180)
    ).join(" "),
    collectionContext.source_hints.join(" "),
    collectionContext.search_phrases.join(" "),
  ], 2400);
}

function mapRetrievedRow(row: Record<string, unknown>): RetrievedCollection {
  return {
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
  };
}

// Retrieve active collections (auto-link candidates) and pending suggested collections
// (reuse candidates the analysis prompt shows the model so repeated saves consolidate)
// in one pass. The embedding is computed once over the same query and reused for both
// RPCs so suggestion awareness adds no extra embedding call.
export async function retrieveCollectionCandidatesForCapture(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  capture: CaptureRow,
  urlEvidence: UrlEvidence | null,
  collectionContext: CollectionContext | null = null,
): Promise<{ active: RetrievedCollection[]; pending: RetrievedCollection[] }> {
  const queryText = retrievalQueryForCapture(
    capture,
    urlEvidence,
    collectionContext,
  );
  if (!queryText) return { active: [], pending: [] };
  const embedding = await createEmbedding(queryText);
  const queryEmbedding = embeddingLiteral(embedding);
  const [activeResult, pendingResult] = await Promise.all([
    supabase.rpc("match_collections_for_capture", {
      p_user_id: userId,
      p_query_text: queryText,
      p_query_embedding: queryEmbedding,
      p_match_count: COLLECTION_RETRIEVAL_MATCH_COUNT,
    }),
    supabase.rpc("match_collection_suggestions_for_capture", {
      p_user_id: userId,
      p_query_text: queryText,
      p_query_embedding: queryEmbedding,
      p_match_count: COLLECTION_PROMPT_CANDIDATE_COUNT,
    }),
  ]);
  if (activeResult.error) throw activeResult.error;
  const active = ((activeResult.data ?? []) as Array<Record<string, unknown>>)
    .map(mapRetrievedRow)
    .slice(0, COLLECTION_RETRIEVAL_MATCH_COUNT);
  // Pending suggestions are awareness-only; never let their failure block analysis.
  if (pendingResult.error) {
    console.warn(
      "Pending suggestion retrieval failed",
      pendingResult.error.message,
    );
    return { active, pending: [] };
  }
  const pending = ((pendingResult.data ?? []) as Array<Record<string, unknown>>)
    .map(mapRetrievedRow)
    .slice(0, COLLECTION_PROMPT_CANDIDATE_COUNT);
  return { active, pending };
}
