import { adminClient, currentUser } from "./supabase.ts";
import {
  activeSaveIntentKeySet,
  CAPTURE_DETAIL_SELECT,
  CAPTURE_LIST_SELECT,
  COLLECTION_LIST_SELECT,
  corsHeaders,
} from "./config.ts";
import {
  boundedLimit,
  errorMessage,
  isUuid,
  runInBackground,
} from "./common.ts";
import { json } from "./http.ts";
import {
  archivedFilter,
  mergeAnalysisPatch,
  readCapturePayload,
  withCaptureState,
  withCaptureStates,
  withSignedCaptureAssetRows,
} from "./capture-records.ts";
import {
  createOrGetCaptureFromFields,
  createOrGetCaptureWithAsset,
  processCapture,
} from "./captures.ts";
import { handleClientEventsResource } from "./client-events.ts";
import {
  acceptPendingCollectionDecisions,
  activeCollectionCounts,
  applyCollectionChoice,
  applyCollectionReviewDecisions,
  attachLinkedCollections,
  captureResponse,
  cleanRequiredText,
  clearCollectionSuggestion,
  collectionFromRow,
  confirmedReminderSuggestions,
  createEmbedding,
  dismissReminderSuggestion,
  embeddingLiteral,
  linkCaptureToCollection,
  markCollectionDecisionAccepted,
  reviewReminderSuggestions,
  scheduleCaptureEmbeddingRefresh,
  scheduleCollectionCaptureEmbeddingsRefresh,
  seedStarterCollectionsIfNeeded,
  undoCollectionChoice,
  upsertCollectionEmbedding,
} from "./collections.ts";
import {
  analysisRequiresReview,
  analysisWithCurrentIntent,
  normalizedReviewAnalysis,
  resolveReviewTargets,
} from "./analysis.ts";

