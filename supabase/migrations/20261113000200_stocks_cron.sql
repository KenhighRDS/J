-- Supabase only (pg_cron). The stocks function runs at most once a minute and only when there is something to do:
-- a scan in progress, the daily scan after the US close, open picks to re-price, or investor filings to read.
create or replace function private.stocks_due() returns boolean
language sql stable security definer set search_path = public, private as $$
  select exists (select 1 from public.stock_scans where stage in ('seed','enrich','select') and started_at > now() - interval '3 hours')
      or public.stocks_due_what() <> '';
$$;
select cron.schedule('j-stocks', '* * * * *', $$ select private.call_function('stocks', '{"action":"auto"}'::jsonb) where private.stocks_due() $$);
