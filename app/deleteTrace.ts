export const DELETE_TRACE_ENABLED = true;

export type DeleteTraceKind =
  | "capture-delete"
  | "collection-delete"
  | "collection-set"
  | "collection-unlink"
  | "suggestion-dismiss";

export type DeleteTraceToken = {
  kind: DeleteTraceKind;
  operationId: string;
  startedAt: number;
};

type DeleteTracePayload = Record<string, unknown>;

function nowMs() {
  const perf = globalThis.performance;
  return perf && typeof perf.now === "function" ? perf.now() : Date.now();
}

function scrubPayload(payload: DeleteTracePayload = {}) {
  const next: DeleteTracePayload = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) next[key] = value;
  }
  return next;
}

export function createDeleteTrace(kind: DeleteTraceKind, payload: DeleteTracePayload = {}) {
  const startedAt = nowMs();
  const operationId = `${kind}:${Math.round(startedAt).toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
  const token: DeleteTraceToken = { kind, operationId, startedAt };
  markDeleteTrace(token, "tap", payload);
  return token;
}

export function markDeleteTrace(
  token: DeleteTraceToken | null | undefined,
  phase: string,
  payload: DeleteTracePayload = {}
) {
  if (!DELETE_TRACE_ENABLED || !token) return;
  const at = nowMs();
  const entry = {
    kind: token.kind,
    operationId: token.operationId,
    phase,
    elapsedMs: Math.round((at - token.startedAt) * 10) / 10,
    atMs: Math.round(at * 10) / 10,
    ...scrubPayload(payload)
  };
  console.log("[delete-trace]", JSON.stringify(entry));
}

export function markDeleteTraceNextFrame(
  token: DeleteTraceToken | null | undefined,
  phase: string,
  payload: DeleteTracePayload = {}
) {
  if (!DELETE_TRACE_ENABLED || !token) return;
  requestAnimationFrame(() => markDeleteTrace(token, phase, payload));
}
