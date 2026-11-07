import React from "react";
import { Composition } from "remotion";
import { JPromo, TOTAL } from "./JPromo";
import { FPS, H, W } from "./theme";

export const Root: React.FC = () => <Composition id="JPromo" component={JPromo} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />;
