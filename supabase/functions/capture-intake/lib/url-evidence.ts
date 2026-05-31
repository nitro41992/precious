import { extract as extractProviderOembed } from "@extractus/oembed-extractor";
import { extract as extractOpenLink, parse as parseOpenLink } from "openlink";
import { adminClient } from "./supabase.ts";
import {
  CACHE_ERROR_TTL_MS,
  CACHE_STRONG_TTL_MS,
  CACHE_WEAK_TTL_MS,
  CLIENT_RESOLUTION_MESSAGE,
  INSUFFICIENT_URL_MESSAGE,
  METADATA_MAX_BYTES,
  METADATA_TIMEOUT_MS,
  USER_AGENT,
} from "./config.ts";
import {
  absoluteUrl,
  cleanedString,
  decodeHtml,
  errorMessage,
  hostFromUrl,
  normalizedHost,
  normalizeUrl,
  sha256Hex,
  stringValue,
} from "./common.ts";
import type {
  ClientResolutionInput,
  DomainEvidenceProfile,
  EvidenceQuality,
  LlMUrlEvidence,
  ProductUrlEvidenceStatus,
  UrlEvidence,
} from "./types.ts";

export const TRACKING_PARAMS = [
  "fbclid",
  "gclid",
  "dclid",
  "gbraid",
  "wbraid",
  "igsh",
  "igshid",
  "mc_cid",
  "mc_eid",
  "mibextid",
  "msclkid",
  "ref",
  "ref_",
  "ref_src",
  "si",
  "spm",
  "src",
  "tag",
  "utm",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
];

export function trackingCleanUrl(value: string | null | undefined) {
  const normalized = normalizeUrl(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    for (const key of Array.from(url.searchParams.keys())) {
      const lower = key.toLowerCase();
      if (
        lower.startsWith("utm_") ||
        TRACKING_PARAMS.includes(lower) ||
        lower.startsWith("amp_")
      ) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return normalized;
  }
}

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

export function parseAttrs(value: string) {
  const attrs: Record<string, string> = {};
  for (
    const match of value.matchAll(
      /([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g,
    )
  ) {
    attrs[match[1].toLowerCase()] = decodeHtml(
      match[3] ?? match[4] ?? match[5] ?? "",
    );
  }
  return attrs;
}

export function firstMeta(html: string, keys: string[]) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  for (const match of html.matchAll(/<meta\b([^>]+)>/gi)) {
    const attrs = parseAttrs(match[1]);
    const name = String(attrs.property || attrs.name || attrs.itemprop || "")
      .toLowerCase();
    if (wanted.has(name) && attrs.content) return attrs.content;
  }
  return null;
}

export function allMeta(html: string, keys: string[]) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const values: string[] = [];
  for (const match of html.matchAll(/<meta\b([^>]+)>/gi)) {
    const attrs = parseAttrs(match[1]);
    const name = String(attrs.property || attrs.name || attrs.itemprop || "")
      .toLowerCase();
    if (wanted.has(name) && attrs.content) values.push(attrs.content);
  }
  return values;
}

export function firstLink(
  html: string,
  rels: string[],
  baseUrl: string,
  typePredicate?: (type: string) => boolean,
) {
  const wanted = rels.map((rel) => rel.toLowerCase());
  for (const match of html.matchAll(/<link\b([^>]+)>/gi)) {
    const attrs = parseAttrs(match[1]);
    const rel = String(attrs.rel || "").toLowerCase();
    if (
      !attrs.href || !wanted.some((item) => rel.split(/\s+/).includes(item))
    ) continue;
    if (
      typePredicate && !typePredicate(String(attrs.type || "").toLowerCase())
    ) continue;
    return absoluteUrl(attrs.href, baseUrl);
  }
  return null;
}

export function firstTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return decodeHtml(match?.[1] || "");
}

export function stripHtmlForText(html: string) {
  return decodeHtml(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).slice(0, 2400);
}

export function jsonLdCandidates(html: string): Array<Record<string, unknown>> {
  const candidates: Array<Record<string, unknown>> = [];
  const add = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }
    const record = value as Record<string, unknown>;
    if (Array.isArray(record["@graph"])) record["@graph"].forEach(add);
    candidates.push(record);
  };
  for (
    const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)
  ) {
    const attrs = parseAttrs(match[1]);
    if (!String(attrs.type || "").toLowerCase().includes("ld+json")) continue;
    try {
      add(JSON.parse(match[2].trim()));
    } catch {
      // Ignore malformed JSON-LD.
    }
  }
  return candidates.slice(0, 12);
}

export function firstJsonLdValue(
  value: unknown,
  keys: string[],
): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = firstJsonLdValue(item, keys);
      if (result) return result;
    }
    return null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      const result = firstJsonLdValue(record[key], keys);
      if (result) return result;
    }
  }
  return null;
}

export function imageFromJsonLd(value: unknown, baseUrl: string) {
  const image = firstJsonLdValue(value, ["url", "contentUrl", "image"]);
  return absoluteUrl(image, baseUrl);
}

export function jsonLdType(value: Record<string, unknown> | null) {
  if (!value) return null;
  const type = value["@type"];
  if (Array.isArray(type)) return type.map(String).join(", ");
  return stringValue(type);
}

