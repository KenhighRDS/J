import { useEffect, useMemo, useRef, useState } from "react";
import { CONFIRMATION_NAME, levelName, nyTime, px, type TjrTrade } from "../lib/tjr";

/** One trade on its 5-minute candles, with everything that led to it drawn where it happened: the liquidity that was
 *  swept, the gap that was inversed, each confirmation in order, then entry, stop, target and exit. Candles are neutral
 *  (white up, grey down) so that green and red only ever mean the trade's own target and stop. */
export function TradeChart({ trade, focus, onFocus }: { trade: TjrTrade; focus: number | null; onFocus: (i: number | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.round(el.clientWidth)));
    ro.observe(el); setW(Math.round(el.clientWidth));
    return () => ro.disconnect();
  }, []);

  const g = useMemo(() => {
    const bars = trade.bars;
    if (!bars.length || w < 200) return null;
    const H = w >= 600 ? 380 : 300, L = 6, R = 58, T = 12, B = 24;
    const step = (w - L - R) / bars.length, body = Math.max(2, Math.min(11, step * 0.62));
    const sec = (t: string | null) => (t ? Math.floor(new Date(t).getTime() / 1000) : 0);
    const at = (t: number) => { let i = bars.findIndex((b) => t < b[0] + 300); if (i < 0) i = bars.length - 1; return Math.max(0, i); };   // the candle that holds this moment
    const x = (i: number) => L + (i + 0.5) * step;
    const eI = at(sec(trade.entry_at)), xI = trade.exit_at ? at(sec(trade.exit_at)) : bars.length - 1;
    let lo = Math.min(...bars.map((b) => b[3]), trade.stop, trade.entry), hi = Math.max(...bars.map((b) => b[2]), trade.stop, trade.entry);
    const span = hi - lo || 1, far = trade.target != null && (trade.target > hi + span * 0.6 || trade.target < lo - span * 0.6);
    if (trade.target != null && !far) { lo = Math.min(lo, trade.target); hi = Math.max(hi, trade.target); }
    const pad = (hi - lo) * 0.07; lo -= pad; hi += pad;
    const y = (p: number) => T + ((hi - p) / (hi - lo)) * (H - T - B);
    const whole = hi - lo > 12;                                          // a wide view does not need the cents
    const grid = Array.from({ length: 5 }, (_, k) => lo + ((hi - lo) * (k + 0.5)) / 5).map((p) => (whole ? Math.round(p) : Math.round(p * 4) / 4));
    const byPrice = new Map<number, string[]>();
    for (const m of trade.marks) if (m.role === "swept") byPrice.set(m.price, [...new Set([...(byPrice.get(m.price) ?? []), levelName(m.label)])]);
    const long = trade.side === "long", dir = long ? 1 : -1;
    let edge = long ? -Infinity : Infinity;                               // labels stack away from the candles: below the lows of a long, above the highs of a short
    const levels = [...byPrice].sort((a, b) => (b[0] - a[0]) * dir).map(([price, names]) => {
      const natural = y(price) + (long ? 13 : -5), at = long ? Math.max(natural, edge + 13) : Math.min(natural, edge - 13);
      edge = at;
      return { price, names, labelY: at };
    });
    const sweepI = at(sec(trade.confirmations[0]?.ts ?? trade.signal_at) - 1);
    const placed: { x: number; y: number }[] = [];
    const conf = trade.confirmations.map((c, n) => {                      // numbered in the order they became true; nudged apart when they land together
      const i = at(sec(c.ts) - 1), cy = y(Math.max(lo, Math.min(hi, c.value)));
      let cx = x(i);
      while (placed.some((p) => Math.abs(p.x - cx) < 18 && Math.abs(p.y - cy) < 18)) cx += 19;
      placed.push({ x: cx, y: cy });
      return { n, c, i, x: cx, y: cy };
    });
    const gaps = trade.confirmations.filter((c) => c.extra?.top != null && c.extra?.bottom != null).map((c) => ({ a: at(sec(c.extra.since ?? c.ts)), b: at(sec(c.ts) - 1), top: c.extra.top as number, bottom: c.extra.bottom as number }));
    const ticks = bars.map((b, i) => ({ i, t: b[0] })).filter(({ t }) => t % 1800 === 0).filter((_, k, all) => k % Math.max(1, Math.ceil(all.length / (w / 78))) === 0);
    const tags = [{ p: trade.stop, c: "fill-sell" }, ...(trade.target != null && !far ? [{ p: trade.target, c: "fill-buy" }] : [])];   // stop and target named on the price scale
    return { bars, H, L, R, step, body, x, y, eI, xI, far, grid: grid.filter((p) => tags.every((t) => Math.abs(y(t.p) - y(p)) > 11)), whole, levels, sweepI, conf, gaps, ticks, lo, hi, tags, names: w >= 600 ? 2 : 1 };
  }, [trade, w]);

  const long = trade.side === "long", won = trade.net_usd > 0;
  const label = `${trade.symbol} ${trade.side}, entry ${px(trade.entry)}, stop ${px(trade.stop)}${trade.target != null ? `, target ${px(trade.target)}` : ""}, exit ${px(trade.exit)}`;
  return (
    <div ref={box} className="w-full select-none">
      {g && (
        <svg width={w} height={g.H} role="img" aria-label={label} className="block" onClick={() => onFocus(null)}>
          {g.grid.map((p) => (
            <g key={p}>
              <line x1={g.L} x2={w - g.R} y1={g.y(p)} y2={g.y(p)} stroke="var(--color-border)" strokeWidth={1} />
              <text x={w - g.R + 8} y={g.y(p) + 3.5} className="fill-muted font-mono tabular" fontSize={10.5}>{g.whole ? p.toLocaleString("en-US") : px(p)}</text>
            </g>
          ))}
          {g.gaps.map((r, k) => <rect key={k} x={g.x(r.a) - g.step / 2} width={Math.max(g.step, g.x(r.b) - g.x(r.a) + g.step)} y={g.y(r.top)} height={Math.max(2, g.y(r.bottom) - g.y(r.top))} fill="var(--color-text)" opacity={0.13} />)}
          {g.levels.map(({ price, names, labelY }) => (
            <g key={price}>
              <line x1={g.L} x2={g.x(g.sweepI) + g.step / 2} y1={g.y(price)} y2={g.y(price)} stroke="var(--color-chrome-2)" strokeWidth={1.25} strokeDasharray="5 4" />
              <text x={g.L + 4} y={labelY} className="fill-chrome-2" fontSize={11} paintOrder="stroke" stroke="var(--color-surface)" strokeWidth={3}>{names.slice(0, g.names).join(", ")}{names.length > g.names ? ` +${names.length - g.names}` : ""} {px(price)}</text>
            </g>
          ))}
          {g.bars.map((b, i) => {
            const up = b[4] >= b[1], c = up ? "var(--color-text)" : "var(--color-chrome-3)", top = g.y(Math.max(b[1], b[4])), h = Math.max(1, Math.abs(g.y(b[1]) - g.y(b[4])));
            return <g key={b[0]}><line x1={g.x(i)} x2={g.x(i)} y1={g.y(b[2])} y2={g.y(b[3])} stroke={c} strokeWidth={1} /><rect x={g.x(i) - g.body / 2} y={top} width={g.body} height={h} fill={c} /></g>;
          })}
          <line x1={g.x(g.eI)} x2={w - g.R} y1={g.y(trade.stop)} y2={g.y(trade.stop)} stroke="var(--color-sell)" strokeWidth={1.5} />
          {trade.target != null && !g.far && <>
            <line x1={g.x(g.eI)} x2={w - g.R} y1={g.y(trade.target)} y2={g.y(trade.target)} stroke="var(--color-buy)" strokeWidth={1.5} />
          </>}
          {trade.target != null && g.far && <text x={g.x(g.eI)} y={trade.target > trade.entry ? 22 : g.H - 30} className="fill-buy" fontSize={11}>target {px(trade.target)} is {trade.target > trade.entry ? "above" : "below"} this view</text>}
          <line x1={g.x(g.eI)} x2={g.x(g.xI)} y1={g.y(trade.entry)} y2={g.y(trade.exit ?? trade.entry)} stroke={won ? "var(--color-buy)" : "var(--color-sell)"} strokeWidth={2} />
          <path d={`M ${g.x(g.eI) - 7} ${g.y(trade.entry) + (long ? 9 : -9)} L ${g.x(g.eI) + 7} ${g.y(trade.entry) + (long ? 9 : -9)} L ${g.x(g.eI)} ${g.y(trade.entry) + (long ? -3 : 3)} Z`} fill="var(--color-text)" stroke="#000" strokeWidth={1} />
          {trade.exit != null && <rect x={g.x(g.xI) - 5} y={g.y(trade.exit) - 5} width={10} height={10} fill={won ? "var(--color-buy)" : "var(--color-sell)"} stroke="#000" strokeWidth={1} />}
          {g.conf.map(({ n, c, i, x: cx, y }) => {
            const on = focus === n, r = on ? 11 : 8.5;
            return (
              <g key={n} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); onFocus(on ? null : n); }}>
                <title>{`${CONFIRMATION_NAME[c.kind] ?? c.kind}, ${nyTime(c.ts)}`}</title>
                {on && <line x1={g.x(i)} x2={g.x(i)} y1={12} y2={g.H - 24} stroke="var(--color-text)" strokeWidth={1} strokeDasharray="2 3" />}
                <circle cx={cx} cy={y} r={r} fill={on ? "var(--color-text)" : "#000"} stroke="var(--color-text)" strokeWidth={1.5} />
                <text x={cx} y={y + 3.6} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={on ? "#000" : "var(--color-text)"}>{n + 1}</text>
              </g>
            );
          })}
          {g.tags.map((t) => <text key={t.c} x={w - g.R + 8} y={g.y(t.p) + 3.5} className={`${t.c} font-mono tabular`} fontSize={10.5} fontWeight={600}>{g.whole ? Math.round(t.p).toLocaleString("en-US") : px(t.p)}</text>)}
          {g.ticks.map(({ i, t }) => <text key={t} x={g.x(i)} y={g.H - 7} textAnchor="middle" className="fill-muted font-mono tabular" fontSize={10.5}>{nyTime(t)}</text>)}
        </svg>
      )}
    </div>
  );
}

/** Equity after each trade, as a plain line against the starting amount. */
export function EquityLine({ curve, start }: { curve: [string, number][]; start: number }) {
  if (curve.length < 2) return null;
  const W = 600, H = 120, pts = [start, ...curve.map((c) => c[1])], lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
  const xy = pts.map((p, i) => `${(i / (pts.length - 1)) * (W - 8) + 4},${H - 8 - ((p - lo) / span) * (H - 16)}`).join(" ");
  const base = H - 8 - ((start - lo) / span) * (H - 16);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[120px] w-full" role="img" aria-label={`Equity from ${px(start)} to ${px(pts[pts.length - 1])}`}>
      <line x1={4} x2={W - 4} y1={base} y2={base} stroke="var(--color-border)" strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      <polyline points={xy} fill="none" stroke="var(--color-text)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
