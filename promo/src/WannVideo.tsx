// "J × Wann": the Wann partnership in J, and how to take a call on Kalshi. Pitch style, mowing wipes, quiet SFX, no music.
import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { Pitch, Sfx, mow } from "./wann/Kit";
import { KALSHI_LEN, WAlert, WCall, WCopy, WDraw, WEnd, WGallery, WIntro, WKalshi, WRating, WResults, WSwipe } from "./wann/Scenes";

const T = 16;
const SCENES: [React.FC, number][] = [[WIntro, 120], [WRating, 120], [WAlert, 150], [WGallery, 186], [WCall, 165], [WCopy, 105], [WKalshi, KALSHI_LEN], [WDraw, 150], [WSwipe, 135], [WResults, 135], [WEnd, 120]];
export const WANN_TOTAL = SCENES.reduce((a, [, d]) => a + d, 0);
const starts = SCENES.map((_, i) => SCENES.slice(0, i).reduce((a, [, d]) => a + d, 0));
const timing = linearTiming({ durationInFrames: T }); const MOW = mow();

export const JWann: React.FC = () => (
  <AbsoluteFill style={{ background: "#0B2E1C" }}>
    <Pitch />
    <TransitionSeries>
      {SCENES.flatMap(([Scene, d], i) => [
        <TransitionSeries.Sequence key={`s${i}`} durationInFrames={d + (i < SCENES.length - 1 ? T : 0)}><Scene /></TransitionSeries.Sequence>,
        ...(i < SCENES.length - 1 ? [<TransitionSeries.Transition key={`t${i}`} presentation={MOW} timing={timing} />] : []),
      ])}
    </TransitionSeries>
    {starts.slice(1).map((s) => <Sequence key={s} from={s - 2}><Sfx at={0} file="air.wav" volume={0.22} /></Sequence>)}
  </AbsoluteFill>
);
