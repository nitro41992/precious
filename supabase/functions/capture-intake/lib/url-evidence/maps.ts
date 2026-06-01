import { errorMessage, hostFromUrl } from "../common.ts";
import type { UrlEvidence } from "../types.ts";
import { resolveUrlLimited } from "./safe-fetch.ts";
import { emptyUrlEvidence } from "./quality.ts";

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
