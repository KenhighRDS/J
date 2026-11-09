import { useEffect, useRef, useState } from "react";
import { Button, Card, Field, Notice } from "../../components/ui";
import { PromoBacktest, plainSymbol, type BacktestShow } from "../../components/PromoCard";
import { shareSize, type ShareFormat } from "../../components/ShareCard";
import { combineBacktests, decodeReportFile, parseBacktest, withPipSize, type BacktestSummary } from "../../lib/backtest";
import { canDownloadDirectly, downloadDataUrl, renderPng, sharePng } from "../../lib/share";
import { pips } from "../../lib/format";

const when = (s: string | null) => { if (!s) return "—"; const d = new Date(s.replace(" ", "T")); return Number.isNaN(d.getTime()) ? s : `${d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}, ${s.slice(11, 16)}`; };
const day = (s: string | null) => { if (!s) return "…"; const d = new Date(s.replace(" ", "T")); return Number.isNaN(d.getTime()) ? s.slice(0, 10) : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); };

interface Loaded { name: string; parsed: BacktestSummary; pip: string }
const applyPip = (l: Loaded) => { const n = Number(l.pip); return n > 0 && n !== l.parsed.pipSize ? withPipSize(l.parsed, n) : l.parsed; };

/** Admin: turn one or more Strategy Tester reports into a single share card. Everything happens on the device; nothing is uploaded. */
export function Backtest({ initial }: { initial?: BacktestSummary[] }) {
  const [reports, setReports] = useState<Loaded[]>((initial ?? []).map((s, i) => ({ name: `sample-report-${i + 1}.html`, parsed: s, pip: String(s.pipSize) })));
  const [errors, setErrors] = useState<string[]>([]);
  const [title, setTitle] = useState("J Signal");
  const [show, setShow] = useState<BacktestShow>("pips");
  const [format, setFormat] = useState<ShareFormat>("post");
  const [busy, setBusy] = useState<"share" | "download" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const previewBox = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const parts = reports.map(applyPip);
  const result = parts.length ? combineBacktests(parts) : null;
  useEffect(() => {
    const el = previewBox.current; if (!el) return;
    const fit = () => setScale(el.clientWidth / shareSize[format].w);
    fit(); const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect();
  }, [format, reports.length]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return; setMsg(null);
    const added: Loaded[] = []; const errs: string[] = [];
    for (const f of Array.from(files)) {
      try { const s = parseBacktest(decodeReportFile(await f.arrayBuffer())); added.push({ name: f.name, parsed: s, pip: String(s.pipSize) }); }
      catch (e) { errs.push(`${f.name}: ${e instanceof Error ? e.message : "Couldn't read this file"}`); }
    }
    setReports((r) => [...r, ...added]); setErrors(errs);
  };
  const setPip = (i: number, pip: string) => setReports((r) => r.map((x, j) => (j === i ? { ...x, pip } : x)));
  const remove = (i: number) => setReports((r) => r.filter((_, j) => j !== i));
  const name = `J-backtest-${parts.map((p) => plainSymbol(p.symbol ?? "")).filter(Boolean).join("-").replace(/[^A-Za-z0-9-]/g, "") || "report"}-${format}.png`;
  const go = async (mode: "share" | "download") => {
    if (!card.current) return; setBusy(mode); setMsg(null);
    try {
      const png = await renderPng(card.current);
      if (mode === "download" && canDownloadDirectly) downloadDataUrl(png, name);
      else { const r = await sharePng(png, name, "J backtest"); if (r === "shared" && !canDownloadDirectly) setMsg("To keep the file, pick Save to Photos, Files or Gallery in the share sheet."); }
    } catch (e) { setMsg(e instanceof Error ? e.message : "Couldn't create the image"); }
    finally { setBusy(null); }
  };
  const { w, h } = shareSize[format];
  const stat = (label: string, value: string) => <div key={label} className="rounded-[12px] bg-surface-2 p-3"><p className="text-[12px] text-muted">{label}</p><p className="mt-0.5 font-mono text-[17px]">{value}</p></div>;
  const lotsVary = result?.tradesList.some((t) => t.volume !== result.baseLot) ?? false;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-[17px] font-semibold">Backtest report</h2>
        <p className="mt-1.5 text-[14px] text-muted">Turn Strategy Tester results into a J card for sharing. Add several reports and they merge into one card. The files stay on this device.</p>
        <p className="mt-2 text-[13px] text-muted">MT5: Strategy Tester → Backtest tab → right-click → Report → Save as HTML. MT4: right-click the Report tab → Save as Report.</p>
        <label className="focus-ring mt-4 flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-text text-[15px] font-medium text-black">
          {reports.length ? "Add another report" : "Choose report files"}
          <input type="file" multiple accept=".htm,.html,text/html" className="sr-only" onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />
        </label>
        {reports.length > 0 && (
          <div className="mt-3 space-y-2">
            {reports.map((r, i) => {
              const pipNum = Number(r.pip);
              return (
                <div key={`${r.name}-${i}`} className="rounded-[12px] bg-surface-2 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px]">{r.name}</p>
                      <p className="mt-0.5 text-[13px] text-muted">{r.parsed.symbol ?? "Unknown symbol"}{r.parsed.timeframe ? ` ${r.parsed.timeframe}` : ""} · {r.parsed.trades} trades · {pips(applyPip(r).totalPips)} pips</p>
                    </div>
                    <button type="button" aria-label={`Remove ${r.name}`} onClick={() => remove(i)} className="focus-ring -mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[22px] leading-none text-muted">×</button>
                  </div>
                  <div className="mt-2 max-w-[200px]">
                    <Field label="Pip size" type="number" inputMode="decimal" step="any" value={r.pip} onChange={(e) => setPip(i, e.target.value)} error={r.pip !== "" && !(pipNum > 0) ? "Enter a number above 0" : undefined} hint={r.parsed.pipSizeGuessed && pipNum === r.parsed.pipSize ? `Guessed from ${r.parsed.digits}-digit prices` : undefined} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {errors.length > 0 && <div className="mt-3"><Notice tone="warn">{errors.join(" · ")}</Notice></div>}
      </Card>

      {result && (
        <>
          <Card className="p-4">
            <h2 className="text-[17px] font-semibold">{reports.length > 1 ? `${reports.length} reports` : result.expert ?? "Report"}{result.symbol ? ` on ${result.symbol}` : ""}{result.timeframe ? ` ${result.timeframe}` : ""}</h2>
            <p className="mt-1 text-[13px] text-muted">{reports.length > 1 ? "Combined" : result.platform === "mt5" ? "MetaTrader 5 report" : "MetaTrader 4 report"}{result.periodStart ? ` · tested ${day(result.periodStart)} to ${day(result.periodEnd)}` : ""}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {stat("Total pips", pips(result.totalPips))}{stat("Trades", String(result.trades))}{stat("Win rate", `${result.winRate}%`)}
              {stat("Buys", String(result.buys))}{stat("Sells", String(result.sells))}{result.profitFactor != null ? stat("Profit factor", result.profitFactor.toFixed(2)) : stat("Wins / losses", `${result.wins} / ${result.losses}`)}
              {stat("First trade", when(result.firstTrade))}{stat("Last trade", when(result.lastTrade))}{result.netProfit != null ? stat("Net result", `${result.netProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${result.currency ?? ""}`) : null}
            </div>
            {lotsVary && <p className="mt-2 text-[13px] text-muted">Lots vary in {reports.length > 1 ? "these reports" : "this report"}, so pips are counted per smallest lot (a trade at double the lot counts double). That keeps pips and the money result on the same side.</p>}
            {reports.length > 1 && result.netProfit == null && <p className="mt-2 text-[13px] text-muted">No money total: the reports are in different currencies or one has no net profit figure.</p>}
          </Card>
          <Card className="p-4 space-y-3">
            <Field label="Title on the card" value={title} onChange={(e) => setTitle(e.target.value)} hint="J Signal by default. The instruments show on the card under the title." />
            <div>
              <p className="text-[15px]">Headline figure</p>
              <div className="mt-2 flex rounded-[12px] bg-surface-2 p-1">
                {(["pips", "cash", "both"] as BacktestShow[]).map((m) => <button key={m} type="button" disabled={m !== "pips" && result.netProfit == null} onClick={() => setShow(m)} className={`focus-ring flex-1 h-9 rounded-[9px] text-[14px] disabled:opacity-40 ${show === m ? "bg-text text-black" : "text-muted"}`}>{m === "pips" ? "Pips" : m === "cash" ? `Cash${result.currency ? ` (${result.currency})` : ""}` : "Both"}</button>)}
              </div>
              <p className="mt-1.5 text-[13px] text-muted">{show === "cash" ? "The net result is the hero; pips stay off the card." : show === "both" ? "Pips are the hero, with the net result beside them." : "Pips only."}</p>
            </div>
            <div className="flex rounded-[12px] bg-surface-2 p-1">
              {(["post", "story"] as ShareFormat[]).map((f) => <button key={f} type="button" onClick={() => setFormat(f)} className={`focus-ring flex-1 h-9 rounded-[9px] text-[14px] ${format === f ? "bg-text text-black" : "text-muted"}`}>{f === "post" ? "Post 1080×1350" : "Story 1080×1920"}</button>)}
            </div>
          </Card>
          <div ref={previewBox} className="mx-auto w-full max-w-[420px] overflow-hidden rounded-[16px] border border-border" style={{ aspectRatio: `${w} / ${h}` }}>
            <div style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "top left" }}>
              <PromoBacktest result={result} parts={parts} title={title || "J Signal"} show={show} format={format} inline />
            </div>
          </div>
          <div className={`grid gap-3 ${canDownloadDirectly ? "grid-cols-2" : "grid-cols-1"}`}>
            <Button type="button" busy={busy === "share"} onClick={() => go("share")}>{canDownloadDirectly ? "Share" : "Share or save"}</Button>
            {canDownloadDirectly && <Button type="button" variant="ghost" busy={busy === "download"} onClick={() => go("download")}>Download</Button>}
          </div>
          {msg && <p className="text-[13px] text-muted">{msg}</p>}
          <PromoBacktest cardRef={card} result={result} parts={parts} title={title || "J Signal"} show={show} format={format} />
        </>
      )}
    </div>
  );
}
