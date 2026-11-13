import React from "react";
import { Composition } from "remotion";
import { JPromo, JPromoSfx, JPromoVoice, JPromoVoiceSfx, TOTAL, TOTAL_VOICE } from "./JPromo";
import { HOWTO_TOTAL, JHowTo } from "./HowTo";
import { JWann, WANN_TOTAL } from "./WannVideo";
import { JStocks, RDS_TOTAL } from "./RdsVideo";
import { FPS, H, W } from "./theme";

export const Root: React.FC = () => (
  <>
    <Composition id="JPromo" component={JPromo} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
    <Composition id="JPromoVoice" component={JPromoVoice} durationInFrames={TOTAL_VOICE} fps={FPS} width={W} height={H} />
    <Composition id="JPromoSfx" component={JPromoSfx} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
    <Composition id="JWann" component={JWann} durationInFrames={WANN_TOTAL} fps={FPS} width={W} height={H} />
    <Composition id="JStocks" component={JStocks} durationInFrames={RDS_TOTAL} fps={FPS} width={W} height={H} />
    <Composition id="JHowTo" component={JHowTo} durationInFrames={HOWTO_TOTAL} fps={FPS} width={W} height={H} />
    <Composition id="JPromoVoiceSfx" component={JPromoVoiceSfx} durationInFrames={TOTAL_VOICE} fps={FPS} width={W} height={H} />
  </>
);
