// Scenes of the RDS Academy × J stocks video. Each scene is a full frame with its own entrances and exits; the candle
// wipe between them lives in RdsVideo. The example pick is the one the live scan built on 13 Nov 2026 (Wolverine World
// Wide), and the Buffett figures are Berkshire Hathaway's 30 June 2026 filing: nothing on screen is invented.
import React from "react";
import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Candle, Card, Check, FONT, JIcon, MONO, Pill, R, RdsLogo, Rise, SERIF, SIDE, Sfx, Sub, Title, clamp } from "./Kit";

const center: React.CSSProperties = { position: "absolute", left: 0, right: 0, display: "flex", justifyContent: "center" };
const mono = (size: number, color: string = R.ink): React.CSSProperties => ({ fontFamily: MONO, fontSize: size, fontWeight: 600, color, letterSpacing: -size * 0.02, fontVariantNumeric: "tabular-nums" });
const sans = (size: number, weight = 450, color: string = R.ink): React.CSSProperties => ({ fontFamily: FONT, fontSize: size, fontWeight: weight, color, lineHeight: 1.25 });

// ---------- 1. Intro: the logo's candles grow, the two marks meet ----------
export const INTRO = 210;
export const SIntro: React.FC = () => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const bars: [number, number, boolean][] = [[300, 60, true], [220, 52, false], [350, 70, true], [250, 56, false], [400, 62, true], [280, 58, false], [330, 72, true]];
  const arrow = interpolate(f, [26, 50], [0, 1], { ...clamp, easing: R.ease.inOut });
  const arrowOut = interpolate(f, [56, 66], [0, 1], { ...clamp, easing: R.ease.in });
  const x = spring({ frame: f - 84, fps, config: R.spring.snappy });
  return (
    <AbsoluteFill>
      {bars.map(([body, wick, up], i) => <Candle key={i} at={4 + i * 4} until={54} x={540 - 7 * 37 + i * 74 + 8} base={1100} body={body} wick={wick} width={48} up={up} />)}
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0, opacity: (1 - arrowOut) * (arrow > 0 ? 1 : 0) }}>
        <path d="M 150 900 C 330 1000, 620 1010, 868 742" fill="none" stroke={R.blue} strokeWidth={54} strokeLinecap="butt" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - arrow} />
        <path d="M 806 690 L 944 668 L 902 802 Z" fill={R.navy} opacity={interpolate(arrow, [0.82, 1], [0, 1], clamp)} transform={`translate(${(1 - arrow) * -30} ${(1 - arrow) * 30})`} />
      </svg>
      <div style={{ ...center, top: 400 }}><Rise at={56} until={194} rise={60} from={0.8} config={R.spring.bouncy}><RdsLogo width={620} /></Rise></div>
      <div style={{ ...center, top: 884, opacity: Math.min(1, x * 1.5) * (1 - interpolate(f, [194, 203], [0, 1], clamp)), transform: `scale(${interpolate(x, [0, 1], [0.3, 1])}) rotate(${(1 - x) * -90}deg)` }}>
        <span style={{ fontFamily: SERIF, fontSize: 92, fontWeight: 400, color: R.inkSoft, lineHeight: 1 }}>×</span>
      </div>
      <div style={{ ...center, top: 1000 }}><Rise at={92} until={194} rise={50} from={0.7} config={R.spring.bouncy}><JIcon size={196} /></Rise></div>
      <Title text="Stock picks, now inside J." at={108} until={194} top={1290} size={102} align="center" />
      <Sub text="From RDS Academy, straight to your phone." at={132} until={194} top={1560} align="center" />
      <Sfx at={4} file="rise.wav" volume={0.3} /><Sfx at={12} file="rise.wav" volume={0.26} /><Sfx at={20} file="rise.wav" volume={0.3} />
      <Sfx at={27} file="whoosh.wav" volume={0.22} /><Sfx at={57} file="thud.wav" volume={0.42} /><Sfx at={92} file="pop.wav" volume={0.3} /><Sfx at={108} file="tick.wav" volume={0.25} />
    </AbsoluteFill>
  );
};

