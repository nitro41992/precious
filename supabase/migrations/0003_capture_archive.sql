alter table captures add column if not exists archived_at timestamptz;
alter table captures add column if not exists intent_corrected_at timestamptz;

create index if not exists captures_user_archived_created_idx
  on captures(user_id, archived_at, created_at desc);
