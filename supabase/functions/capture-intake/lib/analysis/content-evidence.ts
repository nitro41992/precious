import {
  blockPageText,
  normalizedUrlEvidence,
  productEvidenceStatus,
  weaknessReasons,
} from "../url-evidence/quality.ts";
import {
  canonicalUrlForEvidence,
  evidenceTitleIsGeneric,
  genericTitle,
  platformForUrl,
  substantiveDescription,
  substantiveText,
} from "../url-evidence/platforms.ts";
import type {
  CaptureAssetRow,
  CaptureRow,
  ContentEvidenceProfile,
  UrlEvidence,
} from "../types.ts";

export { shouldAnalyzeAfterCaptureGate } from "./capture-gate.ts";

export function shouldRunPreflight(
  capture: CaptureRow,
  asset: CaptureAssetRow | null,
) {
  return shouldUseLinkOnlyUrlEvidenceFallback(capture, asset);
}

export function firstCaptureAsset(capture: CaptureRow): CaptureAssetRow | null {
  return Array.isArray(capture.capture_assets)
    ? capture.capture_assets[0] || null
    : null;
}

export function isImageAsset(asset: CaptureAssetRow | null | undefined) {
  return Boolean(
    asset?.storage_path && String(asset.mime_type || "").startsWith("image/"),
  );
}

export function isLinkCaptureType(capture: CaptureRow) {
  return ["link", "social_post", "unknown", null, undefined].includes(
    capture.capture_type,
  );
}

export function shouldUseLinkOnlyUrlEvidenceFallback(
  capture: CaptureRow,
  asset: CaptureAssetRow | null,
) {
  if (!capture.source_url) return false;
  if (asset?.storage_path) return false;
  return isLinkCaptureType(capture);
}

export function shouldRejectContextlessLinkCapture(
  capture: CaptureRow,
  asset: CaptureAssetRow | null,
  urlEvidence: UrlEvidence | null,
) {
  if (!shouldUseLinkOnlyUrlEvidenceFallback(capture, asset)) return false;
  if (!contentEvidenceProfile(capture, urlEvidence).content_limited) {
    return false;
  }
  return [
    "needs_client_resolution",
    "insufficient_url_evidence",
    "partial_evidence",
    "failed",
  ].includes(productEvidenceStatus(urlEvidence));
}

export function shouldRunCaptureGate(
  capture: CaptureRow,
  asset: CaptureAssetRow | null,
) {
  const captureType = capture.capture_type || "unknown";
  if (["text_note", "image", "screenshot"].includes(captureType)) return true;
  if (captureType === "mixed" && isImageAsset(asset)) return true;
  if (!capture.source_url && String(capture.source_text || "").trim()) {
    return true;
  }
  return isImageAsset(asset) &&
    !shouldUseLinkOnlyUrlEvidenceFallback(capture, asset);
}

export function shouldAttachUrlEvidence(
  capture: CaptureRow,
  urlEvidence: UrlEvidence | null,
) {
  return Boolean(capture.source_url || urlEvidence?.sourceUrl);
}

