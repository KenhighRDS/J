// Crypto pick rules, the twin of stockRules.ts: which coins become candidates, how they are scored, and the plan,
// reasons, risks and facts a pick carries. Pure functions over daily candles, so the node tests run them as shipped.
//
// Two engines, the crypto counterparts of the stock ones:
// - "catalyst" (shown as "Fresh breakout"): a liquid coin closes at its highest daily close in weeks on clearly more
//   volume than usual, above its 50-day average. Trend following is the best-documented edge in crypto: coins that
//   break to new highs on volume tend to keep going, and far more so while Bitcoin itself is in an uptrend.
// - "ipo" (shown as "New listing"): a coin listed 2 weeks to 6 months ago that holds above its first day's close and
//   pushes back to its high. Most new listings bleed after the first weeks; the few that do not are the ones kept.
// Every number comes from the exchange's candles or the data provider; a missing number fails a filter or lowers the
// score, it is never guessed.
import type { Holder } from "./stockRules.ts";

/** One closed daily candle (UTC day). `q` is the volume in dollars (USDT). */
export interface Candle { t: number; o: number; h: number; l: number; c: number; q: number }
export interface Ticker { symbol: string; lastPrice: string; openPrice: string; highPrice: string; lowPrice: string; quoteVolume: string }
export interface CoinSeed { symbol: string; pair: string; volume: number }
export interface Signals {
  price: number; dp: number; rangePos: number | null; volume: number; volSurge: number | null; highDays: number; age: number; ageCapped: boolean;
  sma20: number | null; sma50: number | null; sma200: number | null; atr14: number | null; ret30: number | null; vsBtc30: number | null;
  firstClose: number; highClose: number; offHigh: number; aboveFirst: number; highSince: string;
}
export interface Market { uptrend: boolean | null; ret30: number | null }
export interface CoinScored { ok: boolean; kind: "ipo" | "catalyst"; reject?: string; score: number; parts: Record<string, number>; s: Signals }
export interface CoinInfo { id: string; name: string; rank: number | null; cap: number | null; ath: number | null; athChange: number | null; circulating: number | null; maxSupply: number | null; image: string | null;
  description: string | null; category: string | null; homepage: string | null }

export const CRULES = {
  universe: 90, minVolume: 8e6,
  breakout: { minHighDays: 20, minMove: 3, maxMove: 35, minRangePos: 0.5, minSurge: 1.3, minVolume: 15e6, minAge: 90 },
  listing: { minAge: 14, maxAge: 180, minVolume: 10e6, minAboveFirst: 5, maxOffHigh: 12, maxMove: 35 },
  repickDays: 30, swingDays: 21, longDays: 365, buyZone: { swing: 1.04, long: 1.05 }, stopMin: 0.08, stopMax: 0.20, atrStop: 2.5, rewardToRisk: 2,
  long: { minAge: 1000, minVolume: 150e6, minHighDays: 90 }, maxOpenLong: 6, maxOpenSwing: 10,
} as const;

const r1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const DAY = 864e5;
export const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);

// ---------- universe ----------
const NOT_COINS = /^(USDC|FDUSD|TUSD|USDP|DAI|BUSD|PYUSD|USD1|USDE|USDD|XUSD|BFUSD|RLUSD|EUR|EURI|AEUR|GBP|TRY|BRL|PAXG|XAUT|WBTC|WBETH|WETH|BNSOL|STETH|WSTETH|CBBTC|LBTC)$/;
const LEVERAGED = /(UP|DOWN|BULL|BEAR)$/;
/** The most traded coins against USDT, without stablecoins, gold tokens, wrapped copies and leveraged tokens. */
export function universe(tickers: Ticker[]): CoinSeed[] {
  const out: CoinSeed[] = [];
  for (const t of tickers) {
    if (!t.symbol.endsWith("USDT")) continue;
    const base = t.symbol.slice(0, -4);
    if (!/^[A-Z0-9]{2,10}$/.test(base) || NOT_COINS.test(base) || (LEVERAGED.test(base) && base.length > 4)) continue;
    const volume = Number(t.quoteVolume);
    if (!(volume >= CRULES.minVolume) || !(Number(t.lastPrice) > 0)) continue;
    out.push({ symbol: base, pair: t.symbol, volume });
  }
  return out.sort((a, b) => b.volume - a.volume).slice(0, CRULES.universe);
}

