import { ShareCard, chromeText, type ShareFormat } from "./ShareCard";
import type { Signal, WannCall } from "../lib/types";
import type { BacktestSummary } from "../lib/backtest";
import { headline, pips, price, timeShort } from "../lib/format";

const blur = (on: boolean): React.CSSProperties => (on ? { filter: "blur(16px)", opacity: 0.8 } : {});

export function PromoSignal({ cardRef, signal: s, format, hideLevels }: { cardRef: React.RefObject<HTMLDivElement | null>; signal: Signal; format: ShareFormat; hideLevels: boolean }) {
  const closed = s.status === "closed";
  const story = format === "story";
  return (
    <ShareCard ref={cardRef} format={format} footer="J signals">
      <div style={{ fontSize: 34, color: "#8E8E93" }}>{closed ? "Signal result" : "Signal sent"} · {timeShort(s.sent_at ?? s.created_at)}</div>
      <div style={{ marginTop: story ? 160 : 90, fontSize: 112, fontWeight: 700, lineHeight: 1, letterSpacing: -3, ...chromeText }}>{s.base_symbol}</div>
      <div style={{ marginTop: 16, fontSize: 64, fontWeight: 600, color: s.direction === "buy" ? "#2FBF71" : "#E5484D" }}>{headline("", s.direction, s.order_type).trim()}</div>
      <div style={{ marginTop: 70, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 28, fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace", ...blur(hideLevels) }}>
        {[["Entry", price(s.entry, s.digits)], ["SL", price(s.sl, s.digits)], ["TP", price(s.tp, s.digits)]].map(([l, v]) => (
          <div key={l} style={{ background: "rgba(20,20,22,0.85)", border: "1px solid #232326", borderRadius: 24, padding: "26px 28px" }}><div style={{ fontSize: 26, color: "#8E8E93", fontFamily: "'Inter Variable', Inter, sans-serif" }}>{l}</div><div style={{ fontSize: 52, marginTop: 6 }}>{v}</div></div>
        ))}
      </div>
      {hideLevels && !closed && <div style={{ marginTop: 40, fontSize: 40, color: "#BFC3C9" }}>Members only — levels sent to subscribers</div>}
      {closed && (
        <div style={{ marginTop: story ? 140 : 90 }}>
          <div style={{ fontSize: 150, fontWeight: 700, lineHeight: 1, letterSpacing: -4, ...chromeText }}>{pips(s.result_pips)} pips</div>
          <div style={{ marginTop: 14, fontSize: 48, color: "#BFC3C9" }}>{s.close_reason === "tp" ? "TP hit ✓" : s.close_reason === "sl" ? "SL hit" : "Closed"}</div>
        </div>
      )}
    </ShareCard>
  );
}

export function PromoWann({ cardRef, call: c, format, hideLevels }: { cardRef: React.RefObject<HTMLDivElement | null>; call: WannCall; format: ShareFormat; hideLevels: boolean }) {
  const finished = c.status === "finished";
  const story = format === "story";
  const kickoff = new Date(c.kickoff_utc).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <ShareCard ref={cardRef} format={format} logo="/icons/wann-logo.png" footer="wann × J">
      <div style={{ fontSize: 34, color: "#8E8E93" }}>{c.sport} · {c.competition}</div>
      <div style={{ marginTop: story ? 160 : 80, fontSize: 84, fontWeight: 700, lineHeight: 1.1, letterSpacing: -2, ...chromeText }}>{c.home}<div style={{ fontSize: 44, color: "#8E8E93", margin: "10px 0", WebkitTextFillColor: "#8E8E93" }}>vs</div>{c.away}</div>
      <div style={{ marginTop: 40, fontSize: 36, color: "#BFC3C9" }}>{kickoff}</div>
      <div style={{ marginTop: 70, ...blur(hideLevels) }}>
        <div style={{ fontSize: 30, color: "#8E8E93" }}>The call</div>
        <div style={{ fontSize: 66, fontWeight: 600, lineHeight: 1.15 }}>{c.pick_label}</div>
        <div style={{ fontSize: 96, fontWeight: 700, fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace", ...chromeText }}>{c.probability}%</div>
      </div>
      {finished && <div style={{ marginTop: 60, fontSize: 72, fontWeight: 700, ...chromeText }}>{c.final_score ?? ""} · {c.outcome === "won" ? "Won ✓" : c.outcome === "lost" ? "Lost" : "Void"}</div>}
    </ShareCard>
  );
}

export function PromoWins({ cardRef, signals, format }: { cardRef: React.RefObject<HTMLDivElement | null>; signals: Signal[]; format: ShareFormat }) {
  const rows = signals.slice(0, 6);
  const total = rows.reduce((a, s) => a + (s.result_pips ?? 0), 0);
  return (
    <ShareCard ref={cardRef} format={format} footer="J signals">
      <div style={{ fontSize: 34, color: "#8E8E93" }}>Recent results</div>
      <div style={{ marginTop: 20, fontSize: 120, fontWeight: 700, lineHeight: 1, letterSpacing: -3, ...chromeText }}>{pips(total)} pips</div>
      <div style={{ marginTop: 60, display: "flex", flexDirection: "column", gap: 18 }}>
        {rows.map((s) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", background: "rgba(20,20,22,0.85)", border: "1px solid #232326", borderRadius: 22, padding: "22px 30px", fontSize: 40 }}>
            <span style={{ flex: 1 }}>{s.base_symbol} <span style={{ color: s.direction === "buy" ? "#2FBF71" : "#E5484D" }}>{headline("", s.direction, s.order_type).trim()}</span></span>
            <span style={{ color: "#8E8E93", fontSize: 30, marginRight: 30 }}>{s.close_reason === "tp" ? "TP ✓" : s.close_reason === "sl" ? "SL" : "closed"}</span>
            <span style={{ fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace", ...chromeText }}>{pips(s.result_pips)}</span>
          </div>
        ))}
      </div>
    </ShareCard>
  );
}

const whenLong = (s: string | null) => { if (!s) return "—"; const d = new Date(s.replace(" ", "T")); return Number.isNaN(d.getTime()) ? s : `${d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}, ${s.slice(11, 16)}`; };
const tile: React.CSSProperties = { background: "rgba(20,20,22,0.85)", border: "1px solid #232326", borderRadius: 24, padding: "26px 28px", minWidth: 0 };
const mono = "'JetBrains Mono Variable', ui-monospace, monospace";
const bigPips = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 1 })}`;

export interface SignalShots { open?: string | null; close?: string | null }
const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

/** One card, two images: the EA's chart where we opened ("Nou achte la" / "Nou vann la") and where we closed ("Nou close la"). */
export function PromoSignalShots({ cardRef, signal: s, shots, format, inline }: { cardRef?: React.RefObject<HTMLDivElement | null>; signal: Signal; shots: SignalShots; format: ShareFormat; inline?: boolean }) {
  const story = format === "story", closed = s.status === "closed" && s.result_pips != null;
  const both = Boolean(shots.open && shots.close);
  const imgH = story ? (both ? 560 : 900) : both ? 408 : 680;
  const frame = (src: string, caption: string) => (
    <div>
      <div style={{ height: imgH, borderRadius: 22, overflow: "hidden", border: "1px solid #232326", background: "#0a0a0c" }}>
        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "0% 50%", display: "block" }} />
      </div>
      <div style={{ marginTop: 12, fontSize: 28, color: "#8E8E93" }}>{caption}</div>
    </div>
  );
  return (
    <ShareCard ref={cardRef} format={format} footer="J signals" inline={inline}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: story ? 84 : 70, fontWeight: 700, letterSpacing: -2, lineHeight: 1, ...chromeText }}>{s.base_symbol}</div>
        {closed
          ? <div style={{ fontFamily: mono, fontSize: story ? 84 : 70, fontWeight: 600, lineHeight: 1, ...chromeText }}>{bigPips(s.result_pips ?? 0)}</div>
          : <div style={{ fontSize: 30, padding: "8px 18px", borderRadius: 999, border: "1px solid #2FBF71", color: "#2FBF71" }}>In play</div>}
      </div>
      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", fontSize: 32 }}>
        <span style={{ color: s.direction === "buy" ? "#2FBF71" : "#E5484D", fontWeight: 600 }}>{headline("", s.direction, s.order_type).trim()}</span>
        {closed && <span style={{ color: "#8E8E93" }}>pips</span>}
      </div>
      {story && <div style={{ flex: 1 }} />}
      <div style={{ marginTop: story ? 0 : 34, display: "flex", flexDirection: "column", gap: story ? 40 : 20 }}>
        {shots.open && frame(shots.open, `Open · ${clock(s.triggered_at ?? s.sent_at ?? s.created_at)}`)}
        {shots.close && frame(shots.close, `Close · ${clock(s.closed_at)}`)}
      </div>
      {story && <div style={{ flex: 1 }} />}
    </ShareCard>
  );
}

export type BacktestShow = "pips" | "cash" | "both";
const bigMoney = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
/** "XAUUSD.m", "XAUUSDm", "USDJPY#" → the plain instrument name a reader recognises. */
export const plainSymbol = (s: string) => { const b = s.trim().split(/[.#_\s]/)[0] || s.trim(); return b.replace(/^([A-Z]{6})[a-z]+$/, "$1"); };
/** One chip per report: the instrument and timeframe, plus that report's own figure when the card merges several. */
function instrumentChips(parts: BacktestSummary[], show: BacktestShow): string[] {
  const named = parts.filter((p) => p.symbol);
  if (named.length === 0) return [];
  const label = (p: BacktestSummary) => `${plainSymbol(p.symbol ?? "")}${p.timeframe ? ` ${p.timeframe}` : ""}`;
  if (parts.length === 1) return [label(parts[0])];
  return named.map((p) => `${label(p)}  ${show === "cash" && p.netProfit != null ? bigMoney(p.netProfit) : bigPips(p.totalPips)}`);
}

/** Backtest result in the house style: the hero is the pips, the cash result, or pips with the cash beside it; then the tiles and the first/last trade. */
export function PromoBacktest({ cardRef, result: r, parts, title, show, format, inline }: { cardRef?: React.RefObject<HTMLDivElement | null>; result: BacktestSummary; parts?: BacktestSummary[]; title: string; show: BacktestShow; format: ShareFormat; inline?: boolean }) {
  const story = format === "story";
  const chips = instrumentChips(parts?.length ? parts : [r], show);
  const money = r.netProfit != null ? bigMoney(r.netProfit) : null;
  const cash = show === "cash" && money != null;
  const hero = cash ? money : bigPips(r.totalPips);
  const heroSize = hero.length <= 7 ? 190 : hero.length <= 9 ? 150 : 120;        // long figures shrink instead of wrapping
  const sub = cash ? `${r.currency ? `${r.currency} ` : ""}net over ${r.trades} trades` : `pips over ${r.trades} trades${show === "both" && money ? ` · ${money}${r.currency ? ` ${r.currency}` : ""}` : ""}`;
  const stats: [string, string][] = [["Buys", String(r.buys)], ["Sells", String(r.sells)], ["Win rate", `${r.winRate}%`]];
  if (r.profitFactor != null) stats.push(["Profit factor", r.profitFactor.toFixed(2)]);
  if (r.maxDrawdownPct != null) stats.push(["Max drawdown", `${r.maxDrawdownPct}%`]);
  if (story && stats.length > 3) stats.push(["Trades", String(r.trades)]);   // a full second row of tiles on the tall format
  return (
    <ShareCard ref={cardRef} format={format} footer="J signals" inline={inline}>
      <div style={{ fontSize: 34, color: "#8E8E93" }}>{title}</div>
      {chips.length > 0 && (
        <div style={{ marginTop: 22, display: "flex", flexWrap: "wrap", gap: 14 }}>
          {chips.slice(0, 4).map((c, i) => <span key={i} style={{ fontSize: 30, fontFamily: mono, color: "#F5F5F7", whiteSpace: "pre", background: "rgba(20,20,22,0.85)", border: "1px solid #2A2A2E", borderRadius: 999, padding: "10px 24px" }}>{c}</span>)}
          {chips.length > 4 && <span style={{ fontSize: 30, color: "#8E8E93", padding: "10px 8px" }}>+{chips.length - 4} more</span>}
        </div>
      )}
      <div style={{ marginTop: story ? 130 : chips.length > 2 ? 40 : 56, fontSize: heroSize, fontWeight: 700, lineHeight: 1, letterSpacing: -6, ...chromeText }}>{hero}</div>
      <div style={{ fontSize: 44, color: "#BFC3C9", marginTop: 10 }}>{sub}</div>
      <div style={{ marginTop: story ? 90 : 64, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
        {stats.slice(0, story ? 6 : 3).map(([l, v]) => (
          <div key={l} style={tile}><div style={{ fontSize: 26, color: "#8E8E93" }}>{l}</div><div style={{ fontSize: 56, marginTop: 6, fontFamily: mono, ...chromeText }}>{v}</div></div>
        ))}
      </div>
      {!story && stats.length > 3 && <div style={{ marginTop: 24, display: "flex", gap: 40, fontSize: 34, color: "#BFC3C9" }}>{stats.slice(3).map(([l, v]) => <span key={l}>{l} <span style={{ fontFamily: mono, color: "#F5F5F7" }}>{v}</span></span>)}</div>}
      <div style={{ marginTop: story ? 110 : 70, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 36, rowGap: 14, fontSize: 36, alignItems: "baseline" }}>
        <span style={{ color: "#8E8E93", fontSize: 30 }}>First trade</span><span style={{ fontFamily: mono }}>{whenLong(r.firstTrade)}</span>
        <span style={{ color: "#8E8E93", fontSize: 30 }}>Last trade</span><span style={{ fontFamily: mono }}>{whenLong(r.lastTrade)}</span>
      </div>
    </ShareCard>
  );
}
