// stocks: finds stock picks, sends them, tracks them, and keeps the big-investor holdings fresh.
// pg_cron calls it once a minute while there is work (private.stocks_due) with { action: "auto" }:
//   1. an unfinished scan continues (seed → enrich a batch → select and send), else
//   2. after the US close a new scan starts, else
//   3. open picks are re-priced and closed at their stop, target or time limit, else
//   4. one batch of big-investor filings (SEC 13F) is read and matched to tickers.
// Admins call it with a JWT: probe (check the data keys), scan (dry_run / force), test_pick, close, track, investors.
// Work is split over many short runs so it fits the free data limits (Finnhub 60 calls a minute, Massive 5).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { handler, json, readJson, fail, isCronCall } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { sendPush, type Device } from "../_shared/fcm.ts";
import { DataError, figiMap, finnhub, massive, sec, type Finnhub, type Massive } from "../_shared/stockData.ts";
import * as R from "../_shared/stockRules.ts";

const ENRICH_BATCH = 14;        // 3 Finnhub calls each
const FINALISTS_PER_RUN = 2;    // 2 Massive calls each
const BUDGET_MS = 40_000;
type Body = { action?: string; dry_run?: boolean; force?: boolean; pick_id?: string; symbol?: string };
interface ScanRow { id: string; trading_day: string; dry_run: boolean; stage: string; stats: Record<string, unknown> }
interface CandRow { id: number; symbol: string; source: "earnings" | "ipo"; seed: R.Seed; score: number | null; detail: Record<string, unknown> }

const setting = async (sb: SupabaseClient, key: string, def: number) => { const { data } = await sb.rpc("setting_num", { p_key: key, p_default: def }); return Number(data ?? def); };
const dataKey = async (sb: SupabaseClient, name: string) => { const { data } = await sb.rpc("data_key", { p_name: name }); return (data as string | null) || null; };
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------- push ----------
async function push(sb: SupabaseClient, userIds: string[] | null, adminsOnly: boolean, title: string, body: string, route: string, pickId: string): Promise<number> {
  let q = sb.from("profiles").select("id").eq("status", "active");
  if (adminsOnly) q = q.eq("role", "admin");
  const { data: people } = await q;
  let ids = ((people ?? []) as { id: string }[]).map((p) => p.id);
  if (userIds) ids = ids.filter((id) => userIds.includes(id));
  if (!ids.length) return 0;
  const { data: devs } = await sb.from("devices").select("id,user_id,platform,fcm_token").in("user_id", ids);
  let sent = 0;
  for (const d of (devs ?? []) as Device[]) {
    const r = await sendPush(sb, d, { title, body, route, ttlSec: 86_400, data: { notification_id: crypto.randomUUID(), type: "stock", pick_id: pickId } }, { kind: "stock" });
    if (r.ok) sent++;
  }
  return sent;
}

// ---------- big investors ----------
async function holdersOf(sb: SupabaseClient, symbol: string): Promise<R.Holder[]> {
  const { data } = await sb.from("investor_holdings").select("value_usd,shares,pct,investor:investors(name,firm,period,active)").eq("symbol", symbol).order("value_usd", { ascending: false }).limit(12);
  type Row = { value_usd: number; shares: number | null; pct: number | null; investor: { name: string; firm: string; period: string | null; active: boolean } | null };
  return ((data ?? []) as unknown as Row[]).filter((r) => r.investor?.active).slice(0, 8)
    .map((r) => ({ name: r.investor!.name, firm: r.investor!.firm, value_usd: Number(r.value_usd), shares: r.shares == null ? null : Number(r.shares), pct: r.pct == null ? null : Number(r.pct), period: r.investor!.period }));
}

