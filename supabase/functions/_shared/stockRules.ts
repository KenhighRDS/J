// Stock pick rules: which stocks become candidates, how they are scored, and the plan, reasons, risks and facts a pick
// carries. Pure functions (no network, no database) so the node tests run them as they are.
//
// Two engines, both built on effects with long published track records:
// - "catalyst": a company beat earnings estimates and the market rewarded it the same day. Prices tend to keep
//   drifting in the direction of an earnings surprise for weeks (post-earnings-announcement drift), more so when
//   sales beat too, the stock closes near the day's high and it already trades near its 52-week high.
// - "ipo": a company listed in about the last year that holds above its offer price and pushes to a new high
//   after its first weeks of trading (a breakout from its first base), outside the insider lock-up expiry window.
// Every number comes from the data provider; a missing number lowers the score or fails a filter, it is never guessed.

export interface Quote { c: number; d?: number | null; dp?: number | null; h: number; l: number; o: number; pc: number; t: number }
export interface Profile2 { country?: string; exchange?: string; ipo?: string; marketCapitalization?: number; name?: string; ticker?: string; weburl?: string; logo?: string; finnhubIndustry?: string }
export type Metric = Record<string, unknown>;
export interface EarningsRow { date: string; epsActual: number | null; epsEstimate: number | null; hour: string | null; revenueActual: number | null; revenueEstimate: number | null; symbol: string }
export interface IpoRow { date: string; exchange: string | null; name: string | null; price: string | number | null; status: string | null; symbol: string | null; totalSharesValue: number | null }
export interface Bar { t: number; o: number; h: number; l: number; c: number; v: number }
export interface Recommendation { buy: number; hold: number; sell: number; strongBuy: number; strongSell: number; period?: string }
export interface Holder { name: string; firm: string; value_usd: number; shares: number | null; pct: number | null; period: string | null }

export interface Seed { symbol: string; source: "earnings" | "ipo"; epsActual?: number; epsEstimate?: number; epsSurprise?: number; revSurprise?: number | null; revenueActual?: number | null; reported?: string;
  ipoDate?: string; ipoPrice?: number; raised?: number | null; name?: string | null }
export interface Scored { ok: boolean; reject?: string; score: number; parts: Record<string, number>; m: Derived }
export interface Derived { price: number; dp: number; rangePos: number | null; capUsd: number | null; dollarVol: number | null; high52: number | null; low52: number | null; offHigh: number | null;
  ret13: number | null; ret26: number | null; beta: number | null; revGrowth: number | null; netMargin: number | null; roe: number | null; debtEquity: number | null; listedDays: number | null; aboveOffer: number | null }

export const RULES = {
  seedMaxEarnings: 40, seedMaxIpos: 60,
  minEpsEstimate: 0.05, minEpsSurprise: 5, maxRevMiss: -1,
  minPrice: 5, catalystMinCapUsd: 500e6, catalystMinDollarVol: 10e6, minReaction: 2, maxReaction: 30, minRangePos: 0.4,
  ipoMinDays: 25, ipoMaxDays: 365, ipoMinRaised: 75e6, ipoMinCapUsd: 300e6, ipoMinDollarVol: 5e6, ipoMinAboveOffer: 5, ipoMaxOffHigh: 8, lockupFrom: 160, lockupTo: 195,
  repickDays: { earnings: 60, ipo: 90 },
  swingDays: 30, longDays: 365, buyZone: { swing: 1.03, long: 1.05 }, stopMin: 0.05, stopMax: 0.12, rewardToRisk: 2,
  longMinCapUsd: 2e9, longMinGrowth: 15, longMaxOffHigh: 20, longMinIpoDays: 90, maxOpenLong: 8, maxOpenSwing: 12,
} as const;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
export const plainTicker = (s: string | null | undefined): s is string => typeof s === "string" && /^[A-Z]{1,5}$/.test(s);

// ---------- dates (all "YYYY-MM-DD", New York trading days; weekends only, holidays are caught by the live check) ----------
export function nyDate(d = new Date()): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function addDays(day: string, n: number): string { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const dow = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
export const isWeekday = (day: string) => dow(day) !== 0 && dow(day) !== 6;
export function prevWeekday(day: string): string { let d = addDays(day, -1); while (!isWeekday(d)) d = addDays(d, -1); return d; }
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);

