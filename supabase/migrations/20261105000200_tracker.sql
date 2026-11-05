-- Tracker EA matching: a subscriber's real position -> their receipt (strongest source).
create or replace function public.tracker_match_position(p_position uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare pos public.tracker_positions%rowtype; s record; tol numeric; matched uuid; rid uuid;
begin
  select * into pos from public.tracker_positions where id = p_position;
  if not found then return null; end if;
  if pos.matched_signal_id is not null then
    matched := pos.matched_signal_id;
  else
    for s in
      select sg.*, r.id as receipt_id from public.signals sg
      join public.receipts r on r.signal_id = sg.id and r.user_id = pos.user_id
      where sg.base_symbol = pos.base_symbol and sg.direction = pos.type and not sg.is_test
        and pos.open_time >= coalesce(sg.sent_at, sg.created_at) - interval '30 seconds'
        and pos.open_time <= case when sg.order_type = 'market' then coalesce(sg.expires_at, sg.created_at + interval '120 seconds') + interval '120 seconds'
                                  else coalesce(sg.triggered_at, now() + interval '1 day') + interval '120 seconds' end
      order by abs(extract(epoch from (pos.open_time - coalesce(sg.triggered_at, sg.sent_at, sg.created_at)))) asc
    loop
      tol := coalesce((public.setting_json('match_tolerance_pips') ->> s.base_symbol)::numeric, (public.setting_json('match_tolerance_pips') ->> 'default')::numeric, 5);
      if pos.open_price is null or abs(pos.open_price - coalesce(s.trigger_price, s.entry)) <= tol * s.pip_size then
        matched := s.id; rid := s.receipt_id; exit;
      end if;
    end loop;
    if matched is null then return null; end if;
    update public.tracker_positions set matched_signal_id = matched where id = p_position;
  end if;
  select id into rid from public.receipts where signal_id = matched and user_id = pos.user_id;
  if rid is null then return matched; end if;
  perform public.receipt_apply(rid, 'taken', 'tracker');
  update public.receipts r set user_lot = coalesce(pos.volume, r.user_lot), user_entry = coalesce(pos.open_price, r.user_entry), tracker_position_id = pos.id,
    user_close = pos.close_price,
    user_pips = case when pos.close_price is not null and pos.open_price is not null then
      round(((pos.close_price - pos.open_price) / sg.pip_size * (case when sg.direction = 'buy' then 1 else -1 end))::numeric, 1) else r.user_pips end
  from public.signals sg where r.id = rid and sg.id = matched;
  perform public.rerings_stop(rid);
  return matched;
end $$;
revoke execute on function public.tracker_match_position(uuid) from public, anon, authenticated;

-- heartbeat: balance feeds the lot calculator
create or replace function public.tracker_heartbeat(p_user uuid, p_balance numeric, p_currency text, p_login text, p_server text) returns void
language sql security definer set search_path = public as $$
  update public.tracker_links set last_heartbeat = now(), balance = p_balance, currency = p_currency, account_login = p_login, server = p_server where user_id = p_user;
  update public.profiles set balance = coalesce(p_balance, balance), balance_currency = coalesce(p_currency, balance_currency), balance_source = 'tracker' where id = p_user and p_balance is not null;
$$;
revoke execute on function public.tracker_heartbeat(uuid, numeric, text, text, text) from public, anon, authenticated;
