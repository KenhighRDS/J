"""Narration for the voiced promo: free, offline neural TTS (Kokoro-82M, Apache-2.0) through kokoro-onnx.
Setup once:  python3 -m venv .cache/tts && .cache/tts/bin/pip install kokoro-onnx soundfile
Model files in .cache/kokoro/: model.onnx + <voice>.bin from huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX
Run from promo/:  .cache/tts/bin/python scripts/gen-voice.py [voice] [speed]   → public/voice/NN-scene.wav + durations.json"""
import json, os, sys, glob
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
CACHE = os.path.join(ROOT, ".cache", "kokoro"); OUT = os.path.join(ROOT, "public", "voice")
VOICE = sys.argv[1] if len(sys.argv) > 1 else "am_michael"; SPEED = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0

# One line per scene; the composition places each clip at its scene start. Keep it plain and spoken, not read.
LINES = [
    ("logo",     "This is J."),
    ("hook",     "We call it. Your phone rings. You copy. You trade."),
    ("signal",   "One card, nothing to scroll. Entry, stop and target, one tap to copy. Lot size from your balance and your risk. Swipe to take it, and J keeps score."),
    ("call",     "It rings like a call. Lock screen, silent mode, any app. Full screen, until you answer."),
    ("followups","And we stay on the trade. Breakeven, partial close, exit. Every move reaches your phone as a call."),
    ("results",  "Every result is logged. Reports and backtests become share cards. One tap."),
    ("wann",     "On the side, Wann. Football calls above ninety percent, every result scored, in one gallery."),
    ("phones",   "Android rings. iPhone pushes, every thirty seconds, until you open it."),
    ("outro",    "J. Invite only."),
]

def pack_voices():
    npz = os.path.join(CACHE, "voices.npz")
    bins = sorted(glob.glob(os.path.join(CACHE, "*.bin")))
    if not os.path.exists(npz) or os.path.getmtime(npz) < max(os.path.getmtime(b) for b in bins):
        np.savez(npz, **{os.path.basename(b)[:-4]: np.fromfile(b, dtype=np.float32).reshape(-1, 1, 256) for b in bins})
    return npz

def trim(x, sr, thresh_db=-42, pad=0.06):
    a = np.abs(x); lim = 10 ** (thresh_db / 20) * max(a.max(), 1e-6); idx = np.where(a > lim)[0]
    if len(idx) == 0: return x
    s = max(0, idx[0] - int(pad * sr)); e = min(len(x), idx[-1] + int(pad * sr)); return x[s:e]

def main():
    os.makedirs(OUT, exist_ok=True)
    k = Kokoro(os.path.join(CACHE, "model.onnx"), pack_voices())
    durations = {}
    for i, (name, text) in enumerate(LINES, 1):
        samples, sr = k.create(text, voice=VOICE, speed=SPEED, lang="en-us")
        samples = trim(np.asarray(samples, dtype=np.float32), sr)
        samples = samples / max(np.abs(samples).max(), 1e-6) * 0.89          # consistent peak across clips
        path = os.path.join(OUT, f"{i:02d}-{name}.wav"); sf.write(path, samples, sr)
        durations[name] = round(len(samples) / sr, 3); print(f"{i:02d}-{name}.wav  {durations[name]:.2f}s  {text}")
    json.dump({"voice": VOICE, "speed": SPEED, "seconds": durations}, open(os.path.join(OUT, "durations.json"), "w"), indent=2)

main()