/** Binance kline rows → closed daily candles (the candle still forming at `now` is dropped). */
export function candles(rows: unknown[][], now = Date.now()): Candle[] {
  return rows.map((r) => ({ t: Number(r[0]), o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]), q: Number(r[7]), end: Number(r[6]) }))
    .filter((k) => k.end < now && k.c > 0).map(({ end: _end, ...k }) => k);
}

// ---------- signals ----------
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
export function sma(cs: Candle[], n: number): number | null { return cs.length < n ? null : mean(cs.slice(-n).map((k) => k.c)); }
export function atr(cs: Candle[], n = 14): number | null {
  if (cs.length < n + 1) return null;
  let sum = 0;
  for (let i = cs.length - n; i < cs.length; i++) { const k = cs[i], pc = cs[i - 1].c; sum += Math.max(k.h - k.l, Math.abs(k.h - pc), Math.abs(k.l - pc)); }
  return sum / n;
}
export const ret = (cs: Candle[], n: number): number | null => (cs.length <= n ? null : r1((cs[cs.length - 1].c / cs[cs.length - 1 - n].c - 1) * 100));
/** Is Bitcoin above its 200-day average, and what did it do over 30 days? */
export function market(btc: Candle[]): Market { const a = sma(btc, 200); return { uptrend: a == null ? null : btc[btc.length - 1].c >= a, ret30: ret(btc, 30) }; }

/** Everything the rules need from a coin's daily candles (oldest first, closed only). `limit` is how many candles were
 *  asked for: a full page means the coin is at least that old, not exactly that old. */
export function signals(cs: Candle[], mkt: Market, limit = 260): Signals | null {
  if (cs.length < 8) return null;
  const last = cs[cs.length - 1], prev = cs[cs.length - 2];
  let highDays = 0;                                              // for how many days this close is the highest close
  for (let i = cs.length - 2; i >= 0 && cs[i].c < last.c; i--) highDays++;
  const before = cs.slice(-21, -1);
  const avgVol = before.length >= 10 ? mean(before.map((k) => k.q)) : null;
  const highClose = Math.max(...cs.map((k) => k.c));
  const r30 = ret(cs, 30);
  const blocker = cs.length - 2 - highDays;                      // the last candle that closed higher, if any
  return {
    price: last.c, dp: r1((last.c / prev.c - 1) * 100), rangePos: last.h > last.l ? Math.round(((last.c - last.l) / (last.h - last.l)) * 100) / 100 : null,
    volume: last.q, volSurge: avgVol && avgVol > 0 ? Math.round((last.q / avgVol) * 10) / 10 : null,
    highDays, age: cs.length, ageCapped: cs.length >= limit - 1,
    sma20: sma(cs, 20), sma50: sma(cs, 50), sma200: sma(cs, 200), atr14: atr(cs), ret30: r30, vsBtc30: r30 != null && mkt.ret30 != null ? r1(r30 - mkt.ret30) : null,
    firstClose: cs[0].c, highClose, offHigh: r1(Math.max(0, (1 - last.c / highClose) * 100)), aboveFirst: r1((last.c / cs[0].c - 1) * 100),
    highSince: utcDay(blocker >= 0 ? cs[blocker].t : cs[0].t),
  };
}

