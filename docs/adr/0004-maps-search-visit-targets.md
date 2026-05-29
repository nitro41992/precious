# Use Maps-Searchable Visit Targets Before Place Resolution

Status: accepted

Precious should help users act on place-like captures without paying for canonical place resolution by default. When Capture Analysis can identify a real-world venue, business, restaurant, shop, park, hotel, event venue, or similar visitable place from existing capture evidence, it will persist a Visit Target: name, maps search query, confidence, evidence, and `verified_place: false`.

The mobile app may turn the persisted query into native Google Maps and Apple Maps search candidates when the provider is available on the device. It must not store or imply a verified address, latitude/longitude, phone number, hours, business status, or place ID unless a future resolver explicitly verifies those fields.

## Considered Options

- Use Places lookup during every capture analysis: rejected because it adds cost and verification work before the user has shown intent to navigate.
- Store only Captured Entity place names: rejected because a place name alone is often not enough for a useful Maps search, and the app needs a query with disambiguating evidence such as dish, city, neighborhood, source title, caption, transcript, OCR, source profile, or note context.
- Add a top-level Map lens now: rejected because Map remains deferred in the consumer UI revamp, and this feature is an action on a Capture rather than a retrieval destination.

## Consequences

- Visit Targets are suggestions, not canonical place records.
- `verified_place` remains false until a future paid or explicit resolver verifies the place.
- Capture Review may show `Open in Maps` actions only for map providers that pass native open checks. Android should not show Apple Maps through a web fallback.
- Search should include Visit Target names, queries, confidence, and evidence as Searchable Extraction Detail.
- Future enrichment can run behind a user action or budget gate without changing the capture contract.
