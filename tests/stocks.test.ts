import { test } from "node:test";
import assert from "node:assert/strict";
import { RULES, atr, describe, horizonFor, latest13F, marketUptrend, parse13F, plan, prevWeekday, resultPct, score, seedEarnings, seedIpos, settle, sma, tickerFromFigi,
  type Bar, type EarningsRow, type IpoRow, type Metric, type Profile2, type Quote, type Seed } from "../supabase/functions/_shared/stockRules.ts";

const today = "2026-11-10";   // a Tuesday
const er = (o: Partial<EarningsRow>): EarningsRow => ({ date: today, epsActual: 1.3, epsEstimate: 1, hour: "bmo", revenueActual: 106e6, revenueEstimate: 100e6, symbol: "ACME", ...o });
const quote = (o: Partial<Quote> = {}): Quote => ({ c: 109, d: 9, dp: 9, h: 110, l: 102, o: 103, pc: 100, t: 0, ...o });
const profile = (o: Partial<Profile2> = {}): Profile2 => ({ exchange: "NASDAQ NMS - GLOBAL MARKET", marketCapitalization: 8400, name: "Acme Corp", ticker: "ACME", ipo: "2015-05-01", ...o });
const metric = (o: Metric = {}): Metric => ({ "52WeekHigh": 112, "52WeekLow": 60, "13WeekPriceReturnDaily": 22, "26WeekPriceReturnDaily": 30, "3MonthAverageTradingVolume": 2.5, beta: 1.2, revenueGrowthTTMYoy: 28, ...o });

test("earnings seeds: only reports whose first market reaction is today, with a real beat", () => {
  assert.equal(prevWeekday("2026-11-09"), "2026-11-06");                                    // Monday → Friday
  const seeds = seedEarnings([
    er({}),                                                                                   // before the open today
    er({ symbol: "AMC", date: "2026-11-09", hour: "amc" }),                                   // after yesterday's close
    er({ symbol: "LATE", hour: "amc" }),                                                      // after today's close: reacts tomorrow
    er({ symbol: "OLD", date: "2026-11-09", hour: "bmo" }),                                   // reacted yesterday
    er({ symbol: "MISS", epsActual: 0.9 }),
    er({ symbol: "TINY", epsActual: 0.03, epsEstimate: 0.01 }),                               // estimate too small for a meaningful percent
    er({ symbol: "REV", revenueActual: 90e6 }),                                               // sales missed
    er({ symbol: "NOEST", epsEstimate: null }),
    er({ symbol: "BRK.B" }),                                                                  // not a plain ticker
    er({ symbol: "BIG", epsActual: 2 }),
  ], today);
  assert.deepEqual(seeds.map((s) => s.symbol), ["BIG", "ACME", "AMC"]);
  assert.deepEqual([seeds[1].epsSurprise, seeds[1].revSurprise], [30, 6]);
});

test("ipo seeds: priced, big enough, on a main exchange, not a shell, outside the first weeks and the lock-up window", () => {
  const ipo = (o: Partial<IpoRow>): IpoRow => ({ date: "2026-09-01", exchange: "NASDAQ Global Select", name: "Klar Group", price: "40.00", status: "priced", symbol: "KLAR", totalSharesValue: 1.4e9, ...o });
  const seeds = seedIpos([
    ipo({}),
    ipo({ symbol: "SPAC", name: "Bright Acquisition Corp" }),
    ipo({ symbol: "EXP", status: "expected", price: "15.00-17.00" }),
    ipo({ symbol: "SMAL", totalSharesValue: 20e6 }),
    ipo({ symbol: "NEW", date: "2026-11-02" }),                 // 8 days old
    ipo({ symbol: "LOCK", date: "2026-05-14" }),                // 180 days old: lock-up expiry
    ipo({ symbol: "OTC", exchange: "OTC Markets" }),
    ipo({ symbol: "AGED", date: "2025-12-01", totalSharesValue: 200e6 }),
  ], today);
  assert.deepEqual(seeds.map((s) => s.symbol), ["KLAR", "AGED"]);
  assert.deepEqual([seeds[0].ipoPrice, seeds[0].raised], [40, 1.4e9]);
});

