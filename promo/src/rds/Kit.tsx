// The RDS Academy × J stocks video has its own look: cool market paper, navy ink, and the logo's own candles (yellow
// and red) as the moving motif. Serif headlines (Fraunces) echo the logo's lettering; figures are set in the J app's
// mono. Every colour, easing and spring lives in R below.
import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Easing } from "remotion";
import { FONT, MONO, SERIF } from "../fonts";

export const R = {
  paper: "#F3F5FA", paperDeep: "#E4E9F4", card: "#FFFFFF",
  ink: "#101B45", inkSoft: "rgba(16,27,69,0.64)", inkFaint: "rgba(16,27,69,0.40)", line: "rgba(16,27,69,0.13)",
  navy: "#1B2A5C", yellow: "#F6C20A", red: "#E0261C", blue: "#1E88C8", green: "#1C9A57",
  shadow: "0 26px 60px rgba(16,27,69,0.13), 0 3px 10px rgba(16,27,69,0.07)",
  ease: { out: Easing.bezier(0.16, 1, 0.3, 1), inOut: Easing.bezier(0.83, 0, 0.17, 1), in: Easing.bezier(0.7, 0, 0.84, 0) },
  spring: { snappy: { damping: 15, stiffness: 170, mass: 0.6 }, smooth: { damping: 20, stiffness: 95, mass: 1 }, bouncy: { damping: 11, stiffness: 160, mass: 0.7 }, heavy: { damping: 26, stiffness: 70, mass: 1.1 } },
} as const;
export const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
export const SIDE = 84;                 // left / right page margin
export { FONT, MONO, SERIF };

/** Quiet by design: files peak at -12 dBFS and play at a fraction of that. */
const MASTER = 1.5;
export const Sfx: React.FC<{ at: number; file: string; volume?: number }> = ({ at, file, volume = 0.4 }) => (
  <Sequence from={Math.max(0, at - 1)} layout="none"><Audio src={staticFile(`sfx-rds/${file}`)} volume={Math.min(1, volume * MASTER)} /></Sequence>
);

/** Layer 1: market paper. A slow two-tone mesh, a faint column grid that drifts like a chart scrolling, soft tint. */
export const Paper: React.FC = () => {
  const f = useCurrentFrame();
  const a = Math.sin(f / 95) * 6, b = Math.cos(f / 120) * 5, drift = (f * 0.35) % 120;
  return (
    <AbsoluteFill style={{ background: R.paper, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: `radial-gradient(60% 40% at ${22 + a}% ${12 + b}%, rgba(30,136,200,0.13) 0%, transparent 70%), radial-gradient(55% 38% at ${84 - a}% ${88 - b}%, rgba(246,194,10,0.15) 0%, transparent 72%), radial-gradient(50% 30% at ${70 + b}% ${38 + a}%, rgba(224,38,28,0.05) 0%, transparent 70%)` }} />
      <AbsoluteFill style={{ backgroundImage: `repeating-linear-gradient(90deg, ${R.line} 0px, ${R.line} 1px, transparent 1px, transparent 120px)`, backgroundPosition: `${-drift}px 0`, opacity: 0.55 }} />
      <AbsoluteFill style={{ backgroundImage: `repeating-linear-gradient(180deg, ${R.line} 0px, ${R.line} 1px, transparent 1px, transparent 240px)`, opacity: 0.35 }} />
    </AbsoluteFill>
  );
};
/** Layers 4 and 5: a light grade, paper grain and a soft vignette over everything. */
export const Finish: React.FC = () => (
  <>
    <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(27,42,92,0.035) 0%, transparent 30%, transparent 70%, rgba(246,194,10,0.04) 100%)", mixBlendMode: "multiply", pointerEvents: "none" }} />
    <AbsoluteFill style={{ opacity: 0.11, mixBlendMode: "multiply", pointerEvents: "none", backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='7'/><feColorMatrix values='0 0 0 0 0.06  0 0 0 0 0.1  0 0 0 0 0.27  0 0 0 0.55 0'/></filter><rect width='180' height='180' filter='url(%23n)'/></svg>\")" }} />
    <AbsoluteFill style={{ background: "radial-gradient(120% 85% at 50% 46%, transparent 58%, rgba(16,27,69,0.16) 100%)", pointerEvents: "none" }} />
  </>
);

