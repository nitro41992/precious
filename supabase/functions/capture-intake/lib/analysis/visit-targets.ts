import { stringOrNull } from "../common.ts";

export function normalizeVisitTargetFields(analysis: Record<string, unknown>) {
  const name = stringOrNull(analysis.visit_target_name);
  const query = stringOrNull(analysis.visit_target_query);
  const rawConfidence = typeof analysis.visit_target_confidence === "string"
    ? analysis.visit_target_confidence
    : "none";
  const confidence = name && query &&
      ["high", "medium", "low"].includes(rawConfidence)
    ? rawConfidence
    : "none";
  const evidence = Array.isArray(analysis.visit_target_evidence)
    ? analysis.visit_target_evidence
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 6)
    : [];
  const resolvedPlace = analysis.resolved_place &&
      typeof analysis.resolved_place === "object" &&
      !Array.isArray(analysis.resolved_place)
    ? analysis.resolved_place as Record<string, unknown>
    : {};
  const verifiedPlace = resolvedPlace.status === "resolved";
  return confidence === "none"
    ? {
      visit_target_name: null,
      visit_target_query: null,
      visit_target_confidence: "none",
      visit_target_evidence: [],
      verified_place: verifiedPlace,
    }
    : {
      visit_target_name: name,
      visit_target_query: query,
      visit_target_confidence: confidence,
      visit_target_evidence: evidence,
      verified_place: verifiedPlace,
    };
}
