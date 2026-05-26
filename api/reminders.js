const { readBody, send, withUser } = require("./_lib/hosted.cjs");

module.exports = async function reminders(req, res) {
  return withUser(req, res, async ({ user, supabase }) => {
    if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });

    const body = await readBody(req);
    if (!body.captureId) return send(res, 400, { error: "captureId is required" });

    let reminder = {
      user_id: user.id,
      capture_id: body.captureId,
      trigger_type: body.triggerType || "none",
      trigger_value: body.triggerValue || "",
      rationale: body.rationale || "",
      confidence: typeof body.confidence === "number" ? body.confidence : 0.75,
      status: "pending"
    };

    if (body.suggestionId) {
      const { data: suggestion, error } = await supabase
        .from("reminder_suggestions")
        .select("*")
        .eq("user_id", user.id)
        .eq("id", body.suggestionId)
        .maybeSingle();
      if (error) throw error;
      if (suggestion) {
        reminder = {
          user_id: user.id,
          capture_id: suggestion.capture_id,
          analysis_run_id: suggestion.analysis_run_id,
          trigger_type: suggestion.trigger_type,
          trigger_value: suggestion.trigger_value,
          rationale: suggestion.rationale,
          confidence: suggestion.confidence,
          status: "pending"
        };
      }
    }

    const existing = await supabase
      .from("reminders")
      .select("*")
      .eq("user_id", user.id)
      .eq("capture_id", reminder.capture_id)
      .eq("trigger_type", reminder.trigger_type)
      .eq("trigger_value", reminder.trigger_value)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return send(res, 200, { reminder: existing.data });

    const { data, error } = await supabase
      .from("reminders")
      .insert(reminder)
      .select("*")
      .single();
    if (error) throw error;
    return send(res, 200, { reminder: data });
  });
};
