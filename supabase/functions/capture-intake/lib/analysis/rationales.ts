import { jsonObject, stringValue } from "../common.ts";

export const neutralReviewRationale = {
  focus: "Review insight",
  summary: "Review the suggested details.",
  intent: "Review the Save Intent suggestion.",
  collections: "Review the Collection decision.",
  reminder: "Review the Reminder idea.",
} as const;

const reviewRationaleKeys = [
  "focus",
  "summary",
  "intent",
  "collections",
  "reminder",
] as const;
const reviewRationaleMaxLength: Record<
  (typeof reviewRationaleKeys)[number],
  number
> = {
  focus: 100,
  summary: 180,
  intent: 260,
  collections: 260,
  reminder: 260,
};
const debugLikeRationalePattern =
  /\b(model|prompt|schema|json|llm|gpt|openai|system message|chain[- ]of[- ]thought|hidden reasoning|confidence (?:score|percentage)|score)\b/i;
const genericRationalePattern =
  /\b(?:action|save intent|intent|collection fit|collection decision|reminder idea|suggestion)\s+(?:is\s+)?(?:supported|fits|matches|based on)\b/i;
const malformedRationalePattern =
  /(?:\.\.\.|[,;:\u2013\u2014-]\s*$|\b[a-z]\s*$)/;

export function firstRationale(records: unknown) {
  if (!Array.isArray(records)) return null;
  for (const item of records) {
    const record = jsonObject(item);
    const rationale = stringValue(record.rationale);
    if (rationale) return rationale;
  }
  return null;
}

export function sourceFallbackAllowedFromAnalysis(
  analysis: Record<string, unknown>,
) {
  const profile = jsonObject(analysis.content_evidence_profile);
  return profile.source_fallback_allowed !== false;
}

export function sourceOnlyRationale(value: string) {
  const text = value.trim();
  const sourceAsBasis =
    /\b(?:because|since|as|based on|from)\s+(?:it|this|the (?:capture|item|source|link|url|post|video))\s+(?:is|was|comes from|came from|appears to be|looks like)?\s*(?:an?\s+)?(?:instagram|tiktok|youtube|facebook|threads|reddit|reel|shorts?|social post|short social video|source app|platform|host|domain|url path|video format|media format)\b/i;
  const sourceMetadataAsBasis =
    /\b(?:because|since|as|based on|from)\s+(?:the\s+)?(?:source app|platform|host|domain|url path|video format|media format)\b/i;
  const bareSourceLabel =
    /^(?:an?\s+)?(?:instagram|tiktok|youtube|facebook|threads|reddit)\s+(?:reel|short|shorts?|post|video|social post)$/i;
  return sourceAsBasis.test(text) ||
    sourceMetadataAsBasis.test(text) ||
    bareSourceLabel.test(text);
}

export function rationaleForAnalysis(
  analysis: Record<string, unknown>,
  value: unknown,
) {
  const text = stringValue(value);
  if (!text) return "";
  if (
    !sourceFallbackAllowedFromAnalysis(analysis) && sourceOnlyRationale(text)
  ) {
    return "";
  }
  return text;
}

export function sanitizeRationaleRecords(
  analysis: Record<string, unknown>,
  key: string,
) {
  const records = analysis[key];
  if (!Array.isArray(records)) return records;
  return records.map((item) => {
    const record = jsonObject(item);
    if (!Object.keys(record).length) return item;
    return {
      ...record,
      rationale: rationaleForAnalysis(analysis, record.rationale),
    };
  });
}

export function sanitizeAnalysisRationales(
  analysis: Record<string, unknown>,
): Record<string, unknown> {
  const defaultIntent = jsonObject(analysis.default_intent);
  const reviewRationale = jsonObject(analysis.review_rationale);
  const fieldRationales = jsonObject(analysis.field_rationales);
  const fieldPurpose = jsonObject(fieldRationales.purpose);
  const fieldReminder = jsonObject(fieldRationales.reminder);
  const fieldCollections = Array.isArray(fieldRationales.collections)
    ? fieldRationales.collections.map((item) => {
      const record = jsonObject(item);
      return {
        ...record,
        text: rationaleForAnalysis(analysis, record.text),
      };
    })
    : fieldRationales.collections;
  if (sourceFallbackAllowedFromAnalysis(analysis)) {
    return {
      ...analysis,
      field_rationales: {
        ...fieldRationales,
        purpose: fieldPurpose,
        collections: fieldCollections,
        reminder: fieldReminder,
      },
    };
  }
  const sanitizedReviewRationale = Object.fromEntries(
    Object.entries(reviewRationale).map(([key, value]) => [
      key,
      rationaleForAnalysis(analysis, value),
    ]),
  );
  return {
    ...analysis,
    default_intent: {
      ...defaultIntent,
      rationale: rationaleForAnalysis(analysis, defaultIntent.rationale),
    },
    field_rationales: {
      ...fieldRationales,
      purpose: {
        ...fieldPurpose,
        text: rationaleForAnalysis(analysis, fieldPurpose.text),
      },
      collections: fieldCollections,
      reminder: {
        ...fieldReminder,
        text: rationaleForAnalysis(analysis, fieldReminder.text),
      },
    },
    review_rationale: sanitizedReviewRationale,
    collection_decisions: sanitizeRationaleRecords(
      analysis,
      "collection_decisions",
    ),
    suggested_collections: sanitizeRationaleRecords(
      analysis,
      "suggested_collections",
    ),
    suggested_reminders: sanitizeRationaleRecords(
      analysis,
      "suggested_reminders",
    ),
  };
}

export function invalidReviewRationaleReason(
  analysis: Record<string, unknown>,
  key: (typeof reviewRationaleKeys)[number],
  value: unknown,
) {
  const text = stringValue(value);
  if (!text) return "missing";
  if (text.length > reviewRationaleMaxLength[key]) return "too_long";
  if (debugLikeRationalePattern.test(text)) return "debug_like";
  if (genericRationalePattern.test(text)) return "generic";
  if (sourceOnlyRationale(text)) return "source_only";
  if (malformedRationalePattern.test(text)) return "malformed";
  if (
    !sourceFallbackAllowedFromAnalysis(analysis) &&
    !rationaleForAnalysis(analysis, text)
  ) {
    return "source_fallback_disallowed";
  }
  return "";
}

export function reviewRationaleValidation(
  analysis: Record<string, unknown>,
) {
  const reviewRationale = jsonObject(analysis.review_rationale);
  const next: Record<(typeof reviewRationaleKeys)[number], string> = {
    ...neutralReviewRationale,
  };
  for (const key of reviewRationaleKeys) {
    const reason = invalidReviewRationaleReason(
      analysis,
      key,
      reviewRationale[key],
    );
    if (reason) {
      return {
        valid: false,
        reason,
        field: key,
        rationale: { ...neutralReviewRationale },
      };
    }
    next[key] = stringValue(reviewRationale[key]) || "";
  }
  return { valid: true, reason: "", field: "", rationale: next };
}

export function reviewRationaleFromAnalysis(analysis: Record<string, unknown>) {
  return reviewRationaleValidation(analysis).rationale;
}
