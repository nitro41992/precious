# Use Visit Targets With Optional Places Resolution

Status: accepted

Precious should help users act on place-like captures while distinguishing AI-suggested map searches from verified locations. When Capture Analysis can identify a real-world venue, business, restaurant, shop, park, hotel, event venue, or similar visitable place from existing capture evidence, it persists a Visit Target: name, maps search query, confidence, evidence, and `verified_place: false` unless server-side Google Places resolution verifies an exact result.

The backend may attach `analysis.resolved_place` using Google Places API (New). Resolved Places may store the durable Google place ID plus refreshable snapshots such as display name, address, coordinates, Google Maps URI, photo resource name, and attribution. Google photo bytes are not stored as app media; capture responses may include a short-lived thumbnail URL backed by a no-store signed photo proxy. Capture data routes remain JWT-protected; the photo proxy is a separate unauthenticated Edge Function that serves only valid expiring HMAC-signed photo tokens.

The mobile app may turn a Resolved Place into exact Google Maps opening with `query_place_id`, and may use coordinates/address for Apple Maps. Without a Resolved Place, the app falls back to native Google Maps and Apple Maps search candidates from the Visit Target. The saved query can keep disambiguating evidence for display and search, but search fallback should prefer the Visit Target name when present so provider search receives the cleanest entity query. It must not store or imply a verified address, latitude/longitude, phone number, hours, business status, or place ID unless the resolver verifies those fields.

## Considered Options

- Use Places lookup during every capture analysis: accepted only for bounded Visit Target and maps-link resolution because the product needs exact Maps opening and may optionally use refreshable place media in future surfaces. Legacy captures resolve lazily on Capture Review open to avoid surprise backfill spend.
- Store only Captured Entity place names: rejected because a place name alone is often not enough for a useful Maps search, and the app needs a query with disambiguating evidence such as dish, city, neighborhood, source title, caption, transcript, OCR, source profile, or note context.
- Add a top-level Map lens now: rejected because Map remains deferred in the consumer UI revamp, and this feature is an action on a Capture rather than a retrieval destination.

## Consequences

- Visit Targets are suggestions, not canonical place records.
- `verified_place` remains false unless `analysis.resolved_place.status` is `resolved`.
- Capture Review may show exact verified-place state only for Resolved Places, currently as a flat inline `at [Place]` affordance with a Maps action. Failed, ambiguous, missing-key, and not-found resolver outcomes remain search-only.
- Capture Review may show Maps actions only for map providers that pass open checks. Android should not show Apple Maps through a web fallback. Exact Google Maps launch should use place ID when present; search fallback should use the Visit Target name first, with the saved query as fallback.
- Search should include Visit Target names, queries, confidence, and evidence as Searchable Extraction Detail.
- Google Places display/photo metadata should be treated as refreshable provider content, not permanent app-owned media. Photo bytes must be fetched through the signed no-store proxy rather than stored or rehosted as Capture media.
