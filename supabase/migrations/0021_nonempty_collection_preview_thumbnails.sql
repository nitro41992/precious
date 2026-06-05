with ranked_preview_captures as (
  select
    collection_rows.id as collection_id,
    captures.client_capture_key,
    captures.id as capture_id,
    captures.display_title,
    captures.title,
    captures.source_url,
    nullif(captures.thumbnail_url, '') as thumbnail_url,
    captures.analysis,
    nullif(captures.analysis #>> '{thumbnail_url}', '') as analysis_thumbnail_url,
    nullif(captures.analysis #>> '{url_evidence,image_url}', '') as url_evidence_image_url,
    nullif(captures.analysis #>> '{resolved_place,thumbnail_url}', '') as resolved_place_thumbnail_url,
    nullif(image_asset.storage_path, '') as image_asset_storage_path,
    nullif(image_asset.public_url, '') as image_asset_public_url,
    image_asset.mime_type as image_asset_mime_type,
    links.linked_at,
    row_number() over (
      partition by collection_rows.id
      order by links.linked_at desc
    ) as preview_rank
  from collections collection_rows
  join collection_capture_links links
    on links.user_id = collection_rows.user_id
    and links.collection_id = collection_rows.id
    and links.unlinked_at is null
  join captures
    on captures.id = links.capture_id
    and captures.user_id = collection_rows.user_id
    and captures.archived_at is null
    and captures.deleted_at is null
    and captures.rejected_at is null
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
  where coalesce(
    nullif(captures.thumbnail_url, ''),
    nullif(captures.analysis #>> '{thumbnail_url}', ''),
    nullif(captures.analysis #>> '{url_evidence,image_url}', ''),
    nullif(captures.analysis #>> '{resolved_place,thumbnail_url}', ''),
    nullif(image_asset.storage_path, ''),
    nullif(image_asset.public_url, '')
  ) is not null
),
collection_previews as (
  select
    collection_id,
    jsonb_agg(
      jsonb_build_object(
        'id', coalesce(client_capture_key::text, capture_id::text),
        'remote_id', capture_id::text,
        'title', coalesce(
          nullif(display_title, ''),
          nullif(title, ''),
          source_url,
          'Untitled capture'
        ),
        'source_url', source_url,
        'thumbnail_url', coalesce(
          thumbnail_url,
          analysis_thumbnail_url,
          url_evidence_image_url,
          resolved_place_thumbnail_url
        ),
        'image_asset_storage_path', image_asset_storage_path,
        'image_asset_public_url', image_asset_public_url,
        'image_asset_mime_type', image_asset_mime_type,
        'linked_at', linked_at
      )
      order by linked_at desc
    ) as preview_captures
  from ranked_preview_captures
  where preview_rank <= 4
  group by collection_id
),
preview_updates as (
  select
    collections.id as collection_id,
    coalesce(collection_previews.preview_captures, '[]'::jsonb) as preview_captures
  from collections
  left join collection_previews on collection_previews.collection_id = collections.id
)
update collections
set
  collection_preview_captures = preview_updates.preview_captures,
  collection_preview_updated_at = now()
from preview_updates
where collections.id = preview_updates.collection_id
  and collections.collection_preview_captures is distinct from preview_updates.preview_captures;
