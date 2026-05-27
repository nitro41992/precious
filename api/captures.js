const {
  createOrGetCapture,
  createOrGetCaptureWithAsset,
  loadCapture,
  mergeAnalysisPatch,
  readBody,
  readCapturePayload,
  send,
  withCaptureState,
  withCaptureStates,
  withUser
} = require("./_lib/hosted.cjs");
const saveIntents = require("../supabase/functions/_shared/save-intents.json");

const activeSaveIntentKeys = new Set(
  saveIntents.filter((intent) => intent.active).map((intent) => intent.key)
);

function archivedFilter(row, archived) {
  const state = row.capture_state || (row.archived_at || row.analysis?.capture_state === "archived" ? "archived" : "active");
  return archived ? state === "archived" : state !== "archived";
}

function confirmedReminderSuggestions(analysis) {
  const reminders = Array.isArray(analysis.suggested_reminders) ? analysis.suggested_reminders : [];
  return reminders.map((reminder) =>
    reminder && typeof reminder === "object" && !Array.isArray(reminder)
      ? { ...reminder, status: "confirmed" }
      : reminder
  );
}

function dismissReminderSuggestion(analysis, reminderIndex) {
  const index = Number(reminderIndex);
  const reminders = Array.isArray(analysis.suggested_reminders) ? analysis.suggested_reminders : [];
  if (!Number.isInteger(index) || index < 0 || index >= reminders.length) return reminders;
  return reminders.filter((_, itemIndex) => itemIndex !== index);
}

function reviewReminderSuggestions(analysis, decisions) {
  const removeIndices = new Set(
    (Array.isArray(decisions) ? decisions : [])
      .filter((decision) => decision?.action === "remove")
      .map((decision) => Number(decision.index))
      .filter(Number.isInteger)
  );
  const reminders = Array.isArray(analysis.suggested_reminders) ? analysis.suggested_reminders : [];
  return reminders.filter((_, index) => !removeIndices.has(index));
}

function collectionDecisionKey(decision, index) {
  return `${index}:${decision?.type || ""}:${decision?.collectionId || decision?.collection_id || decision?.title || ""}`;
}

function reviewCollectionDecisions(analysis, decisions) {
  const acceptedKeys = new Set(
    (Array.isArray(decisions) ? decisions : [])
      .filter((decision) => decision?.kind === "suggested" && (decision.action === "link" || decision.action === "create"))
      .map((decision) => collectionDecisionKey(decision, Number(decision.index)))
  );
  const current = Array.isArray(analysis.collection_decisions)
    ? analysis.collection_decisions
    : Array.isArray(analysis.suggested_collections)
      ? analysis.suggested_collections
      : [];
  return current.filter((decision, index) => !acceptedKeys.has(collectionDecisionKey(decision, index)));
}

async function linkCaptureToCollection(supabase, userId, collectionId, captureId, fields = {}) {
  const active = await supabase
    .from("collection_capture_links")
    .select("id")
    .eq("user_id", userId)
    .eq("collection_id", collectionId)
    .eq("capture_id", captureId)
    .is("unlinked_at", null)
    .maybeSingle();
  if (active.error) throw active.error;
  if (active.data) return active.data;
  const { data, error } = await supabase
    .from("collection_capture_links")
    .insert({
      user_id: userId,
      collection_id: collectionId,
      capture_id: captureId,
      created_by: fields.createdBy || "user",
      rationale: fields.rationale || null,
      confidence: fields.confidence ?? null
    })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

async function applyCollectionReviewDecisions(supabase, userId, captureId, decisions) {
  for (const decision of Array.isArray(decisions) ? decisions : []) {
    if (decision?.kind === "linked" && decision.action === "remove" && decision.collectionId) {
      const { error } = await supabase
        .from("collection_capture_links")
        .update({ unlinked_at: new Date().toISOString(), unlink_reason: "user_removed" })
        .eq("user_id", userId)
        .eq("collection_id", decision.collectionId)
        .eq("capture_id", captureId)
        .is("unlinked_at", null);
      if (error) throw error;
      continue;
    }

    if (decision?.kind !== "suggested" || (decision.action !== "link" && decision.action !== "create")) continue;
    let collectionId = typeof decision.collectionId === "string" ? decision.collectionId : "";
    if (!collectionId && decision.action === "create" && decision.title && decision.description) {
      const existing = await supabase
        .from("collections")
        .select("id,status")
        .eq("user_id", userId)
        .eq("title", decision.title)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data?.status === "archived") continue;
      collectionId = existing.data?.id || "";
      if (!collectionId) {
        const created = await supabase
          .from("collections")
          .insert({
            user_id: userId,
            title: decision.title,
            description: decision.description,
            created_by: "analysis"
          })
          .select("id")
          .single();
        if (created.error) throw created.error;
        collectionId = created.data.id;
      }
    }
    if (!collectionId) continue;
    await linkCaptureToCollection(supabase, userId, collectionId, captureId, {
      createdBy: "analysis",
      rationale: decision.rationale,
      confidence: decision.confidence
    });
  }
}

