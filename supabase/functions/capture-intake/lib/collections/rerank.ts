import {
  COLLECTION_RERANK_REASONING_EFFORT,
  OPENAI_MODEL,
} from "../config.ts";
import { env } from "../common.ts";
import { compactUrlEvidence } from "../url-evidence/quality.ts";
import type { CaptureRow, RetrievedCollection, UrlEvidence } from "../types.ts";
import {
  contentEvidenceProfile,
  sourceFallbackEvidence,
  textWithoutUrls,
} from "../analysis/content-evidence.ts";
import {
  captureRoleInstruction,
  captureRoles,
  normalizedCaptureRole,
} from "../analysis/capture-roles.ts";
import { responseText } from "../analysis/prompts.ts";
import { COLLECTION_PROMPT_CANDIDATE_COUNT } from "./retrieval.ts";

type CollectionFit = "strong" | "possible" | "none";

type CollectionRerankItem = {
  collection_id: string;
  fit: CollectionFit;
  confidence: number;
  rationale: string;
};

type CollectionRerankResult = {
  capture_role: ReturnType<typeof normalizedCaptureRole>;
  capture_role_confidence: number | null;
  capture_role_rationale: string | null;
  rankings: CollectionRerankItem[];
};

function boundedConfidence(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function rerankSchema(collections: RetrievedCollection[]) {
  const ids = collections.map((collection) => collection.id).filter(Boolean);
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "capture_role",
      "capture_role_confidence",
      "capture_role_rationale",
      "rankings",
    ],
    properties: {
      capture_role: {
        type: "string",
        enum: captureRoles,
      },
      capture_role_confidence: { type: "number" },
      capture_role_rationale: { type: "string" },
      rankings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["collection_id", "fit", "confidence", "rationale"],
          properties: {
            collection_id: ids.length
              ? { type: "string", enum: ids }
              : { type: "string" },
            fit: { type: "string", enum: ["strong", "possible", "none"] },
            confidence: { type: "number" },
            rationale: { type: "string" },
          },
        },
      },
    },
  };
}

function rerankPrompt(
  capture: CaptureRow,
  urlEvidence: UrlEvidence | null,
  collections: RetrievedCollection[],
) {
  const profile = contentEvidenceProfile(capture, urlEvidence);
  return [
    "Rerank existing active Collections for a saved Capture.",
    "Use only the provided evidence and Collection titles/descriptions.",
    captureRoleInstruction(),
    "Match the capture role and independent durable saved value to the user's dynamic Collection titles/descriptions, not a fixed starter taxonomy.",
    "Penalize weak matches caused only by source shape, platform, domain, URL path, media format, or incidental topic mentions.",
    "A secondary Collection is strong only when it captures a separate saved value supported by evidence.",
    "For generic role boundaries, distinguish shopping from learning/reference, one place from trip-planning logistics, an attendable event from a directory, visual inspiration from project execution, and a platform mention from actual software/tool use.",
    "Return strong only when the saved content clearly belongs in the Collection. Use possible for plausible but weaker topical fit. Use none for generic or misleading fits.",
    "Do not invent Collections. Do not return Collection IDs outside the candidate list.",
    "",
    JSON.stringify(
      {
        content_evidence_profile: profile,
        fallback_source_evidence: sourceFallbackEvidence(capture, urlEvidence),
        capture_evidence: {
          source_text: profile.source_fallback_allowed
            ? capture.source_text
            : textWithoutUrls(capture.source_text),
          context_note: capture.context_note || null,
          captured_at: capture.created_at || null,
          url_evidence: compactUrlEvidence(urlEvidence),
        },
        candidate_collections: collections.map((collection) => ({
          collection_id: collection.id,
          title: collection.title,
          description: collection.description,
          retrieval: {
            keyword_rank: collection.keyword_rank ?? null,
            semantic_rank: collection.semantic_rank ?? null,
            rrf_score: collection.rrf_score ?? null,
          },
        })),
      },
      null,
      2,
    ),
  ].join("\n");
}

