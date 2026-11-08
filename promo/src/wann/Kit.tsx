// The Wann video's own look: a floodlit pitch with mown stripes, chalk lines that draw themselves, condensed stadium type,
// kit-number steps, a split-flap scoreboard number, a mowing wipe between scenes, and quiet sound effects.
import React, { useId } from "react";
import { AbsoluteFill, Audio, Img, Sequence, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { DISPLAY, SANS } from "../fonts";
import { clamp } from "../components/Motion";
import { theme } from "../theme";

export const P = { grassA: "#155A36", grassB: "#1A6740", deep: "#0B2E1C", chalk: "#F2F5EF", ink: "#08200F", flood: "#FFD447", soft: "rgba(242,245,239,0.78)" };
export const PW = 600, SH = (PW * 844) / 390, S = PW / 390, PHONE_TOP = 520;
export const SCREEN_LEFT = (1080 - (PW + 32)) / 2 + 16, SCREEN_TOP = PHONE_TOP + 16;
export const out = (fx: number, fy: number) => ({ x: SCREEN_LEFT + fx * PW, y: SCREEN_TOP + fy * SH });

/** Quiet by design: the files peak at -12 dBFS; MASTER keeps the whole mix about 9 dB under the earlier videos. */
const MASTER = 1.6;
export const Sfx: React.FC<{ at: number; file: string; volume?: number }> = ({ at, file, volume = 0.5 }) => <Sequence from={Math.max(0, at - 1)}><Audio src={staticFile(`sfx-wann/${file}`)} volume={Math.min(1, volume * MASTER)} /></Sequence>;

/** Mown pitch seen from the stands: horizontal stripes drifting slowly, floodlight bloom from the top, chalk dust grain, vignette. */
export const Pitch: React.FC<{ drift?: number; light?: number }> = ({ drift = 0.6, light = 1 }) => {
  const f = useCurrentFrame();
  const band = 168, off = (f * drift) % (band * 2);
  return (
    <AbsoluteFill style={{ background: P.grassA, overflow: "hidden" }}>
      <AbsoluteFill style={{ backgroundImage: `repeating-linear-gradient(180deg, ${P.grassA} 0px, ${P.grassA} ${band}px, ${P.grassB} ${band}px, ${P.grassB} ${band * 2}px)`, backgroundPosition: `0 ${off}px`, transform: "perspective(1400px) rotateX(18deg) scale(1.35)", transformOrigin: "50% 0%" }} />
      <AbsoluteFill style={{ background: `radial-gradient(70% 45% at 18% -6%, rgba(255,248,214,${0.34 * light}) 0%, transparent 70%), radial-gradient(70% 45% at 82% -6%, rgba(255,248,214,${0.3 * light}) 0%, transparent 70%)` }} />
      <AbsoluteFill style={{ background: "radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(4,20,10,0.55) 100%)" }} />
      <AbsoluteFill style={{ opacity: 0.07, backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")", backgroundPosition: `${(f * 13) % 160}px ${(f * 7) % 160}px` }} />
    </AbsoluteFill>
  );
};

/** A chalk line that draws itself (pathLength-normalised), slightly rough at the edges. */
export const Chalk: React.FC<{ d: string; at: number; until?: number; dur?: number; width?: number; color?: string; opacity?: number; view?: string; style?: React.CSSProperties }> = ({ d, at, until, dur = 18, width = 7, color = P.chalk, opacity = 0.92, view = "0 0 1080 1920", style }) => {
  const f = useCurrentFrame(); const id = useId().replace(/:/g, "");
  const p = interpolate(f, [at, at + dur], [0, 1], { ...clamp, easing: theme.ease.out });
  const gone = until == null ? 0 : interpolate(f, [until, until + 8], [0, 1], clamp);
  if (p <= 0 || gone >= 1) return null;
  return (
    <svg viewBox={view} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none", ...style }}>
      <defs><filter id={`c${id}`}><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed={3} /><feDisplacementMap in="SourceGraphic" scale="3" /></filter></defs>
      <path d={d} pathLength={1} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 1" strokeDashoffset={1 - p} opacity={opacity * (1 - gone)} filter={`url(#c${id})`} />
    </svg>
  );
};
/** Chalk ellipse around a box in output px. */
export const ring = (x: number, y: number, w: number, h: number) => { const rx = w / 2 + 26, ry = h / 2 + 22, cx = x + w / 2, cy = y + h / 2; return `M ${cx + rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx - rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx + rx} ${cy}`; };   // two half-arcs: exact centre

/** Stadium-board headline: words rise out of a mask with a slight skew, then a chalk underline runs under them. */
export const Headline: React.FC<{ text: string; at: number; until?: number; size?: number; top?: number; kit?: string; underline?: boolean }> = ({ text, at, until, size = 118, top = 150, kit, underline = true }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const exit = until == null ? 0 : interpolate(f, [until, until + 10], [0, 1], { ...clamp, easing: theme.ease.in });
  const words = text.split(" ");
  const kitP = spring({ frame: f - at, fps, config: { damping: 13, stiffness: 140, mass: 0.8 } });
  return (
    <div style={{ position: "absolute", top, left: 70, right: 70, display: "flex", alignItems: "center", gap: 26, opacity: 1 - exit, transform: `translateY(${-exit * 30}px)` }}>
      {kit && <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: size * 1.55, lineHeight: 0.8, color: "transparent", WebkitTextStroke: `4px ${P.flood}`, transform: `scale(${interpolate(kitP, [0, 1], [0.4, 1])}) rotate(${interpolate(kitP, [0, 1], [-14, 0])}deg)`, opacity: kitP }}>{kit}</div>}
      <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", columnGap: size * 0.22, rowGap: 0 }}>
          {words.map((w, i) => {
            const p = spring({ frame: f - at - 3 - i * 3, fps, config: { damping: 15, stiffness: 170, mass: 0.7 } });
            return <span key={i} style={{ display: "inline-block", overflow: "hidden", paddingBottom: 4 }}><span style={{ display: "inline-block", fontFamily: DISPLAY, fontWeight: 900, fontSize: size, lineHeight: 0.92, letterSpacing: 1, textTransform: "uppercase", color: P.chalk, transform: `translateY(${interpolate(p, [0, 1], [105, 0])}%) skewX(${interpolate(p, [0, 1], [-12, 0])}deg)`, textShadow: "0 6px 24px rgba(0,0,0,0.25)" }}>{w}</span></span>;
          })}
        </div>
        {underline && <Chalk d={`M 0 8 C 180 2, 420 14, 620 6`} view="0 0 640 16" at={at + 10} dur={16} width={5} style={{ inset: "auto", left: 0, top: "100%", width: "70%", height: 24 }} />}
      </div>
    </div>
  );
};

