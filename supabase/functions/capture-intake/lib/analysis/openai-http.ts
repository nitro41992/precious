import { env } from "../common.ts";
import { OPENAI_REQUEST_TIMEOUT_MS } from "../config.ts";

const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

// Single timed entry point for every OpenAI Responses call. The AbortSignal timeout is the hard
// kill: a stage that stalls — e.g. server-side web_search hanging on a login-walled page —
// aborts here instead of running until the edge worker is terminated, which would strand the
// capture in "processing" with no terminal state. An abort throws (TimeoutError); callers either
// catch it (main analysis → recoverable failed) or let it propagate to processCapture's catch
// (aux stages → failed). Reused by every stage so the timeout can't be forgotten at a new site.
export function fetchOpenAiResponses(requestBody: Record<string, unknown>) {
  return fetch(OPENAI_RESPONSES_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env("OPENAI_API_KEY")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(OPENAI_REQUEST_TIMEOUT_MS),
  });
}
