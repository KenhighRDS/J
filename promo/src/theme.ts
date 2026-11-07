// Single source of truth for the J promo: the app's own palette (black, chrome, Inter + JetBrains Mono).
import { Easing } from "remotion";
export const theme = {
  colors: {
    bg: "#000000", bgAlt: "#0b0b0c", surface: "#141416", border: "#232326",
    text: "#f5f5f7", textDim: "#8e8e93", chrome2: "#bfc3c9", chrome3: "#6e7279",
    primary: "#bfc3c9",            // the hero "color" is chrome: at most one glowing chrome element per frame
    buy: "#2fbf71", sell: "#e5484d",
    glow: "rgba(191,195,201,0.35)",
  },
  chromeGradient: "linear-gradient(180deg,#ffffff 0%,#bfc3c9 55%,#6e7279 100%)",
  ease: {
    out: Easing.bezier(0.16, 1, 0.3, 1),
    inOut: Easing.bezier(0.83, 0, 0.17, 1),
    in: Easing.bezier(0.7, 0, 0.84, 0),
  },
  spring: {
    snappy: { damping: 14, stiffness: 160, mass: 0.6 },
    smooth: { damping: 20, stiffness: 90, mass: 1 },
    bouncy: { damping: 11, stiffness: 170, mass: 0.7 },
    heavy: { damping: 24, stiffness: 60, mass: 1.2 },
  },
} as const;
export const FPS = 30;
export const W = 1080;
export const H = 1920;
