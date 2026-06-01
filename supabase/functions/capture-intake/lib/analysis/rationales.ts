import { activeSaveIntents } from "../config.ts";
import { compactText, jsonObject, stringValue } from "../common.ts";
import {
  activeIntentCategory,
  confidenceRequiresReview,
  reviewTargetsForAnalysis,
} from "./review-normalization.ts";

export function firstRationale(records: unknown) {
  if (!Array.isArray(records)) return null;
  for (const item of records) {
    const record = jsonObject(item);
    const rationale = stringValue(record.rationale);
    if (rationale) return rationale;
  }
  return null;
}

export function intentLabelFromKey(value: unknown) {
  const key = stringValue(value);
  if (!key) return null;
  const configured = activeSaveIntents.find((intent) => intent.key === key);
  if (configured?.label) return configured.label;
  return key.replace(/_/g, " ").replace(
    /\b\w/g,
    (letter) => letter.toUpperCase(),
  );
}

export function sourceFallbackAllowedFromAnalysis(
  analysis: Record<string, unknown>,
) {
  const profile = jsonObject(analysis.content_evidence_profile);
  return profile.source_fallback_allowed !== false;
}

export function sourceOnlyRationale(value: string) {
  return /\b(instagram|tiktok|youtube|facebook|threads|reddit|reel|shorts?|social post|source app|platform|host|domain|url path|video format|media format)\b/i
    .test(value);
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

export function sanitizeAnalysisRationales(analysis: Record<string, unknown>) {
  if (sourceFallbackAllowedFromAnalysis(analysis)) return analysis;
  const defaultIntent = jsonObject(analysis.default_intent);
  const reviewRationale = jsonObject(analysis.review_rationale);
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

export function reviewRationaleFromAnalysis(analysis: Record<string, unknown>) {
  const reviewRationale = jsonObject(analysis.review_rationale);
  const defaultIntent = jsonObject(analysis.default_intent);
  const hasActiveIntent = Boolean(activeIntentCategory(defaultIntent.category));
  const intentLabel = intentLabelFromKey(defaultIntent.category);
  const collectionRationale = firstRationale(analysis.linked_collections) ||
    firstRationale(analysis.collection_decisions) ||
    firstRationale(analysis.suggested_collections);
  const reminderRationale = firstRationale(analysis.suggested_reminders);
  const subject = reviewSubjectFromAnalysis(analysis);
  const linkedCollectionTitle =
    firstCollectionTitle(analysis.linked_collections) ||
    firstCollectionTitle(analysis.collection_decisions) ||
    firstCollectionTitle(analysis.suggested_collections);
  const intent = rationaleForAnalysis(analysis, reviewRationale.intent) ||
    rationaleForAnalysis(analysis, defaultIntent.rationale) ||
    (hasActiveIntent
      ? `Looks like ${subject}, so I saved it as ${intentLabel}.`
      : "No clear Save Intent was found. Choose one if it fits.");
  const collections =
    rationaleForAnalysis(analysis, reviewRationale.collections) ||
    rationaleForAnalysis(analysis, collectionRationale) ||
    (linkedCollectionTitle
      ? `It matched ${linkedCollectionTitle} from your existing Collections.`
      : "No Collection was selected because none of your existing Collections matched this capture strongly enough.");
  const reminder = rationaleForAnalysis(analysis, reviewRationale.reminder) ||
    rationaleForAnalysis(analysis, reminderRationale) ||
    "No Reminder idea was suggested because the capture did not include a clear future time, place, event, or trigger.";
  const summary = rationaleForAnalysis(analysis, reviewRationale.summary) ||
    summaryReviewRationale(subject, intentLabel, linkedCollectionTitle);
  const reviewTargets = reviewTargetsForAnalysis(analysis);
  const focus = rationaleForAnalysis(analysis, reviewRationale.focus) ||
    (reviewTargets.includes("collections")
      ? `Check Collections${
        linkedCollectionTitle ? `: ${linkedCollectionTitle}` : ""
      }`
      : reviewTargets.includes("reminder")
      ? "Confirm Reminder idea"
      : !hasActiveIntent &&
          (analysis.needs_review ||
            confidenceRequiresReview(analysis.confidence_label) ||
            reviewTargets.includes("intent"))
      ? "Choose a Save Intent"
      : confidenceRequiresReview(analysis.confidence_label)
      ? `Confirm Save Intent: ${intentLabel || "suggested intent"}`
      : analysis.needs_review
      ? "Review the suggested fields"
      : "Review insight available");
  return { focus, summary, intent, collections, reminder };
}

function reviewSubjectFromAnalysis(analysis: Record<string, unknown>) {
  const text = compactText([
    stringValue(analysis.summary),
    stringValue(analysis.display_title),
  ], 80);
  return text
    ? text.charAt(0).toLowerCase() + text.slice(1)
    : "this saved item";
}

function firstCollectionTitle(records: unknown) {
  if (!Array.isArray(records)) return "";
  for (const item of records) {
    const record = jsonObject(item);
    const title = stringValue(record.title);
    if (title) return title;
  }
  return "";
}

function summaryReviewRationale(
  subject: string,
  intentLabel: string | null,
  collectionTitle: string,
) {
  if (intentLabel && collectionTitle) {
    return `Looks like ${subject}, so I saved it as ${intentLabel} and matched ${collectionTitle}.`;
  }
  if (intentLabel) {
    return `Looks like ${subject}, so I saved it as ${intentLabel}.`;
  }
  if (collectionTitle) {
    return `Looks like ${subject}, so I matched ${collectionTitle}.`;
  }
  return "I could not find a strong existing Collection or reminder trigger from the saved content.";
}
