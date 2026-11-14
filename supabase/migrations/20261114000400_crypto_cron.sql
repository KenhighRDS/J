-- Supabase only (pg_cron). Each function runs at most once a minute and only when it has something to do; a stock
-- scan in progress no longer wakes the crypto function, nor the other way round.
create or replace function private.stocks_due() returns boolean
language sql stable security definer set search_path = public, private as $$
  select exists (select 1 from public.stock_scans where asset = 'stock' and stage in ('seed','enrich','select') and started_at > now() - interval '3 hours')
      or public.stocks_due_what() <> '';
$$;
create or replace function private.crypto_due() returns boolean
language sql stable security definer set search_path = public, private as $$
  select exists (select 1 from public.stock_scans where asset = 'crypto' and stage in ('seed','enrich','select') and started_at > now() - interval '3 hours')
      or public.crypto_due_what() <> '';
$$;
select cron.schedule('j-crypto', '* * * * *', $$ select private.call_function('crypto', '{"action":"auto"}'::jsonb) where private.crypto_due() $$);
