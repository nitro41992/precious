create extension if not exists "pgcrypto";

-- Calendar events: the normalized, range-queryable home for "things that happen in time".
-- Rows are sourced either from capture analysis (the LLM's suggested time windows) or from
-- manual user entry. All structured date/time/duration data previously lived only inside the
-- captures.analysis JSONB blob, which cannot be queried by date range.
create table if not exists capture_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- NULL for purely manual events that are not tied to a capture.
  capture_id uuid references captures(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  -- Anchor day used for grid placement and range queries. For fuzzy precisions this is the
  -- window/month anchor (e.g. first-of-month); date_precision decides how it is rendered.
  start_date date not null,
  -- NULL => single-day event ending on start_date.
  end_date date,
  -- NULL => all-day event.
  start_time time,
  end_time time,
  all_day boolean not null default false,
  duration numeric,
  duration_unit text check (duration_unit in ('minutes', 'hours', 'days', 'weeks')),
  date_precision text not null default 'exact'
    check (date_precision in ('exact', 'day', 'date_range', 'week', 'month_window', 'month', 'unknown')),
  time_precision text not null default 'unknown'
    check (time_precision in ('exact', 'time_range', 'unknown')),
  timezone text,
  source text not null default 'analysis' check (source in ('analysis', 'manual')),
  status text not null default 'detected' check (status in ('detected', 'confirmed', 'dismissed')),
  -- Index into captures.analysis.suggested_reminders for detected events (NULL for manual).
  reminder_index int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists capture_events_user_start_idx
  on capture_events(user_id, start_date);

create index if not exists capture_events_user_status_start_idx
  on capture_events(user_id, status, start_date);

-- One detected event per capture reminder slot, so re-analysis upserts stay idempotent and
-- never duplicate a row. Manual events (capture_id null / source manual) are exempt.
create unique index if not exists capture_events_capture_reminder_idx
  on capture_events(capture_id, reminder_index)
  where source = 'analysis' and capture_id is not null and reminder_index is not null;

drop trigger if exists capture_events_set_updated_at on capture_events;
create trigger capture_events_set_updated_at
before update on capture_events
for each row execute procedure set_updated_at();

alter table capture_events enable row level security;

drop policy if exists "own capture events" on capture_events;
create policy "own capture events" on capture_events
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
