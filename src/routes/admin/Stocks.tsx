import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Field, Notice, Toggle } from "../../components/ui";
import { callFunction, supabase } from "../../lib/supabase";
import type { StockPick } from "../../lib/types";
import { dayShort } from "../../lib/stocks";
import { pct, pickMovePct } from "../../lib/portfolio";

interface Keys { finnhub_key: boolean; massive_key: boolean; sec_contact: string | null }
interface Probe { sources: Record<string, { ok: boolean; note: string }>; investors_loaded?: number; holdings_matched?: number }
interface Scan { id: string; trading_day: string; dry_run: boolean; stage: string; stats: { seeded?: { earnings?: number; ipo?: number; breakout?: number; listing?: number }; picked?: number; passed_over?: number; rejected?: number; errors?: number; min_score?: number; uptrend?: boolean | null; note?: string }; error: string | null; started_at: string }
interface Cand { id: number; symbol: string; source: "earnings" | "ipo" | "breakout" | "listing"; status: string; score: number | null; detail: { reject?: string | null; name?: string; preview?: { headline?: string; horizon?: string } } }
const sourceName: Record<string, string> = { finnhub: "Finnhub (prices, earnings, listings)", massive: "Massive (descriptions, price history)", sec: "SEC filings (big investors)", openfigi: "Ticker lookup for filings", binance: "Binance market data (prices, candles)", coingecko: "CoinGecko (market value, descriptions)" };
const running = (s: Scan | null) => s != null && ["seed", "enrich", "select"].includes(s.stage);