/** One line of plain explanation; swaps cleanly when the next line arrives. */
export const Line: React.FC<{ text: string; at: number; until?: number; top?: number; size?: number; align?: "left" | "center" }> = ({ text, at, until, top = 392, size = 40, align = "left" }) => {
  const f = useCurrentFrame();
  const a = interpolate(f, [at, at + 8], [0, 1], { ...clamp, easing: theme.ease.out }) * (until == null ? 1 : 1 - interpolate(f, [until, until + 8], [0, 1], clamp));
  if (a <= 0) return null;
  return <div style={{ position: "absolute", top, left: 72, right: 72, textAlign: align, fontFamily: SANS, fontWeight: 500, fontSize: size, lineHeight: 1.25, color: P.soft, opacity: a, transform: `translateX(${(1 - a) * -24}px)` }}>{text}</div>;
};

/** Split-flap scoreboard text: each character cycles, then settles with a click. */
export const Flip: React.FC<{ text: string; at: number; size: number; color?: string; stagger?: number }> = ({ text, at, size, color = P.chalk, stagger = 4 }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ display: "flex", gap: size * 0.06 }}>
      {text.split("").map((ch, i) => {
        const settle = at + 10 + i * stagger; const spinning = f < settle; const visible = f >= at + i * 2;
        const pool = /\d/.test(ch) ? "0123456789" : ch; const shown = spinning ? pool[Math.floor(random(`${i}-${f}`) * pool.length)] : ch;
        const flap = spinning ? (f % 3) / 3 : interpolate(f, [settle, settle + 5], [0.5, 0], clamp);
        return (
          <div key={i} style={{ position: "relative", width: size * 0.62, height: size * 1.02, borderRadius: size * 0.08, background: "linear-gradient(180deg,#0E2A1B 0%,#0E2A1B 49.5%,#071810 50.5%,#0B2316 100%)", boxShadow: "0 18px 40px rgba(0,0,0,0.35), inset 0 0 0 2px rgba(242,245,239,0.08)", display: "flex", alignItems: "center", justifyContent: "center", opacity: visible ? 1 : 0, overflow: "hidden" }}>
            <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: size * 0.86, color, lineHeight: 1, transform: `scaleY(${1 - flap * 0.5})` }}>{shown}</span>
            <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 2, background: "rgba(0,0,0,0.55)" }} />
          </div>
        );
      })}
    </div>
  );
};

