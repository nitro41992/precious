import { adminClient } from "./supabase.ts";
import { json } from "./http.ts";
import {
  CLIENT_EVENT_RETENTION_DAYS,
  clientDiagnosticNumberFields,
  clientDiagnosticStringFields,
  clientEventPhases,
  clientEventReasonCodes,
  clientEventTypes,
} from "./config.ts";
import { isUuid, jsonObject, runInBackground, truncateText } from "./common.ts";

export function boundedClientDiagnostics(value: unknown) {
  const source = jsonObject(value);
  const diagnostics: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(source)) {
    if (clientDiagnosticStringFields.has(key)) {
      diagnostics[key] = truncateText(raw, 240);
    } else if (clientDiagnosticNumberFields.has(key)) {
      const numeric = Number(raw);
      if (Number.isFinite(numeric)) diagnostics[key] = numeric;
    }
  }
  return diagnostics;
}

export function scheduleClientEventRetention(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
) {
  const cutoff = new Date(
    Date.now() - CLIENT_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  runInBackground((async () => {
    const { error } = await supabase
      .from("capture_client_events")
      .delete()
      .eq("user_id", userId)
      .lt("created_at", cutoff);
    if (error) {
      console.warn("capture_client_events retention failed", error.message);
    }
  })());
}

export async function handleClientEventsResource(
  request: Request,
  supabase: ReturnType<typeof adminClient>,
  userId: string,
) {
  if (request.method !== "POST") return json({ error: "Not found" }, 404);
  const body = await request.json().catch(() => ({}));
  const clientCaptureKey = truncateText(body.clientCaptureKey, 160);
  const captureRef = truncateText(body.captureId, 160) || clientCaptureKey;
  const eventType = truncateText(body.eventType, 80);
  const rawPhase = truncateText(body.phase, 80);
  const rawReasonCode = truncateText(body.reasonCode, 80);
  const phase = clientEventPhases.has(rawPhase) ? rawPhase : "unknown";
  const reasonCode = clientEventReasonCodes.has(rawReasonCode)
    ? rawReasonCode
    : "unknown_network_error";
  const message = truncateText(body.message, 500);
  if (!eventType || !rawReasonCode) {
    return json({ error: "eventType and reasonCode are required" }, 400);
  }
  if (!clientEventTypes.has(eventType)) {
    return json({ error: "eventType is not supported" }, 400);
  }

  let captureId: string | null = null;
  if (captureRef) {
    let query = supabase
      .from("captures")
      .select("id")
      .eq("user_id", userId)
      .limit(1);
    query = isUuid(captureRef)
      ? query.eq("id", captureRef)
      : query.eq("client_capture_key", captureRef);
    const existing = await query.maybeSingle();
    if (existing.error) throw existing.error;
    captureId = existing.data?.id ?? null;
  }

  const { data, error } = await supabase
    .from("capture_client_events")
    .insert({
      user_id: userId,
      capture_id: captureId,
      client_capture_key: clientCaptureKey || captureRef || null,
      event_type: eventType,
      phase: phase || null,
      reason_code: reasonCode,
      message: message || null,
      diagnostics: boundedClientDiagnostics(body.diagnostics),
    })
    .select("*")
    .single();
  if (error) throw error;
  scheduleClientEventRetention(supabase, userId);
  return json({ event: data }, 201);
}
