import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { BgMesh, Finish } from "../components/Layers";
import { Body, Entrance, Headline, chromeText, clamp } from "../components/Motion";
import { Phone } from "../components/Phone";
import { FONT, MONO } from "../fonts";

const PW = 600;                                   // phone screen width
const ROWS = [{ y: 0.479, at: 70 }, { y: 0.533, at: 92 }, { y: 0.588, at: 114 }];   // entry, SL, TP (fractions of the real screenshot)
const LOT = { y: 0.642, at: 160 };
const CAPTIONS = [{ text: "One card. Nothing to scroll.", at: 24, until: 68 }, { text: "Entry, SL and TP. Tap to copy.", at: 70, until: 158 }, { text: "Lot size from your balance and risk.", at: 160, until: 218 }, { text: "Swipe to take it. J keeps score.", at: 220, until: 400 }];

/** The real signal card, with copy highlights walking down the rows, then the swipe-to-take gesture. */
export const SignalDemo: React.FC = () => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const screenH = (PW * 844) / 390;
  const zoom = interpolate(frame, [0, 300], [1, 1.035], { ...clamp, easing: theme.ease.inOut });
  const swipe = spring({ frame: frame - 226, fps, config: theme.spring.heavy });
  const thumbX = interpolate(swipe, [0, 1], [0.118, 0.82]);
  const taken = spring({ frame: frame - 268, fps, config: theme.spring.snappy });
  return (
    <AbsoluteFill>
      <BgMesh />
      <div style={{ position: "absolute", top: 150, left: 0, right: 0, textAlign: "center" }}>
        <Entrance delay={4}><Headline size={76} style={{ ...chromeText }}>The signal card</Headline></Entrance>
      </div>
      <div style={{ position: "absolute", top: 290, left: "50%", transform: "translateX(-50%)" }}>
        <Entrance delay={8} config={theme.spring.heavy} rise={120}>
          <div style={{ transform: `scale(${zoom})`, transformOrigin: "center top" }}>
            <Phone src="ui/signal-live.png" width={PW}>
              {ROWS.map((r, i) => <RowGlow key={i} y={r.y} at={r.at} screenH={screenH} label="Copied" />)}
              <RowGlow y={LOT.y} at={LOT.at} screenH={screenH} label="0.15 lot" />
              <div style={{ position: "absolute", left: `${thumbX * 100}%`, top: screenH * 0.887, width: 96, height: 96, marginLeft: -48, marginTop: -48, borderRadius: 48, background: theme.chromeGradient, opacity: swipe > 0.01 ? 0.95 : 0, boxShadow: `0 0 ${40 * swipe}px rgba(220,224,230,0.5)` }} />
              <div style={{ position: "absolute", left: "50%", top: screenH * 0.887, transform: `translate(-50%, -50%) scale(${interpolate(taken, [0, 1], [0.6, 1])})`, opacity: taken, padding: "14px 34px", borderRadius: 999, background: "#000", border: `3px solid ${theme.colors.buy}`, color: theme.colors.buy, fontFamily: FONT, fontWeight: 600, fontSize: 34 }}>Taken</div>
            </Phone>
          </div>
        </Entrance>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1700, textAlign: "center", padding: "0 90px" }}>
        {CAPTIONS.map((c) => <div key={c.at} style={{ position: "absolute", left: 90, right: 90 }}><Entrance delay={c.at} exitAt={c.until} rise={28} config={theme.spring.snappy}><Body size={40} style={{ color: theme.colors.text }}>{c.text}</Body></Entrance></div>)}
      </div>
      <Finish />
    </AbsoluteFill>
  );
};

const RowGlow: React.FC<{ y: number; at: number; screenH: number; label: string }> = ({ y, at, screenH, label }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const p = spring({ frame: frame - at, fps, config: theme.spring.snappy });
  const fade = interpolate(frame, [at + 40, at + 60], [1, 0.45], clamp);
  return (
    <>
      <div style={{ position: "absolute", left: "4.3%", right: "4.3%", top: screenH * y, height: screenH * 0.046, borderRadius: 18, border: "3px solid rgba(220,224,230,0.9)", boxShadow: "0 0 30px rgba(220,224,230,0.35)", opacity: p * fade, transform: `scale(${interpolate(p, [0, 1], [1.08, 1])})` }} />
      <div style={{ position: "absolute", right: "9%", top: screenH * y + screenH * 0.046 / 2, transform: `translateY(-50%) translateX(${interpolate(p, [0, 1], [24, 0])}px)`, opacity: p * fade, padding: "8px 18px", borderRadius: 999, background: theme.colors.buy, color: "#000", fontFamily: MONO, fontWeight: 600, fontSize: 24 }}>{label}</div>
    </>
  );
};