/** Floodlight-yellow tap inside the phone screen. */
export const Tap: React.FC<{ at: number; fx: number; fy: number; hold?: number; drag?: { fx: number; from: number; to: number } }> = ({ at, fx, fy, hold = 6, drag }) => {
  const f = useCurrentFrame();
  const a = interpolate(f, [at - 8, at - 2, at + hold, at + hold + 8], [0, 1, 1, 0], clamp);
  if (a <= 0) return null;
  const ripple = interpolate(f, [at, at + 18], [0, 1], { ...clamp, easing: theme.ease.out });
  const dp = drag ? interpolate(f, [drag.from, drag.to], [0, 1], { ...clamp, easing: theme.ease.inOut }) : 0;
  const x = (drag ? fx + (drag.fx - fx) * dp : fx) * PW, y = fy * SH;
  return (
    <>
      <div style={{ position: "absolute", left: x, top: y, width: 150, height: 150, marginLeft: -75, marginTop: -75, borderRadius: 75, border: `5px solid ${P.flood}`, opacity: (1 - ripple) * a * (f >= at ? 1 : 0), transform: `scale(${0.3 + ripple * 0.85})` }} />
      <div style={{ position: "absolute", left: x, top: y, width: 58, height: 58, marginLeft: -29, marginTop: -29, borderRadius: 29, background: P.flood, opacity: a * 0.9, transform: `scale(${interpolate(f, [at - 2, at + 1, at + 5], [1, 0.75, 0.9], clamp)})`, boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }} />
    </>
  );
};

export const Shot: React.FC<{ src: string }> = ({ src }) => <Img src={staticFile(`ui/wann/${src}.png`)} style={{ width: PW, height: SH, display: "block" }} />;
export const Logical: React.FC<{ children: React.ReactNode; bg?: string }> = ({ children, bg = "#000" }) => (
  <div style={{ position: "absolute", left: 0, top: 0, width: 390, height: 844, transform: `scale(${S})`, transformOrigin: "top left", background: bg, overflow: "hidden" }}>{children}</div>
);

/** J × Wann lockup: the two marks with a chalk "×". */
export const Lockup: React.FC<{ size?: number; at?: number }> = ({ size = 170, at = 0 }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const a = spring({ frame: f - at, fps, config: { damping: 12, stiffness: 150, mass: 0.8 } }), b = spring({ frame: f - at - 6, fps, config: { damping: 12, stiffness: 150, mass: 0.8 } });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.28 }}>
      <Img src={staticFile("logo-alpha.png")} style={{ width: size * 1.15, height: size * 1.15, transform: `scale(${a}) rotate(${(1 - a) * -20}deg)`, filter: "drop-shadow(0 18px 30px rgba(0,0,0,0.45))" }} />
      <span style={{ fontFamily: DISPLAY, fontWeight: 300, fontSize: size * 0.62, color: P.chalk, opacity: interpolate(f, [at + 4, at + 12], [0, 1], clamp) }}>×</span>
      <Img src={staticFile("wann-logo.png")} style={{ width: size, height: size, borderRadius: size * 0.22, transform: `scale(${b}) rotate(${(1 - b) * 20}deg)`, boxShadow: "0 18px 40px rgba(0,0,0,0.45)" }} />
    </div>
  );
};

/** Scene change: the next scene is mown in, stripe by stripe, alternating direction, with a chalk edge on each pass. */
const Mow: React.FC<TransitionPresentationComponentProps<Record<string, never>>> = ({ children, presentationDirection, presentationProgress: p }) => {
  const id = `mow${useId().replace(/:/g, "")}`;
  if (presentationDirection === "exiting") return <AbsoluteFill>{children}</AbsoluteFill>;
  const N = 10, lag = 0.045;
  const parts = Array.from({ length: N }, (_, i) => { const l = interpolate(p, [i * lag, 1 - (N - 1 - i) * lag * 0.2], [0, 1], { ...clamp, easing: theme.ease.inOut }); return { i, l, x: i % 2 ? 1 - l : 0 }; });
  return (
    <AbsoluteFill>
      <svg width="0" height="0" style={{ position: "absolute" }}><defs><clipPath id={id} clipPathUnits="objectBoundingBox">{parts.map(({ i, l, x }) => <rect key={i} x={x} y={i / N} width={l} height={1 / N + 0.002} />)}</clipPath></defs></svg>
      <AbsoluteFill style={{ clipPath: `url(#${id})` }}>{children}</AbsoluteFill>
      {parts.map(({ i, l, x }) => (l > 0 && l < 1 ? <div key={i} style={{ position: "absolute", top: `${(i / N) * 100}%`, height: `${100 / N}%`, left: `${(i % 2 ? x : l) * 100}%`, width: 6, marginLeft: -3, background: P.chalk, opacity: 0.8, boxShadow: `0 0 18px ${P.chalk}` }} /> : null))}
    </AbsoluteFill>
  );
};
export const mow = (): TransitionPresentation<Record<string, never>> => ({ component: Mow, props: {} });