/** Springs in with opacity, rise and scale together; leaves faster than it came. */
export const Rise: React.FC<{ at: number; until?: number; rise?: number; from?: number; config?: { damping: number; stiffness: number; mass: number }; style?: React.CSSProperties; children: React.ReactNode }> = ({ at, until, rise = 46, from = 0.94, config = R.spring.smooth, style, children }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const p = spring({ frame: f - at, fps, config });
  const exit = until == null ? 0 : interpolate(f, [until, until + 9], [0, 1], { ...clamp, easing: R.ease.in });
  if (f < at) return null;
  const idle = Math.sin((f - at) / 27 + at) * 2.6 * p;                 // once landed, nothing sits perfectly still
  return <div style={{ opacity: Math.min(1, p * 1.4) * (1 - exit), transform: `translateY(${(1 - p) * rise - exit * 34 + idle}px) scale(${interpolate(p, [0, 1], [from, 1]) * (1 - exit * 0.04)})`, ...style }}>{children}</div>;
};

/** Serif headline: each word rises out of a mask, a few frames after the last. */
export const Title: React.FC<{ text: string; at: number; until?: number; size?: number; top?: number; width?: number; align?: "left" | "center"; color?: string }> = ({ text, at, until, size = 112, top = 250, width, align = "left", color = R.ink }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const exit = until == null ? 0 : interpolate(f, [until, until + 9], [0, 1], { ...clamp, easing: R.ease.in });
  return (
    <div style={{ position: "absolute", top, left: SIDE, right: SIDE, width, display: "flex", flexWrap: "wrap", justifyContent: align === "center" ? "center" : "flex-start", columnGap: size * 0.24, rowGap: 0, opacity: 1 - exit, transform: `translateY(${-exit * 26}px)` }}>
      {text.split(" ").map((w, i) => {
        const p = spring({ frame: f - at - i * 4, fps, config: R.spring.smooth });
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", paddingBottom: size * 0.16, marginBottom: -size * 0.16 }}>
            <span style={{ display: "inline-block", fontFamily: SERIF, fontWeight: 620, fontSize: size, lineHeight: 1.04, letterSpacing: -size * 0.022, color, fontVariationSettings: "'opsz' 144, 'SOFT' 30", transform: `translateY(${(1 - p) * 108}%) rotate(${(1 - p) * 4}deg)`, transformOrigin: "0% 100%", opacity: Math.min(1, p * 1.6) }}>{w}</span>
          </span>
        );
      })}
    </div>
  );
};
/** Plain caption under a headline. */
export const Sub: React.FC<{ text: string; at: number; until?: number; top: number; size?: number; align?: "left" | "center"; color?: string }> = ({ text, at, until, top, size = 44, align = "left", color = R.inkSoft }) => (
  <div style={{ position: "absolute", top, left: SIDE, right: SIDE, textAlign: align }}>
    <Rise at={at} until={until} rise={26} from={0.98}><div style={{ fontFamily: FONT, fontSize: size, lineHeight: 1.28, fontWeight: 450, color }}>{text}</div></Rise>
  </div>
);

/** One candlestick: the wick draws, then the body grows from its base. `up` picks yellow, else red (the logo's own two). */
export const Candle: React.FC<{ at: number; x: number; base: number; body: number; wick: number; width?: number; up?: boolean; until?: number }> = ({ at, x, base, body, wick, width = 46, up = true, until }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const p = spring({ frame: f - at, fps, config: R.spring.bouncy });
  const w = spring({ frame: f - at + 3, fps, config: R.spring.smooth });
  const exit = until == null ? 0 : interpolate(f, [until, until + 10], [0, 1], { ...clamp, easing: R.ease.in });
  const breathe = 1 + Math.sin((f + x) / 22) * 0.012;
  const color = up ? R.yellow : R.red;
  if (f < at - 3) return null;
  return (
    <div style={{ position: "absolute", left: x, top: base - body - wick, width, height: body + wick * 2, opacity: 1 - exit, transform: `translateY(${exit * 60}px)` }}>
      <div style={{ position: "absolute", left: width / 2 - 2.5, top: 0, width: 5, height: "100%", background: color, borderRadius: 3, transform: `scaleY(${w})`, transformOrigin: "50% 100%" }} />
      <div style={{ position: "absolute", left: 0, top: wick, width, height: body, background: color, borderRadius: 7, transform: `scaleY(${p * breathe})`, transformOrigin: "50% 100%", boxShadow: "0 10px 22px rgba(16,27,69,0.12)" }} />
    </div>
  );
};