async function investorsStep(sb: SupabaseClient, contact: string): Promise<Record<string, unknown>> {
  const edgar = sec(contact); const out: Record<string, unknown> = { checked: 0, updated: [] as string[], mapped: 0 };
  const stale = new Date(Date.now() - 24 * 36e5).toISOString();
  const { data: due } = await sb.from("investors").select("id,firm,cik,last_accession").eq("active", true).or(`checked_at.is.null,checked_at.lt.${stale}`).order("checked_at", { ascending: true, nullsFirst: true }).limit(3);
  for (const inv of (due ?? []) as { id: string; firm: string; cik: number; last_accession: string | null }[]) {
    try {
      const latest = R.latest13F(await edgar.submissions(inv.cik));
      if (latest && latest.accession && latest.accession !== inv.last_accession) {
        const xml = await edgar.infoTable(inv.cik, latest.accession);
        const all = xml ? R.parse13F(xml) : [];
        if (all.length) {
          const total = all.reduce((a, h) => a + h.value, 0);
          const top = all.slice(0, 400);
          const { data: known } = await sb.from("cusip_map").select("cusip,symbol").in("cusip", top.map((h) => h.cusip));
          const map = Object.fromEntries(((known ?? []) as { cusip: string; symbol: string | null }[]).map((k) => [k.cusip, k.symbol]));
          await sb.from("investor_holdings").delete().eq("investor_id", inv.id);
          for (let i = 0; i < top.length; i += 200) {
            const { error } = await sb.from("investor_holdings").insert(top.slice(i, i + 200).map((h) => ({ investor_id: inv.id, cusip: h.cusip, issuer: h.issuer, class_title: h.classTitle, value_usd: h.value, shares: h.shares, pct: total > 0 ? Math.round((h.value / total) * 10000) / 100 : null, symbol: map[h.cusip] ?? null })));
            if (error) throw new Error(error.message);
          }
          await sb.from("investors").update({ last_accession: latest.accession, period: latest.period || null, filed_at: latest.filed || null, total_usd: total }).eq("id", inv.id);
          (out.updated as string[]).push(inv.firm);
        }
      }
      await sb.from("investors").update({ checked_at: new Date().toISOString() }).eq("id", inv.id);
      out.checked = (out.checked as number) + 1;
    } catch (e) {
      out.error = msg(e);
      await sb.from("investors").update({ checked_at: new Date().toISOString() }).eq("id", inv.id);   // try again tomorrow, never in a loop
      if (e instanceof DataError && (e.status === 429 || e.status === 403)) break;
    }
  }
  // tickers for CUSIPs we have not looked up yet (200 a run keeps inside OpenFIGI's keyless limit)
  const { data: need } = await sb.rpc("stock_unmapped_cusips", { p_limit: 200 });
  const cusips = ((need ?? []) as (string | { stock_unmapped_cusips: string })[]).map((c) => (typeof c === "string" ? c : c.stock_unmapped_cusips));
  if (cusips.length) {
    try {
      const found = await figiMap(cusips);
      await sb.from("cusip_map").upsert(Object.entries(found).map(([cusip, v]) => ({ cusip, symbol: v.ticker, name: v.name, checked_at: new Date().toISOString() })));
      const { data: n } = await sb.rpc("stock_apply_cusip_map");
      out.mapped = Number(n ?? 0); out.looked_up = cusips.length;
    } catch (e) { out.map_error = msg(e); }
  }
  return out;
}

