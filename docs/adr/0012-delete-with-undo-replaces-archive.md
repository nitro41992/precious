# 0012 Delete With Undo Replaces Archive

## Status

Accepted

## Context

Archive created a second inactive retrieval model: captures could leave Recent Captures but remain searchable through Archived or All filters, and collections had an Active/Archived management split. That made removal feel like filing, added filter complexity to Search and Collections, and left users with an inactive state that was not part of the current search-first consumer surface.

The product now needs a simpler user-facing removal model that is immediate, reversible for a short window, and compatible with eventual hard purge of records and capture assets.

## Decision

Precious Captures will use `Delete` with an 8-second `Undo` toast for Captures and Collections. Delete marks rows with `deleted_at` and `delete_purge_after`, hides them from Recent Captures, Collections, Collection detail, and Search immediately, and leaves undo available while the row still exists. Search is active-only; Archived and All search filters are removed.

Existing archived Captures and Collections are treated as deleted and purge-eligible. A purge process may hard-delete expired rows and cascaded dependents; capture asset files are removed best-effort from storage.

## Consequences

- Archive and restore are no longer user-facing concepts.
- Deleted rows are not retrievable through Search or Collection detail.
- Collection delete does not need to unlink active capture links before undo; deleted collections are filtered out of linked-collection responses and counts.
- Backend compatibility may keep archive/restore aliases temporarily for older clients, but new clients should call delete/undo-delete actions.
