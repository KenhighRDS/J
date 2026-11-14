import { test } from "node:test";
import assert from "node:assert/strict";
import { CRULES, atr, candles, coinUsd, describeCoin, holders, horizonFor, market, plan, scoreCoin, signals, sma, universe, type Candle, type Market, type Ticker } from "../supabase/functions/_shared/cryptoRules.ts";

const DAY = 864e5, T0 = Date.UTC(2026, 0, 1);
/** Daily candles from a list of closes: each day opens at the prior close and has a 2% range around its body. */
const series = (closes: number[], vol: (i: number) => number = () => 20e6): Candle[] => closes.map((c, i) => { const o = i ? closes[i - 1] : c; return { t: T0 + i * DAY, o, h: Math.max(o, c) * 1.01, l: Math.min(o, c) * 0.99, c, q: vol(i) }; });
const flatThenBreak = (n: number, base = 100, jump = 1.08) => [...Array.from({ length: n - 1 }, (_, i) => base * (1 + Math.sin(i / 5) * 0.02 + i * 0.0004)), base * (1 + (n - 1) * 0.0004) * jump];
const up: Market = { uptrend: true, ret30: 4 }, down: Market = { uptrend: false, ret30: -16 };

test("universe: the most traded coins against USDT, without stablecoins, wrapped copies and leveraged tokens", () => {
  const t = (symbol: string, quoteVolume: number): Ticker => ({ symbol, lastPrice: "1", openPrice: "1", highPrice: "1", lowPrice: "1", quoteVolume: String(quoteVolume) });
  const u = universe([t("BTCUSDT", 1.4e9), t("ETHUSDT", 5e8), t("USDCUSDT", 9e8), t("WBTCUSDT", 5e7), t("BTCUPUSDT", 5e7), t("ETHBTC", 9e8), t("PEPEUSDT", 4e7), t("TINYUSDT", 1e6), t("SUPUSDT", 2e7), t("PAXGUSDT", 3e7)]);
  assert.deepEqual(u.map((x) => x.symbol), ["BTC", "ETH", "PEPE", "SUP"]);          // SUP is a coin, not a leveraged token (too short to be one)
  assert.deepEqual([u[0].pair, u[0].volume], ["BTCUSDT", 1.4e9]);
});

test("candles: the day still forming is dropped", () => {
  const row = (i: number) => [T0 + i * DAY, "10", "11", "9", "10.5", "1000", T0 + (i + 1) * DAY - 1, "10500", 5, "0", "0", "0"];
  const cs = candles([row(0), row(1), row(2)], T0 + 2 * DAY + 3600e3);
  assert.equal(cs.length, 2);
  assert.deepEqual(cs[1], { t: T0 + DAY, o: 10, h: 11, l: 9, c: 10.5, q: 10500 });
});

test("signals: new high length, volume surge, averages and strength against Bitcoin", () => {
  const cs = series(flatThenBreak(259), (i) => (i === 258 ? 50e6 : 20e6));
  const s = signals(cs, up)!;
  assert.equal(s.highDays, 258);                                   // highest close of the whole window
  assert.deepEqual([s.volSurge, s.ageCapped, s.age], [2.5, true, 259]);
  assert.ok(s.dp > 5 && s.dp < 9 && s.rangePos! > 0.8, `dp ${s.dp} pos ${s.rangePos}`);
  assert.ok(s.sma50! < s.price && s.sma200! < s.price && s.atr14! > 0);
  assert.equal(s.vsBtc30, Math.round((s.ret30! - 4) * 10) / 10);
  assert.equal(signals(series([1, 2, 3]), up), null);              // not enough history to say anything
  assert.equal(sma(cs, 300), null); assert.equal(atr(cs.slice(0, 5)), null);
  assert.deepEqual(market(series(Array.from({ length: 220 }, (_, i) => 100 - i * 0.2))), { uptrend: false, ret30: -9.6 });
});

test("breakout score: a new multi-month high on volume passes; the filters say why a coin is passed over", () => {
  const good = scoreCoin(signals(series(flatThenBreak(259), (i) => (i === 258 ? 300e6 : 110e6)), up)!);
  assert.deepEqual([good.ok, good.kind], [true, "catalyst"]);
  assert.ok(good.score >= 75, `score ${good.score} ${JSON.stringify(good.parts)}`);
  const why = (closes: number[], vol: (i: number) => number, m = up) => scoreCoin(signals(series(closes, vol), m)!).reject ?? "";
  const n = 259, surge = (i: number) => (i === n - 1 ? 60e6 : 20e6);
  assert.match(why(flatThenBreak(n, 100, 1.0), surge), /Too small a move|Only its highest|Did not close/);
  assert.match(why(flatThenBreak(n, 100, 1.5), surge), /too late to chase/);
  assert.match(why(flatThenBreak(n), () => 20e6), /No rise in volume/);
  assert.match(why(flatThenBreak(n), (i) => (i === n - 1 ? 9e6 : 3e6)), /thinly traded/);
  const fading = series(flatThenBreak(n), surge); fading[n - 1].h = fading[n - 1].c * 1.2;          // spiked, then sold off
  assert.match(scoreCoin(signals(fading, up)!).reject ?? "", /Sold off/);
  const lower = [...Array.from({ length: n - 1 }, (_, i) => 200 - i * 0.5), 76];                      // a bounce inside a downtrend
  assert.match(why(lower, surge), /Did not close at a new high|Only its highest|Below its 50-day/);
});

