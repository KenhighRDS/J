import { useEffect, useState } from "react";
import { countdown } from "../lib/format";

/** Ring that drains toward expiry. `total` is the full window in ms (for the arc); shows LIVE when there is no expiry. */
export function CountdownRing({ expiresAt, total, size = 112, label }: { expiresAt: string | null; total: number; size?: number; label?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!expiresAt) return; const t = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(t); }, [expiresAt]);
  const r = (size - 8) / 2, c = 2 * Math.PI * r;
  if (!expiresAt) {
    return (
      <div className="flex items-center justify-center rounded-full border border-border" style={{ width: size, height: size }}>
        <div className="text-center"><p className="font-mono text-[20px] tracking-wide">LIVE</p><p className="text-[11px] text-muted">{label ?? "until cancelled"}</p></div>
      </div>
    );
  }
  const left = Math.max(0, new Date(expiresAt).getTime() - now);
  const frac = total > 0 ? Math.min(1, left / total) : 0;
  const urgent = left < 20_000 && left > 0;
  return (
    <div className="relative" style={{ width: size, height: size }} role="timer" aria-label={`${countdown(left)} left`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#232326" strokeWidth="4" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={left <= 0 ? "#6E7279" : urgent ? "#E5484D" : "#BFC3C9"} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: "stroke-dashoffset 250ms linear" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-mono tabular text-[24px] ${urgent ? "text-sell" : ""}`}>{left <= 0 ? "0:00" : countdown(left)}</span>
        <span className="text-[11px] text-muted">{left <= 0 ? "expired" : "to expiry"}</span>
      </div>
    </div>
  );
}
