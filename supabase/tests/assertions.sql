-- Behavioural assertions run after the migrations (fails the script on the first error).
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'admin@example.com'), ('22222222-2222-2222-2222-222222222222', 'sub@example.com'), ('33333333-3333-3333-3333-333333333333', 'blocked@example.com');
update public.profiles set role = 'admin', status = 'active' where email = 'admin@example.com';
update public.profiles set status = 'active', balance = 10000, risk_pct = 1 where email in ('sub@example.com', 'blocked@example.com');

-- base symbol + pip size
do $$ begin
  assert public.base_symbol('XAUUSDm') = 'XAUUSD', 'XAUUSDm';
  assert public.base_symbol('XAUUSD.r') = 'XAUUSD', 'XAUUSD.r';
  assert public.base_symbol('#XAUUSD') = 'XAUUSD', '#XAUUSD';
  assert public.base_symbol('US30m') = 'US30', 'US30m';
  assert public.base_symbol('EURUSD') = 'EURUSD', 'EURUSD';
  assert public.pip_size_for('XAUUSD', 2, 0.01) = 0.1, 'xau pip';
  assert public.pip_size_for('EURUSD', 5, 0.00001) = 0.0001, 'fx pip';
  assert public.pip_size_for('USDJPY', 3, 0.001) = 0.01, 'jpy pip';
end $$;

-- admin creates an EA source and blocks it for one user
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.admin_create_ea_source('XAU EA') \gset src_
select public.admin_set_source_block('33333333-3333-3333-3333-333333333333', (:'src_admin_create_ea_source'::jsonb->>'id')::uuid, true);
reset role;

-- a market signal: receipts for everyone active except the blocked user
insert into public.signals (id, ea_source_id, ea_uid, symbol, base_symbol, direction, order_type, entry, sl, tp, digits, point, pip_size, tick_size, tick_value, expires_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (:'src_admin_create_ea_source'::jsonb->>'id')::uuid, '1', 'XAUUSDm', 'XAUUSD', 'buy', 'market', 2341.50, 2335.00, 2355.00, 2, 0.01, 0.1, 0.01, 1, now() + interval '2 minutes');
do $$ declare n int; begin
  n := public.signal_create_receipts('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  assert n = 2, format('expected 2 receipts, got %s', n);
  assert not exists (select 1 from public.receipts where user_id = '33333333-3333-3333-3333-333333333333'), 'blocked user got a receipt';
end $$;

-- subscriber: RLS lets them see the signal; copy all four -> likely_taken at expiry; swipe wins over copy; tracker wins over swipe
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ declare r public.receipts; begin
  assert (select count(*) from public.signals) = 1, 'subscriber should see 1 signal';
  assert (select count(*) from public.profiles) = 1, 'subscriber should see only own profile';
  r := public.receipt_open('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  assert r.status = 'opened', 'opened';
  perform public.receipt_copy('entry', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  perform public.receipt_copy('sl', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  perform public.receipt_copy('tp', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  perform public.receipt_copy('lot', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
end $$;
reset role;
do $$ begin
  perform public.receipts_resolve('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  assert (select status from public.receipts where user_id = '22222222-2222-2222-2222-222222222222') = 'likely_taken', 'copy heuristic';
  assert (select status from public.receipts where user_id = '11111111-1111-1111-1111-111111111111') = 'missed', 'never opened -> missed';
end $$;
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ declare r public.receipts; begin
  r := public.receipt_take('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 0.15);
  assert r.status = 'taken' and r.status_source = 'swipe' and r.user_lot = 0.15, 'swipe';
  r := public.receipt_skip('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  assert r.status = 'skipped', 'skip after swipe (same rank) applies';
end $$;
reset role;
do $$ declare rid uuid; begin
  select id into rid from public.receipts where user_id = '22222222-2222-2222-2222-222222222222';
  perform public.receipt_apply(rid, 'taken', 'tracker');
  assert (select status from public.receipts where id = rid) = 'taken', 'tracker';
  perform public.receipt_apply(rid, 'skipped', 'skip');
  assert (select status from public.receipts where id = rid) = 'taken', 'tracker always wins';
end $$;

-- direct writes by the API role are refused
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  begin
    update public.receipts set status = 'taken';
    raise exception 'direct update should fail';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- expiry job
update public.signals set expires_at = now() - interval '1 second';
do $$ begin
  assert (select count(*) from public.signals_expire_due()) = 1, 'expire due';
  assert (select status from public.signals where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 'expired', 'expired';
end $$;

-- a signal without TP (EAs that trail instead): copying entry, SL and lot is enough for likely_taken
insert into public.signals (id, ea_source_id, ea_uid, symbol, base_symbol, direction, order_type, entry, sl, tp, digits, point, pip_size, tick_size, tick_value, expires_at)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', (:'src_admin_create_ea_source'::jsonb->>'id')::uuid, '2', 'XAUUSDm', 'XAUUSD', 'buy', 'market', 2341.50, 2329.80, null, 2, 0.01, 0.1, 0.01, 1, now() + interval '2 minutes');
select public.signal_create_receipts('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  perform public.receipt_open('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  perform public.receipt_copy('entry', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  perform public.receipt_copy('sl', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  perform public.receipt_copy('lot', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
end $$;
reset role;
do $$ begin
  perform public.receipts_resolve('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  assert (select status from public.receipts where signal_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and user_id = '22222222-2222-2222-2222-222222222222') = 'likely_taken', 'no-TP copy heuristic';
end $$;
rollback;
select 'ALL ASSERTIONS PASSED' as result;
