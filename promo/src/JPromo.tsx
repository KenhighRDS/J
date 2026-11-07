import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Logo } from "./scenes/Logo";
import { Hook } from "./scenes/Hook";
import { SignalDemo } from "./scenes/SignalDemo";
import { CallScreen } from "./scenes/CallScreen";
import { FollowUps } from "./scenes/FollowUps";
import { Results } from "./scenes/Results";
import { Wann } from "./scenes/Wann";
import { TwoPhones } from "./scenes/TwoPhones";
import { Outro } from "./scenes/Outro";
import { FONT } from "./fonts";

export const T = 12;                                                             // transition length
export const SCENES = [120, 180, 300, 210, 210, 240, 240, 150, 150];           // output seconds: 4 6 10 7 7 8 8 5 5 = 60
export const TOTAL = SCENES.reduce((a, b) => a + b, 0);                         // 1800
const starts = SCENES.map((_, i) => SCENES.slice(0, i).reduce((a, b) => a + b, 0));
const dur = (i: number) => SCENES[i] + (i < SCENES.length - 1 ? T : 0);        // each scene carries its outgoing transition
const FADE = fade(); const SLIDE = slide({ direction: "from-right" }); const timing = linearTiming({ durationInFrames: T });

const Sfx: React.FC<{ at: number; file: string; volume?: number }> = ({ at, file, volume = 0.6 }) => <Sequence from={Math.max(0, at - 3)}><Audio src={staticFile(`sfx/${file}`)} volume={volume} /></Sequence>;

export const JPromo: React.FC = () => (
  <AbsoluteFill style={{ background: "#000", fontFamily: FONT }}>
    <Audio src={staticFile("sfx/bed.wav")} volume={0.26} />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={dur(0)}><Logo /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={FADE} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={dur(1)}><Hook /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={SLIDE} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={dur(2)}><SignalDemo /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={FADE} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={dur(3)}><CallScreen /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={SLIDE} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={dur(4)}><FollowUps /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={FADE} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={dur(5)}><Results /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={SLIDE} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={dur(6)}><Wann /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={FADE} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={dur(7)}><TwoPhones /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={FADE} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={dur(8)}><Outro /></TransitionSeries.Sequence>
    </TransitionSeries>
    {/* hits: logo land, each cut, callouts, the call ring, the counter, the share card */}
    <Sfx at={6} file="bass.wav" volume={0.7} />
    <Sfx at={34} file="shimmer.wav" volume={0.35} />
    {starts.slice(1).map((s) => <Sfx key={s} at={s} file="whoosh.wav" volume={0.5} />)}
    {[starts[1], starts[1] + 48, starts[1] + 96].map((s) => <Sfx key={`h${s}`} at={s} file="bass.wav" volume={0.5} />)}
    {[70, 92, 114, 160].map((d) => <Sfx key={`c${d}`} at={starts[2] + d} file="pop.wav" volume={0.5} />)}
    <Sfx at={starts[2] + 268} file="pop.wav" volume={0.6} />
    {[0, 20, 40].map((d) => <Sfx key={`r${d}`} at={starts[3] + 8 + d} file="ring.wav" volume={0.45} />)}
    <Sfx at={starts[3] + 168} file="pop.wav" volume={0.5} />
    {[34, 74, 114].map((d) => <Sfx key={`f${d}`} at={starts[4] + d} file="pop.wav" volume={0.5} />)}
    <Sfx at={starts[5] + 10} file="shimmer.wav" volume={0.5} />
    <Sfx at={starts[5] + 146} file="whoosh.wav" volume={0.5} />
    {[40, 96].map((d) => <Sfx key={`b${d}`} at={starts[7] + d} file="pop.wav" volume={0.5} />)}
    <Sfx at={starts[8] + 4} file="bass.wav" volume={0.7} />
    <Sfx at={starts[8] + 26} file="shimmer.wav" volume={0.4} />
  </AbsoluteFill>
);