// ---------- seeds ----------
/** Earnings whose first full market reaction is `today`: reported before or during today's session, or after yesterday's close. */
export function seedEarnings(rows: EarningsRow[], today: string): Seed[] {
  const prev = prevWeekday(today); const out: Seed[] = []; const seen = new Set<string>();
  for (const r of rows) {
    if (!plainTicker(r.symbol) || seen.has(r.symbol)) continue;
    const hour = (r.hour ?? "").toLowerCase();
    const reactsToday = (r.date === today && (hour === "bmo" || hour === "dmh")) || (r.date === prev && hour === "amc");
    if (!reactsToday) continue;
    const a = num(r.epsActual), e = num(r.epsEstimate);
    if (a == null || e == null || Math.abs(e) < RULES.minEpsEstimate) continue;
    const eps = ((a - e) / Math.abs(e)) * 100;
    if (eps < RULES.minEpsSurprise) continue;
    const ra = num(r.revenueActual), re = num(r.revenueEstimate);
    const rev = ra != null && re != null && re > 0 ? ((ra - re) / re) * 100 : null;
    if (rev != null && rev < RULES.maxRevMiss) continue;
    seen.add(r.symbol);
    out.push({ symbol: r.symbol, source: "earnings", epsActual: a, epsEstimate: e, epsSurprise: r1(eps), revSurprise: rev == null ? null : r1(rev), revenueActual: ra, reported: r.date });
  }
  return out.sort((x, y) => (y.epsSurprise ?? 0) - (x.epsSurprise ?? 0)).slice(0, RULES.seedMaxEarnings);
}
/** Priced listings on NYSE / Nasdaq in about the last year, big enough to trade, that are not blank-cheque shells. */
export function seedIpos(rows: IpoRow[], today: string): Seed[] {
  const out: Seed[] = []; const seen = new Set<string>();
  for (const r of rows) {
    if (!plainTicker(r.symbol) || seen.has(r.symbol)) continue;
    if ((r.status ?? "").toLowerCase() !== "priced") continue;
    const price = num(r.price), raised = num(r.totalSharesValue);
    if (price == null || price <= 0 || raised == null || raised < RULES.ipoMinRaised) continue;
    if (!/NASDAQ|NYSE|NEW YORK/i.test(r.exchange ?? "")) continue;
    if (/acquisition|blank check|\bspac\b|\bunits?\b|\bwarrants?\b|\brights?\b/i.test(r.name ?? "")) continue;
    const days = daysBetween(r.date, today);
    if (days < RULES.ipoMinDays || days > RULES.ipoMaxDays || (days >= RULES.lockupFrom && days <= RULES.lockupTo)) continue;
    seen.add(r.symbol);
    out.push({ symbol: r.symbol, source: "ipo", ipoDate: r.date, ipoPrice: price, raised, name: r.name });
  }
  return out.sort((x, y) => (y.raised ?? 0) - (x.raised ?? 0)).slice(0, RULES.seedMaxIpos);
}