test("catalyst score: a strong beat near the high scores well; the filters say why a stock is passed over", () => {
  const seed = seedEarnings([er({})], today)[0];
  const s = score(seed, quote(), profile(), metric(), today);
  assert.equal(s.ok, true);
  assert.ok(s.score >= 80 && s.score <= 98, `score ${s.score}`);
  assert.equal(s.m.capUsd, 8.4e9); assert.equal(s.m.dollarVol, 2.5e6 * 109);
  assert.equal(s.m.offHigh, 2.7);                                                             // (112 − 109) ÷ 112
  const why = (q: Partial<Quote>, p: Partial<Profile2> = {}, m: Metric = {}, traded = true) => score(seed, quote(q), profile(p), metric(m), today, traded).reject;
  assert.match(why({ dp: 0.5 }) ?? "", /did not reward/);
  assert.match(why({ dp: 41 }) ?? "", /too late/);
  assert.match(why({ c: 103, h: 110, l: 102 }) ?? "", /Sold off/);
  assert.match(why({ c: 4, h: 4.1, l: 3.8 }) ?? "", /under \$5/);
  assert.match(why({}, { marketCapitalization: 200 }) ?? "", /too small/);
  assert.match(why({}, { exchange: "OTC MARKETS" }) ?? "", /NYSE or Nasdaq/);
  assert.match(why({}, {}, { "3MonthAverageTradingVolume": 0.01 }) ?? "", /thinly traded/);
  assert.match(why({}, {}, {}, false) ?? "", /Did not trade today/);
  const weak = score({ ...seed, epsSurprise: 6, revSurprise: null, epsActual: -0.1 }, quote({ c: 103, dp: 2.2, h: 104, l: 101 }), profile({ marketCapitalization: 900 }), metric({ "52WeekHigh": 160, "13WeekPriceReturnDaily": -10, "26WeekPriceReturnDaily": -20, revenueGrowthTTMYoy: 2 }), today);
  assert.ok(weak.ok && weak.score < RULES.minEpsSurprise * 10 && weak.score < 40, `weak ${weak.score}`);
});

test("ipo score: above the offer and at its high passes; below the offer or far from the high does not", () => {
  const seed: Seed = { symbol: "KLAR", source: "ipo", ipoDate: "2026-09-01", ipoPrice: 40, raised: 1.4e9 };
  const q = quote({ c: 49.6, dp: 3.1, h: 50, l: 48, o: 48.2, pc: 48.1 });
  const s = score(seed, q, profile({ marketCapitalization: 15000, ipo: "2026-09-01" }), metric({ "52WeekHigh": 50.5, "52WeekLow": 38, "3MonthAverageTradingVolume": null, "10DayAverageTradingVolume": 4 }), today);
  assert.equal(s.ok, true);
  assert.deepEqual([s.m.aboveOffer, s.m.listedDays, s.m.offHigh], [24, 70, 1.8]);
  assert.ok(s.score >= 70, `score ${s.score}`);
  assert.match(score(seed, quote({ c: 39, dp: 1, h: 39.5, l: 38 }), profile({ marketCapitalization: 15000 }), metric({ "52WeekHigh": 50 }), today).reject ?? "", /offer price/);
  assert.match(score(seed, quote({ c: 44, dp: 1, h: 44.5, l: 43 }), profile({ marketCapitalization: 15000 }), metric({ "52WeekHigh": 60 }), today).reject ?? "", /below its high/);
  assert.match(score(seed, quote({ c: 49.6, dp: -1, h: 50, l: 48 }), profile({ marketCapitalization: 15000 }), metric({ "52WeekHigh": 50.5 }), today).reject ?? "", /Down today/);
});

