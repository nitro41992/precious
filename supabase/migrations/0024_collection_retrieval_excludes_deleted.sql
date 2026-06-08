-- Collection retrieval must exclude soft-deleted collections. match_collections_for_capture
-- (0008) filtered status='active' but not deleted_at, so a collection the user removed still
-- leaked into the analysis candidate pool — polluting matching and suppressing new-collection
-- suggestions. Add `deleted_at is null` to every CTE. Behavior is otherwise unchanged.

create or replace function match_collections_for_capture(
  p_user_id uuid,
  p_query_text text,
  p_query_embedding vector(1536),
  p_match_count int default 3
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
      and c.status = 'active'
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
      and c.status = 'active'
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
      and c.status = 'active'
      and c.deleted_at is null
      and (keyword.id is not null or semantic.id is not null)
  )
  select *
  from fused
  order by rrf_score desc, semantic_score desc, keyword_score desc
  limit greatest(1, least(coalesce(p_match_count, 3), 10));
$$;
