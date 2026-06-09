import {
  cleanedString,
  errorMessage,
  hostFromUrl,
  normalizeUrl,
  stringValue,
} from "../common.ts";
import type { UrlEvidence } from "../types.ts";
import {
  bestEvidence,
  emptyUrlEvidence,
  evidenceQuality,
  evidenceQualityScore,
  TRANSIENT_BLOCK_PATTERN,
  weaknessReasons,
  withPipelineRaw,
} from "./quality.ts";

const EXA_CONTENTS_ENDPOINT = "https://api.exa.ai/contents";
const EXA_TEXT_MAX_CHARACTERS = 6000;
const EXA_MAX_AGE_HOURS = 24;
const EXA_LIVECRAWL_TIMEOUT_MS = 12000;
const EXA_REQUEST_TIMEOUT_MS = 15000;
const EXA_TARGET_LIMIT = 3;
const EXA_RETRY_BACKOFF_MS = 300;
const EXA_NOT_FOUND_PATTERN = /\b(404|410)\b|not[\s_-]?found|\bgone\b/i;

type ExaStatus = {
  id?: string;
  status?: string;
  error?: {
    tag?: string;
    message?: string;
    httpStatusCode?: number;
  };
};

type ExaResult = Record<string, unknown>;

function compactText(parts: Array<string | null | undefined>, limit: number) {
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, limit)
    .trim() || null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function textValue(value: unknown, limit = 6000) {
  if (typeof value === "string" && value.trim()) {
    return value.trim().slice(0, limit);
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value).slice(0, limit);
  }
  return null;
}

function stringArray(value: unknown, limit = 8) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) =>
      typeof item === "string" ? item.trim() : JSON.stringify(item)
    )
    .filter(Boolean)
    .slice(0, limit);
}

function normalized(value: unknown) {
  return normalizeUrl(stringValue(value)) || "";
}

function exaApiKey() {
  return Deno.env.get("EXA_API_KEY")?.trim() || "";
}

export function isExaContentsConfigured() {
  return Boolean(exaApiKey());
}

export function shouldAttemptExaEnrichment(evidence: UrlEvidence | null) {
  if (!evidence) return true;
  const quality = evidenceQuality(evidence);
  if (quality === "high") return false;
  const reasons = weaknessReasons(evidence);
  return (
    evidence.status === "blocked" ||
    evidence.status === "failed" ||
    evidence.status === "empty" ||
    quality === "medium" ||
    quality === "low" ||
    quality === "none" ||
    reasons.includes("generic_platform_metadata") ||
    reasons.includes("missing_title") ||
    reasons.includes("missing_description_or_text") ||
    reasons.includes("blocked_or_login_page") ||
    reasons.includes("platform_shell_text") ||
    reasons.includes("generic_title")
  );
}

export function exaTargetUrlsForEnrichment(targetUrls: string[]) {
  const urls: string[] = [];
  for (const targetUrl of targetUrls) {
    const normalizedUrl = normalizeUrl(targetUrl);
    if (!normalizedUrl || urls.includes(normalizedUrl)) continue;
    urls.push(normalizedUrl);
    if (urls.length >= EXA_TARGET_LIMIT) break;
  }
  return urls;
}

export function exaContentsRequestBody(urls: string[]) {
  return {
    urls,
    highlights: true,
    summary: true,
    text: { maxCharacters: EXA_TEXT_MAX_CHARACTERS },
    maxAgeHours: EXA_MAX_AGE_HOURS,
    livecrawlTimeout: EXA_LIVECRAWL_TIMEOUT_MS,
  };
}

function isTransientHttpStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function exaHttpStatusCode(evidence: UrlEvidence): number | null {
  const exa = (evidence.raw?.exa ?? {}) as Record<string, unknown>;
  const status = (exa.status ?? {}) as { error?: { httpStatusCode?: number } };
  const fromStatus = status.error?.httpStatusCode;
  if (typeof fromStatus === "number") return fromStatus;
  const fromRequest = exa.request_status;
  return typeof fromRequest === "number" ? fromRequest : null;
}

