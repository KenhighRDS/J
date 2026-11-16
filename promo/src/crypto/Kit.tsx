// The RDS Academy × J crypto video has its own look: a night sky, because this market never closes. Deep navy, one
// gold (the RDS yellow) for the coin and for the thing to look at, the RDS logo on a moon because its lettering is
// dark, and the J app itself on a phone. The moving motif is a ping: a ring spreading from a point, as on a radar; the
// cut between scenes is the same ring closing and opening like an aperture. Headlines in Bricolage Grotesque, figures
// in the app's mono. Every colour, easing and spring lives in N below.
import React from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT, GROT, MONO } from "../fonts";

export const N = {
  night: "#050818", deep: "#0A1030", lens: "#03051A", panel: "rgba(16,25,62,0.86)", panelSolid: "#101A40", panelHi: "#1A2658",
  text: "#EEF1FA", soft: "rgba(238,241,250,0.70)", faint: "rgba(238,241,250,0.44)", line: "rgba(238,241,250,0.13)", hair: "rgba(238,241,250,0.07)",
  gold: "#F6C20A", goldHi: "#FFE584", goldDeep: "#B98300", goldInk: "#3B2A00", goldGlow: "rgba(246,194,10,0.40)", goldVeil: "rgba(246,194,10,0.26)",
  moon: "#F4F0E3", moonHi: "#FFFDF5", moonLow: "#D6CFB9", moonGlow: "rgba(244,240,227,0.22)",
  blue: "#3D7BFF", green: "#35D08A", red: "#FF5D52", phone: "#0B0D16", phoneEdge: "rgba(255,255,255,0.30)", dot: "#93A6EC", black: "#000000",
  nebula: ["rgba(61,123,255,0.21)", "rgba(246,194,10,0.10)", "rgba(112,96,235,0.11)"],
  grade: "linear-gradient(180deg, rgba(61,123,255,0.08) 0%, transparent 38%, transparent 66%, rgba(246,194,10,0.05) 100%)",
  vignette: "radial-gradient(120% 86% at 50% 46%, transparent 54%, rgba(2,3,12,0.62) 100%)",
  shadow: "0 30px 70px rgba(0,0,0,0.50), 0 4px 14px rgba(0,0,0,0.35)",
  ease: { out: Easing.bezier(0.16, 1, 0.3, 1), inOut: Easing.bezier(0.83, 0, 0.17, 1), in: Easing.bezier(0.7, 0, 0.84, 0), glide: Easing.bezier(0.45, 0, 0.55, 1) },
  spring: { snappy: { damping: 15, stiffness: 170, mass: 0.6 }, smooth: { damping: 20, stiffness: 95, mass: 1 }, bouncy: { damping: 11, stiffness: 160, mass: 0.7 }, heavy: { damping: 26, stiffness: 70, mass: 1.1 } },
} as const;
export const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
export const SIDE = 84;                 // left / right page margin
export { FONT, GROT, MONO };
export const grot = (size: number, color: string = N.text): React.CSSProperties => ({ fontFamily: GROT, fontSize: size, fontWeight: 700, fontStretch: "94%", fontVariationSettings: "'opsz' 96", color, letterSpacing: -size * 0.012, lineHeight: 1.04 });
export const sans = (size: number, weight = 450, color: string = N.text): React.CSSProperties => ({ fontFamily: FONT, fontSize: size, fontWeight: weight, color, lineHeight: 1.27 });
export const mono = (size: number, color: string = N.text): React.CSSProperties => ({ fontFamily: MONO, fontSize: size, fontWeight: 600, color, letterSpacing: -size * 0.02, fontVariantNumeric: "tabular-nums" });

/** Quiet by design: files peak at -12 dBFS and play at a fraction of that. Each starts two frames before its picture. */
const MASTER = 1.5;
export const Sfx: React.FC<{ at: number; file: string; volume?: number }> = ({ at, file, volume = 0.4 }) => (
  <Sequence from={Math.max(0, at - 2)} layout="none"><Audio src={staticFile(`sfx-crypto/${file}`)} volume={Math.min(1, volume * MASTER)} /></Sequence>
);