// ---------- 2. The record: calls RDS Academy made (as stated by RDS; no figures are claimed) ----------
export const RECORD = 360;
const calls: [string, string][] = [["KO", "Coca-Cola"], ["AAPL", "Apple"]];
export const SRecord: React.FC = () => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Title text="We have called stocks for years." at={6} until={342} top={250} size={118} />
      {calls.map(([sym, name], i) => {
        const at = 62 + i * 46; const stamp = spring({ frame: f - at - 26, fps, config: R.spring.snappy });
        return (
          <div key={sym} style={{ position: "absolute", left: SIDE, right: SIDE, top: 800 + i * 250 }}>
            <Rise at={at} until={340 + i * 2} rise={70}>
              <Card style={{ height: 210, display: "flex", alignItems: "center", gap: 34, padding: "0 36px" }}>
                <div style={{ width: 210, height: 138, borderRadius: 22, background: R.ink, display: "flex", alignItems: "center", justifyContent: "center", gap: 2, perspective: 600 }}>
                  {sym.split("").map((ch, k) => { const p = spring({ frame: f - at - 6 - k * 3, fps, config: R.spring.snappy }); return <span key={k} style={{ ...mono(58, "#fff"), display: "inline-block", transform: `rotateX(${(1 - p) * 92}deg)`, transformOrigin: "50% 60%", opacity: Math.min(1, p * 2) }}>{ch}</span>; })}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...sans(60, 650), fontFamily: SERIF, letterSpacing: -1 }}>{name}</div>
                  <div style={sans(31, 450, R.inkSoft)}>RDS Academy call</div>
                </div>
                <div style={{ border: `5px solid ${R.red}`, borderRadius: 16, padding: "12px 20px", transform: `rotate(-7deg) scale(${interpolate(stamp, [0, 1], [2.3, 1])})`, opacity: Math.min(1, stamp * 1.8) }}>
                  <div style={{ ...sans(27, 600, R.red), lineHeight: 1 }}>Called</div>
                  <div style={{ ...mono(46, R.red), lineHeight: 1.05 }}>2024</div>
                </div>
              </Card>
            </Rise>
            <Sfx at={at + 6} file="tick.wav" volume={0.3} /><Sfx at={at + 12} file="tick.wav" volume={0.24} /><Sfx at={at + 27} file="stamp.wav" volume={0.42} />
          </div>
        );
      })}
      <Title text="And we keep calling them." at={196} until={342} top={1330} size={86} />
      <Sub text="From now on, every call comes to your phone." at={228} until={342} top={1470} size={46} />
      <Sfx at={6} file="thud.wav" volume={0.3} /><Sfx at={196} file="thud.wav" volume={0.3} />
    </AbsoluteFill>
  );
};

