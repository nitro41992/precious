with collection_previews as (
  select
    collection_rows.id as collection_id,
    jsonb_agg(
      jsonb_build_object(
        'id', coalesce(captures.client_capture_key::text, captures.id::text),
        'remote_id', captures.id::text,
        'title', coalesce(
          nullif(captures.display_title, ''),
          nullif(captures.title, ''),
          captures.source_url,
          'Untitled capture'
        ),
        'source_url', captures.source_url,
        'thumbnail_url', coalesce(
          captures.thumbnail_url,
          captures.analysis #>> '{thumbnail_url}',
          captures.analysis #>> '{url_evidence,image_url}',
          captures.analysis #>> '{resolved_place,thumbnail_url}'
        ),
        'image_asset_storage_path', image_asset.storage_path,
        'image_asset_public_url', image_asset.public_url,
        'image_asset_mime_type', image_asset.mime_type,
        'linked_at', ranked.linked_at
      )
      order by ranked.linked_at desc
    ) as preview_captures
  from collections collection_rows
  join lateral (
    select
      links.capture_id,
      links.linked_at
    from collection_capture_links links
    join captures capture_filter on capture_filter.id = links.capture_id
    where links.user_id = collection_rows.user_id
      and links.collection_id = collection_rows.id
      and links.unlinked_at is null
      and capture_filter.user_id = collection_rows.user_id
      and capture_filter.archived_at is null
      and capture_filter.deleted_at is null
      and capture_filter.rejected_at is null
    order by links.linked_at desc
    limit 4
  ) ranked on true
  join captures on captures.id = ranked.capture_id
  left join lateral (
    select
      capture_assets.storage_path,
      capture_assets.public_url,
      capture_assets.mime_type
    from capture_assets
    where capture_assets.capture_id = captures.id
      and capture_assets.user_id = captures.user_id
      and capture_assets.mime_type like 'image/%'
    order by capture_assets.created_at desc
    limit 1
  ) image_asset on true
  group by collection_rows.id
)
update collections
set
  collection_preview_captures = collection_previews.preview_captures,
  collection_preview_updated_at = now()
from collection_previews
where (
    collections.collection_preview_captures = '[]'::jsonb
    or not exists (
      select 1
      from jsonb_array_elements(collections.collection_preview_captures) as preview_item(value)
      where coalesce(
        preview_item.value ->> 'thumbnail_url',
        preview_item.value ->> 'image_asset_storage_path',
        preview_item.value ->> 'image_asset_public_url'
      ) is not null
    )
  )
  and collections.id = collection_previews.collection_id
  and collection_previews.preview_captures is not null;
