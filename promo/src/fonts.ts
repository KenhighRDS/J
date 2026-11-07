// Fonts come from the app's own @fontsource variable files, served from public/ (no network needed at render time).
import { continueRender, delayRender, staticFile } from "remotion";
export const FONT = "Inter Promo";
export const MONO = "JetBrains Mono Promo";
if (typeof document !== "undefined") {
  const handle = delayRender("Loading fonts");
  const faces = [new FontFace(FONT, `url(${staticFile("fonts/inter.woff2")})`, { weight: "100 900" }), new FontFace(MONO, `url(${staticFile("fonts/jetbrains-mono.woff2")})`, { weight: "100 800" })];
  Promise.all(faces.map((f) => f.load().then((loaded) => document.fonts.add(loaded)))).then(() => continueRender(handle)).catch(() => continueRender(handle));
}
