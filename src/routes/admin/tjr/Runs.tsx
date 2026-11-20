import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Card, Field, Notice, Sheet } from "../../../components/ui";
import { EquityLine } from "../../../components/TradeChart";
import { supabase } from "../../../lib/supabase";
import { EXIT_NAME, MODELS, MODEL_NAME, MODEL_TEXT, clear, nyDay, nyShort, nyTime, rText, tone, usd, verdict, type Model, type TjrDataset, type TjrJob, type TjrRun, type TjrTrade, type TjrVersion, type WalkForward } from "../../../lib/tjr";
import { BASE, Figure, HYPOTHETICAL, RunLines, Section, Tag, loadRuns, rows, useLoad, type TjrPreview } from "./parts";

const year = (t: string) => new Date(t).getFullYear();
const span = (r: TjrRun) => (r.period_from && r.period_to ? `${nyShort(r.period_from)} ${year(r.period_from)} to ${nyShort(r.period_to)} ${year(r.period_to)}` : "");
const param = (p: Record<string, unknown>) => Object.entries(p).map(([k, v]) => `${k.replace("exits.", "").replace(/_/g, " ")} ${String(v)}`).join(", ");

/** Every stored test, newest first; runs made on identical data and assumptions are shown together. */
export function Runs({ preview }: { preview?: TjrPreview }) {
  const base = preview?.base ?? BASE;
  const runs = useLoad(loadRuns, [], preview?.runs);
  const jobs = useLoad(() => rows<TjrJob[]>(supabase.from("tjr_jobs").select("id,kind,params,status,note,run_ids,created_at,finished_at").order("created_at", { ascending: false }).limit(8)), [], preview ? preview.jobs ?? [] : undefined);
  const versions = useLoad(() => rows<TjrVersion[]>(supabase.from("tjr_versions").select("id,name,note,config,model,experimental,created_at").order("created_at", { ascending: false })), [], preview ? preview.versions ?? [] : undefined);
  const data = useLoad(() => rows<TjrDataset[]>(supabase.from("tjr_datasets").select("*").order("symbol")), [], preview ? preview.datasets ?? [] : undefined);
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => {
    const out: TjrRun[][] = [], seen = new Map<string, TjrRun[]>();
    for (const r of (runs.data ?? []).filter((x) => x.kind === "backtest" || x.kind === "walkforward")) {
      if (!r.group_id) { out.push([r]); continue; }
      let g = seen.get(r.group_id);
      if (!g) { g = []; seen.set(r.group_id, g); out.push(g); }
      g.push(r);
    }
    return out.map((g) => [...g].sort((a, b) => a.model.localeCompare(b.model)));
  }, [runs.data]);
  const waiting = (jobs.data ?? []).filter((j) => j.status !== "done");
  return (
    <div>
      <Button full onClick={() => setOpen(true)}>Run a backtest</Button>
      {runs.error && <div className="mt-3"><Notice tone="warn">{runs.error}</Notice></div>}
      {waiting.length > 0 && (
        <Section title="Asked for">
          <Card>{waiting.map((j) => (
            <div key={j.id} className="border-b border-border px-4 py-3 last:border-b-0">
              <div className="flex items-baseline justify-between gap-3"><span className="text-[15px]">{j.kind === "walkforward" ? "Walk-forward" : "Backtest"}, {Array.isArray(j.params.models) ? `models ${(j.params.models as string[]).join(" ")}` : `model ${String(j.params.model ?? "A")}`}</span><Tag tone={j.status === "failed" ? "warn" : "muted"}>{j.status === "queued" ? "waiting for the worker" : j.status}</Tag></div>
              {j.note && <p className="mt-1 text-[13px] leading-snug text-muted">{j.note}</p>}
            </div>
          ))}</Card>
        </Section>
      )}
      {groups.length === 0 && runs.data && <Card className="mt-4 px-4 py-5"><p className="text-[15px]">No backtest yet.</p><p className="mt-1 text-[14px] leading-snug text-muted">A backtest runs on the worker, on the price files it holds. Ask for one above; it appears here when the worker has done it.</p></Card>}
      {groups.map((g) => (
        <Section key={g[0].id} title={g.length > 1 ? g[0].label.replace(/[:,]? ?model [A-E]$/i, "") || "Models compared" : g[0].label || `Model ${g[0].model}`} right={<span className="shrink-0 text-[13px] text-muted">{nyShort(g[0].created_at)}</span>}>
          <RunLines runs={g} base={base} />
          <p className="mt-2 px-1 text-[13px] text-muted">{g[0].kind === "walkforward" ? "Walk-forward test stretch. " : ""}{span(g[0])}{g.length > 1 ? ". Same data and costs for each model." : ""}</p>
        </Section>
      ))}
      <AskSheet open={open} onClose={() => setOpen(false)} versions={versions.data ?? []} datasets={data.data ?? []} disabled={Boolean(preview)} onAsked={() => { setOpen(false); jobs.reload(); }} />
    </div>
  );
}

