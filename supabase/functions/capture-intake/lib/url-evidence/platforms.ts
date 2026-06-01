import { hostFromUrl } from "../common.ts";
import type { DomainEvidenceProfile, UrlEvidence } from "../types.ts";

export function platformForUrl(value: string | null) {
  const host = hostFromUrl(value);
  if (!host) return null;
  if (/instagram\.com$/i.test(host)) return "instagram";
  if (/facebook\.com$|fb\.com$/i.test(host)) return "facebook";
  if (/threads\.net$/i.test(host)) return "threads";
  if (/tiktok\.com$/i.test(host)) return "tiktok";
  if (/reddit\.com$/i.test(host)) return "reddit";
  if (/youtube\.com$|youtu\.be$/i.test(host)) return "youtube";
  if (/x\.com$|twitter\.com$/i.test(host)) return "x";
  if (/vimeo\.com$/i.test(host)) return "vimeo";
  if (/soundcloud\.com$/i.test(host)) return "soundcloud";
  if (/open\.spotify\.com$|spotify\.link$/i.test(host)) return "spotify";
  if (/music\.apple\.com$/i.test(host)) return "apple_music";
  if (/pinterest\.com$|pin\.it$/i.test(host)) return "pinterest";
  if (/(^|\.)amazon\./i.test(host) || /^a\.co$|^amzn\.to$/i.test(host)) {
    return "amazon";
  }
  if (/maps\.app\.goo\.gl$|maps\.google\./i.test(host)) return "google_maps";
  if (/maps\.apple\.com$/i.test(host)) return "apple_maps";
  return "generic";
}

export function contentTypeForPlatform(platform: string | null) {
  switch (platform) {
    case "amazon":
      return "product";
    case "apple_maps":
    case "google_maps":
      return "place";
    case "apple_music":
    case "soundcloud":
    case "spotify":
      return "media";
    case "pinterest":
      return "image";
    case "tiktok":
    case "vimeo":
    case "youtube":
      return "video";
    case "facebook":
    case "instagram":
    case "reddit":
    case "threads":
    case "x":
      return "social_post";
    default:
      return null;
  }
}

