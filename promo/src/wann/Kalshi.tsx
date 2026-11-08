// Kalshi mobile screens, recreated for the tutorial in logical 390 × 844 px (no Kalshi artwork).
// A football game is three markets (home, tie, away), each bought as Yes or No; prices are in cents and a winning contract pays $1.
import React from "react";
import { useCurrentFrame } from "remotion";
import { FONT, MONO } from "../fonts";

const K = { bg: "#ffffff", text: "#0b0c10", dim: "#6b7280", line: "#eceef1", yes: "#00a36c", yesBg: "#e6f6ef", no: "#7c4dff", noBg: "#f0ebff", field: "#f3f4f6" };
export const MARKET = { home: "Real Madrid", away: "Getafe", when: "Today · 9:00 PM", league: "La Liga" };
export const SIDES = [
  { name: "Real Madrid", tag: "RM", chance: 89, yes: 89, no: 12 },
  { name: "Tie", tag: "=", chance: 8, yes: 8, no: 93 },
  { name: "Getafe", tag: "GE", chance: 4, yes: 4, no: 97 },
] as const;
export const ROW_Y = (i: number) => 214 + i * 78 + 39;          // centre of each outcome row
export const YES_X = 390 - 16 - 74 - 8 - 37, NO_X = 390 - 16 - 37; // centres of the Yes / No buttons