export async function handleCollectionsResource(
  request: Request,
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  url: URL,
) {
  if (request.method === "GET") {
    await seedStarterCollectionsIfNeeded(supabase, userId);
    const archived = url.searchParams.get("archived") === "true";
    const limit = boundedLimit(url.searchParams.get("limit"), 50, 100);
    const before = url.searchParams.get("before");
    let query = supabase
      .from("collections")
      .select(COLLECTION_LIST_SELECT)
      .eq("user_id", userId)
      .eq("status", archived ? "archived" : "active")
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (before) query = query.lt("created_at", before);
    const { data, error } = await query;
    if (error) throw error;
    const fetchedRows = (data ?? []) as Array<Record<string, unknown>>;
    const rows = fetchedRows.slice(0, limit);
    const counts = await activeCollectionCounts(
      supabase,
      userId,
      rows.map((row) => String(row.id)),
    );
    return json({
      collections: rows.map((row) => collectionFromRow(row, counts)),
      next_cursor: fetchedRows.length > limit
        ? rows[rows.length - 1]?.created_at || null
        : null,
    });
  }

  const body = await request.json().catch(() => ({}));
  const collectionId = typeof body.collectionId === "string"
    ? body.collectionId
    : "";

  if (request.method === "POST") {
    const title = cleanRequiredText(body.title);
    const description = cleanRequiredText(body.description);
    if (!title || !description) {
      return json({ error: "title and description are required" }, 400);
    }
    const { data, error } = await supabase
      .from("collections")
      .insert({
        user_id: userId,
        title,
        description,
        created_by: "user",
      })
      .select("*")
      .single();
    if (error) throw error;
    await upsertCollectionEmbedding(
      supabase,
      userId,
      data.id,
      title,
      description,
    );
    if (typeof body.captureId === "string" && body.captureId) {
      await linkCaptureToCollection(supabase, userId, data.id, body.captureId, {
        createdBy: "user",
        rationale: typeof body.rationale === "string" ? body.rationale : null,
        confidence: Number.isFinite(Number(body.confidence))
          ? Number(body.confidence)
          : null,
      });
      await markCollectionDecisionAccepted(supabase, userId, body.captureId, {
        type: "new",
        title,
        collectionId: data.id,
      });
    }
    return json({
      collection: collectionFromRow(data as Record<string, unknown>),
    }, 201);
  }

  if (request.method !== "PATCH") return json({ error: "Not found" }, 404);
  if (!collectionId) return json({ error: "collectionId is required" }, 400);

  const existing = await supabase
    .from("collections")
    .select("*")
    .eq("user_id", userId)
    .eq("id", collectionId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) return json({ error: "Collection not found" }, 404);

  if (body.action === "archive") {
    const activeLinks = await supabase
      .from("collection_capture_links")
      .select("capture_id")
      .eq("user_id", userId)
      .eq("collection_id", collectionId)
      .is("unlinked_at", null);
    if (activeLinks.error) throw activeLinks.error;
    const snapshot = (activeLinks.data ?? []).map((row) =>
      String((row as Record<string, unknown>).capture_id)
    );
    const archivedAt = new Date().toISOString();
    const unlink = await supabase
      .from("collection_capture_links")
      .update({ unlinked_at: archivedAt, unlink_reason: "collection_archived" })
      .eq("user_id", userId)
      .eq("collection_id", collectionId)
      .is("unlinked_at", null);
    if (unlink.error) throw unlink.error;
    const { data, error } = await supabase
      .from("collections")
      .update({
        status: "archived",
        archived_at: archivedAt,
        archive_link_snapshot: snapshot,
      })
      .eq("user_id", userId)
      .eq("id", collectionId)
      .select("*")
      .single();
    if (error) throw error;
    for (const captureId of snapshot) {
      scheduleCaptureEmbeddingRefresh(supabase, userId, captureId);
    }
    return json({
      collection: collectionFromRow(data as Record<string, unknown>),
    });
  }

  if (body.action === "restore") {
    const snapshot = Array.isArray(existing.data.archive_link_snapshot)
      ? existing.data.archive_link_snapshot.map(String)
      : [];
    const { data, error } = await supabase
      .from("collections")
      .update({ status: "active", archived_at: null })
      .eq("user_id", userId)
      .eq("id", collectionId)
      .select("*")
      .single();
    if (error) throw error;
    for (const captureId of snapshot) {
      await linkCaptureToCollection(supabase, userId, collectionId, captureId, {
        createdBy: "restore",
      });
    }
    return json({
      collection: collectionFromRow(data as Record<string, unknown>),
    });
  }

  const title = body.title === undefined
    ? String(existing.data.title || "")
    : cleanRequiredText(body.title);
  const description = body.description === undefined
    ? String(existing.data.description || "")
    : cleanRequiredText(body.description);
  if (!title || !description) {
    return json({ error: "title and description are required" }, 400);
  }
  const { data, error } = await supabase
    .from("collections")
    .update({ title, description })
    .eq("user_id", userId)
    .eq("id", collectionId)
    .select("*")
    .single();
  if (error) throw error;
  await upsertCollectionEmbedding(
    supabase,
    userId,
    collectionId,
    title,
    description,
  );
  scheduleCollectionCaptureEmbeddingsRefresh(supabase, userId, collectionId);
  return json({
    collection: collectionFromRow(data as Record<string, unknown>),
  });
}

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
  const rawScope = url.searchParams.get("scope") || "active";
  const scope = rawScope === "archived" || rawScope === "all"
    ? rawScope
    : "active";
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
      scope === "all" ? true : archivedFilter(row, scope === "archived")
    ),
  });
}

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
    .select("id, analysis, review_confirmed_at")
    .eq("user_id", userId)
    .or(`id.eq.${captureRef},client_capture_key.eq.${captureRef}`)
    .maybeSingle();
  if (capture.error) throw capture.error;
  if (!capture.data) return json({ error: "Capture not found" }, 404);
  const captureId = String(capture.data.id);

  if (collectionIds.length) {
    const collections = await supabase
      .from("collections")
      .select("id,status")
      .eq("user_id", userId)
      .in("id", collectionIds);
    if (collections.error) throw collections.error;
    const activeIds = new Set(
      (collections.data ?? [])
        .filter((collection) => collection.status === "active")
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
  const captureId = typeof body.captureId === "string" ? body.captureId : "";
  if (!collectionId || !captureId) {
    return json({ error: "collectionId and captureId are required" }, 400);
  }

  const collection = await supabase
    .from("collections")
    .select("id,title,description,status")
    .eq("user_id", userId)
    .eq("id", collectionId)
    .maybeSingle();
  if (collection.error) throw collection.error;
  if (!collection.data) return json({ error: "Collection not found" }, 404);

  if (request.method === "POST") {
    if (collection.data.status === "archived") {
      return json({ error: "Archived collections cannot be linked" }, 400);
    }
    await linkCaptureToCollection(supabase, userId, collectionId, captureId, {
      createdBy: body.createdBy === "analysis" ? "analysis" : "user",
      rationale: typeof body.rationale === "string" ? body.rationale : null,
      confidence: Number.isFinite(Number(body.confidence))
        ? Number(body.confidence)
        : null,
    });
    await markCollectionDecisionAccepted(supabase, userId, captureId, {
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
    scheduleCaptureEmbeddingRefresh(supabase, userId, captureId);
    return json({ ok: true });
  }

  return json({ error: "Not found" }, 404);
}

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
      archivedFilter(row, false)
    ),
    next_cursor: fetchedLinks.length > limit
      ? linkRows[linkRows.length - 1]?.linked_at || null
      : null,
  });
}

