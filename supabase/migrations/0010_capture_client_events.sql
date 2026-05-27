create table if not exists capture_client_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capture_id uuid references captures(id) on delete cascade,
  client_capture_key text,
  event_type text not null,
  phase text,
  reason_code text not null,
  message text,
  diagnostics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists capture_client_events_user_created_idx
  on capture_client_events(user_id, created_at desc);

create index if not exists capture_client_events_capture_idx
  on capture_client_events(capture_id, created_at desc)
  where capture_id is not null;

create index if not exists capture_client_events_client_key_idx
  on capture_client_events(user_id, client_capture_key, created_at desc)
  where client_capture_key is not null;

alter table capture_client_events enable row level security;

drop policy if exists "own capture client events" on capture_client_events;
create policy "own capture client events" on capture_client_events
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
