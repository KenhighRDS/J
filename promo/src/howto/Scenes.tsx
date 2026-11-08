// The how-to scenes: title, the call, the MT5 walkthrough (open, copy/paste, place, swipe), pending orders, the "Did you catch it?" fallback, end card.
import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { BgMesh, Finish } from "../components/Layers";
import { Body, Entrance, WordReveal, clamp } from "../components/Motion";
import { Phone } from "../components/Phone";
import { FONT, MONO } from "../fonts";
import { Chip, JROW, KNOB, KNOB_END, Logical, PHONE_TOP, PW, SH, Sfx, Shot, Step, SubLine, Switcher, Tap, fr, type View } from "./Kit";
import { MT5_BUY_X, MT5_FIELD_X, MT5_MENU_TRADE, MT5_QUOTE_XAU, MT5_ROWS, MT5_TYPE_ITEM, Mt5Done, Mt5Order, Mt5Quotes, PasteBubble } from "./Mt5";

const PhoneAt: React.FC<{ children: React.ReactNode; delay?: number }> = ({ children, delay = 0 }) => (
  <div style={{ position: "absolute", top: PHONE_TOP, left: "50%", transform: "translateX(-50%)" }}>
    <Entrance delay={delay} config={theme.spring.heavy} rise={140}><Phone width={PW}>{children}</Phone></Entrance>
  </div>
);
const ramp = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: theme.ease.out });