// ---------- scoring ----------
const rangePoints = (p: number | null) => (p == null ? 0 : p >= 0.75 ? 5 : p >= 0.5 ? 2 : 0);
const volumePoints = (v: number) => (v >= 200e6 ? 8 : v >= 50e6 ? 5 : v >= 15e6 ? 2 : 0);
/** Filters and scores one coin (0–100). A coin young enough is judged as a new listing, every other one as a breakout. */
export function scoreCoin(s: Signals): CoinScored {
  const young = !s.ageCapped && s.age <= CRULES.listing.maxAge;
  const kind: "ipo" | "catalyst" = young ? "ipo" : "catalyst";
  const no = (reject: string): CoinScored => ({ ok: false, kind, reject, score: 0, parts: {}, s });
  const parts: Record<string, number> = {};
  if (young) {
    const L = CRULES.listing;
    if (s.age < L.minAge) return no("Listed less than two weeks ago");
    if (s.volume < L.minVolume) return no("Too thinly traded (under $10M a day)");
    if (s.aboveFirst < L.minAboveFirst) return no("Not holding above its first day's close");
    if (s.offHigh > L.maxOffHigh) return no("Too far below its high since listing");
    if (s.dp <= 0) return no("Down on the day");
    if (s.dp > L.maxMove) return no(`Already up ${s.dp}% on the day, too late to chase`);
    parts.premium = s.aboveFirst > 150 ? 10 : r1(8 + ((clamp(s.aboveFirst, 5, 80) - 5) / 75) * 14);
    parts.high = s.offHigh <= 2 ? 22 : s.offHigh <= 6 ? 15 : 9;
    parts.day = (s.dp >= 8 ? 14 : s.dp >= 4 ? 11 : 6) + rangePoints(s.rangePos);
    parts.volume = volumePoints(s.volume) + (s.volSurge != null && s.volSurge >= 2 ? 6 : s.volSurge != null && s.volSurge >= 1.3 ? 3 : 0);
    parts.age = s.age >= 30 && s.age <= 120 ? 10 : 6;
    parts.strength = s.vsBtc30 == null ? 0 : s.vsBtc30 > 20 ? 10 : s.vsBtc30 > 5 ? 6 : s.vsBtc30 > 0 ? 3 : 0;
  } else {
    const B = CRULES.breakout;
    if (s.age < B.minAge) return no("Not enough price history yet");
    if (s.volume < B.minVolume) return no("Too thinly traded (under $15M a day)");
    if (s.highDays < B.minHighDays) return no(s.highDays === 0 ? "Did not close at a new high" : `Only its highest close in ${s.highDays} days`);
    if (s.dp < B.minMove) return no(`Too small a move (${s.dp > 0 ? "+" : ""}${s.dp}% on the day)`);
    if (s.dp > B.maxMove) return no(`Already up ${s.dp}% on the day, too late to chase`);
    if (s.rangePos != null && s.rangePos < B.minRangePos) return no("Sold off from the day's high");
    if (s.volSurge == null || s.volSurge < B.minSurge) return no("No rise in volume behind the move");
    if (s.sma50 == null || s.price < s.sma50) return no("Below its 50-day average");
    parts.breakout = s.highDays >= 180 ? 28 : s.highDays >= 90 ? 24 : s.highDays >= 40 ? 18 : 12;
    parts.volume = s.volSurge >= 3 ? 17 : s.volSurge >= 2 ? 13 : 8;
    parts.day = (s.dp >= 12 ? 9 : s.dp >= 6 ? 12 : 8) + rangePoints(s.rangePos);
    parts.trend = (s.sma200 != null && s.price > s.sma200 ? 8 : 0) + (s.sma200 != null && s.sma50 > s.sma200 ? 6 : 0);
    parts.strength = s.vsBtc30 == null ? 0 : s.vsBtc30 > 20 ? 10 : s.vsBtc30 > 5 ? 6 : s.vsBtc30 > 0 ? 3 : 0;
    parts.liquidity = volumePoints(s.volume);
    parts.room = s.sma20 != null && s.price <= s.sma20 * 1.25 ? 4 : 0;
  }
  return { ok: true, kind, score: r1(Object.values(parts).reduce((a, b) => a + b, 0)), parts, s };
}

// ---------- the pick ----------
export interface CoinPlan { horizon: "swing" | "long"; entry: number; buyBelow: number; stop: number | null; target: number | null; expiresInDays: number }
/** Long-term only for old, heavily traded coins breaking a multi-month high above their 200-day average. */
export function horizonFor(kind: "ipo" | "catalyst", s: Signals, listedDays: number | null): "swing" | "long" {
  const L = CRULES.long;
  return kind === "catalyst" && listedDays != null && listedDays >= L.minAge && s.volume >= L.minVolume && s.highDays >= L.minHighDays && s.sma200 != null && s.price > s.sma200 ? "long" : "swing";
}
/** Prices keep the precision the coin trades at: five significant figures. */
export const sig = (v: number) => (v === 0 ? 0 : Number(v.toPrecision(5)));
export function plan(horizon: "swing" | "long", s: Signals): CoinPlan {
  const entry = s.price;
  if (horizon === "long") return { horizon, entry, buyBelow: sig(entry * CRULES.buyZone.long), stop: null, target: null, expiresInDays: CRULES.longDays };
  const raw = s.atr14 != null ? entry - CRULES.atrStop * s.atr14 : entry * (1 - 0.12);
  const stop = sig(clamp(raw, entry * (1 - CRULES.stopMax), entry * (1 - CRULES.stopMin)));
  return { horizon, entry, buyBelow: sig(entry * CRULES.buyZone.swing), stop, target: sig(entry + CRULES.rewardToRisk * (entry - stop)), expiresInDays: CRULES.swingDays };
}

