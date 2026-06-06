import { adminClient } from "../supabase.ts";
import { activeSaveIntentKeySet, CAPTURE_DETAIL_SELECT, CAPTURE_LIST_SELECT } from "../config.ts";
import { boundedLimit, isUuid, runInBackground } from "../common.ts";
import { json } from "../http.ts";
import { archivedFilter, capturePayloadExpectsAsset, mergeAnalysisPatch, readCapturePayload, withCaptureState, withCaptureStates, withSignedCaptureAssetRows } from "../capture-records.ts";
import { withLazySourcePreviewAssets } from "../source-previews.ts";
import { createOrGetCaptureFromFields, createOrGetCaptureWithAsset, failCaptureMissingAsset, processCapture } from "../captures.ts";
import { analysisRequiresReview, analysisWithCurrentIntent, normalizedReviewAnalysis, normalizedReviewTargets, resolveReviewTargets, reviewTargetsForAnalysis } from "../analysis/review-normalization.ts";
import {
  acceptPendingCollectionDecisions,
  applyCollectionReviewDecisions,
  confirmedReminderSuggestions,
  dismissReminderSuggestion,
  reviewReminderSuggestions,
  saveConfirmedReminderSuggestion,
} from "../collections/review-decisions.ts";
import { applyCollectionChoice, captureResponse, clearCollectionSuggestion, undoCollectionChoice } from "../collections/responses.ts";
import { attachLinkedCollections } from "../collections/links.ts";
import {
  hydrateResolvedPlaceThumbnails,
  resolvePlacePatchForAnalysis,
} from "../places.ts";

const LIST_SOURCE_PREVIEW_MIRROR_LIMIT = 8;

