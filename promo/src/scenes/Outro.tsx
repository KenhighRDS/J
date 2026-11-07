import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { BgMesh, Finish } from "../components/Layers";
import { WordReveal, clamp, useBreathe } from "../components/Motion";
import { FONT } from "../fonts";

/** Close: mark, one line, breathe, fade to black. */
export const Outro: React.FC = () => {
  const frame = useCurrentFrame(); const { fps, durationInFrames } = useVideoConfig();
  const p = spring({ frame, fps, config: theme.spring.bouncy });
  const b = useBreathe(26, 0.012);
  const fade = interpolate(frame, [durationInFrames - 18, durationInFrames - 2], [1, 0], { ...clamp, easing: theme.ease.in });
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <BgMesh intensity={1.1} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", opacity: p, transform: `scale(${interpolate(p, [0, 1], [0.6, 1]) * b.scale}) rotate(${interpolate(p, [0, 1], [10, 0])}deg) translateY(${b.y - 100}px)` }}>
          <div style={{ position: "absolute", inset: -120, borderRadius: "50%", background: "radial-gradient(circle, rgba(220,224,230,0.3) 0%, rgba(220,224,230,0.08) 38%, transparent 65%)", filter: "blur(30px)" }} />
          <Img src={staticFile("logo.png")} style={{ width: 560, height: 560, display: "block", position: "relative", mixBlendMode: "screen" }} />
        </div>
        <div style={{ position: "absolute", top: 1230, left: 0, right: 0, padding: "0 100px" }}>
          <WordReveal text="J. Invite only." delay={26} per={4} style={{ fontFamily: FONT, fontWeight: 600, fontSize: 64, letterSpacing: -1.5, color: theme.colors.chrome2, justifyContent: "center" }} />
          <WordReveal text="Ask the admin for yours." delay={48} per={3} style={{ fontFamily: FONT, fontWeight: 400, fontSize: 38, color: theme.colors.textDim, justifyContent: "center", marginTop: 20 }} />
        </div>
      </AbsoluteFill>
      <Finish />
    </AbsoluteFill>
  );
};
