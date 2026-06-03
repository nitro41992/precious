import { env } from "../common.ts";
import { compactUrlEvidence } from "../url-evidence/quality.ts";
import type {
  CaptureRow,
  RetrievedCollection,
  UrlEvidence,
} from "../types.ts";
import {
  contentEvidenceProfile,
  sourceFallbackEvidence,
  textWithoutUrls,
} from "../analysis/content-evidence.ts";
import { responseText } from "../analysis/prompts.ts";
import { COLLECTION_PROMPT_CANDIDATE_COUNT } from "./retrieval.ts";

type CollectionFit = "strong" | "possible" | "none";

type CollectionRerankItem = {
  collection_id: string;
  fit: CollectionFit;
  confidence: number;
  rationale: string;
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
    required: ["rankings"],
    properties: {
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
    "Collection matching is subject/purpose-first. Do not match by source app, host, media format, or URL shape when content evidence is available.",
    "Prefer the most specific subject or purpose Collection over broad containers. Local Activities is for nearby outing ideas that are not already clearly restaurants/cafes, ticketed or scheduled events, travel planning, fitness/health, classes/courses, products, or software/apps.",
    "Use Events & Tickets only for specific time-bound attendable events, performances, workshops, ticket pages, schedules, or event series. Do not use it for regular places, museums, attractions, apps, or guides solely because hours, admission, or ticket wording appears.",
    "Use Restaurants & Cafes for concrete restaurants, cafes, bars, menus, food-place lists, and maps/place links for dining. Do not rank Local Activities above Restaurants & Cafes for a named dining place.",
    "Use Software & Apps for app listings, SaaS/product homepages, developer repositories, software docs, and software workflows even when the app's content domain is restaurants, media, travel, or shopping.",
    "Use Fitness & Health for workouts, wellness classes, health routines, therapy, and fitness activities when that subject is central, even if the page is scheduled.",
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

function parseRerankItems(value: unknown): CollectionRerankItem[] {
  if (!value || typeof value !== "object") return [];
  const rankings = (value as Record<string, unknown>).rankings;
  if (!Array.isArray(rankings)) return [];
  return rankings
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
    );
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
  const model = Deno.env.get("OPENAI_COLLECTION_RERANK_MODEL") ||
    Deno.env.get("OPENAI_MODEL") ||
    "gpt-5-mini";
  const requestBody = {
    model,
    reasoning: { effort: "low" },
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
      raw.error?.message || `OpenAI collection rerank failed with ${response.status}`,
    );
  }
  const text = responseText(raw);
  if (!text) throw new Error("OpenAI collection rerank returned no text");
  const reranked = parseRerankItems(JSON.parse(text));
  const byId = new Map(collections.map((collection) => [collection.id, collection]));
  const seen = new Set<string>();
  const fitWeight = { strong: 0, possible: 1, none: 2 } satisfies Record<
    CollectionFit,
    number
  >;
  const ranked = reranked
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
    }));
  return [...ranked, ...unranked];
}
