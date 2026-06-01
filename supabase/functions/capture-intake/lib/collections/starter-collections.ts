import { adminClient } from "../supabase.ts";
import {
  COLLECTION_LIST_SELECT,
  STARTER_COLLECTION_CREATED_BY,
  STARTER_COLLECTIONS,
} from "../config.ts";
import { runInBackground } from "../common.ts";
import { upsertCollectionEmbedding } from "./embeddings.ts";

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