export const domainEvidenceProfiles: Record<string, DomainEvidenceProfile> = {
  youtube: {
    genericTitlePatterns: [
      /^-?\s*youtube\s*$/i,
      /^youtube\s*-\s*$/i,
    ],
    genericDescriptionPatterns: [
      /^enjoy the videos and music you love, upload original content, and share it all with friends, family, and the world on youtube\.?$/i,
    ],
    shellTextPatterns: [
      /about press copyright contact us creators advertise developers terms privacy policy & safety how youtube works/i,
      /new features nfl sunday ticket/i,
      /window\.ytatn|ytcfg\.set|ytInitialData/i,
    ],
    invalidCanonicalPatterns: [
      /\/(?:undefined|null)(?:[?#/]|$)/i,
    ],
    preferredSourcePattern: /oembed/i,
  },
  tiktok: {
    genericTitlePatterns: [
      /^tiktok\s*$/i,
      /^tiktok\s*-\s*make your day\s*$/i,
      /^make your day\s*$/i,
    ],
    genericDescriptionPatterns: [
      /^tiktok\s*-\s*trends start here\.?/i,
      /^watch short videos about/i,
      /^make your day/i,
    ],
    shellTextPatterns: [
      /log in to follow creators/i,
      /watch videos from creators you love/i,
      /download the app to discover new creators/i,
    ],
    invalidCanonicalPatterns: [
      /\/(?:undefined|null)(?:[?#/]|$)/i,
    ],
    preferredSourcePattern: /oembed/i,
  },
  instagram: {
    genericTitlePatterns: [
      /^instagram\s*$/i,
      /^login\s*•\s*instagram\s*$/i,
      /^instagram\s*-\s*login\s*$/i,
    ],
    genericDescriptionPatterns: [
      /^create an account or log in to instagram/i,
      /^share what you're into with the people who get you/i,
      /^log in to instagram/i,
    ],
    shellTextPatterns: [
      /create an account or log in to instagram/i,
      /sign up to see photos and videos/i,
      /from friends, family and interests around the world/i,
    ],
    invalidCanonicalPatterns: [
      /\/(?:undefined|null)(?:[?#/]|$)/i,
    ],
    preferredSourcePattern: /oembed/i,
  },
};

export function evidencePlatform(evidence: UrlEvidence | null) {
  if (!evidence) return null;
  return platformForUrl(
    evidence.sourceUrl || evidence.finalUrl || evidence.canonical,
  );
}

export function evidenceDomainProfile(evidence: UrlEvidence | null) {
  const platform = evidencePlatform(evidence);
  return platform ? domainEvidenceProfiles[platform] || null : null;
}

export function matchesAnyPattern(
  value: string | null | undefined,
  patterns: RegExp[] | undefined,
) {
  const text = String(value || "").trim();
  return Boolean(text && patterns?.some((pattern) => pattern.test(text)));
}

export function domainGenericTitle(evidence: UrlEvidence | null) {
  return matchesAnyPattern(
    evidence?.title,
    evidenceDomainProfile(evidence)?.genericTitlePatterns,
  );
}

export function evidenceTitleIsGeneric(evidence: UrlEvidence | null) {
  return genericTitle(evidence?.title) || domainGenericTitle(evidence);
}

export function domainGenericDescription(evidence: UrlEvidence | null) {
  return matchesAnyPattern(
    evidence?.description,
    evidenceDomainProfile(evidence)?.genericDescriptionPatterns,
  );
}

export function domainShellText(evidence: UrlEvidence | null) {
  return matchesAnyPattern(
    evidence?.text,
    evidenceDomainProfile(evidence)?.shellTextPatterns,
  );
}

export function invalidDomainCanonical(evidence: UrlEvidence | null) {
  return matchesAnyPattern(
    evidence?.canonical,
    evidenceDomainProfile(evidence)?.invalidCanonicalPatterns,
  );
}

export function canonicalUrlForEvidence(evidence: UrlEvidence | null) {
  if (!evidence?.canonical || invalidDomainCanonical(evidence)) return null;
  return evidence.canonical;
}

export function substantiveDescription(evidence: UrlEvidence | null) {
  return Boolean(evidence?.description && !domainGenericDescription(evidence));
}

export function substantiveText(evidence: UrlEvidence | null) {
  return Boolean(
    evidence?.text && evidence.text.length >= 180 && !domainShellText(evidence),
  );
}

export function preferredDomainSource(evidence: UrlEvidence | null) {
  const pattern = evidenceDomainProfile(evidence)?.preferredSourcePattern;
  return Boolean(pattern && evidence?.source && pattern.test(evidence.source));
}

export function contentTypeGuess(evidence: UrlEvidence | null) {
  if (!evidence) return null;
  const type = String(evidence.type || "").toLowerCase();
  const url = evidence.finalUrl || evidence.sourceUrl;
  if (
    /video|movie|reel|short/i.test(type) || evidence.video ||
    /\.(mp4|m4v|mov|webm)(?:[?#].*)?$/i.test(url)
  ) return "video";
  if (
    /product|offer/i.test(type) ||
    evidence.entities.some((entity) =>
      entity.type === "price" || entity.type === "brand"
    )
  ) return "product";
  if (/recipe/i.test(type)) return "recipe";
  if (
    /event/i.test(type) ||
    evidence.entities.some((entity) => entity.type === "date")
  ) return "event";
  if (
    /place|localbusiness|restaurant|store/i.test(type) ||
    evidence.entities.some((entity) => entity.type === "place")
  ) return "place";
  if (/article|news|blog|posting/i.test(type)) return "article";
  const platformType = contentTypeForPlatform(platformForUrl(url));
  if (platformType) return platformType;
  return evidence.title || evidence.description || evidence.text
    ? "web_page"
    : null;
}

export function genericTitle(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return true;
  return [
    "instagram",
    "tiktok",
    "reddit",
    "x",
    "facebook",
    "login",
    "log in",
    "sign in",
    "just a moment...",
    "just a moment",
    "attention required!",
    "access denied",
    "forbidden",
    "not found",
    "error",
    "enable javascript",
    "this content is unavailable",
  ].includes(normalized);
}
