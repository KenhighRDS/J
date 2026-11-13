-- One default amount per member (100 to start, changed in Settings) instead of asking each time: it is the stake on a
-- Wann call the member takes and the amount on a stock they mark as bought. Either can still be corrected afterwards.
alter table public.profiles add column if not exists default_amount numeric(14,2) not null default 100 check (default_amount > 0);

create or replace function public.profile_set_default_amount(p_amount numeric) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if p_amount is null or p_amount <= 0 or p_amount > 10000000 then raise exception 'amount must be above 0' using errcode = 'P0001'; end if;
  update public.profiles set default_amount = round(p_amount, 2) where id = auth.uid() returning * into p;
  return p;
end $$;

-- Every way a Wann receipt becomes "taken" (the swipe, the Yes answer in the app or on the Android alert) gets the stake.
-- An amount the member entered is never overwritten.
create or replace function public.receipts_default_stake() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'wann' and new.status = 'taken' and new.stake_usd is null then
    select p.default_amount into new.stake_usd from public.profiles p where p.id = new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists receipts_default_stake on public.receipts;
create trigger receipts_default_stake before insert or update of status on public.receipts
  for each row execute function public.receipts_default_stake();

-- calls already taken without an amount get the default too, so the portfolio counts them
update public.receipts r set stake_usd = p.default_amount
from public.profiles p
where p.id = r.user_id and r.kind = 'wann' and r.status = 'taken' and r.stake_usd is null;

-- "I bought it" without an amount uses the default
create or replace function public.stock_take(p_pick uuid, p_amount numeric default null, p_price numeric default null) returns public.stock_positions
language plpgsql security definer set search_path = public as $$
declare k public.stock_picks%rowtype; r public.stock_positions; px numeric; amt numeric;
begin
  if not public.is_member() then raise exception 'members only' using errcode = '42501'; end if;
  select * into k from public.stock_picks where id = p_pick;
  if not found or (k.is_test and not public.is_admin()) then raise exception 'no such pick' using errcode = 'P0002'; end if;
  amt := coalesce(p_amount, (select default_amount from public.profiles where id = auth.uid()));
  if amt is null or amt <= 0 then raise exception 'amount must be above 0' using errcode = 'P0001'; end if;
  px := coalesce(p_price, k.last_price, k.entry_price);
  if px is null or px <= 0 then raise exception 'price must be above 0' using errcode = 'P0001'; end if;
  insert into public.stock_positions (user_id, pick_id, amount_usd, buy_price) values (auth.uid(), p_pick, round(amt, 2), px)
  on conflict (user_id, pick_id) do update set amount_usd = excluded.amount_usd, buy_price = excluded.buy_price
  returning * into r;
  return r;
end $$;

revoke execute on function public.profile_set_default_amount(numeric) from public, anon;
revoke execute on function public.receipts_default_stake() from public, anon, authenticated;
revoke execute on function public.stock_take(uuid, numeric, numeric) from public, anon;
