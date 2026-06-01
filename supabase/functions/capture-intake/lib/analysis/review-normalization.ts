import {
  activeSaveIntentKeySet,
  NO_CLEAR_INTENT_RATIONALE,
} from "../config.ts";
import { finiteNumber, jsonObject, stringValue } from "../common.ts";
import type { AnalysisOutput } from "../types.ts";
import {
  reviewRationaleFromAnalysis,
  sanitizeAnalysisRationales,
} from "./rationales.ts";
import { normalizeVisitTargetFields } from "./visit-targets.ts";

export function confidenceRequiresReview(value: unknown) {
  return value === "Maybe" || value === "Not sure" ||
    value === "Couldn't tell";
}

export const reviewTargetKeys = [
  "intent",
  "collections",
  "reminder",
  "analysis",
] as const;
const reviewTargetSet = new Set<string>(reviewTargetKeys);

export function normalizedReviewTargets(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const seen = new Set<string>();
  const targets: string[] = [];
  for (const item of value) {
    const target = stringValue(item) || "";
    if (!reviewTargetSet.has(target) || seen.has(target)) continue;
    seen.add(target);
    targets.push(target);
  }
  return targets;
}

function analysisHasReviewTargets(analysis: Record<string, unknown>) {
  return Object.prototype.hasOwnProperty.call(analysis, "review_targets");
}

export function reviewTargetsForAnalysis(
  analysis: Record<string, unknown>,
  reviewConfirmedAt?: unknown,
) {
  if (reviewConfirmedAt) return [] as string[];
  if (analysisHasReviewTargets(analysis)) {
    return normalizedReviewTargets(analysis.review_targets);
  }
  const defaultIntent = jsonObject(analysis.default_intent);
  const targets: string[] = [];
  if (
    !activeIntentCategory(defaultIntent.category) ||
    confidenceRequiresReview(analysis.confidence_label)
  ) {
    targets.push("intent");
  }
  if (analysis.needs_review && !targets.length) targets.push("analysis");
  return normalizedReviewTargets(targets);
}

export function resolveReviewTargets(
  analysis: Record<string, unknown>,
  resolvedTargets: string[],
  reviewConfirmedAt?: unknown,
) {
  const resolved = new Set(resolvedTargets);
  const reviewTargets = reviewTargetsForAnalysis(analysis, reviewConfirmedAt)
    .filter((target) => !resolved.has(target));
  return {
    ...analysis,
    review_targets: reviewTargets,
    needs_review: reviewTargets.length > 0,
  };
}

export function analysisRequiresReview(
  analysis: Record<string, unknown>,
  reviewConfirmedAt?: unknown,
) {
  return reviewTargetsForAnalysis(analysis, reviewConfirmedAt).length > 0;
}

export function activeIntentCategory(value: unknown) {
  const category = stringValue(value);
  return category && activeSaveIntentKeySet.has(category) ? category : null;
}

export function normalizedDefaultIntent(analysis: Record<string, unknown>) {
  const defaultIntent = jsonObject(analysis.default_intent);
  const category = activeIntentCategory(defaultIntent.category);
  return {
    category,
    confidence: category ? finiteNumber(defaultIntent.confidence) : 0,
    rationale: stringValue(defaultIntent.rationale) ||
      (category ? "" : NO_CLEAR_INTENT_RATIONALE),
  };
}

export function analysisWithCurrentIntent(
  analysis: Record<string, unknown>,
  currentSaveIntent: unknown,
) {
  if (typeof currentSaveIntent !== "string" && currentSaveIntent !== null) {
    return analysis;
  }
  const defaultIntent = jsonObject(analysis.default_intent);
  return {
    ...analysis,
    default_intent: {
      ...defaultIntent,
      category: currentSaveIntent,
      confidence: currentSaveIntent
        ? finiteNumber(defaultIntent.confidence)
        : 0,
      rationale: currentSaveIntent
        ? stringValue(defaultIntent.rationale) || "The user chose this intent."
        : "The user left this capture without an intent.",
    },
  };
}

export function normalizedReviewAnalysis(
  analysis: Record<string, unknown>,
  reviewConfirmedAt?: unknown,
): AnalysisOutput {
  const sanitized = sanitizeAnalysisRationales(analysis);
  const normalizedAnalysis = {
    ...sanitized,
    default_intent: normalizedDefaultIntent(sanitized),
  };
  const needsReview = analysisRequiresReview(
    normalizedAnalysis,
    reviewConfirmedAt,
  );
  const reviewTargets = reviewTargetsForAnalysis(
    normalizedAnalysis,
    reviewConfirmedAt,
  );
  return {
    ...normalizedAnalysis,
    ...normalizeVisitTargetFields(normalizedAnalysis),
    review_rationale: reviewRationaleFromAnalysis(normalizedAnalysis),
    review_targets: reviewTargets,
    needs_review: needsReview,
  };
}