// ---------- scoring ----------
export function derive(seed: Seed, q: Quote, p: Profile2, m: Metric, today: string): Derived {
  const price = q.c; const dp = num(q.dp) ?? (q.pc > 0 ? ((q.c - q.pc) / q.pc) * 100 : 0);
  const high52 = num(m["52WeekHigh"]), low52 = num(m["52WeekLow"]);
  const hi = high52 != null ? Math.max(high52, q.h) : null;          // today's high may not be in the provider's 52-week figure yet
  const cap = num(p.marketCapitalization) ?? num(m["marketCapitalization"]);
  const vol = num(m["3MonthAverageTradingVolume"]) ?? num(m["10DayAverageTradingVolume"]);   // millions of shares a day
  const listed = seed.ipoDate ?? (p.ipo && /^\d{4}-\d{2}-\d{2}/.test(p.ipo) ? p.ipo.slice(0, 10) : null);
  return {
    price, dp: r2(dp), rangePos: q.h > q.l ? r2((q.c - q.l) / (q.h - q.l)) : null,
    capUsd: cap != null ? cap * 1e6 : null, dollarVol: vol != null ? vol * 1e6 * price : null,
    high52: hi, low52: low52 != null ? Math.min(low52, q.l) : null, offHigh: hi != null && hi > 0 ? r1(Math.max(0, ((hi - price) / hi) * 100)) : null,
    ret13: num(m["13WeekPriceReturnDaily"]), ret26: num(m["26WeekPriceReturnDaily"]), beta: num(m["beta"]),
    revGrowth: num(m["revenueGrowthTTMYoy"]), netMargin: num(m["netProfitMarginTTM"]), roe: num(m["roeTTM"]),
    debtEquity: num(m["totalDebt/totalEquityQuarterly"]) ?? num(m["totalDebt/totalEquityAnnual"]),
    listedDays: listed ? daysBetween(listed, today) : null,
    aboveOffer: seed.ipoPrice ? r1(((price - seed.ipoPrice) / seed.ipoPrice) * 100) : null,
  };
}
const usExchange = (p: Profile2) => /NASDAQ|NEW YORK STOCK EXCHANGE|NYSE/i.test(p.exchange ?? "");
const sizePoints = (cap: number | null) => (cap == null ? 0 : cap >= 10e9 ? 6 : cap >= 2e9 ? 4 : 0);
const rangePoints = (pos: number | null) => (pos == null ? 0 : pos >= 0.75 ? 6 : pos >= 0.5 ? 3 : 0);
const growthPoints = (g: number | null) => (g == null ? 0 : g >= 25 ? 10 : g >= 10 ? 6 : g > 0 ? 3 : 0);

/** Filters and scores one candidate (0–100). `tradedToday` is false when the quote is from an earlier session. */
export function score(seed: Seed, q: Quote, p: Profile2, m: Metric, today: string, tradedToday = true): Scored {
  const d = derive(seed, q, p, m, today);
  const no = (reject: string): Scored => ({ ok: false, reject, score: 0, parts: {}, m: d });
  if (!(d.price > 0)) return no("No price");
  if (!tradedToday) return no("Did not trade today");
  if (d.price < RULES.minPrice) return no(`Price under $${RULES.minPrice}`);
  if (!usExchange(p)) return no("Not listed on NYSE or Nasdaq");
  const parts: Record<string, number> = {};
  if (seed.source === "earnings") {
    if (d.capUsd == null || d.capUsd < RULES.catalystMinCapUsd) return no("Company too small (under $500M)");
    if (d.dollarVol == null || d.dollarVol < RULES.catalystMinDollarVol) return no("Too thinly traded (under $10M a day)");
    if (d.dp < RULES.minReaction) return no(`Market did not reward the earnings (${d.dp > 0 ? "+" : ""}${d.dp}% today)`);
    if (d.dp > RULES.maxReaction) return no(`Already up ${d.dp}% today, too late to chase`);
    if (d.rangePos != null && d.rangePos < RULES.minRangePos) return no("Sold off from the day's high");
    const eps = seed.epsSurprise ?? 0;
    parts.earnings = r1(8 + ((clamp(eps, 5, 40) - 5) / 35) * 14);
    parts.sales = seed.revSurprise == null ? 4 : r1(4 + clamp(seed.revSurprise * 1.5, 0, 8));
    parts.reaction = r1(6 + ((clamp(d.dp, 2, 12) - 2) / 10) * 12) + rangePoints(d.rangePos);
    parts.trend = (d.offHigh == null ? 0 : d.offHigh <= 5 ? 14 : d.offHigh <= 15 ? 9 : d.offHigh <= 25 ? 4 : 0) + (d.ret13 != null && d.ret13 > 0 ? 4 : 0) + (d.ret26 != null && d.ret26 > 0 ? 2 : 0);
    parts.growth = growthPoints(d.revGrowth);
    parts.profit = (seed.epsActual ?? 0) > 0 ? 4 : 0;
    parts.size = sizePoints(d.capUsd);
  } else {
    if (d.listedDays == null || d.listedDays < RULES.ipoMinDays || d.listedDays > RULES.ipoMaxDays) return no("Not a recent listing");
    if (d.listedDays >= RULES.lockupFrom && d.listedDays <= RULES.lockupTo) return no("Insider lock-up is about to end");
    if (d.capUsd == null || d.capUsd < RULES.ipoMinCapUsd) return no("Company too small (under $300M)");
    if (d.dollarVol == null || d.dollarVol < RULES.ipoMinDollarVol) return no("Too thinly traded (under $5M a day)");
    if (d.aboveOffer == null || d.aboveOffer < RULES.ipoMinAboveOffer) return no("Not holding above its offer price");
    if (d.offHigh == null || d.offHigh > RULES.ipoMaxOffHigh) return no("Too far below its high since listing");
    if (d.dp <= 0) return no("Down today");
    if (d.dp > RULES.maxReaction) return no(`Already up ${d.dp}% today, too late to chase`);
    parts.offer = d.aboveOffer > 100 ? 12 : r1(8 + ((clamp(d.aboveOffer, 5, 60) - 5) / 55) * 12);
    parts.high = d.offHigh <= 2 ? 20 : d.offHigh <= 5 ? 14 : 8;
    parts.today = (d.dp >= 4 ? 14 : d.dp >= 2 ? 10 : 5) + rangePoints(d.rangePos);
    parts.deal = (seed.raised ?? 0) >= 1e9 ? 12 : (seed.raised ?? 0) >= 300e6 ? 9 : (seed.raised ?? 0) >= 100e6 ? 6 : 3;
    parts.age = d.listedDays >= 40 && d.listedDays < RULES.lockupFrom ? 10 : d.listedDays > RULES.lockupTo ? 7 : 5;
    parts.growth = growthPoints(d.revGrowth);
    parts.size = d.capUsd >= 2e9 ? 6 : d.capUsd >= 1e9 ? 4 : 0;
  }
  return { ok: true, score: r1(Object.values(parts).reduce((a, b) => a + b, 0)), parts, m: d };
}

