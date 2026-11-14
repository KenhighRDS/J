// crypto: the twin of the stocks function for coins. pg_cron calls it once a minute while there is work
// (private.crypto_due) with { action: "auto" }:
//   1. an unfinished scan continues (enrich a batch → select and send), else
//   2. after the UTC daily candle closes a new scan starts, else
//   3. open crypto picks are re-priced and closed at their stop, target or time limit (every 15 minutes, every day).
// Admins call it with a JWT: probe (are the data sources reachable from here), scan (dry_run / force), test_pick,
// close, track. No data key is needed: prices and candles come from Binance's public market data, market value,
// description and company treasuries from CoinGecko (best effort).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { handler, json, readJson, fail, isCronCall } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { DataError } from "../_shared/stockData.ts";
import { settle, type Holder } from "../_shared/stockRules.ts";
import { binance, coingecko } from "../_shared/cryptoData.ts";
import { closePick, msg, push, routeOf, setting } from "../_shared/picks.ts";
import * as C from "../_shared/cryptoRules.ts";

const ENRICH_BATCH = 30;        // one Binance call each
const FINALISTS_PER_RUN = 2;    // a few CoinGecko calls each
const BUDGET_MS = 40_000;
type Body = { action?: string; dry_run?: boolean; pick_id?: string; symbol?: string };
interface ScanRow { id: string; trading_day: string; dry_run: boolean; stage: string; stats: Record<string, unknown> }
interface CandRow { id: number; symbol: string; seed: C.CoinSeed; score: number | null; detail: Record<string, unknown> }
const marketOf = (scan: ScanRow): C.Market => ({ uptrend: (scan.stats.uptrend as boolean | null) ?? null, ret30: (scan.stats.btc30 as number | null) ?? null });

// ---------- scan ----------
async function startScan(sb: SupabaseClient, dryRun: boolean): Promise<Record<string, unknown>> {
  let seeds: C.CoinSeed[] = []; let mkt: C.Market = { uptrend: null, ret30: null }; let day = C.utcDay(Date.now() - C.dayMs);
  try {
    const [tickers, btc] = await Promise.all([binance.tickers(), binance.daily("BTCUSDT")]);
    if (btc.length < 2) throw new Error("Binance: no Bitcoin candles");
    mkt = C.market(btc); day = C.utcDay(btc[btc.length - 1].t);          // the day whose candle just closed
    seeds = C.universe(tickers);
  } catch (e) {
    await sb.from("stock_scans").insert({ asset: "crypto", trading_day: day, dry_run: dryRun, stage: "failed", error: msg(e), finished_at: new Date().toISOString() });
    return { error: msg(e) };
  }
  // not again while a pick is open, nor soon after one was sent
  const since = new Date(Date.now() - C.CRULES.repickDays * C.dayMs).toISOString();
  const { data: recent } = await sb.from("stock_picks").select("symbol").eq("asset", "crypto").eq("is_test", false).or(`status.eq.open,sent_at.gte.${since}`);
  const blocked = new Set(((recent ?? []) as { symbol: string }[]).map((p) => p.symbol));
  seeds = seeds.filter((s) => !blocked.has(s.symbol));
  const stats = { day, uptrend: mkt.uptrend, btc30: mkt.ret30, seeded: { breakout: seeds.length, listing: 0 } };
  const { data: scan, error } = await sb.from("stock_scans").insert({ asset: "crypto", trading_day: day, dry_run: dryRun, stage: seeds.length ? "enrich" : "done", stats, finished_at: seeds.length ? null : new Date().toISOString() }).select("id").single();
  if (error || !scan) return { error: error?.message ?? "could not start the scan" };
  if (seeds.length) await sb.from("stock_candidates").insert(seeds.map((s) => ({ scan_id: scan.id, symbol: s.symbol, source: "breakout", seed: s })));
  return { started: scan.id, ...stats };
}