function parseRerankResult(value: unknown): CollectionRerankResult {
  const empty = {
    capture_role: null,
    capture_role_confidence: null,
    capture_role_rationale: null,
    rankings: [],
  };
  if (!value || typeof value !== "object") return empty;
  const record = value as Record<string, unknown>;
  const captureRole = normalizedCaptureRole(record.capture_role);
  const rankings = (value as Record<string, unknown>).rankings;
  if (!Array.isArray(rankings)) {
    return {
      ...empty,
      capture_role: captureRole,
      capture_role_confidence: captureRole
        ? boundedConfidence(record.capture_role_confidence)
        : null,
      capture_role_rationale: captureRole
        ? String(record.capture_role_rationale || "").slice(0, 240)
        : null,
    };
  }
  return {
    capture_role: captureRole,
    capture_role_confidence: captureRole
      ? boundedConfidence(record.capture_role_confidence)
      : null,
    capture_role_rationale: captureRole
      ? String(record.capture_role_rationale || "").slice(0, 240)
      : null,
    rankings: rankings
      .map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return null;
        }
        const record = item as Record<string, unknown>;
        const fit = String(record.fit || "") as CollectionFit;
        if (!["strong", "possible", "none"].includes(fit)) return null;
        return {
          collection_id: String(record.collection_id || ""),
          fit,
          confidence: boundedConfidence(record.confidence),
          rationale: String(record.rationale || "").slice(0, 240),
        };
      })
      .filter((item): item is CollectionRerankItem =>
        Boolean(item?.collection_id)
      ),
  };
}

export function promptCollectionsForAnalysis(
  collections: RetrievedCollection[],
) {
  return collections.slice(0, COLLECTION_PROMPT_CANDIDATE_COUNT);
}

export async function rerankCollectionsForCapture(
  capture: CaptureRow,
  urlEvidence: UrlEvidence | null,
  collections: RetrievedCollection[],
): Promise<RetrievedCollection[]> {
  if (collections.length <= 1) return collections;
  const model = Deno.env.get("OPENAI_COLLECTION_RERANK_MODEL") || OPENAI_MODEL;
  const requestBody = {
    model,
    reasoning: { effort: COLLECTION_RERANK_REASONING_EFFORT },
    max_output_tokens: 1200,
    input: [
      {
        role: "system",
        content:
          "You rerank existing user Collections for Sharebook Capture Analysis. Produce only schema-valid JSON.",
      },
      {
        role: "user",
        content: rerankPrompt(capture, urlEvidence, collections),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "collection_rerank",
        strict: true,
        schema: rerankSchema(collections),
      },
    },
  };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env("OPENAI_API_KEY")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const raw = await response.json();
  if (!response.ok) {
    throw new Error(
      raw.error?.message ||
        `OpenAI collection rerank failed with ${response.status}`,
    );
  }
  const text = responseText(raw);
  if (!text) throw new Error("OpenAI collection rerank returned no text");
  const parsed = parseRerankResult(JSON.parse(text));
  const roleTrace = {
    rerank_capture_role: parsed.capture_role,
    rerank_capture_role_confidence: parsed.capture_role_confidence,
    rerank_capture_role_rationale: parsed.capture_role_rationale,
  };
  const byId = new Map(
    collections.map((collection) => [collection.id, collection]),
  );
  const seen = new Set<string>();
  const fitWeight = { strong: 0, possible: 1, none: 2 } satisfies Record<
    CollectionFit,
    number
  >;
  const ranked = parsed.rankings
    .filter((item) => byId.has(item.collection_id))
    .sort((left, right) =>
      fitWeight[left.fit] - fitWeight[right.fit] ||
      right.confidence - left.confidence
    )
    .map((item, index) => {
      seen.add(item.collection_id);
      return {
        ...byId.get(item.collection_id)!,
        rerank_rank: index + 1,
        rerank_confidence: item.confidence,
        rerank_fit: item.fit,
        rerank_rationale: item.rationale,
        ...roleTrace,
      };
    });
  const unranked = collections
    .filter((collection) => !seen.has(collection.id))
    .map((collection, index) => ({
      ...collection,
      rerank_rank: ranked.length + index + 1,
      rerank_confidence: null,
      rerank_fit: null,
      rerank_rationale: null,
      ...roleTrace,
    }));
  return [...ranked, ...unranked];
}
