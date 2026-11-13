-- When a Wann call a member took wins, the app asks once what it paid. This remembers that it asked, so skipping the
-- question is final for that call (the payout can still be entered from the portfolio).
alter table public.receipts add column if not exists payout_asked_at timestamptz;

create or replace function public.receipt_payout_asked(p_call uuid) returns public.receipts
language plpgsql security definer set search_path = public as $$
declare r public.receipts;
begin
  r := public.my_receipt(null, p_call);
  if r.id is null then raise exception 'no receipt' using errcode = 'P0002'; end if;
  update public.receipts set payout_asked_at = coalesce(payout_asked_at, now()) where id = r.id returning * into r;
  return r;
end $$;
revoke execute on function public.receipt_payout_asked(uuid) from public, anon;
