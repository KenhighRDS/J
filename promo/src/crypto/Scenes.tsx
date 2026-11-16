// Scenes of the RDS Academy × J crypto video. Each scene is a full frame with its own entrances and exits; the aperture
// cut between them lives in CryptoVideo. The phone shows the real app (scripts/capture-crypto.cjs) with its own preview
// picks, marked "Example" on screen: the XRP pick is what the rules produce replayed on 10 July 2025, and the companies
// holding Bitcoin are CoinGecko's public figures of 14 November 2026. No past result is claimed anywhere.
import React from "react";
import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Card, Check, Coin, Head, JIcon, Moon, N, Phone, Pill, Ping, Rise, SIDE, Screen, Sfx, Sub, clamp, grot, mono, sans } from "./Kit";

const center: React.CSSProperties = { position: "absolute", left: 0, right: 0, display: "flex", justifyContent: "center" };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------- 1. Intro: a coin spins in, becomes the moon that carries the RDS logo, and J joins it ----------
export const INTRO = 210;
const FACES = ["BTC", "ETH", "XRP", "SOL"];
export const SIntro: React.FC = () => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const land = spring({ frame: f - 3, fps, config: N.spring.bouncy });
  const turn = interpolate(f, [3, 52], [0, Math.PI * 4], { ...clamp, easing: N.ease.out });
  const face = FACES[Math.floor((turn + Math.PI / 2) / Math.PI) % FACES.length];
  const morph = spring({ frame: f - 54, fps, config: N.spring.smooth });
  const size = lerp(270, 580, morph), cy = lerp(900, 610, morph);
  const logo = interpolate(f, [64, 82], [0, 1], { ...clamp, easing: N.ease.out });
  const exit = interpolate(f, [194, 203], [0, 1], { ...clamp, easing: N.ease.in });
  const x = spring({ frame: f - 86, fps, config: N.spring.snappy });
  const breathe = 1 + Math.sin(f / 26) * 0.008;
  return (
    <AbsoluteFill>
      <Ping at={3} x={540} y={900} r={640} dur={40} />
      <Ping at={56} x={540} y={610} r={760} dur={44} color={N.moon} width={3} count={1} />
      <div style={{ position: "absolute", left: 540 - size / 2, top: cy - size / 2 - exit * 30, width: size, height: size, opacity: Math.min(1, land * 1.6) * (1 - exit), transform: `scale(${lerp(0.3, 1, land) * breathe * (1 - exit * 0.05)})` }}>
        <div style={{ position: "absolute", inset: 0, opacity: Math.min(1, morph * 1.5) }}><Moon size={size} logo={logo} /></div>
        <div style={{ position: "absolute", inset: 0, opacity: 1 - Math.min(1, morph * 1.9) }}><Coin size={size} label={face} turn={turn} glow={1} /></div>
      </div>
      <div style={{ ...center, top: 934, opacity: Math.min(1, x * 1.5) * (1 - exit), transform: `scale(${lerp(0.3, 1, x)}) rotate(${(1 - x) * -90}deg)` }}>
        <span style={{ ...grot(84, N.soft), fontWeight: 400, lineHeight: 1 }}>×</span>
      </div>
      <div style={{ ...center, top: 1046 }}><Rise at={94} until={194} rise={50} from={0.7} config={N.spring.bouncy}><JIcon size={176} /></Rise></div>
      <Head text="Crypto picks, / now inside *J*." at={110} until={194} top={1310} size={104} align="center" />
      <Sub text="From RDS Academy, straight to your phone." at={134} until={194} top={1570} align="center" />
      <Sfx at={3} file="ping.wav" volume={0.34} /><Sfx at={5} file="clink.wav" volume={0.3} /><Sfx at={50} file="swell.wav" volume={0.22} /><Sfx at={57} file="sub.wav" volume={0.42} />
      <Sfx at={86} file="pop.wav" volume={0.26} /><Sfx at={94} file="pop.wav" volume={0.3} /><Sfx at={110} file="tick.wav" volume={0.24} />
    </AbsoluteFill>
  );
};

