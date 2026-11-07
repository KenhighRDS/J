// Synthesizes an original, royalty-free 60 s synthwave bed (105 BPM) and a small SFX kit as 16-bit WAVs.
// Deterministic, no downloads. Output: public/sfx/
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const SR = 44100, OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sfx");
mkdirSync(OUT, { recursive: true });
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
function wav(samples, name, drive = 0) {   // drive > 0: tanh soft limiter so sustained parts sit close to the transients (louder, denser mix)
  if (drive > 0) { const k = Math.tanh(drive); for (let i = 0; i < samples.length; i++) samples[i] = Math.tanh(samples[i] * drive) / k; }
  let peak = 0; for (const s of samples) peak = Math.max(peak, Math.abs(s)); const g = peak > 0 ? 0.92 / peak : 1;
  const n = samples.length, buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * g)) * 32767), 44 + i * 2);
  writeFileSync(join(OUT, name), buf); console.log("wrote", name, (n / SR).toFixed(2) + "s");
}
const make = (dur) => new Float32Array(Math.round(dur * SR));
const add = (out, start, dur, fn) => { const s0 = Math.floor(start * SR), n = Math.floor(dur * SR); for (let i = 0; i < n && s0 + i < out.length; i++) out[s0 + i] += fn(i / SR, i / n); };

// ---- music bed: 60 s synthwave at 105 BPM, an original piece (Dm · Bb · F · C): pumping pad and arp, four-on-the-floor, gated snare, a lead motif in the choruses
const DUR = 60, BEAT = 60 / 105, BAR = BEAT * 4, bed = make(DUR);
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PROG = [[62, 65, 69], [58, 62, 65], [65, 69, 72], [60, 64, 67]];                                   // midi triads, two bars each
const chordAt = (t) => PROG[Math.floor(t / (BAR * 2)) % PROG.length];
const saw = (f, t, h) => { let v = 0; for (let k = 1; k <= h; k++) v += Math.sin(2 * Math.PI * f * k * t) / k; return v * 0.6; };
const DRUMS = [4, 55.4];                                                                                  // drums in at the hook, out for the outro
const drums = (t) => t >= DRUMS[0] && t < DRUMS[1];
const pump = (t) => (drums(t) ? 1 - 0.5 * Math.exp(-((t % BEAT) / BEAT) * 9) : 1);                      // side-chain duck on every beat
const io = (t, a, b) => Math.min(1, t / a) * Math.min(1, (DUR - t) / b);
add(bed, 0, DUR, (t) => { const ch = chordAt(t), h = 2 + Math.round(6 * Math.min(1, t / 10)); let v = 0; for (const m of ch) v += saw(hz(m - 12), t, h) + saw(hz(m - 12) * 1.004, t, h) * 0.7; return v * 0.05 * io(t, 2.5, 4) * pump(t); });   // pad; the filter opens over the intro
add(bed, 0, DUR, (t) => { const q = BEAT / 4, step = Math.floor(t / q), ts = t - step * q, ch = chordAt(t), seq = [0, 1, 2, 1, 0, 2, 1, 2]; const m = ch[seq[step % 8]] + (step % 16 >= 8 ? 12 : 0); const env = Math.min(1, ts * 400) * Math.exp(-ts * 16); return (saw(hz(m), t, 5) * 0.6 + Math.sin(2 * Math.PI * hz(m) * t) * 0.4) * env * 0.17 * io(t, 4, 3) * pump(t); });   // 16th-note arp
add(bed, DRUMS[0], DRUMS[1] - DRUMS[0] - 4, (ts) => { const t = ts + DRUMS[0], e = BEAT / 2, step = Math.floor(t / e), tt = t - step * e, m = chordAt(t)[0] - 24 + (step % 2 ? 12 : 0); const env = Math.min(1, tt * 300) * Math.exp(-tt * 5); return (saw(hz(m), t, 4) * 0.7 + Math.sin(2 * Math.PI * hz(m) * t) * 0.6) * env * 0.3 * pump(t); });   // octave bass in 8ths
const MOTIF = [74, 0, 81, 0, 77, 76, 74, 0, 72, 0, 69, 0, 72, 74, 0, 0];                                 // 8ths over two bars, 0 = rest
for (const [c0, c1] of [[20, 34], [42, 55.4]]) add(bed, c0, c1 - c0, (ts) => { const t = ts + c0, e = BEAT / 2, step = Math.floor(ts / e), tt = ts - step * e, m = MOTIF[step % 16]; if (!m) return 0; const f = hz(m) * (1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * t)); const env = Math.min(1, tt * 120) * Math.exp(-tt * 2.2) * Math.min(1, (c1 - t) / 0.5); return (Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 3 * t) / 3 + Math.sin(2 * Math.PI * f * 2 * t) * 0.3) * env * 0.11; });   // lead with vibrato, choruses only
const kick = (t, a = 0.9) => add(bed, t, 0.35, (ts, p) => Math.sin(2 * Math.PI * (150 - 100 * Math.min(1, ts * 12)) * ts) * Math.exp(-p * 7) * a);
const snare = (t, a = 0.45) => add(bed, t, 0.24, (ts, p) => (rnd() * 1.6 + Math.sin(2 * Math.PI * 185 * ts) * 0.5) * Math.exp(-p * 2.5) * (p < 0.85 ? 1 : (1 - p) / 0.15) * a);   // gated tail
const hat = (t, a = 0.06, len = 0.05) => add(bed, t, len, (ts, p) => rnd() * 2 * Math.exp(-p * 9) * a);
for (let b = 0; b * BEAT < DUR; b++) { const t = b * BEAT; if (!drums(t)) continue; kick(t); if (b % 2 === 1 && t >= 10) snare(t); hat(t, 0.05); hat(t + BEAT / 2, b % 4 === 3 ? 0.09 : 0.045, b % 4 === 3 ? 0.16 : 0.05); }
for (const c of [20, 34, 42]) for (let b = 0; b < 8; b++) snare(c - (8 - b) * BEAT / 4, 0.18 + b * 0.04);   // 16th rolls into the choruses and the break
for (const t of [4, 10, 20, 27, 34, 42, 50]) add(bed, t - 1.4, 1.4, (ts, p) => rnd() * 2 * p * p * 0.28);   // risers into cuts
for (const t of [4, 10, 20, 27, 34, 42, 50, 55.4]) add(bed, t, 0.9, (ts, p) => Math.sin(2 * Math.PI * (60 - 22 * Math.min(1, ts * 3)) * ts) * Math.exp(-p * 5) * 0.8);   // bass hits on cuts
wav(bed, "bed.wav", 1.4);