async function enrichStep(sb: SupabaseClient, scan: ScanRow, started: number): Promise<Record<string, unknown>> {
  const mkt = marketOf(scan);
  const { data: queue } = await sb.from("stock_candidates").select("id,symbol,seed,score,detail").eq("scan_id", scan.id).eq("status", "queued").order("id").limit(ENRICH_BATCH);
  let done = 0, limited = false;
  for (const c of (queue ?? []) as CandRow[]) {
    if (Date.now() - started > BUDGET_MS) break;
    try {
      const s = C.signals(await binance.daily(c.seed.pair), mkt);
      // a coin whose latest closed candle is not the scan's day stopped trading or was just listed today
      const sc = s ? C.scoreCoin(s) : null;
      await sb.from("stock_candidates").update({ status: sc?.ok ? "scored" : "rejected", score: sc?.ok ? sc.score : null, source: sc?.kind === "ipo" ? "listing" : "breakout", processed_at: new Date().toISOString(),
        detail: { reject: sc ? sc.reject ?? null : "Not enough price history yet", parts: sc?.parts ?? {}, s: sc?.s ?? null, kind: sc?.kind ?? "catalyst", name: c.symbol } }).eq("id", c.id);
      done++;
    } catch (e) {
      if (e instanceof DataError && (e.status === 429 || e.status === 418)) { limited = true; break; }
      await sb.from("stock_candidates").update({ status: "error", processed_at: new Date().toISOString(), detail: { reject: msg(e) } }).eq("id", c.id);
    }
  }
  const { count } = await sb.from("stock_candidates").select("id", { count: "exact", head: true }).eq("scan_id", scan.id).eq("status", "queued");
  if (!count) await sb.from("stock_scans").update({ stage: "select" }).eq("id", scan.id);
  return { enriched: done, left: count ?? 0, limited };
}

interface PickRow { [k: string]: unknown; symbol: string; name: string; headline: string; horizon: string }
/** Turns a scored coin into the pick members see. `strict` applies the gates of a real scan (a test pick skips them). */
async function buildPick(symbol: string, pair: string, sc: C.CoinScored, mkt: C.Market, day: string, openLong: number, openSwing: number, strict: boolean): Promise<{ pick?: PickRow; reject?: string; retry?: boolean }> {
  const info = await coingecko.info(symbol).catch(() => null);
  // A real pick never goes out for something we could not identify: tokenised stocks and funds trade next to coins.
  if (strict && !info) return { retry: true };
  if (strict && info?.excluded) return { reject: `Not a coin (${info.excluded})` };
  const listedDays = sc.s.ageCapped ? await binance.listedDays(pair).catch(() => null) : sc.s.age;
  let horizon = C.horizonFor(sc.kind, sc.s, listedDays);
  if (horizon === "long" && openLong >= C.CRULES.maxOpenLong) horizon = "swing";
  if (strict && horizon === "swing" && openSwing >= C.CRULES.maxOpenSwing) return { reject: "Enough swing picks are open already" };
  const pl = C.plan(horizon, sc.s);
  const text = C.describeCoin(symbol, sc, horizon, mkt, info, listedDays, day);
  let investors: Holder[] = [];
  const treasury = C.TREASURY_IDS[symbol];
  if (treasury) investors = await coingecko.treasury(treasury).then((cs) => C.holders(cs, symbol, C.utcDay(Date.now()))).catch(() => []);
  const now = new Date();
  return { pick: {
    asset: "crypto", symbol, name: info?.name ?? symbol, exchange: "Crypto", industry: info?.category ?? null, logo_url: info?.image ?? null, website: info?.homepage ?? null,
    kind: sc.kind, horizon, headline: text.headline, description: info?.description ?? null, reasons: text.reasons, risks: text.risks, facts: text.facts, investors, score: sc.score,
    entry_price: pl.entry, buy_below: pl.buyBelow, stop_price: pl.stop, target_price: pl.target, last_price: pl.entry, last_price_at: now.toISOString(),
    expires_at: new Date(now.getTime() + pl.expiresInDays * C.dayMs).toISOString(), sent_at: now.toISOString(),
  } };
}