// ---------- scan ----------
async function startScan(sb: SupabaseClient, fh: Finnhub, mv: Massive | null, dryRun: boolean, force: boolean): Promise<Record<string, unknown>> {
  const today = R.nyDate();
  let day = today; let uptrend: boolean | null = null; let seeds: R.Seed[] = [];
  try {
    const spy = await fh.quote("SPY");
    day = R.nyDate(new Date(spy.t * 1000));                                       // the last session that traded
    if (day !== today && !force) {
      await sb.from("stock_scans").insert({ trading_day: today, dry_run: dryRun, stage: "done", stats: { note: "The market did not trade today" }, finished_at: new Date().toISOString() });
      return { skipped: "market closed" };
    }
    const [earn, ipos] = await Promise.all([fh.earnings(R.addDays(day, -6), day), fh.ipos(R.addDays(day, -R.RULES.ipoMaxDays), R.addDays(day, -R.RULES.ipoMinDays))]);
    const fromEarnings = R.seedEarnings(earn, day);
    const taken = new Set(fromEarnings.map((s) => s.symbol));
    seeds = [...fromEarnings, ...R.seedIpos(ipos, day).filter((s) => !taken.has(s.symbol))];
    if (mv) { try { uptrend = R.marketUptrend(await mv.bars("SPY", R.addDays(day, -320), day)); } catch { uptrend = null; } }
  } catch (e) {
    await sb.from("stock_scans").insert({ trading_day: today, dry_run: dryRun, stage: "failed", error: msg(e), finished_at: new Date().toISOString() });
    return { error: msg(e) };
  }
  // not again while a pick is open, nor soon after one closed
  const since = new Date(Date.now() - Math.max(R.RULES.repickDays.earnings, R.RULES.repickDays.ipo) * 864e5).toISOString();
  const { data: recent } = await sb.from("stock_picks").select("symbol,kind,status,sent_at").eq("is_test", false).or(`status.eq.open,sent_at.gte.${since}`);
  const blocked = new Set<string>();
  for (const p of (recent ?? []) as { symbol: string; kind: string; status: string; sent_at: string }[]) {
    const days = (Date.now() - Date.parse(p.sent_at)) / 864e5;
    if (p.status === "open" || days < R.RULES.repickDays[p.kind === "ipo" ? "ipo" : "earnings"]) blocked.add(p.symbol);
  }
  seeds = seeds.filter((s) => !blocked.has(s.symbol));
  const stats = { day, uptrend, seeded: { earnings: seeds.filter((s) => s.source === "earnings").length, ipo: seeds.filter((s) => s.source === "ipo").length }, history: mv != null };
  const { data: scan, error } = await sb.from("stock_scans").insert({ trading_day: day, dry_run: dryRun, stage: seeds.length ? "enrich" : "done", stats, finished_at: seeds.length ? null : new Date().toISOString() }).select("id").single();
  if (error || !scan) return { error: error?.message ?? "could not start the scan" };
  if (seeds.length) await sb.from("stock_candidates").insert(seeds.map((s) => ({ scan_id: scan.id, symbol: s.symbol, source: s.source, seed: s })));
  return { started: scan.id, ...stats };
}

async function enrichStep(sb: SupabaseClient, fh: Finnhub, scan: ScanRow, started: number): Promise<Record<string, unknown>> {
  const day = String(scan.stats.day ?? scan.trading_day);
  const { data: queue } = await sb.from("stock_candidates").select("id,symbol,source,seed,score,detail").eq("scan_id", scan.id).eq("status", "queued").order("id").limit(ENRICH_BATCH);
  let done = 0, limited = false;
  for (const c of (queue ?? []) as CandRow[]) {
    if (Date.now() - started > BUDGET_MS) break;
    try {
      const [q, p, m] = await Promise.all([fh.quote(c.symbol), fh.profile(c.symbol), fh.metric(c.symbol)]);
      const s = R.score(c.seed, q, p, m, day, R.nyDate(new Date((q.t || 0) * 1000)) === day);
      await sb.from("stock_candidates").update({ status: s.ok ? "scored" : "rejected", score: s.ok ? s.score : null, processed_at: new Date().toISOString(),
        detail: { reject: s.reject ?? null, parts: s.parts, m: s.m, quote: q, name: p.name ?? c.seed.name ?? c.symbol, exchange: p.exchange ?? null, industry: p.finnhubIndustry ?? null, logo: p.logo || null, weburl: p.weburl || null } }).eq("id", c.id);
      done++;
    } catch (e) {
      if (e instanceof DataError && e.status === 429) { limited = true; break; }             // the minute's allowance is spent; carry on next run
      await sb.from("stock_candidates").update({ status: "error", processed_at: new Date().toISOString(), detail: { reject: msg(e) } }).eq("id", c.id);
    }
  }
  const { count } = await sb.from("stock_candidates").select("id", { count: "exact", head: true }).eq("scan_id", scan.id).eq("status", "queued");
  if (!count) await sb.from("stock_scans").update({ stage: "select" }).eq("id", scan.id);
  return { enriched: done, left: count ?? 0, limited };
}

