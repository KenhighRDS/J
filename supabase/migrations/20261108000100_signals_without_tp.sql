-- EAs that trade without a take-profit (or stop): MetaTrader sends 0 for "none".
-- 1) Levels stored as 0 by older ingests become null.
-- 2) The copy heuristic asks for TP (and SL) only when the signal has one, so "likely taken" works for no-TP signals.
update public.signals set tp = null where tp = 0;
update public.signals set sl = null where sl = 0;

create or replace function public.receipts_resolve(p_signal uuid default null, p_call uuid default null) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0; r record; need_sl boolean := true; need_tp boolean := true;
begin
  if p_signal is not null then select (sl is not null), (tp is not null) into need_sl, need_tp from public.signals where id = p_signal; end if;
  for r in select * from public.receipts
           where ((p_signal is not null and signal_id = p_signal) or (p_call is not null and wann_call_id = p_call))
             and status in ('pending','opened') loop
    if r.opened_at is null then
      perform public.receipt_apply(r.id, 'missed', 'expiry'); n := n + 1;
    elsif (r.kind = 'ea' and r.copied ? 'entry' and r.copied ? 'lot' and (not need_tp or r.copied ? 'tp') and (not need_sl or r.copied ? 'sl'))
       or (r.kind = 'wann' and r.copied ? 'pick') then
      perform public.receipt_apply(r.id, 'likely_taken', 'copy'); n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.receipts_resolve(uuid, uuid) from anon, authenticated;
