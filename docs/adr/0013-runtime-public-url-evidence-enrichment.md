# ADR 0013: Runtime Public URL Evidence Enrichment

## Status

Accepted

## Context

Capture Analysis depends on public URL evidence. The existing backend pipeline
uses redirects, maps parsing, platform adapters, oEmbed, HTML metadata, and a
cache. The 100-row capture eval showed that public PDFs, JavaScript-heavy
pages, generic platform shells, blocked metadata, and shortlinks can still lead
to failed or under-informed captures.

Eval previously let Precious see Exa evidence by injecting title, summary, and
highlights into eval-only `sourceText`. That is useful for controlled scoring
but does not match production behavior and makes public evidence look like user
capture text.

## Decision

Use Exa `/contents` as a backend-only public URL evidence adapter for weak URL
captures. The mobile app does not call Exa and does not receive the key.

The backend first tries local evidence extraction. If the best local evidence is
below `high` quality, generic, failed, empty, blocked, or missing meaningful
title and text, it may call Exa for the exact known URL. Exa output is
normalized into the existing `UrlEvidence` shape with `source: "exa_contents"`
and is cached through `url_evidence_cache`.

Exa is not used for private notes, screenshots, uploaded files, localhost,
private-network URLs, or credentialed content. It is URL evidence, not a broad
web search or a source of gold labels.

## Consequences

- Production captures should be more resilient for public PDFs, menus,
  JavaScript-heavy pages, social/video shells, and shortlinks.
- Collection reranking and analysis consume Exa evidence through the same
  structured `url_evidence` path as existing adapters.
- Cost and latency are controlled by gating, bounded text, Exa cache freshness,
  request timeout, and the existing cache table.
- Hosted eval should prefer `--runtime-exa-evidence` when testing production URL
  resilience. `--supplement-public-evidence` remains for fixed-evidence
  experiments only.
