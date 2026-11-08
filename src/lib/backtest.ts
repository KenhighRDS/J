// MetaTrader Strategy Tester report parser (MT5 "Save as Report" HTML and MT4 StrategyTester.htm).
// Regex-based on purpose: it runs in the browser and in Node tests without a DOM.

export type Direction = "buy" | "sell";
export interface BacktestTrade { symbol: string; direction: Direction; volume: number; openTime: string; closeTime: string; openPrice: number; closePrice: number; profit: number | null; pips: number }
export interface BacktestSummary {
  platform: "mt5" | "mt4";
  expert: string | null; symbol: string | null; timeframe: string | null; periodStart: string | null; periodEnd: string | null;
  currency: string | null; initialDeposit: number | null;
  firstTrade: string | null; lastTrade: string | null;
  trades: number; buys: number; sells: number; wins: number; losses: number; winRate: number; totalPips: number;
  netProfit: number | null; profitFactor: number | null; maxDrawdownPct: number | null;
  digits: number; pipSize: number; pipSizeGuessed: boolean;
  baseLot: number;                                   // smallest lot in the report; totalPips counts every trade at its lot ÷ baseLot
  tradesList: BacktestTrade[];
}

const entities: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'" };
const clean = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => entities[m] ?? m).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/[\s ]+/g, " ").trim();
const num = (s: string | undefined): number | null => { if (!s) return null; const t = s.replace(/[\s ]/g, "").replace(/,/g, ""); const m = t.match(/^-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
const decimals = (s: string) => (s.includes(".") ? s.trim().split(".")[1].replace(/[^\d]/g, "").length : 0);
const timeOf = (s: string) => { const m = s.match(/(\d{4})[.-](\d{2})[.-](\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/); return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : null; };

function rowsOf(html: string): string[][] {
  const rows: string[][] = [];
  for (const r of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => clean(c[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}
/** "Label:" / "Label" followed by a value, anywhere in the report's summary rows. */
function field(rows: string[][], label: RegExp): string | null {
  for (const r of rows) for (let i = 0; i < r.length - 1; i++) if (label.test(r[i])) { const v = r.slice(i + 1).find((c) => c !== ""); if (v !== undefined) return v; }
  return null;
}
const pct = (s: string | null) => { const m = s?.match(/\(([-\d.]+)\s*%\)/); return m ? Number(m[1]) : null; };
const countOf = (s: string | null) => num(s ?? undefined);

/** Pip size from the symbol name and the quote precision. The admin can override it. */
export function guessPipSize(symbol: string | null, digits: number): number {
  const s = (symbol ?? "").toUpperCase();
  if (/XAU|GOLD/.test(s)) return 0.1;
  if (/XAG|SILVER/.test(s)) return 0.01;
  if (/US30|DJ30|NAS|US100|USTEC|SPX|US500|GER|DE30|DE40|DAX|UK100|FTSE|JP225|NIK|HK50|AUS200|CAC|STOXX/.test(s)) return 1;
  if (/BTC|ETH|LTC|XRP/.test(s)) return 1;
  if (digits === 3 || digits === 5) return Number(`1e${1 - digits}`);
  if (digits === 2) return 0.1;
  if (digits === 4) return 0.0001;
  if (digits <= 1) return 1;
  return Number(`1e${1 - digits}`);
}

const tradePips = (t: BacktestTrade, pipSize: number) => Math.round(((t.closePrice - t.openPrice) / pipSize) * (t.direction === "buy" ? 1 : -1) * 10) / 10;
const smallestLot = (list: BacktestTrade[]) => { const v = list.map((t) => t.volume).filter((x) => x > 0); return v.length ? Math.min(...v) : 1; };
/** Total pips, lot-weighted: each trade counts at its lot ÷ the smallest lot. Equals the plain sum when every trade uses the same lot, and it
 *  always carries the sign of the money result (a grid or martingale loses many small trades and wins a few big ones; the plain sum would go negative). */
const weightedPips = (list: BacktestTrade[], baseLot: number) => Math.round(list.reduce((a, t) => a + t.pips * (t.volume > 0 ? t.volume / baseLot : 1), 0) * 10) / 10;

/** Re-derives pips and the pips-based counters from the trade list with a different pip size. */
export function withPipSize(s: BacktestSummary, pipSize: number): BacktestSummary {
  const tradesList = s.tradesList.map((t) => ({ ...t, pips: tradePips(t, pipSize) }));
  return { ...s, pipSize, pipSizeGuessed: false, tradesList, totalPips: weightedPips(tradesList, s.baseLot) };
}

function finish(base: Omit<BacktestSummary, "trades" | "buys" | "sells" | "wins" | "losses" | "winRate" | "totalPips" | "firstTrade" | "lastTrade" | "tradesList" | "digits" | "pipSize" | "pipSizeGuessed" | "baseLot">, trades: BacktestTrade[], digits: number, counts: { buys: number | null; sells: number | null; wins: number | null; losses: number | null; total: number | null }): BacktestSummary {
  const pipSize = guessPipSize(base.symbol ?? trades[0]?.symbol ?? null, digits);
  const list = trades.map((t) => ({ ...t, pips: tradePips(t, pipSize) })); const baseLot = smallestLot(list);
  const byProfit = (t: BacktestTrade) => (t.profit != null ? t.profit : t.pips);
  const wins = counts.wins ?? list.filter((t) => byProfit(t) > 0).length;
  const losses = counts.losses ?? list.filter((t) => byProfit(t) < 0).length;
  const total = counts.total ?? list.length;
  const times = list.map((t) => t.openTime).concat(list.map((t) => t.closeTime)).filter(Boolean).sort();
  return {
    ...base, digits, pipSize, pipSizeGuessed: true, baseLot, tradesList: list,
    trades: total, buys: counts.buys ?? list.filter((t) => t.direction === "buy").length, sells: counts.sells ?? list.filter((t) => t.direction === "sell").length,
    wins, losses, winRate: wins + losses ? Math.round((wins / (wins + losses)) * 1000) / 10 : 0,
    totalPips: weightedPips(list, baseLot),
    firstTrade: list.length ? list.map((t) => t.openTime).sort()[0] : null, lastTrade: times.length ? times[times.length - 1] : null,
  };
}

function parseMt5(rows: string[][]): BacktestSummary {
  const head = rows.findIndex((r) => r[0] === "Time" && r[1] === "Deal" && r[2] === "Symbol");
  if (head < 0) throw new Error("No Deals table");
  const open: Record<string, { direction: Direction; price: number; time: string; volume: number }[]> = {};
  const trades: BacktestTrade[] = []; let digits = 0;
  for (const r of rows.slice(head + 1)) {
    if (r.length < 11 || !timeOf(r[0])) break;
    const [time, , symbol, type, dir, vol, priceS, , , , profitS] = r;
    if (type !== "buy" && type !== "sell") continue;
    const price = num(priceS); const volume = num(vol) ?? 0;
    if (price == null) continue;
    digits = Math.max(digits, decimals(priceS));
    const t = timeOf(time) ?? time;
    if (dir === "in") { (open[symbol] ??= []).push({ direction: type, price, time: t, volume }); continue; }
    if (dir === "out" || dir === "in/out") {
      const closes: Direction = type === "sell" ? "buy" : "sell";
      const q = open[symbol] ?? [];
      let left = volume;
      while (left > 1e-9) {
        const i = q.findIndex((p) => p.direction === closes);
        if (i < 0) break;
        const p = q[i]; const take = Math.min(left, p.volume);
        trades.push({ symbol, direction: p.direction, volume: take, openTime: p.time, closeTime: t, openPrice: p.price, closePrice: price, profit: num(profitS), pips: 0 });
        p.volume -= take; left -= take; if (p.volume <= 1e-9) q.splice(i, 1);
      }
      if (dir === "in/out" && left > 1e-9) (open[symbol] ??= []).push({ direction: type, price, time: t, volume: left });
    }
  }
  const period = field(rows, /^Period:?$/) ?? ""; const pm = period.match(/^(\S+)\s*\(([^-]+)-\s*([^)]+)\)/);
  const long = field(rows, /^Long Trades \(won %\):?$/), short = field(rows, /^Short Trades \(won %\):?$/), profitT = field(rows, /^Profit Trades \(% of total\):?$/), lossT = field(rows, /^Loss Trades \(% of total\):?$/);
  return finish({
    platform: "mt5", expert: field(rows, /^Expert:?$/), symbol: field(rows, /^Symbol:?$/), timeframe: pm ? pm[1] : null,
    periodStart: pm ? timeOf(`${pm[2].trim()} 00:00`) : null, periodEnd: pm ? timeOf(`${pm[3].trim()} 00:00`) : null,
    currency: field(rows, /^Currency:?$/), initialDeposit: num(field(rows, /^Initial Deposit:?$/) ?? undefined),
    netProfit: num(field(rows, /^Total Net Profit:?$/) ?? undefined), profitFactor: num(field(rows, /^Profit Factor:?$/) ?? undefined),
    maxDrawdownPct: pct(field(rows, /^Balance Drawdown Maximal:?$/)) ?? pct(field(rows, /^Equity Drawdown Maximal:?$/)),
  }, trades, digits, { buys: countOf(long), sells: countOf(short), wins: countOf(profitT), losses: countOf(lossT), total: countOf(field(rows, /^Total Trades:?$/)) });
}

function parseMt4(rows: string[][]): BacktestSummary {
  const head = rows.findIndex((r) => r[0] === "#" && r[1] === "Time" && r[2] === "Type");
  if (head < 0) throw new Error("No trades table");
  const symbolRaw = field(rows, /^Symbol$/) ?? ""; const symbol = symbolRaw.split(" ")[0] || null;
  const open = new Map<string, { direction: Direction; price: number; time: string; volume: number }>();
  const trades: BacktestTrade[] = []; let digits = 0;
  for (const r of rows.slice(head + 1)) {
    if (r.length < 6 || !timeOf(r[1])) continue;
    const [, time, type, order, size, priceS, , , profitS] = r; const price = num(priceS); const t = timeOf(time) ?? time;
    if (price == null) continue;
    digits = Math.max(digits, decimals(priceS));
    if (type === "buy" || type === "sell") { open.set(order, { direction: type, price, time: t, volume: num(size) ?? 0 }); continue; }
    if (/^(close|t\/p|s\/l|close at stop)$/i.test(type)) {
      const p = open.get(order); if (!p) continue; open.delete(order);
      trades.push({ symbol: symbol ?? "", direction: p.direction, volume: p.volume, openTime: p.time, closeTime: t, openPrice: p.price, closePrice: price, profit: num(profitS), pips: 0 });
    }
  }
  const period = field(rows, /^Period$/) ?? ""; const tf = period.match(/\(([A-Z0-9]+)\)/); const range = period.match(/\(([\d.]+)\s*-\s*([\d.]+)\)\s*$/);
  const long = field(rows, /^Long positions \(won %\)$/), short = field(rows, /^Short positions \(won %\)$/), profitT = field(rows, /^Profit trades \(% of total\)$/), lossT = field(rows, /^Loss trades \(% of total\)$/);
  return finish({
    platform: "mt4", expert: (rows.find((r) => r.length === 1 && /Strategy Tester:/.test(r[0]))?.[0] ?? "").replace(/^Strategy Tester:\s*/, "") || null, symbol, timeframe: tf ? tf[1] : null,
    periodStart: range ? timeOf(`${range[1]} 00:00`) : null, periodEnd: range ? timeOf(`${range[2]} 00:00`) : null,
    currency: null, initialDeposit: num(field(rows, /^Initial deposit$/) ?? undefined),
    netProfit: num(field(rows, /^Total net profit$/) ?? undefined), profitFactor: num(field(rows, /^Profit factor$/) ?? undefined),
    maxDrawdownPct: pct(field(rows, /^Maximal drawdown$/)),
  }, trades, digits, { buys: countOf(long), sells: countOf(short), wins: countOf(profitT), losses: countOf(lossT), total: countOf(field(rows, /^Total trades$/)) });
}

/** Parses a Strategy Tester report (MT5 or MT4 HTML). Throws with a plain-language message when it is not one. */
export function parseBacktest(html: string): BacktestSummary {
  const rows = rowsOf(html);
  if (!rows.length) throw new Error("This file has no tables. Save the report as HTML from the Strategy Tester.");
  if (rows.some((r) => r[0] === "Time" && r[1] === "Deal")) return parseMt5(rows);
  if (rows.some((r) => r[0] === "#" && r[1] === "Time" && r[2] === "Type")) return parseMt4(rows);
  throw new Error("This doesn't look like a Strategy Tester report. In MT5: Backtest tab → right-click → Report → Save as HTML.");
}

/** MT5 saves reports as UTF-16 with a byte-order mark; MT4 as a single-byte page. */
export function decodeReportFile(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  if (b.length >= 4 && b[1] === 0 && b[3] === 0) return new TextDecoder("utf-16le").decode(b);
  return new TextDecoder("utf-8").decode(b);
}
