# Use Source Only as Fallback Analysis Evidence

Date: 2026-05-31

## Status

Accepted

## Context

Sharebook saves links, screenshots, posts, images, and notes from many surfaces. Source app and format are useful for retrieval and for weak-evidence fallback, but they can mislead classification when the content itself is clear. For example, a social video about skincare advice should not become a movie or show merely because it came from a reel.

Collections also changed the meaning of organization: they group subject, project, and life context. If source format drives Collection matching, starter Collections such as `Movies & Shows` can absorb unrelated social posts whose subject belongs elsewhere.

## Decision

Capture Analysis is source-agnostic and content/context-specific. It should classify Save Intent and Collection fit from meaningful content evidence first: title, description, caption or transcript, readable text, OCR/image-visible text, shared text, context note, and extracted entities.

Source app, host, URL path, platform, and media format may be used as classification fallback only when content and context are limited, blocked, opaque, or generic.

Review Insight should explain decisions using product language and enumerated values: active Intent Categories, existing Collection titles, `No intent`, `No collection`, and `Reminder idea`. When content evidence is available, rationale should not justify a Save Intent or Collection by saying the source was a reel, social post, host, or platform.

## Consequences

- Collection retrieval and analyzer prompting must avoid source-first matches when meaningful content exists.
- Source metadata remains searchable and useful for exact-link recovery.
- Low-evidence captures may still use source fallback, but with low confidence and review when appropriate.
- Practical advice shared as social video can match a subject Collection such as `Articles & Guides` instead of a media-format Collection.