// ---- SFX kit
{ const n = make(0.45); let lp = 0; for (let i = 0; i < n.length; i++) { const p = i / n.length; const env = Math.sin(Math.PI * Math.pow(p, 0.7)) ** 2; lp += (0.04 + 0.25 * Math.sin(Math.PI * p)) * (rnd() * 2 - lp); n[i] = lp * env; } wav(n, "whoosh.wav"); }
{ const n = make(0.16); let ph = 0; for (let i = 0; i < n.length; i++) { const p = i / n.length; ph += (2 * Math.PI * (680 - 360 * p)) / SR; n[i] = Math.sin(ph) * Math.exp(-p * 9); } wav(n, "pop.wav"); }
{ const n = make(0.05); let ph = 0; for (let i = 0; i < n.length; i++) { const p = i / n.length; ph += (2 * Math.PI * 1800) / SR; n[i] = Math.sin(ph) * Math.exp(-p * 14); } wav(n, "tick.wav"); }
{ const n = make(0.5); let ph = 0; for (let i = 0; i < n.length; i++) { const p = i / n.length; ph += (2 * Math.PI * (80 - 22 * p)) / SR; n[i] = Math.sin(ph) * Math.exp(-p * 6); } wav(n, "bass.wav"); }
{ const n = make(1.2); for (let i = 0; i < n.length; i++) { const t = i / SR, p = i / n.length; n[i] = (Math.sin(2 * Math.PI * 440 * t) * 0.6 + Math.sin(2 * Math.PI * 660 * t) * 0.3 + Math.sin(2 * Math.PI * 880 * t) * 0.2) * Math.exp(-p * 3.2) * Math.min(1, t * 80); } wav(n, "shimmer.wav"); }
{ const n = make(0.6); for (let i = 0; i < n.length; i++) { const t = i / SR, p = i / n.length; const ring = 0.5 + 0.5 * Math.sin(2 * Math.PI * 23 * t); n[i] = (Math.sin(2 * Math.PI * 920 * t) + Math.sin(2 * Math.PI * 1380 * t) * 0.5) * ring * Math.exp(-p * 2) * 0.5; } wav(n, "ring.wav"); }
