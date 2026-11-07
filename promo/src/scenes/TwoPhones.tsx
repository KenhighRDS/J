import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { BgMesh, Finish } from "../components/Layers";
import { Body, Entrance, Headline, chromeText } from "../components/Motion";
import { Phone } from "../components/Phone";
import { FONT } from "../fonts";

/** Android and iPhone side by side; the iPhone gets a push banner that re-arrives. */
export const TwoPhones: React.FC = () => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const banner = (at: number) => spring({ frame: frame - at, fps, config: theme.spring.snappy });
  const b1 = banner(40), b2 = banner(96);
  return (
    <AbsoluteFill>
      <BgMesh />
      <div style={{ position: "absolute", top: 170, left: 0, right: 0, textAlign: "center", padding: "0 70px" }}>
        <Entrance delay={2}><Headline size={80} style={chromeText}>Android rings.<br />iPhone pushes.</Headline></Entrance>
        <Entrance delay={10}><Body size={38} style={{ marginTop: 14 }}>And keeps pushing every 30 seconds until you open it.</Body></Entrance>
      </div>
      <div style={{ position: "absolute", top: 560, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 40 }}>
        <Entrance delay={6} config={theme.spring.heavy} rise={160}><div style={{ transform: "rotate(-4deg)" }}><Phone src="ui/signal-live.png" width={440} /></div></Entrance>
        <Entrance delay={14} config={theme.spring.heavy} rise={160}>
          <div style={{ transform: "rotate(4deg)" }}>
            <Phone src="ui/login.png" width={440}>
              {[b1, b2].map((b, i) => (
                <div key={i} style={{ position: "absolute", top: 60 + i * 0, left: 18, right: 18, opacity: b * (i === 0 ? interpolate(b2, [0, 1], [1, 0]) : 1), transform: `translateY(${interpolate(b, [0, 1], [-90, 0])}px)`, display: "flex", alignItems: "center", gap: 16, padding: "18px 20px", borderRadius: 26, background: "rgba(28,28,30,0.96)", boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }}>
                  <div style={{ width: 58, height: 58, borderRadius: 14, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}><Img src={staticFile("logo-mono.png")} style={{ width: 38, height: 38 }} /></div>
                  <div style={{ fontFamily: FONT, color: theme.colors.text, minWidth: 0 }}><div style={{ fontSize: 24, fontWeight: 600 }}>{i === 0 ? "XAUUSD · BUY" : "⏰ XAUUSD BUY — 1:04 left"}</div><div style={{ fontSize: 21, color: theme.colors.chrome2, marginTop: 2 }}>Entry 2341.50 · SL 2335.00 · TP 2355.00</div></div>
                  <div style={{ marginLeft: "auto", fontSize: 20, color: theme.colors.textDim }}>now</div>
                </div>
              ))}
            </Phone>
          </div>
        </Entrance>
      </div>
      <Finish />
    </AbsoluteFill>
  );
};
