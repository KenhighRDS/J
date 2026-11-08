import { ShareCard, chromeText, shareSize, type ShareFormat } from "./ShareCard";
import { calledAt, comboHeadline, dateSpan, parseScore, sameDay } from "../lib/calledIt";
import type { WannCall } from "../lib/types";

const mono = "'JetBrains Mono Variable', ui-monospace, monospace";
const dim = "#8E8E93", soft = "#BFC3C9", line = "#232326", won = "#2FBF71";
const ellipsis: React.CSSProperties = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const when = (iso: string, withDay: boolean) => new Date(iso).toLocaleString(undefined, withDay ? { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit" });
/** Team names shrink with length so long club names stay on one line. */
const teamSize = (name: string, base: number) => (name.length <= 12 ? base : name.length <= 18 ? base * 0.84 : base * 0.7);

const Lockup = ({ right }: { right: string }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
    <img src="/icons/icon-512.png" alt="" style={{ width: 72, height: 72, borderRadius: 18 }} />
    <span style={{ fontSize: 40, color: dim, fontWeight: 300 }}>×</span>
    <img src="/icons/wann-logo.png" alt="" style={{ width: 72, height: 72, borderRadius: 18 }} />
    <span style={{ marginLeft: "auto", fontSize: 30, color: dim }}>{right}</span>
  </div>
);
const WonMark = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={won} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12l5 5L20 7" /></svg>
);

/** "J × Wann called it": one won call as a scoreboard, or several as a combo ("4 for 4."). Only won calls are passed in. */
export function PromoCalledIt({ cardRef, calls, format, inline }: { cardRef?: React.RefObject<HTMLDivElement | null>; calls: WannCall[]; format: ShareFormat; inline?: boolean }) {
  const story = format === "story";
  const isos = calls.map(calledAt);
  if (calls.length === 1) {
    const c = calls[0]; const sc = parseScore(c.final_score);
    return (
      <ShareCard ref={cardRef} format={format} footer="J × Wann" inline={inline}>
        <Lockup right={new Date(calledAt(c)).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} />
        <div style={{ marginTop: story ? 150 : 96, fontSize: story ? 220 : 176, fontWeight: 700, lineHeight: 0.95, letterSpacing: story ? -9 : -7, ...chromeText }}>Called it.</div>
        <div style={{ flex: 1, minHeight: 78 }} />
        <div style={{ fontSize: story ? 34 : 30, color: dim }}>{c.competition} · called {when(calledAt(c), true)}</div>
        <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "1fr auto", columnGap: 40, rowGap: 6, alignItems: "baseline" }}>
          {[c.home, c.away].flatMap((team, i) => [
            <div key={`t${i}`} style={{ ...ellipsis, fontSize: teamSize(team, story ? 92 : 74), fontWeight: 600, letterSpacing: -1.5 }}>{team}</div>,
            <div key={`s${i}`} style={{ fontFamily: mono, fontSize: story ? 130 : 100, fontWeight: 600, lineHeight: 1.05, textAlign: "right", ...chromeText }}>{sc ? sc[i] : i === 0 ? c.final_score ?? "" : ""}</div>,
          ])}
        </div>
        <div style={{ marginTop: story ? 90 : 56, height: 1, background: line }} />
        <div style={{ marginTop: story ? 70 : 44, marginBottom: story ? 90 : 20, display: "flex", alignItems: "flex-end", gap: 30 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 30, color: dim }}>Wann's call</div>
            <div style={{ ...ellipsis, marginTop: 8, fontSize: story ? 66 : 56, fontWeight: 600, letterSpacing: -1 }}>{c.pick_label}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: mono, fontSize: story ? 88 : 72, fontWeight: 600, lineHeight: 1, ...chromeText }}>{Math.round(c.probability)}%</div>
            <div style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 10, fontSize: 30, color: won }}><WonMark size={30} />Won</div>
          </div>
        </div>
      </ShareCard>
    );
  }
  const n = calls.length, oneDay = sameDay(isos);
  const { h } = shareSize[format];
  const big = n > 6;
  const hero = story ? (big ? 190 : 210) : big ? 140 : 180, heroTop = story ? (big ? 110 : 150) : big ? 44 : 72, gap = story ? (big ? 70 : 110) : big ? 34 : 56, pad = story ? 30 : 22;
  const avail = h - 176 - 72 - heroTop - hero * 0.95 - 18 - 40 * 1.25 - gap - 24 - 40;   // card minus padding, lockup, headline, subline, gap, list margin, footer
  const row = 2 * pad + 44 * 1.2 + 8 + 28 * 1.25;                                         // one leg at full size; every line below has a fixed line height
  const k = Math.min(1, (avail * 0.97 - n) / (n * row));                                   // legs shrink together until all of them fit
  return (
    <ShareCard ref={cardRef} format={format} footer="J × Wann" inline={inline}>
      <Lockup right={dateSpan(isos)} />
      <div style={{ marginTop: heroTop, fontSize: hero, fontWeight: 700, lineHeight: 0.95, letterSpacing: -8, ...chromeText }}>{comboHeadline(n)}</div>
      <div style={{ marginTop: 18, fontSize: 40, lineHeight: 1.25, color: soft }}>Wann called every one.</div>
      <div style={{ flex: 1, minHeight: gap }} />
      <div style={{ marginBottom: 24, flexShrink: 0 }}>
        {calls.map((c, i) => (
          <div key={c.id} style={{ padding: `${pad * k}px 0`, borderTop: i === 0 ? `1px solid ${line}` : undefined, borderBottom: `1px solid ${line}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 24, height: 44 * k * 1.2 }}>
              <div style={{ ...ellipsis, flex: 1, fontSize: 38 * k, lineHeight: 1.2, fontWeight: 600, letterSpacing: -0.5 }}>{c.home} <span style={{ color: dim, fontWeight: 400 }}>v</span> {c.away}</div>
              <div style={{ fontFamily: mono, fontSize: 44 * k, lineHeight: 1.2, fontWeight: 600, ...chromeText }}>{c.final_score ?? ""}</div>
            </div>
            <div style={{ marginTop: 8 * k, display: "flex", alignItems: "center", gap: 14, height: 28 * k * 1.25, fontSize: 28 * k, lineHeight: 1.25, color: soft }}>
              <span style={{ ...ellipsis, flex: 1 }}>{c.pick_label}<span style={{ color: dim }}> · called {when(calledAt(c), !oneDay)}</span></span>
              <span style={{ fontFamily: mono, color: dim }}>{Math.round(c.probability)}%</span>
              <WonMark size={28 * k} />
            </div>
          </div>
        ))}
      </div>
    </ShareCard>
  );
}