// ---------------------------------------------------------------- title
export const HowTitle: React.FC = () => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: theme.spring.bouncy });
  return (
    <AbsoluteFill>
      <BgMesh intensity={1.05} />
      <AbsoluteFill style={{ alignItems: "center" }}>
        <div style={{ marginTop: 430, position: "relative", opacity: p, transform: `scale(${interpolate(p, [0, 1], [0.6, 1])})` }}>
          <div style={{ position: "absolute", inset: -90, borderRadius: "50%", background: "radial-gradient(circle, rgba(220,224,230,0.28) 0%, transparent 62%)", filter: "blur(24px)" }} />
          <Img src={staticFile("logo-alpha.png")} style={{ width: 300, height: 300, position: "relative", display: "block" }} />
        </div>
        <div style={{ marginTop: 70, padding: "0 90px", textAlign: "center" }}>
          <WordReveal text="How to take" delay={10} per={4} chrome style={{ fontFamily: FONT, fontWeight: 700, fontSize: 112, letterSpacing: -4, lineHeight: 1.02, justifyContent: "center" }} />
          <WordReveal text="a J signal" delay={22} per={4} chrome style={{ fontFamily: FONT, fontWeight: 700, fontSize: 112, letterSpacing: -4, lineHeight: 1.02, justifyContent: "center" }} />
          <Entrance delay={40}><Body size={42} style={{ marginTop: 34 }}>From the call to MetaTrader 5, in five steps.</Body></Entrance>
        </div>
      </AbsoluteFill>
      <Sfx at={2} file="bass.wav" volume={0.7} />
      <Sfx at={22} file="shimmer.wav" volume={0.4} />
      <Finish />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- step 1: the call
const CallUI: React.FC<{ pressAt: number }> = ({ pressAt }) => {
  const f = useCurrentFrame();
  const seconds = Math.max(0, 118 - Math.floor(f / 30)); const mm = Math.floor(seconds / 60), ss = String(seconds % 60).padStart(2, "0");
  const pressed = interpolate(f, [pressAt - 2, pressAt + 1, pressAt + 6], [1, 0.94, 1], clamp);
  return (
    <Logical>
      <div style={{ position: "absolute", inset: 0, fontFamily: FONT, color: theme.colors.text }}>
        {[0, 1, 2].map((i) => { const t = ((f + i * 20) % 60) / 60; return <div key={i} style={{ position: "absolute", left: 195, top: 370, width: 120 + t * 230, height: 120 + t * 230, marginLeft: -(60 + t * 115), marginTop: -(60 + t * 115), borderRadius: "50%", border: "1px solid rgba(220,224,230,0.6)", opacity: (1 - t) * 0.5 }} />; })}
        <div style={{ position: "absolute", top: 70, left: 0, right: 0, textAlign: "center" }}>
          <Img src={staticFile("logo-mono.png")} style={{ width: 40, height: 40, opacity: 0.9 }} />
          <div style={{ marginTop: 14, fontSize: 15, color: theme.colors.textDim }}>New signal</div>
          <div style={{ marginTop: 10, fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>XAUUSD · <span style={{ color: theme.colors.buy }}>BUY</span></div>
          <div style={{ marginTop: 8, fontSize: 12, color: theme.colors.chrome2, fontFamily: MONO }}>Entry 2341.50 · SL 2335.00 · TP 2355.00</div>
          <div style={{ marginTop: 92, fontSize: 58, fontWeight: 600, fontFamily: MONO, lineHeight: 1 }}>{mm}:{ss}</div>
          <div style={{ marginTop: 6, fontSize: 13, color: theme.colors.textDim }}>until it expires</div>
        </div>
        <div style={{ position: "absolute", left: 26, right: 26, bottom: 44, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ height: 52, borderRadius: 26, background: theme.chromeGradient, color: "#000", fontSize: 19, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${pressed})` }}>Open</div>
          <div style={{ height: 52, borderRadius: 26, border: "1px solid #232326", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>Skip</div>
        </div>
      </div>
    </Logical>
  );
};
export const HowCall: React.FC = () => {
  const frame = useCurrentFrame();
  const shake = Math.sin(frame * 2.1) * 6 * Math.pow(Math.max(0, 1 - frame / 60), 2);
  const OPEN = 96;
  return (
    <AbsoluteFill>
      <BgMesh intensity={0.85} />
      <Step tag="STEP 1 / 5" title="Your phone rings" sub="Tap Open. On iPhone, tap the J notification." at={0} />
      <div style={{ transform: `translateX(${shake}px)` }}>
        <PhoneAt delay={2}>
          <Switcher views={[{ at: 0, node: <CallUI pressAt={OPEN} /> }, { at: OPEN + 8, up: true, node: <Shot src="j-fresh" /> }]} />
          <Tap at={OPEN} fx={0.5} fy={(844 - 44 - 62 - 26) / 844} />
        </PhoneAt>
      </div>
      {[6, 26, 46, 66].map((a) => <Sfx key={a} at={a} file="ring.wav" volume={0.42} />)}
      <Sfx at={OPEN} file="tick.wav" volume={0.8} />
      <Sfx at={OPEN + 8} file="whoosh.wav" volume={0.45} />
      <Finish />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- steps 2–5: MT5 walkthrough
const T = { row: 34, menu: 40, trade: 68, order: 76, loop0: 122, loop: 108, buy: 458, done: 468, toJ: 548, swipe: 576, end: 690 };
const FIELDS = [
  { key: "lot", value: "0.15", row: JROW.lot, field: MT5_ROWS.volume, before: "j-fresh", after: "j-lot" },
  { key: "sl", value: "2335.00", row: JROW.sl, field: MT5_ROWS.slMarket, before: "j-lot", after: "j-sl" },
  { key: "tp", value: "2355.00", row: JROW.tp, field: MT5_ROWS.tpMarket, before: "j-sl", after: "j-tp" },
] as const;
const loopAt = (k: number) => { const r = T.loop0 + k * T.loop; return { toJ: r, tap: r + 24, copied: r + 26, toMt5: r + 50, field: r + 70, bubble: r + 75, paste: r + 90, filled: r + 101 }; };
const DONE_LINE = "#58203914 buy 0.15 XAUUSDm at 2341.62";

export const HowWalkthrough: React.FC = () => {
  const frame = useCurrentFrame();
  const filled = (k: number) => frame >= loopAt(k).filled;
  const focusAt = (): "volume" | "sl" | "tp" | undefined => { for (let k = 0; k < 3; k++) { const l = loopAt(k); if (frame >= l.field && frame < l.filled + 10) return (["volume", "sl", "tp"] as const)[k]; } return undefined; };
  const order = (pressed?: "buy") => <Logical bg="#fff"><Mt5Order volume={filled(0) ? "0.15" : "0.01"} sl={filled(1) ? "2335.00" : undefined} tp={filled(2) ? "2355.00" : undefined} focus={focusAt()} pressed={pressed} /></Logical>;
  const views: View[] = [
    { at: 0, node: <Logical bg="#fff"><Mt5Quotes /></Logical> },
    { at: T.row, node: <Logical bg="#fff"><Mt5Quotes pressed /></Logical> },
    { at: T.menu, node: <Logical bg="#fff"><Mt5Quotes pressed menu /></Logical> },
    { at: T.trade, node: <Logical bg="#fff"><Mt5Quotes pressed menu menuPressed /></Logical> },
    { at: T.order, up: true, node: order() },
  ];
  FIELDS.forEach((fd, k) => {
    const l = loopAt(k);
    views.push({ at: l.toJ, dir: -1, node: <Shot src={fd.before} /> }, { at: l.copied, node: <Shot src={fd.after} /> }, { at: l.toMt5, dir: 1, node: order() });
  });
  views.push({ at: T.buy, node: order("buy") }, { at: T.done, up: true, node: <Logical bg="#fff"><Mt5Done line={DONE_LINE} levels="SL 2335.00 · TP 2355.00" /></Logical> });
  views.push({ at: T.toJ, dir: -1, node: <Shot src="j-unlocked" /> }, { at: T.swipe + 14, node: <Shot src="j-swipe-mid" /> }, { at: T.swipe + 30, node: <Shot src="j-taken" /> });

  const bubble = (k: number) => { const l = loopAt(k); return frame < l.bubble || frame > l.paste + 4 ? 0 : ramp(frame, l.bubble, l.bubble + 6); };
  const takenGlow = interpolate(frame, [T.swipe + 30, T.swipe + 40, T.swipe + 80], [0, 1, 0.35], clamp);
  const Z = { z: interpolate(frame, [T.loop0 - 12, T.loop0 + 8, T.buy - 20, T.buy - 6], [1, 1.1, 1.1, 1], { ...clamp, easing: theme.ease.inOut }), ox: 540, oy: 860 };
  const zmap = (p: { x: number; y: number }) => ({ x: Z.ox + (p.x - Z.ox) * Z.z, y: Z.oy + (p.y - Z.oy) * Z.z });
  return (
    <AbsoluteFill>
      <BgMesh intensity={0.9} />
      <Step tag="STEP 2 / 5" title="Open the order in MT5" sub="Quotes → tap XAUUSDm → Trade" at={0} until={T.loop0 - 12} />
      <Step tag="STEP 3 / 5" title="Copy in J, paste in MT5" at={T.loop0 - 2} until={T.buy - 14} />
      {FIELDS.map((fd, k) => <SubLine key={fd.key} text={["Your lot → Volume", "SL → Stop Loss", "TP → Take Profit"][k]} at={loopAt(k).toJ + 4} until={k < 2 ? loopAt(k + 1).toJ - 6 : T.buy - 14} />)}
      <Step tag="STEP 4 / 5" title="Tap Buy by Market" sub="A SELL signal? Tap Sell by Market." at={T.buy - 6} until={T.toJ - 12} />
      <Step tag="STEP 5 / 5" title="Back in J: swipe" sub="“I took it”. That's how J keeps your score." at={T.toJ - 2} />
      <div style={{ position: "absolute", inset: 0, transform: `scale(${Z.z})`, transformOrigin: `${Z.ox}px ${Z.oy}px` }}>
      <PhoneAt>
        <Switcher views={views} />
        {FIELDS.map((fd, k) => { const l = loopAt(k); return (
          <React.Fragment key={fd.key}>
            <Tap at={l.tap} fx={fd.row.fx} fy={fd.row.fy} />
            <Tap at={l.field} fx={MT5_FIELD_X / 390} fy={fd.field / 844} hold={8} />
            <Tap at={l.paste} fx={MT5_FIELD_X / 390} fy={(fd.field - 50) / 844} />
            <div style={{ position: "absolute", inset: 0, transform: `scale(${PW / 390})`, transformOrigin: "top left", width: 390, height: 844, pointerEvents: "none" }}><PasteBubble y={fd.field} show={bubble(k)} pressed={frame >= l.paste} /></div>
          </React.Fragment>
        ); })}
        <Tap at={T.row} fx={0.3} fy={MT5_QUOTE_XAU / 844} />
        <Tap at={T.trade} fx={0.42} fy={MT5_MENU_TRADE / 844} />
        <Tap at={T.buy} fx={MT5_BUY_X / 390} fy={MT5_ROWS.buttons / 844} />
        <Tap at={T.swipe} fx={KNOB.fx} fy={KNOB.fy} hold={28} drag={{ fx: KNOB_END, fy: KNOB.fy, from: T.swipe, to: T.swipe + 28 }} />
        <div style={{ position: "absolute", left: "50%", top: KNOB.fy * SH, width: PW * 0.9, height: 120, transform: "translate(-50%,-50%)", borderRadius: 60, boxShadow: `0 0 ${60 * takenGlow}px rgba(47,191,113,${0.55 * takenGlow})`, border: `3px solid rgba(47,191,113,${0.8 * takenGlow})` }} />
      </PhoneAt>
      </div>
      {FIELDS.map((fd, k) => { const l = loopAt(k); const fp = fr(MT5_FIELD_X, fd.field); return <Chip key={fd.key} value={fd.value} from={fd.row} to={fp} copyAt={l.copied} pasteAt={l.paste} map={zmap} />; })}

      <Sfx at={T.row} file="tick.wav" volume={0.8} /><Sfx at={T.trade} file="tick.wav" volume={0.8} /><Sfx at={T.order} file="whoosh.wav" volume={0.4} />
      {FIELDS.map((fd, k) => { const l = loopAt(k); return (
        <React.Fragment key={fd.key}>
          <Sfx at={l.toJ} file="whoosh.wav" volume={0.45} /><Sfx at={l.tap} file="tick.wav" volume={0.8} /><Sfx at={l.copied} file="pop.wav" volume={0.55} />
          <Sfx at={l.toMt5} file="whoosh.wav" volume={0.45} /><Sfx at={l.field} file="tick.wav" volume={0.7} /><Sfx at={l.paste} file="tick.wav" volume={0.8} /><Sfx at={l.filled} file="pop.wav" volume={0.6} />
        </React.Fragment>
      ); })}
      <Sfx at={T.buy} file="tick.wav" volume={0.85} /><Sfx at={T.done} file="shimmer.wav" volume={0.45} />
      <Sfx at={T.toJ} file="whoosh.wav" volume={0.45} /><Sfx at={T.swipe + 4} file="whoosh.wav" volume={0.5} /><Sfx at={T.swipe + 30} file="shimmer.wav" volume={0.5} /><Sfx at={T.swipe + 30} file="pop.wav" volume={0.55} />
      <Finish />
    </AbsoluteFill>
  );
};
export const WALK_LEN = T.end;

// ---------------------------------------------------------------- tip: pending orders
const P = { tapEntry: 28, toMt5: 54, tapType: 74, menu: 79, pick: 102, typed: 108, field: 124, bubble: 129, paste: 142, filled: 153, place: 170, done: 178, end: 225 };
export const HowPending: React.FC = () => {
  const frame = useCurrentFrame();
  const type = frame >= P.typed ? "Buy Stop" : "Market Execution";
  const ticket = (extra: Partial<React.ComponentProps<typeof Mt5Order>> = {}) => <Logical bg="#fff"><Mt5Order type={type} volume="0.15" sl="2335.00" tp="2355.00" price={frame >= P.filled ? "2341.50" : undefined} focus={frame >= P.field && frame < P.filled + 10 ? "price" : undefined} {...extra} /></Logical>;
  const views: View[] = [
    { at: 0, node: <Shot src="j-pending" /> }, { at: P.tapEntry + 2, node: <Shot src="j-pending-entry" /> },
    { at: P.toMt5, dir: 1, node: ticket() },
    { at: P.menu, node: ticket({ typeMenu: true }) }, { at: P.pick, node: ticket({ typeMenu: true, typePressed: "Buy Stop" }) },
    { at: P.typed, node: ticket() }, { at: P.place, node: ticket({ pressed: "place" }) },
    { at: P.done, up: true, node: <Logical bg="#fff"><Mt5Done line="#58203915 buy stop 0.15 XAUUSDm at 2341.50" levels="Pending until the price reaches 2341.50" /></Logical> },
  ];
  const bubble = frame < P.bubble || frame > P.paste + 4 ? 0 : ramp(frame, P.bubble, P.bubble + 6);
  return (
    <AbsoluteFill>
      <BgMesh intensity={0.9} />
      <Step tag="TIP" title="A pending order?" at={0} />
      <SubLine text="BUY STOP or BUY LIMIT: pick that type in MT5" at={4} until={P.field - 8} />
      <SubLine text="Paste the entry as Price, then tap Place." at={P.field - 4} />
      <PhoneAt delay={2}>
        <Switcher views={views} />
        <Tap at={P.tapEntry} fx={JROW.entry.fx} fy={JROW.entry.fy} />
        <Tap at={P.tapType} fx={0.5} fy={MT5_ROWS.type / 844} />
        <Tap at={P.pick} fx={0.4} fy={MT5_TYPE_ITEM("Buy Stop") / 844} />
        <Tap at={P.field} fx={MT5_FIELD_X / 390} fy={MT5_ROWS.price / 844} hold={8} />
        <Tap at={P.paste} fx={MT5_FIELD_X / 390} fy={(MT5_ROWS.price - 50) / 844} />
        <Tap at={P.place} fx={0.5} fy={MT5_ROWS.buttons / 844} />
        <div style={{ position: "absolute", inset: 0, transform: `scale(${PW / 390})`, transformOrigin: "top left", width: 390, height: 844, pointerEvents: "none" }}><PasteBubble y={MT5_ROWS.price} show={bubble} pressed={frame >= P.paste} /></div>
      </PhoneAt>
      <Chip value="2341.50" from={JROW.entry} to={fr(MT5_FIELD_X, MT5_ROWS.price)} copyAt={P.tapEntry + 2} pasteAt={P.paste} />
      <Sfx at={P.tapEntry} file="tick.wav" volume={0.8} /><Sfx at={P.tapEntry + 2} file="pop.wav" volume={0.55} /><Sfx at={P.toMt5} file="whoosh.wav" volume={0.45} />
      <Sfx at={P.tapType} file="tick.wav" volume={0.8} /><Sfx at={P.pick} file="tick.wav" volume={0.8} /><Sfx at={P.field} file="tick.wav" volume={0.7} />
      <Sfx at={P.paste} file="tick.wav" volume={0.8} /><Sfx at={P.filled} file="pop.wav" volume={0.6} /><Sfx at={P.place} file="tick.wav" volume={0.85} /><Sfx at={P.done} file="shimmer.wav" volume={0.45} />
      <Finish />
    </AbsoluteFill>
  );
};
export const PENDING_LEN = P.end;

// ---------------------------------------------------------------- tip: forgot to swipe
const LockScreen: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <Logical>
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 80% at 30% 10%, #2a2d33 0%, #111214 55%, #050505 100%)", fontFamily: FONT, color: "#fff" }}>
      <div style={{ position: "absolute", top: 92, left: 0, right: 0, textAlign: "center" }}>
        <div style={{ fontSize: 15, color: "rgba(255,255,255,0.75)" }}>Saturday, 8 November</div>
        <div style={{ fontSize: 86, fontWeight: 600, letterSpacing: -3, lineHeight: 1.05 }}>14:42</div>
      </div>
      {children}
    </div>
  </Logical>
);
const Notification: React.FC<{ drop: number; actions?: boolean; pressed?: boolean; gone?: number }> = ({ drop, actions, pressed, gone = 0 }) => (
  <div style={{ position: "absolute", left: 12, right: 12, top: 250, transform: `translateY(${(1 - drop) * -260}px) scale(${1 - gone * 0.1})`, opacity: drop * (1 - gone), borderRadius: 22, background: "rgba(44,45,49,0.92)", padding: "14px 16px", fontFamily: FONT, boxShadow: "0 10px 30px rgba(0,0,0,0.4)" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.65)" }}><Img src={staticFile("logo-mono.png")} style={{ width: 18, height: 18 }} />J · now</div>
    <div style={{ fontSize: 15, fontWeight: 600, marginTop: 8 }}>Did you catch it?</div>
    <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", marginTop: 3, lineHeight: 1.3 }}>XAUUSD BUY hit TP +135 pips — did you catch it?</div>
    {actions && <div style={{ display: "flex", gap: 28, marginTop: 12, fontSize: 14, fontWeight: 600, color: "#c9d2ff" }}><span style={{ padding: "4px 8px", margin: "-4px -8px", borderRadius: 8, background: pressed ? "rgba(255,255,255,0.14)" : "transparent" }}>Yes, I took it</span><span>No</span></div>}
  </div>
);
const QuestionSheet: React.FC<{ rise: number; pressed?: boolean }> = ({ rise, pressed }) => (
  <Logical bg="transparent">
    <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${0.7 * rise})` }} />
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, transform: `translateY(${(1 - rise) * 105}%)`, borderRadius: "22px 22px 0 0", background: "#0b0b0c", borderTop: "1px solid #232326", padding: "20px 20px 34px", fontFamily: FONT, color: theme.colors.text }}>
      <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 12 }}>Did you catch it?</div>
      <div style={{ fontSize: 15, color: theme.colors.textDim, lineHeight: 1.35 }}>XAUUSD BUY hit TP +135 pips. Did you take this trade?</div>
      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ height: 48, borderRadius: 14, background: theme.chromeGradient, color: "#000", fontSize: 15, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${pressed ? 0.97 : 1})` }}>Yes, I took it</div>
        <div style={{ height: 48, borderRadius: 14, border: "1px solid #232326", fontSize: 15, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>No</div>
      </div>
    </div>
  </Logical>
);
const F = { drop: 16, yes: 72, gone: 80, iphone: 116, drop2: 124, tapNote: 150, open: 158, sheet: 166, yes2: 196, close: 204, end: 255 };
const SHEET_YES = { fx: (20 + (350 - 12) / 4) / 390, fy: (844 - 34 - 24) / 844 };
export const HowForgot: React.FC = () => {
  const frame = useCurrentFrame();
  const drop = ramp(frame, F.drop, F.drop + 14), gone = ramp(frame, F.gone, F.gone + 10), drop2 = ramp(frame, F.drop2, F.drop2 + 14);
  const sheetRise = frame < F.close ? ramp(frame, F.sheet, F.sheet + 14) : 1 - ramp(frame, F.close, F.close + 12);
  const views: View[] = [
    { at: 0, node: <LockScreen><Notification drop={drop} actions pressed={frame >= F.yes} gone={gone} /></LockScreen> },
    { at: F.iphone, dir: 1, node: <LockScreen><Notification drop={drop2} /></LockScreen> },
    { at: F.open, up: true, node: <><Shot src="j-closed" /><QuestionSheet rise={sheetRise} pressed={frame >= F.yes2 && frame < F.close} /></> },
  ];
  const check = interpolate(frame, [F.gone + 2, F.gone + 12, F.iphone - 6, F.iphone], [0, 1, 1, 0], clamp);
  const pill = interpolate(frame, [F.close + 10, F.close + 20, F.end], [0, 1, 0.5], clamp);
  return (
    <AbsoluteFill>
      <BgMesh intensity={0.9} />
      <Step tag="TIP" title="Forgot to swipe?" at={0} />
      <SubLine text="When the trade closes, J asks. Android: tap “Yes, I took it”." at={4} until={F.iphone - 8} />
      <SubLine text="iPhone: tap the notification, then “Yes, I took it”." at={F.iphone - 2} />
      <PhoneAt delay={2}>
        <Switcher views={views} />
        <Tap at={F.yes} fx={(12 + 16 + 50) / 390} fy={(250 + 14 + 18 + 8 + 22 + 3 + 36 + 12 + 10) / 844} />
        <Tap at={F.tapNote} fx={0.5} fy={(250 + 50) / 844} />
        <Tap at={F.yes2} fx={SHEET_YES.fx} fy={SHEET_YES.fy} />
        <div style={{ position: "absolute", left: "50%", top: 0.42 * SH, transform: `translate(-50%,-50%) scale(${0.7 + check * 0.3})`, opacity: check, padding: "18px 34px", borderRadius: 999, background: "rgba(10,10,12,0.9)", border: `3px solid ${theme.colors.buy}`, color: theme.colors.buy, fontFamily: FONT, fontWeight: 600, fontSize: 38, whiteSpace: "nowrap" }}>✓ Marked as taken</div>
        <div style={{ position: "absolute", left: "50%", top: 0.886 * SH, width: PW * 0.9, height: 118, transform: "translate(-50%,-50%)", borderRadius: 60, boxShadow: `0 0 ${60 * pill}px rgba(47,191,113,${0.55 * pill})`, border: `3px solid rgba(47,191,113,${0.8 * pill})` }} />
      </PhoneAt>
      <Sfx at={F.drop} file="pop.wav" volume={0.55} /><Sfx at={F.yes} file="tick.wav" volume={0.85} /><Sfx at={F.gone + 2} file="shimmer.wav" volume={0.4} />
      <Sfx at={F.iphone} file="whoosh.wav" volume={0.45} /><Sfx at={F.drop2} file="pop.wav" volume={0.55} /><Sfx at={F.tapNote} file="tick.wav" volume={0.8} /><Sfx at={F.open} file="whoosh.wav" volume={0.4} />
      <Sfx at={F.yes2} file="tick.wav" volume={0.85} /><Sfx at={F.close + 10} file="shimmer.wav" volume={0.45} />
      <Finish />
    </AbsoluteFill>
  );
};
export const FORGOT_LEN = F.end;

// ---------------------------------------------------------------- end card
export const HowEnd: React.FC = () => {
  const frame = useCurrentFrame(); const { fps, durationInFrames } = useVideoConfig();
  const p = spring({ frame, fps, config: theme.spring.bouncy });
  const fade = interpolate(frame, [durationInFrames - 16, durationInFrames - 2], [1, 0], { ...clamp, easing: theme.ease.in });
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <BgMesh intensity={1.1} />
      <AbsoluteFill style={{ alignItems: "center" }}>
        <div style={{ marginTop: 480, opacity: p, transform: `scale(${interpolate(p, [0, 1], [0.6, 1])})`, position: "relative" }}>
          <div style={{ position: "absolute", inset: -100, borderRadius: "50%", background: "radial-gradient(circle, rgba(220,224,230,0.3) 0%, transparent 62%)", filter: "blur(26px)" }} />
          <Img src={staticFile("logo-alpha.png")} style={{ width: 340, height: 340, display: "block", position: "relative" }} />
        </div>
        <div style={{ marginTop: 80, padding: "0 80px" }}>
          <WordReveal text="Copy. Paste. Swipe." delay={14} per={6} chrome style={{ fontFamily: FONT, fontWeight: 700, fontSize: 96, letterSpacing: -3.5, justifyContent: "center" }} />
          <Entrance delay={40}><Body size={40} style={{ marginTop: 24, textAlign: "center" }}>J keeps the score.</Body></Entrance>
        </div>
      </AbsoluteFill>
      <Sfx at={2} file="bass.wav" volume={0.65} /><Sfx at={14} file="pop.wav" volume={0.45} /><Sfx at={20} file="pop.wav" volume={0.45} /><Sfx at={26} file="pop.wav" volume={0.45} /><Sfx at={30} file="shimmer.wav" volume={0.4} />
      <Finish />
    </AbsoluteFill>
  );
};