/** A faint chart scrolling along the bottom of the frame: small candles on a wandering baseline, drifting left. */
export const Tape: React.FC<{ from: number; to: number }> = ({ from, to }) => {
  const f = useCurrentFrame();
  const vis = interpolate(f, [from, from + 24, to - 16, to], [0, 1, 1, 0], { ...clamp, easing: R.ease.inOut });
  if (vis <= 0) return null;
  const step = 58, speed = 0.8, first = Math.floor((f * speed) / step), shift = (f * speed) % step;
  return (
    <AbsoluteFill style={{ opacity: vis * 0.42, pointerEvents: "none" }}>
      {Array.from({ length: 21 }, (_, i) => {
        const k = first + i;
        const base = 1806 - (Math.sin(k / 3.1) * 34 + Math.sin(k / 7.3) * 46);
        const body = 26 + random(`b${k}`) * 62, wick = 12 + random(`w${k}`) * 16, up = random(`u${k}`) > 0.44;
        const color = up ? R.yellow : R.red;
        return (
          <div key={k} style={{ position: "absolute", left: i * step - shift - 20, top: base - body - wick, width: 26, height: body + wick * 2 }}>
            <div style={{ position: "absolute", left: 11, top: 0, width: 4, height: "100%", background: color, borderRadius: 2 }} />
            <div style={{ position: "absolute", left: 0, top: wick, width: 26, height: body, background: color, borderRadius: 5 }} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** Between scenes: candles shoot up from the bottom until they cover the frame, the scene changes behind them, and they
 *  carry on out through the top. `at` is the cut. */
export const Wipe: React.FC<{ at: number }> = ({ at }) => {
  const f = useCurrentFrame();
  const cols = 8, w = 1080 / cols, IN = 12, OUT = 13;
  if (f < at - IN - cols || f > at + OUT + cols) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {Array.from({ length: cols }, (_, i) => {
        const lag = (i * 5) % cols;                                  // columns do not march left to right
        const cover = interpolate(f, [at - IN - lag * 0.9, at - lag * 0.2], [0, 1], { ...clamp, easing: R.ease.inOut });
        const leave = interpolate(f, [at + 1 + lag * 0.3, at + OUT + lag * 0.9], [0, 1], { ...clamp, easing: R.ease.inOut });
        const color = i % 3 === 0 ? R.navy : i % 2 === 0 ? R.yellow : R.red;
        return <div key={i} style={{ position: "absolute", left: i * w - 1, width: w + 2, bottom: `${leave * 100}%`, height: `${(cover - leave) * 100}%`, background: color }} />;
      })}
    </AbsoluteFill>
  );
};

/** White card on the paper. */
export const Card: React.FC<{ style?: React.CSSProperties; children: React.ReactNode }> = ({ style, children }) => (
  <div style={{ background: R.card, borderRadius: 34, border: `1px solid ${R.line}`, boxShadow: R.shadow, ...style }}>{children}</div>
);
export const Pill: React.FC<{ children: React.ReactNode; tone?: "ink" | "yellow" | "line"; size?: number }> = ({ children, tone = "line", size = 30 }) => (
  <span style={{ display: "inline-flex", alignItems: "center", fontFamily: FONT, fontSize: size, fontWeight: 560, lineHeight: 1, padding: `${size * 0.42}px ${size * 0.72}px`, borderRadius: 999,
    background: tone === "ink" ? R.ink : tone === "yellow" ? R.yellow : "rgba(255,255,255,0.75)", color: tone === "ink" ? "#fff" : R.ink, border: tone === "line" ? `1.5px solid ${R.line}` : "none" }}>{children}</span>
);
/** The two marks. The RDS logo is the member's own artwork with its white background cut away. */
export const RdsLogo: React.FC<{ width: number }> = ({ width }) => <Img src={staticFile("rds-logo.png")} style={{ width, height: "auto", display: "block" }} />;
export const JIcon: React.FC<{ size: number }> = ({ size }) => <Img src={staticFile("logo.png")} style={{ width: size, height: size, borderRadius: size * 0.235, display: "block", boxShadow: "0 18px 40px rgba(16,27,69,0.22)" }} />;

/** A tick drawn in ink (never an emoji). */
export const Check: React.FC<{ size?: number; color?: string; p?: number }> = ({ size = 44, color = R.green, p = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" fill={color} opacity={0.14} /><path d="M6.5 12.5l3.6 3.6 7.4-8" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} /></svg>
);
