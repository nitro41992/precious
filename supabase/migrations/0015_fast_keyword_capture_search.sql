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