async function selectStep(sb: SupabaseClient, scan: ScanRow): Promise<Record<string, unknown>> {
  const mkt = marketOf(scan); const day = String(scan.stats.day ?? scan.trading_day);
  const max = Math.max(0, Math.round(await setting(sb, "crypto_max_per_day", 2)));
  const min = (await setting(sb, "crypto_min_score", 70)) + (mkt.uptrend === false ? 10 : 0);   // a weak market raises the bar
  const { count: already } = await sb.from("stock_candidates").select("id", { count: "exact", head: true }).eq("scan_id", scan.id).eq("status", "picked");
  let picked = already ?? 0, tried = 0; const sent: string[] = [];
  const { data: open } = await sb.from("stock_picks").select("horizon").eq("asset", "crypto").eq("status", "open").eq("is_test", false);
  let openLong = (open ?? []).filter((o: { horizon: string }) => o.horizon === "long").length, openSwing = (open ?? []).length - openLong;
  const { data: best } = await sb.from("stock_candidates").select("id,symbol,seed,score,detail").eq("scan_id", scan.id).eq("status", "scored").gte("score", min).order("score", { ascending: false }).limit(FINALISTS_PER_RUN);
  for (const c of (best ?? []) as CandRow[]) {
    if (picked >= max) break;
    tried++;
    try {
      const sc: C.CoinScored = { ok: true, kind: c.detail.kind as "ipo" | "catalyst", score: c.score ?? 0, parts: (c.detail.parts ?? {}) as Record<string, number>, s: c.detail.s as C.Signals };
      const r = await buildPick(c.symbol, c.seed.pair, sc, mkt, day, openLong, openSwing, true);
      if (r.retry) {                                                  // the description source was busy: try again on the next runs, then give up on this coin
        const tries = Number(c.detail.tries ?? 0) + 1;
        await sb.from("stock_candidates").update(tries >= 5 ? { status: "rejected", detail: { ...c.detail, tries, reject: "Could not confirm what this coin is (data source busy)" } } : { detail: { ...c.detail, tries } }).eq("id", c.id);
        continue;
      }
      if (!r.pick) { await sb.from("stock_candidates").update({ status: "rejected", detail: { ...c.detail, reject: r.reject } }).eq("id", c.id); continue; }
      if (scan.dry_run) await sb.from("stock_candidates").update({ status: "picked", detail: { ...c.detail, name: r.pick.name, preview: r.pick } }).eq("id", c.id);
      else {
        const { data: ins, error } = await sb.from("stock_picks").insert(r.pick).select("id").single();
        if (error || !ins) { await sb.from("stock_candidates").update({ status: "error", detail: { ...c.detail, reject: error?.message ?? "insert failed" } }).eq("id", c.id); continue; }
        await sb.from("stock_candidates").update({ status: "picked", detail: { ...c.detail, name: r.pick.name, pick_id: ins.id } }).eq("id", c.id);
        await push(sb, null, false, `New crypto pick: ${r.pick.symbol}`, r.pick.headline, routeOf("crypto", ins.id), ins.id);
      }
      picked++; sent.push(c.symbol);
      if (r.pick.horizon === "long") openLong++; else openSwing++;
    } catch (e) { await sb.from("stock_candidates").update({ status: "error", detail: { ...c.detail, reject: msg(e) } }).eq("id", c.id); }
  }
  const { count: left } = await sb.from("stock_candidates").select("id", { count: "exact", head: true }).eq("scan_id", scan.id).eq("status", "scored").gte("score", min);
  if (picked >= max || !left || max === 0) {
    const tally = async (status: string) => (await sb.from("stock_candidates").select("id", { count: "exact", head: true }).eq("scan_id", scan.id).eq("status", status)).count ?? 0;
    const listing = (await sb.from("stock_candidates").select("id", { count: "exact", head: true }).eq("scan_id", scan.id).eq("source", "listing")).count ?? 0;
    const seeded = (scan.stats.seeded ?? {}) as { breakout?: number };
    await sb.from("stock_scans").update({ stage: "done", finished_at: new Date().toISOString(), stats: { ...scan.stats, seeded: { breakout: (seeded.breakout ?? 0) - listing, listing }, picked, min_score: min, passed_over: await tally("scored"), rejected: await tally("rejected"), errors: await tally("error") } }).eq("id", scan.id);
  }
  return { picked: sent, tried, left: left ?? 0 };
}

