alter table captures add column if not exists deleted_at timestamptz;
alter table captures add column if not exists delete_purge_after timestamptz;

alter table collections add column if not exists deleted_at timestamptz;
alter table collections add column if not exists delete_purge_after timestamptz;

update captures
set
  deleted_at = coalesce(deleted_at, archived_at, updated_at, now()),
  delete_purge_after = coalesce(delete_purge_after, archived_at, updated_at, now()),
  analysis = coalesce(analysis, '{}'::jsonb) || jsonb_build_object(
    'capture_state', 'deleted',
    'deleted_at', coalesce(deleted_at, archived_at, updated_at, now()),
    'delete_purge_after', coalesce(delete_purge_after, archived_at, updated_at, now())
  )
where deleted_at is null
  and (
    archived_at is not null
    or analysis ->> 'capture_state' = 'archived'
  );

update collections
set
  deleted_at = coalesce(deleted_at, archived_at, updated_at, now()),
  delete_purge_after = coalesce(delete_purge_after, archived_at, updated_at, now())
where deleted_at is null
  and (
    archived_at is not null
    or status = 'archived'
  );

create index if not exists captures_user_active_not_deleted_created_idx
  on captures(user_id, created_at desc)
  where deleted_at is null and archived_at is null;

create index if not exists captures_user_deleted_purge_idx
  on captures(delete_purge_after)
  where deleted_at is not null;

create index if not exists collections_user_active_not_deleted_created_idx
  on collections(user_id, created_at desc)
  where deleted_at is null and status = 'active';

create index if not exists collections_deleted_purge_idx
  on collections(delete_purge_after)
  where deleted_at is not null;

create or replace function active_collection_capture_counts(
  p_user_id uuid,
  p_collection_ids uuid[]
)
returns table (
  collection_id uuid,
  capture_count bigint
)
language sql
stable
as $$
  select
    links.collection_id,
    count(*)::bigint as capture_count
  from collection_capture_links links
  join captures on captures.id = links.capture_id
  join collections on collections.id = links.collection_id
  where links.user_id = p_user_id
    and links.collection_id = any(coalesce(p_collection_ids, '{}'::uuid[]))
    and links.unlinked_at is null
    and captures.user_id = p_user_id
    and captures.archived_at is null
    and captures.deleted_at is null
    and coalesce(captures.analysis ->> 'capture_state', 'active') not in ('archived', 'deleted')
    and collections.user_id = p_user_id
    and collections.status = 'active'
    and collections.deleted_at is null
  group by links.collection_id;
$$;

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
      and collections.deleted_at is null
    group by links.capture_id
  ),
  scoped_captures as (
    select captures.*
    from captures
    where captures.user_id = p_user_id
      and captures.archived_at is null
      and captures.deleted_at is null
      and coalesce(captures.analysis ->> 'capture_state', 'active') not in ('archived', 'deleted')
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

create or replace function match_captures_for_keyword_search(
  p_user_id uuid,
  p_query_text text,
  p_scope text default 'active',
  p_match_count int default 30
)
returns table (
  id uuid,
  keyword_rank int,
  keyword_score real
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
      and collections.deleted_at is null
    group by links.capture_id
  ),
  scoped_captures as (
    select captures.*
    from captures
    where captures.user_id = p_user_id
      and captures.archived_at is null
      and captures.deleted_at is null
      and coalesce(captures.analysis ->> 'capture_state', 'active') not in ('archived', 'deleted')
  ),
  searchable as (
    select
      scoped_captures.id,
      scoped_captures.created_at,
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
  ranked as (
    select
      searchable.id,
      ts_rank_cd(searchable.search_vector, query.tsq)::real as score,
      searchable.created_at
    from searchable, query
    where length(btrim(coalesce(p_query_text, ''))) > 0
      and searchable.search_vector @@ query.tsq
  )
  select
    ranked.id,
    row_number() over (order by ranked.score desc, ranked.created_at desc)::int as keyword_rank,
    ranked.score as keyword_score
  from ranked
  order by ranked.score desc, ranked.created_at desc
  limit greatest(1, least(coalesce(p_match_count, 30), 100));
$$;
