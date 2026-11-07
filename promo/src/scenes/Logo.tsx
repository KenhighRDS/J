import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { BgMesh, Finish } from "../components/Layers";
import { WordReveal, clamp, useBreathe } from "../components/Motion";
import { FONT } from "../fonts";

/** Sting: mark in (bouncy), glow settles, tagline words rise, breathe. */
export const Logo: React.FC = () => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: theme.spring.bouncy });
  const rot = interpolate(p, [0, 1], [-14, 0]);
  const glow = interpolate(frame, [10, 30, 70], [0, 1, 0.35], { ...clamp, easing: theme.ease.out });
  const b = useBreathe(26, 0.01);
  return (
    <AbsoluteFill>
      <BgMesh intensity={1.2} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", opacity: p, transform: `scale(${interpolate(p, [0, 1], [0.55, 1]) * b.scale}) rotate(${rot}deg) translateY(${b.y - 120}px)` }}>
          <div style={{ position: "absolute", inset: -140, borderRadius: "50%", background: `radial-gradient(circle, rgba(220,224,230,${0.42 * glow}) 0%, rgba(220,224,230,${0.12 * glow}) 35%, transparent 65%)`, filter: "blur(30px)" }} />
          <Img src={staticFile("logo-alpha.png")} style={{ width: 620, height: 620, display: "block", position: "relative" }} />
        </div>
        <div style={{ position: "absolute", top: 1230, left: 0, right: 0, padding: "0 50px" }}>
          <WordReveal text="Trade signals, delivered like a call." delay={34} per={3} style={{ fontFamily: FONT, fontWeight: 500, fontSize: 50, letterSpacing: -1.2, color: theme.colors.chrome2, justifyContent: "center", textAlign: "center" }} />
        </div>
      </AbsoluteFill>
      <Finish />
    </AbsoluteFill>
  );
};