// ---------- 3. The notification ----------
export const ALERT = 300;
export const SAlert: React.FC = () => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const drop = spring({ frame: f - 62, fps, config: R.spring.bouncy });
  const shake = f >= 62 && f < 84 ? Math.sin((f - 62) * 2.6) * 7 * (1 - (f - 62) / 22) : 0;
  const tap = spring({ frame: f - 196, fps, config: R.spring.snappy });
  const ripple = interpolate(f, [196, 222], [0, 1], { ...clamp, easing: R.ease.out });
  const ring = (delay: number) => { const p = interpolate(f, [62 + delay, 96 + delay], [0, 1], { ...clamp, easing: R.ease.out }); return { transform: `scale(${0.6 + p * 0.9})`, opacity: p > 0 && p < 1 ? (1 - p) * 0.8 : 0 }; };
  return (
    <AbsoluteFill>
      <Title text="Each pick rings your phone." at={6} until={284} top={230} size={112} />
      <Sub text="After every US market close." at={30} until={284} top={500} size={46} />
      <div style={{ ...center, top: 640 }}>
        <Rise at={24} until={284} rise={90} from={0.92} config={R.spring.heavy}>
          <div style={{ position: "relative", width: 660, height: 940, borderRadius: 78, background: R.ink, padding: 16, transform: `translateX(${shake}px) rotate(${shake * 0.08}deg)`, boxShadow: "0 40px 90px rgba(16,27,69,0.28)" }}>
            <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 62, overflow: "hidden", background: `linear-gradient(180deg, ${R.paperDeep} 0%, #CBD5EA 100%)` }}>
              <div style={{ position: "absolute", top: 22, left: "50%", marginLeft: -70, width: 140, height: 36, borderRadius: 20, background: R.ink }} />
              <div style={{ position: "absolute", top: 120, left: 0, right: 0, textAlign: "center", fontFamily: SERIF, fontSize: 150, fontWeight: 500, color: R.ink, lineHeight: 1, letterSpacing: -4 }}>4:25</div>
              <div style={{ position: "absolute", top: 286, left: 0, right: 0, textAlign: "center", ...sans(30, 500, R.inkSoft) }}>New York time</div>
              <div style={{ position: "absolute", left: 22, right: 22, top: 392, transform: `translateY(${(1 - drop) * -460}px) scale(${1 + tap * 0.03 - ripple * 0.03})`, opacity: Math.min(1, drop * 1.6) }}>
                <div style={{ position: "relative", background: "rgba(255,255,255,0.96)", borderRadius: 34, padding: "26px 26px 28px", boxShadow: "0 20px 44px rgba(16,27,69,0.18)", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <JIcon size={64} />
                    <span style={sans(30, 600)}>J</span><span style={{ ...sans(28, 450, R.inkFaint), marginLeft: "auto" }}>now</span>
                  </div>
                  <div style={{ ...sans(37, 650), marginTop: 18 }}>New stock pick: WWW</div>
                  <div style={{ ...sans(31, 450, R.inkSoft), marginTop: 6 }}>Beat earnings by 72% and closed up 8.8%, close to its 52-week high.</div>
                  <div style={{ position: "absolute", left: "50%", top: "50%", width: 200, height: 200, marginLeft: -100, marginTop: -100, borderRadius: "50%", background: R.blue, opacity: ripple > 0 && ripple < 1 ? (1 - ripple) * 0.22 : 0, transform: `scale(${0.2 + ripple * 3.4})` }} />
                </div>
              </div>
            </div>
            {[0, 9].map((d) => <div key={d} style={{ position: "absolute", top: -34, right: -34, width: 150, height: 150, borderRadius: "50%", border: `6px solid ${R.yellow}`, ...ring(d) }} />)}
          </div>
        </Rise>
      </div>
      <div style={{ ...center, top: 1630 }}><Rise at={110} until={284} rise={24}><Pill>Example pick</Pill></Rise></div>
      <Sfx at={6} file="thud.wav" volume={0.3} /><Sfx at={62} file="buzz.wav" volume={0.36} /><Sfx at={66} file="ding.wav" volume={0.42} /><Sfx at={196} file="pop.wav" volume={0.34} />
    </AbsoluteFill>
  );
};

// ---------- 4. What every pick carries: six parts ----------
const PART = 160;
export const PARTS = PART * 6;
const partNames = ["The plan", "The reasons", "The company", "Big investors", "The risks", "The follow-up"];
const PartHead: React.FC<{ i: number }> = ({ i }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: "absolute", top: 200, left: SIDE, right: SIDE, display: "flex", alignItems: "center", gap: 22 }}>
      <Pill tone="ink" size={30}>On every pick</Pill>
      <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
        {partNames.map((n, k) => { const on = interpolate(f, [k * PART - 6, k * PART + 10, (k + 1) * PART - 6, (k + 1) * PART + 10], [0, 1, 1, 0], { ...clamp, easing: R.ease.inOut }); return <div key={n} style={{ height: 12, width: 12 + on * 44, borderRadius: 6, background: k === i || on > 0.01 ? R.ink : R.line, opacity: 0.25 + on * 0.75 }} />; })}
      </div>
    </div>
  );
};
const END = PART - 14;   // every part clears a little before the next one lands

