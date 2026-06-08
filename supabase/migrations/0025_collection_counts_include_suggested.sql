-- Pending AI suggestions are status='suggested' collection rows. active_collection_capture_counts
-- (0017) filtered status='active', so suggested collections always reported 0 captures even
-- though they have member links. Include 'suggested' so the Collections-tab suggestion cards show
-- the real count (and it grows as cross-capture dedup attaches more captures). Active-collection
-- counts are unaffected. Body is otherwise identical to 0017.

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
    and collections.status in ('active', 'suggested')
    and collections.deleted_at is null
  group by links.collection_id;
$$;
