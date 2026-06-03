import { jsonObject, stringValue } from "../common.ts";
import type { CaptureRole, RetrievedCollection } from "../types.ts";

export const captureRoles = [
  "shopping",
  "place_visit",
  "event_attendance",
  "trip_planning",
  "learning_reference",
  "visual_inspiration",
  "project_execution",
  "media_watch_or_listen",
  "other",
] as const satisfies CaptureRole[];

const captureRoleSet = new Set<string>(captureRoles);

export function normalizedCaptureRole(value: unknown): CaptureRole | null {
  const role = stringValue(value);
  return role && captureRoleSet.has(role) ? role as CaptureRole : null;
}

export function captureRoleDefinitions() {
  return [
    "shopping: buying, comparing, wishlisting, or revisiting products, listings, deals, or purchase options.",
    "place_visit: saving a concrete place, venue, restaurant, cafe, shop, hotel, attraction, or maps-searchable destination to visit.",
    "event_attendance: saving a specific time-bound concert, workshop, class, performance, festival, market, ticket page, or attendable event.",
    "trip_planning: arranging travel, itinerary, route, booking, destination logistics, or future trip ideas.",
    "learning_reference: saving a guide, tutorial, how-to, explainer, documentation, Q&A, reference page, or long read for understanding or later use.",
    "visual_inspiration: saving aesthetic, design, style, moodboard, portfolio, look, or creative reference value with no required action.",
    "project_execution: saving steps, materials, sources, before/after evidence, or practical details for making, repairing, building, or executing a project.",
    "media_watch_or_listen: saving a film, show, episode, trailer, song, album, playlist, podcast, or media recommendation to watch or listen to.",
    "other: no clearer saved-value role is supported.",
  ];
}

export function captureRoleInstruction() {
  return [
    "Classify the capture's saved-value role before matching Collections.",
    "Use source evidence and user context, not source shape, platform, host, or incidental topic mentions alone.",
    "Roles:",
    ...captureRoleDefinitions().map((definition) => `- ${definition}`),
  ].join("\n");
}

export function captureRoleTraceFromCollections(
  collections: RetrievedCollection[],
) {
  const source = collections.find((collection) =>
    normalizedCaptureRole(collection.rerank_capture_role)
  );
  if (!source) {
    return {
      capture_role: null,
      capture_role_confidence: null,
      capture_role_rationale: null,
    };
  }
  return {
    capture_role: normalizedCaptureRole(source.rerank_capture_role),
    capture_role_confidence:
      typeof source.rerank_capture_role_confidence === "number"
        ? source.rerank_capture_role_confidence
        : null,
    capture_role_rationale: stringValue(source.rerank_capture_role_rationale),
  };
}

export function normalizedLocationContext(value: unknown) {
  const record = jsonObject(value);
  const coordinates = jsonObject(record.coordinates);
  const latitude = Number(coordinates.latitude);
  const longitude = Number(coordinates.longitude);
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
  const awayValue = record.is_destination_away_from_user;
  const isDestinationAwayFromUser = typeof awayValue === "boolean"
    ? awayValue
    : null;
  return {
    place_name: stringValue(record.place_name),
    address: stringValue(record.address),
    city: stringValue(record.city),
    region: stringValue(record.region),
    country: stringValue(record.country),
    coordinates: hasCoordinates ? { latitude, longitude } : null,
    source_destination: stringValue(record.source_destination),
    is_destination_away_from_user: isDestinationAwayFromUser,
    travel_context_reason: stringValue(record.travel_context_reason) || "",
  };
}
