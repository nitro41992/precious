import corpusData from "./url-evidence-corpus.json" with { type: "json" };
import { __urlEvidenceTest as urlEvidence } from "./lib/test-support.ts";

export { urlEvidence };

export type CorpusCase = {
  name: string;
  kind: "html" | "oembed";
  sourceUrl: string;
  finalUrl?: string;
  html?: string;
  data?: Record<string, unknown>;
  expected: Record<string, unknown>;
};

export const corpus = corpusData as CorpusCase[];

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertEqual(
  actual: unknown,
  expected: unknown,
  message: string,
) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${
        JSON.stringify(actual)
      }`,
    );
  }
}

export function assertIncludes(
  values: string[],
  expected: string,
  message: string,
) {
  if (!values.includes(expected)) {
    throw new Error(
      `${message}: expected ${JSON.stringify(values)} to include ${
        JSON.stringify(expected)
      }`,
    );
  }
}

export function evidenceFor(entry: CorpusCase) {
  if (entry.kind === "html") {
    assert(entry.html, `${entry.name} is missing html`);
    assert(entry.finalUrl, `${entry.name} is missing finalUrl`);
    return urlEvidence.parseHtmlEvidence(
      entry.html,
      entry.sourceUrl,
      entry.finalUrl,
    );
  }
  assert(entry.data, `${entry.name} is missing oEmbed data`);
  return urlEvidence.oembedMetadata(entry.data, entry.sourceUrl);
}

export function captureFixture(overrides: Record<string, unknown> = {}): any {
  return {
    id: "capture-1",
    user_id: "user-1",
    capture_type: "unknown",
    title: null,
    display_title: null,
    source_url: null,
    original_url: null,
    client_resolved_url: null,
    client_resolution_source: null,
    client_resolution_timestamp: null,
    client_resolution_attempt_count: null,
    source_text: "",
    context_note: null,
    source_app: "Android Share",
    capture_assets: [],
    ...overrides,
  };
}

export function imageAssetFixture(
  overrides: Record<string, unknown> = {},
): any {
  return {
    storage_path: "user-1/capture-1/image.jpg",
    mime_type: "image/jpeg",
    ...overrides,
  };
}

export function gateFixture(overrides: Record<string, unknown> = {}): any {
  return {
    decision: "needs_review",
    rationale_code: "insufficient_user_context",
    confidence: 0.91,
    user_message: "Saved. Add a little more context when you review it.",
    evidence_summary: "The capture only contains a filename marker.",
    ...overrides,
  };
}