const pct = (v: number, sign = false) => `${sign && v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v * 10) / 10)}%`;
/** "$67,170", "$152.30", "$0.4521", "$0.00001234": as many decimals as the price needs. */
export function coinUsd(v: number): string {
  const a = Math.abs(v);
  if (a >= 1000) return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (a >= 1) return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return "$" + Number(v.toPrecision(4)).toString();
}
export function bigUsd(v: number): string {
  const a = Math.abs(v);
  return a >= 1e12 ? "$" + (v / 1e12).toFixed(2) + "T" : a >= 1e9 ? "$" + (v / 1e9).toFixed(a >= 1e10 ? 0 : 1) + "B" : a >= 1e6 ? "$" + (v / 1e6).toFixed(a >= 1e8 ? 0 : 1) + "M" : "$" + Math.round(v / 1e3) + "K";
}
/** "14 May", with the year once the date is more than about ten months back. */
const dayText = (day: string, asOf?: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC", ...(asOf && Date.parse(asOf) - Date.parse(day) > 300 * DAY ? { year: "numeric" } : {}) });
const span = (days: number) => (days < 84 ? `${Math.round(days / 7)} weeks` : days < 730 ? `${Math.round(days / 30.4)} months` : `${Math.round(days / 365)} years`);

export interface CoinText { headline: string; reasons: { label: string; detail: string }[]; risks: string[]; facts: { label: string; value: string }[] }
/** The words on a crypto pick, built only from numbers we hold. */
export function describeCoin(symbol: string, sc: CoinScored, horizon: "swing" | "long", mkt: Market, info: CoinInfo | null, listedDays: number | null, asOf: string = utcDay(Date.now())): CoinText {
  const s = sc.s; const reasons: CoinText["reasons"] = []; const risks: string[] = []; const facts: CoinText["facts"] = [];
  let headline: string;
  if (sc.kind === "catalyst") {
    const all = s.ageCapped && s.highDays >= s.age - 2;
    const high = all ? `its highest close in over ${span(s.age)}` : `its highest close in ${s.highDays} days`;
    headline = horizon === "long" ? `Back in an uptrend: ${high}, on ${s.volSurge}× its usual volume.` : `Closed at ${high}, up ${pct(s.dp)} on ${s.volSurge}× its usual volume.`;
    reasons.push({ label: all ? `Highest close in over ${span(s.age)}` : `Highest close in ${s.highDays} days`, detail: `Closed at ${coinUsd(s.price)}, above every daily close since ${dayText(s.highSince, asOf)}.` });
    reasons.push({ label: `Volume ${s.volSurge}× normal`, detail: `${bigUsd(s.volume)} traded on the day, against its 20-day average.` });
    reasons.push({ label: "Buyers in control", detail: `Up ${pct(s.dp)} on the day${s.rangePos != null && s.rangePos >= 0.5 ? `, closing in the top ${s.rangePos >= 0.75 ? "quarter" : "half"} of the day's range` : ""}.` });
    if (s.sma200 != null && s.sma50 != null && s.price > s.sma200) reasons.push({ label: s.sma50 > s.sma200 ? "In an uptrend" : "Above its long-term average", detail: s.sma50 > s.sma200 ? "Above its 50-day and 200-day averages, with the 50-day on top." : "Trading above its 200-day average." });
    risks.push("Breakouts fail often: if it closes back under the old high, the move is probably over.");
  } else {
    headline = `Listed ${span(s.age)} ago, holding ${pct(s.aboveFirst)} above its first day and ${s.offHigh < 0.5 ? "at" : `${pct(s.offHigh)} from`} its high.`;
    reasons.push({ label: `Listed ${span(s.age)} ago`, detail: `Its first day on Binance closed at ${coinUsd(s.firstClose)}.` });
    reasons.push({ label: "Holding above its first day", detail: `Trades ${pct(s.aboveFirst)} above that close. Most new listings fall below it within weeks.` });
    reasons.push({ label: s.offHigh < 0.5 ? "At a new high since listing" : "Near its high since listing", detail: `${s.offHigh < 0.5 ? "Closed at" : `${pct(s.offHigh)} below`} its highest close, up ${pct(s.dp)} on the day.` });
    risks.push("New listings are the wildest part of the market, and most of them end up below their first day.");
  }
  if (s.vsBtc30 != null && s.vsBtc30 > 5 && s.ret30 != null && mkt.ret30 != null) reasons.push({ label: "Stronger than Bitcoin", detail: `${pct(s.ret30, true)} over 30 days, against ${pct(mkt.ret30, true)} for Bitcoin.` });

  risks.push("Crypto moves fast. A fall of 20% in a day is normal for this market.");
  if (mkt.uptrend === false) risks.push("Bitcoin is below its 200-day average. When the whole market is weak, breakouts fail more often.");
  if (s.dp >= 15) risks.push(`It already rose ${pct(s.dp)} on the day. Buying after a big jump raises the chance of a pullback.`);
  if (s.volume < 50e6) risks.push("It is a smaller coin, so a few large orders can move the price.");
  if (info?.circulating && info.maxSupply && info.circulating / info.maxSupply < 0.5) risks.push(`Only ${Math.round((info.circulating / info.maxSupply) * 100)}% of the maximum supply is in circulation. The rest arrives over time and can weigh on the price.`);
  if (horizon === "long") risks.push("A long-term hold has no stop: crypto bear markets have taken even the biggest coins down by more than half.");

  if (info?.cap) facts.push({ label: "Market value", value: bigUsd(info.cap) });
  if (info?.rank) facts.push({ label: "Rank by value", value: `#${info.rank}` });
  facts.push({ label: "Traded per day", value: bigUsd(s.volume) });
  if (s.ret30 != null) facts.push({ label: "Price vs 30 days ago", value: pct(s.ret30, true) });
  if (mkt.ret30 != null) facts.push({ label: "Bitcoin, 30 days", value: pct(mkt.ret30, true) });
  if (info?.athChange != null && info.ath) facts.push({ label: "Below its all-time high", value: pct(Math.abs(info.athChange)) });
  if (listedDays != null || !s.ageCapped) facts.push({ label: "Listed on Binance", value: `${span(listedDays ?? s.age)} ago` });
  if (info?.circulating && info.maxSupply) facts.push({ label: "Supply in circulation", value: `${Math.round((info.circulating / info.maxSupply) * 100)}%` });
  return { headline, reasons: reasons.slice(0, 6), risks: risks.slice(0, 5), facts: facts.slice(0, 8) };
}

// ---------- tracking ----------
/** Today's candle as the quote the shared settle() reads. */
export const quoteOf = (k: Candle) => ({ c: k.c, h: k.h, l: k.l, o: k.o, pc: k.o, t: Math.floor(k.t / 1000) });

// ---------- big holders: public companies that hold the coin (CoinGecko treasuries) ----------
export interface TreasuryCompany { name: string; symbol?: string; total_holdings: number; total_current_value_usd: number; percentage_of_total_supply: number }
export function holders(companies: TreasuryCompany[], coin: string, asOf: string, n = 5): Holder[] {
  return [...companies].filter((c) => c.total_holdings > 0 && c.total_current_value_usd > 0).sort((a, b) => b.total_current_value_usd - a.total_current_value_usd).slice(0, n)
    .map((c) => ({ name: c.name, firm: `${Math.round(c.total_holdings).toLocaleString("en-US")} ${coin}`, value_usd: Math.round(c.total_current_value_usd), shares: c.total_holdings, pct: c.percentage_of_total_supply ?? null, period: asOf }));
}
export const TREASURY_IDS: Record<string, string> = { BTC: "bitcoin", ETH: "ethereum" };
export const dayMs = DAY;