// ---------- 2. The scan: 90 coins on a radar, the sweep passes, one is left ----------
export const SCAN = 340;
const RC = { x: 540, y: 1100, r: 372 };
const KEEP = { ang: 306, rr: 214, size: 28 };
const DOTS = Array.from({ length: 90 }, (_, i) => (i === 0 ? KEEP : { ang: random(`ca${i}`) * 360, rr: 64 + Math.sqrt(random(`cr${i}`)) * 292, size: 15 + random(`cs${i}`) * 11 }));
const at = (ang: number, rr: number) => ({ x: RC.r + rr * Math.sin((ang * Math.PI) / 180), y: RC.r - rr * Math.cos((ang * Math.PI) / 180) });
export const SScan: React.FC = () => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const grid = spring({ frame: f - 40, fps, config: N.spring.smooth });
  const theta = interpolate(f, [116, 240], [0, 360], { ...clamp, easing: N.ease.glide });
  const sweep = interpolate(f, [108, 120, 236, 248], [0, 1, 1, 0], { ...clamp, easing: N.ease.glide });
  const found = spring({ frame: f - 250, fps, config: N.spring.bouncy });
  const exit = interpolate(f, [322, 331], [0, 1], { ...clamp, easing: N.ease.in });
  const k = at(KEEP.ang, KEEP.rr);
  const stat = (label: string, value: number, start: number, gold: boolean) => (
    <Rise at={start} until={322} rise={40} style={{ flex: 1 }}>
      <Card style={{ padding: "26px 34px 22px" }}>
        <div style={sans(30, 500, N.faint)}>{label}</div>
        <div style={{ ...mono(88, gold ? N.gold : N.text), lineHeight: 1.1 }}>{value}</div>
      </Card>
    </Rise>
  );
  return (
    <AbsoluteFill>
      <Head text="The market / never *sleeps*." at={6} until={322} top={236} size={116} />
      <Sub text="Every day, J checks the 90 most traded coins." at={30} until={246} top={516} />
      <Sub text="Only the strongest is sent. Some days, none." at={258} until={322} top={516} color={N.text} />
      <div style={{ position: "absolute", left: RC.x - RC.r, top: RC.y - RC.r, width: RC.r * 2, height: RC.r * 2, opacity: 1 - exit, transform: `scale(${1 - exit * 0.06})` }}>
        {[1, 0.66, 0.33].map((s, i) => { const p = spring({ frame: f - 40 - i * 5, fps, config: N.spring.smooth }); return <div key={s} style={{ position: "absolute", left: RC.r * (1 - s), top: RC.r * (1 - s), width: RC.r * 2 * s, height: RC.r * 2 * s, borderRadius: "50%", border: `2px solid ${N.line}`, boxSizing: "border-box", opacity: p, transform: `scale(${lerp(0.7, 1, p)})` }} />; })}
        <div style={{ position: "absolute", left: 0, top: RC.r - 1, width: "100%", height: 2, background: N.hair, opacity: grid, transform: `scaleX(${grid})` }} />
        <div style={{ position: "absolute", top: 0, left: RC.r - 1, height: "100%", width: 2, background: N.hair, opacity: grid, transform: `scaleY(${grid})` }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", opacity: sweep, background: `conic-gradient(from ${theta - 58}deg at 50% 50%, transparent 0deg, ${N.goldVeil} 58deg, transparent 58.6deg)` }} />
        <div style={{ position: "absolute", left: RC.r - 1.5, top: 0, width: 3, height: RC.r, background: N.gold, opacity: sweep, transform: `rotate(${theta}deg)`, transformOrigin: "50% 100%", borderRadius: 2 }} />
        {DOTS.map((d, i) => {
          const p = spring({ frame: f - 52 - i * 0.7, fps, config: N.spring.snappy });
          if (p <= 0) return null;
          const pos = at(d.ang, d.rr), passed = f > 116 ? Math.min(1, Math.max(0, (theta - d.ang) / 16)) : 0, keep = i === 0;
          const s = keep ? p * (1 + found * 1.9) : p * (1 - passed * 0.35);
          return (
            <div key={i} style={{ position: "absolute", left: pos.x - d.size / 2, top: pos.y - d.size / 2 + Math.sin(f / 30 + i) * 1.6, width: d.size, height: d.size, opacity: keep ? 1 : 1 - passed * 0.82, transform: `scale(${s})`, zIndex: keep ? 2 : 1 }}>
              <Coin size={d.size} tone="pale" />
              {keep && <div style={{ position: "absolute", inset: 0, opacity: Math.min(1, found * 1.4) }}><Coin size={d.size} glow={found * 0.6} /></div>}
            </div>
          );
        })}
        <Ping at={250} x={k.x} y={k.y} r={300} dur={40} />
        <div style={{ position: "absolute", left: k.x + 62, top: k.y - 30 }}><Rise at={264} until={322} rise={18} from={0.8} config={N.spring.snappy}><Pill tone="solid" size={28}>Passes every rule</Pill></Rise></div>
      </div>
      <div style={{ position: "absolute", left: SIDE, right: SIDE, top: 1520, display: "flex", gap: 24 }}>
        {stat("Coins checked", Math.round((theta / 360) * 90), 96, false)}
        {stat("Sent to you", f >= 250 ? 1 : 0, 102, f >= 250)}
      </div>
      <Sfx at={6} file="sub.wav" volume={0.3} /><Sfx at={40} file="ping.wav" volume={0.22} />
      {Array.from({ length: 12 }, (_, i) => <Sfx key={i} at={122 + i * 10} file="tick.wav" volume={0.13} />)}
      <Sfx at={250} file="shimmer.wav" volume={0.34} /><Sfx at={251} file="clink.wav" volume={0.22} /><Sfx at={264} file="pop.wav" volume={0.22} />
    </AbsoluteFill>
  );
};

