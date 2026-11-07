// Synthesizes an original, royalty-free 60 s bed (dark, minimal, 96 BPM) and a small SFX kit as 16-bit WAVs.
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

// ---- music bed: 60 s, 96 BPM (beat = 0.625 s = 18.75 frames at 30 fps)
const DUR = 60, BEAT = 60 / 96, bed = make(DUR);
const chord = [[110, 130.81, 164.81, 196], [98, 116.54, 146.83, 174.61], [87.31, 103.83, 130.81, 155.56], [110, 130.81, 164.81, 196]];   // Am, Gm-ish, F, Am
add(bed, 0, DUR, (t) => {   // slow pad: chord changes every 8 bars, detuned sines, gentle tremolo, long fade in/out
  const bar = Math.floor(t / (BEAT * 4)), ch = chord[Math.floor(bar / 8) % chord.length];
  let v = 0; for (const f of ch) v += Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 1.002 * t) * 0.6;
  const env = Math.min(1, t / 3) * Math.min(1, (DUR - t) / 4); const trem = 1 - 0.15 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.11 * t));
  return v * 0.028 * env * trem;
});
add(bed, 0, DUR, (t) => { const env = Math.min(1, t / 6) * Math.min(1, (DUR - t) / 5); return (Math.sin(2 * Math.PI * 55 * t) * 0.5 + Math.sin(2 * Math.PI * 82.41 * t) * 0.2) * 0.07 * env * (0.6 + 0.4 * Math.sin(2 * Math.PI * t / (BEAT * 8))); });   // sub swell
const kick = (t, amp = 0.8) => add(bed, t, 0.3, (ts, p) => Math.sin(2 * Math.PI * (120 - 80 * Math.min(1, ts * 10)) * ts) * Math.exp(-p * 6) * amp);
const hat = (t, amp = 0.06) => add(bed, t, 0.04, (ts, p) => rnd() * 2 * Math.exp(-p * 12) * amp);
const click = (t) => add(bed, t, 0.02, (ts, p) => Math.sin(2 * Math.PI * 2200 * ts) * Math.exp(-p * 16) * 0.12);
for (let b = 0; b * BEAT < DUR; b++) {
  const t = b * BEAT;
  if (t >= 4 && t < 55) { if (b % 2 === 0) kick(t, t < 10 ? 0.5 : 0.75); hat(t + BEAT / 2, t < 10 ? 0.03 : 0.06); }
  if (t >= 20 && t < 52 && b % 4 === 3) click(t);
}
for (const t of [10, 20, 27, 34, 42, 50]) add(bed, t - 1.2, 1.2, (ts, p) => rnd() * 2 * p * p * 0.25);   // risers into cuts
for (const t of [4, 10, 20, 27, 34, 42, 50, 55]) add(bed, t, 0.8, (ts, p) => Math.sin(2 * Math.PI * (58 - 20 * Math.min(1, ts * 3)) * ts) * Math.exp(-p * 5) * 0.75);   // bass hits on cuts
wav(bed, "bed.wav", 3);

// ---- SFX kit
{ const n = make(0.45); let lp = 0; for (let i = 0; i < n.length; i++) { const p = i / n.length; const env = Math.sin(Math.PI * Math.pow(p, 0.7)) ** 2; lp += (0.04 + 0.25 * Math.sin(Math.PI * p)) * (rnd() * 2 - lp); n[i] = lp * env; } wav(n, "whoosh.wav"); }
{ const n = make(0.16); let ph = 0; for (let i = 0; i < n.length; i++) { const p = i / n.length; ph += (2 * Math.PI * (680 - 360 * p)) / SR; n[i] = Math.sin(ph) * Math.exp(-p * 9); } wav(n, "pop.wav"); }
{ const n = make(0.05); let ph = 0; for (let i = 0; i < n.length; i++) { const p = i / n.length; ph += (2 * Math.PI * 1800) / SR; n[i] = Math.sin(ph) * Math.exp(-p * 14); } wav(n, "tick.wav"); }
{ const n = make(0.5); let ph = 0; for (let i = 0; i < n.length; i++) { const p = i / n.length; ph += (2 * Math.PI * (80 - 22 * p)) / SR; n[i] = Math.sin(ph) * Math.exp(-p * 6); } wav(n, "bass.wav"); }
{ const n = make(1.2); for (let i = 0; i < n.length; i++) { const t = i / SR, p = i / n.length; n[i] = (Math.sin(2 * Math.PI * 440 * t) * 0.6 + Math.sin(2 * Math.PI * 660 * t) * 0.3 + Math.sin(2 * Math.PI * 880 * t) * 0.2) * Math.exp(-p * 3.2) * Math.min(1, t * 80); } wav(n, "shimmer.wav"); }
{ const n = make(0.6); for (let i = 0; i < n.length; i++) { const t = i / SR, p = i / n.length; const ring = 0.5 + 0.5 * Math.sin(2 * Math.PI * 23 * t); n[i] = (Math.sin(2 * Math.PI * 920 * t) + Math.sin(2 * Math.PI * 1380 * t) * 0.5) * ring * Math.exp(-p * 2) * 0.5; } wav(n, "ring.wav"); }