export function jsonLdEntities(candidates: Array<Record<string, unknown>>) {
  const entities: UrlEvidence["entities"] = [];
  for (const item of candidates) {
    const type = jsonLdType(item);
    const name = stringValue(item.name) || stringValue(item.headline);
    if (type && name) entities.push({ type, name });
    const brand = firstJsonLdValue(item.brand, ["name"]);
    if (brand) entities.push({ type: "brand", name: brand });
    const offers = item.offers;
    if (offers && typeof offers === "object") {
      const offer = Array.isArray(offers) ? offers[0] : offers;
      const record = offer as Record<string, unknown>;
      const price = [record.priceCurrency, record.price].filter(Boolean).join(
        " ",
      );
      if (price.trim()) {
        entities.push({
          type: "price",
          name: price.trim(),
          value: price.trim(),
        });
      }
    }
    const location = firstJsonLdValue(item.location, ["name", "address"]);
    if (location) entities.push({ type: "place", name: location });
    const startDate = stringValue(item.startDate);
    if (startDate) {
      entities.push({ type: "date", name: startDate, value: startDate });
    }
  }
  const seen = new Set<string>();
  return entities.filter((entity) => {
    const key = `${entity.type}:${entity.name}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

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

export function isPrivateHostname(hostname: string) {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" || host.endsWith(".localhost") ||
    host.endsWith(".local")
  ) return true;
  return isPrivateAddress(host);
}

export function isPrivateAddress(value: string) {
  const host = value.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "0.0.0.0" ||
    host === "127.0.0.1" ||
    host === "::" ||
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:")
  ) {
    return true;
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const parts = ipv4.slice(1).map(Number);
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 0
  );
}

export async function assertFetchableUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https URLs are supported");
  }
  if (url.username || url.password) {
    throw new Error("Credentialed URLs are not supported");
  }
  if (isPrivateHostname(url.hostname)) {
    throw new Error("Private URLs are not supported");
  }
  if (
    !/^\[?[0-9a-f:.]+\]?$/i.test(url.hostname) &&
    typeof Deno.resolveDns === "function"
  ) {
    const records = await Promise.all([
      Deno.resolveDns(url.hostname, "A").catch(() => [] as string[]),
      Deno.resolveDns(url.hostname, "AAAA").catch(() => [] as string[]),
    ]);
    if (records.flat().some((address) => isPrivateAddress(address))) {
      throw new Error("Private URLs are not supported");
    }
  }
}

export function concatChunks(chunks: Uint8Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function fetchTextLimited(sourceUrl: string, options: {
  accept?: string;
  htmlOnly?: boolean;
  maxBytes?: number;
  timeoutMs?: number;
} = {}) {
  let current = normalizeUrl(sourceUrl);
  if (!current) throw new Error("Invalid URL");
  for (let redirect = 0; redirect <= 4; redirect += 1) {
    await assertFetchableUrl(current);
    const response: Response = await fetch(current, {
      redirect: "manual",
      headers: {
        accept: options.accept ||
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(options.timeoutMs || METADATA_TIMEOUT_MS),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location: string | null = response.headers.get("location");
      if (!location) throw new Error("Redirect without location");
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok) {
      throw new Error(`Metadata fetch failed with ${response.status}`);
    }
    const contentType = response.headers.get("content-type") || "";
    if (
      options.htmlOnly !== false &&
      !/text\/html|application\/xhtml\+xml/i.test(contentType)
    ) {
      throw new Error(
        `Unsupported metadata content-type: ${contentType || "unknown"}`,
      );
    }
    const reader = response.body?.getReader();
    if (!reader) {
      return { text: await response.text(), finalUrl: current, contentType };
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > (options.maxBytes || METADATA_MAX_BYTES)) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    return {
      text: new TextDecoder().decode(concatChunks(chunks)),
      finalUrl: current,
      contentType,
    };
  }
  throw new Error("Too many redirects");
}

export async function resolveUrlLimited(sourceUrl: string) {
  let current = normalizeUrl(sourceUrl);
  if (!current) throw new Error("Invalid URL");
  for (let redirect = 0; redirect <= 6; redirect += 1) {
    await assertFetchableUrl(current);
    const response: Response = await fetch(current, {
      redirect: "manual",
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location: string | null = response.headers.get("location");
      if (!location) throw new Error("Redirect without location");
      current = new URL(location, current).toString();
      continue;
    }
    return {
      finalUrl: current,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
    };
  }
  throw new Error("Too many redirects");
}

export function mapsProviderForUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (/maps\.app\.goo\.gl$|maps\.google\./i.test(host)) return "google_maps";
    if (
      /^google\.[^/]+$/i.test(host) && /^\/maps(?:\/|$)/i.test(url.pathname)
    ) return "google_maps";
    if (/maps\.apple\.com$|(^|\.)maps\.apple$/i.test(host)) return "apple_maps";
  } catch {
    return null;
  }
  return null;
}

export function coordinateFromText(value: string | null | undefined) {
  const match = String(value || "").match(
    /(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/,
  );
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (
    !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) return null;
  return `${lat},${lng}`;
}

export function decodedParam(url: URL, keys: string[]) {
  for (const key of keys) {
    const value = url.searchParams.get(key);
    if (value?.trim()) return value.trim();
  }
  return null;
}

export function googleMapsEntities(finalUrl: string) {
  const url = new URL(finalUrl);
  const entities: UrlEvidence["entities"] = [];
  const placeMatch = decodeURIComponent(url.pathname).match(
    /\/maps\/place\/([^/]+)/i,
  );
  const placeName = placeMatch?.[1]?.replace(/\+/g, " ").trim();
  if (placeName) entities.push({ type: "place", name: placeName });

  const query = decodedParam(url, ["q", "query", "destination", "daddr"]);
  if (query && !coordinateFromText(query)) {
    entities.push({ type: "map_query", name: query });
  }

  const coordinates = coordinateFromText(
    url.pathname.match(/@(-?\d{1,3}\.\d+,-?\d{1,3}\.\d+)/)?.[1],
  ) ||
    coordinateFromText(
      url.pathname.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/)?.slice(1)
        .join(","),
    ) ||
    coordinateFromText(
      decodedParam(url, ["ll", "center", "q", "query", "destination", "daddr"]),
    );
  if (coordinates) {
    entities.push({
      type: "coordinates",
      name: coordinates,
      value: coordinates,
    });
  }

  const placeId = decodedParam(url, [
    "query_place_id",
    "destination_place_id",
    "place_id",
    "ftid",
  ]);
  if (placeId) {
    entities.push({ type: "place_id", name: placeId, value: placeId });
  }

  const cid = decodedParam(url, ["cid", "ludocid"]);
  if (cid) entities.push({ type: "place_cid", name: cid, value: cid });
  return dedupeEntities(entities);
}

export function appleMapsEntities(finalUrl: string) {
  const url = new URL(finalUrl);
  const entities: UrlEvidence["entities"] = [];
  const query = decodedParam(url, ["q", "daddr", "saddr"]);
  if (query && !coordinateFromText(query)) {
    entities.push({ type: "place", name: query });
  }
  const address = decodedParam(url, ["address"]);
  if (address) entities.push({ type: "address", name: address });
  const coordinates = coordinateFromText(
    decodedParam(url, ["ll", "center", "coordinate", "q", "daddr", "saddr"]),
  );
  if (coordinates) {
    entities.push({
      type: "coordinates",
      name: coordinates,
      value: coordinates,
    });
  }
  return dedupeEntities(entities);
}

export function dedupeEntities(entities: UrlEvidence["entities"]) {
  const seen = new Set<string>();
  return entities.filter((entity) => {
    const key = `${entity.type}:${entity.name}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

export function mapEvidenceTitle(
  provider: string,
  entities: UrlEvidence["entities"],
) {
  const place = entities.find((entity) =>
    ["place", "map_query", "address"].includes(entity.type)
  );
  if (place) {
    return `${
      provider === "apple_maps" ? "Apple Maps" : "Google Maps"
    } - ${place.name}`;
  }
  const coordinates = entities.find((entity) => entity.type === "coordinates");
  if (coordinates) {
    return `${
      provider === "apple_maps" ? "Apple Maps" : "Google Maps"
    } - ${coordinates.name}`;
  }
  return null;
}

export async function fetchMapsEvidence(sourceUrl: string) {
  const provider = mapsProviderForUrl(sourceUrl);
  if (!provider) return null;
  try {
    const resolved = await resolveUrlLimited(sourceUrl);
    const finalUrl = resolved.finalUrl;
    const entities = provider === "apple_maps"
      ? appleMapsEntities(finalUrl)
      : googleMapsEntities(finalUrl);
    const title = mapEvidenceTitle(provider, entities);
    return {
      ...emptyUrlEvidence(
        sourceUrl,
        entities.length ? "success" : "empty",
        "maps_url",
        entities.length
          ? null
          : "No parseable map place, query, or coordinates found",
      ),
      confidence: entities.some((entity) =>
          entity.type === "place" || entity.type === "place_id"
        )
        ? 0.82
        : entities.length
        ? 0.62
        : 0,
      finalUrl,
      canonical: finalUrl,
      host: hostFromUrl(finalUrl),
      provider,
      siteName: provider === "apple_maps" ? "Apple Maps" : "Google Maps",
      type: "place",
      title,
      description: title
        ? `Resolved ${
          provider === "apple_maps" ? "Apple Maps" : "Google Maps"
        } link.`
        : null,
      entities,
      raw: {
        resolved_status: resolved.status,
        resolved_content_type: resolved.contentType,
        parser: provider,
      },
    } satisfies UrlEvidence;
  } catch (error) {
    return emptyUrlEvidence(
      sourceUrl,
      "failed",
      "maps_url",
      errorMessage(error, "Map URL resolution failed"),
    );
  }
}

export function pathSegment(value: string | undefined) {
  return value ? decodeURIComponent(value).trim() : "";
}

export function youtubeVideoIdFromUrl(url: URL) {
  const host = normalizedHost(url);
  const segments = url.pathname.split("/").filter(Boolean);
  if (host === "youtu.be") return pathSegment(segments[0]);
  if (
    host === "youtube.com" || host === "m.youtube.com" ||
    host === "music.youtube.com"
  ) {
    if (url.searchParams.get("v")) return url.searchParams.get("v")?.trim();
    if (["shorts", "embed", "live"].includes(segments[0])) {
      return pathSegment(segments[1]);
    }
  }
  return null;
}

export function youtubeCanonicalCandidate(url: URL) {
  const videoId = youtubeVideoIdFromUrl(url);
  if (videoId && /^[a-zA-Z0-9_-]{6,}$/.test(videoId)) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  }
  const listId = url.searchParams.get("list")?.trim();
  if (listId && /^[a-zA-Z0-9_-]{6,}$/.test(listId)) {
    return `https://www.youtube.com/playlist?list=${
      encodeURIComponent(listId)
    }`;
  }
  return null;
}

export function tiktokCanonicalCandidate(url: URL) {
  const host = normalizedHost(url);
  if (host !== "tiktok.com" && !host?.endsWith(".tiktok.com")) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const videoIndex = segments.findIndex((segment) => segment === "video");
  const videoId = videoIndex >= 0 ? pathSegment(segments[videoIndex + 1]) : "";
  const handle = segments.find((segment) => segment.startsWith("@"));
  if (
    handle && /^@[a-zA-Z0-9._-]+$/.test(handle) && /^[0-9]{8,}$/.test(videoId)
  ) {
    return `https://www.tiktok.com/@${
      encodeURIComponent(handle.slice(1))
    }/video/${encodeURIComponent(videoId)}`;
  }
  return trackingCleanUrl(url.toString());
}

export function instagramCanonicalCandidate(url: URL) {
  const host = normalizedHost(url);
  if (host !== "instagram.com" && !host?.endsWith(".instagram.com")) {
    return null;
  }
  const segments = url.pathname.split("/").filter(Boolean);
  const kind = segments[0];
  const code = pathSegment(segments[1]);
  if (["p", "reel", "tv"].includes(kind) && /^[a-zA-Z0-9_-]{5,}$/.test(code)) {
    return `https://www.instagram.com/${kind}/${encodeURIComponent(code)}/`;
  }
  return trackingCleanUrl(url.toString());
}

export function threadsCanonicalCandidate(url: URL) {
  const host = normalizedHost(url);
  if (host !== "threads.net" && !host?.endsWith(".threads.net")) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const postIndex = segments.findIndex((segment) => segment === "post");
  const handle = segments.find((segment) => segment.startsWith("@"));
  const code = postIndex >= 0 ? pathSegment(segments[postIndex + 1]) : "";
  if (
    handle && /^@[a-zA-Z0-9._-]+$/.test(handle) &&
    /^[a-zA-Z0-9_-]{5,}$/.test(code)
  ) {
    return `https://www.threads.net/@${
      encodeURIComponent(handle.slice(1))
    }/post/${encodeURIComponent(code)}`;
  }
  return trackingCleanUrl(url.toString());
}

export function facebookCanonicalCandidate(url: URL) {
  const host = normalizedHost(url);
  if (
    host !== "facebook.com" && host !== "fb.watch" && host !== "fb.com" &&
    !host?.endsWith(".facebook.com")
  ) return null;
  return trackingCleanUrl(url.toString());
}

export function redditCanonicalCandidate(url: URL) {
  const host = normalizedHost(url);
  if (host !== "reddit.com" && !host?.endsWith(".reddit.com")) return null;
  const segments = url.pathname.split("/").filter(Boolean).map(pathSegment);
  const commentsIndex = segments.findIndex((segment) => segment === "comments");
  if (commentsIndex >= 0 && segments[commentsIndex + 1]) {
    const postId = segments[commentsIndex + 1];
    const subredditIndex = commentsIndex >= 2 && segments[commentsIndex - 2] ===
        "r"
      ? commentsIndex - 1
      : -1;
    const subreddit = subredditIndex >= 0 ? segments[subredditIndex] : "";
    const slug = segments[commentsIndex + 2];
    if (subreddit) {
      return `https://www.reddit.com/r/${
        encodeURIComponent(subreddit)
      }/comments/${encodeURIComponent(postId)}/${
        slug ? `${encodeURIComponent(slug)}/` : ""
      }`;
    }
    return `https://www.reddit.com/comments/${encodeURIComponent(postId)}/`;
  }
  return trackingCleanUrl(url.toString())?.replace(
    /^https:\/\/(?:old|new|m)\.reddit\.com/i,
    "https://www.reddit.com",
  ) || null;
}

export function xCanonicalCandidate(url: URL) {
  const host = normalizedHost(url);
  if (
    host !== "x.com" && host !== "twitter.com" && host !== "mobile.twitter.com"
  ) {
    return null;
  }
  const segments = url.pathname.split("/").filter(Boolean).map(pathSegment);
  const statusIndex = segments.findIndex((segment) =>
    ["status", "statuses"].includes(segment)
  );
  const id = statusIndex >= 0 ? segments[statusIndex + 1] : "";
  if (/^[0-9]{6,}$/.test(id)) {
    const user = statusIndex > 0 && !["i", "intent"].includes(segments[0])
      ? segments[0]
      : "i";
    return user === "i"
      ? `https://x.com/i/web/status/${encodeURIComponent(id)}`
      : `https://x.com/${encodeURIComponent(user)}/status/${
        encodeURIComponent(id)
      }`;
  }
  return trackingCleanUrl(url.toString())?.replace(
    /^https:\/\/(?:mobile\.)?twitter\.com/i,
    "https://x.com",
  ) || null;
}

export function vimeoCanonicalCandidate(url: URL) {
  const host = normalizedHost(url);
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const videoIndex = segments.findIndex((segment) => segment === "video");
  const videoId = host === "player.vimeo.com"
    ? pathSegment(segments[videoIndex + 1])
    : pathSegment(segments.find((segment) => /^[0-9]+$/.test(segment)));
  if (/^[0-9]{5,}$/.test(videoId)) {
    return `https://vimeo.com/${encodeURIComponent(videoId)}`;
  }
  return trackingCleanUrl(url.toString());
}

export function spotifyCanonicalCandidate(url: URL) {
  const host = normalizedHost(url);
  if (host !== "open.spotify.com") return null;
  const segments = url.pathname.split("/").filter(Boolean).map(pathSegment);
  const offset = /^intl-[a-z]{2,}$/i.test(segments[0]) ? 1 : 0;
  const kind = segments[offset];
  const id = segments[offset + 1];
  if (
    ["track", "album", "artist", "playlist", "episode", "show"].includes(
      kind,
    ) &&
    /^[a-zA-Z0-9]{8,}$/.test(id)
  ) {
    return `https://open.spotify.com/${kind}/${encodeURIComponent(id)}`;
  }
  return trackingCleanUrl(url.toString());
}

export function soundCloudCanonicalCandidate(url: URL) {
  const host = normalizedHost(url);
  if (host !== "soundcloud.com" && !host?.endsWith(".soundcloud.com")) {
    return null;
  }
  return trackingCleanUrl(url.toString());
}

export function pinterestCanonicalCandidate(url: URL) {
  const host = normalizedHost(url);
  if (host !== "pinterest.com" && !host?.endsWith(".pinterest.com")) {
    return null;
  }
  const segments = url.pathname.split("/").filter(Boolean).map(pathSegment);
  const pinIndex = segments.findIndex((segment) => segment === "pin");
  const pinId = pinIndex >= 0 ? segments[pinIndex + 1] : "";
  if (/^[0-9]{6,}$/.test(pinId)) {
    return `https://www.pinterest.com/pin/${encodeURIComponent(pinId)}/`;
  }
  return trackingCleanUrl(url.toString());
}

export function amazonCanonicalCandidate(url: URL) {
  const host = normalizedHost(url);
  if (!host || !/(^|\.)amazon\./i.test(host)) return null;
  const asinMatch = decodeURIComponent(url.pathname).match(
    /\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})(?:[/?]|$)/i,
  );
  const asin = asinMatch?.[1]?.toUpperCase();
  if (!asin) return trackingCleanUrl(url.toString());
  const regionalHost = host.replace(/^smile\./, "").replace(/^www\./, "");
  return `https://www.${regionalHost}/dp/${encodeURIComponent(asin)}`;
}

