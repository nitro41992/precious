create index if not exists collection_capture_links_user_collection_active_linked_idx
  on collection_capture_links(user_id, collection_id, unlinked_at, linked_at desc);

create index if not exists collection_capture_links_user_capture_active_linked_idx
  on collection_capture_links(user_id, capture_id, unlinked_at, linked_at desc);

create index if not exists captures_user_active_created_idx
  on captures(user_id, created_at desc)
  where archived_at is null;

create index if not exists captures_user_archived_only_created_idx
  on captures(user_id, created_at desc)
  where archived_at is not null;

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
  where links.user_id = p_user_id
    and links.collection_id = any(coalesce(p_collection_ids, '{}'::uuid[]))
    and links.unlinked_at is null
    and captures.user_id = p_user_id
    and captures.archived_at is null
  group by links.collection_id;
$$;
