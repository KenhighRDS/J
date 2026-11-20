import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, Notice } from "../../../components/ui";
import { TradeChart } from "../../../components/TradeChart";
import { supabase } from "../../../lib/supabase";
import { CONFIRMATION_NAME, EXIT_NAME, levelName, levelPhrase, nyDay, nyTime, px, rText, tone, usd, type TjrTrade } from "../../../lib/tjr";
import { BASE, Figure, Section, Tag, rows, useLoad, type TjrPreview } from "./parts";

/** One trade, explained: the chart, then each thing that had to be true, in the order it became true. Tapping a reason
 *  finds it on the chart, and tapping a number on the chart finds its reason. */
export function TradePage({ preview }: { preview?: TjrPreview }) {
  const { id = "", seq = "1" } = useParams(), base = preview?.base ?? BASE;
  const load = useLoad(() => rows<TjrTrade>(supabase.from("tjr_trades").select("*").eq("run_id", id).eq("seq", Number(seq)).single()), [id, seq],
    preview ? (preview.trades ?? []).find((t) => t.run_id === id && t.seq === Number(seq)) ?? preview.trades?.[0] : undefined);
  const [focus, setFocus] = useState<number | null>(null);
  const t = load.data;
  if (load.error) return <Notice tone="warn">{load.error}</Notice>;
  if (!t) return <p className="px-1 py-8 text-[14px] text-muted">Loading…</p>;
  const long = t.side === "long", swept = t.marks.filter((m) => m.role === "swept");
  return (
    <div>
      <Link to={`${base}/runs/${t.run_id}`} className="focus-ring -ml-1 inline-flex h-9 items-center px-1 text-[14px] text-muted">‹ Model {t.model}</Link>
      <div className="mt-1 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[22px] font-semibold leading-tight tracking-tight"><span className={long ? "text-buy" : "text-sell"}>{long ? "Long" : "Short"}</span> {t.symbol}</h2>
          <p className="mt-0.5 text-[14px] text-muted">{nyDay(t.entry_at)}, {nyTime(t.entry_at)} New York</p>
        </div>
        <div className="shrink-0 text-right"><p className={`font-mono tabular text-[22px] font-semibold leading-tight ${tone(t.r)}`}>{rText(t.r)}</p><p className="font-mono tabular text-[13px] text-muted">{usd(t.net_usd, true)}</p></div>
      </div>
      {t.experimental && <div className="mt-2"><Tag>Experimental reconstruction</Tag></div>}

      <div className="-mx-1 mt-4 overflow-hidden rounded-[16px] border border-border bg-surface py-2"><TradeChart trade={t} focus={focus} onFocus={setFocus} /></div>
      <p className="mt-2 px-1 text-[12px] leading-snug text-muted">5-minute candles, New York time. Dashed: the liquidity that was swept. Shaded: a gap that was closed through. Red line: stop. Green line: target. Triangle: entry. Square: exit.</p>

      <Section title="Why it was taken">
        <ol className="overflow-hidden rounded-[16px] border border-border bg-surface">
          {t.confirmations.map((c, n) => (
            <li key={n} className="border-b border-border last:border-b-0">
              <button type="button" aria-pressed={focus === n} onClick={() => setFocus(focus === n ? null : n)} className={`focus-ring flex w-full items-start gap-3 px-4 py-3 text-left ${focus === n ? "bg-surface-2" : ""}`}>
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-text text-[12px] font-semibold ${focus === n ? "bg-text text-black" : ""}`}>{n + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3"><span className="text-[15px]">{CONFIRMATION_NAME[c.kind] ?? c.kind}</span><span className="shrink-0 font-mono tabular text-[13px] text-muted">{nyTime(c.ts)}, {c.timeframe}-minute</span></span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-muted">{c.kind === "sweep" && swept.length ? `Took the ${swept.map((m) => `${levelPhrase(m.label)} (${px(m.price)})`).join(", ")} and closed back ${long ? "above" : "below"}.` : c.reason.charAt(0).toUpperCase() + c.reason.slice(1) + (c.reason.endsWith(".") ? "" : ".")}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Order and result">
        <Card>
          <Figure label="Entry" sub={`${t.qty} contract${t.qty === 1 ? "" : "s"}, next open after the trigger`}>{px(t.entry)}</Figure>
          <Figure label="Stop" sub={`${px(Math.abs(t.entry - t.stop))} points away`}><span className="text-sell">{px(t.stop)}</span></Figure>
          <Figure label="Target" sub={t.target_label ? (t.target_label.endsWith("R") ? `fixed ${t.target_label}` : levelName(t.target_label)) : undefined}><span className="text-buy">{px(t.target)}</span></Figure>
          <Figure label="Exit" sub={`${EXIT_NAME[t.exit_reason] ?? t.exit_reason}${t.exit_at ? `, ${nyTime(t.exit_at)}` : ""}`}>{px(t.exit)}</Figure>
          {t.partials.map((p, i) => <Figure key={i} label="Partial exit" sub={`${p.qty} contract${p.qty === 1 ? "" : "s"}, ${nyTime(p.ts)}`}>{px(p.price)}</Figure>)}
          <Figure label="Planned risk">{usd(t.risk_usd)}</Figure>
          <Figure label="Fees and slippage">{usd(t.costs_usd)}</Figure>
          <Figure label="Furthest against / in favour" sub="points, while the trade was open">{px(t.mae)} / {px(t.mfe)}</Figure>
        </Card>
      </Section>
    </div>
  );
}
