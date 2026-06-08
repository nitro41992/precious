import {
  CAPTURE_GATE_PROMPT_VERSION,
  CAPTURE_GATE_REASONING_EFFORT,
  captureGateSchema,
} from "../config.ts";
import { env } from "../common.ts";
import { titleFallback } from "../capture-records.ts";
import type {
  AnalysisOutput,
  CaptureGateDecision,
  CaptureRow,
  UrlEvidence,
} from "../types.ts";
import {
  contentEvidenceProfile,
  normalizedUrlEvidenceForCapture,
} from "./content-evidence.ts";
import { captureGatePrompt, responseText } from "./prompts.ts";

export function captureGateModel() {
  return Deno.env.get("OPENAI_CAPTURE_GATE_MODEL") ||
    Deno.env.get("OPENAI_MODEL") || "gpt-5-mini";
}

export async function runCaptureGate(capture: CaptureRow) {
  const started = Date.now();
  const model = captureGateModel();
  const requestBody = buildCaptureGateRequestBody(capture, model);
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
        `OpenAI capture gate failed with ${response.status}`,
    );
  }
  const text = responseText(raw);
  if (!text) {
    throw new Error("OpenAI capture gate response did not include output text");
  }
  return {
    gate: JSON.parse(text) as CaptureGateDecision,
    model,
    raw,
    requestBody,
    latencyMs: Date.now() - started,
    usage: raw.usage ?? {},
  };
}

export function buildCaptureGateRequestBody(capture: CaptureRow, model: string) {
  const userContent: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text: captureGatePrompt(capture),
    },
  ];
  if (
    capture.asset_url &&
    String(capture.asset_mime_type || "").startsWith("image/")
  ) {
    userContent.push({ type: "input_image", image_url: capture.asset_url });
  }
  return {
    model,
    reasoning: { effort: CAPTURE_GATE_REASONING_EFFORT },
    max_output_tokens: 700,
    input: [
      {
        role: "system",
        content:
          "You are Sharebook's modality-specific capture gate. Classify whether saved note or image evidence is useful enough for Capture Analysis.",
      },
      { role: "user", content: userContent },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "capture_gate",
        strict: true,
        schema: captureGateSchema,
      },
    },
  };
}

export function captureGateMetadata(gate: CaptureGateDecision) {
  return {
    prompt_version: CAPTURE_GATE_PROMPT_VERSION,
    decision: gate.decision,
    rationale_code: gate.rationale_code,
    confidence: gate.confidence,
    user_message: gate.user_message,
    evidence_summary: gate.evidence_summary,
  };
}

export function shouldAnalyzeAfterCaptureGate(gate: CaptureGateDecision) {
  return gate.decision === "analyze";
}

export function captureGateNeedsReviewAnalysis(
  capture: CaptureRow,
  gate: CaptureGateDecision,
  urlEvidence: UrlEvidence | null,
): AnalysisOutput {
  const analysis: AnalysisOutput = {
    display_title: titleFallback(capture.source_text, capture.source_url),
    summary: gate.evidence_summary ||
      "Saved, but Sharebook needs more context before analysis will be useful.",
    default_intent: {
      category: null,
      confidence: 0,
      rationale: gate.user_message,
    },
    entities: [],
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
    capture_gate: captureGateMetadata(gate),
  };
  const normalized = normalizedUrlEvidenceForCapture(capture, urlEvidence);
  if (normalized) analysis.url_evidence = normalized;
  return analysis;
}