export function appleMusicCanonicalCandidate(url: URL) {
  const host = normalizedHost(url);
  if (host !== "music.apple.com") return null;
  const cleaned = new URL(url.toString());
  const trackId = cleaned.searchParams.get("i");
  for (const key of Array.from(cleaned.searchParams.keys())) {
    if (key !== "i") cleaned.searchParams.delete(key);
  }
  if (trackId) cleaned.searchParams.set("i", trackId);
  cleaned.hash = "";
  return cleaned.toString();
}

export function tier1CanonicalCandidates(value: string | null | undefined) {
  const normalized = normalizeUrl(value);
  if (!normalized) return [];
  const candidates: Array<string | null> = [trackingCleanUrl(normalized)];
  try {
    const url = new URL(normalized);
    const host = normalizedHost(url);
    if (
      host === "youtu.be" || host === "youtube.com" ||
      host?.endsWith(".youtube.com")
    ) {
      candidates.push(youtubeCanonicalCandidate(url));
    } else if (host === "tiktok.com" || host?.endsWith(".tiktok.com")) {
      candidates.push(tiktokCanonicalCandidate(url));
    } else if (host === "instagram.com" || host?.endsWith(".instagram.com")) {
      candidates.push(instagramCanonicalCandidate(url));
    } else if (host === "threads.net" || host?.endsWith(".threads.net")) {
      candidates.push(threadsCanonicalCandidate(url));
    } else if (
      host === "facebook.com" || host === "fb.watch" || host === "fb.com" ||
      host?.endsWith(".facebook.com")
    ) {
      candidates.push(facebookCanonicalCandidate(url));
    } else if (host === "reddit.com" || host?.endsWith(".reddit.com")) {
      candidates.push(redditCanonicalCandidate(url));
    } else if (
      host === "x.com" || host === "twitter.com" ||
      host === "mobile.twitter.com"
    ) {
      candidates.push(xCanonicalCandidate(url));
    } else if (host === "vimeo.com" || host === "player.vimeo.com") {
      candidates.push(vimeoCanonicalCandidate(url));
    } else if (host === "open.spotify.com") {
      candidates.push(spotifyCanonicalCandidate(url));
    } else if (host === "soundcloud.com" || host?.endsWith(".soundcloud.com")) {
      candidates.push(soundCloudCanonicalCandidate(url));
    } else if (
      host === "pinterest.com" || host?.endsWith(".pinterest.com")
    ) {
      candidates.push(pinterestCanonicalCandidate(url));
    } else if (/(^|\.)amazon\./i.test(host || "")) {
      candidates.push(amazonCanonicalCandidate(url));
    } else if (host === "music.apple.com") {
      candidates.push(appleMusicCanonicalCandidate(url));
    }
  } catch {
    // Ignore malformed candidates; the original URL remains in the pipeline.
  }
  return uniqueUrls(candidates).filter((candidate) => candidate !== normalized);
}