export function normalizedUrlEvidenceForCapture(
  capture: CaptureRow,
  urlEvidence: UrlEvidence | null,
) {
  if (!shouldAttachUrlEvidence(capture, urlEvidence)) return null;
  return normalizedUrlEvidence(urlEvidence, {
    originalUrl: capture.original_url || capture.source_url,
    clientResolvedUrl: capture.client_resolved_url,
  });
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

export function textWithoutUrls(value: string | null | undefined) {
  return String(value || "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function looksLikeFileOrGeneratedMarker(value: string) {
  const text = value.trim();
  if (!text) return true;
  if (/^(selected|shared)\s+(image|screenshot|file)\s*:/i.test(text)) {
    return true;
  }
  if (/^[a-f0-9]{8}-[a-f0-9-]{13,}$/i.test(text)) return true;
  if (/^[a-z0-9_-]+\.(jpe?g|png|gif|webp|heic|mp4|mov|pdf)$/i.test(text)) {
    return true;
  }
  return false;
}

export function usefulContentText(value: string | null | undefined) {
  const text = textWithoutUrls(value);
  if (text.length < 12) return false;
  if (!/[a-z]{3,}/i.test(text)) return false;
  if (genericTitle(text) || blockPageText(text)) return false;
  if (/^(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}$/i.test(text)) return false;
  if (looksLikeFileOrGeneratedMarker(text)) return false;
  return true;
}

export function hasUsefulSharedText(capture: CaptureRow) {
  return usefulContentText(capture.source_text);
}

export function hasImageEvidenceAvailable(capture: CaptureRow) {
  return Boolean(
    capture.asset_url ||
      isImageAsset(firstCaptureAsset(capture)),
  );
}

export function hasUrlImageEvidence(evidence: UrlEvidence | null) {
  const value = String(evidence?.image || "").trim();
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function contentEvidenceProfile(
  capture: CaptureRow,
  evidence: UrlEvidence | null,
): ContentEvidenceProfile {
  const signals = new Set<string>();
  if (usefulContentText(capture.context_note)) signals.add("context_note");
  if (usefulContentText(capture.display_title || capture.title)) {
    signals.add("capture_title");
  }
  if (hasUsefulSharedText(capture)) signals.add("shared_text");
  if (
    evidence?.title &&
    !evidenceTitleIsGeneric(evidence) &&
    usefulContentText(evidence.title)
  ) {
    signals.add("url_title");
  }
  if (evidence && substantiveDescription(evidence)) {
    signals.add("url_description");
  }
  if (evidence && substantiveText(evidence)) signals.add("readable_text");
  if (evidence?.entities.length) signals.add("parsed_entities");
  if (hasImageEvidenceAvailable(capture)) signals.add("image_evidence");
  if (hasUrlImageEvidence(evidence)) signals.add("url_image_evidence");

  const contentSignals = Array.from(signals);
  const contentLimited = contentSignals.length === 0;
  return {
    content_limited: contentLimited,
    source_fallback_allowed: contentLimited,
    content_signals: contentSignals,
    limited_reasons: contentLimited
      ? [
        "No meaningful title, description, caption, readable text, image evidence, shared text, context note, or parsed entity was available.",
      ]
      : [],
  };
}

export function sourceFallbackEvidence(
  capture: CaptureRow,
  evidence: UrlEvidence | null,
) {
  const normalized = normalizedUrlEvidence(evidence, {
    originalUrl: capture.original_url || capture.source_url,
    clientResolvedUrl: capture.client_resolved_url,
  });
  return {
    source_app: capture.source_app || null,
    source_url: capture.source_url || null,
    source_domain: normalized.domain || null,
    platform:
      platformForUrl(capture.source_url || evidence?.sourceUrl || null) ||
      null,
    content_type_guess: normalized.detected_content_type || null,
    path: normalized.path || null,
    item_specific_url_signal: Boolean(
      hasItemSpecificUrlSignal(evidence?.finalUrl) ||
        hasItemSpecificUrlSignal(canonicalUrlForEvidence(evidence)) ||
        hasItemSpecificUrlSignal(evidence?.sourceUrl) ||
        hasItemSpecificUrlSignal(capture.source_url),
    ),
  };
}

export function isGenericPlatformShell(
  capture: CaptureRow,
  evidence: UrlEvidence | null,
) {
  if (!evidence) return false;
  const reasons = weaknessReasons(evidence);
  const hasSubstantiveEvidence = Boolean(
    substantiveDescription(evidence) ||
      evidence.image ||
      evidence.video ||
      evidence.entities.length ||
      substantiveText(evidence),
  );
  const hasItemSignal = hasItemSpecificUrlSignal(evidence.finalUrl) ||
    hasItemSpecificUrlSignal(canonicalUrlForEvidence(evidence)) ||
    hasItemSpecificUrlSignal(evidence.sourceUrl) ||
    hasUsefulSharedText(capture);
  return !hasSubstantiveEvidence && (
    reasons.includes("generic_title") ||
    reasons.includes("generic_platform_metadata") ||
    reasons.includes("blocked_or_login_page") ||
    reasons.includes("missing_description_or_text")
  ) && !hasItemSignal;
}