export async function handleCapturesResource(
  request: Request,
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  url: URL,
) {
  if (request.method === "GET") {
    const clientCaptureKey = url.searchParams.get("clientCaptureKey");
    const archived = url.searchParams.get("archived") === "true";
    const includeRejectedTombstones =
      url.searchParams.get("includeRejectedTombstones") === "true";
    const limit = boundedLimit(url.searchParams.get("limit"), 30, 100);
    const before = url.searchParams.get("before");
    let totalCountQuery = clientCaptureKey
      ? null
      : supabase
        .from("captures")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("deleted_at", null)
        .is("rejected_at", null);
    if (totalCountQuery) {
      totalCountQuery = archived
        ? totalCountQuery.not("archived_at", "is", null)
        : totalCountQuery.is("archived_at", null);
    }
    let query = supabase
      .from("captures")
      .select(clientCaptureKey ? CAPTURE_DETAIL_SELECT : CAPTURE_LIST_SELECT)
      .eq("user_id", userId)
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
        : query.is("archived_at", null).is("deleted_at", null);
      if (!includeRejectedTombstones) query = query.is("rejected_at", null);
      if (before) query = query.lt("created_at", before);
      query = query.limit(limit + 1);
    }
    const [pageResult, totalCountResult] = await Promise.all([
      query,
      totalCountQuery ?? Promise.resolve(null),
    ]);
    const { data, error } = pageResult;
    if (error) throw error;
    if (totalCountResult?.error) throw totalCountResult.error;
    const fetchedRows = (data ?? []) as unknown as Array<
      Record<string, unknown>
    >;
    const pageRows = clientCaptureKey
      ? fetchedRows
      : fetchedRows.slice(0, limit);
    const rows = await attachLinkedCollections(
      supabase,
      userId,
      pageRows,
    );
    const previewRows = await withLazySourcePreviewAssets(
      supabase,
      userId,
      rows as Array<Record<string, unknown>>,
      clientCaptureKey ? rows.length : LIST_SOURCE_PREVIEW_MIRROR_LIMIT,
    );
    const placeHydratedRows = await hydrateResolvedPlaceThumbnails(
      previewRows as Array<Record<string, unknown>>,
    );
    const signedRows = await withSignedCaptureAssetRows(
      supabase,
      userId,
      placeHydratedRows,
      clientCaptureKey ? "detail" : "thumb",
    );
    if (clientCaptureKey) {
      const capture = withCaptureState(signedRows?.[0] ?? null);
      return json({ capture: capture && archivedFilter(capture, false) ? capture : null });
    }
    return json({
      captures: withCaptureStates(signedRows).filter((row) =>
        archivedFilter(row, archived)
      ),
      next_cursor: fetchedRows.length > limit
        ? pageRows[pageRows.length - 1]?.created_at || null
        : null,
      total_count: totalCountResult?.count ?? null,
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
      .eq("user_id", userId)
      .or(`id.eq.${captureId},client_capture_key.eq.${captureId}`)
      .maybeSingle();
    if (existingResult.error) throw existingResult.error;
    if (!existingResult.data) {
      return json({ error: "Capture not found" }, 404);
    }

    if (body.action === "apply_collection_choice") {
      return await applyCollectionChoice(
        supabase,
        userId,
        existingResult.data as Record<string, unknown>,
        body,
      );
    }

    if (body.action === "clear_collection_suggestion") {
      return await clearCollectionSuggestion(
        supabase,
        userId,
        existingResult.data as Record<string, unknown>,
        body,
      );
    }

    if (body.action === "undo_collection_choice") {
      return await undoCollectionChoice(
        supabase,
        userId,
        existingResult.data as Record<string, unknown>,
        body,
      );
    }

    if (body.action === "resolve_place") {
      const currentAnalysis = existingResult.data.analysis &&
          typeof existingResult.data.analysis === "object"
        ? existingResult.data.analysis as Record<string, unknown>
        : {};
      const placePatch = await resolvePlacePatchForAnalysis(
        currentAnalysis,
        { force: body.force === true },
      );
      const nextAnalysis = normalizedReviewAnalysis({
        ...currentAnalysis,
        ...placePatch,
      }, existingResult.data.review_confirmed_at);
      const result = await supabase
        .from("captures")
        .update({ analysis: nextAnalysis })
        .eq("user_id", userId)
        .eq("id", String(existingResult.data.id))
        .select("*")
        .single();
      if (result.error) throw result.error;
      return await captureResponse(
        supabase,
        userId,
        String(existingResult.data.id),
      );
    }

    if (
      body.action === "delete" ||
      body.action === "undo_delete" ||
      body.action === "archive" ||
      body.action === "restore"
    ) {
      const deleting = body.action === "delete" || body.action === "archive";
      const deletedAt = deleting ? new Date().toISOString() : null;
      const deletePurgeAfter = deleting
        ? new Date(Date.now() + 8000).toISOString()
        : null;
      const analysis = mergeAnalysisPatch(existingResult.data, {
        capture_state: deleting ? "deleted" : "active",
        archived_at: null,
        deleted_at: deletedAt,
        delete_purge_after: deletePurgeAfter,
      });
      let result = await supabase
        .from("captures")
        .update({
          analysis,
          archived_at: null,
          deleted_at: deletedAt,
          delete_purge_after: deletePurgeAfter,
        })
        .eq("user_id", userId)
        .or(`id.eq.${captureId},client_capture_key.eq.${captureId}`)
        .select("*")
        .single();
      if (
        result.error &&
        /archived_at|schema cache|column/i.test(
          String(result.error.message || result.error.details || ""),
        )
      ) {
        const fallbackAnalysis = mergeAnalysisPatch(existingResult.data, {
          capture_state: deleting ? "deleted" : "active",
          archived_at: deleting ? deletedAt : null,
        });
        result = await supabase
          .from("captures")
          .update({ analysis: fallbackAnalysis, archived_at: deleting ? deletedAt : null })
          .eq("user_id", userId)
          .or(`id.eq.${captureId},client_capture_key.eq.${captureId}`)
          .select("*")
          .single();
      }
      if (result.error) throw result.error;
      return await captureResponse(
        supabase,
        userId,
        String(existingResult.data.id),
      );
    }

    if (body.action === "resolve_review_targets") {
      const currentAnalysis = existingResult.data.analysis &&
          typeof existingResult.data.analysis === "object"
        ? existingResult.data.analysis as Record<string, unknown>
        : {};
      const resolvedTargets = normalizedReviewTargets(body.resolvedTargets);
      if (!resolvedTargets.length) {
        return json({ error: "resolvedTargets is required" }, 400);
      }
      if (
        typeof body.currentSaveIntent === "string" &&
        !activeSaveIntentKeySet.has(body.currentSaveIntent)
      ) {
        return json({
          error: "currentSaveIntent is not an active save intent",
        }, 400);
      }
      const acceptCollectionSuggestions =
        body.acceptCollectionSuggestions !== false;
      if (
        resolvedTargets.includes("collections") &&
        acceptCollectionSuggestions
      ) {
        await acceptPendingCollectionDecisions(
          supabase,
          userId,
          String(existingResult.data.id),
          currentAnalysis,
        );
      }
      const resolvedBase: Record<string, unknown> = {
        ...analysisWithCurrentIntent(
          currentAnalysis,
          body.currentSaveIntent,
        ),
      };
      if (resolvedTargets.includes("collections")) {
        resolvedBase.collection_decisions = [];
        resolvedBase.suggested_collections = [];
      }
      if (resolvedTargets.includes("reminder")) {
        resolvedBase.suggested_reminders = confirmedReminderSuggestions(
          currentAnalysis,
        );
      }
      const withResolvedTargets = resolveReviewTargets(
        resolvedBase,
        resolvedTargets,
        existingResult.data.review_confirmed_at,
      );
      const remainingTargets = reviewTargetsForAnalysis(
        withResolvedTargets,
        existingResult.data.review_confirmed_at,
      );
      const confirmedAt = remainingTargets.length
        ? existingResult.data.review_confirmed_at
        : existingResult.data.review_confirmed_at || new Date().toISOString();
      const nextAnalysis = normalizedReviewAnalysis(
        withResolvedTargets,
        confirmedAt,
      );
      const update: Record<string, unknown> = {
        analysis: nextAnalysis,
        analysis_state: analysisRequiresReview(nextAnalysis, confirmedAt)
          ? "needs_review"
          : "ready",
      };
      if (!remainingTargets.length && confirmedAt) {
        update.review_confirmed_at = confirmedAt;
      }
      if (typeof body.currentSaveIntent === "string") {
        update.current_save_intent = body.currentSaveIntent;
        update.intent_corrected_at = new Date().toISOString();
      } else if (body.currentSaveIntent === null) {
        update.current_save_intent = null;
        update.intent_corrected_at = new Date().toISOString();
      }
      let result = await supabase
        .from("captures")
        .update(update)
        .eq("user_id", userId)
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
          .eq("user_id", userId)
          .or(`id.eq.${captureId},client_capture_key.eq.${captureId}`)
          .select("*")
          .single();
      }
      if (result.error) throw result.error;
      return await captureResponse(
        supabase,
        userId,
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
        userId,
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
        .eq("user_id", userId)
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
          .eq("user_id", userId)
          .or(`id.eq.${captureId},client_capture_key.eq.${captureId}`)
          .select("*")
          .single();
      }
      if (result.error) throw result.error;
      return await captureResponse(
        supabase,
        userId,
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
        userId,
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
      if (
        Array.isArray(body.collectionDecisions) &&
        body.collectionDecisions.length > 0
      ) {
        resolvedTargets.add("collections");
      }
      if (
        Array.isArray(body.reminderDecisions) &&
        body.reminderDecisions.length > 0
      ) {
        resolvedTargets.add("reminder");
      }
      resolvedTargets.add("analysis");
      const nextAnalysisBase = resolveReviewTargets(
        analysisWithCurrentIntent(
          currentAnalysis,
          body.currentSaveIntent,
        ),
        [...resolvedTargets],
      );
      const hasCollectionDecisions = Array.isArray(body.collectionDecisions) &&
        body.collectionDecisions.length > 0;
      const hasReminderDecisions = Array.isArray(body.reminderDecisions) &&
        body.reminderDecisions.length > 0;
      const nextAnalysisWithCollections = hasCollectionDecisions
        ? {
          ...nextAnalysisBase,
          collection_decisions: [],
          suggested_collections: [],
        }
        : nextAnalysisBase;
      const nextAnalysisWithReminders = hasReminderDecisions
        ? {
          ...nextAnalysisWithCollections,
          suggested_reminders: reviewReminderSuggestions(
            currentAnalysis,
            body.reminderDecisions,
          ),
        }
        : nextAnalysisWithCollections;
      const nextAnalysis = normalizedReviewAnalysis(
        nextAnalysisWithReminders,
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
        .eq("user_id", userId)
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
          .eq("user_id", userId)
          .eq("id", existingResult.data.id)
          .select("*")
          .single();
      }
      if (result.error) throw result.error;
      return await captureResponse(
        supabase,
        userId,
        String(existingResult.data.id),
      );
    }

    if (body.action === "save_reminder") {
      const currentAnalysis = existingResult.data.analysis &&
          typeof existingResult.data.analysis === "object"
        ? existingResult.data.analysis as Record<string, unknown>
        : {};
      const suggestedReminders = saveConfirmedReminderSuggestion(
        currentAnalysis,
        body.reminder,
        body.reminderIndex,
      );
      if (!suggestedReminders) {
        return json({ error: "Choose a valid start and end for the reminder." }, 400);
      }
      const withResolvedTargets = resolveReviewTargets(
        {
          ...currentAnalysis,
          suggested_reminders: suggestedReminders,
        },
        ["reminder"],
        existingResult.data.review_confirmed_at,
      );
      const remainingTargets = reviewTargetsForAnalysis(
        withResolvedTargets,
        existingResult.data.review_confirmed_at,
      );
      const confirmedAt = remainingTargets.length
        ? existingResult.data.review_confirmed_at
        : existingResult.data.review_confirmed_at || new Date().toISOString();
      const nextAnalysis = normalizedReviewAnalysis(
        withResolvedTargets,
        confirmedAt,
      );
      const update: Record<string, unknown> = {
        analysis: nextAnalysis,
        analysis_state: analysisRequiresReview(nextAnalysis, confirmedAt)
          ? "needs_review"
          : "ready",
      };
      if (!remainingTargets.length && confirmedAt) {
        update.review_confirmed_at = confirmedAt;
      }
      let result = await supabase
        .from("captures")
        .update(update)
        .eq("user_id", userId)
        .eq("id", existingResult.data.id)
        .select("*")
        .single();
      if (
        result.error &&
        /review_confirmed_at|schema cache|column/i.test(
          String(result.error.message || result.error.details || ""),
        )
      ) {
        const fallbackUpdate = { ...update };
        delete fallbackUpdate.review_confirmed_at;
        result = await supabase
          .from("captures")
          .update(fallbackUpdate)
          .eq("user_id", userId)
          .eq("id", existingResult.data.id)
          .select("*")
          .single();
      }
      if (result.error) throw result.error;
      return await captureResponse(
        supabase,
        userId,
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
        .eq("user_id", userId)
        .eq("id", existingResult.data.id)
        .select("*")
        .single();
      if (result.error) throw result.error;
      return await captureResponse(
        supabase,
        userId,
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
        userId,
        String(existingResult.data.id),
      );
    }

    let result = await supabase
      .from("captures")
      .update(update)
      .eq("user_id", userId)
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
        .eq("user_id", userId)
        .or(`id.eq.${captureId},client_capture_key.eq.${captureId}`)
        .select("*")
        .single();
    }
    if (result.error) throw result.error;
    return await captureResponse(
      supabase,
      userId,
      String(existingResult.data.id),
    );
  }

  if (request.method !== "POST") return json({ error: "Not found" }, 404);

  const payload = await readCapturePayload(request);
  let capture = payload.asset
    ? await createOrGetCaptureWithAsset(
      supabase,
      userId,
      payload.fields,
      payload.asset,
    )
    : await createOrGetCaptureFromFields(supabase, userId, payload.fields);
  if (!payload.asset && capturePayloadExpectsAsset(payload.fields)) {
    capture = await failCaptureMissingAsset(supabase, userId, capture);
  } else if (
    capture.analysis_state === "queued" ||
    capture.analysis_state === "failed"
  ) {
    runInBackground(processCapture(capture.id, userId));
  }
  return json({ capture }, 202);
}
