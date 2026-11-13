// The member's portfolio in money: stocks they bought (amount put in), J trades they took (lot) and Wann calls they
// took (stake). Pure functions over rows the app already loads; nothing here is stored.
import type { Receipt, Signal, StockPick, StockPosition, WannCall } from "./types";

export type LineKind = "stock" | "ea" | "wann";
export interface PortfolioLine {
  key: string; kind: LineKind; title: string; sub: string; route: string; at: string;
  open: boolean;                 // still running (not sold / not closed / not played)
  putIn: number | null;          // money in: stock amount, Wann stake (a forex trade has no "amount put in")
  value: number | null;          // what that money is worth now (stocks), or back at stake while a Wann call is live
  pnl: number | null;            // profit or loss in money; null = not known (yet)
  pct: number | null;            // pnl as a percent of putIn
  estimated: boolean;            // worked out from lot × pips, not a broker figure
  needs: "amount" | "payout" | "lot" | null;   // what the member still has to tell us for a money figure
}
export interface PortfolioTotals {
  putIn: number;                 // money currently in open stocks and live Wann calls
  value: number;                 // what the open stocks are worth now, plus live Wann stakes
  openPnl: number;               // unrealised, stocks only
  closedPnl: number;             // sold stocks + closed trades + finished Wann calls
  pnl: number;                   // openPnl + closedPnl
  by: Record<LineKind, { pnl: number; count: number; unknown: number }>;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Price a pick is worth right now: the close when J closed it, else the latest tracked price, else the pick price. */
export function pickPrice(k: Pick<StockPick, "status" | "close_price" | "last_price" | "entry_price">): number {
  return (k.status === "closed" ? k.close_price : null) ?? k.last_price ?? k.entry_price;
}
/** Percent move of a pick since it was sent (closed picks: the stored result). */
export function pickMovePct(k: Pick<StockPick, "status" | "close_price" | "last_price" | "entry_price" | "result_pct">): number {
  if (k.status === "closed" && k.result_pct != null) return k.result_pct;
  return Math.round(((pickPrice(k) - k.entry_price) / k.entry_price) * 1000) / 10;
}

export function stockLine(pos: StockPosition, k: StockPick): PortfolioLine {
  const shares = pos.amount_usd / pos.buy_price;
  const sold = pos.sell_price != null;
  const px = sold ? (pos.sell_price as number) : pickPrice(k);
  const value = round2(shares * px), pnl = round2(value - pos.amount_usd);
  const state = sold ? "Sold" : k.status === "closed" ? "Pick closed — still holding?" : k.horizon === "long" ? "Long-term" : "Swing";
  return {
    key: `stock-${pos.id}`, kind: "stock", title: k.symbol, sub: `${k.name} · ${state}`, route: `/stocks/${k.id}`, at: pos.sold_at ?? pos.bought_at,
    open: !sold, putIn: pos.amount_usd, value, pnl, pct: Math.round((pnl / pos.amount_usd) * 1000) / 10, estimated: false, needs: null,
  };
}

/** Money made by one lot-sized trade: pips → price distance → ticks → money. Null when the signal carries no tick data. */
export function moneyFromPips(s: Pick<Signal, "pip_size" | "tick_size" | "tick_value">, pips: number, lot: number): number | null {
  if (!s.tick_size || !s.tick_value || s.tick_size <= 0 || s.tick_value <= 0 || !(lot > 0)) return null;
  return round2(((pips * s.pip_size) / s.tick_size) * s.tick_value * lot);
}

/** A J trade the member took. Money comes from, in order: their own figure, their linked MT5 account, lot × pips. */
export function eaLine(r: Receipt, s: Signal, trackerProfit: number | null = null): PortfolioLine {
  const closed = s.status === "closed";
  const side = `${s.direction === "buy" ? "Buy" : "Sell"}${r.user_lot ? ` · ${Number(r.user_lot.toFixed(2))} lot` : ""}`;
  let pnl: number | null = null, estimated = false, needs: PortfolioLine["needs"] = null;
  if (closed) {
    const pips = r.user_pips ?? s.result_pips;
    if (r.profit_usd != null) pnl = r.profit_usd;
    else if (trackerProfit != null) pnl = round2(trackerProfit);
    else if (r.user_lot && pips != null) { pnl = moneyFromPips(s, pips, r.user_lot); estimated = pnl != null; }
    if (pnl == null) needs = "lot";
  }
  return {
    key: `ea-${r.id}`, kind: "ea", title: s.base_symbol, sub: closed ? side : `${side} · running`, route: `/signal/${s.id}`, at: s.closed_at ?? s.sent_at ?? s.created_at,
    open: !closed, putIn: null, value: null, pnl, pct: null, estimated, needs,
  };
}

/** What a stake wins when the price paid equals Wann's probability: a 90% call pays about 11 on 100. J has no Kalshi
 *  prices, so this is how a win is worked out from the member's amount; a payout they enter replaces it. */
export function estimatedWin(stake: number, probability: number): number | null {
  return probability > 0 && probability < 100 ? round2(stake * (100 / probability - 1)) : null;
}

/** A Wann call the member took, at their amount: lost = minus the stake, void = money back, won = the payout they
 *  entered minus the stake, else the win worked out from Wann's probability (marked estimated). */
export function wannLine(r: Receipt, c: WannCall): PortfolioLine {
  const stake = r.stake_usd ?? null;
  const live = c.status === "live";
  let pnl: number | null = null, needs: PortfolioLine["needs"] = null, estimated = false;
  if (stake == null) needs = "amount";
  else if (!live) {
    if (c.status === "withdrawn" || c.outcome === "void") pnl = 0;
    else if (c.outcome === "lost") pnl = -stake;
    else if (c.outcome === "won") {
      if (r.payout_usd != null) pnl = round2(r.payout_usd - stake);
      else { pnl = estimatedWin(stake, c.probability); estimated = pnl != null; if (pnl == null) needs = "payout"; }
    }
  }
  const state = live ? "Live" : c.outcome === "won" ? "Won" : c.outcome === "lost" ? "Lost" : "Void";
  return {
    key: `wann-${r.id}`, kind: "wann", title: `${c.home} vs ${c.away}`, sub: `${c.pick_label} · ${state}`, route: `/wann/${c.id}`, at: c.kickoff_utc,
    open: live, putIn: stake, value: live ? stake : null, pnl, pct: pnl != null && stake ? Math.round((pnl / stake) * 1000) / 10 : null, estimated, needs,
  };
}

export function totals(lines: PortfolioLine[]): PortfolioTotals {
  const t: PortfolioTotals = { putIn: 0, value: 0, openPnl: 0, closedPnl: 0, pnl: 0, by: { stock: { pnl: 0, count: 0, unknown: 0 }, ea: { pnl: 0, count: 0, unknown: 0 }, wann: { pnl: 0, count: 0, unknown: 0 } } };
  for (const l of lines) {
    const b = t.by[l.kind]; b.count++;
    if (l.open) {
      if (l.putIn != null) { t.putIn += l.putIn; t.value += l.value ?? l.putIn; }
      if (l.kind === "stock" && l.pnl != null) { t.openPnl += l.pnl; b.pnl += l.pnl; }
      else if (l.kind === "wann" && l.putIn == null) b.unknown++;
      continue;
    }
    if (l.pnl == null) { b.unknown++; continue; }
    t.closedPnl += l.pnl; b.pnl += l.pnl;
  }
  for (const k of ["putIn", "value", "openPnl", "closedPnl"] as const) t[k] = round2(t[k]);
  t.pnl = round2(t.openPnl + t.closedPnl);
  for (const k of Object.keys(t.by) as LineKind[]) t.by[k].pnl = round2(t.by[k].pnl);
  return t;
}

/** "+$1,240.50", "−$80", "$0". Whole dollars drop the cents. */
export function money(v: number | null | undefined, sign = true): string {
  if (v == null || !Number.isFinite(v)) return "–";
  const abs = Math.abs(v);
  const body = abs.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(abs) ? 0 : 2, maximumFractionDigits: 2 });
  return `${sign && v > 0 ? "+" : v < 0 ? "−" : ""}$${body}`;
}
export function pct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "–";
  const r = Math.round(v * 10) / 10;
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r)}%`;
}
