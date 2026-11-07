import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { theme } from "../theme";

/** Layer 1: never a flat black. Two slow chrome glows drift behind everything. */
export const BgMesh: React.FC<{ intensity?: number }> = ({ intensity = 1 }) => {
  const frame = useCurrentFrame();
  const d1 = Math.sin(frame / 60) * 60, d2 = Math.cos(frame / 75) * 50;
  return (
    <AbsoluteFill style={{ background: theme.colors.bg }}>
      <div style={{ position: "absolute", width: 1500, height: 1500, borderRadius: "50%", top: -700 + d2 * 0.4, left: -500 + d1, filter: "blur(90px)", background: `radial-gradient(circle, rgba(191,195,201,${0.16 * intensity}), transparent 62%)` }} />
      <div style={{ position: "absolute", width: 1200, height: 1200, borderRadius: "50%", bottom: -600, right: -450 - d2, filter: "blur(100px)", background: `radial-gradient(circle, rgba(110,114,121,${0.14 * intensity}), transparent 65%)` }} />
    </AbsoluteFill>
  );
};

/** Layer 4: grade, above content, below grain. Cool silver cast that unifies screenshots and type. */
export const Grade: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    <AbsoluteFill style={{ backgroundColor: "#9aa0a8", mixBlendMode: "soft-light", opacity: 0.14 }} />
    <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.18), transparent 26%, transparent 74%, rgba(0,0,0,0.28))" }} />
  </AbsoluteFill>
);

/** Layer 5a: procedural grain with flicker. */
export const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  const noise = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`;
  return <AbsoluteFill style={{ pointerEvents: "none", backgroundImage: noise, backgroundSize: "220px", backgroundPosition: `${(frame * 7) % 220}px ${(frame * 13) % 220}px`, opacity: 0.06, mixBlendMode: "overlay" }} />;
};

/** Layer 5b: vignette, topmost. */
export const Vignette: React.FC = () => <AbsoluteFill style={{ pointerEvents: "none", background: "radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,0.3) 100%)" }} />;

/** The top three layers, stacked once per scene. */
export const Finish: React.FC = () => (<><Grade /><Grain /><Vignette /></>);
