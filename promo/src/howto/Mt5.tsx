// MetaTrader 5 mobile screens, recreated (light theme, Roboto) in logical 390 × 844 px for the how-to.
// Layout follows the standard MT5 app: Quotes → tap a symbol → Trade → order ticket with Volume, Stop Loss, Take Profit, Buy/Sell by Market.
import React from "react";
import { useCurrentFrame } from "remotion";
import { ROBOTO } from "../fonts";

const C = { bg: "#ffffff", text: "#202124", dim: "#80868b", line: "#e3e5e8", blue: "#1a73e8", buy: "#1e6fd9", sell: "#e0393e", focus: "#1a73e8", field: "#f5f6f7" };
export const MT5_ROWS = { type: 106, volume: 166, price: 228, slMarket: 228, tpMarket: 288, slPending: 288, tpPending: 348, buttons: 790 };

const Bar: React.FC<{ title: string; subtitle?: string; back?: boolean; right?: React.ReactNode }> = ({ title, subtitle, back, right }) => (
  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 84, paddingTop: 30, display: "flex", alignItems: "center", gap: 14, padding: "30px 16px 0", borderBottom: `1px solid ${C.line}`, background: C.bg }}>
    {back && <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 19, fontWeight: 500, color: C.text, lineHeight: 1.1 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{subtitle}</div>}
    </div>
    {right}
  </div>
);

const Price: React.FC<{ v: string; color: string; size?: number }> = ({ v, color, size = 20 }) => {
  const head = v.slice(0, -3), pips = v.slice(-3, -1), last = v.slice(-1);
  return <span style={{ color, fontWeight: 500, whiteSpace: "nowrap" }}><span style={{ fontSize: size * 0.72 }}>{head}</span><span style={{ fontSize: size * 1.18 }}>{pips}</span><span style={{ fontSize: size * 0.6, verticalAlign: "super" }}>{last}</span></span>;
};

const QUOTES: [string, string, string, string][] = [["EURUSDm", "Euro vs US Dollar", "1.08236", "1.08244"], ["GBPUSDm", "Pound vs US Dollar", "1.26412", "1.26423"], ["USDJPYm", "US Dollar vs Yen", "149.812", "149.824"], ["XAUUSDm", "Gold vs US Dollar", "2341.20", "2341.50"], ["BTCUSDm", "Bitcoin vs US Dollar", "68412.4", "68431.9"], ["US30m", "Dow Jones 30", "39112.4", "39115.1"], ["USOILm", "Crude Oil WTI", "78.412", "78.441"]];
const NAV = ["Quotes", "Chart", "Trade", "History", "Messages"];

/** Quotes list; `pressed` highlights XAUUSDm, `menu` opens its context menu with Trade first. */
export const Mt5Quotes: React.FC<{ pressed?: boolean; menu?: boolean; menuPressed?: boolean }> = ({ pressed, menu, menuPressed }) => (
  <div style={{ position: "absolute", inset: 0, background: C.bg, fontFamily: ROBOTO, color: C.text }}>
    <Bar title="Quotes" right={<div style={{ display: "flex", gap: 22 }}><span style={{ fontSize: 26, color: C.text, lineHeight: 1 }}>+</span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2"><path d="M4 20h4L19 9l-4-4L4 16v4z" /></svg></div>} />
    <div style={{ position: "absolute", top: 84, left: 0, right: 0 }}>
      {QUOTES.map(([s, d, bid, ask]) => (
        <div key={s} style={{ height: 66, display: "flex", alignItems: "center", padding: "0 16px", borderBottom: `1px solid ${C.line}`, background: pressed && s === "XAUUSDm" ? "#e8f0fe" : C.bg }}>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 16, fontWeight: 500 }}>{s}</div><div style={{ fontSize: 11, color: C.dim, marginTop: 3 }}>{d}</div></div>
          <div style={{ width: 96, textAlign: "right" }}><Price v={bid} color={C.sell} size={17} /></div>
          <div style={{ width: 96, textAlign: "right" }}><Price v={ask} color={C.buy} size={17} /></div>
        </div>
      ))}
    </div>
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 64, borderTop: `1px solid ${C.line}`, display: "flex", background: "#fafafa" }}>
      {NAV.map((n, i) => <div key={n} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: i === 0 ? C.blue : C.dim, fontSize: 10.5 }}><div style={{ width: 20, height: 3, borderRadius: 2, background: i === 0 ? C.blue : "transparent", marginBottom: 6 }} />{n}</div>)}
    </div>
    {menu && (
      <>
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.18)" }} />
        <div style={{ position: "absolute", left: 110, top: 300, width: 230, borderRadius: 6, background: C.bg, boxShadow: "0 8px 28px rgba(0,0,0,0.28)", padding: "6px 0" }}>
          {["Trade", "Chart", "Properties", "Depth of Market"].map((m, i) => <div key={m} style={{ height: 48, display: "flex", alignItems: "center", padding: "0 20px", fontSize: 16, background: i === 0 && menuPressed ? "#e8f0fe" : "transparent" }}>{m}</div>)}
        </div>
      </>
    )}
  </div>
);
export const MT5_QUOTE_XAU = 84 + 66 * 3 + 33;            // y centre of the XAUUSDm row
export const MT5_MENU_TRADE = 300 + 6 + 24;               // y centre of "Trade" in the menu

