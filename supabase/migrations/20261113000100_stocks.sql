-- Stock picks + portfolio.
-- A daily scan (edge function `stocks`) finds picks and sends them to every active member with no manual step.
-- A pick is "ipo" (listed in about the last year) or "catalyst" (established company, fresh event), and "swing"
-- (entry, stop, target, closed with a result) or "long" (held for months, tracked by percent since the pick).
-- The portfolio is each member's own record of what they put in: stocks here, lots and stakes on receipts.

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active');
$$;

create table public.stock_picks (
  id            uuid primary key default gen_random_uuid(),
  symbol        text not null,
  name          text not null,
  exchange      text,
  industry      text,
  logo_url      text,
  website       text,
  kind          text not null check (kind in ('ipo','catalyst')),
  horizon       text not null check (horizon in ('swing','long')),
  headline      text not null,                      -- one line: why now
  description   text,                               -- what the company does, from the data provider (never invented)
  reasons       jsonb not null default '[]',        -- [{label, detail}] why the scan picked it
  risks         jsonb not null default '[]',        -- [text] what could go wrong
  facts         jsonb not null default '[]',        -- [{label, value}] key numbers at pick time, ready to show
  investors     jsonb not null default '[]',        -- big investors holding it (13F), at pick time
  score         numeric not null,
  entry_price   numeric not null check (entry_price > 0),   -- price when picked
  buy_below     numeric,                            -- above this the pick is no longer a buy
  stop_price    numeric,                            -- swing only
  target_price  numeric,                            -- swing only
  status        text not null default 'open' check (status in ('open','closed')),
  close_reason  text check (close_reason in ('target','stop','time','manual')),
  close_price   numeric,
  result_pct    numeric,
  last_price    numeric,
  last_price_at timestamptz,
  expires_at    timestamptz,                        -- time stop (swing: weeks, long: a year)
  is_test       boolean not null default false,     -- admins only
  sent_at       timestamptz,
  closed_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index stock_picks_open_uq on public.stock_picks (symbol) where status = 'open' and not is_test;
create index stock_picks_sent_idx on public.stock_picks (sent_at desc);
create trigger stock_picks_updated before update on public.stock_picks for each row execute function public.set_updated_at();

-- what a member put into a pick. One row per member and pick; buying more edits the row.
create table public.stock_positions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  pick_id    uuid not null references public.stock_picks(id) on delete cascade,
  amount_usd numeric(14,2) not null check (amount_usd > 0),
  buy_price  numeric not null check (buy_price > 0),
  bought_at  timestamptz not null default now(),
  sell_price numeric check (sell_price is null or sell_price > 0),
  sold_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, pick_id)
);
create index stock_positions_user_idx on public.stock_positions (user_id, created_at desc);
create trigger stock_positions_updated before update on public.stock_positions for each row execute function public.set_updated_at();

