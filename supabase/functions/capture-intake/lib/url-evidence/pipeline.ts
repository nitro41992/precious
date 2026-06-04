import { adminClient } from "../supabase.ts";
import { cleanedString, errorMessage, normalizeUrl } from "../common.ts";
import type { ClientResolutionInput, UrlEvidence } from "../types.ts";
import { assertFetchableUrl, resolveUrlLimited } from "./safe-fetch.ts";
import { fetchMapsEvidence } from "./maps.ts";
import { tier1CanonicalCandidates } from "./tier1.ts";
import { extractAdapterEvidenceForUrl } from "./adapters/reddit.ts";
import { extractOembedEvidenceForUrl } from "./oembed.ts";
import { extractHtmlEvidenceForUrl } from "./html.ts";
import {
  loadCachedCanonicalUrl,
  loadCachedUrlEvidence,
  persistUrlEvidence,
  shouldUseCachedEvidence,
} from "./cache.ts";
import {
  exaTargetUrlsForEnrichment,
  fetchExaContentsEvidence,
  isExaContentsConfigured,
  shouldAttemptExaEnrichment,
} from "./exa.ts";
import {
  bestEvidence,
  clientResolutionNeededEvidence,
  emptyUrlEvidence,
  evidenceQualityScore,
  needsClientResolutionForEvidence,
  uniqueUrls,
  withPipelineRaw,
} from "./quality.ts";

export {
  assertFetchableUrl,
  concatChunks,
  fetchTextLimited,
  isPrivateAddress,
  isPrivateHostname,
  resolveUrlLimited,
} from "./safe-fetch.ts";
export {
  allMeta,
  extractHtmlEvidenceForUrl,
  firstLink,
  firstMeta,
  firstTitle,
  openLinkMetadata,
  parseAttrs,
  parseHtmlEvidence,
  stripHtmlForText,
} from "./html.ts";
export {
  firstJsonLdValue,
  imageFromJsonLd,
  jsonLdCandidates,
  jsonLdEntities,
  jsonLdType,
} from "./json-ld.ts";
export {
  appleMapsEntities,
  coordinateFromText,
  decodedParam,
  dedupeEntities,
  fetchMapsEvidence,
  googleMapsEntities,
  mapEvidenceTitle,
  mapsProviderForUrl,
} from "./maps.ts";
export {
  amazonCanonicalCandidate,
  appleMusicCanonicalCandidate,
  facebookCanonicalCandidate,
  instagramCanonicalCandidate,
  pathSegment,
  pinterestCanonicalCandidate,
  redditCanonicalCandidate,
  soundCloudCanonicalCandidate,
  spotifyCanonicalCandidate,
  threadsCanonicalCandidate,
  tier1CanonicalCandidates,
  tiktokCanonicalCandidate,
  TRACKING_PARAMS,
  trackingCleanUrl,
  vimeoCanonicalCandidate,
  xCanonicalCandidate,
  youtubeCanonicalCandidate,
  youtubeVideoIdFromUrl,
} from "./tier1.ts";
export {
  extractAdapterEvidenceForUrl,
  fetchRedditJsonEvidence,
  numberEntity,
  redditJsonEndpoint,
  redditJsonMetadata,
  redditPostIdFromUrl,
} from "./adapters/reddit.ts";
export {
  extractOembedEvidenceForUrl,
  fetchExtractusOembedEvidence,
  fetchOembedEvidence,
  metaOembedEndpoint,
  oembedEndpoint,
  oembedMetadata,
} from "./oembed.ts";
export {
  contentTypeForPlatform,
  contentTypeGuess,
  domainEvidenceProfiles,
  domainGenericDescription,
  domainGenericTitle,
  domainShellText,
  evidenceDomainProfile,
  evidencePlatform,
  evidenceTitleIsGeneric,
  genericTitle,
  invalidDomainCanonical,
  matchesAnyPattern,
  platformForUrl,
  preferredDomainSource,
  substantiveDescription,
  substantiveText,
} from "./platforms.ts";
export {
  accessLimitedPage,
  bestEvidence,
  blockPageText,
  canonicalUrlForEvidence,
  clientResolutionNeededEvidence,
  compactUrlEvidence,
  emptyUrlEvidence,
  evidenceQuality,
  evidenceQualityScore,
  evidenceSources,
  hasItemSpecificUrlSignal,
  hasSubstantiveUrlEvidence,
  isOpaqueOrAppShareUrl,
  logUrlIngest,
  missingEvidence,
  needsClientResolutionForEvidence,
  normalizedUrlEvidence,
  pathFromUrl,
  productEvidenceStatus,
  shouldUseWebSearch,
  uniqueUrls,
  weaknessReasons,
  withPipelineRaw,
} from "./quality.ts";
export {
  cachedEvidence,
  cacheExpiry,
  cacheTtlMs,
  loadCachedCanonicalUrl,
  loadCachedUrlEvidence,
  persistUrlEvidence,
  shouldUseCachedEvidence,
} from "./cache.ts";
export {
  exaContentsRequestBody,
  exaTargetUrlsForEnrichment,
  fetchExaContentsEvidence,
  isExaContentsConfigured,
  normalizeExaContentsEvidence,
  shouldAttemptExaEnrichment,
} from "./exa.ts";