interface PickRow { [k: string]: unknown; symbol: string; name: string; headline: string }
async function buildPick(sb: SupabaseClient, fh: Finnhub, mv: Massive | null, c: CandRow, day: string, uptrend: boolean | null, openLong: number, openSwing: number): Promise<{ pick?: PickRow; reject?: string }> {
  const d = c.detail.m as R.Derived, q = c.detail.quote as R.Quote;
  const rec = await fh.recommendation(c.symbol).catch(() => null);
  let details: Awaited<ReturnType<Massive["details"]>> = null, bars: R.Bar[] | null = null;
  if (mv) { details = await mv.details(c.symbol).catch(() => null); bars = await mv.bars(c.symbol, R.addDays(day, -130), day).catch(() => null); }
  const atr14 = bars ? R.atr(bars) : null, avg50 = bars ? R.sma(bars, 50) : null;
  if (c.source === "earnings" && avg50 != null && q.c < avg50) return { reject: "Below its 50-day average price" };
  let horizon = R.horizonFor(c.seed, d, rec);
  if (horizon === "long" && openLong >= R.RULES.maxOpenLong) horizon = "swing";
  if (horizon === "swing" && openSwing >= R.RULES.maxOpenSwing) return { reject: "Enough swing picks are open already" };
  const pl = R.plan(horizon, q, atr14);
  const text = R.describe(c.seed, d, { horizon, rec, uptrend, employees: details?.total_employees ?? null });
  const now = new Date();
  return { pick: {
    symbol: c.symbol, name: String(c.detail.name ?? details?.name ?? c.symbol), exchange: /NASDAQ/i.test(String(c.detail.exchange ?? "")) ? "Nasdaq" : "NYSE", industry: (c.detail.industry as string | null) ?? details?.sic_description ?? null,
    logo_url: (c.detail.logo as string | null) ?? null, website: (c.detail.weburl as string | null) ?? details?.homepage_url ?? null,
    kind: c.source === "ipo" ? "ipo" : "catalyst", horizon, headline: text.headline, description: details?.description?.trim() || null,
    reasons: text.reasons, risks: text.risks, facts: text.facts, investors: await holdersOf(sb, c.symbol), score: c.score ?? 0,
    entry_price: pl.entry, buy_below: pl.buyBelow, stop_price: pl.stop, target_price: pl.target, last_price: pl.entry, last_price_at: now.toISOString(),
    expires_at: new Date(now.getTime() + pl.expiresInDays * 864e5).toISOString(), sent_at: now.toISOString(),
  } };
}

async function selectStep(sb: SupabaseClient, fh: Finnhub, mv: Massive | null, scan: ScanRow): Promise<Record<string, unknown>> {
  const day = String(scan.stats.day ?? scan.trading_day); const uptrend = (scan.stats.uptrend as boolean | null) ?? null;
  const max = Math.max(0, Math.round(await setting(sb, "stocks_max_per_day", 2)));
  const min = (await setting(sb, "stocks_min_score", 70)) + (uptrend === false ? 10 : 0);   // a weak market raises the bar
  const { count: already } = await sb.from("stock_candidates").select("id", { count: "exact", head: true }).eq("scan_id", scan.id).eq("status", "picked");
  let picked = already ?? 0, tried = 0; const sent: string[] = [];
  const { data: open } = await sb.from("stock_picks").select("horizon").eq("status", "open").eq("is_test", false);
  let openLong = (open ?? []).filter((o: { horizon: string }) => o.horizon === "long").length, openSwing = (open ?? []).length - openLong;
  const { data: best } = await sb.from("stock_candidates").select("id,symbol,source,seed,score,detail").eq("scan_id", scan.id).eq("status", "scored").gte("score", min).order("score", { ascending: false }).limit(FINALISTS_PER_RUN);
  for (const c of (best ?? []) as CandRow[]) {
    if (picked >= max) break;
    tried++;
    try {
      const r = await buildPick(sb, fh, mv, c, day, uptrend, openLong, openSwing);
      if (!r.pick) { await sb.from("stock_candidates").update({ status: "rejected", detail: { ...c.detail, reject: r.reject } }).eq("id", c.id); continue; }
      if (scan.dry_run) { await sb.from("stock_candidates").update({ status: "picked", detail: { ...c.detail, preview: r.pick } }).eq("id", c.id); }
      else {
        const { data: ins, error } = await sb.from("stock_picks").insert(r.pick).select("id").single();
        if (error || !ins) { await sb.from("stock_candidates").update({ status: "error", detail: { ...c.detail, reject: error?.message ?? "insert failed" } }).eq("id", c.id); continue; }
        await sb.from("stock_candidates").update({ status: "picked", detail: { ...c.detail, pick_id: ins.id } }).eq("id", c.id);
        await push(sb, null, false, `New stock pick: ${r.pick.symbol}`, r.pick.headline, `/stocks/${ins.id}`, ins.id);
      }
      picked++; sent.push(c.symbol);
      if (r.pick.horizon === "long") openLong++; else openSwing++;
    } catch (e) { await sb.from("stock_candidates").update({ status: "error", detail: { ...c.detail, reject: msg(e) } }).eq("id", c.id); }
  }
  const { count: left } = await sb.from("stock_candidates").select("id", { count: "exact", head: true }).eq("scan_id", scan.id).eq("status", "scored").gte("score", min);
  if (picked >= max || !left || max === 0) {
    const tally = async (status: string) => (await sb.from("stock_candidates").select("id", { count: "exact", head: true }).eq("scan_id", scan.id).eq("status", status)).count ?? 0;
    await sb.from("stock_scans").update({ stage: "done", finished_at: new Date().toISOString(), stats: { ...scan.stats, picked, min_score: min, passed_over: await tally("scored"), rejected: await tally("rejected"), errors: await tally("error") } }).eq("id", scan.id);
  }
  return { picked: sent, tried, left: left ?? 0 };
}