export function oembedEndpoint(value: string) {
  try {
    const url = new URL(value);
    const host = normalizedHost(url);
    if (
      host === "youtube.com" || host === "m.youtube.com" ||
      host === "youtu.be" || host === "music.youtube.com"
    ) {
      return `https://www.youtube.com/oembed?format=json&url=${
        encodeURIComponent(value)
      }`;
    }
    if (host === "reddit.com" || host?.endsWith(".reddit.com")) {
      return `https://www.reddit.com/oembed?format=json&url=${
        encodeURIComponent(value)
      }`;
    }
    if (host === "tiktok.com" || host?.endsWith(".tiktok.com")) {
      return `https://www.tiktok.com/oembed?url=${encodeURIComponent(value)}`;
    }
    if (
      host === "x.com" || host === "twitter.com" ||
      host === "mobile.twitter.com"
    ) {
      return `https://publish.x.com/oembed?omit_script=true&url=${
        encodeURIComponent(value)
      }`;
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      return `https://vimeo.com/api/oembed.json?url=${
        encodeURIComponent(value)
      }`;
    }
    if (host === "open.spotify.com" || host === "spotify.link") {
      return `https://open.spotify.com/oembed?url=${encodeURIComponent(value)}`;
    }
    if (host === "soundcloud.com" || host?.endsWith(".soundcloud.com")) {
      return `https://soundcloud.com/oembed?format=json&url=${
        encodeURIComponent(value)
      }`;
    }
  } catch {
    return null;
  }
  return null;
}