const Plan: React.FC = () => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const levels: [string, string, string, number][] = [["Target", "$29.47", R.green, 84], ["Buy up to", "$25.64", R.ink, 290], ["Stop", "$22.60", R.red, 496]];
  const dot = 372 - spring({ frame: f - 70, fps, config: R.spring.heavy }) * 26 + Math.sin(f / 9) * 5;
  return (
    <AbsoluteFill>
      <Title text="A clear plan." at={4} until={END} top={330} size={116} />
      <Sub text="Where to buy, where to stop, where to take the profit." at={18} until={END} top={500} />
      <div style={{ position: "absolute", left: SIDE, right: SIDE, top: 720 }}>
        <Rise at={26} until={END} rise={70}>
          <Card style={{ height: 660, position: "relative", overflow: "hidden" }}>
            {levels.map(([label, value, color, y], k) => { const p = spring({ frame: f - 40 - k * 7, fps, config: R.spring.smooth }); return (
              <div key={label} style={{ position: "absolute", left: 44, right: 44, top: y, opacity: Math.min(1, p * 1.5) }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", transform: `translateY(${(1 - p) * 18}px)` }}><span style={sans(42, 520, R.inkSoft)}>{label}</span><span style={mono(76, color)}>{value}</span></div>
                <div style={{ marginTop: 10, height: 5, borderRadius: 3, background: color, opacity: k === 1 ? 0.9 : 0.75, transform: `scaleX(${p})`, transformOrigin: "0 50%" }} />
              </div>
            ); })}
            <div style={{ position: "absolute", left: 470, top: dot, width: 30, height: 30, borderRadius: 15, background: R.yellow, border: `5px solid ${R.ink}`, opacity: interpolate(f, [66, 76], [0, 1], clamp) }} />
          </Card>
        </Rise>
      </div>
      <div style={{ ...center, top: 1450 }}><Rise at={58} until={END} rise={24}><Pill>Example pick: Wolverine World Wide</Pill></Rise></div>
      <Sfx at={4} file="thud.wav" volume={0.28} /><Sfx at={42} file="tick.wav" volume={0.28} /><Sfx at={49} file="tick.wav" volume={0.26} /><Sfx at={56} file="tick.wav" volume={0.28} />
    </AbsoluteFill>
  );
};

