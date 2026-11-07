import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { BgMesh, Finish } from "../components/Layers";
import { Body, Entrance, Headline, chromeText, clamp } from "../components/Motion";
import { FONT, MONO } from "../fonts";

/** The Android full-screen alert, recreated from activity_signal_alert.xml: New signal, headline, countdown, Open / Skip. */
export const CallScreen: React.FC = () => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const screenW = 700, screenH = Math.round((screenW * 844) / 390), bezel = 16;
  const rise = spring({ frame, fps, config: theme.spring.heavy });
  const shake = Math.sin(frame * 2.1) * 7 * Math.pow(Math.max(0, 1 - frame / 70), 2);
  const seconds = Math.max(0, 118 - Math.floor(frame / fps)); const mm = Math.floor(seconds / 60), ss = String(seconds % 60).padStart(2, "0");
  const press = spring({ frame: frame - 165, fps, config: theme.spring.snappy });
  const pressed = interpolate(press, [0, 0.5, 1], [1, 0.94, 1]);
  const openFlash = interpolate(frame, [168, 172, 190], [0, 0.35, 0], clamp);
  return (
    <AbsoluteFill>
      <BgMesh intensity={0.8} />
      <div style={{ position: "absolute", top: 150, left: 0, right: 0, textAlign: "center" }}>
        <Entrance delay={2}><Headline size={76} style={chromeText}>It rings like a call</Headline></Entrance>
        <Entrance delay={10}><Body size={38} style={{ marginTop: 14 }}>Lock screen, silent mode, any app. Full screen until you answer.</Body></Entrance>
      </div>
      <div style={{ position: "absolute", top: 420, left: "50%", transform: `translateX(-50%) translateY(${interpolate(rise, [0, 1], [160, 0])}px) translateX(${shake}px)`, opacity: rise, width: screenW + bezel * 2, height: screenH + bezel * 2, borderRadius: 88, background: "linear-gradient(180deg,#2a2a2e,#121214)", boxShadow: "0 60px 120px -30px rgba(0,0,0,0.8), inset 0 0 0 2px rgba(255,255,255,0.08)" }}>
        <div style={{ position: "absolute", inset: bezel, borderRadius: 72, overflow: "hidden", background: "#000", fontFamily: FONT, color: theme.colors.text }}>
          {[0, 1, 2].map((i) => { const t = ((frame + i * 20) % 60) / 60; return <div key={i} style={{ position: "absolute", left: "50%", top: 760, width: 300 + t * 520, height: 300 + t * 520, marginLeft: -(150 + t * 260), marginTop: -(150 + t * 260), borderRadius: "50%", border: "2px solid rgba(220,224,230,0.6)", opacity: (1 - t) * 0.35 }} />; })}
          <div style={{ position: "absolute", top: 130, left: 0, right: 0, textAlign: "center" }}>
            <Img src={staticFile("logo-mono.png")} style={{ width: 92, height: 92, opacity: 0.9 }} />
            <div style={{ marginTop: 30, fontSize: 36, color: theme.colors.textDim }}>New signal</div>
            <div style={{ marginTop: 22, fontSize: 84, fontWeight: 700, letterSpacing: -2 }}>XAUUSD · <span style={{ color: theme.colors.buy }}>BUY</span></div>
            <div style={{ marginTop: 18, fontSize: 29, letterSpacing: -0.6, color: theme.colors.chrome2, fontFamily: MONO, whiteSpace: "nowrap" }}>Entry 2341.50 · SL 2335.00 · TP 2355.00</div>
            <div style={{ marginTop: 140, fontSize: 136, fontWeight: 600, fontFamily: MONO, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{mm}:{ss}</div>
            <div style={{ marginTop: 12, fontSize: 30, color: theme.colors.textDim }}>until it expires</div>
          </div>
          <div style={{ position: "absolute", left: 60, right: 60, bottom: 90, display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ height: 116, borderRadius: 58, background: theme.chromeGradient, color: "#000", fontSize: 44, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${pressed})`, boxShadow: `0 0 ${60 * openFlash * 3}px rgba(220,224,230,${openFlash})` }}>Open</div>
            <div style={{ height: 116, borderRadius: 58, border: "2px solid #232326", color: theme.colors.text, fontSize: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>Skip</div>
          </div>
          <AbsoluteFill style={{ background: "#fff", opacity: openFlash * 0.5, pointerEvents: "none" }} />
        </div>
      </div>
      <Finish />
    </AbsoluteFill>
  );
};
