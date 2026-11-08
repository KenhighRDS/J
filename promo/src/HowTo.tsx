// "How to take a J signal": the call, copy in J, paste in MT5, place, swipe "I took it". Sound effects only (no music bed).
import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { FONT } from "./fonts";
import { FORGOT_LEN, HowCall, HowEnd, HowForgot, HowPending, HowTitle, HowWalkthrough, PENDING_LEN, WALK_LEN } from "./howto/Scenes";

const T = 12;
const SCENES: [React.FC, number][] = [[HowTitle, 105], [HowCall, 150], [HowWalkthrough, WALK_LEN], [HowPending, PENDING_LEN], [HowForgot, FORGOT_LEN], [HowEnd, 105]];
export const HOWTO_TOTAL = SCENES.reduce((a, [, d]) => a + d, 0);
const timing = linearTiming({ durationInFrames: T }); const FADE = fade();

export const JHowTo: React.FC = () => (
  <AbsoluteFill style={{ background: "#000", fontFamily: FONT }}>
    <TransitionSeries>
      {SCENES.flatMap(([Scene, d], i) => [
        <TransitionSeries.Sequence key={`s${i}`} durationInFrames={d + (i < SCENES.length - 1 ? T : 0)}><Scene /></TransitionSeries.Sequence>,
        ...(i < SCENES.length - 1 ? [<TransitionSeries.Transition key={`t${i}`} presentation={FADE} timing={timing} />] : []),
      ])}
    </TransitionSeries>
  </AbsoluteFill>
);
