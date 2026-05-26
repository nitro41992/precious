const { send } = require("./_lib/hosted.cjs");

module.exports = async function health(_req, res) {
  return send(res, 200, {
    ok: true,
    app: "precious-captures",
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
    hasSupabase: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  });
};
