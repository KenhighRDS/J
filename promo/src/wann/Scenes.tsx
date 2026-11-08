// Wann partnership video: what Wann is inside J, then how to take a call on Kalshi. Sound effects only.
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Phone } from "../components/Phone";
import { Entrance, clamp } from "../components/Motion";
import { Switcher, type View } from "../howto/Kit";
import { FONT } from "../fonts";
import { theme } from "../theme";
import layout from "../../public/ui/wann/layout.json";
import { Chalk, Flip, Headline, Line, Lockup, Logical, P, PHONE_TOP, PW, SH, Sfx, Shot, Tap, out, ring } from "./Kit";
import { KMarket, KOrder, KSearch, NO_X, ORDER_BUTTON, ORDER_CHIP10, ROW_Y, YES_X, type OrderStage } from "./Kalshi";

const PhoneAt: React.FC<{ children: React.ReactNode; src?: string; scrollTo?: [number, number, number, number] }> = ({ children, src, scrollTo }) => (
  <div style={{ position: "absolute", top: PHONE_TOP, left: "50%", transform: "translateX(-50%)" }}>
    <Entrance delay={2} rise={70} config={theme.spring.smooth}><Phone width={PW} src={src} scrollTo={scrollTo}>{children}</Phone></Entrance>
  </div>
);
const box = (fx: number, fy: number, fw: number, fh: number) => { const a = out(fx, fy); return ring(a.x, a.y, fw * PW, fh * SH); };
const lg = (x: number, y: number) => ({ fx: x / 390, fy: y / 844 });
const centerCircle = (r: number, cy = 860) => `M ${540 + r} ${cy} A ${r} ${r} 0 1 1 ${540 - r} ${cy} A ${r} ${r} 0 1 1 ${540 + r} ${cy}`;

// ------------------------------------------------------------------ 1 intro
export const WIntro: React.FC = () => (
  <AbsoluteFill>
    <Chalk d={`M -20 860 L 1100 860`} at={2} dur={18} width={6} opacity={0.75} />
    <Chalk d={centerCircle(340)} at={6} dur={24} width={6} opacity={0.75} />
    <div style={{ position: "absolute", top: 250, left: 0, right: 0, textAlign: "center" }}><Entrance delay={30} rise={40}><div style={{ fontFamily: "Big Shoulders Promo", fontWeight: 900, fontSize: 170, letterSpacing: 2, color: P.chalk, lineHeight: 0.9 }}>J × WANN</div></Entrance></div>
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", top: -200 }}><Lockup size={190} at={16} /></AbsoluteFill>
    <Line text="Wann's football calls, now inside J." at={40} top={1290} size={50} align="center" />
    <Sfx at={4} file="chalk.wav" volume={0.35} /><Sfx at={16} file="ball.wav" volume={0.6} /><Sfx at={22} file="ball.wav" volume={0.5} />
  </AbsoluteFill>
);

// ------------------------------------------------------------------ 2 Wann rates every game
export const WRating: React.FC = () => (
  <AbsoluteFill>
    <Headline text="Every game, rated" at={4} />
    <Line text="Only calls Wann rates at 90% or higher are sent to you." at={14} />
    <AbsoluteFill style={{ alignItems: "center", top: 700, bottom: "auto", height: 420 }}><Flip text="90%+" at={20} size={300} /></AbsoluteFill>
    <Chalk d={`M 150 1180 C 400 1166, 700 1192, 930 1176`} at={62} dur={16} width={7} color={P.flood} />
    <Line text="Everything below the line stays out of your phone." at={70} top={1230} size={38} align="center" />
    {[30, 34, 38, 42].map((a) => <Sfx key={a} at={a} file="flip.wav" volume={0.35} />)}
    <Sfx at={62} file="chalk.wav" volume={0.3} />
  </AbsoluteFill>
);

