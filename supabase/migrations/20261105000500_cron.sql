-- Supabase only (pg_cron + pg_net). Local tests skip this file.
-- Set once after deploy (see SETUP.md):
--   insert into private.config (key, value) values ('functions_url', 'https://<ref>.supabase.co/functions/v1'), ('cron_key', '<J_CRON_KEY>');
-- Free-tier budget: tick runs at most once a minute and only when there is work (private.tick_due), so an idle
-- month costs ~0 invocations; a busy day with signals costs ~1,440. Scheduler 720/month, wann-sync 2,880/month.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

create or replace function private.call_function(p_name text, p_body jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = private, public, extensions as $$
declare url text; key text;
begin
  select value into url from private.config where key = 'functions_url';
  select value into key from private.config where key = 'cron_key';
  if url is null or key is null then return; end if;
  perform net.http_post(url := url || '/' || p_name, headers := jsonb_build_object('Content-Type', 'application/json', 'x-j-cron-key', key),
                        body := p_body, timeout_milliseconds := 55000);
end $$;

select cron.schedule('j-tick', '* * * * *', $$ select private.call_function('tick') where private.tick_due() $$);
select cron.schedule('j-scheduler', '5 * * * *', $$ select private.call_function('scheduler') $$);
select cron.schedule('j-wann-sync', '*/15 * * * *', $$ select private.call_function('wann-sync') where exists (select 1 from public.wann_access where enabled) $$);
select cron.schedule('j-maintenance', '20 4 * * *', $$ select private.maintenance() $$);
-- pg_cron keeps every run forever; prune so the 500 MB database quota is never eaten by job history
select cron.schedule('j-cron-prune', '40 4 * * *', $$ delete from cron.job_run_details where end_time < now() - interval '7 days' $$);
