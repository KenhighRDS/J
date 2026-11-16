// "RDS Academy × J": the crypto picks feature in 90 seconds. Night-sky look (deep navy, one gold), the real app on a
// phone, an aperture cut between scenes, quiet sound effects, no music and no voice.
import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { Aperture, Finish, N, Night, Sfx } from "./crypto/Kit";
import { ALERT, INTRO, INVITE, KINDS, MONEY, PARTS, RECAP, SCAN, SAlert, SIntro, SInvite, SKinds, SMoney, SParts, SRecap, SScan } from "./crypto/Scenes";

const SCENES: [React.FC, number][] = [[SIntro, INTRO], [SScan, SCAN], [SAlert, ALERT], [SParts, PARTS], [SKinds, KINDS], [SMoney, MONEY], [SRecap, RECAP], [SInvite, INVITE]];
export const CRYPTO_TOTAL = SCENES.reduce((a, [, d]) => a + d, 0);
const cuts = SCENES.slice(0, -1).map((_, i) => SCENES.slice(0, i + 1).reduce((a, [, d]) => a + d, 0));

export const JCrypto: React.FC = () => (
  <AbsoluteFill style={{ background: N.night }}>
    <Night />
    <Series>{SCENES.map(([Scene, d], i) => <Series.Sequence key={i} durationInFrames={d}><Scene /></Series.Sequence>)}</Series>
    {cuts.map((c) => <React.Fragment key={c}><Aperture at={c} /><Sfx at={c - 13} file="swell.wav" volume={0.24} /><Sfx at={c} file="sub.wav" volume={0.3} /></React.Fragment>)}
    <Finish />
  </AbsoluteFill>
);
