import { adminClient } from "../supabase.ts";
import { boundedLimit } from "../common.ts";
import { json } from "../http.ts";

export async function handlePurgeDeletedResource(
  request: Request,
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  url: URL,
) {
  if (request.method !== "POST") return json({ error: "Not found" }, 404);

  const limit = boundedLimit(url.searchParams.get("limit"), 100, 500);
  const now = new Date().toISOString();
  const expiredCaptures = await supabase
    .from("captures")
    .select("id,capture_assets(storage_path)")
    .eq("user_id", userId)
    .not("deleted_at", "is", null)
    .lte("delete_purge_after", now)
    .limit(limit);
  if (expiredCaptures.error) throw expiredCaptures.error;

  const captureRows = (expiredCaptures.data ?? []) as Array<Record<string, unknown>>;
  const captureIds = captureRows.map((row) => String(row.id)).filter(Boolean);
  const storagePaths = [
    ...new Set(
      captureRows.flatMap((row) => {
        const assets = Array.isArray(row.capture_assets) ? row.capture_assets : [];
        return assets
          .map((asset) =>
            asset && typeof asset === "object"
              ? String((asset as Record<string, unknown>).storage_path || "")
              : ""
          )
          .filter(Boolean);
      }),
    ),
  ];

  if (storagePaths.length) {
    await supabase.storage.from("captures").remove(storagePaths).catch(() => {
      // Storage cleanup is best-effort; database cascades remain authoritative.
    });
  }

  if (captureIds.length) {
    const deletedCaptures = await supabase
      .from("captures")
      .delete()
      .eq("user_id", userId)
      .in("id", captureIds);
    if (deletedCaptures.error) throw deletedCaptures.error;
  }

  const expiredCollections = await supabase
    .from("collections")
    .select("id")
    .eq("user_id", userId)
    .not("deleted_at", "is", null)
    .lte("delete_purge_after", now)
    .limit(limit);
  if (expiredCollections.error) throw expiredCollections.error;
  const collectionIds = (expiredCollections.data ?? [])
    .map((row) => String((row as Record<string, unknown>).id || ""))
    .filter(Boolean);
  if (collectionIds.length) {
    const deletedCollections = await supabase
      .from("collections")
      .delete()
      .eq("user_id", userId)
      .in("id", collectionIds);
    if (deletedCollections.error) throw deletedCollections.error;
  }

  return json({
    purged_captures: captureIds.length,
    purged_collections: collectionIds.length,
    storage_files_removed: storagePaths.length,
  });
}
