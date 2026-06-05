import {
  CLIENT_RESOLUTION_MESSAGE,
  INSUFFICIENT_URL_MESSAGE,
} from "../config.ts";
import { hostFromUrl, normalizeUrl, stringValue } from "../common.ts";
import type {
  EvidenceQuality,
  LlMUrlEvidence,
  ProductUrlEvidenceStatus,
  UrlEvidence,
} from "../types.ts";
import {
  canonicalUrlForEvidence,
  contentTypeGuess,
  domainGenericDescription,
  domainShellText,
  evidenceTitleIsGeneric,
  invalidDomainCanonical,
  platformForUrl,
  preferredDomainSource,
  substantiveDescription,
  substantiveText,
} from "./platforms.ts";

export {
  canonicalUrlForEvidence,
  evidenceTitleIsGeneric,
  genericTitle,
  invalidDomainCanonical,
  matchesAnyPattern,
  substantiveDescription,
  substantiveText,
} from "./platforms.ts";

export function emptyUrlEvidence(
  sourceUrl: string,
  status: UrlEvidence["status"],
  source: string,
  error: string | null = null,
): UrlEvidence {
  return {
    status,
    source,
    confidence: 0,
    sourceUrl,
    finalUrl: null,
    canonical: sourceUrl,
    host: hostFromUrl(sourceUrl),
    provider: hostFromUrl(sourceUrl),
    siteName: hostFromUrl(sourceUrl),
    type: null,
    title: null,
    description: null,
    image: null,
    video: null,
    favicon: null,
    authorName: null,
    authorUrl: null,
    publishedAt: null,
    modifiedAt: null,
    text: null,
    entities: [],
    raw: {},
    error,
  };
}

export function blockPageText(value: string | null | undefined) {
  const text = String(value || "").toLowerCase();
  return /captcha|cloudflare|enable javascript|access denied|temporarily blocked|sign in to continue|log in to continue|please wait while we check|content is unavailable|people under \d+ can't see this content|can't see this content|cannot see this content|account has set limits on who can see|limits on who can see this content/i
    .test(text);
}

export function accessLimitedPage(evidence: UrlEvidence | null) {
  const text = [
    evidence?.title,
    evidence?.description,
    evidence?.text,
  ].filter(Boolean).join(" ");
  return /content is unavailable|people under \d+ can't see this content|can't see this content|cannot see this content|account has set limits on who can see|limits on who can see this content/i
    .test(text);
}

export function weaknessReasons(evidence: UrlEvidence | null) {
  const reasons: string[] = [];
  if (!evidence) return ["no_url_evidence"];
  if (evidence.status !== "success") reasons.push(`status_${evidence.status}`);
  if (!evidence.title) reasons.push("missing_title");
  else if (evidenceTitleIsGeneric(evidence)) reasons.push("generic_title");
  if (!evidence.description && !evidence.text) {
    reasons.push("missing_description_or_text");
  }
  if (domainGenericDescription(evidence)) reasons.push("generic_description");
  if (domainShellText(evidence)) reasons.push("platform_shell_text");
  if (invalidDomainCanonical(evidence)) reasons.push("invalid_canonical");
  if (
    evidence.text && evidence.text.length < 180 && !domainShellText(evidence)
  ) {
    reasons.push("short_text");
  }
  if (!contentTypeGuess(evidence)) reasons.push("missing_content_type");
  if (
    blockPageText(evidence.title) || blockPageText(evidence.description) ||
    blockPageText(evidence.text)
  ) {
    reasons.push("blocked_or_login_page");
  }
  const lacksSubstantivePlatformEvidence = !substantiveDescription(evidence) &&
    !substantiveText(evidence) &&
    !evidence.image &&
    !evidence.video &&
    !evidence.entities.length &&
    !evidence.authorName;
  if (
    platformForUrl(evidence.sourceUrl) !== "generic" &&
    (evidenceTitleIsGeneric(evidence) || domainGenericDescription(evidence) ||
      domainShellText(evidence) || invalidDomainCanonical(evidence) ||
      lacksSubstantivePlatformEvidence)
  ) {
    reasons.push("generic_platform_metadata");
  }
  return Array.from(new Set(reasons));
}

export function evidenceSources(evidence: UrlEvidence | null) {
  if (!evidence) return [];
  const sources = new Set<string>();
  if (evidence.source) sources.add(evidence.source);
  if (evidence.raw?.jsonLd) sources.add("jsonld");
  if (evidence.text) sources.add("readable_text");
  if (evidence.image || evidence.video) sources.add("media_metadata");
  return Array.from(sources);
}

