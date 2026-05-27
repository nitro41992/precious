const {
  createOrGetCapture,
  createOrGetCaptureWithAsset,
  loadCapture,
  readBody,
  readCapturePayload,
  send,
  withUser
} = require("./_lib/hosted.cjs");

module.exports = async function captures(req, res) {
  return withUser(req, res, async ({ user, supabase }) => {
    if (req.method === "GET") {
      const url = new URL(req.url, "https://precious.local");
      const view = url.searchParams.get("view");
      const captureId = url.searchParams.get("captureId");
      const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);

      if (view === "detail") {
        if (!captureId) return send(res, 400, { error: "captureId is required" });
        const capture = await loadCapture(supabase, user.id, captureId);
        if (!capture) return send(res, 404, { error: "Capture not found" });
        return send(res, 200, { capture });
      }

      const { data, error } = await supabase
        .from("captures")
        .select("*, captured_entities(*), reminder_suggestions(*), collection_suggestions(*), analysis_runs(*), capture_assets(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(Number.isFinite(limit) ? limit : 50);
      if (error) throw error;
      return send(res, 200, { captures: data ?? [] });
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
        return send(res, 200, { capture: data });
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
      const { data, error } = await supabase
        .from("captures")
        .update(update)
        .eq("user_id", user.id)
        .or(`id.eq.${body.captureId},client_capture_key.eq.${body.captureId}`)
        .select("*")
        .single();
      if (error) throw error;
      return send(res, 200, { capture: data });
    }

    return send(res, 405, { error: "Method not allowed" });
  });
};
