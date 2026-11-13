import { test } from "node:test";
import assert from "node:assert/strict";
import { eaLine, estimatedWin, money, moneyFromPips, pct, pickMovePct, stockLine, totals, wannLine } from "../src/lib/portfolio.ts";
import type { Receipt, Signal, StockPick, StockPosition, WannCall } from "../src/lib/types.ts";

const pick = (o: Partial<StockPick> = {}): StockPick => ({ id: "k1", symbol: "ACME", name: "Acme Corp", exchange: "NASDAQ", industry: "Software", logo_url: null, website: null, kind: "catalyst", horizon: "swing",
  headline: "", description: null, reasons: [], risks: [], facts: [], investors: [], score: 80, entry_price: 100, buy_below: 103, stop_price: 92, target_price: 116,
  status: "open", close_reason: null, close_price: null, result_pct: null, last_price: 110, last_price_at: null, expires_at: null, is_test: false, sent_at: "2026-11-02T21:40:00Z", closed_at: null, created_at: "2026-11-02T21:40:00Z", ...o });
const pos = (o: Partial<StockPosition> = {}): StockPosition => ({ id: "p1", user_id: "u", pick_id: "k1", amount_usd: 500, buy_price: 100, bought_at: "2026-11-03T14:40:00Z", sell_price: null, sold_at: null, ...o });
const sig = (o: Partial<Signal> = {}): Signal => ({ id: "s1", ea_source_id: null, ea_uid: null, source_name: null, symbol: "XAUUSD", base_symbol: "XAUUSD", direction: "buy", order_type: "market", entry: 2000, sl: 1990, tp: 2020, ea_lot: 0.1,
  digits: 2, point: 0.01, pip_size: 0.1, tick_size: 0.01, tick_value: 1, contract_size: 100, vol_min: 0.01, vol_step: 0.01, vol_max: 100, account_currency: "USD", status: "closed", expires_at: null, triggered_at: null, trigger_price: null,
  closed_at: "2026-11-04T10:00:00Z", close_price: 2020, result_pips: 200, outcome: "win", close_reason: "tp", is_test: false, sent_at: "2026-11-04T08:00:00Z", created_at: "2026-11-04T08:00:00Z", ...o });
const rec = (o: Partial<Receipt> = {}): Receipt => ({ id: "r1", signal_id: "s1", wann_call_id: null, user_id: "u", kind: "ea", delivered_at: null, opened_at: null, copied: {}, status: "taken", status_source: "swipe", user_lot: 0.1, ring_count: 1,
  question_sent_at: null, answered_at: null, user_entry: null, user_close: null, user_pips: null, stake_usd: null, payout_usd: null, profit_usd: null, ...o });
const call = (o: Partial<WannCall> = {}): WannCall => ({ id: "c1", wann_game_id: 1, sport: "Football", competition: "Liga", home: "A", away: "B", kickoff_utc: "2026-11-05T19:00:00Z", pick: "home", pick_label: "A to win", probability: 91,
  call_type: "straight", status: "finished", final_score: "2–0", outcome: "won", sent_at: null, created_at: "2026-11-04T00:00:00Z", ...o });