const STARS = Array.from({ length: 104 }, (_, i) => ({ x: random(`sx${i}`) * 1080, y: random(`sy${i}`) * 1920, r: 1.1 + random(`sr${i}`) * 2.5, tw: 15 + random(`st${i}`) * 36, ph: random(`sp${i}`) * 6.28, depth: 0.3 + random(`sd${i}`) * 0.7 }));
const ORBITS = [{ rx: 780, ry: 300, tilt: -24, spin: 0.021, period: 300, cy: 900 }, { rx: 1010, ry: 430, tilt: 32, spin: -0.016, period: 430, cy: 1040 }];
/** Layer 1: the night. A slow three-tone mesh, stars that twinkle and drift at different depths, two tilted orbits. */
export const Night: React.FC = () => {
  const f = useCurrentFrame();
  const a = Math.sin(f / 110) * 7, b = Math.cos(f / 140) * 6;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${N.deep} 0%, ${N.night} 46%, ${N.deep} 100%)`, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: `radial-gradient(58% 36% at ${20 + a}% ${14 + b}%, ${N.nebula[0]} 0%, transparent 70%), radial-gradient(52% 34% at ${86 - a}% ${84 - b}%, ${N.nebula[1]} 0%, transparent 72%), radial-gradient(46% 30% at ${64 + b}% ${44 + a}%, ${N.nebula[2]} 0%, transparent 70%)` }} />
      {STARS.map((s, i) => {
        const y = (((s.y - f * 0.17 * s.depth) % 1920) + 1920) % 1920;
        return <div key={i} style={{ position: "absolute", left: s.x, top: y, width: s.r * 2, height: s.r * 2, borderRadius: "50%", background: N.text, opacity: (0.16 + 0.6 * (0.5 + 0.5 * Math.sin(f / s.tw + s.ph))) * s.depth }} />;
      })}
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        {ORBITS.map((o, i) => {
          const t = (f / o.period) * 2 * Math.PI + i * 2;
          return (
            <g key={i} transform={`rotate(${o.tilt + f * o.spin} 540 ${o.cy})`}>
              <ellipse cx={540} cy={o.cy} rx={o.rx} ry={o.ry} fill="none" stroke={N.hair} strokeWidth={2} />
              <circle cx={540 + Math.cos(t) * o.rx} cy={o.cy + Math.sin(t) * o.ry} r={5} fill={N.text} opacity={0.5} />
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
/** Layers 4 and 5: a cool-to-warm grade, fine grain and a vignette over everything. */
export const Finish: React.FC = () => (
  <>
    <AbsoluteFill style={{ background: N.grade, mixBlendMode: "screen", pointerEvents: "none" }} />
    <AbsoluteFill style={{ opacity: 0.1, mixBlendMode: "screen", pointerEvents: "none", backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='11'/><feColorMatrix values='0 0 0 0 0.86  0 0 0 0 0.9  0 0 0 0 1  0 0 0 0.6 0'/></filter><rect width='180' height='180' filter='url(%23n)'/></svg>\")" }} />
    <AbsoluteFill style={{ background: N.vignette, pointerEvents: "none" }} />
  </>
);

/** Springs in with opacity, rise and scale together; leaves faster than it came; once landed it never sits dead still. */
export const Rise: React.FC<{ at: number; until?: number; rise?: number; from?: number; config?: { damping: number; stiffness: number; mass: number }; float?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ at, until, rise = 46, from = 0.94, config = N.spring.smooth, float = 2.6, style, children }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const p = spring({ frame: f - at, fps, config });
  const exit = until == null ? 0 : interpolate(f, [until, until + 9], [0, 1], { ...clamp, easing: N.ease.in });
  if (f < at) return null;
  const idle = Math.sin((f - at) / 27 + at) * float * p;
  return <div style={{ opacity: Math.min(1, p * 1.4) * (1 - exit), transform: `translateY(${(1 - p) * rise - exit * 34 + idle}px) scale(${interpolate(p, [0, 1], [from, 1]) * (1 - exit * 0.04)})`, ...style }}>{children}</div>;
};

/** Headline: each word rises out of a mask a few frames after the last. A word written *like this* is the gold one,
 *  and a lone "/" starts a new line. */
export const Head: React.FC<{ text: string; at: number; until?: number; size?: number; top: number; align?: "left" | "center" }> = ({ text, at, until, size = 112, top, align = "left" }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const exit = until == null ? 0 : interpolate(f, [until, until + 9], [0, 1], { ...clamp, easing: N.ease.in });
  return (
    <div style={{ position: "absolute", top, left: SIDE, right: SIDE, display: "flex", flexWrap: "wrap", justifyContent: align === "center" ? "center" : "flex-start", columnGap: size * 0.22, rowGap: 0, opacity: 1 - exit, transform: `translateY(${-exit * 26}px)` }}>
      {text.split(" ").map((raw, i) => {
        if (raw === "/") return <span key={i} style={{ flexBasis: "100%", height: 0 }} />;
        const m = /^\*(.+?)\*(.*)$/.exec(raw);
        const p = spring({ frame: f - at - i * 4, fps, config: N.spring.smooth });
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", paddingBottom: size * 0.18, marginBottom: -size * 0.18, paddingRight: size * 0.03 }}>
            <span style={{ ...grot(size), display: "inline-block", transform: `translateY(${(1 - p) * 108}%) rotate(${(1 - p) * 3}deg)`, transformOrigin: "0% 100%", opacity: Math.min(1, p * 1.6) }}>
              {m ? <><span style={{ color: N.gold }}>{m[1]}</span>{m[2]}</> : raw}
            </span>
          </span>
        );
      })}
    </div>
  );
};
/** Plain caption under a headline. */
export const Sub: React.FC<{ text: string; at: number; until?: number; top: number; size?: number; align?: "left" | "center"; color?: string }> = ({ text, at, until, top, size = 44, align = "left", color = N.soft }) => (
  <div style={{ position: "absolute", top, left: SIDE, right: SIDE, textAlign: align }}>
    <Rise at={at} until={until} rise={26} from={0.98} float={1.4}><div style={{ ...sans(size, 450, color), lineHeight: 1.3, textWrap: "balance" }}>{text}</div></Rise>
  </div>
);

/** The motif: rings spreading from a point and fading, a few frames apart. */
export const Ping: React.FC<{ at: number; x: number; y: number; r?: number; dur?: number; color?: string; width?: number; count?: number }> = ({ at, x, y, r = 520, dur = 34, color = N.gold, width = 4, count = 2 }) => {
  const f = useCurrentFrame();
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const p = interpolate(f, [at + i * 8, at + i * 8 + dur], [0, 1], { ...clamp, easing: N.ease.out });
        if (p <= 0 || p >= 1) return null;
        const rad = r * p;
        return <div key={i} style={{ position: "absolute", left: x - rad, top: y - rad, width: rad * 2, height: rad * 2, borderRadius: "50%", border: `${width}px solid ${color}`, opacity: Math.pow(1 - p, 1.5) * 0.85, pointerEvents: "none" }} />;
      })}
    </>
  );
};

/** Between scenes: a gold ring closes over the old scene from the centre, then the same ring opens on the new one.
 *  `at` is the cut; the frame before it and the frame of it are fully covered. */
export const Aperture: React.FC<{ at: number; x?: number; y?: number }> = ({ at, x = 540, y = 960 }) => {
  const f = useCurrentFrame();
  const IN = 14, OUT = 18, R = 1190;
  if (f < at - IN || f > at + OUT) return null;
  if (f < at) {
    const r = interpolate(f, [at - IN, at - 1], [0, R], { ...clamp, easing: N.ease.inOut });
    return (
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: "50%", background: N.lens, border: `5px solid ${N.gold}`, boxSizing: "border-box", boxShadow: `0 0 46px ${N.goldGlow}` }} />
      </AbsoluteFill>
    );
  }
  const r = interpolate(f, [at, at + OUT], [0, R], { ...clamp, easing: N.ease.out });
  const mask = `radial-gradient(circle at ${x}px ${y}px, transparent ${r}px, #000 ${r + 2}px)`;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ background: N.lens, WebkitMaskImage: mask, maskImage: mask }} />
      <div style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: "50%", border: `5px solid ${N.gold}`, boxSizing: "border-box", boxShadow: `0 0 46px ${N.goldGlow}`, opacity: 1 - r / R }} />
    </AbsoluteFill>
  );
};

