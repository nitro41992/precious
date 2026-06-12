import { errorMessage, jsonObject, stringValue } from "./common.ts";
import { METADATA_TIMEOUT_MS } from "./config.ts";

const PLACES_TEXT_SEARCH_URL =
  "https://places.googleapis.com/v1/places:searchText";
const PLACES_FIELD_MASK = [
  "places.id",
  "places.name",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.googleMapsUri",
  "places.photos",
  "places.types",
  "places.businessStatus",
].join(",");
const PLACE_DETAILS_FIELD_MASK = [
  "id",
  "name",
  "displayName",
  "formattedAddress",
  "location",
  "googleMapsUri",
  "photos",
  "types",
  "businessStatus",
].join(",");
const PLACE_DATA_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PLACE_PHOTO_TOKEN_TTL_MS = 45 * 60 * 1000;
const PHOTO_MAX_WIDTH = 720;
const PHOTO_MAX_HEIGHT = 420;

type GooglePlace = {
  id?: string;
  name?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  googleMapsUri?: string;
  photos?: Array<{
    name?: string;
    authorAttributions?: Array<{
      displayName?: string;
      uri?: string;
      photoUri?: string;
    }>;
  }>;
  types?: string[];
  businessStatus?: string;
};

type PlaceCandidate = {
  kind: "place_id" | "query";
  value: string;
  reason: string;
  nameHint?: string | null;
};

export type ResolvedPlaceStatus =
  | "resolved"
  | "not_found"
  | "ambiguous"
  | "failed"
  | "skipped_no_key"
  | "skipped_no_target";

export type ResolvedPlaceRecord = {
  status: ResolvedPlaceStatus;
  provider: "google_places";
  place_id: string | null;
  resource_name: string | null;
  resolved_query: string | null;
  resolved_at: string;
  data_expires_at: string | null;
  display_name_snapshot: string | null;
  formatted_address_snapshot: string | null;
  location_snapshot: { latitude: number; longitude: number } | null;
  google_maps_uri: string | null;
  thumbnail_status: "available" | "unavailable";
  photo_resource_name?: string | null;
  thumbnail_attribution: Array<{
    display_name: string | null;
    uri: string | null;
    photo_uri: string | null;
  }>;
  match_reason: string | null;
  error?: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function expiresIso(ttlMs: number) {
  return new Date(Date.now() + ttlMs).toISOString();
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizedText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function meaningfulTokens(value: unknown) {
  return normalizedText(value)
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function tokenOverlap(left: unknown, right: unknown) {
  const leftTokens = meaningfulTokens(left);
  const rightTokens = new Set(meaningfulTokens(right));
  if (!leftTokens.length || !rightTokens.size) return 0;
  const matches = leftTokens.filter((token) => rightTokens.has(token)).length;
  return matches / leftTokens.length;
}

function resolvedPlace(
  place: GooglePlace,
  resolvedQuery: string | null,
  matchReason: string,
): ResolvedPlaceRecord {
  const photo = Array.isArray(place.photos) ? place.photos[0] : null;
  const location = place.location &&
      Number.isFinite(Number(place.location.latitude)) &&
      Number.isFinite(Number(place.location.longitude))
    ? {
      latitude: Number(place.location.latitude),
      longitude: Number(place.location.longitude),
    }
    : null;
  return {
    status: "resolved",
    provider: "google_places",
    place_id: text(place.id),
    resource_name: text(place.name),
    resolved_query: resolvedQuery,
    resolved_at: nowIso(),
    data_expires_at: expiresIso(PLACE_DATA_TTL_MS),
    display_name_snapshot: text(place.displayName?.text),
    formatted_address_snapshot: text(place.formattedAddress),
    location_snapshot: location,
    google_maps_uri: text(place.googleMapsUri),
    thumbnail_status: photo?.name ? "available" : "unavailable",
    photo_resource_name: text(photo?.name),
    thumbnail_attribution: Array.isArray(photo?.authorAttributions)
      ? photo.authorAttributions.slice(0, 4).map((item) => ({
        display_name: text(item.displayName),
        uri: text(item.uri),
        photo_uri: text(item.photoUri),
      }))
      : [],
    match_reason: matchReason,
  };
}

function unresolvedPlace(
  status: Exclude<ResolvedPlaceStatus, "resolved">,
  query: string | null,
  reason: string,
  error: unknown = null,
): ResolvedPlaceRecord {
  return {
    status,
    provider: "google_places",
    place_id: null,
    resource_name: null,
    resolved_query: query,
    resolved_at: nowIso(),
    data_expires_at: null,
    display_name_snapshot: null,
    formatted_address_snapshot: null,
    location_snapshot: null,
    google_maps_uri: null,
    thumbnail_status: "unavailable",
    thumbnail_attribution: [],
    match_reason: reason,
    error: error ? errorMessage(error) : null,
  };
}

function entitiesFromAnalysis(analysis: Record<string, unknown>) {
  const urlEvidence = jsonObject(analysis.url_evidence);
  return Array.isArray(urlEvidence.entities)
    ? urlEvidence.entities
      .filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === "object" && !Array.isArray(item))
      )
    : [];
}

export function placeCandidatesForAnalysis(
  analysis: Record<string, unknown>,
): PlaceCandidate[] {
  const candidates: PlaceCandidate[] = [];
  const seen = new Set<string>();
  const add = (candidate: PlaceCandidate) => {
    const key = `${candidate.kind}:${normalizedText(candidate.value)}`;
    if (!candidate.value.trim() || seen.has(key)) return;
    seen.add(key);
    candidates.push({ ...candidate, value: candidate.value.trim() });
  };

  const entities = entitiesFromAnalysis(analysis);
  const sourceEntity = entities.find((entity) =>
    ["place", "map_query", "address"].includes(String(entity.type || ""))
  );
  const sourceName = stringValue(analysis.visit_target_name) ||
    stringValue(sourceEntity?.name) ||
    null;

  for (const entity of entities) {
    const type = String(entity.type || "");
    const value = stringValue(entity.value) || stringValue(entity.name);
    if (type === "place_id" && value) {
      add({
        kind: "place_id",
        value,
        reason: "source_google_place_id",
        nameHint: sourceName,
      });
    }
  }
  for (const entity of entities) {
    const type = String(entity.type || "");
    const value = stringValue(entity.name) || stringValue(entity.value);
    if (value && ["place", "map_query", "address"].includes(type)) {
      add({
        kind: "query",
        value,
        reason: `source_${type}`,
        nameHint: sourceName,
      });
    }
  }
  const coordinates = entities.find((entity) =>
    String(entity.type || "") === "coordinates"
  );
  const coordinateValue = stringValue(coordinates?.value) ||
    stringValue(coordinates?.name);
  const visitQuery = stringValue(analysis.visit_target_query);
  const visitName = stringValue(analysis.visit_target_name);
  if (visitQuery) {
    add({
      kind: "query",
      value: coordinateValue ? `${visitQuery} ${coordinateValue}` : visitQuery,
      reason: "visit_target_query",
      nameHint: visitName,
    });
  }
  if (visitName) {
    add({ kind: "query", value: visitName, reason: "visit_target_name", nameHint: visitName });
  }
  if (coordinateValue) {
    add({
      kind: "query",
      value: coordinateValue,
      reason: "source_coordinates",
      nameHint: visitName || sourceName,
    });
  }
  return candidates.slice(0, 5);
}

async function placeDetails(placeId: string, apiKey: string) {
  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": PLACE_DETAILS_FIELD_MASK,
      },
      // Bound every external call so a stalled Places request can't hang the analysis pipeline.
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(`Places details failed (${response.status})`);
  }
  return await response.json() as GooglePlace;
}

