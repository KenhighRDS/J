// Soft sound-effect kit for the RDS Academy × J stocks video (no music): candle rise, soft thud, board tick, air
// whoosh, phone buzz, notification chime, pop, stamp, closing chord. Every file is peak-normalised to -12 dBFS and the
// video plays them well below full scale, so the mix stays quiet.
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const SR = 48000, OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sfx-rds");
mkdirSync(OUT, { recursive: true });
let seed = 29; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
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
const TAU = 2 * Math.PI;

// rise: a short upward glide, one per candle growing
{ const x = make(0.26); for (let i = 0; i < x.length; i++) { const t = i / SR, p = i / x.length; const f = 320 + 520 * p * p; x[i] = (Math.sin(TAU * f * t) * 0.8 + Math.sin(TAU * f * 2 * t) * 0.15) * Math.sin(Math.PI * p) * Math.exp(-p * 1.2); } wav(lp(x, 0.3), "rise.wav"); }
// thud: soft low landing for a headline or a card
{ const x = make(0.3); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = Math.sin(TAU * (96 - 46 * Math.min(1, t * 9)) * t) * Math.exp(-t * 19) + rnd() * 0.35 * Math.exp(-t * 120); } wav(lp(x, 0.2), "thud.wav"); }
// tick: a board letter flipping
{ const x = make(0.07); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = (rnd() * Math.exp(-t * 150) + Math.sin(TAU * 1180 * t) * 0.3 * Math.exp(-t * 80)) * (t < 0.003 ? t / 0.003 : 1); } wav(lp(x, 0.42), "tick.wav"); }
// whoosh: air for the candle wipe between scenes
{ const x = make(0.55); for (let i = 0; i < x.length; i++) { const p = i / x.length; x[i] = rnd() * Math.pow(Math.sin(Math.PI * p), 2); } const y = lp(x, 0.07); for (let i = 0; i < y.length; i++) { const p = i / y.length; y[i] *= 0.6 + 0.4 * Math.sin(Math.PI * p); } wav(hp(y, 0.996), "whoosh.wav"); }
// buzz: a phone vibrating twice on a table
{ const x = make(0.62); for (let i = 0; i < x.length; i++) { const t = i / SR; const on = (t < 0.22 || (t > 0.32 && t < 0.56)) ? 1 : 0; const env = on * Math.min(1, Math.min(t < 0.3 ? t : t - 0.32, (t < 0.3 ? 0.22 - t : 0.56 - t)) / 0.02); x[i] = (Math.sin(TAU * 152 * t) + 0.4 * Math.sin(TAU * 304 * t) + rnd() * 0.25) * Math.max(0, env); } wav(lp(x, 0.12), "buzz.wav"); }
// ding: a two-note notification chime
{ const x = make(0.8); for (let i = 0; i < x.length; i++) { const t = i / SR; const n1 = Math.sin(TAU * 987.77 * t) * Math.exp(-t * 7), n2 = t > 0.12 ? Math.sin(TAU * 1318.5 * (t - 0.12)) * Math.exp(-(t - 0.12) * 5.5) : 0; x[i] = (n1 + n2 * 0.85) * (t < 0.004 ? t / 0.004 : 1); } wav(x, "ding.wav"); }
// pop: a chip or a check mark landing
{ const x = make(0.09); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = Math.sin(TAU * (760 - 380 * Math.min(1, t * 22)) * t) * Math.exp(-t * 52); } wav(x, "pop.wav"); }
// stamp: ink stamp on paper (dull knock plus a little paper)
{ const x = make(0.2); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = Math.sin(TAU * (150 - 80 * Math.min(1, t * 16)) * t) * Math.exp(-t * 34) * 0.9 + rnd() * 0.7 * Math.exp(-t * 90); } wav(lp(x, 0.3), "stamp.wav"); }
// type: one soft key
{ const x = make(0.04); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = (rnd() * 0.8 + Math.sin(TAU * 2900 * t) * 0.35) * Math.exp(-t * 170); } wav(lp(x, 0.5), "type.wav"); }
// chord: a warm closing chord
{ const x = make(1.6); for (let i = 0; i < x.length; i++) { const t = i / SR; let v = 0; [[392, 0], [493.88, 0.06], [587.33, 0.12], [783.99, 0.18]].forEach(([f, d]) => { if (t > d) v += Math.sin(TAU * f * (t - d)) * Math.exp(-(t - d) * 3.1) * (1 + 0.002 * Math.sin(TAU * 5 * t)); }); x[i] = v * (t < 0.006 ? t / 0.006 : 1); } wav(lp(x, 0.5), "chord.wav"); }