// ---------- tracking ----------
async function trackStep(sb: SupabaseClient): Promise<Record<string, unknown>> {
  const { data: open } = await sb.from("stock_picks").select("id,symbol,horizon,entry_price,stop_price,target_price,expires_at,sent_at").eq("asset", "crypto").eq("status", "open").order("sent_at").limit(40);
  let priced = 0; const closed: string[] = [];
  for (const k of (open ?? []) as { id: string; symbol: string; horizon: "swing" | "long"; entry_price: number; stop_price: number | null; target_price: number | null; expires_at: string | null; sent_at: string }[]) {
    try {
      const today = await binance.today(`${k.symbol}USDT`);
      if (!today || !(today.c > 0)) continue;
      // a pick sent during the day is not judged on what the price did before it went out
      const fresh = today.t >= Date.parse(k.sent_at) - 30 * 60_000;
      const q = C.quoteOf(today);
      const s = fresh ? settle({ horizon: k.horizon, entry_price: Number(k.entry_price), stop_price: k.stop_price == null ? null : Number(k.stop_price), target_price: k.target_price == null ? null : Number(k.target_price), expires_at: k.expires_at }, q)
        : { close: k.expires_at && Date.parse(k.expires_at) <= Date.now() ? ("time" as const) : null, price: today.c };
      if (s.close) { await closePick(sb, k, s.close, s.price); closed.push(k.symbol); }
      else await sb.from("stock_picks").update({ last_price: today.c, last_price_at: new Date().toISOString() }).eq("id", k.id);
      priced++;
    } catch (e) { if (e instanceof DataError && (e.status === 429 || e.status === 418)) break; }
  }
  return { priced, closed };
}

// ---------- admin helpers ----------
async function probe(): Promise<Record<string, unknown>> {
  const out: Record<string, { ok: boolean; note: string }> = {};
  const check = async (name: string, fn: () => Promise<string>) => { try { out[name] = { ok: true, note: await fn() }; } catch (e) { out[name] = { ok: false, note: msg(e) }; } };
  await check("binance", async () => { const btc = await binance.daily("BTCUSDT", 210); const m = C.market(btc); return `Bitcoin closed at ${C.coinUsd(btc[btc.length - 1].c)} on ${C.utcDay(btc[btc.length - 1].t)}, ${m.uptrend ? "above" : "below"} its 200-day average`; });
  await check("coingecko", async () => { const i = await coingecko.info("SOL"); return i?.description ? `Descriptions and market values work (${i.name}, #${i.rank})` : "Answered, but without a description"; });
  return { sources: out };
}

