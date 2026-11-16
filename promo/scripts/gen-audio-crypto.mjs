// Soft sound-effect kit for the RDS Academy × J crypto video (no music): sonar ping, low hit, air swell into a cut,
// coin clink, glass tick, pop, phone buzz, notification chime, finger tap, shimmer, scroll air, closing chord. Every
// file is peak-normalised to -12 dBFS and the video plays them well below full scale, so the mix stays quiet.
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const SR = 48000, OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sfx-crypto");
mkdirSync(OUT, { recursive: true });
let seed = 41; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
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
const lp = (x, a) => { let y = 0; for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] = y; } return x; };
const hp = (x, a) => { let y = 0, px = 0; for (let i = 0; i < x.length; i++) { const v = x[i]; y = a * (y + v - px); px = v; x[i] = y; } return x; };
const fade = (x, ms = 6) => { const n = Math.round((ms / 1000) * SR); for (let i = 0; i < n && i < x.length; i++) { x[x.length - 1 - i] *= i / n; } return x; };
const TAU = 2 * Math.PI;

// ping: a sonar note with two fading echoes
{ const x = make(1.25); const note = (t) => (t < 0 ? 0 : (Math.sin(TAU * 1244.5 * t) + 0.22 * Math.sin(TAU * 2489 * t)) * Math.exp(-t * 6.5) * Math.min(1, t / 0.004)); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = note(t) + 0.34 * note(t - 0.19) + 0.13 * note(t - 0.38); } wav(fade(lp(x, 0.6), 30), "ping.wav"); }
// sub: a soft low hit under a headline or on a cut
{ const x = make(0.55); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = Math.sin(TAU * (74 - 30 * Math.min(1, t * 6)) * t) * Math.exp(-t * 8.5) + rnd() * 0.22 * Math.exp(-t * 140); } wav(fade(lp(x, 0.16), 20), "sub.wav"); }
// swell: air and a rising tone that lead into a cut, then stop
{ const x = make(0.52); for (let i = 0; i < x.length; i++) { const p = i / x.length, t = i / SR; x[i] = (rnd() * 0.9 + Math.sin(TAU * (180 + 520 * p * p) * t) * 0.35) * Math.pow(p, 2.2) * (p > 0.94 ? (1 - p) / 0.06 : 1); } wav(hp(lp(x, 0.11), 0.995), "swell.wav"); }
// clink: a coin touching glass
{ const x = make(0.4); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = (Math.sin(TAU * 2150 * t) * Math.exp(-t * 17) + 0.6 * Math.sin(TAU * 3370 * t) * Math.exp(-t * 22) + 0.35 * Math.sin(TAU * 5020 * t) * Math.exp(-t * 30) + rnd() * 0.3 * Math.exp(-t * 260)) * Math.min(1, t / 0.002); } wav(fade(x, 20), "clink.wav"); }
// tick: one small glass tick
{ const x = make(0.06); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = (Math.sin(TAU * 2350 * t) * 0.8 + rnd() * 0.3) * Math.exp(-t * 115) * Math.min(1, t / 0.002); } wav(lp(x, 0.55), "tick.wav"); }
// pop: a chip or a tick mark landing
{ const x = make(0.1); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = Math.sin(TAU * (640 - 330 * Math.min(1, t * 20)) * t) * Math.exp(-t * 48); } wav(x, "pop.wav"); }
// buzz: a phone vibrating twice
{ const x = make(0.62); for (let i = 0; i < x.length; i++) { const t = i / SR; const on = (t < 0.22 || (t > 0.32 && t < 0.56)) ? 1 : 0; const env = on * Math.min(1, Math.min(t < 0.3 ? t : t - 0.32, (t < 0.3 ? 0.22 - t : 0.56 - t)) / 0.02); x[i] = (Math.sin(TAU * 148 * t) + 0.4 * Math.sin(TAU * 296 * t) + rnd() * 0.22) * Math.max(0, env); } wav(lp(x, 0.11), "buzz.wav"); }
// ding: a two-note notification chime
{ const x = make(0.95); for (let i = 0; i < x.length; i++) { const t = i / SR; const n1 = (Math.sin(TAU * 880 * t) + 0.2 * Math.sin(TAU * 1760 * t)) * Math.exp(-t * 6.5), n2 = t > 0.13 ? (Math.sin(TAU * 1174.66 * (t - 0.13)) + 0.2 * Math.sin(TAU * 2349.3 * (t - 0.13))) * Math.exp(-(t - 0.13) * 5) : 0; x[i] = (n1 + n2 * 0.9) * Math.min(1, t / 0.004); } wav(fade(x, 30), "ding.wav"); }
// tap: a fingertip on glass
{ const x = make(0.12); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = Math.sin(TAU * (170 - 90 * Math.min(1, t * 18)) * t) * Math.exp(-t * 42) + rnd() * 0.45 * Math.exp(-t * 210); } wav(lp(x, 0.3), "tap.wav"); }
// shimmer: bright partials arriving one after another, for the coin that turns gold
{ const x = make(1.1); const parts = [[1760, 0], [2217.5, 0.05], [2637, 0.1], [3520, 0.15], [4435, 0.2]]; for (let i = 0; i < x.length; i++) { const t = i / SR; let v = 0; for (const [fq, d] of parts) if (t > d) v += Math.sin(TAU * fq * (t - d)) * Math.exp(-(t - d) * 4.2) * (1 + 0.25 * Math.sin(TAU * 7 * t)) * Math.min(1, (t - d) / 0.01); x[i] = v; } wav(fade(lp(x, 0.7), 40), "shimmer.wav"); }
// whoosh: short air for a page sliding or scrolling
{ const x = make(0.42); for (let i = 0; i < x.length; i++) { const p = i / x.length; x[i] = rnd() * Math.pow(Math.sin(Math.PI * p), 2); } wav(hp(lp(x, 0.09), 0.996), "whoosh.wav"); }
// chord: a soft closing chord with a slow start
{ const x = make(2.4); for (let i = 0; i < x.length; i++) { const t = i / SR; let v = 0; [[146.83, 0, 0.7], [293.66, 0, 1], [369.99, 0.07, 0.9], [440, 0.14, 0.9], [659.25, 0.21, 0.7]].forEach(([fq, d, g]) => { if (t > d) v += Math.sin(TAU * fq * (t - d)) * g * Math.exp(-(t - d) * 2.1) * Math.min(1, (t - d) / 0.05) * (1 + 0.003 * Math.sin(TAU * 4.5 * t)); }); x[i] = v; } wav(fade(lp(x, 0.45), 80), "chord.wav"); }
