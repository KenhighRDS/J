// Fonts come from the app's own @fontsource variable files, served from public/ (no network needed at render time).
import { continueRender, delayRender, staticFile } from "remotion";
export const FONT = "Inter Promo";
export const MONO = "JetBrains Mono Promo";
export const ROBOTO = "Roboto Promo";
export const DISPLAY = "Big Shoulders Promo";      // Wann video headlines (OFL, @fontsource-variable/big-shoulders-display)
export const SERIF = "Fraunces Promo";            // RDS stocks video headlines (OFL, @fontsource-variable/fraunces, all axes)
export const SANS = "Archivo Promo";               // Wann video captions (OFL, @fontsource-variable/archivo)            // MetaTrader 5 mobile UI font (OFL, @fontsource-variable/roboto)
if (typeof document !== "undefined") {
  const handle = delayRender("Loading fonts");
  const faces = [new FontFace(FONT, `url(${staticFile("fonts/inter.woff2")})`, { weight: "100 900" }), new FontFace(MONO, `url(${staticFile("fonts/jetbrains-mono.woff2")})`, { weight: "100 800" }), new FontFace(ROBOTO, `url(${staticFile("fonts/roboto.woff2")})`, { weight: "100 900" }), new FontFace(DISPLAY, `url(${staticFile("fonts/big-shoulders.woff2")})`, { weight: "100 900" }), new FontFace(SANS, `url(${staticFile("fonts/archivo.woff2")})`, { weight: "100 900" }), new FontFace(SERIF, `url(${staticFile("fonts/fraunces.woff2")})`, { weight: "100 900" })];
  Promise.all(faces.map((f) => f.load().then((loaded) => document.fonts.add(loaded)))).then(() => continueRender(handle)).catch(() => continueRender(handle));
}