// ---------- tracking ----------
async function closePick(sb: SupabaseClient, k: { id: string; symbol: string; entry_price: number }, reason: "stop" | "target" | "time" | "manual", price: number): Promise<void> {
  const pct = R.resultPct(Number(k.entry_price), price);
  const { data: upd } = await sb.from("stock_picks").update({ status: "closed", close_reason: reason, close_price: price, result_pct: pct, last_price: price, last_price_at: new Date().toISOString(), closed_at: new Date().toISOString() }).eq("id", k.id).eq("status", "open").select("id,is_test");
  if (!upd?.length) return;
  const label = { stop: "stop hit", target: "target hit", time: "time ran out", manual: "closed by J" }[reason];
  const { data: holders } = await sb.from("stock_positions").select("user_id").eq("pick_id", k.id).is("sold_at", null);
  const ids = ((holders ?? []) as { user_id: string }[]).map((h) => h.user_id);
  const title = `${k.symbol} closed: ${label}`, body = `${pct > 0 ? "+" : ""}${pct}% since the pick. If you sold, record it in your portfolio.`;
  if (ids.length) await push(sb, ids, false, title, body, `/stocks/${k.id}`, k.id);
  await push(sb, null, true, title, `${pct > 0 ? "+" : ""}${pct}% since the pick.`, `/stocks/${k.id}`, k.id);   // admins always hear about a close
}

async function trackStep(sb: SupabaseClient, fh: Finnhub): Promise<Record<string, unknown>> {
  const { data: open } = await sb.from("stock_picks").select("id,symbol,horizon,entry_price,stop_price,target_price,expires_at,sent_at").eq("status", "open").order("sent_at").limit(45);
  let priced = 0; const closed: string[] = [];
  for (const k of (open ?? []) as (R.OpenPick & { id: string; symbol: string; sent_at: string })[]) {
    try {
      const q = await fh.quote(k.symbol);
      if (!(q.c > 0)) continue;
      // the pick went out after the close, so the session it was picked on does not count against it
      const fresh = R.nyDate(new Date(q.t * 1000)) > R.nyDate(new Date(k.sent_at));
      const s = fresh ? R.settle({ ...k, entry_price: Number(k.entry_price), stop_price: k.stop_price == null ? null : Number(k.stop_price), target_price: k.target_price == null ? null : Number(k.target_price) }, q)
        : { close: k.expires_at && Date.parse(k.expires_at) <= Date.now() ? ("time" as const) : null, price: q.c };
      if (s.close) { await closePick(sb, k, s.close, s.price); closed.push(k.symbol); }
      else await sb.from("stock_picks").update({ last_price: q.c, last_price_at: new Date(q.t * 1000).toISOString() }).eq("id", k.id);
      priced++;
    } catch (e) { if (e instanceof DataError && e.status === 429) break; }
  }
  return { priced, closed };
}

