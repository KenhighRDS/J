import { useEffect, useMemo, useState } from "react";
import type { Profile, Receipt, Signal, SignalEvent } from "../lib/types";
import { headline, lots, pips, price, timeShort } from "../lib/format";
import { lotForSignal } from "../lib/lot";
import { CountdownRing } from "./Countdown";
import { CopyRow } from "./CopyRow";
import { SwipeConfirm } from "./SwipeConfirm";
import { StatusChip } from "./StatusChip";
import { Button } from "./ui";

export interface SignalCardProps {
  signal: Signal; receipt: Receipt; profile: Profile; events: SignalEvent[]; highlightEvent?: string | null;
  onCopy: (field: string) => void; onTake: (lot: number | null) => void; onSkip: () => void; onClose: () => void; onSetBalance: () => void;
  adminActions?: React.ReactNode;
}

const eventTitle: Record<string, string> = { move_be: "Move SL to breakeven", update: "New SL / TP", partial: "Partial close", triggered: "Order triggered", cancel: "Cancelled", close: "Closed" };

/** Full-screen, no-scroll signal card. Every value is tap-to-copy; the slider confirms "I took it". */
export function SignalCard(p: SignalCardProps) {
  const { signal: s, receipt: r, profile } = p;
  const dirColor = s.direction === "buy" ? "text-buy" : "text-sell";
  const lot = useMemo(() => lotForSignal(s, profile.balance, profile.risk_pct), [s, profile.balance, profile.risk_pct]);
  const [sinceOpen, setSinceOpen] = useState(0);
  useEffect(() => { const t = window.setInterval(() => setSinceOpen((x) => x + 1), 1000); return () => window.clearInterval(t); }, []);
  const copiedAll = Boolean(r.copied.entry && r.copied.tp && r.copied.lot && (s.sl == null || r.copied.sl));
  const openedMs = r.opened_at ? Date.now() - new Date(r.opened_at).getTime() : sinceOpen * 1000;
  const unlocked = copiedAll || openedMs >= 10_000;
  const finished = s.status === "closed" || s.status === "cancelled";
  const canTake = !finished && r.status !== "taken";
  const latest = p.events.filter((e) => e.type !== "open").slice(-1)[0] ?? null;
  const totalMs = s.expires_at ? Math.max(1, new Date(s.expires_at).getTime() - new Date(s.sent_at ?? s.created_at).getTime()) : 0;
  const stateLine = s.status === "expired" ? "Expired" : s.status === "triggered" ? `Triggered at ${price(s.trigger_price, s.digits)}` : s.status === "cancelled" ? "Cancelled" : s.status === "closed" ? `Closed · ${pips(s.result_pips)} pips${s.close_reason ? ` · ${s.close_reason.toUpperCase()}` : ""}` : null;

  return (
    <div className="flex h-full flex-col px-4 pb-[max(10px,env(safe-area-inset-bottom))]">
      <header className="flex h-12 items-center">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-muted">{s.source_name ?? "J"}{s.is_test ? " · TEST" : ""} · {timeShort(s.sent_at ?? s.created_at)}</p>
        </div>
        {p.adminActions}
        <button type="button" onClick={p.onClose} aria-label="Close" className="focus-ring -mr-2 flex h-11 w-11 items-center justify-center text-muted"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
      </header>

      <div className="flex items-center gap-4 pt-1">
        <div className="min-w-0 flex-1">
          <h1 className="text-[clamp(22px,7vw,30px)] font-semibold leading-none tracking-tight"><span>{s.base_symbol}</span><span className="text-muted"> · </span><span className={dirColor}>{headline("", s.direction, s.order_type).trim()}</span></h1>
          {stateLine ? <p className="mt-2 text-[14px] text-muted">{stateLine}</p> : <p className="mt-2 text-[14px] text-muted">{s.order_type === "market" ? "Copy now, expires soon" : "Pending order, live until cancelled"}</p>}
          {latest && latest.type !== "close" && latest.type !== "cancel" && (
            <div className={`mt-2 rounded-[10px] border px-3 py-1.5 text-[13px] ${p.highlightEvent === latest.type ? "border-chrome-2/60 bg-surface-2 text-text" : "border-border text-muted"}`}>{eventTitle[latest.type] ?? latest.type} · {timeShort(latest.created_at)}</div>
          )}
        </div>
        {finished || s.status === "expired" ? (
          <div className="flex h-[96px] w-[96px] items-center justify-center rounded-full border border-border text-center"><span className="font-mono text-[18px]">{s.status === "closed" ? pips(s.result_pips) : s.status === "cancelled" ? "✕" : "0:00"}</span></div>
        ) : (
          <CountdownRing expiresAt={s.order_type === "market" ? s.expires_at : null} total={totalMs} size={96} />
        )}
      </div>

      <div className="mt-2 flex flex-1 flex-col justify-center gap-1">
        <CopyRow label="Symbol" value={s.symbol} copied={!!r.copied.symbol} onCopied={() => p.onCopy("symbol")} />
        <CopyRow label="Direction" value={s.direction.toUpperCase()} copied={!!r.copied.direction} onCopied={() => p.onCopy("direction")} />
        <CopyRow label="Order" value={s.order_type.replace("_", " ").toUpperCase()} copied={!!r.copied.order_type} onCopied={() => p.onCopy("order_type")} />
        <CopyRow label="Entry" value={price(s.entry, s.digits)} copied={!!r.copied.entry} onCopied={() => p.onCopy("entry")} highlight={p.highlightEvent === "triggered"} />
        <CopyRow label="SL" value={s.sl == null ? null : price(s.sl, s.digits)} hint="No SL" copied={!!r.copied.sl} onCopied={() => p.onCopy("sl")} highlight={p.highlightEvent === "move_be" || p.highlightEvent === "update"} />
        <CopyRow label="TP" value={s.tp == null ? null : price(s.tp, s.digits)} hint="No TP" copied={!!r.copied.tp} onCopied={() => p.onCopy("tp")} highlight={p.highlightEvent === "update"} />
        {s.sl == null ? (
          <CopyRow label="Your lot" value={null} hint="No SL — use your own size" copied={false} onCopied={() => undefined} />
        ) : profile.balance == null ? (
          <button type="button" onClick={p.onSetBalance} className="focus-ring flex min-h-[42px] w-full items-center gap-3 rounded-[12px] bg-surface px-3 text-left"><span className="w-[76px] shrink-0 text-[13px] text-muted">Your lot</span><span className="text-[15px] underline">Set balance</span></button>
        ) : (
          <CopyRow label="Your lot" value={lot == null ? null : lots(lot)} hint="Can't size this one" copied={!!r.copied.lot} onCopied={() => p.onCopy("lot")} />
        )}
        {profile.balance != null && s.sl != null && lot != null && (
          <p className="px-3 text-[11px] text-muted">Based on {profile.risk_pct}% of {profile.balance.toLocaleString(undefined, { maximumFractionDigits: 0 })} — check your broker's contract size.</p>
        )}
      </div>

      <div className="mt-2 space-y-2">
        {canTake ? (
          <SwipeConfirm unlocked={unlocked} lockedHint={copiedAll ? "" : "Copy entry, SL, TP and lot to unlock"} onConfirm={() => p.onTake(lot)} />
        ) : (
          <div className="flex h-[60px] items-center justify-center gap-2 rounded-full border border-border text-[15px]"><StatusChip status={r.status} />{r.status === "taken" && r.user_pips != null && <span className="font-mono text-[15px]">{pips(r.user_pips)} pips</span>}</div>
        )}
        {!finished && r.status !== "skipped" && r.status !== "taken" ? (
          <Button variant="quiet" full type="button" onClick={p.onSkip}>Skip this one</Button>
        ) : <div className="h-12" />}
      </div>
    </div>
  );
}
