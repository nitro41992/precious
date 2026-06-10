import { adminClient } from "../supabase.ts";
import { json } from "../http.ts";

// Supabase Storage caps the number of paths per remove() call; chunk to stay
// comfortably under it for accounts with many assets.
const STORAGE_REMOVE_CHUNK = 1000;

// Collect the de-duplicated, non-empty storage paths from capture_assets rows.
// Pure so it can be unit-tested without a live Supabase client.
export function storagePathsFromAssets(
  rows: Array<Record<string, unknown>> | null | undefined,
): string[] {
  return [
    ...new Set(
      (rows ?? [])
        .map((row) =>
          row && typeof row === "object"
            ? String((row as Record<string, unknown>).storage_path || "")
            : ""
        )
        .filter(Boolean),
    ),
  ];
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

// Permanently delete the caller's own account and all associated data.
//
// SECURITY: the userId is derived from the bearer token by the router
// (currentUser), never from the request body. This handler runs as the
// service role and bypasses RLS, so it must only ever act on that token-derived
// userId — it must NOT read any userId from the request.
//
// Every user-owned table is declared `references auth.users(id) on delete
// cascade`, so deleting the auth user cascades the entire database tree. Only
// Storage objects do not cascade, so those are removed explicitly first (while
// the capture_assets rows that name them still exist). If a future table holds
// user data, it MUST keep that ON DELETE CASCADE so this stays complete.
export async function handleAccountResource(
  request: Request,
  supabase: ReturnType<typeof adminClient>,
  userId: string,
) {
  if (request.method !== "DELETE") return json({ error: "Not found" }, 404);

  const assets = await supabase
    .from("capture_assets")
    .select("storage_path")
    .eq("user_id", userId);
  if (assets.error) throw assets.error;

  const storagePaths = storagePathsFromAssets(
    assets.data as Array<Record<string, unknown>> | null,
  );

  // Storage cleanup is best-effort; the auth-user cascade remains authoritative
  // for the database. Remove before deleteUser — afterwards the capture_assets
  // rows that name these paths are cascade-deleted and unrecoverable.
  for (const batch of chunk(storagePaths, STORAGE_REMOVE_CHUNK)) {
    await supabase.storage.from("captures").remove(batch).catch(() => {});
  }

  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw error;

  return json({ deleted: true, storage_files_removed: storagePaths.length });
}
