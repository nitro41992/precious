import {
  CLIENT_RESOLUTION_MESSAGE,
  INSUFFICIENT_URL_MESSAGE,
  preflightSchema,
} from "../config.ts";
import { env, hostFromUrl } from "../common.ts";
import { titleFallback } from "../capture-records.ts";
import {
  compactUrlEvidence,
  normalizedUrlEvidence,
  weaknessReasons,
} from "../url-evidence/quality.ts";
import {
  canonicalUrlForEvidence,
  platformForUrl,
} from "../url-evidence/platforms.ts";
import type {
  AnalysisOutput,
  CaptureRow,
  PreflightDecision,
  UrlEvidence,
} from "../types.ts";
import {
  contentEvidenceProfile,
  hasItemSpecificUrlSignal,
  hasUsefulSharedText,
  isGenericPlatformShell,
} from "./content-evidence.ts";
import { preflightPrompt, responseText } from "./prompts.ts";

export function preflightModel() {
  return Deno.env.get("OPENAI_PREFLIGHT_MODEL") ||
    Deno.env.get("OPENAI_MODEL") || "gpt-5-mini";
}

export async function runPreflight(
  capture: CaptureRow,
  urlEvidence: UrlEvidence | null,
) {
  const started = Date.now();
  const model = preflightModel();
  const requestBody: Record<string, unknown> = {
    model,
    reasoning: { effort: "minimal" },
    max_output_tokens: 900,
    input: [
      {
        role: "system",
        content:
          "You are Sharebook's public-link preflight gate. Decide whether enough public evidence exists before expensive extraction.",
      },
      {
        role: "user",
        content: [{
          type: "input_text",
          text: preflightPrompt(capture, urlEvidence),
        }],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "capture_preflight",
        strict: true,
        schema: preflightSchema,
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
      raw.error?.message || `OpenAI preflight failed with ${response.status}`,
    );
  }
  const text = responseText(raw);
  if (!text) {
    throw new Error("OpenAI preflight response did not include output text");
  }
  return {
    preflight: JSON.parse(text) as PreflightDecision,
    model,
    raw,
    requestBody,
    latencyMs: Date.now() - started,
    usage: raw.usage ?? {},
  };
}

export function shouldAttemptExtractionFromUrlSignal(
  capture: CaptureRow,
  evidence: UrlEvidence | null,
) {
  return Boolean(
    hasItemSpecificUrlSignal(evidence?.finalUrl) ||
      hasItemSpecificUrlSignal(canonicalUrlForEvidence(evidence || null)) ||
      hasItemSpecificUrlSignal(evidence?.sourceUrl) ||
      hasItemSpecificUrlSignal(capture.source_url) ||
      hasUsefulSharedText(capture),
  );
}

export function applyPreflightPolicy(
  capture: CaptureRow,
  preflight: PreflightDecision,
  urlEvidence: UrlEvidence | null,
): PreflightDecision {
  const validRationales = new Set([
    "public_metadata_sufficient",
    "url_identifier_sufficient",
    "map_place_parseable",
    "non_url_capture",
  ]);
  const normalized = preflight.decision === "invalid" &&
      validRationales.has(preflight.rationale_code)
    ? {
      ...preflight,
      rationale_code: "ambiguous_insufficient_evidence" as const,
    }
    : preflight;
  if (
    normalized.decision === "invalid" &&
    shouldAttemptExtractionFromUrlSignal(capture, urlEvidence) &&
    !["private_or_login_gated", "unsupported_file_or_url", "map_unparseable"]
      .includes(normalized.rationale_code)
  ) {
    return {
      decision: "valid",
      rationale_code: "url_identifier_sufficient",
      confidence: Math.max(normalized.confidence || 0, 0.55),
      user_message:
        "The URL has an item-specific signal, so full extraction should attempt exact-URL evidence before deciding it is insufficient.",
      evidence_summary: [
        "Weak metadata was not enough by itself, but the URL or shared text is item-specific.",
        `source_url=${JSON.stringify(capture.source_url || null)}`,
        `canonical=${JSON.stringify(canonicalUrlForEvidence(urlEvidence))}`,
        `final_url=${JSON.stringify(urlEvidence?.finalUrl || null)}`,
        `weakness_reasons=${weaknessReasons(urlEvidence).join(",")}`,
      ].join(" "),
    };
  }
  if (!isGenericPlatformShell(capture, urlEvidence)) return normalized;
  return {
    decision: "invalid",
    rationale_code: "generic_platform_shell",
    confidence: Math.max(normalized.confidence || 0, 0.9),
    user_message:
      "This link is not publicly extractable: the public evidence only contains a generic site shell, not item-specific content.",
    evidence_summary: [
      "The URL returned generic evidence only, with no item-specific URL signal or useful shared text.",
      `title=${JSON.stringify(urlEvidence?.title || null)}`,
      `description=${JSON.stringify(urlEvidence?.description || null)}`,
      `text=${JSON.stringify(urlEvidence?.text?.slice(0, 120) || null)}`,
      `weakness_reasons=${weaknessReasons(urlEvidence).join(",")}`,
    ].join(" "),
  };
}

export function rejectedAnalysis(
  capture: CaptureRow,
  preflight: PreflightDecision,
  urlEvidence: UrlEvidence | null,
): AnalysisOutput {
  return {
    display_title: titleFallback(capture.source_text, capture.source_url),
    summary: preflight.evidence_summary,
    default_intent: {
      category: null,
      confidence: 0,
      rationale: preflight.user_message,
    },
    entities: compactUrlEvidence(urlEvidence)?.entities || [],
    visit_target_name: null,
    visit_target_query: null,
    visit_target_confidence: "none",
    visit_target_evidence: [],
    verified_place: false,
    suggested_reminders: [],
    collection_decisions: [],
    search_phrases: [],
    confidence_label: "Couldn't tell",
    review_targets: ["analysis"],
    needs_review: true,
    content_evidence_profile: contentEvidenceProfile(capture, urlEvidence),
    url_evidence: normalizedUrlEvidence(urlEvidence, {
      originalUrl: capture.original_url || capture.source_url,
      clientResolvedUrl: capture.client_resolved_url,
    }),
    preflight,
  };
}

export function broadLowEvidenceAnalysis(
  capture: CaptureRow,
  urlEvidence: UrlEvidence | null,
): AnalysisOutput {
  const normalized = normalizedUrlEvidence(urlEvidence, {
    originalUrl: capture.original_url || capture.source_url,
    clientResolvedUrl: capture.client_resolved_url,
  });
  const host = normalized.domain || hostFromUrl(capture.source_url) ||
    "this site";
  const platform = platformForUrl(capture.source_url) || host;
  const isReddit = platform === "reddit";
  const subreddit = String(capture.source_url || "").match(/\/r\/([^/]+)/i)
    ?.[1];
  const basis = [
    `Domain is ${host}`,
    subreddit
      ? `Path includes subreddit r/${subreddit}`
      : normalized.path
      ? `Path is ${normalized.path}`
      : "",
  ].filter(Boolean);
  return {
    display_title: isReddit && subreddit
      ? `Reddit link from r/${subreddit}`
      : titleFallback(capture.source_text, capture.source_url),
    summary: normalized.status === "needs_client_resolution"
      ? CLIENT_RESOLUTION_MESSAGE
      : INSUFFICIENT_URL_MESSAGE,
    default_intent: {
      category: isReddit ? "read" : null,
      confidence: isReddit ? 0.35 : 0,
      rationale: basis.join("; ") || "Only broad URL evidence is available.",
    },
    entities: subreddit
      ? [{
        type: "community",
        name: `r/${subreddit}`,
        evidence: "URL path",
        confidence: 0.45,
      }]
      : [],
    visit_target_name: null,
    visit_target_query: null,
    visit_target_confidence: "none",
    visit_target_evidence: [],
    verified_place: false,
    suggested_reminders: [],
    collection_decisions: [],
    search_phrases: [],
    confidence_label: "Couldn't tell",
    review_targets: ["analysis"],
    needs_review: true,
    content_evidence_profile: contentEvidenceProfile(capture, urlEvidence),
    url_evidence: normalized,
    categorization: {
      category: isReddit && /game|gaming|007firstlight/i.test(subreddit || "")
        ? "gaming"
        : platform,
      subcategory: isReddit ? "reddit_community_link" : "broad_domain_link",
      confidence: isReddit ? 0.35 : 0.2,
      evidence_quality: normalized.evidence_quality,
      basis,
      not_determined: [
        "Exact post title",
        "Exact post topic",
        "Author",
        "Media type",
      ],
    },
  };
}