// ---------- price history (optional second data source) ----------
/** Average true range over the last `n` bars (plain mean), or null when there is not enough history. */
export function atr(bars: Bar[], n = 14): number | null {
  if (bars.length < n + 1) return null;
  let sum = 0;
  for (let i = bars.length - n; i < bars.length; i++) { const b = bars[i], pc = bars[i - 1].c; sum += Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc)); }
  return sum / n;
}
export function sma(bars: Bar[], n: number): number | null {
  if (bars.length < n) return null;
  let s = 0; for (let i = bars.length - n; i < bars.length; i++) s += bars[i].c;
  return s / n;
}
/** Is the broad market (SPY) above its 200-day average? null = not enough history to say. */
export function marketUptrend(spy: Bar[]): boolean | null { const a = sma(spy, 200); return a == null ? null : spy[spy.length - 1].c >= a; }

// ---------- the pick ----------
export interface Plan { horizon: "swing" | "long"; entry: number; buyBelow: number; stop: number | null; target: number | null; expiresInDays: number }
export function horizonFor(seed: Seed, d: Derived, rec: Recommendation | null): "swing" | "long" {
  const profitable = seed.source === "earnings" ? (seed.epsActual ?? 0) > 0 && (d.netMargin == null || d.netMargin > 0) : d.netMargin != null && d.netMargin > 0;
  const analysts = rec ? rec.buy + rec.strongBuy + rec.hold + rec.sell + rec.strongSell : 0;
  const liked = !rec || analysts < 5 || (rec.buy + rec.strongBuy) / analysts >= 0.55;
  const long = d.capUsd != null && d.capUsd >= RULES.longMinCapUsd && d.revGrowth != null && d.revGrowth >= RULES.longMinGrowth && profitable && liked
    && (d.roe == null || d.roe >= 10) && (d.debtEquity == null || d.debtEquity <= 2) && d.offHigh != null && d.offHigh <= RULES.longMaxOffHigh
    && (seed.source !== "ipo" || (d.listedDays ?? 0) >= RULES.longMinIpoDays);
  return long ? "long" : "swing";
}
/** Entry, buy-up-to, stop and target. Stop: two ATRs when history is there, else just under the day's low; always 5–12% away. Target: twice the risk. */
export function plan(horizon: "swing" | "long", q: Quote, atr14: number | null): Plan {
  const entry = q.c;
  if (horizon === "long") return { horizon, entry, buyBelow: r2(entry * RULES.buyZone.long), stop: null, target: null, expiresInDays: RULES.longDays };
  const raw = atr14 != null ? entry - 2 * atr14 : Math.min(q.l * 0.995, entry * (1 - RULES.stopMin));
  const stop = r2(clamp(raw, entry * (1 - RULES.stopMax), entry * (1 - RULES.stopMin)));
  return { horizon, entry, buyBelow: r2(entry * RULES.buyZone.swing), stop, target: r2(entry + RULES.rewardToRisk * (entry - stop)), expiresInDays: RULES.swingDays };
}

