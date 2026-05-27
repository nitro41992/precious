const { readBody, send, withUser } = require("./_lib/hosted.cjs");

module.exports = async function reminders(req, res) {
  return withUser(req, res, async ({ user, supabase }) => {
    if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
    return send(res, 410, { error: "Persisted reminders are disabled in the slim capture schema." });
  });
};
