import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useRealtime } from "../hooks/useRealtime";
import type { Profile, Receipt, Signal, StockPick, StockPosition, WannCall } from "../lib/types";
import { Empty, PageTitle, Spinner } from "../components/ui";
import { MoneySheet } from "../components/MoneySheet";
import { eaLine, money, pct, stockLine, totals, wannLine, type LineKind, type PortfolioLine } from "../lib/portfolio";

export interface PortfolioData {
  ea: (Receipt & { signal: Signal | null })[];
  wann: (Receipt & { call: WannCall | null })[];
  stocks: (StockPosition & { pick: StockPick | null })[];
  tracker: { matched_signal_id: string | null; profit: number | null }[];
}
const tone = (v: number | null | undefined) => (v == null || v === 0 ? "" : v > 0 ? "text-buy" : "text-sell");
const needLabel = { amount: "Add amount", payout: "Add payout", lot: "Add lot" } as const;
const sourceLabel: Record<LineKind, string> = { stock: "Stocks", crypto: "Crypto", ea: "J trades", wann: "Wann calls" };
const rowLabel: Record<LineKind, string> = { stock: "Stock", crypto: "Crypto", ea: "J trade", wann: "Wann call" };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Everything the member took, in money: stocks (what they put in), J trades (their lot) and Wann calls (their stake). */
export function Portfolio({ profile, preview }: { profile: Profile; preview?: PortfolioData }) {
  const [data, setData] = useState<PortfolioData | null>(preview ?? null);
  const [tab, setTab] = useState<"open" | "closed">("open");
  const [edit, setEdit] = useState<{ receipt: Receipt; kind: "ea" | "wann" } | null>(null);
  const load = useCallback(async () => {
    if (preview) return;
    const [ea, wann, stocks, tracker] = await Promise.all([
      supabase.from("receipts").select("*, signal:signals(*)").eq("user_id", profile.id).eq("kind", "ea").eq("status", "taken").order("created_at", { ascending: false }).limit(400),
      supabase.from("receipts").select("*, call:wann_calls(*)").eq("user_id", profile.id).eq("kind", "wann").eq("status", "taken").order("created_at", { ascending: false }).limit(400),
      supabase.from("stock_positions").select("*, pick:stock_picks(*)").eq("user_id", profile.id).order("created_at", { ascending: false }),
      supabase.from("tracker_positions").select("matched_signal_id,profit").eq("user_id", profile.id).not("matched_signal_id", "is", null).not("close_time", "is", null),
    ]);
    setData({ ea: (ea.data ?? []) as PortfolioData["ea"], wann: (wann.data ?? []) as PortfolioData["wann"], stocks: (stocks.data ?? []) as PortfolioData["stocks"], tracker: (tracker.data ?? []) as PortfolioData["tracker"] });
  }, [profile.id, preview]);
  useEffect(() => { void load(); }, [load]);
  useRealtime([{ table: "receipts", filter: `user_id=eq.${profile.id}` }, { table: "stock_positions", filter: `user_id=eq.${profile.id}` }, { table: "stock_picks" }], () => { void load(); }, [profile.id]);

  const { lines, receipts } = useMemo(() => {
    const out: PortfolioLine[] = []; const byKey: Record<string, { receipt: Receipt; kind: "ea" | "wann" }> = {};
    if (!data) return { lines: out, receipts: byKey };
    const broker: Record<string, number> = {};
    for (const t of data.tracker) if (t.matched_signal_id && t.profit != null) broker[t.matched_signal_id] = (broker[t.matched_signal_id] ?? 0) + Number(t.profit);
    for (const p of data.stocks) if (p.pick && !p.pick.is_test) out.push(stockLine(p, p.pick));
    for (const r of data.ea) if (r.signal && !r.signal.is_test) { const l = eaLine(r, r.signal, broker[r.signal.id] ?? null); out.push(l); byKey[l.key] = { receipt: r, kind: "ea" }; }
    for (const r of data.wann) if (r.call) { const l = wannLine(r, r.call); out.push(l); byKey[l.key] = { receipt: r, kind: "wann" }; }
    out.sort((a, b) => b.at.localeCompare(a.at));
    return { lines: out, receipts: byKey };
  }, [data]);

  const wonCalls = new Set((data?.wann ?? []).filter((r) => r.call?.outcome === "won").map((r) => r.call!.id));
  if (!data) return <div className="mx-auto w-full max-w-md"><PageTitle>Portfolio</PageTitle><div className="flex justify-center py-16"><Spinner /></div></div>;
  const t = totals(lines);
  const shown = lines.filter((l) => l.open === (tab === "open"));
  const counts = { open: lines.filter((l) => l.open).length, closed: lines.filter((l) => !l.open).length };
  const unknownNote = (k: LineKind) => { const u = t.by[k].unknown; return u ? `, ${u} without ${k === "ea" ? "a lot" : "an amount"}` : ""; };
  const unit: Record<LineKind, [string, string]> = { stock: ["position", "positions"], crypto: ["position", "positions"], ea: ["trade", "trades"], wann: ["call", "calls"] };

  return (
    <div className="mx-auto w-full max-w-md pb-6">
      <header className="flex h-12 items-center px-4"><Link to="/settings" className="focus-ring -ml-2 flex h-11 items-center gap-1 px-2 text-[15px] text-muted"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>Settings</Link></header>
      <PageTitle>Portfolio</PageTitle>
      {lines.length === 0 ? (
        <Empty title="Nothing in your portfolio yet" body="Take a signal, a Wann call, a stock or a crypto pick and it shows here with what it made." />
      ) : (
        <>
          <section className="px-5">
            <p className="text-[13px] text-muted">Result so far</p>
            <p className={`mt-1 font-mono tabular font-semibold leading-none tracking-tight text-[clamp(40px,13vw,56px)] ${t.pnl === 0 ? "chrome" : tone(t.pnl)}`}>{money(t.pnl)}</p>
            {t.putIn > 0 && <p className="mt-3 text-[15px] text-muted">{money(t.putIn, false)} in play, worth <span className="text-text">{money(t.value, false)}</span> now</p>}
          </section>

          <section className="mt-6 px-4">
            <ul className="divide-y divide-border rounded-[16px] border border-border bg-surface">
              {(["stock", "crypto", "ea", "wann"] as LineKind[]).filter((k) => t.by[k].count > 0).map((k) => (
                <li key={k} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1"><p className="text-[15px]">{sourceLabel[k]}</p><p className="text-[13px] text-muted">{plural(t.by[k].count, unit[k][0], unit[k][1])}{unknownNote(k)}</p></div>
                  <span className={`font-mono tabular text-[17px] ${tone(t.by[k].pnl)}`}>{money(t.by[k].pnl)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-6 px-4">
            <div className="flex rounded-[12px] bg-surface-2 p-1" role="tablist" aria-label="Positions">
              {(["open", "closed"] as const).map((x) => <button key={x} type="button" role="tab" aria-selected={tab === x} onClick={() => setTab(x)} className={`focus-ring h-9 flex-1 rounded-[9px] text-[14px] ${tab === x ? "bg-text text-black" : "text-muted"}`}>{x === "open" ? "Open" : "Closed"} ({counts[x]})</button>)}
            </div>
            {shown.length === 0 ? <p className="px-1 py-8 text-center text-[14px] text-muted">{tab === "open" ? "Nothing open right now." : "Nothing has closed yet."}</p> : (
              <ul className="mt-3 divide-y divide-border rounded-[16px] border border-border bg-surface">
                {shown.map((l) => (
                  <li key={l.key} className="flex items-center gap-3 px-4 py-3">
                    <Link to={l.route} className="focus-ring min-w-0 flex-1">
                      <p className="truncate text-[15px]">{l.title}</p>
                      <p className="truncate text-[13px] text-muted">{rowLabel[l.kind]} · {l.sub}</p>
                    </Link>
                    {l.needs && receipts[l.key] ? (
                      <button type="button" onClick={() => setEdit(receipts[l.key])} className="focus-ring h-9 shrink-0 rounded-full border border-border px-3 text-[13px]">{needLabel[l.needs]}</button>
                    ) : (
                      <button type="button" disabled={!receipts[l.key]} onClick={() => receipts[l.key] && setEdit(receipts[l.key])} className="focus-ring shrink-0 text-right" aria-label={receipts[l.key] ? `Edit ${l.title}` : undefined}>
                        <span className={`block tabular text-[15px] ${l.pnl == null ? "text-muted" : tone(l.pnl)} ${l.pnl == null && l.putIn == null ? "" : "font-mono"}`}>{l.pnl == null ? (l.putIn != null ? money(l.putIn, false) : "Open") : money(l.pnl)}</span>
                        <span className="block text-[12px] text-muted">{l.estimated ? (l.kind === "wann" ? "estimated" : "from your lot") : l.pct != null ? pct(l.pct) : l.pnl == null && l.putIn != null ? "in play" : ""}</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 px-1 text-[13px] leading-snug text-muted">Stocks and crypto use the latest price J has. J trades use your linked MT5 account when there is one, otherwise your lot and the pips. Wann calls, stocks and crypto use your amount (Settings, Default amount); a Wann win is worked out from Wann's probability. Tap a figure to correct it.</p>
          </section>
        </>
      )}
      <MoneySheet open={edit != null} onClose={() => setEdit(null)} kind={edit?.kind ?? "ea"} receipt={edit?.receipt ?? null} title={edit?.kind === "wann" ? "What you put on this call" : "Your lot on this trade"} onSaved={() => { void load(); }} won={edit?.kind === "wann" && edit.receipt.wann_call_id != null && wonCalls.has(edit.receipt.wann_call_id)} />
    </div>
  );
}
