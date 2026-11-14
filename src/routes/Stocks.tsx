import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useRealtime } from "../hooks/useRealtime";
import type { Profile, StockPick, StockPosition } from "../lib/types";
import { Button, Empty, Field, PageTitle, Sheet, Spinner } from "../components/ui";
import { baseOf, bigUsd, closeLabel, dayShort, horizonLabel, kindLabel, parseAmount, usd, type Asset } from "../lib/stocks";
import { money, pct, pickMovePct, pickPrice, stockLine } from "../lib/portfolio";

const tone = (v: number | null | undefined) => (v == null || v === 0 ? "text-muted" : v > 0 ? "text-buy" : "text-sell");

function Logo({ pick, size }: { pick: StockPick; size: number }) {
  const [broken, setBroken] = useState(false);
  const box = { width: size, height: size };
  if (!pick.logo_url || broken) return <span aria-hidden style={box} className="flex shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-[13px] font-semibold text-muted">{pick.symbol.slice(0, 2)}</span>;
  return <img src={pick.logo_url} alt="" style={box} onError={() => setBroken(true)} className="shrink-0 rounded-[10px] bg-white object-contain" />;
}

export function StocksList({ profile, preview, asset = "stock" }: { profile: Profile; preview?: { picks: StockPick[]; positions: StockPosition[] }; asset?: Asset }) {
  const base = baseOf(asset), title = asset === "crypto" ? "Crypto" : "Stocks";
  const [picks, setPicks] = useState<StockPick[] | null>(preview?.picks ?? null);
  const [mine, setMine] = useState<Record<string, StockPosition>>(Object.fromEntries((preview?.positions ?? []).map((x) => [x.pick_id, x])));
  const load = useCallback(async () => {
    if (preview) return;
    const [{ data: p }, { data: pos }] = await Promise.all([
      supabase.from("stock_picks").select("*").eq("asset", asset).not("sent_at", "is", null).order("sent_at", { ascending: false }).limit(120),
      supabase.from("stock_positions").select("*").eq("user_id", profile.id),
    ]);
    setPicks((p ?? []) as StockPick[]);
    setMine(Object.fromEntries(((pos ?? []) as StockPosition[]).map((x) => [x.pick_id, x])));
  }, [profile.id, preview, asset]);
  useEffect(() => { void load(); }, [load]);
  useRealtime([{ table: "stock_picks" }, { table: "stock_positions", filter: `user_id=eq.${profile.id}` }], () => { void load(); }, [profile.id, asset]);

  if (!picks) return <div className="mx-auto w-full max-w-md"><PageTitle>{title}</PageTitle><div className="flex justify-center py-16"><Spinner /></div></div>;
  const open = picks.filter((k) => k.status === "open"), closed = picks.filter((k) => k.status === "closed");
  return (
    <div className="mx-auto w-full max-w-md pb-6">
      <PageTitle>{title}</PageTitle>
      <Link to="/portfolio" className="focus-ring mx-4 mb-3 flex items-center gap-3 rounded-[16px] border border-chrome-3/50 bg-surface-2 px-4 py-3">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-chrome-2"><path d="M11 4a8.5 8.5 0 1 0 9 9h-9z" /><path d="M15 3.6A8.5 8.5 0 0 1 20.4 9H15z" /></svg>
        <span className="min-w-0 flex-1"><span className="block text-[15px]">My portfolio</span><span className="block truncate text-[13px] text-muted">Your results in money</span></span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-muted"><path d="M9 6l6 6-6 6" /></svg>
      </Link>
      {picks.length === 0 && (asset === "crypto"
        ? <Empty title="No crypto picks yet" body="J scans the most traded coins every day at midnight UTC. When one clears the bar, it lands here with the reasons and the plan." />
        : <Empty title="No stock picks yet" body="J scans the market after each US close. When a stock clears the bar, it lands here with the reasons and the plan." />)}
      {open.length > 0 && (
        <section className="space-y-2 px-4">
          {open.map((k) => {
            const move = pickMovePct(k); const pos = mine[k.id]; const line = pos ? stockLine(pos, k) : null;
            return (
              <Link key={k.id} to={`${base}/${k.id}`} className="focus-ring block rounded-[16px] border border-border bg-surface px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <Logo pick={k} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[17px] font-semibold leading-tight">{k.symbol}{k.is_test && <span className="text-[13px] font-normal text-muted"> test</span>}</p>
                    <p className="truncate text-[13px] text-muted">{k.name}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-mono tabular text-[17px] ${tone(move)}`}>{pct(move)}</p>
                    <p className="text-[12px] text-muted">since {dayShort(k.sent_at)}</p>
                  </div>
                </div>
                <p className="mt-2.5 text-[14px] leading-snug">{k.headline}</p>
                <p className="mt-2 flex flex-wrap gap-x-3 text-[12px] text-muted"><span>{kindLabel(k)}</span><span>{horizonLabel[k.horizon]}</span>{line && <span className="text-text">You: {money(line.putIn, false)} in, {money(line.pnl)}</span>}</p>
              </Link>
            );
          })}
        </section>
      )}
      {closed.length > 0 && (
        <section className={`px-4 ${open.length ? "mt-6" : ""}`}>
          <h2 className="mb-2 px-1 text-[13px] text-muted">Closed picks</h2>
          <ul className="divide-y divide-border rounded-[16px] border border-border bg-surface">
            {closed.map((k) => (
              <li key={k.id}>
                <Link to={`${base}/${k.id}`} className="focus-ring flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px]">{k.symbol} <span className="text-muted">{k.name}</span></p>
                    <p className="text-[13px] text-muted">{k.close_reason ? closeLabel[k.close_reason] : "Closed"} · {dayShort(k.closed_at)}</p>
                  </div>
                  <span className={`font-mono tabular text-[15px] ${tone(k.result_pct)}`}>{pct(k.result_pct)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-7"><h2 className="mb-2.5 text-[17px] font-semibold">{title}</h2>{children}</section>;
}

/** One pick: what the company is, why J picked it, the plan, who else holds it, and the member's own position. */
export function StockRoute({ profile, preview, asset = "stock" }: { profile: Profile; preview?: { pick: StockPick; position: StockPosition | null }; asset?: Asset }) {
  const base = baseOf(asset), coin = asset === "crypto";
  const { id = "" } = useParams(); const nav = useNavigate();
  const [pick, setPick] = useState<StockPick | null>(preview?.pick ?? null);
  const [pos, setPos] = useState<StockPosition | null>(preview?.position ?? null);
  const [missing, setMissing] = useState(false);
  const [more, setMore] = useState(false);
  const [sheet, setSheet] = useState<"buy" | "sell" | null>(null);
  const [amount, setAmount] = useState(""); const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (preview) return;
    const [{ data: k }, { data: p }] = await Promise.all([
      supabase.from("stock_picks").select("*").eq("id", id).maybeSingle(),
      supabase.from("stock_positions").select("*").eq("pick_id", id).eq("user_id", profile.id).maybeSingle(),
    ]);
    if (!k) { setMissing(true); return; }
    setPick(k as StockPick); setPos((p as StockPosition | null) ?? null);
  }, [id, profile.id, preview]);
  useEffect(() => { void load(); }, [load]);
  useRealtime([{ table: "stock_picks", filter: `id=eq.${id}` }, { table: "stock_positions", filter: `pick_id=eq.${id}` }], () => { void load(); }, [id]);

  if (missing) return <Empty title="This pick isn't available" action={<Button type="button" onClick={() => nav(base)}>{coin ? "Back to crypto" : "Back to stocks"}</Button>} />;
  if (!pick) return <div className="flex h-full items-center justify-center"><Spinner /></div>;
  const k = pick; const now = pickPrice(k); const move = pickMovePct(k); const closed = k.status === "closed";
  const line = pos ? stockLine(pos, k) : null;
  const openSheet = (which: "buy" | "sell") => {
    setErr(null);
    if (which === "buy") { setAmount(pos ? String(pos.amount_usd) : ""); setPrice(String(pos ? pos.buy_price : now)); }
    else setPrice(String(pos?.sell_price ?? now));
    setSheet(which);
  };
  const save = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    const px = parseAmount(price);
    if (px == null || px <= 0) { setErr(coin ? "Enter the price per coin" : "Enter the price per share"); return; }
    let args: Record<string, unknown>; let fn: string;
    if (sheet === "buy") {
      const amt = parseAmount(amount);
      if (amt == null || amt <= 0) { setErr("Enter how much you put in"); return; }
      fn = "stock_take"; args = { p_pick: k.id, p_amount: amt, p_price: px };
    } else { fn = "stock_sell"; args = { p_pick: k.id, p_price: px }; }
    setBusy(true);
    const { data, error } = preview ? { data: null, error: null } : await supabase.rpc(fn, args);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    if (data) setPos(data as StockPosition);
    setSheet(null);
  };
  // "I bought it" asks nothing: it records the member's default amount at the latest price; both can be edited after
  const defaultAmount = profile.default_amount ?? 100;
  const buyNow = async () => {
    setErr(null);
    if (preview) { setPos({ id: "new", user_id: profile.id, pick_id: k.id, amount_usd: defaultAmount, buy_price: now, bought_at: new Date().toISOString(), sell_price: null, sold_at: null }); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("stock_take", { p_pick: k.id });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setPos(data as StockPosition);
  };
  const act = async (fn: "stock_untake" | "stock_sell", args: Record<string, unknown>) => {
    if (preview) return;
    const { data, error } = await supabase.rpc(fn, { p_pick: k.id, ...args });
    if (error) return;
    setPos(fn === "stock_untake" ? null : (data as StockPosition));
  };
  const plan: [string, string, string][] = k.horizon === "swing"
    ? [["Buy up to", usd(k.buy_below ?? k.entry_price), "Above this, skip it"], ["Stop", usd(k.stop_price), "Sell if it falls here"], ["Target", usd(k.target_price), "Take the profit here"]]
    : [];

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-8">
      <header className="flex h-12 items-center">
        <button type="button" onClick={() => nav(base)} className="focus-ring -ml-2 flex h-11 items-center gap-1 px-2 text-[15px] text-muted"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>{coin ? "Crypto" : "Stocks"}</button>
      </header>

      <div className="flex items-center gap-3.5">
        <Logo pick={k} size={52} />
        <div className="min-w-0">
          <h1 className="chrome text-[34px] font-semibold leading-none tracking-tight">{k.symbol}</h1>
          <p className="mt-1 truncate text-[15px] text-muted">{k.name}</p>
        </div>
      </div>
      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted"><span>{kindLabel(k)}</span><span>{horizonLabel[k.horizon]}</span>{k.exchange && !coin && <span>{k.exchange}</span>}{k.industry && <span>{k.industry}</span>}{k.is_test && <span>Test pick</span>}</p>

      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-muted">{closed ? `Closed ${dayShort(k.closed_at)}` : k.last_price_at ? `Price, ${new Date(k.last_price_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Price at the pick"}</p>
          <p className="font-mono tabular text-[32px] leading-tight">{usd(now)}</p>
        </div>
        <div className="pb-1 text-right">
          <p className={`font-mono tabular text-[22px] leading-tight ${tone(move)}`}>{pct(move)}</p>
          <p className="text-[13px] text-muted">since {usd(k.entry_price)} on {dayShort(k.sent_at)}</p>
        </div>
      </div>
      {closed && <p className="mt-3 rounded-[12px] border border-border px-3.5 py-2.5 text-[14px]">{k.close_reason ? closeLabel[k.close_reason] : "Closed"}. This pick is over{pos && !pos.sell_price ? "; if you sold, record it below." : "."}</p>}

      <p className="mt-5 text-[17px] leading-snug">{k.headline}</p>

      <Section title="The plan">
        {k.horizon === "swing" ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {plan.map(([label, value, hint]) => (
                <div key={label} className="rounded-[14px] border border-border bg-surface px-3 py-3">
                  <p className="text-[12px] text-muted">{label}</p>
                  <p className={`mt-0.5 font-mono tabular ${value.length > 10 ? "text-[12px]" : value.length > 8 ? "text-[14px]" : "text-[17px]"}`}>{value}</p>
                  <p className="mt-1 text-[11px] leading-tight text-muted">{hint}</p>
                </div>
              ))}
            </div>
            <p className="mt-2.5 text-[14px] leading-snug text-muted">A swing trade lasts days to weeks. Sell at the target or the stop, whichever comes first.{k.expires_at && !closed ? ` If neither is reached by ${dayShort(k.expires_at)}, J closes the pick.` : ""}</p>
          </>
        ) : (
          <p className="text-[15px] leading-snug text-muted">A long-term hold: buy and keep it for months. There is no stop and no target. J keeps tracking it and tells you when the pick closes{k.buy_below ? `. It is a buy up to ${usd(k.buy_below)}` : ""}.</p>
        )}
      </Section>

      {k.reasons.length > 0 && (
        <Section title="Why J picked it">
          <ul className="space-y-3">
            {k.reasons.map((r) => <li key={r.label} className="border-l-2 border-chrome-3 pl-3"><p className="text-[15px] font-medium leading-snug">{r.label}</p><p className="mt-0.5 text-[14px] leading-snug text-muted">{r.detail}</p></li>)}
          </ul>
        </Section>
      )}

      {k.description && (
        <Section title={coin ? "What it is" : "What the company does"}>
          <p className={`text-[15px] leading-relaxed text-muted ${more ? "" : "line-clamp-5"}`}>{k.description}</p>
          {k.description.length > 320 && <button type="button" onClick={() => setMore(!more)} className="focus-ring mt-1.5 text-[14px] underline">{more ? "Show less" : "Read more"}</button>}
          {k.website && <p className="mt-2 text-[14px]"><a href={k.website} target="_blank" rel="noreferrer" className="focus-ring underline">{k.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a></p>}
        </Section>
      )}

      {k.facts.length > 0 && (
        <Section title="Key facts">
          <dl className="grid grid-cols-2 gap-x-4 rounded-[16px] border border-border bg-surface px-4 py-1">
            {k.facts.map((f) => <div key={f.label} className="border-b border-border py-2.5 [&:nth-last-child(-n+2)]:border-b-0"><dt className="text-[12px] text-muted">{f.label}</dt><dd className="mt-0.5 font-mono tabular text-[15px]">{f.value}</dd></div>)}
          </dl>
        </Section>
      )}

      {(!coin || k.investors.length > 0) && <Section title={coin ? "Companies holding it" : "Big investors holding it"}>
        {k.investors.length > 0 ? (
          <>
            <ul className="divide-y divide-border rounded-[16px] border border-border bg-surface">
              {k.investors.map((v) => (
                <li key={v.firm} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1"><p className="truncate text-[15px]">{v.name}</p><p className="truncate text-[13px] text-muted">{v.firm}</p></div>
                  <div className="text-right"><p className="font-mono tabular text-[15px]">{bigUsd(v.value_usd)}</p>{v.pct != null && <p className="text-[12px] text-muted">{v.pct < 0.1 ? "under 0.1" : v.pct.toFixed(1)}% {coin ? "of all coins" : "of their portfolio"}</p>}</div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[13px] leading-snug text-muted">{coin ? `Public companies with it on their balance sheet, as listed by CoinGecko${k.investors[0].period ? ` on ${dayShort(k.investors[0].period)}` : ""}. They may have bought or sold since.` : `From each investor's latest quarterly filing${k.investors[0].period ? ` (holdings on ${dayShort(k.investors[0].period)})` : ""}. Filings arrive up to 45 days after the quarter ends, so they may have bought or sold since.`}</p>
          </>
        ) : <p className="text-[15px] leading-snug text-muted">None of the big investors J follows reported holding it in their latest quarterly filing.{k.kind === "ipo" ? " That is normal for a new listing: filings only come out once a quarter." : ""}</p>}
      </Section>}

      {k.risks.length > 0 && (
        <Section title="What could go wrong">
          <ul className="space-y-2">{k.risks.map((r) => <li key={r} className="flex gap-2.5 text-[15px] leading-snug text-muted"><span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-sell" />{r}</li>)}</ul>
          <p className="mt-3 text-[13px] leading-snug text-muted">A pick is J's view, not advice made for you. {coin ? "Crypto" : "Stocks"} can fall fast; only put in money you can afford to lose.</p>
        </Section>
      )}

      <Section title="Your position">
        {line && pos ? (
          <div className="rounded-[16px] border border-border bg-surface p-4">
            <div className="flex items-end justify-between gap-4">
              <div><p className="text-[13px] text-muted">{pos.sell_price ? "You sold for" : "Worth now"}</p><p className="font-mono tabular text-[26px] leading-tight">{money(line.value, false)}</p></div>
              <div className="text-right"><p className={`font-mono tabular text-[19px] leading-tight ${tone(line.pnl)}`}>{money(line.pnl)}</p><p className={`text-[13px] ${tone(line.pct)}`}>{pct(line.pct)}</p></div>
            </div>
            <p className="mt-2 text-[13px] text-muted">You put in {money(pos.amount_usd, false)} at {usd(pos.buy_price)} on {dayShort(pos.bought_at)}{pos.sell_price ? `, sold at ${usd(pos.sell_price)}` : ""}.</p>
            <div className="mt-3.5 grid grid-cols-2 gap-2">
              {pos.sell_price ? <Button variant="ghost" type="button" onClick={() => { void act("stock_sell", { p_undo: true }); }}>I still hold it</Button> : <Button type="button" onClick={() => openSheet("sell")}>I sold it</Button>}
              <Button variant="ghost" type="button" onClick={() => openSheet("buy")}>Edit amount</Button>
            </div>
            <button type="button" onClick={() => { void act("stock_untake", {}); }} className="focus-ring mt-3 w-full text-center text-[13px] text-muted underline">I didn't buy it, remove it</button>
          </div>
        ) : (
          <>
            <p className="mb-3 text-[15px] leading-snug text-muted">{closed ? "This pick has closed. If you did buy it, you can still add it to your portfolio." : "Bought it? One tap adds it to your portfolio."} It goes in at {money(defaultAmount, false)}, your default amount, and the latest price. You can change both after.</p>
            <Button full type="button" busy={busy && sheet == null} onClick={() => { void buyNow(); }}>I bought it</Button>
            {err && sheet == null && <p className="mt-2 text-[13px] text-sell">{err}</p>}
          </>
        )}
      </Section>

      <Sheet open={sheet != null} onClose={() => setSheet(null)} title={sheet === "sell" ? `Sold ${k.symbol}` : `Your ${k.symbol} position`}>
        <form onSubmit={save} className="space-y-3">
          {sheet === "buy" && <Field label="How much did you put in? ($)" inputMode="decimal" autoFocus placeholder="500" value={amount} onChange={(e) => setAmount(e.target.value)} />}
          <Field label={sheet === "sell" ? `Price you sold at ($ per ${coin ? "coin" : "share"})` : `Price you paid ($ per ${coin ? "coin" : "share"})`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} hint={sheet === "sell" ? "Filled with the latest price J has. Change it to your real fill." : "Filled with the latest price J has. Change it to what your broker shows."} error={err} />
          <Button full type="submit" busy={busy}>{sheet === "sell" ? "Save the sale" : pos ? "Save" : "Add to my portfolio"}</Button>
        </form>
      </Sheet>
    </div>
  );
}
