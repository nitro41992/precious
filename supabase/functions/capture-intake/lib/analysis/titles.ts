import { hostFromUrl, jsonObject, stringValue } from "../common.ts";
import type { CaptureRow } from "../types.ts";

function cleanTitle(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function conciseTitle(value: string, maxLength = 72) {
  const cleaned = cleanTitle(value);
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1).trimEnd()}...`;
}

export function sourceOnlyTitle(
  value: unknown,
  sourceUrl?: string | null,
  sourceLabel?: string | null,
) {
  const title = cleanTitle(value).toLowerCase();
  if (!title) return true;
  if (/^saved\s+from\s+/i.test(title)) return true;
  if (/^https?:\/\//i.test(title)) return true;
  if (
    /^(instagram|tiktok|youtube|reddit|facebook|x|twitter)\s+(reel|short|video|post|link|share)$/i
      .test(title)
  ) {
    return true;
  }
  if (/^[a-z0-9.-]+\/\S+/i.test(title)) return true;
  const host = (hostFromUrl(sourceUrl) || "").toLowerCase();
  const source = String(sourceLabel || "").trim().toLowerCase();
  if (host && title.startsWith(`${host}/`)) return true;
  if (host && (title === host || title === host.replace(/^www\./, ""))) {
    return true;
  }
  if (source && title === source) return true;
  return !title.includes(" ") && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(title);
}

function analysisSourceLabel(analysis: Record<string, unknown>) {
  const urlEvidence = jsonObject(analysis.url_evidence);
  return stringValue(urlEvidence.source_domain) ||
    stringValue(urlEvidence.site_name) ||
    null;
}

export function normalizedAnalysisDisplayTitle(
  analysis: Record<string, unknown>,
) {
  const displayTitle = cleanTitle(analysis.display_title);
  const sourceLabel = analysisSourceLabel(analysis);
  if (displayTitle && !sourceOnlyTitle(displayTitle, null, sourceLabel)) {
    return conciseTitle(displayTitle);
  }
  const summary = cleanTitle(analysis.summary);
  if (summary && !sourceOnlyTitle(summary, null, sourceLabel)) {
    return conciseTitle(summary);
  }
  return "Saved capture";
}

export function titleForAnalysisUpdate(
  capture: CaptureRow,
  displayTitle: string,
) {
  const currentTitle = cleanTitle(capture.title);
  if (
    currentTitle &&
    !sourceOnlyTitle(currentTitle, capture.source_url, capture.source_app)
  ) {
    return currentTitle;
  }
  return displayTitle || "Saved capture";
}