// ---------- admin helpers ----------
async function probe(sb: SupabaseClient): Promise<Record<string, unknown>> {
  const out: Record<string, { ok: boolean; note: string }> = {};
  const check = async (name: string, fn: () => Promise<string>, missing?: string) => {
    if (missing) { out[name] = { ok: false, note: missing }; return; }
    try { out[name] = { ok: true, note: await fn() }; } catch (e) { out[name] = { ok: false, note: msg(e) }; }
  };
  const fk = await dataKey(sb, "finnhub_key"), mk = await dataKey(sb, "massive_key"), contact = await dataKey(sb, "sec_contact");
  let metricKeys: string[] = [];
  await check("finnhub", async () => {
    const fh = finnhub(fk!); const q = await fh.quote("AAPL"); const m = await fh.metric("AAPL");
    metricKeys = Object.keys(m);
    const today = R.nyDate(); const cal = await fh.earnings(R.addDays(today, -3), today);
    const want = ["52WeekHigh", "52WeekLow", "13WeekPriceReturnDaily", "26WeekPriceReturnDaily", "3MonthAverageTradingVolume", "10DayAverageTradingVolume", "beta", "revenueGrowthTTMYoy", "netProfitMarginTTM", "roeTTM", "totalDebt/totalEquityQuarterly"];
    const missing = want.filter((k) => !(k in m));
    return `Apple at $${q.c}, ${cal.length} earnings reports in the last 3 days${missing.length ? `. Not provided: ${missing.join(", ")}` : ", every number the scan uses is there"}`;
  }, fk ? undefined : "No key saved yet");
  await check("massive", async () => {
    const mv = massive(mk!); const d = await mv.details("AAPL");
    return d?.description ? `Descriptions and price history work (${d.description.slice(0, 60)}…)` : "Connected, but no description came back";
  }, mk ? undefined : "No key saved. Picks go out without a company description and with a simpler stop");
  await check("sec", async () => { const s = await sec(contact!).submissions(1067983); return `Reached the SEC (${s.name ?? "Berkshire Hathaway"})`; }, contact ? undefined : "No contact email saved. Big-investor holdings stay empty");
  await check("openfigi", async () => { const r = await figiMap(["037833100"]); return r["037833100"]?.ticker === "AAPL" ? "Ticker lookup works" : "Answered, but did not recognise Apple"; });
  const { count: investors } = await sb.from("investors").select("id", { count: "exact", head: true }).not("last_accession", "is", null);
  const { count: holdings } = await sb.from("investor_holdings").select("cusip", { count: "exact", head: true }).not("symbol", "is", null);
  return { sources: out, metric_keys: metricKeys.length, investors_loaded: investors ?? 0, holdings_matched: holdings ?? 0 };
}