-- one row per scan; candidates keep the reason each stock was picked or passed over (admin page)
create table public.stock_scans (
  id          uuid primary key default gen_random_uuid(),
  trading_day date not null,
  dry_run     boolean not null default false,
  stage       text not null default 'seed' check (stage in ('seed','enrich','select','done','failed')),
  stats       jsonb not null default '{}',
  error       text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index stock_scans_started_idx on public.stock_scans (started_at desc);

create table public.stock_candidates (
  id           bigint generated always as identity primary key,
  scan_id      uuid not null references public.stock_scans(id) on delete cascade,
  symbol       text not null,
  source       text not null check (source in ('earnings','ipo')),
  seed         jsonb not null default '{}',
  status       text not null default 'queued' check (status in ('queued','scored','rejected','picked','error')),
  score        numeric,
  detail       jsonb not null default '{}',
  processed_at timestamptz,
  unique (scan_id, symbol)
);
create index stock_candidates_scan_idx on public.stock_candidates (scan_id, status);

-- big investors (13F filers) and what they last reported holding
create table public.investors (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                     -- the person people know
  firm          text not null,                     -- the filer, as the SEC names it
  cik           bigint not null unique,
  active        boolean not null default true,
  last_accession text,
  period        date,                              -- quarter end the holdings are for
  filed_at      date,
  total_usd     numeric,
  checked_at    timestamptz,
  created_at    timestamptz not null default now()
);
create table public.investor_holdings (
  investor_id uuid not null references public.investors(id) on delete cascade,
  cusip       text not null,
  issuer      text not null,
  class_title text,
  value_usd   numeric not null,
  shares      numeric,
  pct         numeric,                             -- share of the investor's reported portfolio
  symbol      text,                                -- filled from cusip_map
  primary key (investor_id, cusip)
);
create index investor_holdings_symbol_idx on public.investor_holdings (symbol);
create table public.cusip_map (
  cusip      text primary key,
  symbol     text,                                 -- null = looked up, no US ticker found
  name       text,
  checked_at timestamptz not null default now()
);

-- money on receipts: what the member staked on a Wann call and what a taken trade really made
alter table public.receipts
  add column if not exists stake_usd  numeric(14,2) check (stake_usd is null or stake_usd >= 0),
  add column if not exists payout_usd numeric(14,2) check (payout_usd is null or payout_usd >= 0),   -- Wann: what the bet pays if it wins
  add column if not exists profit_usd numeric(14,2);                                                 -- EA: the member's own result, when they enter it

insert into public.settings (key, value) values ('stocks_enabled', '1'), ('stocks_max_per_day', '2'), ('stocks_min_score', '70')
on conflict (key) do nothing;

-- ---------- RLS ----------
alter table public.stock_picks enable row level security;
alter table public.stock_positions enable row level security;
alter table public.stock_scans enable row level security;
alter table public.stock_candidates enable row level security;
alter table public.investors enable row level security;
alter table public.investor_holdings enable row level security;
alter table public.cusip_map enable row level security;

create policy stock_picks_read on public.stock_picks for select to authenticated
  using (public.is_admin() or (not is_test and sent_at is not null and public.is_member()));
create policy stock_positions_read on public.stock_positions for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy stock_scans_admin on public.stock_scans for select to authenticated using (public.is_admin());
create policy stock_candidates_admin on public.stock_candidates for select to authenticated using (public.is_admin());
create policy investors_read on public.investors for select to authenticated using (public.is_member() or public.is_admin());
create policy investor_holdings_admin on public.investor_holdings for select to authenticated using (public.is_admin());
create policy cusip_map_admin on public.cusip_map for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.stock_picks, public.stock_positions, public.stock_scans, public.stock_candidates,
  public.investors, public.investor_holdings, public.cusip_map from anon, authenticated;

-- ---------- member RPCs ----------
-- "I bought it": how much went in and at what price (the pick's latest price when not given). Calling it again edits the row.
create or replace function public.stock_take(p_pick uuid, p_amount numeric, p_price numeric default null) returns public.stock_positions
language plpgsql security definer set search_path = public as $$
declare k public.stock_picks%rowtype; r public.stock_positions; px numeric;
begin
  if not public.is_member() then raise exception 'members only' using errcode = '42501'; end if;
  select * into k from public.stock_picks where id = p_pick;
  if not found or (k.is_test and not public.is_admin()) then raise exception 'no such pick' using errcode = 'P0002'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be above 0' using errcode = 'P0001'; end if;
  px := coalesce(p_price, k.last_price, k.entry_price);
  if px is null or px <= 0 then raise exception 'price must be above 0' using errcode = 'P0001'; end if;
  insert into public.stock_positions (user_id, pick_id, amount_usd, buy_price) values (auth.uid(), p_pick, round(p_amount, 2), px)
  on conflict (user_id, pick_id) do update set amount_usd = excluded.amount_usd, buy_price = excluded.buy_price
  returning * into r;
  return r;
end $$;

-- "I sold it" (price defaults to the pick's close or latest price); p_undo puts the position back to open.
create or replace function public.stock_sell(p_pick uuid, p_price numeric default null, p_undo boolean default false) returns public.stock_positions
language plpgsql security definer set search_path = public as $$
declare k public.stock_picks%rowtype; r public.stock_positions; px numeric;
begin
  select * into k from public.stock_picks where id = p_pick;
  if not found then raise exception 'no such pick' using errcode = 'P0002'; end if;
  if p_undo then
    update public.stock_positions set sell_price = null, sold_at = null where user_id = auth.uid() and pick_id = p_pick returning * into r;
  else
    px := coalesce(p_price, k.close_price, k.last_price, k.entry_price);
    if px is null or px <= 0 then raise exception 'price must be above 0' using errcode = 'P0001'; end if;
    update public.stock_positions set sell_price = px, sold_at = now() where user_id = auth.uid() and pick_id = p_pick returning * into r;
  end if;
  if r.id is null then raise exception 'no position' using errcode = 'P0002'; end if;
  return r;
end $$;

-- "I didn't buy it after all"
create or replace function public.stock_untake(p_pick uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.stock_positions where user_id = auth.uid() and pick_id = p_pick;
$$;

-- money on a receipt the member already holds: lot (EA), stake and payout (Wann), own result (EA). Null leaves a field as it is;
-- p_clear wipes the money fields.
create or replace function public.receipt_set_money(p_signal uuid default null, p_call uuid default null, p_lot numeric default null,
  p_stake numeric default null, p_payout numeric default null, p_profit numeric default null, p_clear boolean default false) returns public.receipts
language plpgsql security definer set search_path = public as $$
declare r public.receipts;
begin
  r := public.my_receipt(p_signal, p_call);
  if r.id is null then raise exception 'no receipt' using errcode = 'P0002'; end if;
  if p_lot is not null and p_lot <= 0 then raise exception 'lot must be above 0' using errcode = 'P0001'; end if;
  if (p_stake is not null and p_stake < 0) or (p_payout is not null and p_payout < 0) then raise exception 'amounts cannot be negative' using errcode = 'P0001'; end if;
  if p_clear then
    update public.receipts set stake_usd = null, payout_usd = null, profit_usd = null where id = r.id returning * into r;
  else
    update public.receipts set user_lot = coalesce(p_lot, user_lot), stake_usd = coalesce(round(p_stake, 2), stake_usd),
      payout_usd = coalesce(round(p_payout, 2), payout_usd), profit_usd = coalesce(round(p_profit, 2), profit_usd)
    where id = r.id returning * into r;
  end if;
  return r;
end $$;

-- ---------- admin: data keys (kept in private.config, never sent back to the app) ----------
create or replace function public.admin_set_data_key(p_name text, p_value text) returns void
language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_name not in ('finnhub_key', 'massive_key', 'sec_contact') then raise exception 'unknown key' using errcode = 'P0001'; end if;
  if p_value is null or btrim(p_value) = '' then delete from private.config where key = p_name;
  else insert into private.config (key, value) values (p_name, btrim(p_value)) on conflict (key) do update set value = excluded.value;
  end if;
end $$;

-- which keys are set (never the values)
create or replace function public.admin_data_keys() returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'finnhub_key', exists (select 1 from private.config where key = 'finnhub_key'),
    'massive_key', exists (select 1 from private.config where key = 'massive_key'),
    'sec_contact', (select value from private.config where key = 'sec_contact'));
end $$;

-- service role only: the stocks function reads its keys here
create or replace function public.data_key(p_name text) returns text
language sql stable security definer set search_path = private as $$
  select value from private.config where key = p_name and p_name in ('finnhub_key', 'massive_key', 'sec_contact');
$$;

-- ---------- service role only: what the stocks function should do right now ----------
-- 'scan' after the US close on a weekday (once a day; a failed scan retries after 20 minutes), 'track' every 15 minutes
-- of the session while picks are open, 'investors' when a filer has not been checked for a day or tickers are missing.
create or replace function public.stocks_due_what() returns text
language plpgsql stable security definer set search_path = public, private as $$
declare ny timestamp := now() at time zone 'America/New_York'; wd int := extract(isodow from (now() at time zone 'America/New_York'))::int; t time := (now() at time zone 'America/New_York')::time;
begin
  if exists (select 1 from private.config where key = 'finnhub_key') and wd between 1 and 5 then
    if t between '16:20' and '19:30' and public.setting_num('stocks_enabled', 1) <> 0
       and not exists (select 1 from public.stock_scans where not dry_run and trading_day = ny::date and (stage <> 'failed' or started_at > now() - interval '20 minutes')) then
      return 'scan';
    end if;
    if t between '09:35' and '16:16' and extract(minute from ny)::int % 15 = 0 and exists (select 1 from public.stock_picks where status = 'open') then
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

create or replace function public.stock_unmapped_cusips(p_limit integer default 200) returns setof text
language sql stable security definer set search_path = public as $$
  select distinct h.cusip from public.investor_holdings h
  where h.symbol is null and not exists (select 1 from public.cusip_map m where m.cusip = h.cusip) limit greatest(1, least(p_limit, 500));
$$;
create or replace function public.stock_apply_cusip_map() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with u as (update public.investor_holdings h set symbol = m.symbol from public.cusip_map m where m.cusip = h.cusip and h.symbol is distinct from m.symbol returning 1)
  select count(*) into n from u;
  return n;
end $$;
revoke execute on function public.stocks_due_what() from public, anon, authenticated;
revoke execute on function public.stock_unmapped_cusips(integer) from public, anon, authenticated;
revoke execute on function public.stock_apply_cusip_map() from public, anon, authenticated;

-- the investors J follows: well-known 13F filers (CIKs checked against SEC EDGAR, November 2026)
insert into public.investors (name, firm, cik) values
  ('Warren Buffett', 'Berkshire Hathaway', 1067983),
  ('Bill Ackman', 'Pershing Square', 2026053),
  ('Ray Dalio''s firm', 'Bridgewater Associates', 1350694),
  ('Cathie Wood', 'ARK Invest', 1697748),
  ('Stanley Druckenmiller', 'Duquesne Family Office', 1536411),
  ('David Tepper', 'Appaloosa', 1656456),
  ('George Soros', 'Soros Fund Management', 1029160),
  ('Carl Icahn', 'Icahn Capital', 921669),
  ('Dan Loeb', 'Third Point', 1040273),
  ('Seth Klarman', 'Baupost Group', 1061768),
  ('David Einhorn', 'Greenlight (DME Capital)', 1489933),
  ('Chase Coleman', 'Tiger Global', 1167483),
  ('Philippe Laffont', 'Coatue Management', 1135730),
  ('Bill Gates'' foundation', 'Gates Foundation Trust', 1166559),
  ('Terry Smith', 'Fundsmith', 1569205),
  ('Li Lu', 'Himalaya Capital', 1709323),
  ('Howard Marks', 'Oaktree Capital', 949509)
on conflict (cik) do nothing;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef
             and p.proname in ('is_member','stock_take','stock_sell','stock_untake','receipt_set_money','admin_set_data_key','admin_data_keys','data_key') loop
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end $$;
revoke execute on function public.data_key(text) from authenticated;

-- the app listens for new picks and price updates
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.stock_picks, public.stock_positions;
  end if;
end $$;