const bars = (n: number, f: (i: number) => number): Bar[] => Array.from({ length: n }, (_, i) => { const c = f(i); return { t: i, o: c - 0.5, h: c + 1, l: c - 1, c, v: 1e6 }; });
test("plan: stop two ATRs away within 5–12%, target twice the risk; long holds have no stop", () => {
  const flat = bars(30, () => 100);
  assert.equal(atr(flat), 2);
  assert.equal(sma(flat, 20), 100);
  assert.deepEqual(plan("swing", quote({ c: 50, l: 48 }), 2), { horizon: "swing", entry: 50, buyBelow: 51.5, stop: 46, target: 58, expiresInDays: 30 });
  assert.equal(plan("swing", quote({ c: 50, l: 48 }), 0.2).stop, 47.5);                          // quiet stock: never closer than 5%
  assert.equal(plan("swing", quote({ c: 50, l: 48 }), 9).stop, 44);                              // wild stock: never further than 12%
  assert.equal(plan("swing", quote({ c: 50, l: 46 }), null).stop, 45.77);                        // no history: just under the day's low
  assert.deepEqual(plan("long", quote({ c: 50 }), 2), { horizon: "long", entry: 50, buyBelow: 52.5, stop: null, target: null, expiresInDays: 365 });
  assert.equal(marketUptrend(bars(250, (i) => 100 + i * 0.1)), true);
  assert.equal(marketUptrend(bars(250, (i) => 200 - i * 0.2)), false);
  assert.equal(marketUptrend(flat), null);
});

test("horizon: long needs size, growth, profit and analysts on side; everything else is a swing", () => {
  const seed = seedEarnings([er({})], today)[0];
  const d = score(seed, quote(), profile(), metric(), today).m;
  assert.equal(horizonFor(seed, d, { buy: 10, strongBuy: 4, hold: 4, sell: 1, strongSell: 0 }), "long");
  assert.equal(horizonFor(seed, d, { buy: 2, strongBuy: 1, hold: 10, sell: 4, strongSell: 2 }), "swing");
  assert.equal(horizonFor(seed, { ...d, revGrowth: 4 }, null), "swing");
  assert.equal(horizonFor(seed, { ...d, capUsd: 9e8 }, null), "swing");
  assert.equal(horizonFor({ ...seed, epsActual: -0.2 }, d, null), "swing");
});

test("describe: the words come from the numbers, and the risks fit the stock", () => {
  const seed = seedEarnings([er({})], today)[0];
  const d = score(seed, quote(), profile(), metric({ beta: 1.8 }), today).m;
  const t = describe(seed, d, { horizon: "swing", rec: { buy: 10, strongBuy: 4, hold: 4, sell: 1, strongSell: 0 }, uptrend: false });
  assert.equal(t.headline, "Beat earnings by 30% and closed up 9%, close to its 52-week high.");
  assert.deepEqual(t.reasons.map((r) => r.label), ["Earnings beat by 30%", "Sales beat too", "Buyers stepped in", "Close to its 52-week high", "The business is growing", "Analysts are positive"]);
  assert.match(t.reasons[0].detail, /\$1\.30 a share against the \$1\.00 analysts expected, on 10 Nov/);
  assert.ok(t.risks.some((r) => /1\.8 times/.test(r)) && t.risks.some((r) => /200-day average/.test(r)));
  assert.deepEqual(t.facts.slice(0, 2), [{ label: "Company value", value: "$8.4B" }, { label: "Sales growth (1 year)", value: "+28%" }]);
  const ipoSeed: Seed = { symbol: "KLAR", source: "ipo", ipoDate: "2026-09-01", ipoPrice: 40, raised: 1.4e9 };
  const di = score(ipoSeed, quote({ c: 49.6, dp: 3.1, h: 50, l: 48 }), profile({ marketCapitalization: 15000 }), metric({ "52WeekHigh": 50.5 }), today).m;
  const ti = describe(ipoSeed, di, { horizon: "swing", rec: null, uptrend: true });
  assert.equal(ti.headline, "Listed 10 weeks ago, holding 24% above its offer price and 1.8% from its high.");
  assert.ok(ti.risks.some((r) => /around 28 Feb/.test(r)), ti.risks.join(" | "));
});

