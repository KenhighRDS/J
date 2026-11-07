import { useEffect, useRef, useState } from "react";
import { Button, Card, Field, Notice, Toggle } from "../../components/ui";
import { PromoBacktest } from "../../components/PromoCard";
import { shareSize, type ShareFormat } from "../../components/ShareCard";
import { decodeReportFile, parseBacktest, withPipSize, type BacktestSummary } from "../../lib/backtest";
import { canDownloadDirectly, downloadDataUrl, renderPng, sharePng } from "../../lib/share";
import { pips } from "../../lib/format";

const when = (s: string | null) => { if (!s) return "—"; const d = new Date(s.replace(" ", "T")); return Number.isNaN(d.getTime()) ? s : `${d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}, ${s.slice(11, 16)}`; };
const day = (s: string | null) => { if (!s) return "…"; const d = new Date(s.replace(" ", "T")); return Number.isNaN(d.getTime()) ? s.slice(0, 10) : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); };

/** Admin: turn a Strategy Tester report into a share card. Everything happens on the device; nothing is uploaded. */
export function Backtest({ initial }: { initial?: BacktestSummary }) {
  const [parsed, setParsed] = useState<BacktestSummary | null>(initial ?? null);
  const [fileName, setFileName] = useState<string | null>(initial ? "sample-report.html" : null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(initial?.symbol ?? "");
  const [pip, setPip] = useState(initial ? String(initial.pipSize) : "");
  const [showMoney, setShowMoney] = useState(false);
  const [format, setFormat] = useState<ShareFormat>("post");
  const [busy, setBusy] = useState<"share" | "download" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const previewBox = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const el = previewBox.current; if (!el) return;
    const fit = () => setScale(el.clientWidth / shareSize[format].w);
    fit(); const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect();
  }, [format, parsed]);

  const onFile = async (f: File | undefined) => {
    if (!f) return; setError(null); setMsg(null);
    try { const s = parseBacktest(decodeReportFile(await f.arrayBuffer())); setParsed(s); setTitle(s.symbol ?? ""); setPip(String(s.pipSize)); setFileName(f.name); }
    catch (e) { setParsed(null); setFileName(f.name); setError(e instanceof Error ? e.message : "Couldn't read this file"); }
  };
  const pipNum = Number(pip);
  const result = parsed && pipNum > 0 && pipNum !== parsed.pipSize ? withPipSize(parsed, pipNum) : parsed;
  const name = `J-backtest-${(result?.symbol ?? "report").replace(/[^A-Za-z0-9]/g, "")}-${format}.png`;
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

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-[17px] font-semibold">Backtest report</h2>
        <p className="mt-1.5 text-[14px] text-muted">Turn a Strategy Tester result into a J card for sharing. The file stays on this device.</p>
        <p className="mt-2 text-[13px] text-muted">MT5: Strategy Tester → Backtest tab → right-click → Report → Save as HTML. MT4: right-click the Report tab → Save as Report.</p>
        <label className="focus-ring mt-4 flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-text text-[15px] font-medium text-black">
          {fileName ? "Choose another file" : "Choose report file"}
          <input type="file" accept=".htm,.html,text/html" className="sr-only" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {fileName && !error && <p className="mt-2 truncate text-[13px] text-muted">{fileName}</p>}
        {error && <div className="mt-3"><Notice tone="warn">{error}</Notice></div>}
      </Card>

      {result && (
        <>
          <Card className="p-4">
            <h2 className="text-[17px] font-semibold">{result.expert ?? "Report"}{result.symbol ? ` on ${result.symbol}` : ""}{result.timeframe ? ` ${result.timeframe}` : ""}</h2>
            <p className="mt-1 text-[13px] text-muted">{result.platform === "mt5" ? "MetaTrader 5" : "MetaTrader 4"} report{result.periodStart ? ` · tested ${day(result.periodStart)} to ${day(result.periodEnd)}` : ""}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {stat("Total pips", pips(result.totalPips))}{stat("Trades", String(result.trades))}{stat("Win rate", `${result.winRate}%`)}
              {stat("Buys", String(result.buys))}{stat("Sells", String(result.sells))}{result.profitFactor != null ? stat("Profit factor", result.profitFactor.toFixed(2)) : stat("Wins / losses", `${result.wins} / ${result.losses}`)}
              {stat("First trade", when(result.firstTrade))}{stat("Last trade", when(result.lastTrade))}{result.netProfit != null ? stat("Net result", `${result.netProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${result.currency ?? ""}`) : null}
            </div>
          </Card>
          <Card className="p-4 space-y-3">
            <Field label="Title on the card" value={title} onChange={(e) => setTitle(e.target.value)} hint="Symbol by default; use the EA or strategy name if you prefer" />
            <Field label="Pip size" type="number" inputMode="decimal" step="any" value={pip} onChange={(e) => setPip(e.target.value)} error={pip !== "" && !(pipNum > 0) ? "Enter a number above 0" : undefined} hint={`Guessed from the symbol and ${result.digits}-digit prices. Change it if the pips look wrong.`} />
            <div className="flex items-center justify-between py-1"><div><p className="text-[15px]">Show the money result</p><p className="text-[13px] text-muted">Adds the net profit in {result.currency ?? "account currency"} next to the pips</p></div><Toggle on={showMoney} onChange={setShowMoney} label="Show the money result" /></div>
            <div className="flex rounded-[12px] bg-surface-2 p-1">
              {(["post", "story"] as ShareFormat[]).map((f) => <button key={f} type="button" onClick={() => setFormat(f)} className={`focus-ring flex-1 h-9 rounded-[9px] text-[14px] ${format === f ? "bg-text text-black" : "text-muted"}`}>{f === "post" ? "Post 1080×1350" : "Story 1080×1920"}</button>)}
            </div>
          </Card>
          <div ref={previewBox} className="mx-auto w-full max-w-[420px] overflow-hidden rounded-[16px] border border-border" style={{ aspectRatio: `${w} / ${h}` }}>
            <div style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "top left" }}>
              <PromoBacktest result={result} title={title || result.symbol || "Backtest"} showMoney={showMoney} format={format} inline />
            </div>
          </div>
          <div className={`grid gap-3 ${canDownloadDirectly ? "grid-cols-2" : "grid-cols-1"}`}>
            <Button type="button" busy={busy === "share"} onClick={() => go("share")}>{canDownloadDirectly ? "Share" : "Share or save"}</Button>
            {canDownloadDirectly && <Button type="button" variant="ghost" busy={busy === "download"} onClick={() => go("download")}>Download</Button>}
          </div>
          {msg && <p className="text-[13px] text-muted">{msg}</p>}
          <PromoBacktest cardRef={card} result={result} title={title || result.symbol || "Backtest"} showMoney={showMoney} format={format} />
        </>
      )}
    </div>
  );
}