test("stock: value follows the latest price; a sold position keeps its sell price", () => {
  const open = stockLine(pos(), pick());
  assert.deepEqual([open.putIn, open.value, open.pnl, open.pct, open.open], [500, 550, 50, 10, true]);
  const sold = stockLine(pos({ sell_price: 90, sold_at: "2026-11-06T15:00:00Z" }), pick({ last_price: 130 }));
  assert.deepEqual([sold.value, sold.pnl, sold.open], [450, -50, false]);
});
test("stock: a pick J closed is valued at its close price until the member says they sold", () => {
  const l = stockLine(pos(), pick({ status: "closed", close_price: 92, close_reason: "stop", result_pct: -8, last_price: 95 }));
  assert.deepEqual([l.value, l.pnl, l.open], [460, -40, true]);
  assert.match(l.sub, /still holding/);
  assert.equal(pickMovePct(pick({ status: "closed", close_price: 92, result_pct: -8 })), -8);
  assert.equal(pickMovePct(pick()), 10);
});
test("ea: the member's own figure wins, then the linked account, then lot × pips", () => {
  assert.equal(moneyFromPips(sig(), 200, 0.1), 200);                       // 200 pips × 0.1 ÷ 0.01 tick × $1 × 0.1 lot
  const est = eaLine(rec(), sig());
  assert.deepEqual([est.pnl, est.estimated, est.needs], [200, true, null]);
  assert.deepEqual([eaLine(rec(), sig(), 187.4).pnl, eaLine(rec(), sig(), 187.4).estimated], [187.4, false]);
  assert.equal(eaLine(rec({ profit_usd: 150 }), sig(), 187.4).pnl, 150);
  const lossByUserPips = eaLine(rec({ user_pips: -100 }), sig());
  assert.equal(lossByUserPips.pnl, -100);
});
test("ea: no lot or no tick data means no money figure, and it says what is missing", () => {
  assert.deepEqual([eaLine(rec({ user_lot: null }), sig()).pnl, eaLine(rec({ user_lot: null }), sig()).needs], [null, "lot"]);
  assert.equal(eaLine(rec(), sig({ tick_value: null })).pnl, null);
  const running = eaLine(rec(), sig({ status: "triggered", closed_at: null, result_pips: null }));
  assert.deepEqual([running.open, running.pnl, running.needs], [true, null, null]);
});
test("wann: lost = minus the stake, won = worked out from the amount and the probability (or the entered payout), void = nothing", () => {
  assert.equal(wannLine(rec({ kind: "wann", stake_usd: 50, payout_usd: 58 }), call()).pnl, 8);
  assert.equal(wannLine(rec({ kind: "wann", stake_usd: 50 }), call({ outcome: "lost" })).pnl, -50);
  assert.equal(wannLine(rec({ kind: "wann", stake_usd: 50 }), call({ outcome: "void" })).pnl, 0);
  const won = wannLine(rec({ kind: "wann", stake_usd: 100 }), call({ probability: 90 }));           // won: worked out from the member's amount
  assert.deepEqual([won.pnl, won.estimated, won.needs], [11.11, true, null]);
  assert.deepEqual([estimatedWin(100, 80), estimatedWin(250, 90), estimatedWin(100, 100), estimatedWin(100, 0)], [25, 27.78, null, null]);
  assert.equal(wannLine(rec({ kind: "wann" }), call()).needs, "amount");
  const live = wannLine(rec({ kind: "wann", stake_usd: 50, payout_usd: 58 }), call({ status: "live", outcome: null, final_score: null }));
  assert.deepEqual([live.open, live.putIn, live.value, live.pnl], [true, 50, 50, null]);
});
test("totals: open money, unrealised and realised results, per source", () => {
  const t = totals([
    stockLine(pos(), pick()),                                                                          // open: +50
    stockLine(pos({ id: "p2", sell_price: 90, sold_at: "2026-11-06T15:00:00Z" }), pick()),            // sold: −50
    eaLine(rec(), sig()),                                                                              // +200
    eaLine(rec({ id: "r2", user_lot: null }), sig()),                                                  // unknown
    wannLine(rec({ id: "r3", kind: "wann", stake_usd: 50, payout_usd: 58 }), call()),                  // +8
    wannLine(rec({ id: "r4", kind: "wann", stake_usd: 20 }), call({ status: "live", outcome: null })), // live stake
  ]);
  assert.deepEqual([t.putIn, t.value, t.openPnl, t.closedPnl, t.pnl], [520, 570, 50, 158, 208]);
  assert.deepEqual(t.by.ea, { pnl: 200, count: 2, unknown: 1 });
  assert.deepEqual(t.by.stock, { pnl: 0, count: 2, unknown: 0 });
  assert.deepEqual(t.by.wann, { pnl: 8, count: 2, unknown: 0 });
});
test("money and percent formatting", () => {
  assert.deepEqual([money(1240.5), money(-80), money(0), money(null), money(500, false)], ["+$1,240.50", "−$80", "$0", "–", "$500"]);
  assert.deepEqual([pct(10), pct(-8.04), pct(0), pct(null)], ["+10%", "−8%", "0%", "–"]);
});