// ------------------------------------------------------------------ 3 new calls ring
const Lock: React.FC<{ drop: number; pulse: boolean }> = ({ drop, pulse }) => {
  const f = useCurrentFrame();
  return (
    <Logical>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 80% at 30% 10%, #23302a 0%, #0e1311 55%, #050605 100%)", fontFamily: FONT, color: "#fff" }}>
        <div style={{ position: "absolute", top: 92, left: 0, right: 0, textAlign: "center" }}><div style={{ fontSize: 15, opacity: 0.75 }}>Sunday, 9 November</div><div style={{ fontSize: 86, fontWeight: 600, letterSpacing: -3, lineHeight: 1.05 }}>17:48</div></div>
        {pulse && [0, 1].map((i) => { const t = ((f + i * 18) % 36) / 36; return <div key={i} style={{ position: "absolute", left: 12, right: 12, top: 250, height: 104, borderRadius: 22, border: `2px solid ${P.flood}`, opacity: (1 - t) * 0.7, transform: `scale(${1 + t * 0.08})` }} />; })}
        <div style={{ position: "absolute", left: 12, right: 12, top: 250, transform: `translateY(${(1 - drop) * -260}px)`, opacity: drop, borderRadius: 22, background: "rgba(44,46,48,0.94)", padding: "14px 16px", boxShadow: "0 10px 30px rgba(0,0,0,0.4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.65)" }}><Img src={staticFile("logo-mono.png")} style={{ width: 18, height: 18 }} />J · now</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginTop: 8 }}>Wann · 8 new games 90%+</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", marginTop: 3 }}>Tap to see the calls for the next 7 days</div>
        </div>
      </div>
    </Logical>
  );
};
export const WAlert: React.FC = () => {
  const f = useCurrentFrame(); const drop = interpolate(f, [16, 30], [0, 1], { ...clamp, easing: theme.ease.out }); const TAP = 92;
  return (
    <AbsoluteFill>
      <Headline text="New calls ring" at={2} />
      <Line text="When Wann has new games, J alerts you. Tap to open them." at={10} />
      <PhoneAt>
        <Switcher views={[{ at: 0, node: <Lock drop={drop} pulse={f > 30 && f < TAP} /> }, { at: TAP + 8, up: true, node: <Shot src="w-gallery" /> }]} />
        <Tap at={TAP} fx={0.5} fy={(250 + 52) / 844} />
      </PhoneAt>
      <Sfx at={16} file="chime.wav" volume={0.45} /><Sfx at={TAP} file="tap.wav" volume={0.5} /><Sfx at={TAP + 8} file="air.wav" volume={0.3} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ 4 the Wann tab
export const WGallery: React.FC = () => (
  <AbsoluteFill>
    <Headline text="The Wann tab" at={2} />
    <Line text="A week of calls, grouped day by day." at={8} until={60} />
    <Line text="Wann's probability on every game." at={66} until={118} />
    <Line text="Tap a game to open its call." at={124} />
    <PhoneAt src="ui/wann/w-gallery-tall.png" scrollTo={[110, 160, 0, 820]}>
      <Tap at={170} fx={0.28} fy={0.36} />
    </PhoneAt>
    <Chalk d={box(0.02, 0.118, 0.96, 0.04)} at={18} until={62} dur={18} width={6} color={P.flood} />
    <Chalk d={box(0.33, 0.315, 0.13, 0.04)} at={70} until={104} dur={16} width={6} color={P.flood} />
    <Sfx at={18} file="chalk.wav" volume={0.3} /><Sfx at={70} file="chalk.wav" volume={0.3} /><Sfx at={110} file="air.wav" volume={0.25} /><Sfx at={170} file="tap.wav" volume={0.5} />
  </AbsoluteFill>
);

// ------------------------------------------------------------------ 5 open a call
const L = layout;
export const WCall: React.FC = () => (
  <AbsoluteFill>
    <Headline text="Open a call" at={2} />
    <Line text="Wann's pick and how sure it is." at={8} until={84} />
    <Line text="The kick-off countdown, and every detail to copy." at={90} />
    <PhoneAt><Shot src="w-call" /></PhoneAt>
    <Chalk d={box(0.05, 0.155, 0.9, 0.14)} at={22} until={86} dur={18} width={6} color={P.flood} />
    <Chalk d={box(0.03, 0.105, 0.45, 0.024)} at={96} dur={16} width={6} color={P.flood} />
    <Sfx at={22} file="chalk.wav" volume={0.3} /><Sfx at={96} file="chalk.wav" volume={0.3} />
  </AbsoluteFill>
);

// ------------------------------------------------------------------ 6 step 1: copy the pick
export const WCopy: React.FC = () => {
  const pick = { fx: L.pick.x + L.pick.w * 0.5, fy: L.pick.y + L.pick.h / 2 };
  return (
    <AbsoluteFill>
      <Headline text="Copy the pick" at={2} kit="1" />
      <Line text="Tap Pick in the call. That's what you'll bet on." at={10} />
      <PhoneAt><Switcher views={[{ at: 0, node: <Shot src="w-call" /> }, { at: 44, node: <Shot src="w-call-copied" /> }]} /><Tap at={42} fx={pick.fx} fy={pick.fy} /></PhoneAt>
      <Chalk d={box(L.pick.x, L.pick.y, L.pick.w, L.pick.h)} at={50} dur={16} width={6} color={P.flood} />
      <Sfx at={42} file="tap.wav" volume={0.5} /><Sfx at={50} file="chalk.wav" volume={0.3} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ 7 step 2: Kalshi
const K = { toK: 12, type0: 26, result: 74, tapResult: 90, market: 98, ringYes: 112, tapYes: 150, sheet: 158, tapChip: 222, ten: 224, tapReview: 262, review: 266, tapPlace: 318, done: 324, end: 390 };
export const WKalshi: React.FC = () => {
  const f = useCurrentFrame();
  const typed = Math.max(0, Math.min(11, Math.floor((f - K.type0) / 4)));
  const rise = interpolate(f, [K.sheet, K.sheet + 14], [0, 1], { ...clamp, easing: theme.ease.out });
  const stage: OrderStage = f >= K.done ? "done" : f >= K.review ? "review" : "amount";
  const amount = f >= K.ten ? 10 : 0;
  const market = (press?: "home-yes") => <Logical bg="#fff"><KMarket press={press} />{f >= K.sheet && <KOrder rise={rise} amount={amount} stage={stage} pressChip={f >= K.tapChip && f < K.tapChip + 6} pressReview={(f >= K.tapReview && f < K.tapReview + 5) || (f >= K.tapPlace && f < K.done)} />}</Logical>;
  const views: View[] = [
    { at: 0, node: <Shot src="w-call-copied" /> },
    { at: K.toK, dir: 1, node: <Logical bg="#fff"><KSearch typed={typed} result={f >= K.result} pressed={f >= K.tapResult && f < K.market} /></Logical> },
    { at: K.market, up: true, node: market(f >= K.tapYes && f < K.sheet + 6 ? "home-yes" : undefined) },
  ];
  const yes = lg(YES_X, ROW_Y(0));
  return (
    <AbsoluteFill>
      <Headline text="Bet it on Kalshi" at={2} kit="2" />
      <Line text="Open Kalshi and search the match." at={8} until={96} />
      <Line text="Tap Yes on the team Wann picked." at={102} until={196} />
      <Line text="Choose your amount. A winning contract pays $1." at={202} until={286} />
      <Line text="Review, then place the order." at={292} />
      <PhoneAt>
        <Switcher views={views} />
        <Tap at={K.tapResult} fx={0.5} fy={(112 + 26 + 60) / 844} />
        <Tap at={K.tapYes} fx={yes.fx} fy={yes.fy} />
        <Tap at={K.tapChip} fx={ORDER_CHIP10.x / 390} fy={ORDER_CHIP10.y / 844} />
        <Tap at={K.tapReview} fx={ORDER_BUTTON.x / 390} fy={ORDER_BUTTON.y / 844} />
        <Tap at={K.tapPlace} fx={ORDER_BUTTON.x / 390} fy={ORDER_BUTTON.y / 844} />
      </PhoneAt>
      <Chalk d={box((YES_X - 37) / 390, (ROW_Y(0) - 21) / 844, 74 / 390, 42 / 844)} at={K.ringYes} until={K.sheet - 4} dur={16} width={6} color={P.flood} />
      <Sfx at={K.toK} file="air.wav" volume={0.3} />
      {Array.from({ length: 11 }, (_, i) => <Sfx key={i} at={K.type0 + i * 4} file="type.wav" volume={0.22} />)}
      <Sfx at={K.tapResult} file="tap.wav" volume={0.5} /><Sfx at={K.market} file="air.wav" volume={0.25} /><Sfx at={K.ringYes} file="chalk.wav" volume={0.3} />
      <Sfx at={K.tapYes} file="tap.wav" volume={0.5} /><Sfx at={K.sheet} file="air.wav" volume={0.25} /><Sfx at={K.tapChip} file="tap.wav" volume={0.5} />
      <Sfx at={K.tapReview} file="tap.wav" volume={0.5} /><Sfx at={K.tapPlace} file="tap.wav" volume={0.5} /><Sfx at={K.done} file="success.wav" volume={0.42} />
    </AbsoluteFill>
  );
};
export const KALSHI_LEN = K.end;

// ------------------------------------------------------------------ 8 tip: home or draw
export const WDraw: React.FC = () => {
  const f = useCurrentFrame(); const no = lg(NO_X, ROW_Y(2));
  return (
    <AbsoluteFill>
      <Headline text="Home or draw?" at={2} />
      <Line text="Buy No on the away team. It pays on a home win or a draw." at={8} until={96} />
      <PhoneAt><Logical bg="#fff"><KMarket press={f >= 74 ? "away-no" : undefined} /></Logical><Tap at={72} fx={no.fx} fy={no.fy} /></PhoneAt>
      <Chalk d={box((NO_X - 37) / 390, (ROW_Y(2) - 21) / 844, 74 / 390, 42 / 844)} at={34} dur={16} width={6} color={P.flood} />
      <Line text="So “Real Madrid or draw” means No on Getafe." at={102} />
      <Sfx at={34} file="chalk.wav" volume={0.3} /><Sfx at={72} file="tap.wav" volume={0.5} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ 9 step 3: swipe I took it
export const WSwipe: React.FC = () => {
  const f = useCurrentFrame(); const k = { fx: L.knob.x + L.knob.w / 2, fy: L.knob.y + L.knob.h / 2 }; const end = L.track.x + L.track.w - L.knob.w / 2 - 0.012;
  const glow = interpolate(f, [82, 92, 130], [0, 1, 0.4], clamp);
  return (
    <AbsoluteFill>
      <Headline text="Swipe: I took it" at={2} kit="3" />
      <Line text="Back in J. That's how J keeps your record." at={10} />
      <PhoneAt>
        <Switcher views={[{ at: 0, node: <Shot src="w-call-copied" /> }, { at: 66, node: <Shot src="w-call-swipe" /> }, { at: 82, node: <Shot src="w-call-taken" /> }]} />
        <Tap at={52} fx={k.fx} fy={k.fy} hold={28} drag={{ fx: end, from: 52, to: 80 }} />
        <div style={{ position: "absolute", left: "50%", top: k.fy * SH, width: PW * 0.9, height: 118, transform: "translate(-50%,-50%)", borderRadius: 60, border: `4px solid rgba(255,212,71,${0.9 * glow})`, boxShadow: `0 0 ${50 * glow}px rgba(255,212,71,${0.45 * glow})` }} />
      </PhoneAt>
      <Sfx at={54} file="air.wav" volume={0.3} /><Sfx at={82} file="success.wav" volume={0.4} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ 10 every call is scored
export const WResults: React.FC = () => (
  <AbsoluteFill>
    <Headline text="Every call scored" at={2} />
    <Line text="After the final whistle: the score, won or lost." at={8} until={72} />
    <Line text="Forgot to swipe? J asks if you caught it." at={78} />
    <PhoneAt><Shot src="w-call-won" /></PhoneAt>
    <Chalk d={box(0.03, 0.105, 0.22, 0.024)} at={26} dur={16} width={6} color={P.flood} />
    <Sfx at={26} file="chalk.wav" volume={0.3} />
  </AbsoluteFill>
);

// ------------------------------------------------------------------ 11 end
export const WEnd: React.FC = () => {
  const f = useCurrentFrame(); const fade = interpolate(f, [104, 118], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <Chalk d={centerCircle(300, 800)} at={2} dur={24} width={6} opacity={0.75} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", top: -320 }}><Lockup size={170} at={8} /></AbsoluteFill>
      <div style={{ position: "absolute", top: 1230, left: 0, right: 0, textAlign: "center" }}>
        <Entrance delay={24}><div style={{ fontFamily: "Big Shoulders Promo", fontWeight: 900, fontSize: 112, color: P.chalk, textTransform: "uppercase", letterSpacing: 1, lineHeight: 0.95 }}>Copy. Bet. Swipe.</div></Entrance>
      </div>
      <Line text="Wann's football calls, straight to your phone." at={40} top={1380} size={42} align="center" />
      <Sfx at={2} file="chalk.wav" volume={0.3} /><Sfx at={8} file="ball.wav" volume={0.55} /><Sfx at={20} file="crowd.wav" volume={0.3} />
    </AbsoluteFill>
  );
};
