-- Two-phase analyzer reveal: a capture's own analysis is marked ready immediately, while the
-- cross-capture new-Collection suggestion (embedding + dedup + DB round-trips) resolves in the
-- background. This column lets the app show the analysis as complete while the suggestion is
-- still resolving, then surface the suggestion when it flips to 'ready'.
--   none    – no qualifying new-Collection suggestion for this capture
--   pending – analysis is ready; the suggestion is still resolving in the background
--   ready   – the background suggestion pass finished (suggestion, if any, is on the analysis)
alter table captures
  add column if not exists collection_suggestion_state text not null default 'none'
    check (collection_suggestion_state in ('none', 'pending', 'ready'));
