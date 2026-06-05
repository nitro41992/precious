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

export async function retrieveCollectionsForCapture(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  capture: CaptureRow,
  urlEvidence: UrlEvidence | null,
  collectionContext: CollectionContext | null = null,
): Promise<RetrievedCollection[]> {
  const queryText = retrievalQueryForCapture(
    capture,
    urlEvidence,
    collectionContext,
  );
  if (!queryText) return [];
  const embedding = await createEmbedding(queryText);
  const { data, error } = await supabase.rpc("match_collections_for_capture", {
    p_user_id: userId,
    p_query_text: queryText,
    p_query_embedding: embeddingLiteral(embedding),
    p_match_count: COLLECTION_RETRIEVAL_MATCH_COUNT,
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
  })).slice(0, COLLECTION_RETRIEVAL_MATCH_COUNT);
}
