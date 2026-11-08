// Soft sound-effect kit for the Wann video (no music): chalk scratch, ball tap, UI tap, typing tick, split-flap flip,
// air whoosh, notification chime, success chord, crowd swell. Every file is peak-normalised to -12 dBFS so the mix stays quiet.
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const SR = 48000, OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sfx-wann");
mkdirSync(OUT, { recursive: true });
let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
const PEAK = Math.pow(10, -12 / 20);
function wav(x, name) {
  let p = 0; for (const s of x) p = Math.max(p, Math.abs(s)); const g = p > 0 ? PEAK / p : 1;
  const n = x.length, b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i] * g)) * 32767), 44 + i * 2);
  writeFileSync(join(OUT, name), b); console.log("wrote", name, (n / SR).toFixed(2) + "s");
}
const make = (d) => new Float32Array(Math.round(d * SR));
const lp = (x, a) => { let y = 0; for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] = y; } return x; };          // one-pole low-pass
const hp = (x, a) => { let y = 0, px = 0; for (let i = 0; i < x.length; i++) { const v = x[i]; y = a * (y + v - px); px = v; x[i] = y; } return x; };

{ const x = make(0.42); for (let i = 0; i < x.length; i++) { const t = i / SR, p = i / x.length; const grain = 0.55 + 0.45 * Math.sin(2 * Math.PI * 38 * t + Math.sin(t * 90) * 2); x[i] = rnd() * grain * Math.sin(Math.PI * Math.min(1, p * 1.15)); } wav(lp(hp(x, 0.96), 0.35), "chalk.wav"); }
{ const x = make(0.22); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = Math.sin(2 * Math.PI * (130 - 70 * Math.min(1, t * 14)) * t) * Math.exp(-t * 28) + rnd() * 0.6 * Math.exp(-t * 160); } wav(lp(x, 0.25), "ball.wav"); }
{ const x = make(0.06); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = (Math.sin(2 * Math.PI * 1650 * t) * 0.7 + Math.sin(2 * Math.PI * 2470 * t) * 0.3) * Math.exp(-t * 85); } wav(x, "tap.wav"); }
{ const x = make(0.035); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = (rnd() * 0.8 + Math.sin(2 * Math.PI * 3200 * t) * 0.4) * Math.exp(-t * 180); } wav(lp(x, 0.5), "type.wav"); }
{ const x = make(0.09); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = (rnd() * Math.exp(-t * 120) + Math.sin(2 * Math.PI * 880 * t) * 0.35 * Math.exp(-t * 60)) * (t < 0.004 ? t / 0.004 : 1); } wav(lp(x, 0.45), "flip.wav"); }
{ const x = make(0.5); for (let i = 0; i < x.length; i++) { const p = i / x.length; x[i] = rnd() * Math.pow(Math.sin(Math.PI * p), 2); } const y = lp(x, 0.08); for (let i = 0; i < y.length; i++) { const p = i / y.length; y[i] = y[i] * (0.6 + 0.4 * Math.sin(Math.PI * p)); } wav(y, "air.wav"); }
{ const x = make(0.7); for (let i = 0; i < x.length; i++) { const t = i / SR; const n1 = Math.sin(2 * Math.PI * 1046.5 * t) * Math.exp(-t * 7), n2 = t > 0.11 ? Math.sin(2 * Math.PI * 1568 * (t - 0.11)) * Math.exp(-(t - 0.11) * 6) : 0; x[i] = (n1 + n2 * 0.8) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 4 * t)); } wav(x, "chime.wav"); }
{ const x = make(1.1); for (let i = 0; i < x.length; i++) { const t = i / SR; let v = 0; [[523.25, 0], [659.25, 0.07], [783.99, 0.14], [1046.5, 0.21]].forEach(([f, d]) => { if (t > d) v += Math.sin(2 * Math.PI * f * (t - d)) * Math.exp(-(t - d) * 4.2) * (1 + 0.25 * Math.sin(2 * Math.PI * f * 2 * (t - d))); }); x[i] = v; } wav(x, "success.wav"); }
{ const x = make(2.2); for (let i = 0; i < x.length; i++) { const p = i / x.length; x[i] = rnd() * Math.sin(Math.PI * p) * (0.8 + 0.2 * Math.sin(i / SR * 13)); } const y = lp(hp(x, 0.995), 0.05); wav(y, "crowd.wav"); }
