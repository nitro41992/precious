import { adminClient } from "../supabase.ts";
import { json } from "../http.ts";
import { analysisRequiresReview, normalizedReviewAnalysis, resolveReviewTargets } from "../analysis/review-normalization.ts";
import {
  linkCaptureToCollection,
  refreshCollectionPreviewAfterCaptureRemoval,
} from "../collections/links.ts";
import { captureResponse } from "../collections/responses.ts";
import { markCollectionDecisionAccepted } from "../collections/review-decisions.ts";
import { scheduleCaptureEmbeddingRefresh } from "../collections/embeddings.ts";

export function collectionIdList(value: unknown) {
  if (!Array.isArray(value)) return null;
  return [
    ...new Set(
      value
        .map((item) => typeof item === "string" ? item.trim() : "")
        .filter(Boolean),
    ),
  ];
}

type LinkManyItem = {
  captureId: string;
  confidence: number | null;
  createdBy: "analysis" | "user";
  rationale: string | null;
  title: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function linkManyItems(value: unknown) {
  if (!Array.isArray(value)) return null;
  const items: LinkManyItem[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const captureId = typeof record.captureId === "string"
      ? record.captureId.trim()
      : "";
    if (!captureId || seen.has(captureId)) continue;
    seen.add(captureId);
    const confidence = Number(record.confidence);
    items.push({
      captureId,
      confidence: Number.isFinite(confidence) ? confidence : null,
      createdBy: record.createdBy === "analysis" ? "analysis" : "user",
      rationale: typeof record.rationale === "string" ? record.rationale : null,
      title: typeof record.title === "string" ? record.title : "",
    });
  }
  return items;
}

async function resolveCaptureRef(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  captureRef: string,
  options: { requireActive?: boolean } = {},
) {
  const select = "id, archived_at, deleted_at";
  let row: Record<string, unknown> | null = null;

  if (UUID_RE.test(captureRef)) {
    const byId = await supabase
      .from("captures")
      .select(select)
      .eq("user_id", userId)
      .eq("id", captureRef)
      .maybeSingle();
    if (byId.error) throw byId.error;
    row = byId.data as Record<string, unknown> | null;
  }

  if (!row) {
    const byClientKey = await supabase
      .from("captures")
      .select(select)
      .eq("user_id", userId)
      .eq("client_capture_key", captureRef)
      .maybeSingle();
    if (byClientKey.error) throw byClientKey.error;
    row = byClientKey.data as Record<string, unknown> | null;
  }

  if (!row) return { response: json({ error: "Capture not found" }, 404) };
  if (options.requireActive && (row.archived_at || row.deleted_at)) {
    return { response: json({ error: "Deleted captures cannot be linked" }, 400) };
  }
  return { captureId: String(row.id) };
}

async function resolveCaptureRefs(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  captureRefs: string[],
  options: { requireActive?: boolean } = {},
) {
  const captureIds: string[] = [];
  const seen = new Set<string>();
  for (const captureRef of captureRefs) {
    const resolved = await resolveCaptureRef(supabase, userId, captureRef, options);
    if ("response" in resolved) return resolved;
    if (!resolved.captureId || seen.has(resolved.captureId)) continue;
    seen.add(resolved.captureId);
    captureIds.push(resolved.captureId);
  }
  return { captureIds };
}

async function resolveLinkManyItems(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  items: LinkManyItem[],
) {
  const resolvedItems: Array<LinkManyItem & { resolvedCaptureId: string }> = [];
  for (const item of items) {
    const resolved = await resolveCaptureRef(
      supabase,
      userId,
      item.captureId,
      { requireActive: true },
    );
    if ("response" in resolved) return resolved;
    resolvedItems.push({ ...item, resolvedCaptureId: resolved.captureId });
  }
  return { items: resolvedItems };
}

export async function setCaptureCollections(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  captureRef: string,
  collectionIdsValue: unknown,
) {
  const collectionIds = collectionIdList(collectionIdsValue);
  if (!collectionIds) {
    return json({ error: "collectionIds must be an array" }, 400);
  }

  const capture = await supabase
    .from("captures")
    .select("id, analysis, review_confirmed_at, archived_at, deleted_at")
    .eq("user_id", userId)
    .or(`id.eq.${captureRef},client_capture_key.eq.${captureRef}`)
    .maybeSingle();
  if (capture.error) throw capture.error;
  if (!capture.data) return json({ error: "Capture not found" }, 404);
  if (capture.data.deleted_at || capture.data.archived_at) {
    return json({ error: "Deleted captures cannot be linked" }, 400);
  }
  const captureId = String(capture.data.id);

  if (collectionIds.length) {
    const collections = await supabase
      .from("collections")
      .select("id,status,deleted_at")
      .eq("user_id", userId)
      .in("id", collectionIds);
    if (collections.error) throw collections.error;
    const activeIds = new Set(
      (collections.data ?? [])
        .filter((collection) => collection.status === "active")
        .filter((collection) => !collection.deleted_at)
        .map((collection) => String(collection.id)),
    );
    const missingIds = collectionIds.filter((id) => !activeIds.has(id));
    if (missingIds.length) {
      return json({ error: "Only active collections can be linked" }, 400);
    }
  }

  const currentLinks = await supabase
    .from("collection_capture_links")
    .select("collection_id")
    .eq("user_id", userId)
    .eq("capture_id", captureId)
    .is("unlinked_at", null);
  if (currentLinks.error) throw currentLinks.error;
  const currentIds = new Set(
    (currentLinks.data ?? []).map((row) => String(row.collection_id)),
  );
  const targetIds = new Set(collectionIds);
  const removeIds = [...currentIds].filter((id) => !targetIds.has(id));
  const addIds = [...targetIds].filter((id) => !currentIds.has(id));

  if (removeIds.length) {
    const unlink = await supabase
      .from("collection_capture_links")
      .update({
        unlinked_at: new Date().toISOString(),
        unlink_reason: "user_removed",
      })
      .eq("user_id", userId)
      .eq("capture_id", captureId)
      .in("collection_id", removeIds)
      .is("unlinked_at", null);
    if (unlink.error) throw unlink.error;
    await Promise.all(
      removeIds.map((collectionId) =>
        refreshCollectionPreviewAfterCaptureRemoval(
          supabase,
          userId,
          collectionId,
          [captureId],
        )
      ),
    );
  }

  for (const collectionId of addIds) {
    await linkCaptureToCollection(supabase, userId, collectionId, captureId, {
      createdBy: "user",
    });
  }

  const currentAnalysis =
    capture.data.analysis && typeof capture.data.analysis === "object"
      ? capture.data.analysis as Record<string, unknown>
      : {};
  const nextAnalysis = normalizedReviewAnalysis(
    {
      ...resolveReviewTargets(
        currentAnalysis,
        ["collections", "analysis"],
        capture.data.review_confirmed_at,
      ),
      collection_decisions: [],
      suggested_collections: [],
      collection_choice_overrides: [],
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

  return await captureResponse(supabase, userId, captureId);
}

export async function handleCollectionLinksResource(
  request: Request,
  supabase: ReturnType<typeof adminClient>,
  userId: string,
) {
  const body = await request.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";
  if (request.method === "PATCH" && action === "set_capture_collections") {
    const captureId = typeof body.captureId === "string" ? body.captureId : "";
    if (!captureId) return json({ error: "captureId is required" }, 400);
    return await setCaptureCollections(
      supabase,
      userId,
      captureId,
      body.collectionIds,
    );
  }

  const collectionId = typeof body.collectionId === "string"
    ? body.collectionId
    : "";
  if (!collectionId) {
    return json({ error: "collectionId is required" }, 400);
  }

  const collection = await supabase
    .from("collections")
    .select("id,title,description,status,deleted_at")
    .eq("user_id", userId)
    .eq("id", collectionId)
    .maybeSingle();
  if (collection.error) throw collection.error;
  if (!collection.data) return json({ error: "Collection not found" }, 404);

  if (request.method === "PATCH" && action === "unlink_many") {
    const captureRefs = collectionIdList(body.captureIds);
    if (!captureRefs) {
      return json({ error: "captureIds must be an array" }, 400);
    }
    const resolved = await resolveCaptureRefs(supabase, userId, captureRefs);
    if ("response" in resolved) return resolved.response;
    if (!resolved.captureIds.length) return json({ ok: true, count: 0 });
    const unlink = await supabase
      .from("collection_capture_links")
      .update({ unlinked_at: new Date().toISOString(), unlink_reason: "user" })
      .eq("user_id", userId)
      .eq("collection_id", collectionId)
      .in("capture_id", resolved.captureIds)
      .is("unlinked_at", null);
    if (unlink.error) throw unlink.error;
    await refreshCollectionPreviewAfterCaptureRemoval(
      supabase,
      userId,
      collectionId,
      resolved.captureIds,
    );
    for (const captureId of resolved.captureIds) {
      scheduleCaptureEmbeddingRefresh(supabase, userId, captureId);
    }
    return json({ ok: true, count: resolved.captureIds.length });
  }

  if (request.method === "POST" && action === "link_many") {
    if (collection.data.status === "archived" || collection.data.deleted_at) {
      return json({ error: "Deleted collections cannot be linked" }, 400);
    }
    const items = linkManyItems(body.items);
    if (!items) return json({ error: "items must be an array" }, 400);
    const resolved = await resolveLinkManyItems(supabase, userId, items);
    if ("response" in resolved) return resolved.response;
    for (const item of resolved.items) {
      await linkCaptureToCollection(
        supabase,
        userId,
        collectionId,
        item.resolvedCaptureId,
        {
          createdBy: item.createdBy,
          rationale: item.rationale,
          confidence: item.confidence,
        },
      );
      await markCollectionDecisionAccepted(supabase, userId, item.resolvedCaptureId, {
        type: "existing",
        title: item.title,
        collectionId,
      });
    }
    return json({ ok: true, count: resolved.items.length });
  }

  const captureId = typeof body.captureId === "string" ? body.captureId : "";
  if (!captureId) {
    return json({ error: "captureId is required" }, 400);
  }

  if (request.method === "POST") {
    if (collection.data.status === "archived" || collection.data.deleted_at) {
      return json({ error: "Deleted collections cannot be linked" }, 400);
    }
    const capture = await supabase
      .from("captures")
      .select("id,archived_at,deleted_at")
      .eq("user_id", userId)
      .or(`id.eq.${captureId},client_capture_key.eq.${captureId}`)
      .maybeSingle();
    if (capture.error) throw capture.error;
    if (!capture.data) return json({ error: "Capture not found" }, 404);
    if (capture.data.archived_at || capture.data.deleted_at) {
      return json({ error: "Deleted captures cannot be linked" }, 400);
    }
    // The request may identify the capture by its client_capture_key (a
    // not-yet-synced capture has no remote id), so always link with the
    // resolved DB uuid — the links table's capture_id column is a uuid.
    const resolvedCaptureId = String(capture.data.id);
    await linkCaptureToCollection(supabase, userId, collectionId, resolvedCaptureId, {
      createdBy: body.createdBy === "analysis" ? "analysis" : "user",
      rationale: typeof body.rationale === "string" ? body.rationale : null,
      confidence: Number.isFinite(Number(body.confidence))
        ? Number(body.confidence)
        : null,
    });
    await markCollectionDecisionAccepted(supabase, userId, resolvedCaptureId, {
      type: "existing",
      title: typeof body.title === "string" ? body.title : "",
      collectionId,
    });
    return json({ ok: true });
  }

  if (request.method === "PATCH" && body.action === "unlink") {
    const { error } = await supabase
      .from("collection_capture_links")
      .update({ unlinked_at: new Date().toISOString(), unlink_reason: "user" })
      .eq("user_id", userId)
      .eq("collection_id", collectionId)
      .eq("capture_id", captureId)
      .is("unlinked_at", null);
    if (error) throw error;
    await refreshCollectionPreviewAfterCaptureRemoval(
      supabase,
      userId,
      collectionId,
      [captureId],
    );
    scheduleCaptureEmbeddingRefresh(supabase, userId, captureId);
    return json({ ok: true });
  }

  return json({ error: "Not found" }, 404);
}