// ---------- 3. The notification, and the pick opening ----------
export const ALERT = 300;
export const SAlert: React.FC = () => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const drop = spring({ frame: f - 62, fps, config: N.spring.bouncy });
  const shake = f >= 62 && f < 84 ? Math.sin((f - 62) * 2.6) * 7 * (1 - (f - 62) / 22) : 0;
  const press = interpolate(f, [148, 152, 158], [0, 1, 0], { ...clamp, easing: N.ease.glide });
  const gone = interpolate(f, [156, 166], [0, 1], { ...clamp, easing: N.ease.in });
  const open = spring({ frame: f - 160, fps, config: N.spring.smooth });
  const scroll = interpolate(f, [196, 284], [0, 96], { ...clamp, easing: N.ease.glide });
  const push = interpolate(f, [168, 284], [0, 1], { ...clamp, easing: N.ease.glide });            // once the pick is open, move in on it
  return (
    <AbsoluteFill>
      <Head text="A pick *rings* / your phone." at={6} until={284} top={230} size={112} />
      <Sub text="After each daily close, if a coin makes the cut." at={30} until={284} top={506} />
      <Ping at={62} x={540} y={1010} r={700} dur={44} />
      <div style={{ ...center, top: 690 }}>
        <Rise at={24} until={284} rise={110} from={0.92} config={N.spring.heavy} float={3}>
          <div style={{ transform: `translateX(${shake}px) rotate(${shake * 0.08}deg) scale(${1 + push * 0.2})`, transformOrigin: "50% 0%" }}>
            <Phone width={600}>
              <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${N.panelHi} 0%, ${N.deep} 60%, ${N.night} 100%)`, opacity: 1 - open }}>
                <div style={{ position: "absolute", left: 0, right: 0, top: 86, textAlign: "center", ...mono(78, N.text), fontWeight: 500 }}>9:41</div>
                <div style={{ position: "absolute", left: 0, right: 0, top: 182, textAlign: "center", ...sans(17, 500, N.soft) }}>Monday</div>
              </div>
              <div style={{ position: "absolute", inset: 0, transform: `translateY(${(1 - open) * 844}px)` }}><Screen src="c-coin.png" scroll={scroll} /></div>
            </Phone>
          </div>
        </Rise>
      </div>
      {f >= 62 && gone < 1 && (
        <div style={{ position: "absolute", left: 118, right: 118, top: 1010, opacity: Math.min(1, drop * 1.5) * (1 - gone), transform: `translateY(${(1 - drop) * -170 - gone * 60}px) scale(${lerp(0.9, 1, drop) * (1 - press * 0.035) * (1 - gone * 0.1)})` }}>
          <div style={{ display: "flex", gap: 26, padding: "30px 34px", borderRadius: 40, background: N.panelSolid, border: `1.5px solid ${N.line}`, boxShadow: N.shadow }}>
            <JIcon size={88} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={sans(30, 600, N.soft)}>J</span><span style={sans(28, 450, N.faint)}>now</span></div>
              <div style={{ ...sans(42, 680), lineHeight: 1.2 }}>New crypto pick: XRP</div>
              <div style={{ ...sans(33, 450, N.soft), marginTop: 8 }}>Closed at its highest close in 56 days, up 6% on 2× its usual volume.</div>
            </div>
          </div>
        </div>
      )}
      <Ping at={150} x={540} y={1130} r={150} dur={22} width={5} count={1} />
      <div style={{ position: "absolute", right: SIDE, top: 548 }}><Rise at={178} until={284} rise={24} from={0.8} config={N.spring.snappy}><Pill tone="solid" size={28}>Example pick</Pill></Rise></div>
      <Sfx at={6} file="sub.wav" volume={0.3} /><Sfx at={62} file="buzz.wav" volume={0.32} /><Sfx at={66} file="ding.wav" volume={0.36} /><Sfx at={150} file="tap.wav" volume={0.34} /><Sfx at={160} file="whoosh.wav" volume={0.22} />
    </AbsoluteFill>
  );
};

// ---------- 4. What a pick page holds: the real page scrolls, a gold frame follows each part ----------
export const PARTS = 440;
const STEPS: { label: string; on: number; scroll: number; box: [number, number] }[] = [
  { label: "The plan", on: 86, scroll: 164, box: [302, 540] },
  { label: "Why J picked it", on: 146, scroll: 399, box: [538, 866] },
  { label: "What it is", on: 206, scroll: 724, box: [864, 1080] },
  { label: "Key facts", on: 262, scroll: 938, box: [1078, 1404] },
  { label: "The risks", on: 314, scroll: 961, box: [1402, 1612] },
];
const HOLD = { label: "Who holds it", on: 370, scroll: 1050, box: [1198, 1530] as [number, number] };   // on the Bitcoin page
const LIST6 = [...STEPS, HOLD];
export const SParts: React.FC = () => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  let scroll = 0, top = 0, bottom = 0, shown = 0;
  STEPS.forEach((s, i) => {                                  // each part glides in from the one before it
    const p = interpolate(f, [s.on - 10, s.on + 14], [0, 1], { ...clamp, easing: N.ease.inOut });
    const from = i === 0 ? { scroll: 0, box: s.box } : STEPS[i - 1];
    if (p > 0) { scroll = lerp(from.scroll, s.scroll, p); top = lerp(from.box[0], s.box[0], p); bottom = lerp(from.box[1], s.box[1], p); }
    if (i === 0) shown = spring({ frame: f - s.on, fps, config: N.spring.snappy });
  });
  const other = spring({ frame: f - HOLD.on + 12, fps, config: N.spring.smooth });          // the Bitcoin page slides in
  const held = spring({ frame: f - HOLD.on, fps, config: N.spring.snappy });
  const frame: React.CSSProperties = { position: "absolute", left: 7, width: 376, borderRadius: 18, border: `2.5px solid ${N.gold}`, boxSizing: "border-box", boxShadow: `0 0 26px ${N.goldGlow}` };
  return (
    <AbsoluteFill>
      <Head text="Everything you / need to *decide*." at={6} until={424} top={230} size={104} />
      <div style={{ position: "absolute", left: 470, top: 570 }}>
        <Rise at={22} until={424} rise={120} from={0.92} config={N.spring.heavy} float={3}>
          <Phone width={540}>
            <div style={{ position: "absolute", inset: 0, opacity: 1 - other, transform: `translateX(${-other * 110}px)` }}>
              <Screen src="c-coin.png" scroll={scroll} />
              <div style={{ ...frame, top: top - scroll, height: bottom - top, opacity: Math.min(1, shown * 1.4), transform: `scale(${lerp(1.08, 1, shown)})` }} />
            </div>
            <div style={{ position: "absolute", inset: 0, background: N.black, transform: `translateX(${(1 - other) * 390}px)` }}>
              <Screen src="c-coin-long.png" scroll={HOLD.scroll} />
              <div style={{ ...frame, top: HOLD.box[0] - HOLD.scroll, height: HOLD.box[1] - HOLD.box[0], opacity: Math.min(1, held * 1.4), transform: `scale(${lerp(1.08, 1, held)})` }} />
            </div>
          </Phone>
        </Rise>
      </div>
      <div style={{ position: "absolute", left: SIDE, top: 690, width: 386 }}>
        {LIST6.map((s, i) => {
          const on = spring({ frame: f - s.on, fps, config: N.spring.snappy }), off = i < LIST6.length - 1 ? spring({ frame: f - LIST6[i + 1].on, fps, config: N.spring.snappy }) : 0, a = on - off;
          return (
            <Rise key={s.label} at={40 + i * 5} until={422 - i} rise={30} float={1.2} style={{ height: 132 }}>
              <div style={{ ...mono(25, a > 0.5 ? N.gold : N.faint), letterSpacing: 1 }}>0{i + 1}</div>
              <div style={{ ...grot(46, N.text), marginTop: 6, opacity: lerp(0.42, 1, a), transform: `translateX(${a * 10}px)` }}>{s.label}</div>
              <div style={{ marginTop: 14, height: 3, borderRadius: 2, background: N.gold, width: 386, transform: `scaleX(${a})`, transformOrigin: "0 50%", opacity: a }} />
            </Rise>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: SIDE, top: 1530 }}><Rise at={70} until={422} rise={24} from={0.8} config={N.spring.snappy}><Pill tone="solid" size={28}>Example picks</Pill></Rise></div>
      <Sfx at={6} file="sub.wav" volume={0.3} />
      {LIST6.map((s) => <React.Fragment key={s.label}><Sfx at={s.on - 8} file="whoosh.wav" volume={0.16} /><Sfx at={s.on} file="tick.wav" volume={0.3} /></React.Fragment>)}
    </AbsoluteFill>
  );
};

// ---------- 5. Two kinds of pick, two ways to hold ----------
export const KINDS = 330;
type Pt = [number, number];
const BREAK: Pt[] = [[0, 150], [40, 141], [80, 158], [120, 133], [160, 150], [200, 129], [240, 141], [272, 121], [304, 72], [342, 54], [380, 30]];
const LIST: Pt[] = [[0, 184], [24, 136], [60, 70], [100, 112], [140, 128], [180, 116], [220, 98], [260, 84], [300, 75], [340, 70], [380, 64]];
const yAt = (pts: Pt[], x: number) => { for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return lerp(y0, y1, (x - x0) / (x1 - x0)); } return pts[pts.length - 1][1]; };
/** A small price line that draws itself left to right, with the level that matters as a dashed line. */
const MiniChart: React.FC<{ id: string; pts: Pt[]; level: number; note: string; under?: boolean; start: number; hit: number }> = ({ id, pts, level, note, under, start, hit }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const p = interpolate(f, [start, start + 56], [0, 1], { ...clamp, easing: N.ease.glide });
  const x = p * 380, y = yAt(pts, x), lv = spring({ frame: f - start + 8, fps, config: N.spring.smooth }), beat = spring({ frame: f - hit, fps, config: N.spring.bouncy });
  if (f < start - 8) return <div style={{ width: 380, height: 230 }} />;
  return (
    <svg width={380} height={230} viewBox="-10 -10 400 240" style={{ overflow: "visible" }}>
      <defs><clipPath id={id}><rect x={-10} y={-10} width={x + 10} height={260} /></clipPath></defs>
      <line x1={0} x2={380 * lv} y1={level} y2={level} stroke={N.faint} strokeWidth={2.5} strokeDasharray="9 9" />
      <text x={under ? 380 : 0} y={under ? level + 30 : level - 12} textAnchor={under ? "end" : "start"} style={{ ...sans(22, 500, N.faint) }} fill={N.faint} opacity={lv}>{note}</text>
      <polyline points={pts.map(([a, b]) => `${a},${b}`).join(" ")} fill="none" stroke={N.text} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" clipPath={`url(#${id})`} />
      {p > 0 && <circle cx={x} cy={y} r={9 + beat * 4} fill={N.gold} />}
      {p > 0 && <circle cx={x} cy={y} r={20 + beat * 12} fill="none" stroke={N.gold} strokeWidth={2.5} opacity={0.5 * (1 - Math.abs(Math.sin(f / 9)) * 0.6)} />}
    </svg>
  );
};
export const SKinds: React.FC = () => {
  const kind = (i: number, start: number, title: string, body: string, chart: React.ReactNode) => (
    <div style={{ position: "absolute", left: SIDE, right: SIDE, top: 530 + i * 426 }}>
      <Rise at={start} until={314 + i * 2} rise={70}>
        <Card style={{ height: 396, padding: "0 30px 0 40px", display: "flex", alignItems: "center", gap: 18, boxSizing: "border-box" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...mono(25, N.faint), letterSpacing: 1 }}>0{i + 1}</div>
            <div style={{ ...grot(58), marginTop: 8 }}>{title}</div>
            <div style={{ ...sans(32, 450, N.soft), marginTop: 16 }}>{body}</div>
          </div>
          {chart}
        </Card>
      </Rise>
    </div>
  );
  const hold = (i: number, start: number, title: string, body: string) => (
    <Rise at={start} until={316 + i} rise={50} style={{ flex: 1 }}>
      <Card style={{ padding: "28px 32px 30px", height: 232, boxSizing: "border-box" }}>
        <div style={grot(44)}>{title}</div>
        <div style={{ ...sans(30, 450, N.soft), marginTop: 12 }}>{body}</div>
      </Card>
    </Rise>
  );
  return (
    <AbsoluteFill>
      <Head text="Two kinds / of *picks*." at={6} until={314} top={230} size={112} />
      {kind(0, 40, "Fresh breakout", "A known coin closes at its highest in weeks, on heavy volume.", <MiniChart id="mc-break" pts={BREAK} level={119} note="old high" start={58} hit={98} />)}
      {kind(1, 122, "New listing", "A new coin that holds above its first day and climbs back to its high.", <MiniChart id="mc-list" pts={LIST} level={136} note="first day" under start={140} hit={196} />)}
      <div style={{ position: "absolute", left: SIDE, right: SIDE, top: 1390, display: "flex", gap: 24 }}>
        {hold(0, 222, "Swing trade", "Days to weeks, with a stop and a target.")}
        {hold(1, 236, "Long-term hold", "Months. Only big, established coins.")}
      </div>
      <Sfx at={6} file="sub.wav" volume={0.3} /><Sfx at={40} file="whoosh.wav" volume={0.2} /><Sfx at={98} file="shimmer.wav" volume={0.24} /><Sfx at={122} file="whoosh.wav" volume={0.2} /><Sfx at={196} file="pop.wav" volume={0.24} />
      <Sfx at={222} file="pop.wav" volume={0.26} /><Sfx at={236} file="pop.wav" volume={0.26} />
    </AbsoluteFill>
  );
};

