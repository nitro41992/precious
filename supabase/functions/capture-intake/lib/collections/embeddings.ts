import { adminClient } from "../supabase.ts";
import {
  compactText,
  env,
  jsonObject,
  runInBackground,
  stringValue,
} from "../common.ts";
import { OPENAI_REQUEST_TIMEOUT_MS } from "../config.ts";

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
    // Without a deadline a stalled embeddings request hangs the whole capture pipeline (it sits
    // in collection retrieval, before the main analysis call) until the edge isolate is killed —
    // stranding the capture in "processing" with no error. Bound it like the other OpenAI calls.
    signal: AbortSignal.timeout(OPENAI_REQUEST_TIMEOUT_MS),
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

async function captureWithLinkedCollections(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  capture: Record<string, unknown>,
) {
  const captureId = String(capture.id || "");
  if (!captureId) return capture;
  const { data, error } = await supabase
    .from("collection_capture_links")
    .select(
      "collection_id, created_by, rationale, confidence, linked_at, collections(id,title,description,status,deleted_at)",
    )
    .eq("user_id", userId)
    .eq("capture_id", captureId)
    .is("unlinked_at", null);
  if (error) return capture;
  const linkedCollections = (data ?? [])
    .map((link) => {
      const record = link as Record<string, unknown>;
      const collection = record.collections as Record<string, unknown> | null;
      if (!collection || collection.status === "archived" || collection.deleted_at) return null;
      return {
        id: String(collection.id),
        title: String(collection.title || ""),
        description: String(collection.description || ""),
        created_by: String(record.created_by || "user"),
        rationale: record.rationale || null,
        confidence: record.confidence ?? null,
        linked_at: record.linked_at || null,
      };
    })
    .filter(Boolean);
  return { ...capture, linked_collections: linkedCollections };
}

export async function upsertCaptureEmbeddingForRow(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  capture: Record<string, unknown>,
) {
  const hydrated = await captureWithLinkedCollections(supabase, userId, capture);
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