const Rows: React.FC<{ rows: [string, string][]; top: number; bar: string; at?: number; gap?: number }> = ({ rows, top, bar, at = 30, gap = 258 }) => (
  <>
    {rows.map(([label, detail], k) => (
      <div key={label} style={{ position: "absolute", left: SIDE, right: SIDE, top: top + k * gap }}>
        <Rise at={at + k * 9} until={END - k} rise={60}>
          <Card style={{ padding: "36px 38px 38px 50px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 12, background: bar }} />
            <div style={sans(detail ? 50 : 46, 640)}>{label}</div>
            {detail && <div style={{ ...sans(36, 450, R.inkSoft), marginTop: 8 }}>{detail}</div>}
          </Card>
        </Rise>
        <Sfx at={at + k * 9} file="pop.wav" volume={0.22} />
      </div>
    ))}
  </>
);
const Reasons: React.FC = () => (
  <AbsoluteFill>
    <Title text="Why we picked it." at={4} until={END} top={330} size={116} />
    <Rows top={650} bar={R.yellow} rows={[["Earnings beat by 72%", "Reported $0.79 a share against the $0.46 analysts expected."], ["Buyers stepped in", "Up 8.8% on the day, closing near the top of its range."], ["Close to its 52-week high", "0.1% below it, and +15% over the last 13 weeks."]]} />
    <Sfx at={4} file="thud.wav" volume={0.28} />
  </AbsoluteFill>
);
const Company: React.FC = () => {
  const facts: [string, string][] = [["Company value", "$1.7B"], ["Sales growth, 1 year", "+7.2%"], ["Profit margin", "5.6%"], ["Analysts saying buy", "9 of 15"]];
  return (
    <AbsoluteFill>
      <Title text="What the company does." at={4} until={END} top={330} size={108} />
      <div style={{ position: "absolute", left: SIDE, right: SIDE, top: 690 }}>
        <Rise at={28} until={END} rise={70}>
          <Card style={{ padding: "40px 44px" }}>
            <div style={sans(46, 450, R.inkSoft)}>Wolverine World Wide designs, makes and sells branded footwear, apparel and accessories.</div>
          </Card>
        </Rise>
      </div>
      <div style={{ position: "absolute", left: SIDE, right: SIDE, top: 1060, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {facts.map(([label, value], k) => (
          <Rise key={label} at={46 + k * 6} until={END - k} rise={50}>
            <Card style={{ padding: "32px 34px 34px", borderRadius: 28 }}><div style={sans(31, 480, R.inkFaint)}>{label}</div><div style={{ ...mono(62), marginTop: 6 }}>{value}</div></Card>
          </Rise>
        ))}
      </div>
      <Sfx at={4} file="thud.wav" volume={0.28} />{facts.map((_, k) => <Sfx key={k} at={46 + k * 6} file="tick.wav" volume={0.22} />)}
    </AbsoluteFill>
  );
};
const Investors: React.FC = () => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const held: [string, string, string, number][] = [["Apple", "$66.0B", "22.0% of his portfolio", 1], ["Coca-Cola", "$32.5B", "10.9% of his portfolio", 0.494]];
  const others = ["Ackman", "Dalio", "Druckenmiller", "Soros", "Wood", "+11 more"];
  return (
    <AbsoluteFill>
      <Title text="Who else holds it." at={4} until={END} top={330} size={116} />
      <Sub text="What 17 big investors hold, from their own filings." at={18} until={END} top={500} />
      <div style={{ position: "absolute", left: SIDE, right: SIDE, top: 700 }}>
        <Rise at={28} until={END} rise={70}>
          <Card style={{ padding: "36px 40px 34px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}><span style={{ ...sans(50, 650), fontFamily: SERIF }}>Warren Buffett</span><span style={sans(31, 450, R.inkSoft)}>Berkshire Hathaway</span></div>
            {held.map(([name, value, share, w], k) => { const p = spring({ frame: f - 44 - k * 10, fps, config: R.spring.smooth }); return (
              <div key={name} style={{ marginTop: 30, opacity: Math.min(1, p * 1.5) }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}><span style={sans(42, 600)}>{name}</span><span style={mono(52)}>{value}</span></div>
                <div style={{ marginTop: 10, height: 16, borderRadius: 8, background: R.paperDeep, overflow: "hidden" }}><div style={{ height: "100%", width: `${w * 100}%`, borderRadius: 8, background: k === 0 ? R.navy : R.red, transform: `scaleX(${p})`, transformOrigin: "0 50%" }} /></div>
                <div style={{ ...sans(29, 450, R.inkSoft), marginTop: 8 }}>{share}</div>
              </div>
            ); })}
            <div style={{ ...sans(26, 450, R.inkFaint), marginTop: 26 }}>Holdings on 30 June 2026, from the filing.</div>
          </Card>
        </Rise>
      </div>
      <div style={{ position: "absolute", left: SIDE, right: SIDE, top: 1410, display: "flex", flexWrap: "wrap", gap: 16 }}>
        {others.map((n, k) => <Rise key={n} at={78 + k * 4} until={END - k} rise={26} config={R.spring.snappy}><Pill tone={k === others.length - 1 ? "yellow" : "line"}>{n}</Pill></Rise>)}
      </div>
      <Sfx at={4} file="thud.wav" volume={0.28} /><Sfx at={44} file="rise.wav" volume={0.22} /><Sfx at={54} file="rise.wav" volume={0.2} /><Sfx at={78} file="pop.wav" volume={0.2} /><Sfx at={90} file="pop.wav" volume={0.2} />
    </AbsoluteFill>
  );
};
const Risks: React.FC = () => (
  <AbsoluteFill>
    <Title text="What could go wrong." at={4} until={END} top={330} size={112} />
    <Sub text="Said plainly, on every pick." at={18} until={END} top={610} />
    <Rows top={780} gap={214} bar={R.red} rows={[["Stocks that jump on earnings often give some of it back.", ""], ["It moves 1.7 times as much as the market, both ways.", ""], ["A smaller company: the price can swing on little news.", ""]]} />
    <Sfx at={4} file="thud.wav" volume={0.28} />
  </AbsoluteFill>
);
const Follow: React.FC = () => {
  const f = useCurrentFrame();
  const draw = interpolate(f, [40, 128], [0, 1], { ...clamp, easing: R.ease.inOut });
  const path = "M 40 300 C 110 260, 150 340, 220 300 S 330 210, 400 250 S 520 330, 590 260 S 700 170, 770 190 S 850 140, 870 132";
  const bell = (at: number) => interpolate(f, [at, at + 12], [0, 1], { ...clamp, easing: R.ease.out });
  return (
    <AbsoluteFill>
      <Title text="Followed to the close." at={4} until={END} top={330} size={112} />
      <Sub text="J keeps watching the price and tells you when the pick ends." at={18} until={END} top={610} />
      <div style={{ position: "absolute", left: SIDE, right: SIDE, top: 850 }}>
        <Rise at={26} until={END} rise={70}>
          <Card style={{ height: 560, position: "relative", overflow: "hidden" }}>
            <svg viewBox="0 0 912 560" style={{ position: "absolute", inset: 0 }}>
              <line x1="40" x2="872" y1="120" y2="120" stroke={R.green} strokeWidth="4" strokeDasharray="14 12" opacity={bell(34)} />
              <line x1="40" x2="872" y1="440" y2="440" stroke={R.red} strokeWidth="4" strokeDasharray="14 12" opacity={bell(40)} />
              <path d={path} fill="none" stroke={R.ink} strokeWidth="7" strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - draw} />
            </svg>
            <div style={{ position: "absolute", left: 44, top: 52, opacity: bell(34), ...sans(34, 600, R.green) }}>Alert at the target</div>
            <div style={{ position: "absolute", left: 44, top: 462, opacity: bell(40), ...sans(34, 600, R.red) }}>Alert at the stop</div>
          </Card>
        </Rise>
      </div>
      <Sfx at={4} file="thud.wav" volume={0.28} /><Sfx at={40} file="whoosh.wav" volume={0.16} /><Sfx at={128} file="ding.wav" volume={0.32} />
    </AbsoluteFill>
  );
};
export const SParts: React.FC = () => {
  const f = useCurrentFrame();
  const parts = [Plan, Reasons, Company, Investors, Risks, Follow];
  return (
    <AbsoluteFill>
      <Rise at={0} until={PARTS - 14} rise={20}><PartHead i={Math.min(5, Math.floor(f / PART))} /></Rise>
      {parts.map((P, i) => <Sequence key={i} from={i * PART} durationInFrames={PART}><P /></Sequence>)}
    </AbsoluteFill>
  );
};

// ---------- 5. The two kinds and the two horizons ----------
export const KINDS = 240;
export const SKinds: React.FC = () => {
  const kinds: [string, string, boolean][] = [["New listings", "Companies in their first year on the market, holding above their offer price.", true], ["Fresh events", "Companies that just beat earnings, and the market rewarded it the same day.", false]];
  return (
    <AbsoluteFill>
      <Title text="Fresh stocks only." at={6} until={224} top={250} size={124} />
      {kinds.map(([name, text, up], k) => (
        <div key={name} style={{ position: "absolute", left: SIDE, right: SIDE, top: 600 + k * 350 }}>
          <Rise at={36 + k * 14} until={224 - k * 2} rise={80}>
            <Card style={{ padding: "38px 40px 40px 170px", position: "relative", minHeight: 300, boxSizing: "border-box" }}>
              <div style={{ position: "absolute", left: 0, top: 0, width: 150, height: "100%" }}><Candle at={44 + k * 14} x={36} base={236} body={k === 0 ? 150 : 110} wick={28} width={34} up={up} /><Candle at={49 + k * 14} x={84} base={236} body={k === 0 ? 96 : 168} wick={30} width={34} up={!up} /></div>
              <div style={{ fontFamily: SERIF, fontSize: 68, fontWeight: 620, color: R.ink, letterSpacing: -1.4, lineHeight: 1.05 }}>{name}</div>
              <div style={{ ...sans(35, 450, R.inkSoft), marginTop: 10 }}>{text}</div>
            </Card>
          </Rise>
          <Sfx at={36 + k * 14} file="thud.wav" volume={0.26} /><Sfx at={46 + k * 14} file="rise.wav" volume={0.2} />
        </div>
      ))}
      <div style={{ position: "absolute", left: SIDE, right: SIDE, top: 1340, display: "flex", flexDirection: "column", gap: 18, alignItems: "flex-start" }}>
        {["Swing trades: days to weeks", "Long-term holds: months"].map((t, k) => <Rise key={t} at={96 + k * 8} until={224 - k} rise={30} config={R.spring.snappy}><Pill tone={k === 0 ? "ink" : "yellow"} size={38}>{t}</Pill></Rise>)}
      </div>
      <Sfx at={6} file="thud.wav" volume={0.3} /><Sfx at={96} file="pop.wav" volume={0.24} /><Sfx at={104} file="pop.wav" volume={0.24} />
    </AbsoluteFill>
  );
};

// ---------- 6. The portfolio: one amount ----------
export const MONEY = 240;
export const SMoney: React.FC = () => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const typed = "100".slice(0, Math.max(0, Math.min(3, Math.floor((f - 44) / 8) + 1)));
  const press = spring({ frame: f - 86, fps, config: R.spring.snappy });
  const rows: [string, string][] = [["Stocks", "at your amount"], ["Wann calls", "at your amount"], ["J trades", "from your lot"]];
  return (
    <AbsoluteFill>
      <Title text="One amount. Every result in money." at={6} until={224} top={250} size={104} />
      <div style={{ position: "absolute", left: SIDE, right: SIDE, top: 660 }}>
        <Rise at={26} until={224} rise={70}>
          <Card style={{ padding: "38px 40px 40px" }}>
            <div style={sans(38, 600)}>What amount do you use?</div>
            <div style={{ display: "flex", gap: 20, marginTop: 24, alignItems: "stretch" }}>
              <div style={{ flex: 1, height: 116, borderRadius: 24, background: R.paper, border: `2px solid ${R.line}`, display: "flex", alignItems: "center", padding: "0 30px", gap: 4 }}>
                <span style={mono(62, R.inkFaint)}>$</span><span style={mono(62)}>{f >= 44 ? typed : ""}</span>
                <span style={{ width: 4, height: 62, background: R.ink, opacity: f < 86 && Math.floor(f / 8) % 2 === 0 ? 1 : 0 }} />
              </div>
              <div style={{ width: 230, borderRadius: 24, background: R.ink, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${1 - Math.sin(Math.min(1, press) * Math.PI) * 0.06})`, ...sans(40, 620, "#fff") }}>Save</div>
            </div>
            <div style={{ ...sans(30, 450, R.inkSoft), marginTop: 18 }}>Asked once. J works out your profits from it.</div>
          </Card>
        </Rise>
      </div>
      {rows.map(([name, how], k) => { const p = spring({ frame: f - 108 - k * 8 - 6, fps, config: R.spring.smooth }); return (
        <div key={name} style={{ position: "absolute", left: SIDE, right: SIDE, top: 1110 + k * 138 }}>
          <Rise at={108 + k * 8} until={224 - k} rise={46}>
            <Card style={{ padding: "24px 32px", borderRadius: 28, display: "flex", alignItems: "center", gap: 22 }}>
              <Check size={54} p={p} /><span style={sans(42, 620)}>{name}</span><span style={{ ...sans(33, 450, R.inkSoft), marginLeft: "auto" }}>{how}</span>
            </Card>
          </Rise>
          <Sfx at={108 + k * 8} file="pop.wav" volume={0.22} />
        </div>
      ); })}
      <Sub text="Your portfolio adds it all up." at={150} until={224} top={1560} size={46} />
      <Sfx at={6} file="thud.wav" volume={0.3} />{[44, 52, 60].map((a) => <Sfx key={a} at={a} file="type.wav" volume={0.3} />)}<Sfx at={86} file="pop.wav" volume={0.3} />
    </AbsoluteFill>
  );
};

// ---------- 7. Everything, as a list ----------
export const RECAP = 180;
export const SRecap: React.FC = () => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const items = ["A notification for every pick", "New listings and earnings winners", "Swing trades and long-term holds", "A plan: buy up to, stop, target", "The reasons, the facts, the risks", "What Buffett and 16 others hold", "Alerts at the target and the stop", "Your portfolio in money"];
  return (
    <AbsoluteFill>
      <Title text="All of it, in one app." at={4} until={166} top={230} size={110} />
      {items.map((t, k) => { const at = 26 + k * 8; const p = spring({ frame: f - at - 4, fps, config: R.spring.smooth }); return (
        <div key={t} style={{ position: "absolute", left: SIDE, right: SIDE, top: 520 + k * 132 }}>
          <Rise at={at} until={166 - (items.length - k)} rise={40} config={R.spring.snappy}>
            <div style={{ display: "flex", alignItems: "center", gap: 24, paddingBottom: 26, borderBottom: `2px solid ${R.line}` }}><Check size={62} p={p} color={R.ink} /><span style={sans(45, 560)}>{t}</span></div>
          </Rise>
          {k % 2 === 0 && <Sfx at={at} file="tick.wav" volume={0.26} />}
        </div>
      ); })}
      <Sfx at={4} file="thud.wav" volume={0.3} />
    </AbsoluteFill>
  );
};

// ---------- 8. Invite only ----------
export const INVITE = 210;
export const SInvite: React.FC = () => {
  const bars: [number, number, boolean][] = [[150, 40, true], [110, 36, false], [190, 44, true], [130, 38, false], [220, 40, true], [150, 40, false], [250, 46, true], [170, 40, false], [210, 44, true], [140, 36, false], [180, 42, true]];
  return (
    <AbsoluteFill>
      {bars.map(([body, wick, up], i) => <Candle key={i} at={6 + i * 3} x={84 + i * 84} base={1830} body={body} wick={wick} width={44} up={up} />)}
      <Title text="Invite only." at={10} top={250} size={176} align="center" />
      <Sub text="Ask RDS Academy for your invite." at={34} top={500} size={56} align="center" color={R.ink} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 660, display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
        <Rise at={50} rise={60} from={0.84} config={R.spring.bouncy}><RdsLogo width={560} /></Rise>
        <Rise at={64} rise={20}><span style={{ fontFamily: SERIF, fontSize: 70, color: R.inkFaint, lineHeight: 1 }}>×</span></Rise>
        <Rise at={72} rise={50} from={0.7} config={R.spring.bouncy}><JIcon size={170} /></Rise>
      </div>
      <Sub text="Stocks can fall as well as rise. A pick is information, not personal advice." at={96} top={1420} size={28} align="center" color={R.inkFaint} />
      <Sfx at={10} file="thud.wav" volume={0.36} /><Sfx at={6} file="rise.wav" volume={0.22} /><Sfx at={18} file="rise.wav" volume={0.2} /><Sfx at={50} file="chord.wav" volume={0.4} /><Sfx at={72} file="pop.wav" volume={0.26} />
    </AbsoluteFill>
  );
};