/** A coin, flat and struck: gold when it is the one to look at, dim otherwise. `turn` flips it about its upright axis. */
export const Coin: React.FC<{ size: number; label?: string; turn?: number; tone?: "gold" | "dim" | "pale"; glow?: number }> = ({ size, label, turn = 0, tone = "gold", glow = 0 }) => {
  const c = Math.cos(turn), gold = tone === "gold";
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", transform: `scaleX(${Math.max(0.05, Math.abs(c))})`, filter: `brightness(${0.72 + 0.28 * Math.abs(c)})`,
      background: gold ? `radial-gradient(circle at 34% 28%, ${N.goldHi} 0%, ${N.gold} 46%, ${N.goldDeep} 100%)` : tone === "pale" ? N.dot : N.panelHi, border: gold || tone === "pale" ? "none" : `1.5px solid ${N.line}`,
      boxShadow: gold ? `0 0 ${60 * glow}px ${N.goldGlow}, 0 ${size * 0.06}px ${size * 0.16}px rgba(0,0,0,0.45)` : "none", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
      <div style={{ position: "absolute", inset: size * 0.085, borderRadius: "50%", border: `${Math.max(1.5, size * 0.014)}px solid ${gold ? "rgba(59,42,0,0.30)" : tone === "pale" ? "rgba(5,8,24,0.28)" : N.line}` }} />
      {label && <span style={{ ...mono(size * 0.23, gold ? N.goldInk : N.soft), fontWeight: 700 }}>{label}</span>}
    </div>
  );
};

