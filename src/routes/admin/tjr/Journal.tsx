import { useMemo, useState } from "react";
import { Card, Notice } from "../../../components/ui";
import { supabase } from "../../../lib/supabase";
import { EVENT_NAME, EXIT_NAME, MODEL_NAME, nyDay, nyTime, px, usd, type TjrEvent, type TjrRun } from "../../../lib/tjr";
import { Tag, loadRuns, rows, useLoad, type TjrPreview } from "./parts";

const FILTERS: { key: string; label: string; types: string[] }[] = [
  { key: "all", label: "Everything", types: [] }, { key: "signal", label: "Signals", types: ["signal"] }, { key: "order", label: "Orders and fills", types: ["order", "fill", "cancel"] },
  { key: "rejected", label: "Refused", types: ["rejected"] }, { key: "risk", label: "Risk checks", types: ["risk", "roll"] },
];
const s = (v: unknown) => (typeof v === "string" ? v : ""), n = (v: unknown) => (typeof v === "number" ? v : null);
const STAGE: Record<string, string> = { bos: "break of structure", fill: "order", timing: "time limit" };

/** One journal line in plain words. */
function describe(e: TjrEvent): string {
  const d = e.data, side = s(d.side) === "long" ? "long" : s(d.side) === "short" ? "short" : "";
  switch (e.type) {
    case "signal": return `${side ? side.charAt(0).toUpperCase() + side.slice(1) : "Signal"} at ${px(n(d.price))}, stop ${px(n(d.stop))}${n(d.target) != null ? `, target ${px(n(d.target))}` : ""}`;
    case "order": return `Market order, ${n(d.qty) ?? "?"} contract${n(d.qty) === 1 ? "" : "s"} ${side}, risking ${usd(n(d.risk_usd))}`;
    case "fill": return s(d.kind) === "entry" ? `Entered ${n(d.qty)} at ${px(n(d.price))}` : `${EXIT_NAME[s(d.kind)] ?? "Closed"}: ${n(d.qty)} at ${px(n(d.price))}`;
    case "cancel": return `Not filled: ${s(d.reason)}`;
    case "rejected": return `${s(d.reason).charAt(0).toUpperCase()}${s(d.reason).slice(1)}`;
    case "risk": return `${d.ok === false ? "Refused" : "Passed"}: ${s(d.reason)}`;
    case "roll": return s(d.note) || "Contract roll";
    default: return s(d.reason) || s(d.kind) || "";
  }
}

/** The audit trail of a run: every signal, every setup that was refused and why, every order, fill and risk check. */
export function Journal({ preview }: { preview?: TjrPreview }) {
  const runs = useLoad(loadRuns, [], preview?.runs);
  const [pick, setPick] = useState(""), [filter, setFilter] = useState("all");
  const list = runs.data ?? [], run: TjrRun | undefined = list.find((r) => r.id === pick) ?? list.find((r) => r.kind === "paper" || r.kind === "live") ?? list[0];
  const types = FILTERS.find((f) => f.key === filter)?.types ?? [];
  const events = useLoad(async () => {
    if (!run) return [] as TjrEvent[];
    let q = supabase.from("tjr_events").select("id,run_id,ts,type,data").eq("run_id", run.id);
    if (types.length) q = q.in("type", types);
    return rows<TjrEvent[]>(q.order("ts", { ascending: false }).limit(300));
  }, [run?.id, filter], preview ? (preview.events ?? []).filter((e) => e.run_id === run?.id && (types.length === 0 || types.includes(e.type))).slice().reverse() : undefined);
  const days = useMemo(() => {
    const out: [string, TjrEvent[]][] = [];
    for (const e of events.data ?? []) { const d = nyDay(e.ts); if (out.length && out[out.length - 1][0] === d) out[out.length - 1][1].push(e); else out.push([d, [e]]); }
    return out;
  }, [events.data]);
  if (runs.error) return <Notice tone="warn">{runs.error}</Notice>;
  if (!run) return <Card className="px-4 py-5"><p className="text-[15px]">Nothing recorded yet.</p><p className="mt-1 text-[14px] text-muted">The journal fills when a backtest is stored or paper trading runs.</p></Card>;
  return (
    <div>
      <label className="block"><span className="mb-1.5 block px-1 text-[13px] text-muted">Journal of</span>
        <select value={run.id} onChange={(e) => setPick(e.target.value)} className="focus-ring h-12 w-full rounded-[14px] border border-border bg-surface-2 px-3 text-[15px] text-text">
          {list.map((r) => <option key={r.id} value={r.id}>{r.kind === "paper" ? "Paper trading" : r.kind === "live" ? "Live" : r.kind === "walkforward" ? "Walk-forward" : "Backtest"}, model {r.model} ({MODEL_NAME[r.model]}){r.label ? `: ${r.label}` : ""}</option>)}
        </select>
      </label>
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" role="radiogroup" aria-label="Show">
        {FILTERS.map((f) => <button key={f.key} type="button" role="radio" aria-checked={filter === f.key} onClick={() => setFilter(f.key)} className={`focus-ring h-9 shrink-0 rounded-full px-3.5 text-[14px] ${filter === f.key ? "bg-text text-black" : "bg-surface-2 text-muted"}`}>{f.label}</button>)}
      </div>
      {run.kind !== "paper" && run.kind !== "live" && <p className="mt-3 px-1 text-[13px] leading-snug text-muted">From a backtest: these orders were simulated on past prices, never sent.</p>}
      {events.error && <div className="mt-3"><Notice tone="warn">{events.error}</Notice></div>}
      {days.length === 0 && events.data && <Card className="mt-3 px-4 py-5 text-[15px] text-muted">No lines of this kind.</Card>}
      {days.map(([day, items]) => (
        <section key={day} className="mt-5">
          <h2 className="mb-2 px-1 text-[14px] font-semibold">{day}</h2>
          <Card>{items.map((e) => (
            <div key={e.id} className="flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
              <span className="w-[42px] shrink-0 pt-px font-mono tabular text-[13px] text-muted">{nyTime(e.ts)}</span>
              <span className="min-w-0 flex-1"><span className="block text-[14px] leading-snug">{describe(e)}</span><span className="block text-[12px] text-muted">{EVENT_NAME[e.type] ?? e.type}{e.type === "rejected" && s(e.data.stage) ? `, at the ${STAGE[s(e.data.stage)] ?? s(e.data.stage)} step` : ""}</span></span>
              {e.type === "rejected" || (e.type === "risk" && e.data.ok === false) ? <Tag tone="warn">refused</Tag> : e.type === "fill" && s(e.data.kind) === "target" ? <Tag tone="ok">target</Tag> : null}
            </div>
          ))}</Card>
        </section>
      ))}
      {(events.data ?? []).length === 300 && <p className="mt-3 px-1 text-[13px] text-muted">Showing the latest 300 lines.</p>}
    </div>
  );
}
