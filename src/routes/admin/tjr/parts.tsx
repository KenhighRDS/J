import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import { MODEL_NAME, clear, rText, tone, usd, verdict, type TjrDataset, type TjrEvent, type TjrJob, type TjrRun, type TjrStatus, type TjrTrade, type TjrVersion } from "../../../lib/tjr";

/** Everything the TJR pages can be handed instead of the network (dev previews). */
export interface TjrPreview { status?: TjrStatus; runs?: TjrRun[]; trades?: TjrTrade[]; events?: TjrEvent[]; jobs?: TjrJob[]; versions?: TjrVersion[]; datasets?: TjrDataset[]; base?: string }
export const BASE = "/admin/tjr";

/** Loads once and on demand. With preview data it never touches the network. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[], preview?: T): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(preview ?? null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(() => {
    if (preview !== undefined) return;
    load().then((d) => { setData(d); setError(null); }).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return preview !== undefined ? { data: preview, error: null, reload: run } : { data, error, reload: run };     // a preview is shown as given, also when it changes
}
export async function rows<T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as T;
}
export const RUN_COLS = "id,kind,status,label,group_id,version_id,model,experimental,symbol,trade_symbol,config_id,rules_version,period_from,period_to,metrics,rejected,curve,provenance,error,created_at,finished_at";
export const loadRuns = () => rows<TjrRun[]>(supabase.from("tjr_runs").select(RUN_COLS).order("created_at", { ascending: false }).limit(60));
export const loadStatus = async () => rows<TjrStatus | null>(supabase.rpc("tjr_status"));

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-7">
      <div className="mb-2 flex items-baseline justify-between gap-3 px-1"><h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>{right}</div>
      {children}
    </section>
  );
}
export function Tag({ children, tone: t = "muted" }: { children: ReactNode; tone?: "muted" | "warn" | "ok" }) {
  const c = { muted: "border-border text-muted", warn: "border-sell/50 text-sell", ok: "border-buy/50 text-buy" }[t];
  return <span className={`inline-flex h-6 shrink-0 items-center rounded-full border px-2 text-[12px] ${c}`}>{children}</span>;
}
export function Figure({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0">
      <span className="text-[15px] text-muted">{label}</span>
      <span className="text-right"><span className="font-mono tabular text-[15px]">{children}</span>{sub && <span className="block text-[12px] text-muted">{sub}</span>}</span>
    </div>
  );
}
/** A row of runs compared on the same data: one line a model, each a link to its page. */
export function RunLines({ runs, base = BASE }: { runs: TjrRun[]; base?: string }) {
  return (
    <div className="overflow-hidden rounded-[16px] border border-border bg-surface">
      {runs.map((r) => (
        <Link key={r.id} to={`${base}/runs/${r.id}`} className="focus-ring block border-b border-border px-4 py-3 last:border-b-0 active:bg-surface-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[15px]"><span className="font-semibold">{r.model}</span> <span className="text-muted">{MODEL_NAME[r.model]}</span></span>
            <span className={`shrink-0 font-mono tabular text-[15px] ${r.metrics.trades && clear(r.metrics) ? tone(r.metrics.expectancy_r) : "text-muted"}`}>{r.metrics.trades ? rText(r.metrics.expectancy_r) : "no trades"}</span>
          </div>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">{verdict(r.metrics)}</p>
          {r.metrics.trades > 0 && <p className="mt-0.5 font-mono tabular text-[12px] text-muted">{r.metrics.trades} trade{r.metrics.trades === 1 ? "" : "s"}, {usd(r.metrics.net_usd, true)}</p>}
          {r.experimental && <div className="mt-1.5"><Tag>Experimental reconstruction</Tag></div>}
        </Link>
      ))}
    </div>
  );
}
export const HYPOTHETICAL = "A backtest: fixed rules replayed on past prices, after costs. No order was placed anywhere, and past results do not predict future ones.";
