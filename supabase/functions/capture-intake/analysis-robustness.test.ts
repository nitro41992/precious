import { assert, assertEqual } from "./url-evidence.test-support.ts";
import { isTransientHttpStatus } from "./lib/common.ts";
import {
  CAPTURE_GATE_REASONING_EFFORT,
  COLLECTION_CONTEXT_REASONING_EFFORT,
  COLLECTION_RERANK_REASONING_EFFORT,
  PREFLIGHT_REASONING_EFFORT,
  reasoningEffortForModel,
} from "./lib/config.ts";
import {
  attemptOpenAiAnalysis,
  requestOpenAiAnalysis,
} from "./lib/analysis/openai-client.ts";

const NONE_FLOOR_SUPPORTED = ["none", "low", "medium", "high", "xhigh"];
const MINIMAL_FLOOR_SUPPORTED = ["minimal", "low", "medium", "high"];

// Stub OpenAI's HTTP endpoint, providing OPENAI_API_KEY so env("OPENAI_API_KEY") resolves.
// Restores both fetch and the env afterwards regardless of outcome.
function withOpenAiFetch(
  responder: (call: number) => Response,
  run: (calls: () => number) => Promise<void>,
) {
  const previousKey = Deno.env.get("OPENAI_API_KEY");
  const originalFetch = globalThis.fetch;
  let calls = 0;
  Deno.env.set("OPENAI_API_KEY", "test-openai-key");
  globalThis.fetch = (() => {
    calls += 1;
    return Promise.resolve(responder(calls));
  }) as typeof fetch;
  return run(() => calls).finally(() => {
    globalThis.fetch = originalFetch;
    if (previousKey) Deno.env.set("OPENAI_API_KEY", previousKey);
    else Deno.env.delete("OPENAI_API_KEY");
  });
}

Deno.test("reasoningEffortForModel maps the lowest tier to each family's supported token", () => {
  // The two lowest tokens are mutually exclusive: gpt-5.4+ accepts "none" (rejects "minimal"),
  // the GPT-5.0 line accepts "minimal" (rejects "none"). The mapper must hand each model a token
  // it accepts, from either configured spelling.
  assertEqual(reasoningEffortForModel("gpt-5.4-mini", "none"), "none", "5.4 keeps none");
  assertEqual(reasoningEffortForModel("gpt-5.4-mini", "minimal"), "none", "5.4 maps minimal->none");
  assertEqual(reasoningEffortForModel("gpt-5-nano", "none"), "minimal", "nano maps none->minimal");
  assertEqual(reasoningEffortForModel("gpt-5-nano", "minimal"), "minimal", "nano keeps minimal");
  assertEqual(reasoningEffortForModel("gpt-5-mini", "none"), "minimal", "5.0 mini maps none->minimal");
  // Higher tiers are universal — pass straight through, never rewritten to a floor.
  assertEqual(reasoningEffortForModel("gpt-5.4-mini", "low"), "low", "low passes through");
  assertEqual(reasoningEffortForModel("gpt-5-nano", "high"), "high", "high passes through");
});

Deno.test("each aux stage's configured effort resolves to a token its model accepts", () => {
  // Whatever the configured defaults are, the mapped result must be valid for BOTH a gpt-5.4
  // default model and a gpt-5-nano per-stage override — neither family may receive a token it
  // rejects, which is exactly the bug that stranded captures as "Saved link".
  for (
    const configured of [
      PREFLIGHT_REASONING_EFFORT,
      CAPTURE_GATE_REASONING_EFFORT,
      COLLECTION_CONTEXT_REASONING_EFFORT,
      COLLECTION_RERANK_REASONING_EFFORT,
    ]
  ) {
    assert(
      NONE_FLOOR_SUPPORTED.includes(
        reasoningEffortForModel("gpt-5.4-mini", configured),
      ),
      `gpt-5.4-mini rejects mapped effort for ${configured}`,
    );
    assert(
      MINIMAL_FLOOR_SUPPORTED.includes(
        reasoningEffortForModel("gpt-5-nano", configured),
      ),
      `gpt-5-nano rejects mapped effort for ${configured}`,
    );
  }
});

Deno.test("isTransientHttpStatus retries server/back-off codes, not deterministic 4xx", () => {
  for (const status of [500, 502, 503, 504, 408, 425, 429]) {
    assert(isTransientHttpStatus(status), `${status} should be transient`);
  }
  for (const status of [200, 400, 401, 403, 404, 422]) {
    assert(!isTransientHttpStatus(status), `${status} should NOT be transient`);
  }
});

Deno.test("a non-JSON upstream 5xx body becomes a structured transient error, not a throw", async () => {
  await withOpenAiFetch(
    () => new Response("upstream connect error or disconnect/reset before headers", {
      status: 503,
    }),
    async () => {
      const result = await attemptOpenAiAnalysis({ model: "x" });
      assertEqual(result.ok, false, "5xx is not ok");
      assertEqual(result.transient, true, "a 5xx is retryable");
      assert(
        String((result.body.error as { message?: string })?.message || "")
          .includes("upstream connect error"),
        "the raw upstream text is surfaced for diagnosis",
      );
    },
  );
});

Deno.test("requestOpenAiAnalysis retries once on a transient 503, but never on a deterministic 400", async () => {
  // Transient: first 503, then a 200 success → two calls, recovers.
  await withOpenAiFetch(
    (call) =>
      call === 1
        ? new Response("upstream request timeout", { status: 503 })
        : new Response(JSON.stringify({ output: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    async (calls) => {
      const result = await requestOpenAiAnalysis({ model: "x" });
      assertEqual(calls(), 2, "a transient 503 should trigger one retry");
      assertEqual(result.ok, true, "the retry recovers");
    },
  );

  // Deterministic: a 400 invalid-param (e.g. a bad reasoning effort) must not waste a retry.
  await withOpenAiFetch(
    () => new Response(JSON.stringify({ error: { message: "Unsupported value: 'minimal'" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    }),
    async (calls) => {
      const result = await requestOpenAiAnalysis({ model: "x" });
      assertEqual(calls(), 1, "a deterministic 400 must not be retried");
      assertEqual(result.ok, false, "400 stays failed");
    },
  );
});

Deno.test("a request timeout aborts to a non-retryable failure (no second call, fast kill)", async () => {
  // AbortSignal.timeout throws a TimeoutError. A stall re-stalls, so retrying only burns the very
  // budget the timeout protects — it must fail fast and not retry.
  await withOpenAiFetch(
    () => {
      throw new DOMException("The signal has been aborted", "TimeoutError");
    },
    async (calls) => {
      const result = await requestOpenAiAnalysis({ model: "x" });
      assertEqual(calls(), 1, "a timeout must not be retried");
      assertEqual(result.ok, false, "timeout fails");
      assertEqual(result.transient, false, "timeout is non-retryable");
    },
  );
});
