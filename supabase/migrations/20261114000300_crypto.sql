-- Crypto picks: the same pick, position, scan and candidate tables as stocks, told apart by `asset`.
-- A crypto pick is "ipo" (a coin listed in the last months, shown as "New listing") or "catalyst" (a breakout to a new
-- multi-week high on volume, shown as "Fresh breakout"), and "swing" or "long", exactly like a stock pick.
alter table public.stock_picks add column if not exists asset text not null default 'stock' check (asset in ('stock','crypto'));
alter table public.stock_scans add column if not exists asset text not null default 'stock' check (asset in ('stock','crypto'));
drop index if exists public.stock_picks_open_uq;
create unique index stock_picks_open_uq on public.stock_picks (asset, symbol) where status = 'open' and not is_test;
create index if not exists stock_picks_asset_idx on public.stock_picks (asset, sent_at desc);
alter table public.stock_candidates drop constraint if exists stock_candidates_source_check;
alter table public.stock_candidates add constraint stock_candidates_source_check check (source in ('earnings','ipo','breakout','listing'));

insert into public.settings (key, value) values ('crypto_enabled', '1'), ('crypto_max_per_day', '2'), ('crypto_min_score', '70')
on conflict (key) do nothing;

-- stocks: same rules as before, now looking at stock rows only
create or replace function public.stocks_due_what() returns text
language plpgsql stable security definer set search_path = public, private as $$
declare ny timestamp := now() at time zone 'America/New_York'; wd int := extract(isodow from (now() at time zone 'America/New_York'))::int; t time := (now() at time zone 'America/New_York')::time;
begin
  if exists (select 1 from private.config where key = 'finnhub_key') and wd between 1 and 5 then
    if t between '16:20' and '19:30' and public.setting_num('stocks_enabled', 1) <> 0
       and not exists (select 1 from public.stock_scans where asset = 'stock' and not dry_run and trading_day = ny::date and (stage <> 'failed' or started_at > now() - interval '20 minutes')) then
      return 'scan';
    end if;
    if t between '09:35' and '16:16' and extract(minute from ny)::int % 15 = 0 and exists (select 1 from public.stock_picks where asset = 'stock' and status = 'open') then
      return 'track';
    end if;
  end if;
  if exists (select 1 from private.config where key = 'sec_contact') and extract(minute from ny)::int % 5 = 0
     and (exists (select 1 from public.investors where active and (checked_at is null or checked_at < now() - interval '24 hours'))
          or exists (select 1 from public.investor_holdings h where h.symbol is null and not exists (select 1 from public.cusip_map m where m.cusip = h.cusip))) then
    return 'investors';
  end if;
  return '';
end $$;

-- crypto trades every day, around the clock: 'scan' once the UTC daily candle has closed (00:10 to 03:00 UTC, once a
-- day; a failed scan retries after 20 minutes), 'track' every 15 minutes while crypto picks are open.
create or replace function public.crypto_due_what() returns text
language plpgsql stable security definer set search_path = public as $$
declare u timestamp := now() at time zone 'utc';
begin
  if u::time between '00:10' and '03:00' and public.setting_num('crypto_enabled', 1) <> 0
     and not exists (select 1 from public.stock_scans where asset = 'crypto' and not dry_run and trading_day = u::date - 1 and (stage <> 'failed' or started_at > now() - interval '20 minutes')) then
    return 'scan';
  end if;
  if extract(minute from u)::int % 15 = 0 and exists (select 1 from public.stock_picks where asset = 'crypto' and status = 'open') then
    return 'track';
  end if;
  return '';
end $$;
revoke execute on function public.stocks_due_what() from public, anon, authenticated;
revoke execute on function public.crypto_due_what() from public, anon, authenticated;