// Decide whether a completed Exa attempt is worth one retry. Exa's cold (uncached)
// live crawl of a JS/Cloudflare-gated page is slow and flaky — a transient/blocked
// failure often succeeds on a second attempt. Only retry when EVERY produced
// candidate failed (no usable content) AND at least one failure looks
// transient/blocked rather than a definitive not-found.
export function isTransientExaFailure(evidence: UrlEvidence[]) {
  if (!evidence.length) return false;
  if (evidence.some((candidate) => candidate.status !== "failed")) return false;
  return evidence.some((candidate) => {
    const error = candidate.error || "";
    if (EXA_NOT_FOUND_PATTERN.test(error)) return false;
    const code = exaHttpStatusCode(candidate);
    if (code === 404 || code === 410) return false;
    if (code === 401 || code === 403) return true;
    if (code !== null && isTransientHttpStatus(code)) return true;
    return TRANSIENT_BLOCK_PATTERN.test(error);
  });
}

async function attemptExaContents(
  apiKey: string,
  sourceUrl: string,
  urls: string[],
): Promise<{ evidence: UrlEvidence[]; retryable: boolean }> {
  try {
    const response = await fetch(EXA_CONTENTS_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(exaContentsRequestBody(urls)),
      signal: AbortSignal.timeout(EXA_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      const text = await response.text();
      const evidence = urls.map((url) =>
        exaFailureEvidence(
          sourceUrl,
          url,
          `Exa contents failed with ${response.status}: ${text.slice(0, 500)}`,
          { request_status: response.status },
        )
      );
      return { evidence, retryable: isTransientHttpStatus(response.status) };
    }
    const evidence = normalizeExaContentsEvidence(
      sourceUrl,
      urls,
      await response.json(),
    );
    return { evidence, retryable: isTransientExaFailure(evidence) };
  } catch (error) {
    // Network error or AbortSignal timeout — always worth one retry.
    const evidence = urls.map((url) =>
      exaFailureEvidence(
        sourceUrl,
        url,
        errorMessage(error, "Exa contents request failed"),
      )
    );
    return { evidence, retryable: true };
  }
}

export async function fetchExaContentsEvidence(
  sourceUrl: string,
  targetUrls: string[],
) {
  const apiKey = exaApiKey();
  const urls = exaTargetUrlsForEnrichment(targetUrls);
  if (!apiKey || !urls.length) return [];

  const first = await attemptExaContents(apiKey, sourceUrl, urls);
  if (!first.retryable) return first.evidence;
  await new Promise((resolve) => setTimeout(resolve, EXA_RETRY_BACKOFF_MS));
  const second = await attemptExaContents(apiKey, sourceUrl, urls);
  // Keep whichever attempt produced better evidence so a retry that fails again
  // never overwrites a marginally-better first try.
  return evidenceQualityScore(bestEvidence(second.evidence)) >=
      evidenceQualityScore(bestEvidence(first.evidence))
    ? second.evidence
    : first.evidence;
}

function statusForUrl(statuses: ExaStatus[], requestedUrl: string) {
  return statuses.find((status) =>
    normalized(status.id) === requestedUrl
  ) || null;
}

function resultMatchesRequested(
  result: ExaResult,
  requestedUrl: string,
  requestedCount: number,
) {
  if (requestedCount === 1) return true;
  const resultUrl = normalized(result.url) || normalized(result.id);
  return resultUrl === requestedUrl;
}

function resultForUrl(
  results: ExaResult[],
  requestedUrl: string,
  requestedCount: number,
  index: number,
) {
  return results.find((result) =>
    resultMatchesRequested(result, requestedUrl, requestedCount)
  ) || (requestedCount === results.length ? results[index] : null) || null;
}

export function normalizeExaContentsEvidence(
  sourceUrl: string,
  requestedUrls: string[],
  response: unknown,
) {
  const raw = objectValue(response);
  const results = Array.isArray(raw.results)
    ? raw.results.filter((result) =>
      result && typeof result === "object" && !Array.isArray(result)
    ) as ExaResult[]
    : [];
  const statuses = Array.isArray(raw.statuses)
    ? raw.statuses.map((status) => objectValue(status) as ExaStatus)
    : [];
  const requestId = stringValue(raw.requestId);

  return requestedUrls.flatMap((requestedUrl, index) => {
    const status = statusForUrl(statuses, requestedUrl);
    const result = resultForUrl(
      results,
      requestedUrl,
      requestedUrls.length,
      index,
    );
    if (result) {
      return [
        exaResultEvidence(sourceUrl, requestedUrl, result, status, requestId),
      ];
    }
    if (status?.status && status.status !== "success") {
      const tag = status.error?.tag || status.status;
      const message = status.error?.message || "Exa contents returned no data";
      return [
        exaFailureEvidence(sourceUrl, requestedUrl, `${tag}: ${message}`, {
          request_id: requestId,
          status,
        }),
      ];
    }
    return [];
  });
}

function exaResultEvidence(
  sourceUrl: string,
  requestedUrl: string,
  result: ExaResult,
  status: ExaStatus | null,
  requestId: string | null,
): UrlEvidence {
  const resultUrl = normalizeUrl(
    stringValue(result.url) || stringValue(result.id),
  ) || requestedUrl;
  const title = cleanedString(result.title, 500);
  const author = cleanedString(result.author, 500);
  const summary = textValue(result.summary, 1800);
  const text = textValue(result.text, EXA_TEXT_MAX_CHARACTERS);
  const highlights = stringArray(result.highlights, 8);
  const evidenceText = compactText([
    summary ? `Summary: ${summary}` : null,
    highlights.length ? `Highlights:\n- ${highlights.join("\n- ")}` : null,
    text ? `Text:\n${text}` : null,
  ], EXA_TEXT_MAX_CHARACTERS);
  const description = summary || highlights[0] || (text ? text.slice(0, 700) : null);
  const hasEvidence = Boolean(title || description || evidenceText);
  const host = hostFromUrl(resultUrl) || hostFromUrl(requestedUrl) ||
    hostFromUrl(sourceUrl);

  return {
    ...emptyUrlEvidence(
      sourceUrl,
      hasEvidence ? "success" : "empty",
      "exa_contents",
      hasEvidence ? null : "Exa contents returned no usable evidence",
    ),
    confidence: hasEvidence && title && evidenceText ? 0.84 : hasEvidence ? 0.62 : 0,
    finalUrl: resultUrl,
    canonical: resultUrl,
    host,
    provider: host,
    siteName: host,
    type: null,
    title,
    description,
    image: normalizeUrl(stringValue(result.image)),
    favicon: normalizeUrl(stringValue(result.favicon)),
    authorName: author,
    publishedAt: cleanedString(
      result.publishedDate || result.published_date,
      120,
    ),
    text: evidenceText,
    raw: {
      exa: {
        request_id: requestId,
        requested_url: requestedUrl,
        result_url: resultUrl,
        id: stringValue(result.id),
        status: status || null,
        summary,
        highlights,
        text_length: text?.length || 0,
        result_keys: Object.keys(result).sort(),
      },
    },
    error: status?.error?.message || null,
  };
}

function exaFailureEvidence(
  sourceUrl: string,
  requestedUrl: string,
  message: string,
  raw: Record<string, unknown> = {},
) {
  return withPipelineRaw(
    {
      ...emptyUrlEvidence(sourceUrl, "failed", "exa_contents", message),
      finalUrl: requestedUrl,
      canonical: requestedUrl,
      host: hostFromUrl(requestedUrl) || hostFromUrl(sourceUrl),
      provider: hostFromUrl(requestedUrl) || hostFromUrl(sourceUrl),
      raw: {
        exa: {
          requested_url: requestedUrl,
          ...raw,
        },
      },
    },
    {
      phase: "exa_contents",
      target_url: requestedUrl,
    },
  );
}
