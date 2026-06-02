import { adminClient } from "../supabase.ts";
import { CAPTURE_LIST_SELECT } from "../config.ts";
import { boundedLimit } from "../common.ts";
import { json } from "../http.ts";
import { archivedFilter, withCaptureStates, withSignedCaptureAssetRows } from "../capture-records.ts";
import { attachLinkedCollections } from "../collections/links.ts";
import { createEmbedding, embeddingLiteral, scheduleCaptureEmbeddingRefresh } from "../collections/embeddings.ts";

export async function handleSearchResource(
  request: Request,
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  url: URL,
) {
  if (request.method !== "GET") return json({ error: "Not found" }, 404);
  const queryText = String(
    url.searchParams.get("q") || url.searchParams.get("query") || "",
  ).trim();
  if (!queryText) return json({ captures: [] });
  const scope = "active";
  const limit = boundedLimit(url.searchParams.get("limit"), 30, 100);
  const mode = url.searchParams.get("mode") === "keyword"
    ? "keyword"
    : "hybrid";
  const { data, error } = mode === "keyword"
    ? await supabase.rpc("match_captures_for_keyword_search", {
      p_user_id: userId,
      p_query_text: queryText,
      p_scope: scope,
      p_match_count: limit,
    })
    : await (async () => {
      const embedding = await createEmbedding(queryText);
      return supabase.rpc("match_captures_for_search", {
        p_user_id: userId,
        p_query_text: queryText,
        p_query_embedding: embeddingLiteral(embedding),
        p_scope: scope,
        p_match_count: limit,
      });
    })();
  if (error) throw error;
  const ranked = (data ?? []) as Array<Record<string, unknown>>;
  const ids = ranked.map((row) => String(row.id || "")).filter(Boolean);
  if (!ids.length) return json({ captures: [] });

  const { data: captureRows, error: captureError } = await supabase
    .from("captures")
    .select(CAPTURE_LIST_SELECT)
    .eq("user_id", userId)
    .is("rejected_at", null)
    .is("archived_at", null)
    .is("deleted_at", null)
    .in("id", ids);
  if (captureError) throw captureError;
  const byId = new Map(
    ((captureRows ?? []) as unknown as Array<Record<string, unknown>>).map((
      row,
    ) => [
      String(row.id),
      row,
    ]),
  );
  const orderedRows = ids
    .map((id) => byId.get(id))
    .filter(Boolean) as Array<Record<string, unknown>>;
  const rows = await attachLinkedCollections(supabase, userId, orderedRows);
  const signedRows = (await withSignedCaptureAssetRows(supabase, userId, rows))
    .filter(Boolean) as Array<Record<string, unknown>>;
  if (mode === "hybrid") {
    const semanticRankById = new Map(
      ranked.map((row) => [String(row.id), row.semantic_rank ?? null]),
    );
    for (const row of signedRows) {
      if (semanticRankById.get(String(row.id)) === null) {
        scheduleCaptureEmbeddingRefresh(
          supabase,
          userId,
          String(row.id),
          row as Record<string, unknown>,
        );
      }
    }
  }
  return json({
    mode,
    captures: withCaptureStates(signedRows).filter((row) =>
      archivedFilter(row, false)
    ),
  });
}