async function textSearch(query: string, apiKey: string) {
  const response = await fetch(PLACES_TEXT_SEARCH_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": PLACES_FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 3 }),
    signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Places text search failed (${response.status})`);
  }
  const body = await response.json() as { places?: GooglePlace[] };
  return Array.isArray(body.places) ? body.places : [];
}

function shouldAcceptPlace(
  place: GooglePlace,
  candidate: PlaceCandidate,
  resultCount: number,
) {
  if (candidate.reason.startsWith("source_") && candidate.reason !== "source_coordinates") {
    return true;
  }
  if (resultCount === 1) return true;
  const displayName = place.displayName?.text || "";
  const address = place.formattedAddress || "";
  const nameHint = candidate.nameHint || candidate.value;
  const hintTokens = meaningfulTokens(nameHint);
  if (
    hintTokens.length < 2 &&
    normalizedText(nameHint) !== normalizedText(displayName)
  ) {
    return false;
  }
  return tokenOverlap(nameHint, displayName) >= 0.6 ||
    tokenOverlap(displayName, nameHint) >= 0.75 ||
    tokenOverlap(candidate.value, `${displayName} ${address}`) >= 0.55;
}

function hasFreshResolvedPlace(analysis: Record<string, unknown>) {
  const resolved = jsonObject(analysis.resolved_place);
  if (resolved.status !== "resolved") return false;
  const expiresAt = Date.parse(String(resolved.data_expires_at || ""));
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export async function resolvePlaceForAnalysis(
  analysis: Record<string, unknown>,
): Promise<ResolvedPlaceRecord> {
  const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
  const candidates = placeCandidatesForAnalysis(analysis);
  if (!candidates.length) {
    return unresolvedPlace("skipped_no_target", null, "no_maps_searchable_target");
  }
  if (!apiKey) {
    return unresolvedPlace("skipped_no_key", candidates[0]?.value || null, "missing_google_places_api_key");
  }

  for (const candidate of candidates) {
    try {
      if (candidate.kind === "place_id") {
        const place = await placeDetails(candidate.value, apiKey);
        if (place.id) {
          return resolvedPlace(place, candidate.value, candidate.reason);
        }
        continue;
      }
      const places = await textSearch(candidate.value, apiKey);
      if (!places.length) continue;
      const first = places[0];
      if (!first?.id) continue;
      if (!shouldAcceptPlace(first, candidate, places.length)) {
        return unresolvedPlace("ambiguous", candidate.value, "multiple_weak_place_matches");
      }
      return resolvedPlace(first, candidate.value, candidate.reason);
    } catch (error) {
      return unresolvedPlace("failed", candidate.value, candidate.reason, error);
    }
  }
  return unresolvedPlace("not_found", candidates[0]?.value || null, "no_places_result");
}

export async function resolvePlacePatchForAnalysis(
  analysis: Record<string, unknown>,
  options: { force?: boolean } = {},
) {
  if (!options.force && hasFreshResolvedPlace(analysis)) {
    return { resolved_place: jsonObject(analysis.resolved_place), verified_place: true };
  }
  const resolvedPlace = await resolvePlaceForAnalysis(analysis);
  return {
    resolved_place: resolvedPlace,
    verified_place: resolvedPlace.status === "resolved",
  };
}

function base64UrlFromBytes(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function bytesFromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function hmacSignature(value: string) {
  const keyBytes = new TextEncoder().encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64UrlFromBytes(new Uint8Array(signature));
}

async function placePhotoToken(payload: Record<string, unknown>) {
  const encoded = base64UrlFromBytes(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return `${encoded}.${await hmacSignature(encoded)}`;
}

async function verifyPlacePhotoToken(token: string) {
  const [payloadPart, signature] = token.split(".");
  if (!payloadPart || !signature) return null;
  const expected = await hmacSignature(payloadPart);
  const left = bytesFromBase64Url(signature);
  const right = bytesFromBase64Url(expected);
  if (left.length !== right.length) return null;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left[index] ^ right[index];
  }
  if (mismatch !== 0) return null;
  const payload = JSON.parse(
    new TextDecoder().decode(bytesFromBase64Url(payloadPart)),
  ) as Record<string, unknown>;
  const expiresAt = Number(payload.exp);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  return payload;
}

function functionBaseUrl() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  return supabaseUrl
    ? `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/place-photo`
    : "";
}

export async function hydrateResolvedPlaceThumbnail(
  row: Record<string, unknown>,
) {
  const analysis = jsonObject(row.analysis);
  const resolved = jsonObject(analysis.resolved_place);
  const photoName = stringValue(resolved.photo_resource_name);
  const captureId = stringValue(row.id);
  const baseUrl = functionBaseUrl();
  if (
    resolved.status !== "resolved" ||
    resolved.thumbnail_status !== "available" ||
    !photoName ||
    !captureId ||
    !baseUrl
  ) {
    return row;
  }
  const expiresAt = Date.now() + PLACE_PHOTO_TOKEN_TTL_MS;
  const token = await placePhotoToken({
    capture_id: captureId,
    photo_name: photoName,
    exp: expiresAt,
  });
  const url = new URL(baseUrl);
  url.searchParams.set("resource", "place-photo");
  url.searchParams.set("captureId", captureId);
  url.searchParams.set("token", token);
  return {
    ...row,
    analysis: {
      ...analysis,
      resolved_place: {
        ...resolved,
        thumbnail_url: url.toString(),
        thumbnail_expires_at: new Date(expiresAt).toISOString(),
      },
    },
  };
}

export async function hydrateResolvedPlaceThumbnails(
  rows: Array<Record<string, unknown>>,
) {
  return await Promise.all(rows.map(hydrateResolvedPlaceThumbnail));
}

export async function handlePlacePhotoRequest(url: URL) {
  const payload = await verifyPlacePhotoToken(url.searchParams.get("token") || "");
  const photoName = stringValue(payload?.photo_name);
  if (!photoName) return new Response("Not found", { status: 404 });
  const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
  if (!apiKey) return new Response("Not configured", { status: 503 });
  const mediaUrl = new URL(`https://places.googleapis.com/v1/${photoName}/media`);
  mediaUrl.searchParams.set("maxWidthPx", String(PHOTO_MAX_WIDTH));
  mediaUrl.searchParams.set("maxHeightPx", String(PHOTO_MAX_HEIGHT));
  mediaUrl.searchParams.set("key", apiKey);
  const response = await fetch(mediaUrl.toString(), { redirect: "follow" });
  if (!response.ok) return new Response("Photo unavailable", { status: response.status });
  return new Response(response.body, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-type": response.headers.get("content-type") || "image/jpeg",
    },
  });
}

export function compactResolvedPlaceForEvidence(
  place: ResolvedPlaceRecord | null | undefined,
) {
  if (!place) return null;
  return {
    status: place.status,
    provider: place.provider,
    place_id: place.place_id,
    display_name_snapshot: place.display_name_snapshot,
    formatted_address_snapshot: place.formatted_address_snapshot,
    location_snapshot: place.location_snapshot,
    google_maps_uri: place.google_maps_uri,
    thumbnail_status: place.thumbnail_status,
    resolved_query: place.resolved_query,
    match_reason: place.match_reason,
  };
}
