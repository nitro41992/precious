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

function archivedFilter(row, archived) {
  const state = row.capture_state || (row.archived_at || row.analysis?.capture_state === "archived" ? "archived" : "active");
  return archived ? state === "archived" : state !== "archived";
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
        .select("*, captured_entities(*), reminder_suggestions(*), collection_suggestions(*), analysis_runs(*), capture_assets(*)")
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

      const update = {};
      if (typeof body.title === "string") {
        const title = body.title.trim() || null;
        update.title = title;
        update.display_title = title;
      }
      if (typeof body.note === "string") update.context_note = body.note.trim() || null;
      if (typeof body.currentSaveIntent === "string") {
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
