import { adminClient } from "../supabase.ts";
import { CAPTURE_LIST_SELECT } from "../config.ts";
import { json } from "../http.ts";
import { archivedFilter, withCaptureStates, withSignedCaptureAssetRows } from "../capture-records.ts";

export async function handleCollectionCapturesResource(
  request: Request,
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  url: URL,
) {
  if (request.method !== "GET") return json({ error: "Not found" }, 404);
  const collectionId = url.searchParams.get("collectionId") || "";
  if (!collectionId) return json({ error: "collectionId is required" }, 400);

  const collection = await supabase
    .from("collections")
    .select("id,status")
    .eq("user_id", userId)
    .eq("id", collectionId)
    .maybeSingle();
  if (collection.error) throw collection.error;
  if (!collection.data) return json({ error: "Collection not found" }, 404);
  if (collection.data.status === "archived") return json({ captures: [] });
  const collectionRow = collection.data as Record<string, unknown>;

  const limit = Math.max(
    1,
    Math.min(Number(url.searchParams.get("limit") || 30), 100),
  );
  const before = url.searchParams.get("before");
  let query = supabase
    .from("collection_capture_links")
    .select(`linked_at, captures(${CAPTURE_LIST_SELECT})`)
    .eq("user_id", userId)
    .eq("collection_id", collectionId)
    .is("unlinked_at", null)
    .order("linked_at", { ascending: false })
    .limit(limit + 1);
  if (before) query = query.lt("linked_at", before);
  const { data, error } = await query;
  if (error) throw error;

  const fetchedLinks = (data ?? []) as Array<Record<string, unknown>>;
  const linkRows = fetchedLinks.slice(0, limit);
  const captureRows = linkRows
    .map((row) => {
      const captures = row.captures;
      const capture = Array.isArray(captures) ? captures[0] : captures;
      if (!capture || typeof capture !== "object") return null;
      return {
        ...(capture as Record<string, unknown>),
        linked_collections: [
          {
            id: collectionId,
            title: String(collectionRow.title || ""),
            description: String(collectionRow.description || ""),
            created_by: "user",
            rationale: null,
            confidence: null,
            linked_at: row.linked_at || null,
          },
        ],
      };
    })
    .filter(Boolean) as Array<Record<string, unknown>>;
  const signedRows = await withSignedCaptureAssetRows(
    supabase,
    userId,
    captureRows,
  );
  return json({
    captures: withCaptureStates(signedRows).filter((row) =>
      !row.rejected_at && archivedFilter(row, false)
    ),
    next_cursor: fetchedLinks.length > limit
      ? linkRows[linkRows.length - 1]?.linked_at || null
      : null,
  });
}
