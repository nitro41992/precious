alter table capture_assets add column if not exists asset_role text;
alter table capture_assets add column if not exists source_url text;

update capture_assets
set asset_role = 'capture_media'
where asset_role is null;

alter table capture_assets
  alter column asset_role set default 'capture_media';

alter table capture_assets
  alter column asset_role set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'capture_assets_asset_role_check'
      and conrelid = 'capture_assets'::regclass
  ) then
    alter table capture_assets
      add constraint capture_assets_asset_role_check
      check (asset_role in ('capture_media', 'source_preview'));
  end if;
end;
$$;

create unique index if not exists capture_assets_one_source_preview_idx
  on capture_assets(capture_id)
  where asset_role = 'source_preview';