export function evidenceQuality(evidence: UrlEvidence | null): EvidenceQuality {
  if (!evidence) return "none";
  if (
    evidence.status === "blocked" || evidence.status === "failed" ||
    evidence.status === "empty"
  ) {
    return evidence.title || evidence.description || evidence.text ||
        evidence.entities.length
      ? "low"
      : "none";
  }
  const reasons = weaknessReasons(evidence);
  if (
    evidence.status === "success" &&
    evidence.confidence >= 0.78 &&
    evidence.title &&
    !evidenceTitleIsGeneric(evidence) &&
    (substantiveDescription(evidence) || substantiveText(evidence) ||
      evidence.image || evidence.video)
  ) {
    return reasons.includes("blocked_or_login_page") ||
        reasons.includes("generic_platform_metadata")
      ? "low"
      : "high";
  }
  if (
    evidence.status === "success" &&
    evidence.confidence >= 0.45 &&
    (evidence.title || evidence.description || evidence.text ||
      evidence.entities.length)
  ) {
    return reasons.includes("blocked_or_login_page") ||
        reasons.includes("generic_platform_metadata")
      ? "low"
      : "medium";
  }
  return evidence.title || evidence.description || evidence.text ||
      evidence.entities.length
    ? "low"
    : "none";
}

export function productEvidenceStatus(
  evidence: UrlEvidence | null,
): ProductUrlEvidenceStatus {
  const quality = evidenceQuality(evidence);
  if (!evidence) return "insufficient_url_evidence";
  if (evidence.raw?.client_resolution_needed) return "needs_client_resolution";
  if (quality === "high" || quality === "medium") return "extracted";
  if (quality === "low") return "partial_evidence";
  if (evidence.status === "failed" || evidence.status === "blocked") {
    return "failed";
  }
  return "insufficient_url_evidence";
}

export function missingEvidence(evidence: UrlEvidence | null) {
  const missing: string[] = [];
  const canonical = canonicalUrlForEvidence(evidence);
  if (!canonical || canonical === evidence?.sourceUrl) {
    missing.push("canonical_url");
  }
  if (!evidence?.title) missing.push("title");
  if (!evidence?.description) missing.push("description");
  if (!evidence?.text) missing.push("body_or_text_excerpt");
  if (!evidence?.image && !evidence?.video) missing.push("media");
  return missing;
}

export function pathFromUrl(value: string | null | undefined) {
  try {
    return new URL(value || "").pathname || "";
  } catch {
    return "";
  }
}

export function normalizedUrlEvidence(
  evidence: UrlEvidence | null,
  options: { originalUrl?: string | null; clientResolvedUrl?: string | null } =
    {},
) {
  const normalizedUrl = evidence?.sourceUrl ||
    normalizeUrl(options.originalUrl) || "";
  const canonicalUrl = canonicalUrlForEvidence(evidence) || "";
  const status = productEvidenceStatus(evidence);
  const quality = evidenceQuality(evidence);
  const rawPipeline =
    evidence?.raw?.pipeline && typeof evidence.raw.pipeline === "object"
      ? evidence.raw.pipeline as Record<string, unknown>
      : {};
  const failureReason = status === "needs_client_resolution"
    ? "opaque_or_blocked_url_unresolved"
    : accessLimitedPage(evidence)
    ? "age_or_access_limited"
    : evidence?.error ||
      (quality === "none" ? "insufficient_url_evidence" : "");
  return {
    status,
    evidence_quality: quality,
    original_url: options.originalUrl || normalizedUrl || "",
    normalized_url: normalizedUrl || "",
    canonical_url: canonicalUrl,
    client_resolved_url: options.clientResolvedUrl ||
      stringValue(evidence?.raw?.client_resolved_url) || "",
    provider: evidence?.provider || "",
    domain: evidence?.host || hostFromUrl(normalizedUrl) || "",
    path: pathFromUrl(
      evidence?.finalUrl || evidence?.canonical || normalizedUrl,
    ),
    detected_content_type: contentTypeGuess(evidence) || "",
    title: evidence?.title || "",
    description: evidence?.description || "",
    author: evidence?.authorName || "",
    published_at: evidence?.publishedAt || "",
    image_url: evidence?.image || "",
    media_urls: [evidence?.video].filter(Boolean),
    text_excerpt: evidence?.text ? evidence.text.slice(0, 1200) : "",
    extraction_sources: evidenceSources(evidence),
    failure_reason: failureReason || "",
    missing_evidence: missingEvidence(evidence),
    user_facing_message: accessLimitedPage(evidence)
      ? "The source limited public access to this content."
      : status === "needs_client_resolution"
      ? CLIENT_RESOLUTION_MESSAGE
      : status === "insufficient_url_evidence"
      ? INSUFFICIENT_URL_MESSAGE
      : "",
    raw_debug_summary: {
      redirect_status: rawPipeline.resolved_status ?? null,
      final_url: evidence?.finalUrl || null,
      source: evidence?.source || null,
      error: evidence?.error || null,
      weakness_reasons: weaknessReasons(evidence),
      extraction_sources_attempted: rawPipeline.extraction_sources_attempted ||
        [],
      extraction_sources_successful: evidenceSources(evidence),
    },
  };
}