test("new listing score: above its first day and at its high passes; below its first day does not", () => {
  const closes = [1, ...Array.from({ length: 58 }, (_, i) => 1.1 + i * 0.012), 1.9];
  const s = signals(series(closes, (i) => (i === 59 ? 60e6 : 25e6)), up, 260)!;
  const sc = scoreCoin(s);
  assert.deepEqual([sc.ok, sc.kind, s.ageCapped, s.age], [true, "ipo", false, 60]);
  assert.ok(sc.score >= 70, `score ${sc.score} ${JSON.stringify(sc.parts)}`);
  const sunk = scoreCoin(signals(series([1, ...Array.from({ length: 58 }, () => 0.7), 0.74], () => 30e6), up)!);
  assert.match(sunk.reject ?? "", /first day/);
  assert.match(scoreCoin(signals(series([1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9], () => 30e6), up)!).reject ?? "", /less than two weeks/);
});

test("plan: stop 2.5 ATRs away within 8–20%, target twice the risk; only old, heavily traded coins become long-term holds", () => {
  const s = signals(series(flatThenBreak(259), (i) => (i === 258 ? 300e6 : 110e6)), up)!;
  const p = plan("swing", s);
  assert.ok(p.stop! >= s.price * 0.8 - 1e-9 && p.stop! <= s.price * 0.92 + 1e-9, `stop ${p.stop}`);
  assert.ok(Math.abs(p.target! - (s.price + 2 * (s.price - p.stop!))) / s.price < 1e-3);
  assert.equal(plan("swing", { ...s, price: 0.0000123456, atr14: 0.0000001 }).stop, 0.000011358);       // five significant figures, 8% floor
  assert.deepEqual([plan("long", s).stop, plan("long", s).expiresInDays], [null, CRULES.longDays]);
  assert.equal(horizonFor("catalyst", s, 2000), "long");
  assert.equal(horizonFor("catalyst", s, 400), "swing");                 // too young
  assert.equal(horizonFor("catalyst", { ...s, volume: 40e6 }, 2000), "swing");
  assert.equal(horizonFor("ipo", s, 2000), "swing");
});

test("words and holders: built from the numbers, with the weak-market warning when Bitcoin is under its 200-day average", () => {
  const sc = scoreCoin(signals(series(flatThenBreak(259), (i) => (i === 258 ? 300e6 : 110e6)), down)!);
  const t = describeCoin("SOL", sc, "swing", down, { id: "solana", name: "Solana", rank: 6, cap: 78e9, ath: 293, athChange: -48.2, circulating: 550e6, maxSupply: null, image: null, description: "x", category: "Layer 1 (L1)", homepage: null }, 2280);
  assert.match(t.headline, /^Closed at its highest close in over 9 months, up 8\.\d?%? ?on 2\.7× its usual volume\.$|^Closed at its highest close in over 9 months, up [0-9.]+% on 2\.7× its usual volume\.$/);
  assert.ok(t.reasons[0].label.startsWith("Highest close in over") && t.reasons.some((r) => r.label === "Stronger than Bitcoin"));
  assert.ok(t.risks.some((r) => /200-day average/.test(r)) && t.risks.some((r) => /20% in a day/.test(r)));
  assert.deepEqual(t.facts.slice(0, 3), [{ label: "Market value", value: "$78B" }, { label: "Rank by value", value: "#6" }, { label: "Traded per day", value: "$300M" }]);
  assert.ok(t.facts.some((f) => f.label === "Listed on Binance" && f.value === "6 years ago"));
  assert.deepEqual([coinUsd(67170.96), coinUsd(152.3), coinUsd(0.45213), coinUsd(0.0000123456)], ["$67,171", "$152.30", "$0.4521", "$0.00001235"]);
  const h = holders([{ name: "Strategy", total_holdings: 850363, total_current_value_usd: 57e9, percentage_of_total_supply: 4.049 }, { name: "Empty Co", total_holdings: 0, total_current_value_usd: 0, percentage_of_total_supply: 0 }], "BTC", "2026-11-14");
  assert.deepEqual(h, [{ name: "Strategy", firm: "850,363 BTC", value_usd: 57e9, shares: 850363, pct: 4.049, period: "2026-11-14" }]);
});