/** Admin: data keys, the on/off switch, a preview scan, a test pick, and why each stock was picked or passed over. */
export function AdminStocks({ preview, asset = "stock" }: { preview?: { keys: Keys; scan: Scan; cands: Cand[]; open: StockPick[]; probe: Probe }; asset?: "stock" | "crypto" }) {
  const coin = asset === "crypto", fn = coin ? "crypto" : "stocks", pre = coin ? "crypto" : "stocks";   // function name, settings prefix
  const [keys, setKeys] = useState<Keys | null>(preview?.keys ?? null);
  const [fk, setFk] = useState(""); const [mk, setMk] = useState(""); const [contact, setContact] = useState(preview?.keys.sec_contact ?? "");
  const [enabled, setEnabled] = useState(true); const [maxDay, setMaxDay] = useState("2"); const [minScore, setMinScore] = useState("70");
  const [probe, setProbe] = useState<Probe | null>(preview?.probe ?? null);
  const [scan, setScan] = useState<Scan | null>(preview?.scan ?? null); const [cands, setCands] = useState<Cand[]>(preview?.cands ?? []);
  const [open, setOpen] = useState<StockPick[]>(preview?.open ?? []);
  const [symbol, setSymbol] = useState(coin ? "BTC" : "NVDA");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (preview) return;
    const [k, st, sc, op] = await Promise.all([
      supabase.rpc("admin_data_keys"),
      supabase.from("settings").select("key,value").in("key", [`${pre}_enabled`, `${pre}_max_per_day`, `${pre}_min_score`]),
      supabase.from("stock_scans").select("*").eq("asset", asset).order("started_at", { ascending: false }).limit(1),
      supabase.from("stock_picks").select("*").eq("asset", asset).eq("status", "open").order("sent_at", { ascending: false }),
    ]);
    if (k.data) { setKeys(k.data as Keys); setContact((c) => c || (k.data as Keys).sec_contact || ""); }
    for (const r of (st.data ?? []) as { key: string; value: unknown }[]) { if (r.key === `${pre}_enabled`) setEnabled(Number(r.value) !== 0); if (r.key === `${pre}_max_per_day`) setMaxDay(String(r.value)); if (r.key === `${pre}_min_score`) setMinScore(String(r.value)); }
    const latest = ((sc.data ?? []) as Scan[])[0] ?? null;
    setScan(latest); setOpen((op.data ?? []) as StockPick[]);
    if (latest) { const { data } = await supabase.from("stock_candidates").select("id,symbol,source,status,score,detail").eq("scan_id", latest.id).order("score", { ascending: false, nullsFirst: false }).limit(150); setCands((data ?? []) as Cand[]); }
    else setCands([]);
  }, [preview, asset, pre]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!running(scan) || preview) return; const t = window.setInterval(() => { void load(); }, 8000); return () => window.clearInterval(t); }, [scan, load, preview]);

  const run = async (name: string, fn: () => Promise<string>) => {
    setBusy(name); setMsg(null);
    try { setMsg({ ok: true, text: await fn() }); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed" }); }
    setBusy(null); void load();
  };
  const rpc = async (fn: string, args: Record<string, unknown>) => { const { error } = await supabase.rpc(fn, args); if (error) throw new Error(error.message); };
  const saveKeys = () => run("keys", async () => {
    if (fk.trim()) await rpc("admin_set_data_key", { p_name: "finnhub_key", p_value: fk.trim() });
    if (mk.trim()) await rpc("admin_set_data_key", { p_name: "massive_key", p_value: mk.trim() });
    const c = contact.trim();
    if (c && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) throw new Error("The contact email does not look like an email address");
    if (c !== (keys?.sec_contact ?? "")) await rpc("admin_set_data_key", { p_name: "sec_contact", p_value: c });
    setFk(""); setMk("");
    return "Saved";
  });
  const check = () => run("probe", async () => { const p = await callFunction<Probe>(fn, { action: "probe" }); setProbe(p); return Object.values(p.sources).every((s) => s.ok) ? "Every source answered" : "Some sources need attention, see below"; });
  const saveSending = () => run("sending", async () => {
    const m = Number(maxDay), s = Number(minScore);
    if (!Number.isInteger(m) || m < 0 || m > 5) throw new Error("Picks a day: enter 0 to 5");
    if (!Number.isFinite(s) || s < 50 || s > 95) throw new Error("Minimum score: enter 50 to 95");
    await rpc("admin_set_setting", { p_key: `${pre}_enabled`, p_value: enabled ? 1 : 0 });
    await rpc("admin_set_setting", { p_key: `${pre}_max_per_day`, p_value: m });
    await rpc("admin_set_setting", { p_key: `${pre}_min_score`, p_value: s });
    return enabled ? (coin ? "Saved. Picks go out by themselves after each daily close (midnight UTC)." : "Saved. Picks go out by themselves after each US close.") : "Saved. Automatic picks are paused.";
  });
  const previewScan = () => run("scan", async () => { const r = await callFunction<{ error?: string; seeded?: { earnings?: number; ipo?: number; breakout?: number }; note?: string }>(fn, { action: "scan", dry_run: true, force: true }); if (r.error) throw new Error(r.error); return r.seeded ? (coin ? `Preview started with the ${r.seeded.breakout ?? 0} most traded coins. Nothing is sent. Results fill in below over a few minutes.` : `Preview started with ${r.seeded.earnings} earnings beats and ${r.seeded.ipo} recent listings. Nothing is sent. Results fill in below over a few minutes.`) : (r.note ?? "Scan running"); });
  const testPick = () => run("test", async () => { const r = await callFunction<{ pushed: number; description: boolean; investors: number }>(fn, { action: "test_pick", symbol }); return `Test pick sent to admins (${r.pushed} ${r.pushed === 1 ? "device" : "devices"}). ${r.description ? "It has a description" : coin ? "No description (the source was busy)" : "No description (add the Massive key)"}; ${r.investors} big ${r.investors === 1 ? (coin ? "company holds" : "investor holds") : coin ? "companies hold" : "investors hold"} it.`; });
  const close = (k: StockPick) => run(`close-${k.id}`, async () => { await callFunction(fn, { action: "close", pick_id: k.id }); return `${k.symbol} closed`; });

  const order = { picked: 0, scored: 1, queued: 2, rejected: 3, error: 4 } as Record<string, number>;
  const list = [...cands].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || (b.score ?? 0) - (a.score ?? 0));
  return (
    <div className="space-y-4">
      {msg && <Notice tone={msg.ok ? "ok" : "warn"}>{msg.text}</Notice>}
      {coin && (
        <Card className="space-y-3 p-4">
          <h2 className="text-[17px] font-semibold">Data sources</h2>
          <p className="text-[14px] leading-snug text-muted">Crypto needs no key. Prices and candles come from Binance's public market data; market value and descriptions from CoinGecko.</p>
          <Button type="button" variant="ghost" full busy={busy === "probe"} onClick={check}>Check the sources</Button>
          {probe && <ul className="divide-y divide-border rounded-[14px] border border-border">{Object.entries(probe.sources).map(([k, v]) => <li key={k} className="px-3.5 py-2.5"><p className="text-[14px]"><span className={v.ok ? "text-buy" : "text-sell"}>{v.ok ? "Working" : "Not working"}</span> · {sourceName[k] ?? k}</p><p className="mt-0.5 break-words text-[13px] leading-snug text-muted">{v.note}</p></li>)}</ul>}
        </Card>
      )}
      {!coin && <Card className="space-y-3 p-4">
        <h2 className="text-[17px] font-semibold">Data keys</h2>
        <p className="text-[14px] leading-snug text-muted">Keys are stored on the server and never shown again. Paste a new one to replace it.</p>
        <Field label={`Finnhub key${keys?.finnhub_key ? " (saved)" : " (needed)"}`} type="password" autoComplete="off" value={fk} onChange={(e) => setFk(e.target.value)} placeholder={keys?.finnhub_key ? "Saved. Paste to replace" : "Paste the key"} hint="Free at finnhub.io, Get free API key. Runs the scan and the price tracking." />
        <Field label={`Massive key${keys?.massive_key ? " (saved)" : " (optional)"}`} type="password" autoComplete="off" value={mk} onChange={(e) => setMk(e.target.value)} placeholder={keys?.massive_key ? "Saved. Paste to replace" : "Paste the key"} hint="Free at massive.com (the new name of Polygon). Adds what the company does and a stop based on how much the stock moves." />
        <Field label="Contact email for SEC filings" type="email" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="you@example.com" hint="The SEC asks every app that reads its filings to give a contact email. Needed for the big-investor holdings; it is sent only to the SEC." />
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" busy={busy === "keys"} onClick={saveKeys}>Save</Button>
          <Button type="button" variant="ghost" busy={busy === "probe"} onClick={check}>Check keys</Button>
        </div>
        {probe && (
          <ul className="divide-y divide-border rounded-[14px] border border-border">
            {Object.entries(probe.sources).map(([k, v]) => <li key={k} className="px-3.5 py-2.5"><p className="text-[14px]"><span className={v.ok ? "text-buy" : "text-sell"}>{v.ok ? "Working" : "Not working"}</span> · {sourceName[k] ?? k}</p><p className="mt-0.5 break-words text-[13px] leading-snug text-muted">{v.note}</p></li>)}
            <li className="px-3.5 py-2.5 text-[13px] text-muted">{probe.investors_loaded ?? 0} of 17 big investors loaded, {(probe.holdings_matched ?? 0).toLocaleString()} holdings matched to tickers.</li>
          </ul>
        )}
      </Card>}

      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-[17px] font-semibold">Send picks automatically</h2><p className="text-[13px] text-muted">{coin ? "After each daily close (midnight UTC), with no review" : "After each US close, with no review"}</p></div><Toggle on={enabled} onChange={setEnabled} label="Send picks automatically" /></div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Picks a day, at most" type="number" inputMode="numeric" value={maxDay} onChange={(e) => setMaxDay(e.target.value)} hint="Default 2" />
          <Field label="Minimum score" type="number" inputMode="numeric" value={minScore} onChange={(e) => setMinScore(e.target.value)} hint="Default 70 of 100" />
        </div>
        <Button type="button" full busy={busy === "sending"} onClick={saveSending}>Save</Button>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="text-[17px] font-semibold">Try it</h2>
        <p className="text-[14px] leading-snug text-muted">{coin ? "A preview runs the real scan on the last closed day and sends nothing. A test pick goes to admins only, for any coin traded against USDT on Binance." : "A preview runs the real scan on the last trading day and sends nothing. A test pick goes to admins only, any day of the week."}</p>
        <Button type="button" variant="ghost" full busy={busy === "scan"} disabled={running(scan)} onClick={previewScan}>{running(scan) ? "Scan running…" : "Preview the scan"}</Button>
        <div className="flex items-end gap-3">
          <Field className="w-28 shrink-0" label="Ticker" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase().slice(0, coin ? 10 : 5))} />
          <Button type="button" variant="ghost" className="flex-1" busy={busy === "test"} onClick={testPick}>Send a test pick</Button>
        </div>
      </Card>

      {scan && (
        <Card className="p-4">
          <h2 className="text-[17px] font-semibold">{scan.dry_run ? "Preview scan" : "Latest scan"}, {dayShort(scan.trading_day)}</h2>
          <p className="mt-1 text-[14px] leading-snug text-muted">
            {scan.stage === "failed" ? `Failed: ${scan.error ?? "unknown error"}` : scan.stats.note ? scan.stats.note
              : running(scan) ? `Working through ${(scan.stats.seeded?.earnings ?? 0) + (scan.stats.seeded?.ipo ?? 0) + (scan.stats.seeded?.breakout ?? 0) + (scan.stats.seeded?.listing ?? 0)} candidates (${cands.filter((c) => c.status === "queued").length} to go). It checks a batch every minute.`
              : coin ? `${scan.stats.picked ?? 0} ${scan.dry_run ? "would be picked" : "picked"} from ${scan.stats.seeded?.breakout ?? 0} established coins and ${scan.stats.seeded?.listing ?? 0} recent listings. Bar: ${scan.stats.min_score ?? "–"}.`
              : `${scan.stats.picked ?? 0} ${scan.dry_run ? "would be picked" : "picked"} from ${scan.stats.seeded?.earnings ?? 0} earnings beats and ${scan.stats.seeded?.ipo ?? 0} recent listings. Bar: ${scan.stats.min_score ?? "–"}.`}
            {scan.stats.uptrend === false ? ` ${coin ? "Bitcoin" : "The market"} is below its 200-day average, so the bar is 10 points higher.` : ""}
          </p>
          {list.length > 0 && (
            <ul className="mt-3 divide-y divide-border rounded-[14px] border border-border">
              {list.map((c) => (
                <li key={c.id} className="flex items-start gap-3 px-3.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px]"><span className="font-medium">{c.symbol}</span> <span className="text-muted">{c.detail.name ?? ""}</span></p>
                    <p className="text-[13px] leading-snug text-muted">{c.source === "ipo" || c.source === "listing" ? "Recent listing" : c.source === "breakout" ? "Breakout check" : "Earnings beat"}: {c.status === "picked" ? (c.detail.preview?.headline ?? "picked and sent") : c.status === "scored" ? "passed the filters, below the bar or beaten by a better one" : c.status === "queued" ? "waiting" : (c.detail.reject ?? c.status)}</p>
                  </div>
                  <span className={`shrink-0 font-mono tabular text-[14px] ${c.status === "picked" ? "text-buy" : "text-muted"}`}>{c.score != null ? Math.round(c.score) : "–"}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {open.length > 0 && (
        <Card className="p-4">
          <h2 className="text-[17px] font-semibold">Open picks</h2>
          <ul className="mt-3 divide-y divide-border rounded-[14px] border border-border">
            {open.map((k) => (
              <li key={k.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <Link to={`/stocks/${k.id}`} className="focus-ring min-w-0 flex-1"><p className="truncate text-[14px]"><span className="font-medium">{k.symbol}</span>{k.is_test ? " (test)" : ""} <span className="text-muted">{k.horizon === "long" ? "long-term" : "swing"}, {dayShort(k.sent_at)}</span></p></Link>
                <span className="font-mono tabular text-[14px] text-muted">{pct(pickMovePct(k))}</span>
                <button type="button" disabled={busy != null} onClick={() => close(k)} className="focus-ring h-8 shrink-0 rounded-full border border-border px-3 text-[13px] disabled:opacity-40">Close</button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
