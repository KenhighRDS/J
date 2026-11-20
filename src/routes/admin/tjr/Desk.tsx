import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Notice, Sheet } from "../../../components/ui";
import { EquityLine } from "../../../components/TradeChart";
import { supabase } from "../../../lib/supabase";
import { EVENT_NAME, nyShort, nyTime, type TjrEvent, type TjrStatus } from "../../../lib/tjr";
import { BASE, Figure, RunLines, Section, Tag, loadRuns, loadStatus, rows, useLoad, type TjrPreview } from "./parts";

const MODES: { key: TjrStatus["mode"]; label: string }[] = [{ key: "off", label: "Off" }, { key: "paper", label: "Paper" }, { key: "live", label: "Live" }];
const ago = (t: string | null) => { if (!t) return "never"; const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000); return s < 90 ? `${Math.round(s)} s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : `${nyShort(t)}, ${nyTime(t)}`; };

/** The desk: what is switched on, whether the worker is there, the emergency stop, and what the tests have said. */
export function Desk({ preview }: { preview?: TjrPreview }) {
  const base = preview?.base ?? BASE;
  const status = useLoad(loadStatus, [], preview?.status);
  const runs = useLoad(loadRuns, [], preview?.runs);
  const paper = (runs.data ?? []).find((r) => r.kind === "paper" || r.kind === "live");
  const feed = useLoad(async () => (paper ? rows<TjrEvent[]>(supabase.from("tjr_events").select("id,run_id,ts,type,data").eq("run_id", paper.id).in("type", ["signal", "fill", "rejected"]).order("ts", { ascending: false }).limit(8)) : []), [paper?.id], preview ? (preview.events ?? []).slice(0, 6) : undefined);
  const [busy, setBusy] = useState(""), [err, setErr] = useState<string | null>(null), [confirm, setConfirm] = useState(false);
  const s = status.data;
  const act = async (key: string, fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    if (preview) return;
    setBusy(key); setErr(null);
    const { error } = await fn();
    setBusy(""); if (error) setErr(error.message); status.reload();
  };
  if (status.error) return <Notice tone="warn">Could not load the TJR module: {status.error}</Notice>;
  if (!s) return <p className="px-1 py-8 text-[14px] text-muted">Loading…</p>;
  const tests = (runs.data ?? []).filter((r) => r.kind === "backtest" || r.kind === "walkforward");
  const latest = tests[0], group = latest?.group_id ? tests.filter((r) => r.group_id === latest.group_id).sort((a, b) => a.model.localeCompare(b.model)) : latest ? [latest] : [];
  return (
    <div>
      {s.kill && <Notice tone="warn"><b>Emergency stop is on.</b> Nothing can run, and live trading is locked again. Clearing it restarts nothing by itself.<div className="mt-3"><Button variant="ghost" busy={busy === "clear"} onClick={() => { void act("clear", () => supabase.rpc("tjr_kill", { p_on: false })); }}>Clear the stop</Button></div></Notice>}
      <Card className={s.kill ? "mt-3" : ""}>
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[15px]">Mode</span>
            <div role="radiogroup" aria-label="Mode" className="flex rounded-full bg-surface-2 p-0.5">
              {MODES.map((m) => {
                const locked = m.key === "live" && !s.live_unlocked, on = s.mode === m.key;
                return <button key={m.key} type="button" role="radio" aria-checked={on} disabled={locked || s.kill || busy !== ""} onClick={() => { void act("mode", () => supabase.rpc("tjr_set_mode", { p_mode: m.key })); }}
                  aria-label={locked ? "Live, locked" : m.label} className={`focus-ring inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[14px] disabled:opacity-40 ${on ? "bg-text text-black" : "text-muted"}`}>{m.label}{locked && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>}</button>;
              })}
            </div>
          </div>
          <p className="mt-2 text-[13px] leading-snug text-muted">{s.mode === "off" ? "Nothing is trading. Backtests still run." : s.mode === "paper" ? "Signals are traded in a simulated book. No real orders." : "Real orders are being sent to the broker."}{!s.live_unlocked && <> Live trading is locked; it is opened under <Link to={`${base}/setup`} className="underline">Setup</Link>.</>}</p>
        </div>
        <Figure label="Worker" sub={s.has_worker_key ? `last seen ${ago(s.worker_seen_at)}` : undefined}>{!s.has_worker_key ? <Link to={`${base}/setup`} className="font-sans underline">Not set up</Link> : s.worker_online ? <span className="text-buy">Online</span> : <span className="text-muted">Not connected</span>}</Figure>
        <Figure label="Data">{s.worker_info.datasets?.length ? s.worker_info.datasets.join(", ") : "–"}{s.worker_info.feed && <span className="block font-sans text-[12px] text-muted">{s.worker_info.feed}</span>}</Figure>
        <Figure label="Broker">{s.worker_info.broker ?? "–"}</Figure>
      </Card>
      {err && <div className="mt-3"><Notice tone="warn">{err}</Notice></div>}
      {!s.kill && <button type="button" onClick={() => setConfirm(true)} className="focus-ring mt-3 flex h-14 w-full items-center justify-center rounded-[16px] border border-sell bg-sell/10 text-[16px] font-semibold text-sell active:bg-sell/20">Stop everything</button>}

      <Section title="What the tests say" right={<Link to={`${base}/runs`} className="text-[14px] text-muted underline">All backtests</Link>}>
        {group.length ? <><RunLines runs={group} base={base} /><p className="mt-2 px-1 text-[13px] leading-snug text-muted">{latest.label ? `${latest.label.replace(/[:,]? ?model [A-E]$/i, "")}. ` : ""}{latest.period_from && latest.period_to ? `${nyShort(latest.period_from)} ${new Date(latest.period_from).getFullYear()} to ${nyShort(latest.period_to)} ${new Date(latest.period_to).getFullYear()}. ` : ""}Backtests, after costs; not a forecast.</p></>
          : <Card className="px-4 py-5"><p className="text-[15px]">No backtest has been stored yet.</p><p className="mt-1 text-[14px] text-muted">Start the worker with its data files, then ask for one under Backtests.</p></Card>}
      </Section>

      <Section title="Paper trading">
        {paper ? (
          <Card>
            <div className="px-4 pt-3"><EquityLine curve={paper.curve ?? []} start={paper.metrics.start_equity ?? 0} /></div>
            <Figure label="Trades">{paper.metrics.trades ?? 0}</Figure>
            {(feed.data ?? []).map((e) => <div key={e.id} className="flex items-baseline gap-3 border-b border-border px-4 py-2.5 text-[14px] last:border-b-0"><span className="w-[92px] shrink-0 font-mono tabular text-muted">{nyShort(e.ts)} {nyTime(e.ts)}</span><span className="min-w-0 flex-1 truncate">{EVENT_NAME[e.type] ?? e.type}{typeof e.data.reason === "string" ? `: ${e.data.reason}` : typeof e.data.side === "string" ? `, ${e.data.side}` : ""}</span>{e.type === "rejected" && <Tag>refused</Tag>}</div>)}
          </Card>
        ) : <Card className="px-4 py-5"><p className="text-[15px]">Paper trading has not run yet.</p><p className="mt-1 text-[14px] leading-snug text-muted">It needs fresh prices during the New York morning. The free data plan releases them hours later, so the first step is a daily replay; see Setup.</p></Card>}
      </Section>

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Stop everything?">
        <p className="text-[15px] leading-snug text-muted">The mode goes to Off, the worker closes any open position at the market and takes no new one, and live trading is locked again. You clear the stop yourself afterwards.</p>
        <div className="mt-5 flex gap-3"><Button variant="ghost" full onClick={() => setConfirm(false)}>Cancel</Button><Button variant="danger" full busy={busy === "kill"} onClick={() => { setConfirm(false); void act("kill", () => supabase.rpc("tjr_kill", { p_on: true })); }}>Stop everything</Button></div>
      </Sheet>
    </div>
  );
}
