const {
  analyzeCapture,
  errorMessage,
  failAnalysis,
  readBody,
  send,
  withUser
} = require("./_lib/hosted.cjs");

module.exports = async function analyze(req, res) {
  return withUser(req, res, async ({ user, supabase }) => {
    if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });

    const body = await readBody(req);
    if (!body.captureId) return send(res, 400, { error: "captureId is required" });

    try {
      const capture = await analyzeCapture(supabase, user.id, body.captureId);
      return send(res, 200, { capture, analysis: capture?.analysis ?? null });
    } catch (error) {
      console.error("Capture analysis failed", error);
      const captureId = String(body.captureId);
      await failAnalysis(supabase, user.id, captureId, error).catch(() => {});
      return send(res, error.statusCode || 500, {
        error: errorMessage(error, "Capture analysis failed"),
        captureId
      });
    }
  });
};