// ---------- 6. "I bought it", the portfolio, and the alerts when a pick closes ----------
export const MONEY = 400;
const CLOSES: [string, string][] = [["target hit", N.green], ["stop hit", N.red], ["time ran out", N.faint]];
export const SMoney: React.FC = () => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const press = interpolate(f, [68, 72, 78], [0, 1, 0], { ...clamp, easing: N.ease.glide });
  const taken = interpolate(f, [76, 88], [0, 1], { ...clamp, easing: N.ease.glide });
  const box = spring({ frame: f - 92, fps, config: N.spring.snappy }), boxOut = interpolate(f, [150, 158], [0, 1], { ...clamp, easing: N.ease.in });
  const slide = spring({ frame: f - 160, fps, config: N.spring.smooth });
  const pScroll = interpolate(f, [186, 268], [0, 190], { ...clamp, easing: N.ease.glide });
  const dim = interpolate(f, [272, 288], [0, 1], { ...clamp, easing: N.ease.glide });
  return (
    <AbsoluteFill>
      <Head text="One tap: / *I* *bought* *it*." at={6} until={384} top={230} size={104} />
      <Sub text="J adds it to your portfolio, at your amount." at={30} until={152} top={486} />
      <Sub text="Stocks, crypto, trades and calls: counted in money." at={162} until={268} top={486} />
      <Sub text="And J tells you the moment a pick closes." at={276} until={384} top={486} color={N.text} />
      <div style={{ ...center, top: 660 }}>
        <Rise at={24} until={384} rise={120} from={0.92} config={N.spring.heavy} float={3}>
          <div style={{ opacity: 1 - dim * 0.5, transform: `scale(${1 - dim * 0.03})` }}>
            <Phone width={560}>
              <div style={{ position: "absolute", inset: 0, opacity: 1 - slide, transform: `translateX(${-slide * 110}px)` }}>
                <Screen src="c-coin.png" scroll={961} opacity={1 - taken} />
                <Screen src="c-coin-taken.png" scroll={1051} opacity={taken} />
                <div style={{ position: "absolute", left: 195 - 40, top: 791 - 40, width: 80, height: 80, borderRadius: "50%", background: N.goldVeil, border: `2px solid ${N.gold}`, opacity: press, transform: `scale(${lerp(0.5, 1.3, press)})` }} />
                <div style={{ position: "absolute", left: 7, width: 376, top: 548, height: 200, borderRadius: 18, border: `2.5px solid ${N.gold}`, boxSizing: "border-box", boxShadow: `0 0 26px ${N.goldGlow}`, opacity: Math.min(1, box * 1.4) * (1 - boxOut), transform: `scale(${lerp(1.08, 1, box)})` }} />
              </div>
              <div style={{ position: "absolute", inset: 0, background: N.black, transform: `translateX(${(1 - slide) * 390}px)` }}><Screen src="c-portfolio.png" scroll={pScroll} /></div>
            </Phone>
          </div>
        </Rise>
      </div>
      <div style={{ position: "absolute", left: 842, top: 760 }}><Rise at={60} until={268} rise={20} from={0.8} config={N.spring.snappy}><Pill tone="solid" size={26}>Example</Pill></Rise></div>
      {CLOSES.map(([what, color], i) => (
        <div key={what} style={{ position: "absolute", left: 120, right: 120, top: 1216 + i * 132 }}>
          <Rise at={284 + i * 13} until={380 + i * 2} rise={60} config={N.spring.bouncy} float={2}>
            <div style={{ display: "flex", alignItems: "center", gap: 24, height: 108, padding: "0 30px", borderRadius: 30, background: N.panelSolid, border: `1.5px solid ${N.line}`, boxShadow: N.shadow }}>
              <JIcon size={60} />
              <div style={{ ...sans(38, 620), flex: 1 }}>XRP closed: {what}</div>
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: color }} />
            </div>
          </Rise>
          <Sfx at={284 + i * 13} file="ding.wav" volume={0.2 - i * 0.03} />
        </div>
      ))}
      <Sfx at={6} file="sub.wav" volume={0.3} /><Sfx at={70} file="tap.wav" volume={0.36} /><Sfx at={78} file="clink.wav" volume={0.26} /><Sfx at={160} file="whoosh.wav" volume={0.22} />
    </AbsoluteFill>
  );
};