export function redditPostIdFromUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (host !== "reddit.com" && !host.endsWith(".reddit.com")) return null;
    const match = url.pathname.match(/(?:^|\/)comments\/([a-z0-9]+)(?:\/|$)/i);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

export function redditJsonEndpoint(value: string | null | undefined) {
  const postId = redditPostIdFromUrl(value);
  return postId ? `https://www.reddit.com/comments/${postId}.json` : null;
}

export function numberEntity(type: string, value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue)
    ? { type, name: String(numberValue), value: String(numberValue) }
    : null;
}

export function redditJsonMetadata(
  data: unknown,
  sourceUrl: string,
  finalUrl: string | null,
): UrlEvidence | null {
  if (!Array.isArray(data)) return null;
  const post = data[0]?.data?.children?.[0]?.data;
  if (!post || typeof post !== "object") return null;
  const title = stringValue(post.title);
  if (!title) return null;
  const permalink =
    absoluteUrl(stringValue(post.permalink), "https://www.reddit.com") ||
    finalUrl || sourceUrl;
  const subreddit = stringValue(post.subreddit_name_prefixed) ||
    (stringValue(post.subreddit) ? `r/${post.subreddit}` : null);
  const author = stringValue(post.author);
  const selftext = stringValue(post.selftext);
  const externalUrl = stringValue(post.url_overridden_by_dest) ||
    stringValue(post.url);
  const image = absoluteUrl(stringValue(post.thumbnail), permalink) ||
    absoluteUrl(stringValue(post.preview?.images?.[0]?.source?.url), permalink);
  const entities = [
    subreddit ? { type: "community", name: subreddit } : null,
    author ? { type: "author", name: `u/${author}` } : null,
    numberEntity("score", post.ups),
    numberEntity("comments", post.num_comments),
  ].filter(Boolean) as UrlEvidence["entities"];
  const description = [
    selftext,
    externalUrl && externalUrl !== permalink
      ? `Linked URL: ${externalUrl}`
      : null,
  ].filter(Boolean).join("\n").slice(0, 1200) || null;
  const text = [
    title,
    selftext,
    subreddit ? `Community: ${subreddit}` : null,
    author ? `Author: u/${author}` : null,
    Number.isFinite(Number(post.num_comments))
      ? `Comments: ${post.num_comments}`
      : null,
    Number.isFinite(Number(post.ups)) ? `Score: ${post.ups}` : null,
  ].filter(Boolean).join("\n").slice(0, 2400) || null;
  return {
    ...emptyUrlEvidence(sourceUrl, "success", "reddit_json"),
    confidence: selftext ? 0.92 : 0.86,
    finalUrl,
    canonical: permalink,
    host: hostFromUrl(permalink),
    provider: "reddit",
    siteName: "Reddit",
    type: "social_post",
    title: title.slice(0, 300),
    description,
    image,
    authorName: author ? `u/${author}` : null,
    authorUrl: author ? `https://www.reddit.com/user/${author}/` : null,
    publishedAt: Number.isFinite(Number(post.created_utc))
      ? new Date(Number(post.created_utc) * 1000).toISOString()
      : null,
    text,
    entities: dedupeEntities(entities),
    raw: {
      subreddit,
      post_id: stringValue(post.id),
      name: stringValue(post.name),
      permalink,
      ups: Number.isFinite(Number(post.ups)) ? Number(post.ups) : null,
      num_comments: Number.isFinite(Number(post.num_comments))
        ? Number(post.num_comments)
        : null,
      upvote_ratio: Number.isFinite(Number(post.upvote_ratio))
        ? Number(post.upvote_ratio)
        : null,
      over_18: Boolean(post.over_18),
      external_url: externalUrl || null,
    },
  };
}

