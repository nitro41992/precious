// Durable capture-analysis worker.
//
// Drains the `capture_analysis` pgmq queue and runs the (unchanged) `processCapture` pipeline
// for each job, inside its own active request so it gets the full Edge wall-clock budget — not
// fire-and-forget. Invoked two ways (see migration 0028): an immediate pg_net kick on enqueue
// (low latency) and an every-minute pg_cron sweep (durability). A job is only acked (deleted)
// on success; an abandoned or failing job stays on the queue and is retried after its visibility
// timeout, then dead-lettered to a recoverable `failed` state after MAX_ATTEMPTS.
//
// Auth: deployed with --no-verify-jwt; verifies a shared bearer (CAPTURE_WORKER_SECRET function
// secret), which pg_net/cron send from Vault.

import { adminClient } from "../capture-intake/lib/supabase.ts";
import { env, errorMessage } from "../capture-intake/lib/common.ts";
import { processCapture } from "../capture-intake/lib/captures.ts";
import { corsHeaders } from "../capture-intake/lib/config.ts";

// Read failures past this many attempts give up: the job is archived and the capture is marked
// recoverable-failed instead of retrying forever. read_ct increments on every (re)read; a
// successful run deletes the message, so this only counts genuine failed/abandoned attempts.
const MAX_ATTEMPTS = 4;
// Stop pulling new work this close to the Edge wall-clock limit; remaining messages are drained
// by the next kick/sweep. Comfortably above one capture's pipeline deadline (~60s) so an
// in-flight run is never cut by our own budget.
const WORKER_BUDGET_MS = 110_000;
const VISIBILITY_TIMEOUT_S = 120;
const DEAD_LETTER_MESSAGE =
  "Analysis didn't finish after several tries. Tap Try again, or add a photo.";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// Current analysis_state of a capture, or null if it no longer exists.
async function captureState(
  supabase: ReturnType<typeof adminClient>,
  captureId: string,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("captures")
    .select("analysis_state")
    .eq("id", captureId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.analysis_state as string | undefined) ?? null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let expected: string;
  try {
    expected = env("CAPTURE_WORKER_SECRET");
  } catch {
    return json({ error: "CAPTURE_WORKER_SECRET not configured" }, 500);
  }
  const token = (request.headers.get("authorization") || "").replace(
    /^Bearer\s+/i,
    "",
  );
  if (!token || token !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabase = adminClient();
  const deadline = Date.now() + WORKER_BUDGET_MS;
  let processed = 0;
  let failed = 0;
  let deadLettered = 0;

  while (Date.now() < deadline) {
    const { data: rows, error } = await supabase.rpc("capture_queue_read", {
      p_qty: 1,
      p_vt: VISIBILITY_TIMEOUT_S,
    });
    if (error) {
      console.warn("capture-worker queue read failed", error.message);
      break;
    }
    if (!Array.isArray(rows) || rows.length === 0) break; // queue drained

    const msg = rows[0] as {
      msg_id: number;
      read_ct: number;
      message: Record<string, unknown> | null;
    };
    const message = msg.message ?? {};
    const captureId = typeof message.capture_id === "string"
      ? message.capture_id
      : "";
    const userId = typeof message.user_id === "string" ? message.user_id : "";

    // Malformed payload — archive so it never retries.
    if (!captureId || !userId) {
      await supabase.rpc("capture_queue_archive", { p_msg_id: msg.msg_id });
      continue;
    }

    // Exhausted retries — dead-letter to a recoverable failed state (user can Try again / add a
    // photo). Don't clobber a capture that meanwhile reached a terminal-good state.
    if ((msg.read_ct ?? 0) > MAX_ATTEMPTS) {
      await supabase.rpc("capture_queue_archive", { p_msg_id: msg.msg_id });
      await supabase
        .from("captures")
        .update({
          analysis_state: "failed",
          analysis_mode: "dead_letter",
          analysis_error: DEAD_LETTER_MESSAGE,
        })
        .eq("id", captureId)
        .eq("user_id", userId)
        .in("analysis_state", ["queued", "processing", "failed"]);
      deadLettered++;
      continue;
    }

    // A prior attempt's late-landing work may have already finished this capture, or the user may
    // have deleted it. Don't redo or strand it.
    const before = await captureState(supabase, captureId, userId);
    if (before === null) {
      await supabase.rpc("capture_queue_archive", { p_msg_id: msg.msg_id });
      continue;
    }
    if (before === "ready" || before === "needs_review") {
      await supabase.rpc("capture_queue_delete", { p_msg_id: msg.msg_id });
      processed++;
      continue;
    }

    try {
      await processCapture(captureId, userId);
    } catch (analysisError) {
      // Hard error → leave un-acked so it retries after the visibility timeout.
      console.warn(
        "capture-worker processCapture failed",
        captureId,
        errorMessage(analysisError),
      );
      failed++;
      continue;
    }

    // processCapture can resolve early under the Edge runtime's background-task semantics without
    // actually finishing (capture stays "processing"). The queue's durability depends on NOT
    // acking such a phantom success — re-read and decide:
    const after = await captureState(supabase, captureId, userId);
    if (after === "ready" || after === "needs_review" || after === "failed") {
      // Genuinely done (success, or a real terminal failure from the pipeline). Ack.
      await supabase.rpc("capture_queue_delete", { p_msg_id: msg.msg_id });
      processed++;
    } else {
      // Returned without finishing. This is deterministic for a given capture (an Edge early-
      // resolution tied to its shape), so retrying the same input just reproduces it — don't churn
      // the queue or leave the user on a multi-minute "analyzing" spinner. Mark it recoverable-
      // failed and ack. (A truly ABANDONED worker never reaches this code — `await processCapture`
      // never returns — so its message stays un-acked and retries via the visibility-timeout
      // sweep, which is the right behaviour for that transient case.)
      console.warn(
        "capture-worker: processCapture returned without finishing; failing recoverable",
        captureId,
      );
      await supabase
        .from("captures")
        .update({
          analysis_state: "failed",
          analysis_mode: "incomplete",
          analysis_error: DEAD_LETTER_MESSAGE,
        })
        .eq("id", captureId)
        .eq("user_id", userId)
        .in("analysis_state", ["queued", "processing"]);
      await supabase.rpc("capture_queue_delete", { p_msg_id: msg.msg_id });
      failed++;
    }
  }

  return json({ processed, failed, dead_lettered: deadLettered });
});