// ---------- 7. Recap ----------
export const RECAP = 350;
const GETS = ["The top 90 coins, scanned daily", "A clear plan: buy, stop, target", "Why J picked it, in plain words", "What the coin is, and key facts", "Companies holding Bitcoin, Ether", "Your portfolio, counted in money", "An alert when the pick closes"];
export const SRecap: React.FC = () => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Head text="What you *get*." at={6} until={332} top={236} size={124} />
      {GETS.map((g, i) => {
        const start = 40 + i * 30, tick = interpolate(f, [start + 6, start + 20], [0, 1], { ...clamp, easing: N.ease.out }), lit = spring({ frame: f - start, fps, config: N.spring.snappy }), calm = interpolate(f, [start + 26, start + 44], [0, 1], { ...clamp, easing: N.ease.glide });
        return (
          <div key={g} style={{ position: "absolute", left: SIDE, right: SIDE, top: 474 + i * 164 }}>
            <Rise at={start} until={330 - (GETS.length - i)} rise={54} float={1.6}>
              <div style={{ display: "flex", alignItems: "center", gap: 28, height: 132, padding: "0 30px", borderRadius: 30, background: N.panel, border: `1.5px solid ${N.line}`, boxShadow: `0 0 ${40 * lit * (1 - calm)}px ${N.goldGlow}` }}>
                <Check size={58} p={tick} />
                <div style={{ ...sans(43, 560), flex: 1, whiteSpace: "nowrap" }}>{g}</div>
              </div>
            </Rise>
            <Sfx at={start} file="pop.wav" volume={0.24} /><Sfx at={start + 7} file="tick.wav" volume={0.2} />
          </div>
        );
      })}
      <Sfx at={6} file="sub.wav" volume={0.3} />
    </AbsoluteFill>
  );
};

