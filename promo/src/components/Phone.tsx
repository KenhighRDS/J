import React from "react";
import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { theme } from "../theme";
import { clamp } from "./Motion";

/** A neutral phone body around a real 390×844 (3×) screenshot. `scrollTo` pans a taller screenshot vertically. */
export const Phone: React.FC<{ src: string; width?: number; scrollTo?: [number, number, number, number]; zoom?: number; children?: React.ReactNode; style?: React.CSSProperties }> = ({ src, width = 640, scrollTo, zoom = 1, children, style }) => {
  const frame = useCurrentFrame();
  const screenW = width, screenH = Math.round((width * 844) / 390), bezel = 16, radius = 72;
  const pan = scrollTo ? interpolate(frame, [scrollTo[0], scrollTo[1]], [scrollTo[2], scrollTo[3]], { ...clamp, easing: theme.ease.inOut }) : 0;
  return (
    <div style={{ position: "relative", width: screenW + bezel * 2, height: screenH + bezel * 2, borderRadius: radius + bezel, background: "linear-gradient(180deg,#2a2a2e,#121214)", boxShadow: "0 60px 120px -30px rgba(0,0,0,0.8), inset 0 0 0 2px rgba(255,255,255,0.08)", ...style }}>
      <div style={{ position: "absolute", inset: bezel, borderRadius: radius, overflow: "hidden", background: "#000" }}>
        <Img src={staticFile(src)} style={{ width: screenW, display: "block", transform: `translateY(${-pan}px) scale(${zoom})`, transformOrigin: "top center" }} />
        <div style={{ position: "absolute", top: 18, left: "50%", transform: "translateX(-50%)", width: 118, height: 34, borderRadius: 20, background: "#000" }} />
        {children}
      </div>
    </div>
  );
};