/** A real-looking pick for admins only, built from the coin's live candles whatever they show. */
async function testPick(sb: SupabaseClient, symbol: string): Promise<Record<string, unknown>> {
  if (!/^[A-Z0-9]{2,10}$/.test(symbol)) fail(400, "Enter a coin ticker, for example SOL");
  const pair = `${symbol}USDT`;
  const btc = await binance.daily("BTCUSDT"); const mkt = C.market(btc);
  const cs = await binance.daily(pair).catch(() => [] as C.Candle[]);
  const s = C.signals(cs, mkt);
  if (!s) fail(404, `No price history for ${symbol} against USDT on Binance`);
  const real = C.scoreCoin(s);
  const sc: C.CoinScored = { ...real, ok: true, kind: real.kind, score: real.score };
  // a test pick shows whatever the candles say; the headline falls back to plain facts when it is not a breakout today
  const r = await buildPick(symbol, pair, sc, mkt, C.utcDay(cs[cs.length - 1].t), 0, 0, false);
  if (!r.pick) fail(500, r.reject ?? "Could not build the pick");
  // a coin that is not a pick today still makes a full test page, but it says so instead of claiming a breakout
  const honest = real.ok ? {} : { headline: `${r.pick.name} is not a pick today: ${(real.reject ?? "it did not pass the filters").toLowerCase()}.`, reasons: [{ label: "Why this is only a test", detail: "It shows what a pick page looks like. The plan, facts and risks below are worked out from live prices." }] };
  const { data: ins, error } = await sb.from("stock_picks").insert({ ...r.pick, ...honest, is_test: true, headline: `Test pick. ${honest.headline ?? r.pick.headline}` }).select("id").single();
  if (error || !ins) fail(500, error?.message ?? "insert failed");
  const sent = await push(sb, null, true, `Test crypto pick: ${symbol}`, honest.headline ?? r.pick.headline, routeOf("crypto", ins.id), ins.id);
  return { pick_id: ins.id, pushed: sent, description: Boolean(r.pick.description), investors: (r.pick.investors as unknown[]).length, would_pass: real.ok, reject: real.reject ?? null };
}

Deno.serve(handler(async (req) => {
  const sb = serviceClient();
  const cron = await isCronCall(req);
  let body: Body = {};
  try { body = await readJson<Body>(req); } catch { body = {}; }
  if (!cron) await requireAdmin(req);
  const action = cron ? "auto" : (body.action ?? "probe");
  const started = Date.now();
  if (action === "probe") return json(await probe());
  if (action === "test_pick") return json(await testPick(sb, (body.symbol ?? "").trim().toUpperCase()));
  if (action === "track") return json(await trackStep(sb));
  if (action === "close") {
    const { data: k } = await sb.from("stock_picks").select("id,symbol,entry_price,last_price").eq("id", body.pick_id ?? "").eq("asset", "crypto").eq("status", "open").maybeSingle();
    if (!k) fail(404, "No open crypto pick with that id");
    const today = await binance.today(`${k.symbol}USDT`).catch(() => null);
    await closePick(sb, k, "manual", today && today.c > 0 ? today.c : Number(k.last_price ?? k.entry_price));
    return json({ closed: k.symbol });
  }

  const running = async () => {
    const { data } = await sb.from("stock_scans").select("id,trading_day,dry_run,stage,stats").eq("asset", "crypto").in("stage", ["seed", "enrich", "select"]).gte("started_at", new Date(Date.now() - 3 * 36e5).toISOString()).order("started_at").limit(1);
    return (data?.[0] as ScanRow | undefined) ?? null;
  };
  const step = async (scan: ScanRow) => (scan.stage === "select" ? { scan: scan.id, stage: "select", ...(await selectStep(sb, scan)) } : { scan: scan.id, stage: "enrich", ...(await enrichStep(sb, scan, started)) });

  if (action === "scan") {
    const live = await running();
    if (live) return json({ ...(await step(live)), note: "A scan is already running; continued it" });
    return json(await startScan(sb, body.dry_run !== false));          // admin scans are previews unless dry_run is false
  }

  // auto (cron)
  const live = await running();
  if (live) return json(await step(live));
  const { data: due } = await sb.rpc("crypto_due_what");
  const what = String(due ?? "");
  if (what === "scan") return json(await startScan(sb, false));
  if (what === "track") return json(await trackStep(sb));
  return json({ idle: true });
}));