const pctText = (v: number, sign = false) => `${sign && v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v * 10) / 10)}%`;
const usd = (v: number) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function bigUsd(v: number): string {
  const a = Math.abs(v);
  return a >= 1e12 ? "$" + (v / 1e12).toFixed(2) + "T" : a >= 1e9 ? "$" + (v / 1e9).toFixed(a >= 1e10 ? 0 : 1) + "B" : a >= 1e6 ? "$" + (v / 1e6).toFixed(a >= 1e8 ? 0 : 1) + "M" : "$" + Math.round(v / 1e3) + "K";
}
const dayText = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const weeks = (days: number) => (days < 84 ? `${Math.round(days / 7)} weeks` : `${Math.round(days / 30.4)} months`);

export interface PickText { headline: string; reasons: { label: string; detail: string }[]; risks: string[]; facts: { label: string; value: string }[] }
export interface PickContext { horizon: "swing" | "long"; rec: Recommendation | null; uptrend: boolean | null; employees?: number | null; above50?: boolean | null }
/** The words on a pick, built only from numbers we hold. */
export function describe(seed: Seed, d: Derived, c: PickContext): PickText {
  const reasons: PickText["reasons"] = []; const risks: string[] = []; const facts: PickText["facts"] = [];
  const nearHigh = d.offHigh != null && d.offHigh <= 5;
  let headline: string;
  if (seed.source === "earnings") {
    const eps = seed.epsSurprise ?? 0; const lossSmaller = (seed.epsActual ?? 0) <= 0;
    headline = c.horizon === "long" && d.revGrowth != null
      ? `Growing ${Math.round(d.revGrowth)}% a year and profitable, and it just beat earnings by ${Math.round(eps)}%.`
      : `Beat earnings by ${Math.round(eps)}% and closed up ${pctText(d.dp)}${nearHigh ? ", close to its 52-week high" : ""}.`;
    reasons.push({ label: lossSmaller ? `Lost ${Math.round(eps)}% less than expected` : `Earnings beat by ${Math.round(eps)}%`,
      detail: `Reported ${usd(seed.epsActual ?? 0)} a share against the ${usd(seed.epsEstimate ?? 0)} analysts expected${seed.reported ? `, on ${dayText(seed.reported)}` : ""}.` });
    if (seed.revSurprise != null && seed.revSurprise >= 0) reasons.push({ label: seed.revSurprise >= 1 ? "Sales beat too" : "Sales met the estimate", detail: `Revenue${seed.revenueActual ? ` of ${bigUsd(seed.revenueActual)}` : ""} came in ${pctText(seed.revSurprise)} above the estimate.` });
    reasons.push({ label: "Buyers stepped in", detail: `Up ${pctText(d.dp)} on the first day after the report${d.rangePos != null && d.rangePos >= 0.5 ? `, closing in the top ${d.rangePos >= 0.75 ? "quarter" : "half"} of the day's range` : ""}.` });
    risks.push("Stocks that jump on earnings often give some of the move back in the first days.");
    if (lossSmaller) risks.push("The company still lost money this quarter; it only lost less than expected.");
  } else {
    const age = d.listedDays ?? 0;
    headline = `Listed ${weeks(age)} ago, holding ${pctText(d.aboveOffer ?? 0)} above its offer price and ${d.offHigh != null && d.offHigh < 0.5 ? "at" : `${pctText(d.offHigh ?? 0)} from`} its high.`;
    reasons.push({ label: `Listed ${weeks(age)} ago`, detail: `Went public${seed.ipoDate ? ` on ${dayText(seed.ipoDate)}` : ""}${seed.ipoPrice ? ` at ${usd(seed.ipoPrice)}` : ""}${seed.raised ? ` and raised ${bigUsd(seed.raised)}` : ""}.` });
    reasons.push({ label: "Holding above the offer price", detail: `Trades ${pctText(d.aboveOffer ?? 0)} above what the first investors paid.` });
    reasons.push({ label: d.offHigh != null && d.offHigh < 0.5 ? "At a new high since listing" : "Near its high since listing", detail: `${d.offHigh != null && d.offHigh < 0.5 ? "Closed at" : `${pctText(d.offHigh ?? 0)} below`} the highest price since it started trading, up ${pctText(d.dp)} today.` });
    risks.push("New listings swing more than established stocks and have little trading history.");
    if (seed.ipoDate && age < RULES.lockupFrom) risks.push(`Insiders can usually start selling about 180 days after listing (around ${dayText(addDays(seed.ipoDate, 180))}), which often weighs on the price.`);
  }
  if (seed.source === "earnings" && d.offHigh != null && d.offHigh <= 15) reasons.push({ label: nearHigh ? "Close to its 52-week high" : "In an uptrend", detail: `${pctText(d.offHigh)} below its 52-week high${d.ret13 != null ? `, ${pctText(d.ret13, true)} over the last 13 weeks` : ""}.` });
  if (d.revGrowth != null && d.revGrowth >= 10) reasons.push({ label: "The business is growing", detail: `Sales are ${pctText(d.revGrowth)} higher than a year ago.` });
  const analysts = c.rec ? c.rec.buy + c.rec.strongBuy + c.rec.hold + c.rec.sell + c.rec.strongSell : 0;
  if (c.rec && analysts >= 5 && (c.rec.buy + c.rec.strongBuy) / analysts >= 0.6) reasons.push({ label: "Analysts are positive", detail: `${c.rec.buy + c.rec.strongBuy} of the ${analysts} analysts covering it rate it a buy.` });

  if (d.dp >= 15) risks.push(`It already rose ${pctText(d.dp)} today. Buying after a big jump raises the chance of a pullback.`);
  if (d.beta != null && d.beta >= 1.5) risks.push(`It moves about ${d.beta.toFixed(1)} times as much as the market, in both directions.`);
  if (seed.source === "ipo" && d.netMargin != null && d.netMargin < 0) risks.push("The company is not making a profit yet.");
  if (d.capUsd != null && d.capUsd < 2e9) risks.push("It is a smaller company, so the price can swing sharply on little news.");
  if (d.debtEquity != null && d.debtEquity > 2) risks.push("It carries a lot of debt compared with what it owns.");
  if (c.uptrend === false) risks.push("The overall market is below its 200-day average, and breakouts fail more often in a weak market.");
  if (c.horizon === "long") risks.push("A long-term hold has no stop: one bad quarter can take the price down sharply.");

  if (d.capUsd != null) facts.push({ label: "Company value", value: bigUsd(d.capUsd) });
  if (d.revGrowth != null) facts.push({ label: "Sales growth (1 year)", value: pctText(d.revGrowth, true) });
  if (d.netMargin != null) facts.push({ label: "Profit margin", value: pctText(d.netMargin) });
  if (seed.source === "ipo" && seed.ipoDate) facts.push({ label: "Listed", value: dayText(seed.ipoDate) + ` ${seed.ipoDate.slice(0, 4)}` });
  if (seed.source === "ipo" && seed.ipoPrice) facts.push({ label: "Offer price", value: usd(seed.ipoPrice) });
  if (seed.source === "ipo" && seed.raised) facts.push({ label: "Raised at listing", value: bigUsd(seed.raised) });
  if (d.high52 != null && d.low52 != null) facts.push({ label: seed.source === "ipo" ? "Range since listing" : "52-week range", value: `${usd(d.low52)} – ${usd(d.high52)}` });
  if (d.ret13 != null) facts.push({ label: "Price vs 13 weeks ago", value: pctText(d.ret13, true) });
  if (d.beta != null) facts.push({ label: "Moves vs the market", value: `${d.beta.toFixed(1)}×` });
  if (c.rec && analysts >= 3) facts.push({ label: "Analysts saying buy", value: `${c.rec.buy + c.rec.strongBuy} of ${analysts}` });
  if (d.dollarVol != null) facts.push({ label: "Traded per day", value: bigUsd(d.dollarVol) });
  if (c.employees) facts.push({ label: "Employees", value: c.employees.toLocaleString("en-US") });
  return { headline, reasons: reasons.slice(0, 6), risks: risks.slice(0, 5), facts: facts.slice(0, 10) };
}

// ---------- tracking ----------
export interface OpenPick { horizon: "swing" | "long"; entry_price: number; stop_price: number | null; target_price: number | null; expires_at: string | null }
/** What today's session did to an open pick. Both levels hit in one day counts as the stop (we cannot know the order). A gap through a level fills at the open. */
export function settle(k: OpenPick, q: Quote, now = Date.now()): { close: "stop" | "target" | "time" | null; price: number } {
  if (k.horizon === "swing" && k.stop_price != null && q.l > 0 && q.l <= k.stop_price) return { close: "stop", price: q.o > 0 && q.o < k.stop_price ? q.o : k.stop_price };
  if (k.horizon === "swing" && k.target_price != null && q.h >= k.target_price) return { close: "target", price: q.o > k.target_price ? q.o : k.target_price };
  if (k.expires_at && Date.parse(k.expires_at) <= now) return { close: "time", price: q.c };
  return { close: null, price: q.c };
}
export const resultPct = (entry: number, close: number) => Math.round(((close - entry) / entry) * 1000) / 10;

// ---------- big investors (SEC 13F) ----------
export interface Holding { cusip: string; issuer: string; classTitle: string; value: number; shares: number }
/** Reads a 13F information table (XML). Options and bonds are left out; rows for the same security are added up. Values are whole dollars (filings since 2023). */
export function parse13F(xml: string): Holding[] {
  const tag = (block: string, name: string) => { const m = block.match(new RegExp(`<(?:\\w+:)?${name}>\\s*([^<]*?)\\s*</(?:\\w+:)?${name}>`, "i")); return m ? m[1].replace(/&amp;/g, "&") : null; };
  const by = new Map<string, Holding>();
  for (const m of xml.matchAll(/<(?:\w+:)?infoTable>([\s\S]*?)<\/(?:\w+:)?infoTable>/gi)) {
    const b = m[1];
    if (tag(b, "putCall")) continue;
    if ((tag(b, "sshPrnamtType") ?? "SH").toUpperCase() !== "SH") continue;
    const cusip = (tag(b, "cusip") ?? "").toUpperCase(); const value = Number(tag(b, "value")); const shares = Number(tag(b, "sshPrnamt"));
    if (!/^[0-9A-Z]{9}$/.test(cusip) || !Number.isFinite(value)) continue;
    const h = by.get(cusip);
    if (h) { h.value += value; h.shares += Number.isFinite(shares) ? shares : 0; }
    else by.set(cusip, { cusip, issuer: tag(b, "nameOfIssuer") ?? "", classTitle: tag(b, "titleOfClass") ?? "", value, shares: Number.isFinite(shares) ? shares : 0 });
  }
  return [...by.values()].sort((a, b) => b.value - a.value);
}
/** The newest 13F-HR in a filer's SEC submissions list. */
export function latest13F(sub: { filings?: { recent?: { form?: string[]; accessionNumber?: string[]; filingDate?: string[]; reportDate?: string[] } } }): { accession: string; filed: string; period: string } | null {
  const r = sub.filings?.recent; if (!r?.form) return null;
  for (let i = 0; i < r.form.length; i++) if (r.form[i] === "13F-HR" || r.form[i] === "13F-HR/A") return { accession: r.accessionNumber?.[i] ?? "", filed: r.filingDate?.[i] ?? "", period: r.reportDate?.[i] ?? "" };
  return null;
}
/** The US ticker OpenFIGI gives for a CUSIP, or null. */
export function tickerFromFigi(job: { data?: { ticker?: string; securityType?: string; marketSector?: string }[] }): string | null {
  const rows = (job.data ?? []).filter((x) => x.ticker && (x.marketSector ?? "Equity") === "Equity");
  const best = rows.find((x) => /common|adr|reit|class/i.test(x.securityType ?? "")) ?? rows[0];
  return best?.ticker ? best.ticker.replace("/", ".").toUpperCase() : null;
}
