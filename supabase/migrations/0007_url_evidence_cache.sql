create table if not exists url_evidence_cache (
  normalized_url text primary key,
  final_url text,
  canonical_url text,
  host text,
  source text not null,
  status text not null
    check (status in ('success', 'partial', 'blocked', 'failed', 'empty')),
  confidence numeric not null default 0,
  evidence jsonb not null default '{}'::jsonb,
  weakness_reasons text[] not null default '{}',
  error text,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists url_evidence_cache_expires_idx on url_evidence_cache(expires_at);
create index if not exists url_evidence_cache_host_idx on url_evidence_cache(host);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists url_evidence_cache_set_updated_at on url_evidence_cache;
create trigger url_evidence_cache_set_updated_at
before update on url_evidence_cache
for each row execute procedure set_updated_at();

alter table url_evidence_cache enable row level security;