const Top: React.FC<{ title?: string }> = ({ title }) => (
  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 82, padding: "34px 16px 0", display: "flex", alignItems: "center", gap: 14 }}>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={K.text} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
    <div style={{ flex: 1, fontSize: 14, color: K.dim }}>{title}</div>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={K.text} strokeWidth="2" strokeLinecap="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14" /></svg>
  </div>
);
const Nav: React.FC<{ active: number }> = ({ active }) => (
  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 74, borderTop: `1px solid ${K.line}`, display: "flex", background: K.bg }}>
    {["Home", "Search", "Portfolio", "Account"].map((n, i) => <div key={n} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, color: i === active ? K.text : K.dim, fontWeight: i === active ? 600 : 400 }}><div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${i === active ? K.text : "#c4c8cf"}` }} />{n}</div>)}
  </div>
);
const Badge: React.FC<{ tag: string }> = ({ tag }) => <div style={{ width: 38, height: 38, borderRadius: 19, background: tag === "=" ? "#f3f4f6" : "#111827", color: tag === "=" ? K.dim : "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>{tag}</div>;

/** Search with the match typed in, and the match card as the result. */
export const KSearch: React.FC<{ typed: number; result: boolean; pressed?: boolean }> = ({ typed, result, pressed }) => {
  const f = useCurrentFrame(); const q = "Real Madrid".slice(0, typed);
  return (
    <div style={{ position: "absolute", inset: 0, background: K.bg, fontFamily: FONT, color: K.text }}>
      <div style={{ position: "absolute", top: 40, left: 16, right: 16, height: 46, borderRadius: 12, background: K.field, display: "flex", alignItems: "center", gap: 10, padding: "0 14px", fontSize: 16 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={K.dim} strokeWidth="2.2"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <span>{q}</span><span style={{ width: 2, height: 20, background: K.text, opacity: Math.floor(f / 15) % 2 ? 0 : 1, marginLeft: -6 }} />
      </div>
      {result && (
        <div style={{ position: "absolute", top: 112, left: 16, right: 16 }}>
          <div style={{ fontSize: 13, color: K.dim, marginBottom: 10 }}>Markets</div>
          <div style={{ borderRadius: 16, border: `1px solid ${K.line}`, padding: 16, background: pressed ? "#f6f7f9" : K.bg, boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize: 12, color: K.dim }}>Soccer · {MARKET.league} · {MARKET.when}</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>{MARKET.home} vs {MARKET.away}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>{SIDES.map((s) => <span key={s.name} style={{ fontSize: 12.5, padding: "6px 10px", borderRadius: 8, background: K.field }}>{s.name} <b style={{ fontFamily: MONO }}>{s.yes}¢</b></span>)}</div>
          </div>
        </div>
      )}
      <Nav active={1} />
    </div>
  );
};

/** The match: three outcome rows, each with Yes and No. `glow` marks the button the tutorial points at. */
export const KMarket: React.FC<{ press?: "home-yes" | "away-no" }> = ({ press }) => {
  const f = useCurrentFrame();
  const pts = Array.from({ length: 30 }, (_, i) => `${16 + (i / 29) * 358},${120 - i * 1.6 - Math.sin(i / 2.3 + f / 40) * 6}`).join(" ");
  return (
    <div style={{ position: "absolute", inset: 0, background: K.bg, fontFamily: FONT, color: K.text }}>
      <Top title={`Soccer · ${MARKET.league}`} />
      <div style={{ position: "absolute", top: 92, left: 16, right: 16 }}>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5 }}>{MARKET.home} vs {MARKET.away}</div>
        <div style={{ fontSize: 14, color: K.dim, marginTop: 6 }}>{MARKET.when} · Winner</div>
      </div>
      {SIDES.map((s, i) => {
        const homeYes = press === "home-yes" && i === 0, awayNo = press === "away-no" && i === 2;
        return (
          <div key={s.name} style={{ position: "absolute", top: ROW_Y(i) - 39, left: 0, right: 0, height: 78, display: "flex", alignItems: "center", gap: 12, padding: "0 16px", borderTop: `1px solid ${K.line}` }}>
            <Badge tag={s.tag} />
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 16, fontWeight: 600 }}>{s.name}</div><div style={{ fontSize: 13, color: K.dim, marginTop: 2 }}><span style={{ fontFamily: MONO }}>{s.chance}%</span> chance</div></div>
            <div style={{ width: 74, height: 42, borderRadius: 10, background: homeYes ? K.yes : K.yesBg, color: homeYes ? "#fff" : K.yes, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700 }}>Yes {s.yes}¢</div>
            <div style={{ width: 74, height: 42, borderRadius: 10, background: awayNo ? K.no : K.noBg, color: awayNo ? "#fff" : K.no, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700 }}>No {s.no}¢</div>
          </div>
        );
      })}
      <div style={{ position: "absolute", top: 460, left: 16, right: 16, height: 150, borderRadius: 14, background: "#fafbfc", border: `1px solid ${K.line}` }}>
        <div style={{ position: "absolute", top: 12, left: 14, fontSize: 12, color: K.dim }}>{MARKET.home} · chance over the week</div>
        <svg width="358" height="150" style={{ position: "absolute", left: -16, top: 0 }}><polyline points={pts} fill="none" stroke={K.yes} strokeWidth="2" /></svg>
      </div>
      <div style={{ position: "absolute", top: 628, left: 16, right: 16, display: "flex", justifyContent: "space-between", fontSize: 13, color: K.dim }}><span><span style={{ fontFamily: MONO }}>$412,380</span> volume</span><span>Rules</span></div>
      <Nav active={1} />
    </div>
  );
};

export type OrderStage = "amount" | "review" | "done";
/** Order sheet over the market: amount, what it buys, review, filled. */
export const KOrder: React.FC<{ rise: number; amount: number; stage: OrderStage; pressReview?: boolean; pressChip?: boolean }> = ({ rise, amount, stage, pressReview, pressChip }) => {
  const price = 89, contracts = Math.floor((amount * 100) / price), fee = Math.ceil(0.07 * contracts * 0.89 * 0.11 * 100) / 100, cost = Math.round((contracts * price) / 100 * 100) / 100 + fee;
  const row = (l: string, v: string, strong?: boolean) => <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14.5, padding: "7px 0", color: strong ? K.text : K.dim, fontWeight: strong ? 700 : 400 }}><span>{l}</span><span style={{ fontFamily: MONO, color: K.text }}>{v}</span></div>;
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${0.35 * rise})` }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 470, transform: `translateY(${(1 - rise) * 105}%)`, background: K.bg, borderRadius: "22px 22px 0 0", padding: "18px 18px 24px", fontFamily: FONT, color: K.text, boxShadow: "0 -10px 30px rgba(0,0,0,0.15)" }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "#d8dbe0", margin: "0 auto 14px" }} />
        {stage === "done" ? (
          <div style={{ textAlign: "center", paddingTop: 48 }}>
            <div style={{ width: 72, height: 72, borderRadius: 36, background: K.yesBg, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke={K.yes} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg></div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 18 }}>Order filled</div>
            <div style={{ fontSize: 15, color: K.dim, marginTop: 8 }}>{contracts} Yes · {MARKET.home} at <span style={{ fontFamily: MONO }}>{price}¢</span></div>
            <div style={{ fontSize: 15, marginTop: 6 }}>Pays <b style={{ fontFamily: MONO }}>${contracts.toFixed(2)}</b> if {MARKET.home} wins</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 19, fontWeight: 800 }}>Buy <span style={{ color: K.yes }}>Yes</span> · {MARKET.home}</div>
            <div style={{ display: "flex", background: K.field, borderRadius: 10, padding: 3, marginTop: 14, width: 160 }}>{["Buy", "Sell"].map((t, i) => <div key={t} style={{ flex: 1, textAlign: "center", padding: "6px 0", borderRadius: 8, fontSize: 14, fontWeight: 600, background: i === 0 ? K.bg : "transparent", color: i === 0 ? K.text : K.dim }}>{t}</div>)}</div>
            <div style={{ marginTop: 18, fontSize: 13, color: K.dim }}>Amount</div>
            <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: -1, marginTop: 2 }}>${amount}</div>
            {stage === "amount" && <div style={{ display: "flex", gap: 8, marginTop: 10 }}>{[1, 10, 25, 100].map((v) => <div key={v} style={{ padding: "8px 14px", borderRadius: 10, background: v === 10 && pressChip ? "#dfe3e8" : K.field, fontSize: 14, fontWeight: 600 }}>+${v}</div>)}</div>}
            <div style={{ marginTop: stage === "amount" ? 12 : 16, borderTop: `1px solid ${K.line}`, paddingTop: 6 }}>
              {row("Price", `${price}¢`)}{row("Contracts", amount ? String(contracts) : "–")}{stage === "review" && row("Fees", `$${fee.toFixed(2)}`)}{stage === "review" && row("Cost", `$${cost.toFixed(2)}`)}
              {row(`Payout if ${MARKET.home} wins`, amount ? `$${contracts.toFixed(2)}` : "–", true)}
            </div>
            <div style={{ position: "absolute", left: 18, right: 18, bottom: 24, height: 52, borderRadius: 14, background: amount ? K.yes : "#cfd4da", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, filter: pressReview ? "brightness(0.85)" : "none" }}>{stage === "review" ? "Place order" : "Review"}</div>
          </>
        )}
      </div>
    </>
  );
};
export const ORDER_CHIP10 = { x: 106, y: 600 };   // "+$10" chip centre: sheet top 374 + padding, handle, title, Buy/Sell, label, amount, chip row
export const ORDER_BUTTON = { x: 195, y: 844 - 24 - 26 };