export async function fetchRedditJsonEvidence(
  sourceUrl: string,
  finalUrl: string | null,
) {
  const endpoint = redditJsonEndpoint(finalUrl) ||
    redditJsonEndpoint(sourceUrl);
  if (!endpoint) return null;
  const { text } = await fetchTextLimited(endpoint, {
    accept: "application/json",
    htmlOnly: false,
    maxBytes: 180_000,
  });
  return redditJsonMetadata(JSON.parse(text), sourceUrl, finalUrl);
}

export function metaOembedEndpoint(value: string) {
  const token = Deno.env.get("META_OEMBED_ACCESS_TOKEN") ||
    Deno.env.get("INSTAGRAM_OEMBED_ACCESS_TOKEN");
  if (!token) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "instagram.com" || host.endsWith(".instagram.com")) {
      return `https://graph.facebook.com/v23.0/instagram_oembed?url=${
        encodeURIComponent(value)
      }&access_token=${encodeURIComponent(token)}`;
    }
    if (host === "facebook.com" || host.endsWith(".facebook.com")) {
      return `https://graph.facebook.com/v23.0/oembed_post?url=${
        encodeURIComponent(value)
      }&access_token=${encodeURIComponent(token)}`;
    }
  } catch {
    return null;
  }
  return null;
}