/** The moon carries the RDS Academy logo (the member's own artwork, untouched: its dark lettering needs a light ground). */
export const Moon: React.FC<{ size: number; logo?: number }> = ({ size, logo = 1 }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", background: `radial-gradient(circle at 36% 30%, ${N.moonHi} 0%, ${N.moon} 58%, ${N.moonLow} 100%)`, boxShadow: `0 0 ${size * 0.3}px ${N.moonGlow}, 0 0 ${size * 0.08}px ${N.moonGlow}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <Img src={staticFile("rds-logo.png")} style={{ width: size * 0.74, height: "auto", display: "block", opacity: logo, transform: `translateX(${size * 0.012}px)` }} />
  </div>
);
export const JIcon: React.FC<{ size: number }> = ({ size }) => <Img src={staticFile("logo.png")} style={{ width: size, height: size, borderRadius: size * 0.235, display: "block", boxShadow: `0 18px 44px rgba(0,0,0,0.55), 0 0 0 1.5px ${N.line}` }} />;

/** A phone holding the real app. Children are laid out in the app's own units (390 wide, 844 tall under the status
 *  bar) and scaled to the phone's width, so a captured screen and anything drawn over it line up exactly. */
export const STATUS = 40;
export const Phone: React.FC<{ width: number; children: React.ReactNode }> = ({ width, children }) => {
  const bezel = width * 0.028, sw = width - bezel * 2, k = sw / 390;
  return (
    <div style={{ width, padding: bezel, borderRadius: width * 0.135, background: N.phone, border: `2px solid ${N.phoneEdge}`, boxShadow: `${N.shadow}, 0 0 90px rgba(61,123,255,0.16)`, boxSizing: "border-box" }}>
      <div style={{ position: "relative", width: sw, height: (844 + STATUS) * k, borderRadius: width * 0.11, overflow: "hidden", background: N.black }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 390, height: 844 + STATUS, transform: `scale(${k})`, transformOrigin: "0 0" }}>
          <div style={{ position: "absolute", left: 0, top: STATUS, width: 390, height: 844, overflow: "hidden" }}>{children}</div>
          <div style={{ position: "absolute", left: 0, top: 0, width: 390, height: STATUS, background: N.black }}>
            <div style={{ position: "absolute", left: 150, top: 10, width: 90, height: 24, borderRadius: 14, background: N.phone, border: `1px solid ${N.hair}` }} />
            <span style={{ position: "absolute", left: 28, top: 11, ...sans(14, 600, N.text), lineHeight: 1.3 }}>9:41</span>
          </div>
        </div>
      </div>
    </div>
  );
};
/** A captured screen inside the phone, scrolled by `scroll` app units. Never perfectly still: it creeps a little. */
export const Screen: React.FC<{ src: string; scroll?: number; opacity?: number; x?: number }> = ({ src, scroll = 0, opacity = 1, x = 0 }) => {
  const f = useCurrentFrame();
  return <Img src={staticFile(`ui/crypto/${src}`)} style={{ position: "absolute", left: 0, top: 0, width: 390, height: "auto", display: "block", opacity, transform: `translate(${x}px, ${-scroll + Math.sin(f / 40) * 1.2}px)` }} />;
};

/** Dark panel. */
export const Card: React.FC<{ style?: React.CSSProperties; children: React.ReactNode }> = ({ style, children }) => (
  <div style={{ background: N.panel, borderRadius: 34, border: `1.5px solid ${N.line}`, boxShadow: N.shadow, ...style }}>{children}</div>
);
export const Pill: React.FC<{ children: React.ReactNode; tone?: "gold" | "line" | "solid"; size?: number }> = ({ children, tone = "line", size = 30 }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: size * 0.4, ...sans(size, 560, tone === "gold" ? N.goldInk : N.text), lineHeight: 1, padding: `${size * 0.44}px ${size * 0.74}px`, borderRadius: 999,
    background: tone === "gold" ? N.gold : tone === "solid" ? N.panelSolid : "rgba(16,25,62,0.6)", border: tone === "gold" ? "none" : `1.5px solid ${N.line}` }}>{children}</span>
);
/** A tick that draws itself (never an emoji). */
export const Check: React.FC<{ size?: number; color?: string; p?: number }> = ({ size = 44, color = N.gold, p = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" fill={color} opacity={0.16} /><path d="M6.5 12.5l3.6 3.6 7.4-8" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} /></svg>
);
