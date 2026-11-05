-- Supabase only (pg_cron + pg_net). Local tests skip this file.
-- The jobs call edge functions with a shared key. Set once after deploy (see SETUP.md):
--   insert into private.config (key, value) values ('functions_url', 'https://<ref>.supabase.co/functions/v1'), ('cron_key', '<J_CRON_KEY>');
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
                        body := p_body, timeout_milliseconds := 25000);
end $$;

-- tick: re-rings (every 15 s), expiries, question timeouts
select cron.schedule('j-tick-0',  '* * * * *', $$ select private.call_function('tick') $$);
select cron.schedule('j-tick-15', '* * * * *', $$ select pg_sleep(15); select private.call_function('tick') $$);
select cron.schedule('j-tick-30', '* * * * *', $$ select pg_sleep(30); select private.call_function('tick') $$);
select cron.schedule('j-tick-45', '* * * * *', $$ select pg_sleep(45); select private.call_function('tick') $$);
-- reports: hourly; the function decides in America/New_York
select cron.schedule('j-scheduler', '5 * * * *', $$ select private.call_function('scheduler') $$);
-- wann feed every 15 minutes
select cron.schedule('j-wann-sync', '*/15 * * * *', $$ select private.call_function('wann-sync') $$);