// ---------- 8. Invite only ----------
export const INVITE = 330;
export const SInvite: React.FC = () => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const x = spring({ frame: f - 34, fps, config: N.spring.snappy });
  const cta = spring({ frame: f - 116, fps, config: N.spring.bouncy });
  const pulse = 1 + Math.sin((f - 116) / 14) * 0.012;
  const out = interpolate(f, [INVITE - 16, INVITE - 2], [0, 1], { ...clamp, easing: N.ease.in });
  return (
    <AbsoluteFill>
      <Ping at={12} x={540} y={500} r={720} dur={46} color={N.moon} width={3} count={1} />
      <div style={{ ...center, top: 290 }}><Rise at={10} rise={80} from={0.7} config={N.spring.bouncy} float={4}><Moon size={420} /></Rise></div>
      <div style={{ ...center, top: 738, opacity: Math.min(1, x * 1.5), transform: `scale(${lerp(0.3, 1, x)}) rotate(${(1 - x) * -90}deg)` }}><span style={{ ...grot(72, N.soft), fontWeight: 400, lineHeight: 1 }}>×</span></div>
      <div style={{ ...center, top: 836 }}><Rise at={42} rise={50} from={0.7} config={N.spring.bouncy}><JIcon size={150} /></Rise></div>
      <Head text="Invite *only*." at={60} top={1064} size={136} align="center" />
      <Sub text="Contact RDS Academy to get your invite." at={88} top={1232} size={46} align="center" />
      {[0, 1, 2].map((i) => <Ping key={i} at={150 + i * 56} x={540} y={1424} r={520} dur={50} width={3} count={1} />)}
      <div style={{ ...center, top: 1372, opacity: Math.min(1, cta * 1.5), transform: `translateY(${(1 - cta) * 40}px) scale(${lerp(0.8, 1, cta) * pulse})` }}>
        <div style={{ ...sans(40, 680, N.goldInk), lineHeight: 1, padding: "32px 54px", borderRadius: 999, background: N.gold, boxShadow: `0 0 60px ${N.goldGlow}` }}>Ask RDS Academy for an invite</div>
      </div>
      <div style={{ position: "absolute", left: 120, right: 120, top: 1560, textAlign: "center" }}><Rise at={150} rise={20} from={0.98} float={1}><div style={sans(28, 450, N.faint)}>Not financial advice. Crypto can fall fast: only put in what you can afford to lose.</div></Rise></div>
      <AbsoluteFill style={{ background: N.night, opacity: out }} />
      <Sfx at={10} file="ping.wav" volume={0.3} /><Sfx at={12} file="chord.wav" volume={0.4} /><Sfx at={34} file="pop.wav" volume={0.22} /><Sfx at={42} file="pop.wav" volume={0.26} /><Sfx at={60} file="sub.wav" volume={0.34} /><Sfx at={116} file="clink.wav" volume={0.28} />
      <Sfx at={150} file="ping.wav" volume={0.16} /><Sfx at={206} file="ping.wav" volume={0.12} /><Sfx at={262} file="ping.wav" volume={0.09} />
    </AbsoluteFill>
  );
};