test("settle: stop, target, a gap through a level, both in one day, and the time stop", () => {
  const k = { horizon: "swing" as const, entry_price: 100, stop_price: 92, target_price: 116, expires_at: "2026-12-10T00:00:00Z" };
  const now = Date.parse("2026-11-20T15:00:00Z");
  assert.deepEqual(settle(k, quote({ c: 105, h: 106, l: 99, o: 100 }), now), { close: null, price: 105 });
  assert.deepEqual(settle(k, quote({ c: 93, h: 99, l: 91, o: 98 }), now), { close: "stop", price: 92 });
  assert.deepEqual(settle(k, quote({ c: 88, h: 90, l: 87, o: 89 }), now), { close: "stop", price: 89 });          // gapped below the stop
  assert.deepEqual(settle(k, quote({ c: 117, h: 118, l: 104, o: 105 }), now), { close: "target", price: 116 });
  assert.deepEqual(settle(k, quote({ c: 121, h: 123, l: 119, o: 120 }), now), { close: "target", price: 120 });   // gapped above the target
  assert.deepEqual(settle(k, quote({ c: 100, h: 117, l: 91, o: 100 }), now).close, "stop");                       // both: assume the worse
  assert.deepEqual(settle(k, quote({ c: 104, h: 106, l: 99, o: 100 }), Date.parse("2026-12-11T00:00:00Z")), { close: "time", price: 104 });
  assert.deepEqual(settle({ ...k, horizon: "long", stop_price: null, target_price: null }, quote({ c: 60, h: 61, l: 55, o: 58 }), now), { close: null, price: 60 });
  assert.deepEqual([resultPct(100, 116), resultPct(100, 92)], [16, -8]);
});

test("13F: rows for one security add up, options and bonds are left out, namespaces are tolerated", () => {
  const row = (issuer: string, cusip: string, value: number, shares: number, extra = "", type = "SH") => `<infoTable><nameOfIssuer>${issuer}</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>${cusip}</cusip><value>${value}</value><shrsOrPrnAmt><sshPrnamt>${shares}</sshPrnamt><sshPrnamtType>${type}</sshPrnamtType></shrsOrPrnAmt>${extra}<investmentDiscretion>DFND</investmentDiscretion></infoTable>`;
  const xml = `<informationTable>${row("ALLY FINL INC", "02005N100", 577211815, 12561737)}${row("ALLY FINL INC", "02005N100", 128838056, 2803875)}${row("APPLE INC", "037833100", 60000000000, 300000000)}${row("AT&amp;T INC", "00206R102", 5000, 100)}${row("NVIDIA CORP", "67066G104", 900, 10, "<putCall>Put</putCall>")}${row("SOME BOND", "123456AB7", 800, 1000, "", "PRN")}</informationTable>`;
  const h = parse13F(xml);
  assert.deepEqual(h.map((x) => x.cusip), ["037833100", "02005N100", "00206R102"]);
  assert.deepEqual([h[1].value, h[1].shares, h[2].issuer], [706049871, 15365612, "AT&T INC"]);
  assert.equal(parse13F(xml.replace(/<(\/?)(infoTable|cusip|value|nameOfIssuer|titleOfClass|sshPrnamt|sshPrnamtType)>/g, "<$1ns1:$2>")).length, 3);
  assert.deepEqual(latest13F({ filings: { recent: { form: ["4", "13F-NT", "13F-HR", "13F-HR"], accessionNumber: ["a", "b", "0001193125-26-352200", "old"], filingDate: ["", "", "2026-08-14", ""], reportDate: ["", "", "2026-06-30", ""] } } }), { accession: "0001193125-26-352200", filed: "2026-08-14", period: "2026-06-30" });
  assert.equal(latest13F({ filings: { recent: { form: ["4"] } } }), null);
  assert.equal(tickerFromFigi({ data: [{ ticker: "BRK/B", securityType: "Common Stock", marketSector: "Equity" }] }), "BRK.B");
  assert.equal(tickerFromFigi({ data: [] }), null);
});
