import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { FONT } from "../fonts";

export const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

/** Premium entrance: opacity + rise + scale on a spring, with an optional faster exit. */
export const Entrance: React.FC<{ delay?: number; exitAt?: number; rise?: number; config?: { damping: number; stiffness: number; mass: number }; style?: React.CSSProperties; children: React.ReactNode }> = ({ delay = 0, exitAt, rise = 46, config = theme.spring.smooth, style, children }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config });
  const out = exitAt == null ? 0 : interpolate(frame, [exitAt, exitAt + 10], [0, 1], { ...clamp, easing: theme.ease.in });
  return (
    <div style={{ opacity: p * (1 - out), transform: `translateY(${interpolate(p, [0, 1], [rise, 0]) - out * 40}px) scale(${interpolate(p, [0, 1], [0.94, 1])})`, ...style }}>{children}</div>
  );
};

/** Word-by-word reveal; words rise on a snappy spring with a short stagger. */
export const WordReveal: React.FC<{ text: string; delay?: number; per?: number; exitAt?: number; style?: React.CSSProperties; chrome?: boolean }> = ({ text, delay = 0, per = 3, exitAt, style, chrome }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const out = exitAt == null ? 0 : interpolate(frame, [exitAt, exitAt + 9], [0, 1], { ...clamp, easing: theme.ease.in });
  return (
    <div style={{ display: "flex", flexWrap: "wrap", columnGap: "0.24em", rowGap: "0.02em", opacity: 1 - out, transform: `translateY(${-out * 30}px)`, ...style }}>
      {text.split(" ").map((word, i) => {
        const p = spring({ frame: frame - delay - i * per, fps, config: theme.spring.snappy });
        return <span key={i} style={{ display: "inline-block", opacity: p, transform: `translateY(${interpolate(p, [0, 1], [34, 0])}px)`, ...(chrome ? chromeText : {}) }}>{word}</span>;
      })}
    </div>
  );
};

/** The app's chrome text: gradient clipped to the glyphs. */
export const chromeText: React.CSSProperties = { backgroundImage: theme.chromeGradient, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" };

export const Headline: React.FC<{ children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({ children, size = 104, style }) => (
  <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: size, letterSpacing: -size * 0.035, lineHeight: 1.02, ...style }}>{children}</div>
);
export const Body: React.FC<{ children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({ children, size = 40, style }) => (
  <div style={{ fontFamily: FONT, fontWeight: 400, fontSize: size, lineHeight: 1.3, color: theme.colors.textDim, ...style }}>{children}</div>
);

/** Idle breathing for anything on screen longer than two seconds. */
export const useBreathe = (period = 24, amount = 0.012) => { const f = useCurrentFrame(); return { scale: 1 + Math.sin(f / period) * amount, y: Math.sin(f / (period * 1.3)) * 3 }; };