const Stepper: React.FC<{ y: number; label: string; value?: string; placeholder: string; focus?: boolean; steps?: [string, string] }> = ({ y, label, value, placeholder, focus, steps }) => (
  <div style={{ position: "absolute", top: y - 28, left: 0, right: 0, height: 56, display: "flex", alignItems: "center", padding: "0 12px", borderBottom: `1px solid ${C.line}` }}>
    <div style={{ width: steps ? 92 : 44, display: "flex", gap: 12, color: C.blue, fontSize: steps ? 14 : 24, fontWeight: 500 }}>{steps ? <><span>{steps[1].replace("+", "−")}</span><span>{steps[0].replace("+", "−")}</span></> : "−"}</div>
    <div style={{ flex: 1, height: 44, borderRadius: 4, background: focus ? "#eef3fd" : C.field, borderBottom: `2px solid ${focus ? C.focus : "transparent"}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: 10, color: focus ? C.focus : C.dim, letterSpacing: 0.2 }}>{label}</div>
      <div style={{ fontSize: value ? 19 : 15, fontWeight: value ? 500 : 400, color: value ? C.text : "#b0b4b8", marginTop: 1 }}>{value ?? placeholder}</div>
    </div>
    <div style={{ width: steps ? 92 : 44, display: "flex", gap: 12, justifyContent: "flex-end", color: C.blue, fontSize: steps ? 14 : 24, fontWeight: 500 }}>{steps ? <><span>{steps[0]}</span><span>{steps[1]}</span></> : "+"}</div>
  </div>
);

const TYPES = ["Market Execution", "Buy Limit", "Sell Limit", "Buy Stop", "Sell Stop", "Buy Stop Limit", "Sell Stop Limit"];
export const MT5_TYPE_ITEM = (t: string) => 96 + 6 + TYPES.indexOf(t) * 46 + 23;   // y centre of a type in the open dropdown

/** The order ticket. Market: Volume, Stop Loss, Take Profit, Sell/Buy by Market. Pending: adds Price and Expiration, one Place button. */
export const Mt5Order: React.FC<{ type?: string; volume?: string; price?: string; sl?: string; tp?: string; focus?: "volume" | "price" | "sl" | "tp"; pressed?: "buy" | "sell" | "place"; typeMenu?: boolean; typePressed?: string }> = ({ type = "Market Execution", volume = "0.01", price, sl, tp, focus, pressed, typeMenu, typePressed }) => {
  const f = useCurrentFrame();
  const pending = type !== "Market Execution";
  const wobble = Math.round(Math.sin(f / 9) * 6 + Math.sin(f / 4.3) * 3);
  const ask = (2341.5 + wobble / 100 + 0.12).toFixed(2), bid = (2341.2 + wobble / 100 + 0.12).toFixed(2);
  const pts = Array.from({ length: 40 }, (_, i) => `${(i / 39) * 358 + 16},${110 - Math.sin((i + f / 6) / 3.1) * 22 - Math.sin((i + f / 10) / 1.7) * 9}`).join(" ");
  const rows = pending ? { sl: MT5_ROWS.slPending, tp: MT5_ROWS.tpPending } : { sl: MT5_ROWS.slMarket, tp: MT5_ROWS.tpMarket };
  const chartTop = pending ? 438 : 344, chartH = pending ? 200 : 290;
  return (
    <div style={{ position: "absolute", inset: 0, background: C.bg, fontFamily: ROBOTO, color: C.text }}>
      <Bar back title="XAUUSDm" subtitle="Gold vs US Dollar" />
      <div style={{ position: "absolute", top: MT5_ROWS.type - 22, left: 0, right: 0, height: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 16, fontWeight: 500, borderBottom: `1px solid ${C.line}` }}>{type}<span style={{ fontSize: 10, color: C.dim }}>▼</span></div>
      <Stepper y={MT5_ROWS.volume} label="Volume" value={volume} placeholder="0.01" focus={focus === "volume"} steps={["+0.01", "+0.1"]} />
      {pending && <Stepper y={MT5_ROWS.price} label="Price" value={price} placeholder="price" focus={focus === "price"} />}
      <Stepper y={rows.sl} label="Stop Loss" value={sl} placeholder="not set" focus={focus === "sl"} />
      <Stepper y={rows.tp} label="Take Profit" value={tp} placeholder="not set" focus={focus === "tp"} />
      {pending && <div style={{ position: "absolute", top: rows.tp + 28, left: 0, right: 0, height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", borderBottom: `1px solid ${C.line}`, fontSize: 15 }}><span style={{ color: C.dim }}>Expiration</span><span>GTC ▾</span></div>}
      <div style={{ position: "absolute", top: chartTop, left: 0, right: 0, height: chartH, background: "#fbfbfc", borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
        {[40, 80, 120, 160, 200, 240].filter((y) => y < chartH).map((y) => <div key={y} style={{ position: "absolute", left: 0, right: 0, top: y, height: 1, background: "#eef0f2" }} />)}
        <svg width="390" height={chartH} style={{ position: "absolute", inset: 0 }}><polyline points={pts} fill="none" stroke="#7aa7e8" strokeWidth="1.6" /></svg>
        <div style={{ position: "absolute", left: 0, right: 0, top: 92, height: 1, background: C.sell, opacity: 0.6 }} /><div style={{ position: "absolute", left: 0, right: 0, top: 84, height: 1, background: C.buy, opacity: 0.6 }} />
      </div>
      <div style={{ position: "absolute", top: chartTop + chartH + 14, left: 0, right: 0, display: "flex", justifyContent: "space-around" }}><Price v={bid} color={C.sell} size={24} /><Price v={ask} color={C.buy} size={24} /></div>
      <div style={{ position: "absolute", left: 12, right: 12, top: MT5_ROWS.buttons - 26, height: 52, display: "flex", gap: 10 }}>
        {pending ? <div style={{ flex: 1, borderRadius: 4, background: C.buy, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 500, letterSpacing: 0.6, filter: pressed === "place" ? "brightness(0.82)" : "none" }}>PLACE</div> : (
          <>
            <div style={{ flex: 1, borderRadius: 4, background: C.sell, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 500, letterSpacing: 0.5, filter: pressed === "sell" ? "brightness(0.82)" : "none" }}>SELL BY MARKET</div>
            <div style={{ flex: 1, borderRadius: 4, background: C.buy, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 500, letterSpacing: 0.5, filter: pressed === "buy" ? "brightness(0.82)" : "none" }}>BUY BY MARKET</div>
          </>
        )}
      </div>
      {typeMenu && (
        <>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.18)" }} />
          <div style={{ position: "absolute", left: 40, right: 40, top: 96, borderRadius: 6, background: C.bg, boxShadow: "0 8px 28px rgba(0,0,0,0.28)", padding: "6px 0" }}>
            {TYPES.map((t) => <div key={t} style={{ height: 46, display: "flex", alignItems: "center", padding: "0 20px", fontSize: 16, background: t === typePressed ? "#e8f0fe" : "transparent", color: t === type ? C.blue : C.text }}>{t}</div>)}
          </div>
        </>
      )}
    </div>
  );
};
export const MT5_BUY_X = 12 + (390 - 24 - 10) * 0.75 + 10;  // centre of BUY BY MARKET
export const MT5_FIELD_X = 195;

/** The confirmation MT5 shows after the order goes through. */
export const Mt5Done: React.FC<{ line: string; levels: string }> = ({ line, levels }) => (
  <div style={{ position: "absolute", inset: 0, background: C.bg, fontFamily: ROBOTO, color: C.text }}>
    <Bar back title="XAUUSDm" subtitle="Gold vs US Dollar" />
    <div style={{ position: "absolute", top: 250, left: 24, right: 24, textAlign: "center" }}>
      <div style={{ width: 64, height: 64, borderRadius: 32, margin: "0 auto", background: "#e6f4ea", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#1e8e3e" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg></div>
      <div style={{ fontSize: 24, fontWeight: 500, marginTop: 20 }}>Done</div>
      <div style={{ fontSize: 15, marginTop: 14 }}>{line}</div>
      <div style={{ fontSize: 14, color: C.dim, marginTop: 6 }}>{levels}</div>
    </div>
    <div style={{ position: "absolute", left: 12, right: 12, top: MT5_ROWS.buttons - 26, height: 52, borderRadius: 4, background: "#f1f3f4", color: C.blue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 500 }}>OK</div>
  </div>
);

/** Android's floating "Paste" bubble above a field. */
export const PasteBubble: React.FC<{ y: number; show: number; pressed?: boolean }> = ({ y, show, pressed }) => show <= 0 ? null : (
  <div style={{ position: "absolute", left: 195, top: y - 50, transform: `translate(-50%,-50%) scale(${0.8 + show * 0.2})`, opacity: show, padding: "9px 18px", borderRadius: 8, background: pressed ? "#4a4d52" : "#303134", color: "#fff", fontFamily: ROBOTO, fontSize: 15, fontWeight: 500, boxShadow: "0 6px 18px rgba(0,0,0,0.3)" }}>Paste</div>
);
