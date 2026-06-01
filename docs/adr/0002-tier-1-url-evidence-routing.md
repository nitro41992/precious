# Use Tier 1 URL Evidence Routing Around Generic Extractors

Status: accepted

Precious should enrich common shared links without becoming a bespoke scraper for every app. The `capture-intake` Edge Function remains the mobile-facing intake boundary and owns safe URL validation, redirect handling, evidence scoring, caching, and normalization into `UrlEvidence`. Generic extraction remains the default: Extractus handles oEmbed/provider discovery, OpenLink handles HTML metadata, and the existing Open Graph/JSON-LD parser remains a fallback.

We will add a small Tier 1 routing layer for high-value public share domains where URL shape often blocks generic extraction. Tier 1 routing may clean tracking parameters, create provider-ready canonical candidates, and call known public oEmbed endpoints for providers with simple unauthenticated endpoints. It must not make provider details consumer-facing UI language, require logged-in scraping, or replace `UrlEvidence` as the product contract.

URL evidence routing and public-link preflight apply only to link-only Captures without shared image assets. Link-only Captures with no useful public metadata, readable text, media, shared text, note, or image evidence should be rejected and hidden rather than retained as review work. Notes, screenshots, images, and mixed image Captures use modality-specific evidence gates instead of URL evidence as the first rejection path. When an image or note Capture has no source URL, its analysis metadata should not include `url_evidence`; Capture Review should not show link-evidence fallback copy for those Captures.

Initial Tier 1 domains are TikTok, YouTube, Instagram, Facebook, Threads, Reddit, X/Twitter, Google Maps, Apple Maps, Amazon, Pinterest, Vimeo, Spotify, SoundCloud, and Apple Music. Deeper adapters for Tier 2 domains should be promoted from telemetry rather than added preemptively.

## Considered Options

- Generic extractors only: rejected because app share links, short links, and mobile URLs commonly produce generic shells even when public metadata exists.
- Full bespoke adapters for every major platform: rejected because it creates ongoing scraper maintenance and would overfit provider details into the product.
- Metascraper inside hosted Supabase Edge: rejected for now because the spike produced a heavy Node-oriented dependency graph, while OpenLink provides an Edge-friendly HTML metadata path.
- Separate parser service for Metascraper: deferred because it adds hosting and operational surface beyond the current Supabase-only mobile product path.

## Consequences

- Tier 1 routing should stay shallow: canonical URL candidates, known public oEmbed endpoints, and provider-specific public API calls only when they are already bounded and safe.
- Extractus should run before known endpoint fallbacks so broad provider coverage does not require hand-maintained endpoint logic.
- OpenLink and the existing parser should remain available for normal web pages, product pages, articles, and Tier 2 domains.
- Weak or generic evidence from opaque app links should trigger client resolution only when a client-resolved URL can add useful context; otherwise contextless link-only Captures should be rejected and hidden rather than retained for review.
- Provider names, endpoint names, and debug extraction sources may be persisted as Platform Evidence and Searchable Extraction Detail, but primary UI should continue to show consumer-facing capture content.
- Non-link Captures remain durable even when there is not enough note or visual context for useful Capture Analysis; they should move to `needs_review` with a `Couldn't tell` Confidence State rather than being treated as failed public-link extraction.