export function clientResolutionInput(
  fields: Record<string, unknown>,
): ClientResolutionInput {
  const attemptCount = Number(
    fields.client_resolution_attempt_count ||
      fields.clientResolutionAttemptCount,
  );
  return {
    originalUrl: normalizeUrl(
      cleanedString(fields.original_url) ||
        cleanedString(fields.originalUrl) ||
        cleanedString(fields.sourceUrl) ||
        cleanedString(fields.source_url),
    ),
    clientResolvedUrl: normalizeUrl(
      cleanedString(fields.client_resolved_url) ||
        cleanedString(fields.clientResolvedUrl),
    ),
    clientResolutionSource: cleanedString(
      fields.client_resolution_source || fields.clientResolutionSource,
      80,
    ),
    clientResolutionTimestamp: cleanedString(
      fields.client_resolution_timestamp || fields.clientResolutionTimestamp,
      80,
    ),
    clientResolutionAttemptCount:
      Number.isFinite(attemptCount) && attemptCount >= 0
        ? Math.min(Math.floor(attemptCount), 10)
        : null,
  };
}

export async function buildUrlEvidence(
  sourceUrl: string | null,
  supabase: ReturnType<typeof adminClient>,
  options: ClientResolutionInput = {
    originalUrl: null,
    clientResolvedUrl: null,
    clientResolutionSource: null,
    clientResolutionTimestamp: null,
    clientResolutionAttemptCount: null,
  },
): Promise<UrlEvidence | null> {
  const normalized = normalizeUrl(options.originalUrl || sourceUrl);
  if (!normalized) return null;
  const clientResolvedUrl = normalizeUrl(options.clientResolvedUrl);

  if (clientResolvedUrl) {
    try {
      await assertFetchableUrl(clientResolvedUrl);
    } catch (error) {
      return withPipelineRaw(
        {
          ...emptyUrlEvidence(
            normalized,
            "blocked",
            "client_resolution_validation",
            errorMessage(error, "Client-resolved URL blocked"),
          ),
          canonical: null,
          raw: { client_resolved_url: clientResolvedUrl },
        },
        { input_url: normalized, client_resolved_url: clientResolvedUrl },
      );
    }
  }

  const cached = await loadCachedUrlEvidence(supabase, normalized).catch(() =>
    null
  );
  const exaConfigured = isExaContentsConfigured();
  if (
    cached &&
    shouldUseCachedEvidence(cached, normalized, {
      refreshForExa: exaConfigured,
    })
  ) {
    return { ...cached, source: `${cached.source}:cache` };
  }

  try {
    await assertFetchableUrl(normalized);
  } catch (error) {
    return emptyUrlEvidence(
      normalized,
      "blocked",
      "safe_fetch",
      errorMessage(error, "URL blocked"),
    );
  }

  const cachedCanonical = clientResolvedUrl
    ? null
    : await loadCachedCanonicalUrl(supabase, normalized).catch(() => null);

  const mapsEvidence = await fetchMapsEvidence(normalized);
  if (mapsEvidence) {
    await persistUrlEvidence(supabase, normalized, mapsEvidence, {
      originalUrl: normalized,
      resolvedBy: "provider_adapter",
    });
    return mapsEvidence;
  }

  const candidates: UrlEvidence[] = [];
  let resolvedError: string | null = null;
  const resolved = await resolveUrlLimited(
    clientResolvedUrl || cachedCanonical || normalized,
  ).catch((error) => {
    resolvedError = errorMessage(error, "URL redirect resolution failed");
    return null;
  });
  const resolvedUrl = resolved?.finalUrl && resolved.finalUrl !== normalized
    ? resolved.finalUrl
    : null;
  const baseTargetUrls = uniqueUrls([
    clientResolvedUrl,
    cachedCanonical,
    resolvedUrl,
    normalized,
  ]);
  const tier1CanonicalUrls = uniqueUrls(
    baseTargetUrls.flatMap((targetUrl) => tier1CanonicalCandidates(targetUrl)),
  );
  const targetUrls = uniqueUrls([...baseTargetUrls, ...tier1CanonicalUrls]);
  const phaseForTargetUrl = (targetUrl: string) =>
    targetUrl === clientResolvedUrl
      ? "client_resolved"
      : targetUrl === cachedCanonical
      ? "cached_canonical"
      : targetUrl === resolvedUrl
      ? "resolved"
      : tier1CanonicalUrls.includes(targetUrl)
      ? "tier1_canonical"
      : "original";

  for (const targetUrl of targetUrls) {
    const phase = phaseForTargetUrl(targetUrl);
    const adapter = await extractAdapterEvidenceForUrl(
      normalized,
      targetUrl,
      `${phase}_adapter`,
    );
    if (adapter) candidates.push(adapter);

    const oembed = await extractOembedEvidenceForUrl(
      normalized,
      targetUrl,
      phase,
    );
    if (oembed) candidates.push(oembed);

    const html = await extractHtmlEvidenceForUrl(
      normalized,
      targetUrl,
      `${phase}_html`,
    ).catch((error) =>
      withPipelineRaw(
        emptyUrlEvidence(
          normalized,
          "failed",
          `${phase}_html`,
          errorMessage(error, "Metadata fetch failed"),
        ),
        { phase: `${phase}_html`, target_url: targetUrl },
      )
    );
    if (html) candidates.push(html);
  }

  let exaTargetUrls: string[] = [];
  let best = bestEvidence(candidates);
  if (exaConfigured && shouldAttemptExaEnrichment(best)) {
    exaTargetUrls = exaTargetUrlsForEnrichment(targetUrls);
    const exaCandidates = await fetchExaContentsEvidence(
      normalized,
      exaTargetUrls,
    );
    candidates.push(...exaCandidates);
    best = bestEvidence(candidates);
  }
  const evidence = needsClientResolutionForEvidence(
      normalized,
      best,
      candidates,
      clientResolvedUrl,
    )
    ? clientResolutionNeededEvidence(
      normalized,
      candidates,
      resolved?.status ?? null,
    )
    : best ||
      emptyUrlEvidence(
        normalized,
        "failed",
        "metadata_pipeline",
        "No URL evidence extractor produced a result",
      );
  const withPipeline = withPipelineRaw(evidence, {
    input_url: normalized,
    cached_canonical_url: cachedCanonical,
    client_resolved_url: clientResolvedUrl,
    client_resolution_source: options.clientResolutionSource,
    client_resolution_timestamp: options.clientResolutionTimestamp,
    client_resolution_attempt_count: options.clientResolutionAttemptCount,
    resolved_url: resolvedUrl,
    resolved_status: resolved?.status ?? null,
    resolved_error: resolvedError,
    resolved_content_type: resolved?.contentType ?? null,
    tier1_canonical_urls: tier1CanonicalUrls,
    extraction_sources_attempted: targetUrls.flatMap((targetUrl) => [
      `${phaseForTargetUrl(targetUrl)}_adapter`,
      `${phaseForTargetUrl(targetUrl)}_extractus_oembed`,
      `${phaseForTargetUrl(targetUrl)}_known_oembed`,
      `${phaseForTargetUrl(targetUrl)}_html`,
    ]).concat(
      exaTargetUrls.map((targetUrl) =>
        `${phaseForTargetUrl(targetUrl)}_exa_contents`
      ),
    ),
    candidate_sources: candidates.map((candidate) => ({
      source: candidate.source,
      status: candidate.status,
      title: candidate.title,
      score: evidenceQualityScore(candidate),
    })),
  });
  if (clientResolvedUrl) {
    withPipeline.raw.client_resolved_url = clientResolvedUrl;
  }
  await persistUrlEvidence(
    supabase,
    clientResolvedUrl || cachedCanonical || normalized,
    withPipeline,
    {
      originalUrl: normalized,
      clientResolvedUrl,
      resolvedBy: clientResolvedUrl
        ? "client_resolution"
        : cachedCanonical
        ? "server_redirect"
        : null,
    },
  );
  return withPipeline;
}
