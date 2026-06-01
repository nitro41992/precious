# Sharebook Product Context

Register: product

Users:
The primary user is a consumer saving links, screenshots, social posts, products, places, tickets, and notes from a phone throughout the day. They are often between apps, deciding quickly, and want capture to feel nearly invisible while retrieval feels polished, trustworthy, and personal.

Product Purpose:
Sharebook preserves why something was saved so it can be found, reviewed, and acted on later. The mobile app should feel like a consumer memory surface first, with internal validation and dogfooding needs kept out of the primary UI.

Current Architecture:
The mobile product path is Supabase-only for now. Android share intake sends links,
notes, screenshots, and images to the `capture-intake` Supabase Edge Function. The
function writes captures, image assets, analysis runs, reminder suggestions, collections, and archive state to
Supabase and calls OpenAI from server-side code. Vercel/Next routes may exist as legacy
or development harnesses, but they should not be treated as a second mobile capture API.

Brand Voice:
Calm, precise, low-friction, practical. Sharebook should feel like a trusted memory surface, not a productivity performance dashboard.

Design Principles:
- Capture first, analysis second, review when useful.
- Contextless link-only shares should not become durable captures; ask the user to add a screenshot or note instead of creating cleanup work.
- The phone UI should support quick saving and beautiful search-first retrieval.
- Editing after extraction should feel snappy through pills, shorthand, and quick shortcuts rather than gamification mechanics.
- Smooth transitions, loading states, and draft-preserving feedback are part of the consumer experience, not optional decoration.
- Dense information is acceptable when reviewing, but capture must stay almost weightless.
- Use prior context carefully. Never make the interface imply Sharebook knows more than it does.

Anti-References:
Purple SaaS gradients, generic AI assistant chrome, nested cards, gamified productivity, decorative dashboards, verbose onboarding, and manual tagging workflows.
