import { adminClient } from "../supabase.ts";
import {
  CACHE_ERROR_TTL_MS,
  CACHE_STRONG_TTL_MS,
  CACHE_WEAK_TTL_MS,
} from "../config.ts";
import { normalizeUrl, sha256Hex, stringValue } from "../common.ts";
import type { UrlEvidence } from "../types.ts";
import {
  canonicalUrlForEvidence,
  evidenceQuality,
  normalizedUrlEvidence,
  weaknessReasons,
} from "./quality.ts";
import { emptyUrlEvidence, hasItemSpecificUrlSignal } from "./quality.ts";

export function cacheTtlMs(evidence: UrlEvidence) {
  if (evidence.raw?.client_resolution_needed) return CACHE_ERROR_TTL_MS;
  if (evidence.status === "blocked") return 0;
  if (evidence.status !== "success") return CACHE_ERROR_TTL_MS;
  if (
    evidence.raw?.client_resolved_url ||
    (evidence.raw?.pipeline && typeof evidence.raw.pipeline === "object" &&
      (evidence.raw.pipeline as Record<string, unknown>).client_resolved_url)
  ) {
    return CACHE_STRONG_TTL_MS;
  }
  return weaknessReasons(evidence).length
    ? CACHE_WEAK_TTL_MS
    : CACHE_STRONG_TTL_MS;
}

export function cacheExpiry(evidence: UrlEvidence) {
  const ttl = cacheTtlMs(evidence);
  return ttl > 0 ? new Date(Date.now() + ttl).toISOString() : null;
}

export function cachedEvidence(
  row: Record<string, unknown>,
  sourceUrl: string,
): UrlEvidence | null {
  const evidence = row.evidence && typeof row.evidence === "object"
    ? row.evidence as Record<string, unknown>
    : null;
  if (!evidence) return null;
  return {
    ...emptyUrlEvidence(sourceUrl, "empty", "cache"),
    ...evidence,
    sourceUrl,
  } as UrlEvidence;
}

export async function loadCachedUrlEvidence(
  supabase: ReturnType<typeof adminClient>,
  normalizedUrl: string,
): Promise<UrlEvidence | null> {
  const { data, error } = await supabase
    .from("url_evidence_cache")
    .select("evidence, expires_at")
    .eq("normalized_url", normalizedUrl)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data) return null;
  return cachedEvidence(data as Record<string, unknown>, normalizedUrl);
}

export async function loadCachedCanonicalUrl(
  supabase: ReturnType<typeof adminClient>,
  originalUrl: string,
): Promise<string | null> {
  const originalHash = await sha256Hex(originalUrl);
  const { data, error } = await supabase
    .from("url_evidence_cache")
    .select("canonical_url, expires_at")
    .eq("original_url_hash", originalHash)
    .not("canonical_url", "is", null)
    .gt("expires_at", new Date().toISOString())
    .order("last_verified_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const canonical = normalizeUrl(
    (data as Record<string, unknown>).canonical_url as string,
  );
  return canonical && canonical !== originalUrl ? canonical : null;
}

export function shouldUseCachedEvidence(
  evidence: UrlEvidence | null,
  normalizedUrl: string,
) {
  if (!evidence) return false;
  if (
    evidence.status !== "success" && hasItemSpecificUrlSignal(normalizedUrl)
  ) return false;
  if (
    evidence.status === "success" &&
    weaknessReasons(evidence).includes("generic_platform_metadata") &&
    hasItemSpecificUrlSignal(normalizedUrl)
  ) {
    return false;
  }
  return true;
}

export async function persistUrlEvidence(
  supabase: ReturnType<typeof adminClient>,
  normalizedUrl: string,
  evidence: UrlEvidence,
  options: {
    originalUrl?: string | null;
    clientResolvedUrl?: string | null;
    resolvedBy?:
      | "server_redirect"
      | "client_resolution"
      | "provider_adapter"
      | "manual_user_input"
      | null;
  } = {},
) {
  const expiresAt = cacheExpiry(evidence);
  if (!expiresAt) return;
  try {
    const originalUrl = normalizeUrl(options.originalUrl) || normalizedUrl;
    const originalUrlHash = await sha256Hex(originalUrl);
    await supabase
      .from("url_evidence_cache")
      .upsert({
        normalized_url: normalizedUrl,
        original_url_hash: originalUrlHash,
        original_url: originalUrl,
        final_url: evidence.finalUrl,
        canonical_url: canonicalUrlForEvidence(evidence),
        client_resolved_url: options.clientResolvedUrl ||
          stringValue(evidence.raw?.client_resolved_url),
        host: evidence.host,
        provider: evidence.provider,
        resolved_by: options.resolvedBy ||
          (evidence.finalUrl && evidence.finalUrl !== normalizedUrl
            ? "server_redirect"
            : null),
        evidence_quality: evidenceQuality(evidence),
        failure_reason:
          normalizedUrlEvidence(evidence, options).failure_reason || null,
        source: evidence.source,
        status: evidence.status,
        confidence: evidence.confidence,
        evidence,
        weakness_reasons: weaknessReasons(evidence),
        error: evidence.error,
        fetched_at: new Date().toISOString(),
        last_verified_at: new Date().toISOString(),
        expires_at: expiresAt,
      });
  } catch {
    // Cache writes should never make capture analysis fail.
  }
}
