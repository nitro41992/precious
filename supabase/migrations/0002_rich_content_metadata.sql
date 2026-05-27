create extension if not exists "uuid-ossp";

alter table captures add column if not exists capture_type text;
alter table captures add column if not exists thumbnail_url text;

create table if not exists capture_assets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capture_id uuid not null references captures(id) on delete cascade,
  storage_path text not null,
  public_url text,
  mime_type text not null,
  byte_size integer,
  created_at timestamptz not null default now()
);

create index if not exists capture_assets_capture_idx on capture_assets(capture_id);
create index if not exists capture_assets_user_created_idx on capture_assets(user_id, created_at desc);

create table if not exists url_metadata (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  normalized_url text not null,
  source_url text,
  canonical_url text,
  title text,
  description text,
  image_url text,
  favicon_url text,
  provider text,
  site_name text,
  author_name text,
  author_url text,
  content_type text,
  source_type text,
  confidence numeric not null default 0,
  status text not null default 'empty'
    check (status in ('success', 'failed', 'empty')),
  error text,
  raw_metadata jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, normalized_url)
);

create index if not exists url_metadata_user_url_idx on url_metadata(user_id, normalized_url);
create index if not exists url_metadata_expires_idx on url_metadata(expires_at);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists url_metadata_set_updated_at on url_metadata;
create trigger url_metadata_set_updated_at
before update on url_metadata
for each row execute procedure set_updated_at();

alter table capture_assets enable row level security;
alter table url_metadata enable row level security;

drop policy if exists "own capture assets" on capture_assets;
create policy "own capture assets" on capture_assets
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own url metadata" on url_metadata;
create policy "own url metadata" on url_metadata
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('captures', 'captures', false)
on conflict (id) do nothing;

drop policy if exists "own capture storage read" on storage.objects;
create policy "own capture storage read" on storage.objects
  for select
  using (
    bucket_id = 'captures'
    and auth.uid()::text = split_part(name, '/', 1)
  );

drop policy if exists "own capture storage write" on storage.objects;
create policy "own capture storage write" on storage.objects
  for insert
  with check (
    bucket_id = 'captures'
    and auth.uid()::text = split_part(name, '/', 1)
  );
