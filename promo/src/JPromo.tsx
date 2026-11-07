import React from "react";
import { AbsoluteFill, Audio, Sequence, getStaticFiles, interpolate, staticFile } from "remotion";
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
export const SCENES_VOICE = [120, 180, 330, 210, 210, 225, 225, 150, 150];     // narrated cut: the signal line needs 11 s; Results and Wann give back half a second each
const sum = (s: number[]) => s.reduce((a, b) => a + b, 0);
export const TOTAL = sum(SCENES), TOTAL_VOICE = sum(SCENES_VOICE);            // 1800 both
const FADE = fade(); const SLIDE = slide({ direction: "from-right" }); const timing = linearTiming({ durationInFrames: T });
const FPS = 30;

/** Drop a licensed song in public/music/ (gitignored) and it replaces the synthesized bed. MUSIC_START skips into the song (seconds). */
const TRACK = getStaticFiles().find((f) => /^music\/.+\.(mp3|m4a|aac|wav|ogg)$/i.test(f.name));
const MUSIC_START = 0;
const Music: React.FC<{ level: number; total: number }> = ({ level, total }) => TRACK
  ? <Audio src={TRACK.src} trimBefore={Math.round(MUSIC_START * FPS)} volume={(f) => interpolate(f, [0, 24, total - 60, total - 2], [0, level, level, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
  : <Audio src={staticFile("sfx/bed.wav")} volume={level} />;

/** Narration clips from scripts/gen-voice.py (public/voice); LEAD = frames after each scene start. */
const VOICE = ["01-logo", "02-hook", "03-signal", "04-call", "05-followups", "06-results", "07-wann", "08-phones", "09-outro"];
const LEAD = [16, 8, 5, 6, 6, 8, 8, 4, 22];

const SCENE = [Logo, Hook, SignalDemo, CallScreen, FollowUps, Results, Wann, TwoPhones, Outro];
const CUT = [FADE, SLIDE, FADE, SLIDE, FADE, SLIDE, FADE, FADE];                // transition after scene i

const Sfx: React.FC<{ at: number; file: string; volume?: number }> = ({ at, file, volume = 0.6 }) => <Sequence from={Math.max(0, at - 3)}><Audio src={staticFile(`sfx/${file}`)} volume={volume} /></Sequence>;

const Promo: React.FC<{ scenes: number[]; voice: boolean }> = ({ scenes, voice }) => {
  const starts = scenes.map((_, i) => sum(scenes.slice(0, i)));
  const dur = (i: number) => scenes[i] + (i < scenes.length - 1 ? T : 0);    // each scene carries its outgoing transition
  const g = voice ? 0.8 : 1;                                                    // SFX sit a touch lower under narration
  return (
    <AbsoluteFill style={{ background: "#000", fontFamily: FONT }}>
      <Music level={voice ? 0.26 : 0.5} total={sum(scenes)} />
      {voice && VOICE.map((v, i) => <Sequence key={v} from={starts[i] + LEAD[i]}><Audio src={staticFile(`voice/${v}.wav`)} volume={1} /></Sequence>)}
      <TransitionSeries>
        {SCENE.flatMap((S, i) => [
          <TransitionSeries.Sequence key={`s${i}`} durationInFrames={dur(i)}><S /></TransitionSeries.Sequence>,
          ...(i < CUT.length ? [<TransitionSeries.Transition key={`t${i}`} presentation={CUT[i]} timing={timing} />] : []),
        ])}
      </TransitionSeries>
      {/* hits: logo land, each cut, callouts, the call ring, the counter, the share card */}
      <Sfx at={6} file="bass.wav" volume={0.7 * g} />
      <Sfx at={34} file="shimmer.wav" volume={0.35 * g} />
      {starts.slice(1).map((s) => <Sfx key={s} at={s} file="whoosh.wav" volume={0.5 * g} />)}
      {[starts[1], starts[1] + 48, starts[1] + 96].map((s) => <Sfx key={`h${s}`} at={s} file="bass.wav" volume={0.5 * g} />)}
      {[70, 92, 114, 160].map((d) => <Sfx key={`c${d}`} at={starts[2] + d} file="pop.wav" volume={0.5 * g} />)}
      <Sfx at={starts[2] + 268} file="pop.wav" volume={0.6 * g} />
      {[0, 20, 40].map((d) => <Sfx key={`r${d}`} at={starts[3] + 8 + d} file="ring.wav" volume={0.45 * g} />)}
      <Sfx at={starts[3] + 168} file="pop.wav" volume={0.5 * g} />
      {[34, 74, 114].map((d) => <Sfx key={`f${d}`} at={starts[4] + d} file="pop.wav" volume={0.5 * g} />)}
      <Sfx at={starts[5] + 10} file="shimmer.wav" volume={0.5 * g} />
      <Sfx at={starts[5] + 146} file="whoosh.wav" volume={0.5 * g} />
      {[40, 96].map((d) => <Sfx key={`b${d}`} at={starts[7] + d} file="pop.wav" volume={0.5 * g} />)}
      <Sfx at={starts[8] + 4} file="bass.wav" volume={0.7 * g} />
      <Sfx at={starts[8] + 26} file="shimmer.wav" volume={0.4 * g} />
    </AbsoluteFill>
  );
};

export const JPromo: React.FC = () => <Promo scenes={SCENES} voice={false} />;
export const JPromoVoice: React.FC = () => <Promo scenes={SCENES_VOICE} voice={true} />;
