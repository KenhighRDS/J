# J promo video

A 60-second vertical (1080×1920, 30 fps) motion-graphics promo built with Remotion. It lives apart from the app: nothing in here is bundled into J, and the app code is not touched.

What it uses
- Real screens captured from the app's dev preview routes (`public/ui/*.png`, captured by `npm run shots` with the app's dev server) and the live login page.
- The Android call screen recreated from `activity_signal_alert.xml`; iPhone push banners recreated.
- The app's own fonts (`public/fonts`, from the app's fontsource packages) and palette (`src/theme.ts`).
- An original synthwave music bed (105 BPM) and sound-effect kit (`npm run audio` writes `public/sfx/*.wav`; nothing is downloaded, nothing licensed).
- Four compositions: `JPromo` (music only), `JPromoVoice`, and `JPromoSfx` / `JPromoVoiceSfx` without any music bed (sound effects only, for adding your own track in an editor); `JPromoVoice` (same cut with a natural male narration; the signal scene runs one second longer). Narration is generated offline with Kokoro-82M (Apache-2.0) via `scripts/gen-voice.py`; the clips are committed in `public/voice/` so rendering needs no model. To change a line: edit `LINES` in the script, run `npm run voice` (setup in the script header), re-render.
- Optional licensed song: put one audio file in `public/music/` (gitignored, never committed) and it replaces the bed on the next render, with a fade in and out. `MUSIC_START` / `MUSIC_VOLUME` in `src/JPromo.tsx` set the offset and level.

Commands (run inside `promo/`)
```bash
npm install          # Remotion and React
npm run audio        # synthesize public/sfx (gitignored, deterministic)
npm run voice        # regenerate public/voice narration (needs .cache/tts venv + .cache/kokoro model, see scripts/gen-voice.py)
npm run render:voice # narrated cut → out/j-promo-voice.mp4
npm run shots        # optional: recapture the real UI from the app's dev server (needs the app's deps installed)
npm run studio       # interactive preview
npm run render       # out/j-promo.mp4, H.264, CRF 17
```
Remotion downloads its own Chrome Headless Shell on first render (`npx remotion browser ensure`).

Structure: `src/Root.tsx` registers the `JPromo` composition; `src/JPromo.tsx` sequences the nine scenes with transitions and places the sound cues; `src/scenes/*` are the scenes; `src/components/*` the layer stack (mesh, grade, grain, vignette), motion primitives and the phone frame.

The skills that guided it are in `.claude/skills/remotion-motion-graphics` and `.claude/skills/remotion-video`.

## How-to video (`JHowTo`)

51 s, 1080×1920, sound effects only (no music bed), for showing members how to take a signal: the call, MetaTrader 5 Quotes → symbol → Trade, copy each value in J and paste it into Volume, Stop Loss and Take Profit, Buy by Market, then swipe “I took it” in J. Two tips follow: pending orders (pick Buy Stop or Buy Limit, paste the entry as Price, Place) and the “Did you catch it?” question for anyone who forgot to swipe.

- The J screens are real captures: `npm run shots:howto` drives the dev preview (copy taps, the swipe) and writes `public/ui/howto/*.png` plus `layout.json` with the row and knob positions the taps line up to.
- The MetaTrader 5 screens are recreated in `src/howto/Mt5.tsx` (light theme, Roboto) following the standard MT5 mobile layout; labels can differ slightly by MT5 version or broker.
- Render: `npm run render:howto` → `out/j-howto.mp4`.

## Wann video (`JWann`)

59 s, 1080×1920, sound effects only (no music bed), in its own look: a floodlit pitch with mown stripes, chalk lines that draw themselves, Big Shoulders Display and Archivo, a split-flap scoreboard number and a mowing wipe between scenes. It covers the Wann side of J (90%+ calls, the alert, the Wann tab, the call card, scoring) and how to take a call on Kalshi: copy the pick, search the match, buy Yes on Wann's team (No on the away team for a "home or draw" call), then swipe "I took it" in J.

- `npm run audio:wann` writes the soft effect kit to `public/sfx-wann/` (gitignored); every file peaks at -12 dBFS and the mix peaks around -14 dBFS, about 9 dB under the other videos.
- `npm run shots:wann` recaptures the real Wann screens from the app's dev previews (`/__preview/wann?min=90`, `/__preview/wann-call`) into `public/ui/wann/`.
- The Kalshi screens are recreated in `src/wann/Kalshi.tsx` without Kalshi artwork; prices, fees and payout follow Kalshi's rules ($1 per winning contract) but the layout is an approximation.
- Render: `npm run render:wann` → `out/j-wann.mp4`.
