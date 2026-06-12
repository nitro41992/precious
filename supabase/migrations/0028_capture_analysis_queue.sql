-- Durable capture analysis queue.
--
-- Replaces fire-and-forget `runInBackground(processCapture)` (which Supabase Edge Functions
-- abandon mid-run — EarlyDrop/WallClockTime — stranding captures in "processing") with a pgmq
-- job queue drained by the `capture-worker` Edge Function. A job is enqueued on capture intake
-- and (a) kicked immediately via pg_net for low latency and (b) swept every minute via pg_cron
-- for durability: any message whose visibility timeout lapsed (its worker was abandoned) is
-- retried. No job can be lost.
--
-- The worker URL + bearer secret live in Vault (names `capture_worker_url`, `capture_worker_secret`),
-- created out-of-band so no secret is committed. The worker verifies the bearer against the
-- CAPTURE_WORKER_SECRET function secret.

create extension if not exists pgmq;
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Queue (idempotent).
do $$
begin
  if not exists (select 1 from pgmq.meta where queue_name = 'capture_analysis') then
    perform pgmq.create('capture_analysis');
  end if;
end
$$;

-- Fire the capture-worker over HTTP. Best-effort: used both for the immediate enqueue kick and
-- the every-minute cron sweep. Reads endpoint + bearer from Vault so no secret is hardcoded.
create or replace function public.kick_capture_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'capture_worker_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'capture_worker_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    timeout_milliseconds := 5000
  );
end
$$;

-- Enqueue a capture for analysis + kick the worker. Called by capture-intake (service role) in
-- place of the old fire-and-forget invocation.
create or replace function public.enqueue_capture_analysis(p_capture_id uuid, p_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg_id bigint;
begin
  select pgmq.send('capture_analysis', jsonb_build_object('capture_id', p_capture_id, 'user_id', p_user_id))
    into v_msg_id;
  perform public.kick_capture_worker();
  return v_msg_id;
end
$$;

-- Queue draining helpers, called by the capture-worker Edge Function via the service role.
create or replace function public.capture_queue_read(p_qty integer default 5, p_vt integer default 120)
returns table(msg_id bigint, read_ct integer, message jsonb)
language sql
security definer
set search_path = ''
as $$
  select msg_id, read_ct, message from pgmq.read('capture_analysis', p_vt, p_qty);
$$;

create or replace function public.capture_queue_delete(p_msg_id bigint)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select pgmq.delete('capture_analysis', p_msg_id);
$$;

create or replace function public.capture_queue_archive(p_msg_id bigint)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select pgmq.archive('capture_analysis', p_msg_id);
$$;

-- Lock down: these are SECURITY DEFINER and must not be reachable by anon/authenticated via
-- PostgREST. Only the service role (capture-intake + capture-worker) may call them.
revoke all on function public.kick_capture_worker() from public;
revoke all on function public.enqueue_capture_analysis(uuid, uuid) from public;
revoke all on function public.capture_queue_read(integer, integer) from public;
revoke all on function public.capture_queue_delete(bigint) from public;
revoke all on function public.capture_queue_archive(bigint) from public;

grant execute on function public.enqueue_capture_analysis(uuid, uuid) to service_role;
grant execute on function public.capture_queue_read(integer, integer) to service_role;
grant execute on function public.capture_queue_delete(bigint) to service_role;
grant execute on function public.capture_queue_archive(bigint) to service_role;

-- Durability sweep: re-kick the worker every minute to drain any messages whose visibility
-- timeout lapsed (jobs whose kick-worker was abandoned). cron.schedule upserts by name.
select cron.schedule('capture-analysis-sweep', '* * * * *', $$ select public.kick_capture_worker(); $$);
