import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { BgMesh, Finish } from "../components/Layers";
import { chromeText, clamp } from "../components/Motion";
import { FONT } from "../fonts";

const LINES: { rows: string[][]; at: number }[] = [
  { rows: [["I", "call", "it."]], at: 0 },
  { rows: [["Your", "phone", "rings."]], at: 48 },
  { rows: [["You", "copy."], ["You", "trade."]], at: 96 },
];

/** Kinetic typography: each line slams in word by word; earlier lines step back as the next arrives. */
export const Hook: React.FC = () => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <BgMesh />
      <AbsoluteFill style={{ justifyContent: "center", padding: "0 96px", gap: 34 }}>
        {LINES.map((line, li) => {
          const next = LINES[li + 1]?.at;
          const dim = next == null ? 0 : interpolate(frame, [next, next + 14], [0, 1], { ...clamp, easing: theme.ease.out });
          return (
            <div key={li} style={{ display: "flex", flexDirection: "column", gap: 6, opacity: 1 - dim * 0.72, transform: `translateX(${-dim * 10}px) scale(${1 - dim * 0.06})`, transformOrigin: "left center" }}>
              {line.rows.map((row, ri) => (
                <div key={ri} style={{ display: "flex", columnGap: 26 }}>
                  {row.map((w, wi) => {
                    const idx = line.rows.slice(0, ri).reduce((a, r) => a + r.length, 0) + wi;
                    const p = spring({ frame: frame - line.at - idx * 4, fps, config: theme.spring.bouncy });
                    const x = interpolate(p, [0, 1], [idx % 2 ? 70 : -70, 0]), sc = interpolate(p, [0, 1], [1.6, 1]);
                    const hero = li === 2 && ri === 1 && wi === 1;
                    return <span key={wi} style={{ display: "inline-block", fontFamily: FONT, fontWeight: 800, fontSize: 112, letterSpacing: -4.5, lineHeight: 1, opacity: p, transform: `translateX(${x}px) scale(${sc})`, ...(hero ? chromeText : { color: theme.colors.text }), filter: hero ? `drop-shadow(0 0 ${28 * p}px rgba(220,224,230,0.35))` : undefined }}>{w}</span>;
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </AbsoluteFill>
      <Finish />
    </AbsoluteFill>
  );
};
