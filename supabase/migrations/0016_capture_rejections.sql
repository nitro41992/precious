alter table captures add column if not exists rejected_at timestamptz;

create index if not exists captures_user_rejected_idx
  on captures(user_id, rejected_at)
  where rejected_at is not null;
