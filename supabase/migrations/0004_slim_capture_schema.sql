drop table if exists search_documents cascade;
drop table if exists collection_suggestions cascade;
drop table if exists collections cascade;
drop table if exists reminders cascade;
drop table if exists reminder_suggestions cascade;
drop table if exists captured_entities cascade;
drop table if exists url_metadata cascade;

alter table captures enable row level security;
alter table analysis_runs enable row level security;
alter table capture_assets enable row level security;

drop policy if exists "own captures" on captures;
create policy "own captures" on captures
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own analysis runs" on analysis_runs;
create policy "own analysis runs" on analysis_runs
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own capture assets" on capture_assets;
create policy "own capture assets" on capture_assets
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