export function logUrlIngest(
  urlEvidence: UrlEvidence | null,
  confidence: number | null = null,
) {
  const normalized = normalizedUrlEvidence(urlEvidence);
  const debug = normalized.raw_debug_summary as Record<string, unknown>;
  console.info(
    "url_ingest",
    JSON.stringify({
      normalized_url: normalized.normalized_url,
      provider: normalized.provider,
      redirect_status: debug.redirect_status ?? "",
      final_url: debug.final_url ?? "",
      client_resolved_url_present: Boolean(normalized.client_resolved_url),
      extraction_sources_attempted: debug.extraction_sources_attempted || [],
      extraction_sources_successful: normalized.extraction_sources,
      evidence_quality: normalized.evidence_quality,
      failure_reason: normalized.failure_reason,
      categorization_confidence: confidence ?? "",
    }),
  );
}

export function compactUrlEvidence(
  evidence: UrlEvidence | null,
): LlMUrlEvidence | null {
  if (!evidence) return null;
  const reasons = weaknessReasons(evidence);
  const itemSpecificUrlSignal = hasItemSpecificUrlSignal(evidence.finalUrl) ||
    hasItemSpecificUrlSignal(canonicalUrlForEvidence(evidence)) ||
    hasItemSpecificUrlSignal(evidence.sourceUrl);
  return {
    url: evidence.sourceUrl,
    status: productEvidenceStatus(evidence),
    evidence_quality: evidenceQuality(evidence),
    final_url: evidence.finalUrl,
    canonical_url: canonicalUrlForEvidence(evidence),
    client_resolved_url: stringValue(evidence.raw?.client_resolved_url),
    source_domain: evidence.host,
    content_type_guess: contentTypeGuess(evidence),
    platform: platformForUrl(evidence.sourceUrl),
    title: evidence.title,
    description: evidence.description,
    site_name: evidence.siteName,
    author: evidence.authorName,
    published_at: evidence.publishedAt,
    modified_at: evidence.modifiedAt,
    image_url: evidence.image,
    favicon: evidence.favicon,
    media_url: evidence.video,
    readable_text_excerpt: evidence.text ? evidence.text.slice(0, 1200) : null,
    entities: evidence.entities.slice(0, 8),
    extraction_status: evidence.status,
    extraction_confidence: evidence.confidence,
    evidence_sources: evidenceSources(evidence),
    weakness_reasons: reasons,
    item_specific_url_signal: itemSpecificUrlSignal,
    should_web_search: shouldUseWebSearch(evidence),
    error: evidence.error,
  };
}

export function shouldUseWebSearch(evidence: UrlEvidence | null) {
  if (!evidence?.sourceUrl) return false;
  const status = productEvidenceStatus(evidence);
  const quality = evidenceQuality(evidence);
  if (
    status === "needs_client_resolution" ||
    status === "insufficient_url_evidence" || quality === "low" ||
    quality === "none"
  ) {
    return false;
  }
  const reasons = weaknessReasons(evidence);
  return (
    reasons.includes("status_failed") ||
    reasons.includes("status_empty") ||
    reasons.includes("missing_title") ||
    reasons.includes("generic_title") ||
    reasons.includes("missing_description_or_text") ||
    reasons.includes("blocked_or_login_page") ||
    reasons.includes("generic_platform_metadata")
  );
}

export function uniqueUrls(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const value of values) {
    const normalized = normalizeUrl(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(normalized);
  }
  return urls;
}

export function hasItemSpecificUrlSignal(value: string | null | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    const pathSegments = url.pathname
      .split("/")
      .map((segment) => decodeURIComponent(segment).trim())
      .filter(Boolean);
    const hasSpecificPath = pathSegments.length >= 2 ||
      pathSegments.some((segment) =>
        /[a-z0-9]{6,}/i.test(segment) || /\d{4,}/.test(segment)
      );
    const hasSpecificQuery = Array.from(url.searchParams.entries()).some(
      ([key, val]) => {
        const combined = `${key}=${val}`.trim();
        return val.trim().length >= 6 ||
          /(?:^|[_-])(id|url|uri|u|v|p|q)(?:$|[_-])/i.test(key) &&
            combined.length >= 4;
      },
    );
    return hasSpecificPath || hasSpecificQuery;
  } catch {
    return false;
  }
}

export function isOpaqueOrAppShareUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    const segments = url.pathname.split("/").filter(Boolean);
    if (host === "reddit.com" || host.endsWith(".reddit.com")) {
      return /^\/r\/[^/]+\/s\/[a-z0-9_-]+\/?$/i.test(url.pathname);
    }
    const last = segments[segments.length - 1] || "";
    const hasShareMarker = segments.some((segment) =>
      /^(s|share|shared|short|l)$/i.test(segment)
    );
    return platformForUrl(value) !== "generic" && hasShareMarker &&
      /^[a-z0-9_-]{6,}$/i.test(last);
  } catch {
    return false;
  }
}

export function hasSubstantiveUrlEvidence(evidence: UrlEvidence | null) {
  if (!evidence) return false;
  return Boolean(
    (evidence.title && !evidenceTitleIsGeneric(evidence)) ||
      substantiveDescription(evidence) ||
      evidence.image ||
      evidence.video ||
      substantiveText(evidence) ||
      evidence.entities.length,
  );
}

export function needsClientResolutionForEvidence(
  originalUrl: string,
  evidence: UrlEvidence | null,
  candidates: UrlEvidence[],
  clientResolvedUrl: string | null,
) {
  if (clientResolvedUrl) return false;
  if (!isOpaqueOrAppShareUrl(originalUrl)) return false;
  if (hasSubstantiveUrlEvidence(evidence)) return false;
  return candidates.some((candidate) =>
    candidate.status === "blocked" ||
    candidate.status === "failed" ||
    /403|401|429|blocked|forbidden|access denied|captcha|too many/i.test(
      candidate.error || "",
    )
  ) || !candidates.length;
}

export function clientResolutionNeededEvidence(
  sourceUrl: string,
  candidates: UrlEvidence[],
  resolvedStatus: number | null,
) {
  return withPipelineRaw(
    {
      ...emptyUrlEvidence(
        sourceUrl,
        "blocked",
        "client_resolution",
        "opaque_or_blocked_url_unresolved",
      ),
      canonical: null,
      provider: platformForUrl(sourceUrl) || hostFromUrl(sourceUrl),
      raw: {
        client_resolution_needed: true,
        requested_missing_evidence: [
          "canonical_url",
          "title",
          "description",
          "body_or_text_excerpt",
          "media",
        ],
      },
    },
    {
      input_url: sourceUrl,
      resolved_url: null,
      resolved_status: resolvedStatus,
      candidate_sources: candidates.map((candidate) => ({
        source: candidate.source,
        status: candidate.status,
        error: candidate.error,
        score: evidenceQualityScore(candidate),
      })),
    },
  );
}

export function evidenceQualityScore(evidence: UrlEvidence | null) {
  if (!evidence) return -1;
  let score = evidence.confidence * 100;
  if (evidence.status === "success") score += 100;
  if (evidence.status === "partial") score += 50;
  if (evidence.status === "failed" || evidence.status === "blocked") {
    score -= 100;
  }
  if (evidence.title && !evidenceTitleIsGeneric(evidence)) score += 30;
  if (substantiveDescription(evidence)) score += 25;
  if (substantiveText(evidence)) score += 20;
  if (evidence.image || evidence.video) score += 12;
  if (evidence.entities.length) {
    score += Math.min(20, evidence.entities.length * 5);
  }
  const canonical = canonicalUrlForEvidence(evidence);
  if (canonical && canonical !== evidence.sourceUrl) {
    score += 8;
  }
  score -= weaknessReasons(evidence).length * 10;
  if (/json|oembed/i.test(evidence.source)) score += 10;
  if (preferredDomainSource(evidence) && hasSubstantiveUrlEvidence(evidence)) {
    score += 25;
  }
  return score;
}

export function bestEvidence(candidates: UrlEvidence[]) {
  return candidates
    .filter(Boolean)
    .sort((a, b) => evidenceQualityScore(b) - evidenceQualityScore(a))[0] ||
    null;
}

export function withPipelineRaw(
  evidence: UrlEvidence,
  fields: Record<string, unknown>,
): UrlEvidence {
  return {
    ...evidence,
    raw: {
      ...evidence.raw,
      pipeline: {
        ...(evidence.raw?.pipeline && typeof evidence.raw.pipeline === "object"
          ? evidence.raw.pipeline as Record<string, unknown>
          : {}),
        ...fields,
      },
    },
  };
}
