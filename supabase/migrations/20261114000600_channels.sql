-- One switch per signal, per member. A "channel" is a stream of signals: a forex symbol (USDJPY, Gold), Wann, Stocks,
-- Crypto, and whatever comes later. An admin turns each channel on or off for each member; a member with no explicit
-- choice gets the channel's default (USDJPY and Gold on, everything else off). Admins get every channel unless they
-- switch one off for themselves.
create table public.signal_channels (
  key             text primary key,
  label           text not null,
  kind            text not null check (kind in ('forex','wann','stocks','crypto')),
  symbols         text[] not null default '{}',        -- forex: the base symbols this channel carries
  default_enabled boolean not null default false,
  sort            integer not null default 100,
  created_at      timestamptz not null default now()
);
insert into public.signal_channels (key, label, kind, symbols, default_enabled, sort) values
  ('usdjpy', 'USDJPY', 'forex', '{USDJPY}', true, 10),
  ('gold', 'Gold', 'forex', '{XAUUSD,GOLD}', true, 20),
  ('wann', 'Wann', 'wann', '{}', false, 30),
  ('stocks', 'Stocks', 'stocks', '{}', false, 40),
  ('crypto', 'Crypto', 'crypto', '{}', false, 50)
on conflict (key) do nothing;

create table public.user_channels (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  channel_key text not null references public.signal_channels(key) on delete cascade,
  enabled     boolean not null,
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, channel_key)
);
alter table public.signal_channels enable row level security;
alter table public.user_channels enable row level security;
create policy signal_channels_read on public.signal_channels for select to authenticated using (true);
create policy user_channels_read on public.user_channels for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.signal_channels, public.user_channels from anon, authenticated;

-- Wann already had a per-member switch: carry those choices over.
insert into public.user_channels (user_id, channel_key, enabled) select user_id, 'wann', enabled from public.wann_access on conflict do nothing;

/** Does this member get this channel? Their own switch if an admin set one; otherwise admins get it and members get the default. */
create or replace function public.has_channel(p_user uuid, p_channel text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select uc.enabled from public.user_channels uc where uc.user_id = p_user and uc.channel_key = p_channel),
    (select p.role = 'admin' from public.profiles p where p.id = p_user) or coalesce((select c.default_enabled from public.signal_channels c where c.key = p_channel), false),
    false);
$$;

-- the channels the signed-in member has (the app shows tabs and banners from this)
create or replace function public.my_channels() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(c.key order by c.sort), '{}') from public.signal_channels c where public.has_channel(auth.uid(), c.key);
$$;