module.exports = async function captures(req, res) {
  return withUser(req, res, async ({ user, supabase }) => {
    if (req.method === "GET") {
      const url = new URL(req.url, "https://precious.local");
      const view = url.searchParams.get("view");
      const captureId = url.searchParams.get("captureId");
      const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);
      const archived = url.searchParams.get("archived") === "true";

      if (view === "detail") {
        if (!captureId) return send(res, 400, { error: "captureId is required" });
        const capture = await loadCapture(supabase, user.id, captureId);
        if (!capture) return send(res, 404, { error: "Capture not found" });
        return send(res, 200, { capture: withCaptureState(capture) });
      }

      const { data, error } = await supabase
        .from("captures")
        .select("*, analysis_runs(*), capture_assets(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(Number.isFinite(limit) ? limit : 50);
      if (error) throw error;
      return send(res, 200, { captures: withCaptureStates(data).filter((row) => archivedFilter(row, archived)) });
    }

    if (req.method === "POST") {
      const payload = await readCapturePayload(req);
      const capture = payload.asset
        ? await createOrGetCaptureWithAsset(supabase, user.id, payload.fields, payload.asset)
        : await createOrGetCapture(supabase, user.id, payload.fields);
      return send(res, 200, { capture });
    }

    if (req.method === "PATCH") {
      const body = await readBody(req);
      if (!body.captureId) return send(res, 400, { error: "captureId is required" });

      if (body.action === "cancel_analysis") {
        const { data, error } = await supabase
          .from("captures")
          .update({
            analysis_cancel_requested_at: new Date().toISOString(),
            analysis_cancel_reason: "user_cancelled",
            analysis_error: "AI processing was cancelled."
          })
          .eq("user_id", user.id)
          .or(`id.eq.${body.captureId},client_capture_key.eq.${body.captureId}`)
          .select("*")
          .single();
        if (error) throw error;
        return send(res, 200, { capture: withCaptureState(data) });
      }

      if (body.action === "archive" || body.action === "restore") {
        const existing = await loadCapture(supabase, user.id, body.captureId);
        if (!existing) return send(res, 404, { error: "Capture not found" });
        const archivedAt = body.action === "archive" ? new Date().toISOString() : null;
        const update = {
          analysis: mergeAnalysisPatch(existing, {
            capture_state: body.action === "archive" ? "archived" : "active",
            archived_at: archivedAt
          })
        };
        const withColumn = { ...update, archived_at: archivedAt };
        let result = await supabase
          .from("captures")
          .update(withColumn)
          .eq("user_id", user.id)
          .or(`id.eq.${body.captureId},client_capture_key.eq.${body.captureId}`)
          .select("*")
          .single();
        if (result.error && /archived_at|schema cache|column/i.test(String(result.error.message || result.error.details || ""))) {
          result = await supabase
            .from("captures")
            .update(update)
            .eq("user_id", user.id)
            .or(`id.eq.${body.captureId},client_capture_key.eq.${body.captureId}`)
            .select("*")
            .single();
        }
        if (result.error) throw result.error;
        return send(res, 200, { capture: withCaptureState(result.data) });
      }

      if (body.action === "confirm_review") {
        const existing = await loadCapture(supabase, user.id, body.captureId);
        if (!existing) return send(res, 404, { error: "Capture not found" });
        const analysis = existing.analysis && typeof existing.analysis === "object" ? existing.analysis : {};
        const confirmedAt = new Date().toISOString();
        const update = {
          analysis: {
            ...analysis,
            needs_review: false,
            collection_decisions: [],
            suggested_collections: [],
            suggested_reminders: confirmedReminderSuggestions(analysis)
          },
          analysis_state: "ready",
          review_confirmed_at: confirmedAt
        };
        if (typeof body.title === "string") {
          const title = body.title.trim() || null;
          update.title = title;
          update.display_title = title;
        }
        if (typeof body.note === "string") update.context_note = body.note.trim() || null;
        if (typeof body.currentSaveIntent === "string") {
          if (!activeSaveIntentKeys.has(body.currentSaveIntent)) {
            return send(res, 400, { error: "currentSaveIntent is not an active save intent" });
          }
          update.current_save_intent = body.currentSaveIntent;
          update.intent_corrected_at = confirmedAt;
        }
        let result = await supabase
          .from("captures")
          .update(update)
          .eq("user_id", user.id)
          .or(`id.eq.${body.captureId},client_capture_key.eq.${body.captureId}`)
          .select("*")
          .single();
        if (result.error && /review_confirmed_at|intent_corrected_at|schema cache|column/i.test(String(result.error.message || result.error.details || ""))) {
          const fallbackUpdate = { ...update };
          delete fallbackUpdate.review_confirmed_at;
          if (/intent_corrected_at/i.test(String(result.error.message || result.error.details || ""))) {
            delete fallbackUpdate.intent_corrected_at;
          }
          result = await supabase
            .from("captures")
            .update(fallbackUpdate)
            .eq("user_id", user.id)
            .or(`id.eq.${body.captureId},client_capture_key.eq.${body.captureId}`)
            .select("*")
            .single();
        }
        if (result.error) throw result.error;
        return send(res, 200, { capture: withCaptureState(result.data) });
      }

      if (body.action === "save_review_decisions") {
        const existing = await loadCapture(supabase, user.id, body.captureId);
        if (!existing) return send(res, 404, { error: "Capture not found" });
        const analysis = existing.analysis && typeof existing.analysis === "object" ? existing.analysis : {};
        await applyCollectionReviewDecisions(supabase, user.id, existing.id, body.collectionDecisions);
        const nextAnalysis = {
          ...analysis,
          needs_review: false,
          collection_decisions: reviewCollectionDecisions(analysis, body.collectionDecisions),
          suggested_collections: [],
          suggested_reminders: reviewReminderSuggestions(analysis, body.reminderDecisions)
        };
        nextAnalysis.needs_review = analysisRequiresReview(nextAnalysis, existing.review_confirmed_at);
        const update = {
          analysis: nextAnalysis,
          analysis_state: nextAnalysis.needs_review ? "needs_review" : "ready"
        };
        if (typeof body.title === "string") {
          const title = body.title.trim() || null;
          update.title = title;
          update.display_title = title;
        }
        if (typeof body.note === "string") update.context_note = body.note.trim() || null;
        if (typeof body.currentSaveIntent === "string") {
          if (!activeSaveIntentKeys.has(body.currentSaveIntent)) {
            return send(res, 400, { error: "currentSaveIntent is not an active save intent" });
          }
          update.current_save_intent = body.currentSaveIntent;
          update.intent_corrected_at = new Date().toISOString();
        }
        let result = await supabase
          .from("captures")
          .update(update)
          .eq("user_id", user.id)
          .eq("id", existing.id)
          .select("*")
          .single();
        if (result.error && update.intent_corrected_at && /intent_corrected_at|schema cache|column/i.test(String(result.error.message || result.error.details || ""))) {
          delete update.intent_corrected_at;
          result = await supabase
            .from("captures")
            .update(update)
            .eq("user_id", user.id)
            .eq("id", existing.id)
            .select("*")
            .single();
        }
        if (result.error) throw result.error;
        return send(res, 200, { capture: withCaptureState(result.data) });
      }

      if (body.action === "dismiss_reminder") {
        const existing = await loadCapture(supabase, user.id, body.captureId);
        if (!existing) return send(res, 404, { error: "Capture not found" });
        const analysis = existing.analysis && typeof existing.analysis === "object" ? existing.analysis : {};
        const nextAnalysis = {
          ...analysis,
          suggested_reminders: dismissReminderSuggestion(analysis, body.reminderIndex)
        };
        const result = await supabase
          .from("captures")
          .update({ analysis: nextAnalysis })
          .eq("user_id", user.id)
          .or(`id.eq.${body.captureId},client_capture_key.eq.${body.captureId}`)
          .select("*")
          .single();
        if (result.error) throw result.error;
        return send(res, 200, { capture: withCaptureState(result.data) });
      }

      const update = {};
      if (typeof body.title === "string") {
        const title = body.title.trim() || null;
        update.title = title;
        update.display_title = title;
      }
      if (typeof body.note === "string") update.context_note = body.note.trim() || null;
      if (typeof body.currentSaveIntent === "string") {
        if (!activeSaveIntentKeys.has(body.currentSaveIntent)) {
          return send(res, 400, { error: "currentSaveIntent is not an active save intent" });
        }
        update.current_save_intent = body.currentSaveIntent;
        update.intent_corrected_at = new Date().toISOString();
      }
      if (!Object.keys(update).length) {
        const capture = await loadCapture(supabase, user.id, body.captureId);
        if (!capture) return send(res, 404, { error: "Capture not found" });
        return send(res, 200, { capture: withCaptureState(capture) });
      }
      let result = await supabase
        .from("captures")
        .update(update)
        .eq("user_id", user.id)
        .or(`id.eq.${body.captureId},client_capture_key.eq.${body.captureId}`)
        .select("*")
        .single();
      if (result.error && update.intent_corrected_at && /intent_corrected_at|schema cache|column/i.test(String(result.error.message || result.error.details || ""))) {
        delete update.intent_corrected_at;
        result = await supabase
          .from("captures")
          .update(update)
          .eq("user_id", user.id)
          .or(`id.eq.${body.captureId},client_capture_key.eq.${body.captureId}`)
          .select("*")
          .single();
      }
      if (result.error) throw result.error;
      return send(res, 200, { capture: withCaptureState(result.data) });
    }

    return send(res, 405, { error: "Method not allowed" });
  });
};