function AskSheet({ open, onClose, versions, datasets, disabled, onAsked }: { open: boolean; onClose: () => void; versions: TjrVersion[]; datasets: TjrDataset[]; disabled: boolean; onAsked: () => void }) {
  const [models, setModels] = useState<Model[]>(["A", "E"]), [kind, setKind] = useState<"compare" | "walkforward">("compare");
  const [from, setFrom] = useState(""), [to, setTo] = useState(""), [version, setVersion] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const first = datasets.map((d) => d.first_at).filter(Boolean).sort().pop(), last = datasets.map((d) => d.last_at).filter(Boolean).sort()[0];
  const toggle = (m: Model) => setModels((cur) => (kind === "walkforward" ? [m] : cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m].sort() as Model[]));
  const ask = async () => {
    if (disabled) return;
    setBusy(true); setErr(null);
    const params = { ...(kind === "walkforward" ? { model: models[0] } : { models }), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(version ? { version_id: version } : {}) };
    const { error } = await supabase.rpc("tjr_enqueue", { p_kind: kind === "compare" && models.length === 1 ? "backtest" : kind, p_params: params });
    setBusy(false);
    if (error) setErr(error.message); else onAsked();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Run a backtest">
      <div role="radiogroup" aria-label="Kind of test" className="flex rounded-full bg-surface-2 p-0.5">
        {([["compare", "Backtest"], ["walkforward", "Walk-forward"]] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => { setKind(k); if (k === "walkforward") setModels((c) => c.slice(0, 1)); }} className={`focus-ring h-9 flex-1 rounded-full text-[14px] ${kind === k ? "bg-text text-black" : "text-muted"}`}>{l}</button>)}
      </div>
      <p className="mt-2 text-[13px] leading-snug text-muted">{kind === "compare" ? "Each chosen model over the same period, data and costs." : "Settings are chosen on the first three quarters of the period and tested once on the last quarter."}</p>
      <p className="mb-1.5 mt-4 text-[13px] text-muted">{kind === "compare" ? "Models" : "Model"}</p>
      <div className="flex flex-wrap gap-2">{MODELS.map((m) => <button key={m} type="button" aria-pressed={models.includes(m)} onClick={() => toggle(m)} title={MODEL_TEXT[m]} className={`focus-ring h-10 rounded-full px-4 text-[14px] ${models.includes(m) ? "bg-text text-black" : "border border-border text-muted"}`}>{m}{m === "E" ? " (experimental)" : ""}</button>)}</div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} hint={first ? `data starts ${nyDay(first)}` : undefined} />
        <Field label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} hint={last ? `data ends ${nyDay(last)}` : undefined} />
      </div>
      <label className="mt-4 block"><span className="mb-1.5 block text-[13px] text-muted">Settings</span>
        <select value={version} onChange={(e) => setVersion(e.target.value)} className="focus-ring h-12 w-full rounded-[14px] border border-border bg-surface-2 px-3 text-[15px] text-text"><option value="">As specified (defaults)</option>{versions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
      </label>
      {datasets.length === 0 && <div className="mt-4"><Notice>The worker has not reported any price file yet. The request will wait until it does.</Notice></div>}
      {err && <div className="mt-4"><Notice tone="warn">{err}</Notice></div>}
      <div className="mt-5"><Button full busy={busy} disabled={models.length === 0} onClick={() => { void ask(); }}>Ask the worker to run it</Button></div>
    </Sheet>
  );
}

