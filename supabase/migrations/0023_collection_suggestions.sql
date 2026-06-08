-- AI-suggested collections: a suggestion is a collections row with status='suggested'.
-- This reuses the collage/preview machinery, links, embeddings, and RLS that real
-- collections already have. Persisting a suggestion flips status to 'active'.

-- 1. Allow the 'suggested' lifecycle state alongside active/archived.
alter table collections drop constraint if exists collections_status_check;
alter table collections add constraint collections_status_check
  check (status in ('active', 'archived', 'suggested'));

-- 2. Case/whitespace-insensitive dedup key. The existing unique(user_id, title) is
--    exact-match and too weak for AI-authored titles ("Coffee Spots" vs "coffee spots").
--    Partial on deleted_at is null so a soft-deleted suggestion never blocks re-creation.
alter table collections
  add column if not exists normalized_title text
    generated always as (lower(btrim(title))) stored;

create unique index if not exists collections_user_normalized_title_idx
  on collections(user_id, normalized_title)
  where deleted_at is null;

-- 3. Per-capture dismissals: a dismissed capture is never re-suggested into the same group.
create table if not exists collection_suggestion_dismissals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  collection_id uuid not null references collections(id) on delete cascade,
  capture_id uuid not null references captures(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  unique (collection_id, capture_id)
);

create index if not exists suggestion_dismissals_user_capture_idx
  on collection_suggestion_dismissals(user_id, capture_id);

alter table collection_suggestion_dismissals enable row level security;

drop policy if exists "own suggestion dismissals" on collection_suggestion_dismissals;
create policy "own suggestion dismissals" on collection_suggestion_dismissals
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Index suggested rows for listing (mirrors collections_user_active_not_deleted_created_idx).
create index if not exists collections_user_suggested_not_deleted_created_idx
  on collections(user_id, created_at desc)
  where deleted_at is null and status = 'suggested';

-- 5. Hybrid matcher restricted to pending suggestions, used to dedup a newly proposed
--    suggestion against existing pending ones. Sibling of match_collections_for_capture;
--    that function is intentionally left unchanged (it must keep returning active rows only).
create or replace function match_collection_suggestions_for_capture(
  p_user_id uuid,
  p_query_text text,
  p_query_embedding vector(1536),
  p_match_count int default 5
)
returns table (
  id uuid,
  title text,
  description text,
  keyword_rank int,
  semantic_rank int,
  keyword_score real,
  semantic_score real,
  rrf_score real
)
language sql
stable
as $$
  with query as (
    select websearch_to_tsquery('english', coalesce(p_query_text, '')) as tsq
  ),
  keyword as (
    select
      c.id,
      row_number() over (order by ts_rank_cd(c.search_vector, query.tsq) desc) as rank,
      ts_rank_cd(c.search_vector, query.tsq)::real as score
    from collections c, query
    where c.user_id = p_user_id
      and c.status = 'suggested'
      and c.deleted_at is null
      and length(btrim(coalesce(p_query_text, ''))) > 0
      and c.search_vector @@ query.tsq
    order by score desc
    limit 20
  ),
  semantic as (
    select
      c.id,
      row_number() over (order by e.embedding <=> p_query_embedding asc) as rank,
      (1 - (e.embedding <=> p_query_embedding))::real as score
    from collections c
    join collection_embeddings e on e.collection_id = c.id
    where c.user_id = p_user_id
      and c.status = 'suggested'
      and c.deleted_at is null
    order by e.embedding <=> p_query_embedding asc
    limit 20
  ),
  fused as (
    select
      c.id,
      c.title,
      c.description,
      keyword.rank::int as keyword_rank,
      semantic.rank::int as semantic_rank,
      coalesce(keyword.score, 0)::real as keyword_score,
      coalesce(semantic.score, 0)::real as semantic_score,
      (
        coalesce(1.0 / (60 + keyword.rank), 0) +
        coalesce(1.0 / (60 + semantic.rank), 0)
      )::real as rrf_score
    from collections c
    left join keyword on keyword.id = c.id
    left join semantic on semantic.id = c.id
    where c.user_id = p_user_id
      and c.status = 'suggested'
      and c.deleted_at is null
      and (keyword.id is not null or semantic.id is not null)
  )
  select *
  from fused
  order by rrf_score desc, semantic_score desc, keyword_score desc
  limit greatest(1, least(coalesce(p_match_count, 5), 10));
$$;
