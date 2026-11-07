import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { theme } from "../theme";
import { BgMesh, Finish } from "../components/Layers";
import { Body, Entrance, Headline, chromeText, clamp } from "../components/Motion";
import { Phone } from "../components/Phone";

/** The Wann gallery scrolling through a week of calls. */
export const Wann: React.FC = () => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, 250], [1.0, 1.03], { ...clamp, easing: theme.ease.inOut });
  return (
    <AbsoluteFill>
      <BgMesh />
      <div style={{ position: "absolute", top: 150, left: 0, right: 0, textAlign: "center", padding: "0 80px" }}>
        <Entrance delay={2}><Headline size={80} style={chromeText}>Football calls, 90%+</Headline></Entrance>
        <Entrance delay={10}><Body size={38} style={{ marginTop: 14 }}>A week of games above your line, one gallery, every result scored.</Body></Entrance>
      </div>
      <div style={{ position: "absolute", top: 440, left: "50%", transform: `translateX(-50%) scale(${zoom})`, transformOrigin: "center top" }}>
        <Entrance delay={6} config={theme.spring.heavy} rise={140}>
          <Phone src="ui/wann-tall.png" width={620} scrollTo={[40, 230, 0, 1500]} />
        </Entrance>
      </div>
      <Finish />
    </AbsoluteFill>
  );
};
