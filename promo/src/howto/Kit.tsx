// Shared pieces for the how-to video: phone geometry, taps, the clipboard chip, step captions, app switching and SFX.
import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { FONT, MONO } from "../fonts";
import { Body, Entrance, Headline, chromeText, clamp } from "../components/Motion";
import layout from "../../public/ui/howto/layout.json";

export const PW = 620;                                   // phone screen width in output px
export const SH = (PW * 844) / 390;                      // phone screen height
export const S = PW / 390;                               // logical (390 × 844) → output px
export const PHONE_TOP = 470;
export const SCREEN_LEFT = (1080 - (PW + 32)) / 2 + 16;
export const SCREEN_TOP = PHONE_TOP + 16;
export const SW = 12;                                    // app-switch length in frames

/** Screen fraction → output px (for things drawn above the phone, like the clipboard chip). */
export const out = (fx: number, fy: number) => ({ x: SCREEN_LEFT + fx * PW, y: SCREEN_TOP + fy * SH });
/** MetaTrader logical px (390 × 844) → screen fraction. */
export const fr = (x: number, y: number) => ({ fx: x / 390, fy: y / 844 });

type Box = { x: number; y: number; w: number; h: number };
const mid = (b: Box) => ({ fx: b.x + b.w * 0.55, fy: b.y + b.h / 2 });
/** Row centres on the real J card, measured by scripts/capture-howto.cjs. */
export const JROW = { lot: mid(layout.lot), sl: mid(layout.sl), tp: mid(layout.tp), entry: mid(layout.pendingEntry) };
export const KNOB = { fx: layout.knob.x + layout.knob.w / 2, fy: layout.knob.y + layout.knob.h / 2 };
export const KNOB_END = layout.track.x + layout.track.w - layout.knob.w / 2 - 0.012;

export const Sfx: React.FC<{ at: number; file: string; volume?: number }> = ({ at, file, volume = 0.6 }) => <Sequence from={Math.max(0, at - 2)}><Audio src={staticFile(`sfx/${file}`)} volume={volume} /></Sequence>;

/** A real screenshot filling the phone screen. */
export const Shot: React.FC<{ src: string }> = ({ src }) => <Img src={staticFile(`ui/howto/${src}.png`)} style={{ width: PW, height: SH, display: "block" }} />;
/** Logical 390 × 844 content scaled into the phone screen. */
export const Logical: React.FC<{ children: React.ReactNode; bg?: string }> = ({ children, bg = "#000" }) => (
  <div style={{ position: "absolute", left: 0, top: 0, width: 390, height: 844, transform: `scale(${S})`, transformOrigin: "top left", background: bg, overflow: "hidden" }}>{children}</div>
);

export type View = { at: number; node: React.ReactNode; dir?: 1 | -1 | 0; up?: boolean };
/** Shows the latest view whose `at` has passed. dir ±1 slides like switching apps, `up` rises like opening a screen, 0 cuts. */
export const Switcher: React.FC<{ views: View[] }> = ({ views }) => {
  const f = useCurrentFrame();
  let i = 0; for (let k = 0; k < views.length; k++) if (f >= views[k].at) i = k;
  const cur = views[i], prev = views[i - 1];
  const dir = cur.dir ?? 0;
  const p = prev && (dir !== 0 || cur.up) ? interpolate(f, [cur.at, cur.at + SW], [0, 1], { ...clamp, easing: theme.ease.inOut }) : 1;
  if (!prev || p >= 1) return <AbsoluteFill>{cur.node}</AbsoluteFill>;
  if (cur.up) return (<><AbsoluteFill>{prev.node}</AbsoluteFill><AbsoluteFill style={{ transform: `translateY(${(1 - p) * 18}%)`, opacity: p }}>{cur.node}</AbsoluteFill></>);
  return (
    <>
      <AbsoluteFill style={{ transform: `translateX(${-dir * p * 30}%) scale(${1 - 0.06 * p})`, opacity: 1 - 0.6 * p }}>{prev.node}</AbsoluteFill>
      <AbsoluteFill style={{ transform: `translateX(${dir * (1 - p) * 100}%)`, boxShadow: "0 0 80px rgba(0,0,0,0.6)" }}>{cur.node}</AbsoluteFill>
    </>
  );
};

