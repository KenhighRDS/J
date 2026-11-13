// "RDS Academy × J": the stock picks feature in 90 seconds. Market-paper look in the RDS colours, a candle wipe between
// scenes, quiet sound effects, no music and no voice.
import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { Finish, Paper, Sfx, Tape, Wipe } from "./rds/Kit";
import { ALERT, INTRO, INVITE, KINDS, MONEY, PARTS, RECAP, RECORD, SAlert, SIntro, SInvite, SKinds, SMoney, SParts, SRecap, SRecord } from "./rds/Scenes";

const SCENES: [React.FC, number][] = [[SIntro, INTRO], [SRecord, RECORD], [SAlert, ALERT], [SParts, PARTS], [SKinds, KINDS], [SMoney, MONEY], [SRecap, RECAP], [SInvite, INVITE]];
export const RDS_TOTAL = SCENES.reduce((a, [, d]) => a + d, 0);
const cuts = SCENES.slice(0, -1).map((_, i) => SCENES.slice(0, i + 1).reduce((a, [, d]) => a + d, 0));

export const JStocks: React.FC = () => (
  <AbsoluteFill style={{ background: "#F3F5FA" }}>
    <Paper />
    <Tape from={cuts[0]} to={cuts[cuts.length - 1]} />
    <Series>{SCENES.map(([Scene, d], i) => <Series.Sequence key={i} durationInFrames={d}><Scene /></Series.Sequence>)}</Series>
    {cuts.map((c) => <React.Fragment key={c}><Wipe at={c} /><Sfx at={c - 12} file="whoosh.wav" volume={0.3} /></React.Fragment>)}
    <Finish />
  </AbsoluteFill>
);
