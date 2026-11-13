-- The app asks each member once what amount to use for everything (Wann calls and stocks). Until they answer, 100
-- stands in. Their first answer therefore also replaces that stand-in on what was already recorded (calls taken and
-- stocks marked as bought at the stand-in amount); later changes in Settings apply from then on.
alter table public.profiles add column if not exists default_amount_set_at timestamptz;

create or replace function public.profile_set_default_amount(p_amount numeric) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare p public.profiles; was numeric; first_answer boolean;
begin
  if p_amount is null or p_amount <= 0 or p_amount > 10000000 then raise exception 'amount must be above 0' using errcode = 'P0001'; end if;
  select default_amount, default_amount_set_at is null into was, first_answer from public.profiles where id = auth.uid();
  update public.profiles set default_amount = round(p_amount, 2), default_amount_set_at = coalesce(default_amount_set_at, now())
  where id = auth.uid() returning * into p;
  if first_answer then
    -- only rows still at the stand-in amount; anything the member typed themselves is left alone
    update public.receipts set stake_usd = p.default_amount
    where user_id = p.id and kind = 'wann' and status = 'taken' and stake_usd = was and payout_usd is null;
    update public.stock_positions set amount_usd = p.default_amount where user_id = p.id and amount_usd = was;
  end if;
  return p;
end $$;
revoke execute on function public.profile_set_default_amount(numeric) from public, anon;
