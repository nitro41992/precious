# ADR 0017: Use a Media-First Full-Bleed Preview in Capture Review

## Status

Accepted

## Context

Capture Review previously led with the editable title and source context before
showing capture media. That kept editing semantics primary, but image and
screenshot captures did not feel as immediate or native as modern media-detail
surfaces. A fixed lower panel made the detail area feel cramped because the user
scrolled inside a static lower region, while a sticky collapsing media header
made ordinary up/down scrolling feel unreliable.

The desired direction is a Material 3 Expressive-inspired screen where the saved
image, screenshot, or source preview anchors the first viewport, can extend under
the transparent status bar, and changes frame shape as the user continues into
the details without introducing a second scroll region.

## Decision

Capture Review will use a media-first full-bleed preview: the top of the screen
is a media preview or designed source fallback that starts at the top edge of the
screen, begins with a taller portrait-like aspect ratio, and eases toward a
square preview as the same native page scroll advances into the details. The
detail content sits below the animated media frame in a flatter tonal detail
plane containing the editable title, source context, inline meaning sentence,
review actions, and save footer.

The media remains tappable according to existing behavior: uploaded image and
screenshot media opens the full-screen image viewer, while source/link preview
media opens the source URL when available. Purpose, Collection, Later, and
Location editing still happens through the existing inline sentence and focused
bottom sheets.

## Consequences

- Capture Review feels more like editing a saved visual memory than reviewing an
  extraction report.
- The editable title remains primary text, but it is primary within the detail
  plane rather than above the media.
- Existing rationale, reminder, collection, source opening, delete, and save
  behavior stays unchanged.
- Future sticky or draggable media behavior is a separate product decision and
  should be reintroduced only if it can preserve smooth native scrolling.