export async function handleCaptureIntakeRequest(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const user = await currentUser(request);
  if (!user) return json({ error: "Unauthorized" }, 401);

  try {
    const url = new URL(request.url);
    const supabase = adminClient();
    const resource = url.searchParams.get("resource") || "";

    if (resource === "client-events") {
      return await handleClientEventsResource(request, supabase, user.id);
    }

    if (resource === "search") {
      return await handleSearchResource(request, supabase, user.id, url);
    }

    if (resource === "collections") {
      return await handleCollectionsResource(request, supabase, user.id, url);
    }

    if (resource === "collection-links") {
      return await handleCollectionLinksResource(request, supabase, user.id);
    }

    if (resource === "collection-captures") {
      return await handleCollectionCapturesResource(
        request,
        supabase,
        user.id,
        url,
      );
    }

    if (request.method === "GET") {
      const clientCaptureKey = url.searchParams.get("clientCaptureKey");
      const archived = url.searchParams.get("archived") === "true";
      const limit = boundedLimit(url.searchParams.get("limit"), 30, 100);
      const before = url.searchParams.get("before");
      let query = supabase
        .from("captures")
        .select(clientCaptureKey ? CAPTURE_DETAIL_SELECT : CAPTURE_LIST_SELECT)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (clientCaptureKey) {
        query = isUuid(clientCaptureKey)
          ? query.or(
            `id.eq.${clientCaptureKey},client_capture_key.eq.${clientCaptureKey}`,
          )
          : query.eq("client_capture_key", clientCaptureKey);
        query = query.limit(1);
      } else {
        query = archived
          ? query.not("archived_at", "is", null)
          : query.is("archived_at", null);
        if (before) query = query.lt("created_at", before);
        query = query.limit(limit + 1);
      }
      const { data, error } = await query;
      if (error) throw error;
      const fetchedRows = (data ?? []) as unknown as Array<
        Record<string, unknown>
      >;
      const pageRows = clientCaptureKey
        ? fetchedRows
        : fetchedRows.slice(0, limit);
      const rows = await attachLinkedCollections(
        supabase,
        user.id,
        pageRows,
      );
      const signedRows = await withSignedCaptureAssetRows(
        supabase,
        user.id,
        rows as Array<Record<string, unknown>>,
        clientCaptureKey ? "detail" : "thumb",
      );
      if (clientCaptureKey) {
        return json({ capture: withCaptureState(signedRows?.[0] ?? null) });
      }
      return json({
        captures: withCaptureStates(signedRows).filter((row) =>
          archivedFilter(row, archived)
        ),
        next_cursor: fetchedRows.length > limit
          ? pageRows[pageRows.length - 1]?.created_at || null
          : null,
      });
    }

    if (request.method === "PATCH") {
      const body = await request.json().catch(() => ({}));
      const captureId = typeof body.captureId === "string"
        ? body.captureId
        : "";
      if (!captureId) return json({ error: "captureId is required" }, 400);

      const existingResult = await supabase
        .from("captures")
        .select("*")
        .eq("user_id", user.id)
        .or(`id.eq.${captureId},client_capture_key.eq.${captureId}`)
        .maybeSingle();
      if (existingResult.error) throw existingResult.error;
      if (!existingResult.data) {
        return json({ error: "Capture not found" }, 404);
      }

      if (body.action === "apply_collection_choice") {
        return await applyCollectionChoice(
          supabase,
          user.id,
          existingResult.data as Record<string, unknown>,
          body,
        );
      }

      if (body.action === "clear_collection_suggestion") {
        return await clearCollectionSuggestion(
          supabase,
          user.id,
          existingResult.data as Record<string, unknown>,
          body,
        );
      }

      if (body.action === "undo_collection_choice") {
        return await undoCollectionChoice(
          supabase,
          user.id,
          existingResult.data as Record<string, unknown>,
          body,
        );
      }

      if (body.action === "archive" || body.action === "restore") {
        const archivedAt = body.action === "archive"
          ? new Date().toISOString()
          : null;
        const analysis = mergeAnalysisPatch(existingResult.data, {
          capture_state: body.action === "archive" ? "archived" : "active",
          archived_at: archivedAt,
        });
        let result = await supabase
          .from("captures")
          .update({ analysis, archived_at: archivedAt })
          .eq("user_id", user.id)
          .or(`id.eq.${captureId},client_capture_key.eq.${captureId}`)
          .select("*")
          .single();
        if (
          result.error &&
          /archived_at|schema cache|column/i.test(
            String(result.error.message || result.error.details || ""),
          )
        ) {
          result = await supabase
            .from("captures")
            .update({ analysis })
            .eq("user_id", user.id)
            .or(`id.eq.${captureId},client_capture_key.eq.${captureId}`)
            .select("*")
            .single();
        }
        if (result.error) throw result.error;
        return await captureResponse(
          supabase,
          user.id,
          String(existingResult.data.id),
        );
      }

      if (body.action === "confirm_review") {
        const currentAnalysis = existingResult.data.analysis &&
            typeof existingResult.data.analysis === "object"
          ? existingResult.data.analysis as Record<string, unknown>
          : {};
        await acceptPendingCollectionDecisions(
          supabase,
          user.id,
          String(existingResult.data.id),
          currentAnalysis,
        );
        const confirmedAt = new Date().toISOString();
        const confirmedAnalysis = normalizedReviewAnalysis(
          {
            ...resolveReviewTargets(
              analysisWithCurrentIntent(
                currentAnalysis,
                body.currentSaveIntent,
              ),
              ["intent", "collections", "reminder", "analysis"],
            ),
            collection_decisions: [],
            suggested_collections: [],
            suggested_reminders: confirmedReminderSuggestions(
              currentAnalysis,
            ),
          },
          confirmedAt,
        );
        const update: Record<string, unknown> = {
          analysis: confirmedAnalysis,
          analysis_state: "ready",
          review_confirmed_at: confirmedAt,
        };
        if (typeof body.title === "string") {
          const title = body.title.trim() || null;
          update.title = title;
          update.display_title = title;
        }
        if (typeof body.note === "string") {
          update.context_note = body.note.trim() || null;
        }
        if (typeof body.currentSaveIntent === "string") {
          if (!activeSaveIntentKeySet.has(body.currentSaveIntent)) {
            return json({
              error: "currentSaveIntent is not an active save intent",
            }, 400);
          }
          update.current_save_intent = body.currentSaveIntent;
          update.intent_corrected_at = confirmedAt;
        } else if (body.currentSaveIntent === null) {
          update.current_save_intent = null;
          update.intent_corrected_at = confirmedAt;
        }
        let result = await supabase
          .from("captures")
          .update(update)
          .eq("user_id", user.id)
          .or(`id.eq.${captureId},client_capture_key.eq.${captureId}`)
          .select("*")
          .single();
        if (
          result.error &&
          /review_confirmed_at|intent_corrected_at|schema cache|column/i.test(
            String(result.error.message || result.error.details || ""),
          )
        ) {
          const fallbackUpdate = { ...update };
          delete fallbackUpdate.review_confirmed_at;
          if (
            /intent_corrected_at/i.test(
              String(result.error.message || result.error.details || ""),
            )
          ) {
            delete fallbackUpdate.intent_corrected_at;
          }
          result = await supabase
            .from("captures")
            .update(fallbackUpdate)
            .eq("user_id", user.id)
            .or(`id.eq.${captureId},client_capture_key.eq.${captureId}`)
            .select("*")
            .single();
        }
        if (result.error) throw result.error;
        return await captureResponse(
          supabase,
          user.id,
          String(existingResult.data.id),
        );
      }

      if (body.action === "save_review_decisions") {
        const currentAnalysis = existingResult.data.analysis &&
            typeof existingResult.data.analysis === "object"
          ? existingResult.data.analysis as Record<string, unknown>
          : {};
        await applyCollectionReviewDecisions(
          supabase,
          user.id,
          String(existingResult.data.id),
          body.collectionDecisions,
        );
        const resolvedTargets = new Set<string>();
        if (
          typeof body.currentSaveIntent === "string" ||
          body.currentSaveIntent === null
        ) {
          resolvedTargets.add("intent");
        }
        if (Array.isArray(body.collectionDecisions)) {
          resolvedTargets.add("collections");
        }
        if (Array.isArray(body.reminderDecisions)) {
          resolvedTargets.add("reminder");
        }
        resolvedTargets.add("analysis");
        const nextAnalysis = normalizedReviewAnalysis(
          {
            ...resolveReviewTargets(
              analysisWithCurrentIntent(
                currentAnalysis,
                body.currentSaveIntent,
              ),
              [...resolvedTargets],
            ),
            collection_decisions: [],
            suggested_collections: [],
            suggested_reminders: reviewReminderSuggestions(
              currentAnalysis,
              body.reminderDecisions,
            ),
          },
          body.currentSaveIntent === null
            ? new Date().toISOString()
            : existingResult.data.review_confirmed_at,
        );
        const update: Record<string, unknown> = {
          analysis: nextAnalysis,
          analysis_state: analysisRequiresReview(
              nextAnalysis,
              existingResult.data.review_confirmed_at,
            )
            ? "needs_review"
            : "ready",
        };
        if (typeof body.title === "string") {
          const title = body.title.trim() || null;
          update.title = title;
          update.display_title = title;
        }
        if (typeof body.note === "string") {
          update.context_note = body.note.trim() || null;
        }
        if (typeof body.currentSaveIntent === "string") {
          if (!activeSaveIntentKeySet.has(body.currentSaveIntent)) {
            return json({
              error: "currentSaveIntent is not an active save intent",
            }, 400);
          }
          update.current_save_intent = body.currentSaveIntent;
          update.intent_corrected_at = new Date().toISOString();
        } else if (body.currentSaveIntent === null) {
          update.current_save_intent = null;
          update.intent_corrected_at = new Date().toISOString();
        }
        let result = await supabase
          .from("captures")
          .update(update)
          .eq("user_id", user.id)
          .eq("id", existingResult.data.id)
          .select("*")
          .single();
        if (
          result.error && update.intent_corrected_at &&
          /intent_corrected_at|schema cache|column/i.test(
            String(result.error.message || result.error.details || ""),
          )
        ) {
          delete update.intent_corrected_at;
          result = await supabase
            .from("captures")
            .update(update)
            .eq("user_id", user.id)
            .eq("id", existingResult.data.id)
            .select("*")
            .single();
        }
        if (result.error) throw result.error;
        return await captureResponse(
          supabase,
          user.id,
          String(existingResult.data.id),
        );
      }

      if (body.action === "dismiss_reminder") {
        const currentAnalysis = existingResult.data.analysis &&
            typeof existingResult.data.analysis === "object"
          ? existingResult.data.analysis as Record<string, unknown>
          : {};
        const nextAnalysis = normalizedReviewAnalysis(
          {
            ...resolveReviewTargets(
              {
                ...currentAnalysis,
                suggested_reminders: dismissReminderSuggestion(
                  currentAnalysis,
                  body.reminderIndex,
                ),
              },
              ["reminder"],
              existingResult.data.review_confirmed_at,
            ),
          },
          existingResult.data.review_confirmed_at,
        );
        const result = await supabase
          .from("captures")
          .update({
            analysis: nextAnalysis,
            analysis_state: analysisRequiresReview(
                nextAnalysis,
                existingResult.data.review_confirmed_at,
              )
              ? "needs_review"
              : "ready",
          })
          .eq("user_id", user.id)
          .eq("id", existingResult.data.id)
          .select("*")
          .single();
        if (result.error) throw result.error;
        return await captureResponse(
          supabase,
          user.id,
          String(existingResult.data.id),
        );
      }

      const currentAnalysis = existingResult.data.analysis &&
          typeof existingResult.data.analysis === "object"
        ? existingResult.data.analysis as Record<string, unknown>
        : {};
      const update: Record<string, unknown> = {};
      if (
        typeof body.currentSaveIntent === "string" ||
        body.currentSaveIntent === null
      ) {
        update.analysis = normalizedReviewAnalysis(
          resolveReviewTargets(
            analysisWithCurrentIntent(currentAnalysis, body.currentSaveIntent),
            ["intent", "analysis"],
            existingResult.data.review_confirmed_at,
          ),
          existingResult.data.review_confirmed_at,
        );
        update.analysis_state = analysisRequiresReview(
            update.analysis as Record<string, unknown>,
            existingResult.data.review_confirmed_at,
          )
          ? "needs_review"
          : "ready";
      }
      if (typeof body.title === "string") {
        const title = body.title.trim() || null;
        update.title = title;
        update.display_title = title;
      }
      if (typeof body.note === "string") {
        update.context_note = body.note.trim() || null;
      }
      if (typeof body.currentSaveIntent === "string") {
        if (!activeSaveIntentKeySet.has(body.currentSaveIntent)) {
          return json({
            error: "currentSaveIntent is not an active save intent",
          }, 400);
        }
        update.current_save_intent = body.currentSaveIntent;
        update.intent_corrected_at = new Date().toISOString();
      } else if (body.currentSaveIntent === null) {
        update.current_save_intent = null;
        update.intent_corrected_at = new Date().toISOString();
      }
      if (!Object.keys(update).length) {
        return await captureResponse(
          supabase,
          user.id,
          String(existingResult.data.id),
        );
      }

      let result = await supabase
        .from("captures")
        .update(update)
        .eq("user_id", user.id)
        .or(`id.eq.${captureId},client_capture_key.eq.${captureId}`)
        .select("*")
        .single();
      if (
        result.error &&
        /intent_corrected_at|schema cache|column/i.test(
          String(result.error.message || result.error.details || ""),
        )
      ) {
        const fallbackUpdate = { ...update };
        delete fallbackUpdate.intent_corrected_at;
        result = await supabase
          .from("captures")
          .update(fallbackUpdate)
          .eq("user_id", user.id)
          .or(`id.eq.${captureId},client_capture_key.eq.${captureId}`)
          .select("*")
          .single();
      }
      if (result.error) throw result.error;
      return await captureResponse(
        supabase,
        user.id,
        String(existingResult.data.id),
      );
    }

    if (request.method !== "POST") return json({ error: "Not found" }, 404);

    const payload = await readCapturePayload(request);
    const capture = payload.asset
      ? await createOrGetCaptureWithAsset(
        supabase,
        user.id,
        payload.fields,
        payload.asset,
      )
      : await createOrGetCaptureFromFields(supabase, user.id, payload.fields);
    if (
      capture.analysis_state === "queued" ||
      capture.analysis_state === "failed"
    ) {
      runInBackground(processCapture(capture.id, user.id));
    }
    return json({ capture }, 202);
  } catch (error) {
    const message = errorMessage(error);
    const status =
      /URL|sourceText or sourceUrl|required|Private URLs|Only http\/https|Credentialed/i
          .test(message)
        ? 400
        : 500;
    return json({ error: message }, status);
  }
}