export function oembedMetadata(
  data: Record<string, unknown>,
  sourceUrl: string,
): UrlEvidence | null {
  const provider = stringValue(data.provider_name) || "oembed";
  const authorName = stringValue(data.author_name);
  const htmlText = stripHtmlForText(stringValue(data.html) || "");
  const title = stringValue(data.title) ||
    (htmlText ? htmlText.slice(0, 180) : null) ||
    (authorName ? `${provider} by ${authorName}` : null);
  const description = stringValue(data.description)?.slice(0, 1200) ||
    (htmlText && htmlText !== title ? htmlText.slice(0, 1200) : null);
  const image = absoluteUrl(stringValue(data.thumbnail_url), sourceUrl);
  if (!title && !description && !image) return null;
  const text = [
    title,
    description && description !== title ? description : null,
    authorName ? `Author: ${authorName}` : null,
    provider,
  ].filter(Boolean).join("\n").slice(0, 2400) || null;
  const entities = [
    authorName ? { type: "author", name: authorName } : null,
  ].filter(Boolean) as UrlEvidence["entities"];
  return {
    ...emptyUrlEvidence(sourceUrl, "success", "oembed"),
    confidence: 0.9,
    provider,
    siteName: stringValue(data.provider_name),
    type: stringValue(data.type),
    title: title ? title.slice(0, 300) : null,
    description,
    image,
    authorName,
    authorUrl: stringValue(data.author_url),
    text,
    entities: dedupeEntities(entities),
    raw: {
      provider_name: data.provider_name || null,
      provider_url: data.provider_url || null,
      type: data.type || null,
      version: data.version || null,
      thumbnail_url: data.thumbnail_url || null,
      html_text: htmlText ? htmlText.slice(0, 1200) : null,
    },
  };
}

export async function fetchOembedEvidence(
  sourceUrl: string,
  endpoint: string | null,
) {
  if (!endpoint) return null;
  const { text } = await fetchTextLimited(endpoint, {
    accept: "application/json",
    htmlOnly: false,
    maxBytes: 80_000,
  });
  return oembedMetadata(JSON.parse(text), sourceUrl);
}

export async function fetchExtractusOembedEvidence(
  sourceUrl: string,
  targetUrl: string,
) {
  const data = await extractProviderOembed(
    targetUrl,
    {},
    {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
    },
  );
  if (!data || typeof data !== "object") return null;
  const evidence = oembedMetadata(
    data as unknown as Record<string, unknown>,
    sourceUrl,
  );
  return evidence
    ? {
      ...evidence,
      raw: {
        ...evidence.raw,
        extractor: "@extractus/oembed-extractor",
      },
    }
    : null;
}

export function openLinkMetadata(html: string, finalUrl: string) {
  try {
    const parsed = parseOpenLink(html);
    const preview = extractOpenLink(parsed, finalUrl);
    return { parsed, preview };
  } catch (error) {
    console.warn(
      "openlink_parse_failed",
      JSON.stringify({ final_url: finalUrl, error: errorMessage(error) }),
    );
    return null;
  }
}

export function parseHtmlEvidence(
  html: string,
  sourceUrl: string,
  finalUrl: string,
): UrlEvidence | null {
  const openLink = openLinkMetadata(html, finalUrl);
  const openLinkPreview = openLink?.preview;
  const jsonLd = jsonLdCandidates(html);
  const primaryJsonLd =
    jsonLd.find((item) =>
      item && (item.name || item.headline || item.description)
    ) || null;
  const canonical = absoluteUrl(stringValue(openLinkPreview?.url), finalUrl) ||
    firstLink(html, ["canonical"], finalUrl) || finalUrl;
  const title = stringValue(openLinkPreview?.title) ||
    firstMeta(html, ["og:title", "twitter:title"]) ||
    stringValue(primaryJsonLd?.headline) ||
    stringValue(primaryJsonLd?.name) ||
    firstTitle(html);
  const description = stringValue(openLinkPreview?.description) ||
    firstMeta(html, ["og:description", "twitter:description", "description"]) ||
    stringValue(primaryJsonLd?.description);
  const image = absoluteUrl(
    stringValue(openLinkPreview?.image),
    finalUrl,
  ) ||
    absoluteUrl(
      firstMeta(html, [
        "og:image",
        "og:image:url",
        "twitter:image",
        "twitter:image:src",
      ]),
      finalUrl,
    ) ||
    imageFromJsonLd(primaryJsonLd?.image, finalUrl);
  const video = absoluteUrl(
    stringValue(openLinkPreview?.video),
    finalUrl,
  ) ||
    absoluteUrl(
      firstMeta(html, [
        "og:video",
        "og:video:url",
        "og:video:secure_url",
        "twitter:player",
      ]),
      finalUrl,
    ) ||
    null;
  const siteName = stringValue(openLinkPreview?.siteName) ||
    firstMeta(html, ["og:site_name", "application-name"]) ||
    hostFromUrl(finalUrl);
  const authorName = stringValue(openLinkPreview?.author) ||
    firstMeta(html, ["article:author", "author", "twitter:creator"]) ||
    firstJsonLdValue(primaryJsonLd?.author || primaryJsonLd?.creator, [
      "name",
      "author",
      "creator",
    ]);
  const favicon =
    absoluteUrl(stringValue(openLinkPreview?.favicon), finalUrl) ||
    firstLink(html, ["icon"], finalUrl) ||
    firstLink(html, ["shortcut", "apple-touch-icon"], finalUrl) ||
    absoluteUrl("/favicon.ico", finalUrl);
  const text = stripHtmlForText(html);
  const entities = jsonLdEntities(jsonLd);
  if (!title && !description && !image && !video && !text && !entities.length) {
    return null;
  }
  const openLinkHasMetadata = Boolean(
    openLinkPreview?.title || openLinkPreview?.description ||
      openLinkPreview?.image || openLinkPreview?.video ||
      openLinkPreview?.favicon,
  );
  return {
    status: "success",
    source: openLinkHasMetadata
      ? "openlink_html"
      : title || description
      ? "open_graph"
      : "html_metadata",
    confidence: title || description ? 0.75 : 0.45,
    sourceUrl,
    finalUrl,
    canonical,
    host: hostFromUrl(finalUrl),
    provider: siteName || hostFromUrl(finalUrl),
    siteName,
    type: firstMeta(html, ["og:type"]) || jsonLdType(primaryJsonLd),
    title: title ? String(title).slice(0, 300) : null,
    description: description ? String(description).slice(0, 1200) : null,
    image,
    video,
    favicon,
    authorName: authorName ? String(authorName).slice(0, 240) : null,
    authorUrl: null,
    publishedAt: stringValue(openLinkPreview?.publishedTime) ||
      firstMeta(html, ["article:published_time", "date", "datePublished"]) ||
      stringValue(primaryJsonLd?.datePublished),
    modifiedAt: firstMeta(html, ["article:modified_time", "dateModified"]) ||
      stringValue(primaryJsonLd?.dateModified),
    text: text || null,
    entities,
    raw: {
      openlink: openLinkPreview
        ? {
          url: stringValue(openLinkPreview.url),
          title: stringValue(openLinkPreview.title),
          description: stringValue(openLinkPreview.description),
          image: stringValue(openLinkPreview.image),
          favicon: stringValue(openLinkPreview.favicon),
          site_name: stringValue(openLinkPreview.siteName),
          type: stringValue(openLinkPreview.type),
          content_type: stringValue(openLinkPreview.contentType),
        }
        : null,
      metaImages: allMeta(html, ["og:image", "twitter:image"]).slice(0, 4),
      jsonLd: jsonLd.slice(0, 4).map((item) => ({
        type: jsonLdType(item),
        name: stringValue(item.name),
        headline: stringValue(item.headline),
        datePublished: stringValue(item.datePublished),
        dateModified: stringValue(item.dateModified),
      })),
    },
    error: null,
  };
}

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
  ].includes(normalized);
}

