alter table captures add column if not exists original_url text;
alter table captures add column if not exists client_resolved_url text;
alter table captures add column if not exists client_resolution_source text;
alter table captures add column if not exists client_resolution_timestamp timestamptz;
alter table captures add column if not exists client_resolution_attempt_count integer not null default 0;

alter table url_evidence_cache add column if not exists original_url_hash text;
alter table url_evidence_cache add column if not exists original_url text;
alter table url_evidence_cache add column if not exists client_resolved_url text;
alter table url_evidence_cache add column if not exists provider text;
alter table url_evidence_cache add column if not exists resolved_by text
  check (resolved_by is null or resolved_by in ('server_redirect', 'client_resolution', 'provider_adapter', 'manual_user_input'));
alter table url_evidence_cache add column if not exists evidence_quality text
  check (evidence_quality is null or evidence_quality in ('high', 'medium', 'low', 'none'));
alter table url_evidence_cache add column if not exists failure_reason text;
alter table url_evidence_cache add column if not exists last_verified_at timestamptz;

create index if not exists url_evidence_cache_original_hash_idx on url_evidence_cache(original_url_hash);
create index if not exists url_evidence_cache_canonical_idx on url_evidence_cache(canonical_url);
