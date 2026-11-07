import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { BgMesh, Finish } from "../components/Layers";
import { Body, Entrance, Headline, chromeText } from "../components/Motion";
import { FONT, MONO } from "../fonts";

const CARDS = [
  { at: 34, title: "Move SL to breakeven", body: "XAUUSD BUY · SL → 2341.50", tone: theme.colors.text },
  { at: 74, title: "Partial close", body: "Close half · 0.07 of 0.15", tone: theme.colors.text },
  { at: 114, title: "Close now", body: "XAUUSD BUY at 2355.00 · +135 pips", tone: theme.colors.buy },
];

/** Follow-up alerts stack in as notification cards; each one rings on the phone the same way. */
export const FollowUps: React.FC = () => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <BgMesh />
      <div style={{ position: "absolute", top: 230, left: 0, right: 0, textAlign: "center", padding: "0 80px" }}>
        <Entrance delay={2}><Headline size={88} style={chromeText}>The EA keeps talking</Headline></Entrance>
        <Entrance delay={12}><Body size={38} style={{ marginTop: 18 }}>Every change in the trade reaches your phone as a call.</Body></Entrance>
      </div>
      <div style={{ position: "absolute", top: 720, left: 72, right: 72, display: "flex", flexDirection: "column", gap: 28 }}>
        {CARDS.map((c, i) => {
          const p = spring({ frame: frame - c.at, fps, config: theme.spring.snappy });
          const settle = interpolate(frame, [c.at + 30, c.at + 44], [1, 0.82], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: theme.ease.out });
          const isLast = i === CARDS.length - 1;
          return (
            <div key={i} style={{ opacity: p, transform: `translateX(${interpolate(p, [0, 1], [140, 0])}px) scale(${interpolate(p, [0, 1], [0.9, 1])})`, display: "flex", alignItems: "center", gap: 26, padding: "30px 34px", borderRadius: 30, background: "rgba(20,20,22,0.92)", border: `2px solid ${isLast ? "rgba(47,191,113,0.5)" : theme.colors.border}`, boxShadow: isLast ? `0 0 ${50 * p}px rgba(47,191,113,0.18)` : "0 30px 60px -30px rgba(0,0,0,0.7)", filter: `brightness(${isLast ? 1 : settle})` }}>
              <div style={{ width: 92, height: 92, borderRadius: 24, background: "#000", border: `1px solid ${theme.colors.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Img src={staticFile("logo-mono.png")} style={{ width: 60, height: 60 }} /></div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 42, color: c.tone, letterSpacing: -0.5 }}>{c.title}</div>
                <div style={{ fontFamily: MONO, fontSize: 30, color: theme.colors.chrome2, marginTop: 8 }}>{c.body}</div>
              </div>
              <div style={{ marginLeft: "auto", fontFamily: FONT, fontSize: 26, color: theme.colors.textDim, flexShrink: 0 }}>now</div>
            </div>
          );
        })}
      </div>
      <Finish />
    </AbsoluteFill>
  );
};
