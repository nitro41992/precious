create extension if not exists "uuid-ossp";

create table if not exists captures (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_capture_key text,
  source_url text,
  source_text text,
  source_app text,
  display_title text,
  title text,
  context_note text,
  analysis_state text not null default 'queued'
    check (analysis_state in ('queued', 'processing', 'ready', 'needs_review', 'failed')),
  analysis_error text,
  analysis jsonb,
  analysis_provider text,
  analysis_model text,
  analysis_mode text,
  analysis_cancel_requested_at timestamptz,
  analysis_cancel_reason text,
  default_intent text,
  default_intent_confidence numeric,
  current_save_intent text,
  intent_rationale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);

create unique index if not exists captures_user_client_capture_key_idx
  on captures(user_id, client_capture_key)
  where client_capture_key is not null;

create index if not exists captures_user_created_idx on captures(user_id, created_at desc);
create index if not exists captures_user_state_idx on captures(user_id, analysis_state);

alter table captures add column if not exists client_capture_key text;
alter table captures add column if not exists display_title text;
alter table captures add column if not exists analysis_error text;
alter table captures add column if not exists analysis jsonb;
alter table captures add column if not exists analysis_provider text;
alter table captures add column if not exists analysis_model text;
alter table captures add column if not exists analysis_mode text;
alter table captures add column if not exists analysis_cancel_requested_at timestamptz;
alter table captures add column if not exists analysis_cancel_reason text;
alter table captures add column if not exists processed_at timestamptz;

create table if not exists analysis_runs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capture_id uuid not null references captures(id) on delete cascade,
  provider text not null,
  model text not null,
  status text not null check (status in ('succeeded', 'failed')),
  prompt_version text not null,
  schema_version text not null,
  latency_ms integer,
  usage jsonb not null default '{}'::jsonb,
  raw_output jsonb,
  raw_model_output text,
  error_message text,
  created_at timestamptz not null default now()
);

alter table analysis_runs add column if not exists status text not null default 'succeeded';
alter table analysis_runs add column if not exists raw_model_output text;
alter table analysis_runs add column if not exists error_message text;

create table if not exists captured_entities (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capture_id uuid not null references captures(id) on delete cascade,
  analysis_run_id uuid references analysis_runs(id) on delete set null,
  entity_type text not null,
  display_name text not null,
  normalized_name text,
  evidence text,
  source text,
  confidence numeric not null,
  created_at timestamptz not null default now()
);

alter table captured_entities add column if not exists entity_type text;
alter table captured_entities add column if not exists display_name text;
alter table captured_entities add column if not exists normalized_name text;
alter table captured_entities add column if not exists evidence text;
alter table captured_entities add column if not exists source text;
alter table captured_entities add column if not exists confidence numeric;

create table if not exists reminder_suggestions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capture_id uuid not null references captures(id) on delete cascade,
  analysis_run_id uuid references analysis_runs(id) on delete set null,
  trigger_type text not null,
  trigger_value text not null,
  rationale text not null,
  confidence numeric not null,
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists reminders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capture_id uuid not null references captures(id) on delete cascade,
  analysis_run_id uuid references analysis_runs(id) on delete set null,
  trigger_type text not null,
  trigger_value text not null,
  rationale text not null,
  confidence numeric not null,
  status text not null default 'pending'
    check (status in ('pending', 'scheduled', 'done', 'dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists reminders_user_status_idx on reminders(user_id, status, created_at desc);

alter table reminders add column if not exists capture_id uuid references captures(id) on delete cascade;
alter table reminders add column if not exists analysis_run_id uuid references analysis_runs(id) on delete set null;
alter table reminders add column if not exists confidence numeric;

create table if not exists collection_suggestions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capture_id uuid not null references captures(id) on delete cascade,
  analysis_run_id uuid references analysis_runs(id) on delete set null,
  name text not null,
  rationale text not null,
  confidence numeric not null,
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists collections (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  rationale text,
  created_by text not null default 'user',
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists search_documents (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capture_id uuid not null references captures(id) on delete cascade,
  analysis_run_id uuid references analysis_runs(id) on delete set null,
  document text not null,
  created_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists captures_set_updated_at on captures;
create trigger captures_set_updated_at
before update on captures
for each row execute procedure set_updated_at();

alter table captures enable row level security;
alter table analysis_runs enable row level security;
alter table captured_entities enable row level security;
alter table reminder_suggestions enable row level security;
alter table reminders enable row level security;
alter table collection_suggestions enable row level security;
alter table collections enable row level security;
alter table search_documents enable row level security;

drop policy if exists "own captures" on captures;
create policy "own captures" on captures
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own analysis runs" on analysis_runs;
create policy "own analysis runs" on analysis_runs
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own captured entities" on captured_entities;
create policy "own captured entities" on captured_entities
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own reminder suggestions" on reminder_suggestions;
create policy "own reminder suggestions" on reminder_suggestions
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own reminders" on reminders;
create policy "own reminders" on reminders
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own collection suggestions" on collection_suggestions;
create policy "own collection suggestions" on collection_suggestions
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own collections" on collections;
create policy "own collections" on collections
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own search documents" on search_documents;
create policy "own search documents" on search_documents
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
