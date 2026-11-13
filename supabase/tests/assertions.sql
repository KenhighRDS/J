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

-- ---------- stocks + portfolio ----------
reset role;
insert into public.stock_picks (id, symbol, name, kind, horizon, headline, score, entry_price, buy_below, stop_price, target_price, last_price, sent_at)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'ACME', 'Acme Corp', 'catalyst', 'swing', 'Beat earnings', 84, 100, 103, 92, 116, 110, now());
insert into public.stock_picks (id, symbol, name, kind, horizon, headline, score, entry_price, last_price, sent_at, is_test)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'TEST', 'Test Corp', 'catalyst', 'long', 'Test pick', 50, 10, 10, now(), true);
do $$ begin
  -- one open pick per symbol (test picks aside)
  begin
    insert into public.stock_picks (symbol, name, kind, horizon, headline, score, entry_price, sent_at) values ('ACME', 'Acme Corp', 'ipo', 'swing', 'again', 70, 101, now());
    raise exception 'a second open ACME pick was accepted';
  exception when unique_violation then null; end;
end $$;
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ declare p public.stock_positions; r public.receipts; begin
  assert (select count(*) from public.stock_picks) = 1, 'member sees the sent pick but not the test pick';
  p := public.stock_take('cccccccc-cccc-cccc-cccc-cccccccccccc', 500);
  assert p.amount_usd = 500 and p.buy_price = 110, 'take: price defaults to the latest price';
  p := public.stock_take('cccccccc-cccc-cccc-cccc-cccccccccccc', 750.555, 108);
  assert p.amount_usd = 750.56 and p.buy_price = 108 and (select count(*) from public.stock_positions) = 1, 'take again edits the one row';
  p := public.stock_sell('cccccccc-cccc-cccc-cccc-cccccccccccc');
  assert p.sell_price = 110 and p.sold_at is not null, 'sell: price defaults to the latest price';
  p := public.stock_sell('cccccccc-cccc-cccc-cccc-cccccccccccc', null, true);
  assert p.sell_price is null and p.sold_at is null, 'undo the sale';
  begin perform public.stock_take('cccccccc-cccc-cccc-cccc-cccccccccccc', 0); raise exception 'zero amount accepted'; exception when sqlstate 'P0001' then null; end;
  begin perform public.stock_take('dddddddd-dddd-dddd-dddd-dddddddddddd', 100); raise exception 'member took a test pick'; exception when sqlstate 'P0002' then null; end;
  begin perform public.admin_set_data_key('finnhub_key', 'x'); raise exception 'member set a data key'; exception when insufficient_privilege then null; end;
  begin perform public.data_key('finnhub_key'); raise exception 'member read a data key'; exception when insufficient_privilege then null; end;
  -- money on a receipt the member holds (the EA signal from above)
  r := public.receipt_set_money(p_signal => 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', p_lot => 0.25, p_profit => -12.345);
  assert r.user_lot = 0.25 and r.profit_usd = -12.35, 'lot and own result saved';
  r := public.receipt_set_money(p_signal => 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', p_clear => true);
  assert r.profit_usd is null and r.user_lot = 0.25, 'clear wipes money, keeps the lot';
  begin perform public.receipt_set_money(p_signal => 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', p_stake => -5); raise exception 'negative stake accepted'; exception when sqlstate 'P0001' then null; end;
  perform public.stock_untake('cccccccc-cccc-cccc-cccc-cccccccccccc');
  assert (select count(*) from public.stock_positions) = 0, 'untake removes the position';
end $$;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$ begin
  begin perform public.stock_sell('cccccccc-cccc-cccc-cccc-cccccccccccc'); raise exception 'sold a position that is not there'; exception when sqlstate 'P0002' then null; end;
end $$;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert (select count(*) from public.stock_picks) = 2, 'admin sees the test pick too';
  perform public.admin_set_data_key('finnhub_key', '  abc123  ');
  perform public.admin_set_data_key('sec_contact', 'owner@example.com');
  assert public.admin_data_keys() = '{"finnhub_key": true, "massive_key": false, "sec_contact": "owner@example.com"}'::jsonb, 'keys: set or not, never the value';
  begin perform public.admin_set_data_key('cron_key', 'x'); raise exception 'unknown key accepted'; exception when sqlstate 'P0001' then null; end;
end $$;
reset role;
do $$ declare inv uuid; begin
  assert public.data_key('finnhub_key') = 'abc123' and public.data_key('cron_key') is null, 'service role reads only the data keys';
  assert (select count(*) from public.investors) = 17, 'investors seeded';
  select id into inv from public.investors where cik = 1067983;
  insert into public.investor_holdings (investor_id, cusip, issuer, value_usd, shares, pct) values (inv, '037833100', 'APPLE INC', 6e10, 3e8, 20), (inv, '02005N100', 'ALLY FINL INC', 7e8, 1.5e7, 0.2);
  assert (select count(*) from public.stock_unmapped_cusips(10)) = 2, 'two CUSIPs to look up';
  insert into public.cusip_map (cusip, symbol) values ('037833100', 'AAPL'), ('02005N100', null);
  assert public.stock_apply_cusip_map() = 1, 'one ticker applied';
  assert (select symbol from public.investor_holdings where cusip = '037833100') = 'AAPL', 'ticker on the holding';
  assert (select count(*) from public.stock_unmapped_cusips(10)) = 0, 'a CUSIP with no ticker is not asked for again';
  assert public.stocks_due_what() in ('', 'scan', 'track', 'investors'), 'due check runs';
  perform public.admin_set_data_key('finnhub_key', null) from (select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true)) x;
  assert public.data_key('finnhub_key') is null, 'an empty value removes the key';
end $$;

-- ---------- default amount: Wann stake and stock amount without asking ----------
reset role;
insert into public.wann_calls (id, wann_game_id, sport, competition, home, away, kickoff_utc, pick, pick_label, probability, call_type)
values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 9001, 'Football', 'Liga', 'A', 'B', now() + interval '1 day', 'home', 'A wins', 91, 'straight'),
       ('ffffffff-ffff-ffff-ffff-ffffffffffff', 9002, 'Football', 'Liga', 'C', 'D', now() + interval '1 day', 'home', 'C wins', 90, 'straight');
insert into public.receipts (kind, wann_call_id, user_id) values ('wann', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '22222222-2222-2222-2222-222222222222'), ('wann', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '22222222-2222-2222-2222-222222222222');
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ declare r public.receipts; p public.stock_positions; pr public.profiles; begin
  assert (select default_amount from public.profiles where id = '22222222-2222-2222-2222-222222222222') = 100, 'default amount starts at 100';
  r := public.receipt_take(p_call => 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
  assert r.status = 'taken' and r.stake_usd = 100, 'taking a Wann call stakes the default amount';
  p := public.stock_take('cccccccc-cccc-cccc-cccc-cccccccccccc');
  assert p.amount_usd = 100 and p.buy_price = 110, 'I bought it without an amount uses the default at the latest price';
  pr := public.profile_set_default_amount(250.005);
  assert pr.default_amount = 250.01, 'default amount saved';
  r := public.receipt_set_money(p_call => 'ffffffff-ffff-ffff-ffff-ffffffffffff', p_stake => 40);
  r := public.receipt_answer(true, p_call => 'ffffffff-ffff-ffff-ffff-ffffffffffff');
  assert r.status = 'taken' and r.stake_usd = 40, 'an amount the member entered is kept';
  assert (select stake_usd from public.receipts where wann_call_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' and user_id = '22222222-2222-2222-2222-222222222222') = 100, 'changing the default does not rewrite calls already taken';
  p := public.stock_take('cccccccc-cccc-cccc-cccc-cccccccccccc');
  assert p.amount_usd = 250.01, 'the new default applies from now on';
  begin perform public.profile_set_default_amount(0); raise exception 'zero default accepted'; exception when sqlstate 'P0001' then null; end;
  r := public.receipt_payout_asked('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
  assert r.payout_asked_at is not null and r.payout_usd is null, 'the payout question is remembered as asked';
  assert (public.receipt_payout_asked('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee')).payout_asked_at = r.payout_asked_at, 'asking is recorded once';
  perform public.stock_untake('cccccccc-cccc-cccc-cccc-cccccccccccc');
end $$;
reset role;
do $$ begin
  -- an EA receipt is never given a stake
  update public.receipts set status = 'taken' where kind = 'ea' and user_id = '22222222-2222-2222-2222-222222222222';
  assert not exists (select 1 from public.receipts where kind = 'ea' and stake_usd is not null), 'J trades get no stake';
end $$;
rollback;
select 'ALL ASSERTIONS PASSED' as result;