/** A finger tap inside the phone screen: dot lands, presses, ripples out. `drag` moves it to another point while held. */
export const Tap: React.FC<{ at: number; fx: number; fy: number; hold?: number; drag?: { fx: number; fy: number; from: number; to: number } }> = ({ at, fx, fy, hold = 6, drag }) => {
  const f = useCurrentFrame();
  const a = interpolate(f, [at - 8, at - 2, at + hold, at + hold + 8], [0, 1, 1, 0], clamp);
  if (a <= 0) return null;
  const press = interpolate(f, [at - 2, at + 1, at + 5], [1, 0.78, 0.9], clamp);
  const ripple = interpolate(f, [at, at + 16], [0, 1], { ...clamp, easing: theme.ease.out });
  const dp = drag ? interpolate(f, [drag.from, drag.to], [0, 1], { ...clamp, easing: theme.ease.inOut }) : 0;
  const x = (drag ? fx + (drag.fx - fx) * dp : fx) * PW, y = (drag ? fy + (drag.fy - fy) * dp : fy) * SH;
  return (
    <>
      <div style={{ position: "absolute", left: x, top: y, width: 150, height: 150, marginLeft: -75, marginTop: -75, borderRadius: 75, border: "4px solid rgba(255,255,255,0.8)", opacity: (1 - ripple) * a * (f >= at ? 1 : 0), transform: `scale(${0.35 + ripple * 0.8})` }} />
      <div style={{ position: "absolute", left: x, top: y, width: 66, height: 66, marginLeft: -33, marginTop: -33, borderRadius: 33, background: "rgba(255,255,255,0.88)", boxShadow: "0 0 0 3px rgba(0,0,0,0.25), 0 10px 30px rgba(0,0,0,0.45)", opacity: a, transform: `scale(${press})` }} />
    </>
  );
};

const ClipIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" /></svg>
);

/** The copied value: pops out of the J row, parks beside the phone while you switch apps, then flies into the MT5 field. */
type Pt = { x: number; y: number };
export const Chip: React.FC<{ value: string; from: { fx: number; fy: number }; to: { fx: number; fy: number }; copyAt: number; pasteAt: number; map?: (p: Pt) => Pt }> = ({ value, from, to, copyAt, pasteAt, map = (p) => p }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  if (frame < copyAt || frame > pasteAt + 14) return null;
  const a = map(out(from.fx, from.fy)), dock = { x: 946, y: a.y }, b = map(out(to.fx, to.fy));
  const pop = spring({ frame: frame - copyAt, fps, config: theme.spring.bouncy });
  const park = interpolate(frame, [copyAt + 4, copyAt + 20], [0, 1], { ...clamp, easing: theme.ease.out });
  const fly = interpolate(frame, [pasteAt, pasteAt + 12], [0, 1], { ...clamp, easing: theme.ease.inOut });
  const x0 = a.x + (dock.x - a.x) * park, y0 = a.y;
  const x = x0 + (b.x - x0) * fly, y = y0 + (b.y - y0) * fly - Math.sin(fly * Math.PI) * 120;
  const scale = interpolate(pop, [0, 1], [0.4, 1]) * (1 - fly * 0.45);
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%,-50%) scale(${scale})`, opacity: Math.min(1, pop * 1.4) * (1 - interpolate(fly, [0.85, 1], [0, 1], clamp)), display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", borderRadius: 999, background: "rgba(20,20,22,0.96)", border: "2px solid rgba(220,224,230,0.75)", boxShadow: "0 18px 50px rgba(0,0,0,0.6), 0 0 34px rgba(220,224,230,0.28)", color: theme.colors.text, fontFamily: MONO, fontWeight: 600, fontSize: 31, whiteSpace: "nowrap", zIndex: 5 }}>
      <span style={{ color: theme.colors.chrome2, display: "flex" }}><ClipIcon size={26} /></span>{value}
    </div>
  );
};

/** Step label, headline and one line of detail above the phone. */
export const Step: React.FC<{ tag: string; title: string; sub?: string; at: number; until?: number }> = ({ tag, title, sub, at, until }) => (
  <div style={{ position: "absolute", top: 104, left: 60, right: 60, textAlign: "center" }}>
    <Entrance delay={at} exitAt={until} rise={30} config={theme.spring.snappy}>
      <div style={{ display: "inline-block", padding: "8px 22px", borderRadius: 999, border: "2px solid #2c2c30", fontFamily: MONO, fontSize: 26, letterSpacing: 3, color: theme.colors.chrome2 }}>{tag}</div>
    </Entrance>
    <Entrance delay={at + 3} exitAt={until} rise={36} config={theme.spring.snappy}><Headline size={70} style={{ ...chromeText, marginTop: 20 }}>{title}</Headline></Entrance>
    {sub && <Entrance delay={at + 7} exitAt={until} rise={30} config={theme.spring.snappy}><Body size={34} style={{ marginTop: 16, color: theme.colors.chrome2 }}>{sub}</Body></Entrance>}
  </div>
);

/** A detail line that swaps within a step (sits where Step's sub would). */
export const SubLine: React.FC<{ text: string; at: number; until?: number }> = ({ text, at, until }) => (
  <div style={{ position: "absolute", top: 104 + 70 + 20 + 84, left: 60, right: 60, textAlign: "center" }}>
    <Entrance delay={at} exitAt={until} rise={24} config={theme.spring.snappy}><Body size={34} style={{ color: theme.colors.chrome2 }}>{text}</Body></Entrance>
  </div>
);

export const Font = FONT;