-- service role: the active members who get a channel
create or replace function public.channel_users(p_channel text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.id from public.profiles p where p.status = 'active' and public.has_channel(p.id, p_channel);
$$;

-- The channel a forex symbol belongs to. A symbol nobody has seen before gets its own channel, off by default, so a
-- new signal never reaches members until an admin switches it on for them.
create or replace function public.channel_for_symbol(p_base text) returns text
language plpgsql security definer set search_path = public as $$
declare k text; b text := upper(coalesce(p_base, ''));
begin
  select c.key into k from public.signal_channels c where c.kind = 'forex' and b = any (c.symbols) order by c.sort limit 1;
  if k is not null or b = '' then return k; end if;
  k := lower(regexp_replace(b, '[^A-Z0-9]', '', 'g'));
  insert into public.signal_channels (key, label, kind, symbols, default_enabled, sort) values (k, b, 'forex', array[b], false, 25)
  on conflict (key) do update set symbols = (select array(select distinct unnest(public.signal_channels.symbols || excluded.symbols)));
  return k;
end $$;

-- admin: switch a channel on or off for a member
create or replace function public.admin_set_channel(p_user uuid, p_channel text, p_enabled boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if not exists (select 1 from public.signal_channels where key = p_channel) then raise exception 'unknown channel' using errcode = 'P0001'; end if;
  insert into public.user_channels (user_id, channel_key, enabled, updated_by) values (p_user, p_channel, p_enabled, auth.uid())
  on conflict (user_id, channel_key) do update set enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = now();
  if p_channel = 'wann' then   -- app versions from before channels still read this table for the Wann banner
    insert into public.wann_access (user_id, enabled, enabled_at, enabled_by) values (p_user, p_enabled, case when p_enabled then now() end, auth.uid())
    on conflict (user_id) do update set enabled = excluded.enabled, enabled_at = case when excluded.enabled then now() else public.wann_access.enabled_at end, enabled_by = auth.uid();
  end if;
end $$;
-- the old Wann switch keeps working and now sets the channel
create or replace function public.admin_set_wann_access(p_user uuid, p_enabled boolean) returns void
language plpgsql security definer set search_path = public as $$
begin perform public.admin_set_channel(p_user, 'wann', p_enabled); end $$;

-- admin: every member's effective switches (the users page)
create or replace function public.admin_user_channels() returns table (user_id uuid, channel_key text, enabled boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return query select p.id, c.key, public.has_channel(p.id, c.key) from public.profiles p cross join public.signal_channels c where p.status <> 'removed';
end $$;

-- ---------- enforcement ----------
-- forex signals: only members with the symbol's channel (test signals keep their own targets)
create or replace function public.signal_create_receipts(p_signal uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare s public.signals%rowtype; n integer; ch text;
begin
  select * into s from public.signals where id = p_signal;
  if not found then return 0; end if;
  if not s.is_test then ch := public.channel_for_symbol(s.base_symbol); end if;
  with targets as (
    select p.id from public.profiles p
    where p.status = 'active'
      and (not s.is_test or p.role = 'admin' or p.id = any (s.test_targets))
      and (s.is_test = false or coalesce(array_length(s.test_targets, 1), 0) = 0 or p.id = any (s.test_targets) or p.role = 'admin')
      and (s.is_test or public.has_channel(p.id, ch))
      and (s.ea_source_id is null or not exists (select 1 from public.user_source_blocks b where b.user_id = p.id and b.ea_source_id = s.ea_source_id))
  ), ins as (
    insert into public.receipts (kind, signal_id, user_id) select 'ea', s.id, id from targets
    on conflict do nothing returning 1)
  select count(*) into n from ins;
  return n;
end $$;

-- Wann calls: members with the Wann channel
create or replace function public.wann_create_receipts(p_call uuid, p_only_user uuid default null) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with ins as (
    insert into public.receipts (kind, wann_call_id, user_id)
    select 'wann', p_call, p.id from public.profiles p
    where p.status = 'active' and public.has_channel(p.id, 'wann') and (p_only_user is null or p.id = p_only_user)
    on conflict do nothing returning 1)
  select count(*) into n from ins;
  return n;
end $$;

-- stock and crypto picks: readable only with the channel
drop policy if exists stock_picks_read on public.stock_picks;
create policy stock_picks_read on public.stock_picks for select to authenticated
  using (public.is_admin() or (not is_test and sent_at is not null and public.is_member()
         and public.has_channel(auth.uid(), case when asset = 'crypto' then 'crypto' else 'stocks' end)));

create or replace function public.stock_take(p_pick uuid, p_amount numeric default null, p_price numeric default null) returns public.stock_positions
language plpgsql security definer set search_path = public as $$
declare k public.stock_picks%rowtype; r public.stock_positions; px numeric; amt numeric;
begin
  if not public.is_member() then raise exception 'members only' using errcode = '42501'; end if;
  select * into k from public.stock_picks where id = p_pick;
  if not found or (k.is_test and not public.is_admin())
     or not (public.is_admin() or public.has_channel(auth.uid(), case when k.asset = 'crypto' then 'crypto' else 'stocks' end)) then
    raise exception 'no such pick' using errcode = 'P0002';
  end if;
  amt := coalesce(p_amount, (select default_amount from public.profiles where id = auth.uid()));
  if amt is null or amt <= 0 then raise exception 'amount must be above 0' using errcode = 'P0001'; end if;
  px := coalesce(p_price, k.last_price, k.entry_price);
  if px is null or px <= 0 then raise exception 'price must be above 0' using errcode = 'P0001'; end if;
  insert into public.stock_positions (user_id, pick_id, amount_usd, buy_price) values (auth.uid(), p_pick, round(amt, 2), px)
  on conflict (user_id, pick_id) do update set amount_usd = excluded.amount_usd, buy_price = excluded.buy_price
  returning * into r;
  return r;
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('has_channel','my_channels','channel_users','channel_for_symbol','admin_set_channel','admin_set_wann_access','admin_user_channels','signal_create_receipts','wann_create_receipts','stock_take') loop
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end $$;
revoke execute on function public.channel_users(text) from authenticated;
revoke execute on function public.channel_for_symbol(text) from authenticated;
revoke execute on function public.signal_create_receipts(uuid) from authenticated;
revoke execute on function public.wann_create_receipts(uuid, uuid) from authenticated;
