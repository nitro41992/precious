# Sharebook

Sharebook is an AI save layer prototype for links, screenshots, images, and notes. Phase 0A validates whether high-quality AI can infer why a user saved something, extract useful entities, suggest reminders/collections, and make captures searchable.

## Phase 0A Stack

- Next.js web app in `apps/web`
- Shared schemas/prompts in `packages/shared`
- Supabase Auth, Postgres, Storage, and pgvector
- High-quality model routing for concept validation before cost optimization

## Local Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy env template:

   ```sh
   cp apps/web/.env.example apps/web/.env.local
   ```

3. Fill Supabase and AI provider keys.

4. Run the app:

   ```sh
   npm run dev
   ```

Open `http://localhost:3000`.