/** A real-looking pick for admins only, from the stock's latest earnings report. Lets the whole path be tried on any day. */
async function testPick(sb: SupabaseClient, fh: Finnhub, mv: Massive | null, symbol: string): Promise<Record<string, unknown>> {
  if (!R.plainTicker(symbol)) fail(400, "Enter a plain US ticker, for example NVDA");
  const [q, p, m, past] = await Promise.all([fh.quote(symbol), fh.profile(symbol), fh.metric(symbol), fh.surprises(symbol).catch(() => [])]);
  if (!(q.c > 0) || !p.name) fail(404, `No data for ${symbol}`);
  const last = past.find((x) => x.actual != null && x.estimate != null);
  const day = R.nyDate(new Date(q.t * 1000));
  const seed: R.Seed = { symbol, source: "earnings", epsActual: last?.actual ?? 0, epsEstimate: last?.estimate ?? 0, epsSurprise: Math.round((last?.surprisePercent ?? 0) * 10) / 10, revSurprise: null, reported: last?.period };
  const d = R.derive(seed, q, p, m, day);
  const cand: CandRow = { id: 0, symbol, source: "earnings", seed, score: 0, detail: { m: d, quote: q, name: p.name, exchange: p.exchange ?? null, industry: p.finnhubIndustry ?? null, logo: p.logo || null, weburl: p.weburl || null } };
  const r = await buildPick(sb, fh, mv, { ...cand, source: "ipo" }, day, null, 0, 0);       // "ipo" skips the 50-day gate; the kind is set back below
  if (!r.pick) fail(500, r.reject ?? "Could not build the pick");
  const { data: ins, error } = await sb.from("stock_picks").insert({ ...r.pick, kind: "catalyst", is_test: true, headline: `Test pick. ${r.pick.headline}` }).select("id").single();
  if (error || !ins) fail(500, error?.message ?? "insert failed");
  const sent = await push(sb, null, true, `Test stock pick: ${symbol}`, r.pick.headline, `/stocks/${ins.id}`, ins.id);
  return { pick_id: ins.id, pushed: sent, description: Boolean(r.pick.description), investors: (r.pick.investors as unknown[]).length };
}

Deno.serve(handler(async (req) => {
  const sb = serviceClient();
  const cron = await isCronCall(req);
  let body: Body = {};
  try { body = await readJson<Body>(req); } catch { body = {}; }
  if (!cron) await requireAdmin(req);
  const action = cron ? "auto" : (body.action ?? "probe");
  if (action === "probe") return json(await probe(sb));

  const started = Date.now();
  const fk = await dataKey(sb, "finnhub_key");
  const contact = await dataKey(sb, "sec_contact");
  if (action === "investors") { if (!contact) fail(400, "Save a contact email for the SEC first"); return json(await investorsStep(sb, contact)); }
  if (!fk) { if (cron) return json({ skipped: "no data key" }); fail(400, "Save the Finnhub key first"); }
  const fh = finnhub(fk); const mk = await dataKey(sb, "massive_key"); const mv = mk ? massive(mk) : null;

  if (action === "test_pick") return json(await testPick(sb, fh, mv, (body.symbol ?? "").trim().toUpperCase()));
  if (action === "track") return json(await trackStep(sb, fh));
  if (action === "close") {
    const { data: k } = await sb.from("stock_picks").select("id,symbol,entry_price,last_price").eq("id", body.pick_id ?? "").eq("status", "open").maybeSingle();
    if (!k) fail(404, "No open pick with that id");
    const q = await fh.quote(k.symbol).catch(() => null);
    await closePick(sb, k, "manual", q && q.c > 0 ? q.c : Number(k.last_price ?? k.entry_price));
    return json({ closed: k.symbol });
  }

  const running = async () => {
    const { data } = await sb.from("stock_scans").select("id,trading_day,dry_run,stage,stats").in("stage", ["seed", "enrich", "select"]).gte("started_at", new Date(Date.now() - 3 * 36e5).toISOString()).order("started_at").limit(1);
    return (data?.[0] as ScanRow | undefined) ?? null;
  };
  const step = async (scan: ScanRow) => (scan.stage === "select" ? { scan: scan.id, stage: "select", ...(await selectStep(sb, fh, mv, scan)) } : { scan: scan.id, stage: "enrich", ...(await enrichStep(sb, fh, scan, started)) });

  if (action === "scan") {
    const live = await running();
    if (live) return json({ ...(await step(live)), note: "A scan is already running; continued it" });
    return json(await startScan(sb, fh, mv, body.dry_run !== false, body.force === true));      // admin scans are previews unless dry_run is false
  }

  // auto (cron)
  const live = await running();
  if (live) return json(await step(live));
  const { data: due } = await sb.rpc("stocks_due_what");
  const what = String(due ?? "");
  if (what === "scan") { if (!(await setting(sb, "stocks_enabled", 1))) return json({ skipped: "paused" }); return json(await startScan(sb, fh, mv, false, false)); }
  if (what === "track") return json(await trackStep(sb, fh));
  if (what === "investors" && contact) return json(await investorsStep(sb, contact));
  return json({ idle: true });
}));