export function blockPageText(value: string | null | undefined) {
  const text = String(value || "").toLowerCase();
  return /captcha|cloudflare|enable javascript|access denied|temporarily blocked|sign in to continue|log in to continue|please wait while we check/i
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
    user_facing_message: status === "needs_client_resolution"
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
  for (const reason of weaknessReasons(evidence)) score -= 10;
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

export async function extractOembedEvidenceForUrl(
  sourceUrl: string,
  targetUrl: string,
  phase: string,
) {
  const extracted = await fetchExtractusOembedEvidence(sourceUrl, targetUrl)
    .catch(() => null);
  if (extracted) {
    const source = `${phase}_extractus_oembed`;
    return withPipelineRaw(
      {
        ...extracted,
        source,
        finalUrl: targetUrl,
        canonical: targetUrl || extracted.canonical,
        host: hostFromUrl(targetUrl),
      },
      { phase: source, target_url: targetUrl },
    );
  }

  const endpoint = oembedEndpoint(targetUrl) || metaOembedEndpoint(targetUrl);
  const evidence = await fetchOembedEvidence(sourceUrl, endpoint).catch(() =>
    null
  );
  if (!evidence) return null;
  const source = `${phase}_known_oembed`;
  return withPipelineRaw(
    {
      ...evidence,
      source,
      finalUrl: targetUrl,
      canonical: targetUrl || evidence.canonical,
      host: hostFromUrl(targetUrl),
    },
    { phase: source, target_url: targetUrl },
  );
}

export async function extractHtmlEvidenceForUrl(
  sourceUrl: string,
  targetUrl: string,
  phase: string,
) {
  const { text: html, finalUrl, contentType } = await fetchTextLimited(
    targetUrl,
  );
  const discoveredOembed = firstLink(
    html,
    ["alternate"],
    finalUrl,
    (type) => type.includes("json+oembed") || type.includes("xml+oembed"),
  );
  const discovered = await fetchOembedEvidence(sourceUrl, discoveredOembed)
    .catch(() => null);
  if (discovered) {
    return withPipelineRaw(
      {
        ...discovered,
        source: `${phase}_discovered_oembed`,
        finalUrl,
        canonical: discovered.canonical || finalUrl,
      },
      {
        phase,
        target_url: targetUrl,
        final_url: finalUrl,
        content_type: contentType,
      },
    );
  }

  const parsed = parseHtmlEvidence(html, sourceUrl, finalUrl);
  if (parsed) {
    return withPipelineRaw(parsed, {
      phase,
      target_url: targetUrl,
      final_url: finalUrl,
      content_type: contentType,
    });
  }
  return withPipelineRaw(
    {
      ...emptyUrlEvidence(
        sourceUrl,
        "empty",
        phase,
        "No preview metadata found",
      ),
      finalUrl,
      raw: { contentType },
    },
    {
      phase,
      target_url: targetUrl,
      final_url: finalUrl,
      content_type: contentType,
    },
  );
}

export async function extractAdapterEvidenceForUrl(
  sourceUrl: string,
  targetUrl: string,
  phase: string,
) {
  const redditJson = await fetchRedditJsonEvidence(sourceUrl, targetUrl).catch(
    () => null,
  );
  return redditJson
    ? withPipelineRaw(redditJson, { phase, target_url: targetUrl })
    : null;
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
  if (cached && shouldUseCachedEvidence(cached, normalized)) {
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

  const best = bestEvidence(candidates);
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
    ]),
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