/** One run: what it was, what came out, how far to trust it, and every trade. */
export function Run({ preview }: { preview?: TjrPreview }) {
  const { id = "" } = useParams(), nav = useNavigate(), base = preview?.base ?? BASE;
  const run = useLoad(() => rows<TjrRun>(supabase.from("tjr_runs").select("*").eq("id", id).single()), [id], preview ? (preview.runs ?? []).find((r) => r.id === id) ?? preview.runs?.[0] : undefined);
  const trades = useLoad(() => rows<TjrTrade[]>(supabase.from("tjr_trades").select("id,run_id,seq,model,symbol,side,qty,entry_at,entry,stop,target,target_label,exit_at,exit,exit_reason,risk_usd,costs_usd,net_usd,r").eq("run_id", id).order("seq")), [id], preview ? (preview.trades ?? []).filter((t) => t.run_id === (run.data?.id ?? id)) : undefined);
  const [busy, setBusy] = useState(false);
  const r = run.data;
  if (run.error) return <Notice tone="warn">{run.error}</Notice>;
  if (!r) return <p className="px-1 py-8 text-[14px] text-muted">Loading…</p>;
  const m = r.metrics, wf = (r.kind === "walkforward" ? r.extra : null) as WalkForward | null, list = trades.data ?? [];
  const refused = Object.entries(r.rejected ?? {}), most = Math.max(1, ...refused.map(([, n]) => n));
  const csv = () => {
    const head = ["#", "entry (New York)", "side", "contracts", "entry", "stop", "target", "exit", "why", "net $", "R"];
    const body = list.map((t) => [t.seq, `${nyDay(t.entry_at)} ${nyTime(t.entry_at)}`, t.side, t.qty, t.entry, t.stop, t.target ?? "", t.exit ?? "", EXIT_NAME[t.exit_reason] ?? t.exit_reason, t.net_usd, t.r]);
    const text = [head, ...body].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" })); a.download = `tjr-model-${r.model}-trades.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const remove = async () => { if (preview) return; setBusy(true); await supabase.rpc("tjr_delete_run", { p_run: r.id }); nav(`${base}/runs`); };
  return (
    <div>
      <Link to={`${base}/runs`} className="focus-ring -ml-1 inline-flex h-9 items-center px-1 text-[14px] text-muted">‹ Backtests</Link>
      <h2 className="mt-1 text-[22px] font-semibold leading-tight tracking-tight">Model {r.model}: {MODEL_NAME[r.model]}</h2>
      <p className="mt-1 text-[14px] leading-snug text-muted">{MODEL_TEXT[r.model]}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">{r.experimental && <Tag>Experimental reconstruction, not "exact TJR"</Tag>}{m.small_sample !== false && <Tag tone="warn">Small sample</Tag>}{r.kind === "walkforward" && <Tag>Walk-forward test stretch</Tag>}</div>
      <p className={`mt-4 text-[17px] leading-snug ${clear(m) ? tone(m.expectancy_r) : ""}`}>{verdict(m)}</p>
      <p className="mt-1 text-[13px] leading-snug text-muted">{span(r)}. Signals from {r.symbol}, traded as {r.trade_symbol}. {HYPOTHETICAL}</p>

      {m.trades > 0 && (
        <Card className="mt-4">
          <div className="px-4 pt-3"><EquityLine curve={r.curve ?? []} start={m.start_equity ?? 0} /></div>
          <Figure label="Trades" sub={`${Math.round(((m.win_rate ?? 0) / 100) * m.trades)} won (${m.win_rate}%)`}>{m.trades}</Figure>
          <Figure label="Average a trade" sub={m.expectancy_r_stderr != null ? `give or take ${(2 * m.expectancy_r_stderr).toFixed(2)} R` : undefined}><span className={clear(m) ? tone(m.expectancy_r) : ""}>{rText(m.expectancy_r)}</span></Figure>
          <Figure label="Net result" sub={`on ${usd(m.start_equity)}, costs ${usd(m.costs_usd)} included`}><span className={tone(m.net_usd)}>{usd(m.net_usd, true)}</span></Figure>
          <Figure label="Profit factor">{m.profit_factor ?? "–"}</Figure>
          <Figure label="Largest drawdown" sub={`${m.max_drawdown_pct}% of the peak`}>{usd(m.max_drawdown_usd)}</Figure>
          <Figure label="Longest losing run">{m.longest_loss_streak}</Figure>
          <Figure label="Time in a trade">{m.avg_hold_minutes} min</Figure>
        </Card>
      )}

      {wf?.frozen && (
        <Section title="How the settings were chosen">
          {wf.test_is_out_of_sample === false && <div className="mb-3"><Notice tone="warn">This test stretch has been looked at {wf.test_stretch_used_times} times with different settings. It no longer counts as unseen data.</Notice></div>}
          <Card>
            <Figure label="Chosen, then frozen">{<span className="font-sans text-[14px]">{param(wf.frozen.params)}</span>}</Figure>
            {(wf.grid ?? []).filter((x) => x.validation).map((x, i) => <Figure key={i} label={param(x.params)} sub={`then ${x.validation?.trades ?? 0} trades, ${rText(x.validation?.expectancy_r)} on validation`}>{x.train.trades} trades, {rText(x.train.expectancy_r)}</Figure>)}
          </Card>
          {wf.sensitivity && <p className="mt-2 px-1 text-[13px] leading-snug text-muted">{wf.sensitivity.settings} settings were tried on the first stretch; among those with enough trades the average ranged from {rText(wf.sensitivity.train_expectancy_min)} to {rText(wf.sensitivity.train_expectancy_max)}. The figures at the top are the last stretch, opened once.</p>}
        </Section>
      )}

      {m.by_side && Object.keys(m.by_side).length > 0 && (
        <Section title="Long and short"><Card>{Object.entries(m.by_side).map(([k, v]) => <Figure key={k} label={k === "long" ? "Long" : "Short"} sub={`${v.trades} trades, ${v.wins} won`}><span className={tone(v.r)}>{rText(v.r)}</span></Figure>)}</Card></Section>
      )}
      {m.by_month && Object.keys(m.by_month).length > 1 && (
        <Section title="Month by month"><Card className="md:grid md:grid-cols-2 md:[&>div]:border-b md:[&>div:nth-child(odd)]:border-r">{Object.entries(m.by_month).map(([k, v]) => <Figure key={k} label={new Date(`${k}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric" })} sub={`${v.trades} trade${v.trades === 1 ? "" : "s"}`}><span className={tone(v.r)}>{rText(v.r)}</span></Figure>)}</Card></Section>
      )}

      {refused.length > 0 && (
        <Section title="Setups that did not become trades">
          <Card className="px-4 py-2">{refused.slice(0, 10).map(([why, n]) => (
            <div key={why} className="border-b border-border py-2.5 last:border-b-0">
              <div className="flex items-baseline justify-between gap-3 text-[14px]"><span className="min-w-0">{why.replace(/^[a-z]+: /, (s) => s.charAt(0).toUpperCase() + s.slice(1)).replace("is .R away, under the R minimum", "is too close").replace("risks $., more than the $. budget", "risks more than the budget").replace("risks $,., more than the $. budget", "risks more than the budget")}</span><span className="shrink-0 font-mono tabular text-muted">{n.toLocaleString("en-US")}</span></div>
              <div className="mt-1.5 h-1 rounded-full bg-surface-2"><div className="h-1 rounded-full bg-chrome-3" style={{ width: `${Math.max(1.5, (n / most) * 100)}%` }} /></div>
            </div>
          ))}</Card>
        </Section>
      )}

      <Section title={`Trades${list.length ? ` (${list.length})` : ""}`} right={list.length > 0 ? <button type="button" onClick={csv} className="focus-ring text-[14px] text-muted underline">Download CSV</button> : undefined}>
        {list.length === 0 ? <Card className="px-4 py-5 text-[15px] text-muted">No trade passed every rule in this period.</Card> : (
          <Card>{list.map((t) => (
            <Link key={t.id} to={`${base}/runs/${r.id}/${t.seq}`} className="focus-ring flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 active:bg-surface-2">
              <span className="w-[86px] shrink-0 text-[14px]"><span className="block">{nyShort(t.entry_at)} {String(year(t.entry_at)).slice(2)}</span><span className="block font-mono tabular text-[12px] text-muted">{nyTime(t.entry_at)}</span></span>
              <span className="min-w-0 flex-1 text-[14px]"><span className={t.side === "long" ? "text-buy" : "text-sell"}>{t.side === "long" ? "Long" : "Short"}</span> <span className="text-muted">{t.qty} × {t.symbol}</span><span className="block truncate text-[12px] text-muted">{EXIT_NAME[t.exit_reason] ?? t.exit_reason}</span></span>
              <span className={`shrink-0 text-right font-mono tabular text-[15px] ${tone(t.r)}`}>{rText(t.r)}<span className="block text-[12px] text-muted">{usd(t.net_usd, true)}</span></span>
            </Link>
          ))}</Card>
        )}
      </Section>

      <Section title="Data and assumptions">
        <Card>
          {Object.entries(r.provenance ?? {}).map(([sym, p]) => <Figure key={sym} label={sym} sub={p.sha256 ? `${(p.rows ?? 0).toLocaleString("en-US")} one-minute bars, file ${p.sha256.slice(0, 10)}` : undefined}><span className="font-sans text-[13px]">{p.source ?? "not stated"}</span></Figure>)}
          <Figure label="Rules / settings">{r.rules_version} / {r.config_id.slice(0, 8)}</Figure>
        </Card>
        <p className="mt-2 px-1 text-[13px] leading-snug text-muted">Entry at the next minute's open plus a tick. A stop fills a tick worse than its price; a target only once price trades through it. If one minute touches both, it counts as the stop.</p>
      </Section>
      {(r.kind === "backtest" || r.kind === "walkforward") && <div className="mt-8"><Button variant="quiet" busy={busy} onClick={() => { void remove(); }}>Delete this run</Button></div>}
    </div>
  );
}
