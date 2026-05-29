create extension if not exists vector;

create table if not exists capture_embeddings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capture_id uuid not null references captures(id) on delete cascade,
  embedding vector(1536) not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (capture_id)
);

create index if not exists capture_embeddings_user_capture_idx
  on capture_embeddings(user_id, capture_id);

create index if not exists capture_embeddings_embedding_idx
  on capture_embeddings using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

drop trigger if exists capture_embeddings_set_updated_at on capture_embeddings;
create trigger capture_embeddings_set_updated_at
before update on capture_embeddings
for each row execute procedure set_updated_at();

alter table capture_embeddings enable row level security;

drop policy if exists "own capture embeddings" on capture_embeddings;
create policy "own capture embeddings" on capture_embeddings
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function match_captures_for_search(
  p_user_id uuid,
  p_query_text text,
  p_query_embedding vector(1536),
  p_scope text default 'active',
  p_match_count int default 30
)
returns table (
  id uuid,
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
  linked_collection_text as (
    select
      links.capture_id,
      string_agg(
        concat_ws(' ', collections.title, collections.description),
        ' '
        order by links.linked_at desc
      ) as text
    from collection_capture_links links
    join collections on collections.id = links.collection_id
    where links.user_id = p_user_id
      and links.unlinked_at is null
      and collections.status = 'active'
    group by links.capture_id
  ),
  scoped_captures as (
    select captures.*
    from captures
    where captures.user_id = p_user_id
      and (
        coalesce(p_scope, 'active') = 'all'
        or (
          coalesce(p_scope, 'active') = 'archived'
          and (
            captures.archived_at is not null
            or captures.analysis ->> 'capture_state' = 'archived'
          )
        )
        or (
          coalesce(p_scope, 'active') not in ('all', 'archived')
          and captures.archived_at is null
          and coalesce(captures.analysis ->> 'capture_state', 'active') <> 'archived'
        )
      )
  ),
  searchable as (
    select
      scoped_captures.id,
      to_tsvector(
        'english',
        concat_ws(
          ' ',
          scoped_captures.display_title,
          scoped_captures.title,
          scoped_captures.context_note,
          scoped_captures.source_text,
          scoped_captures.source_url,
          scoped_captures.source_app,
          scoped_captures.current_save_intent,
          scoped_captures.default_intent,
          scoped_captures.intent_rationale,
          scoped_captures.analysis::text,
          linked_collection_text.text,
          scoped_captures.created_at::text
        )
      ) as search_vector
    from scoped_captures
    left join linked_collection_text on linked_collection_text.capture_id = scoped_captures.id
  ),
  keyword as (
    select
      searchable.id,
      row_number() over (order by ts_rank_cd(searchable.search_vector, query.tsq) desc) as rank,
      ts_rank_cd(searchable.search_vector, query.tsq)::real as score
    from searchable, query
    where length(btrim(coalesce(p_query_text, ''))) > 0
      and searchable.search_vector @@ query.tsq
    order by score desc
    limit 100
  ),
  semantic as (
    select
      scoped_captures.id,
      row_number() over (order by capture_embeddings.embedding <=> p_query_embedding asc) as rank,
      (1 - (capture_embeddings.embedding <=> p_query_embedding))::real as score
    from scoped_captures
    join capture_embeddings on capture_embeddings.capture_id = scoped_captures.id
    where capture_embeddings.user_id = p_user_id
    order by capture_embeddings.embedding <=> p_query_embedding asc
    limit 100
  ),
  fused as (
    select
      scoped_captures.id,
      keyword.rank::int as keyword_rank,
      semantic.rank::int as semantic_rank,
      coalesce(keyword.score, 0)::real as keyword_score,
      coalesce(semantic.score, 0)::real as semantic_score,
      (
        coalesce(1.0 / (60 + keyword.rank), 0) +
        coalesce(1.0 / (60 + semantic.rank), 0)
      )::real as rrf_score
    from scoped_captures
    left join keyword on keyword.id = scoped_captures.id
    left join semantic on semantic.id = scoped_captures.id
    where keyword.id is not null or semantic.id is not null
  )
  select *
  from fused
  order by rrf_score desc, semantic_score desc, keyword_score desc
  limit greatest(1, least(coalesce(p_match_count, 30), 100));
$$;
