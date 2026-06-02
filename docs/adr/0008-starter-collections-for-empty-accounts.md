# Seed Starter Collections for Empty Accounts

Date: 2026-05-31

## Status

Accepted

## Context

Collections are user-owned organization, and Capture Analysis must not create new Collections. Completely empty accounts, however, make Collection matching less useful during onboarding and leave the top-level Collections destination without examples of what belongs there.

The starter set should group what is being saved rather than duplicate Save Intents. Names like `Recipes` and `Movies & Shows` are more useful Collection examples than intent-like names such as `Things to buy` or `Watch later`.

## Decision

When an authenticated user has zero Collections total, including deleted Collections, Precious Captures seeds five active starter Collections:

- `Recipes`
- `Movies & Shows`
- `Restaurants & Cafes`
- `Products`
- `Articles & Guides`

These Collections are marked with `created_by: starter`, but otherwise behave like normal active Collections. Users can rename them, attach Captures to them, and delete them with undo. Deleted starter Collections must not be recreated on a later fetch.

## Consequences

- Starter Collections are a product-owned onboarding default, not AI-generated Collection suggestions.
- Capture Analysis may match Captures to starter Collections because they are active existing Collections for that user.
- The starter set stays finite and object-based so Collections do not become another Save Intent taxonomy.
- ADR 0012 replaces archive/restore with delete/undo. Starter Collections still count as existing Collections after deletion so they are not recreated for the same account.
