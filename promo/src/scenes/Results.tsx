import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { BgMesh, Finish } from "../components/Layers";
import { Body, Entrance, Headline, chromeText, clamp } from "../components/Motion";
import { Phone } from "../components/Phone";
import { FONT, MONO } from "../fonts";

/** Payoff: the pips count up, the closed card shows Taken, then the share card slides in. */
export const Results: React.FC = () => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const count = interpolate(spring({ frame: frame - 20, fps, config: { damping: 30, stiffness: 50, mass: 1 } }), [0, 1], [0, 135]);
  const phoneOut = interpolate(frame, [138, 154], [0, 1], { ...clamp, easing: theme.ease.in });
  const cardIn = spring({ frame: frame - 146, fps, config: theme.spring.heavy });
  const kb = interpolate(frame, [146, 252], [1, 1.06], { ...clamp, easing: theme.ease.inOut });
  return (
    <AbsoluteFill>
      <BgMesh />
      <div style={{ position: "absolute", top: 170, left: 0, right: 0, textAlign: "center" }}>
        <Entrance delay={20} exitAt={140}>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 210, letterSpacing: -8, lineHeight: 1, fontVariantNumeric: "tabular-nums", ...chromeText }}>+{Math.round(count)}</div>
          <Body size={46} style={{ color: theme.colors.chrome2, marginTop: 6 }}>pips · TP hit</Body>
        </Entrance>
        <Entrance delay={150}><Headline size={80} style={chromeText}>Share the numbers</Headline></Entrance>
        <Entrance delay={158}><Body size={38} style={{ marginTop: 14 }}>Results, weekly reports and backtests as cards. One tap.</Body></Entrance>
      </div>
      <div style={{ position: "absolute", top: 560, left: "50%", transform: `translateX(-50%) translateY(${phoneOut * 120}px)`, opacity: 1 - phoneOut }}>
        <Entrance delay={16} config={theme.spring.heavy} rise={140}>
          <Phone src="ui/signal-closed.png" width={560} zoom={1.02} />
        </Entrance>
      </div>
      <div style={{ position: "absolute", top: 640, left: "50%", width: 860, marginLeft: -430, opacity: cardIn, transform: `translateY(${interpolate(cardIn, [0, 1], [220, 0])}px) scale(${interpolate(cardIn, [0, 1], [0.92, 1]) * kb}) rotate(${interpolate(cardIn, [0, 1], [-4, 0])}deg)`, transformOrigin: "center", borderRadius: 40, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 60px 120px -30px rgba(0,0,0,0.75)" }}>
        <Img src={staticFile("ui/backtest-card.png")} style={{ width: 860, display: "block" }} />
      </div>
      <Finish />
    </AbsoluteFill>
  );
};
