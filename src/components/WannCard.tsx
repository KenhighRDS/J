import { useEffect, useState } from "react";
import type { Receipt, WannCall } from "../lib/types";
import { countdown, timeShort } from "../lib/format";
import { CopyRow } from "./CopyRow";
import { SwipeConfirm } from "./SwipeConfirm";
import { StatusChip } from "./StatusChip";
import { Button } from "./ui";

export function WannBadge({ size = 28 }: { size?: number }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 pl-1 pr-2.5 py-0.5 text-[12px] text-muted"><img src="/icons/wann-logo.png" width={size - 8} height={size - 8} alt="" className="rounded-full" />Wann</span>;
}

export function WannCard({ call: c, receipt: r, onCopy, onTake, onSkip, onClose, adminActions }: { call: WannCall; receipt: Receipt; onCopy: (f: string) => void; onTake: () => void; onSkip: () => void; onClose: () => void; adminActions?: React.ReactNode }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);
  const kickoff = new Date(c.kickoff_utc);
  const left = kickoff.getTime() - now;
  const local = kickoff.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const finished = c.status !== "live" || left <= 0;
  const openedMs = r.opened_at ? now - new Date(r.opened_at).getTime() : 0;
  const unlocked = Boolean(r.copied.pick) || openedMs >= 10_000;
  const canTake = !finished && r.status !== "taken";
  return (
    <div className="flex h-full flex-col px-4 pb-[max(10px,env(safe-area-inset-bottom))]">
      <header className="flex h-12 items-center gap-2">
        <WannBadge />
        <p className="min-w-0 flex-1 truncate text-[13px] text-muted">{c.sport} · {c.competition}</p>
        {adminActions}
        <button type="button" onClick={onClose} aria-label="Close" className="focus-ring -mr-2 flex h-11 w-11 items-center justify-center text-muted"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
      </header>
      <h1 className="mt-1 text-[clamp(22px,6.5vw,28px)] font-semibold leading-tight tracking-tight">{c.home} <span className="text-muted">vs</span> {c.away}</h1>
      <p className="mt-1 text-[14px] text-muted">{c.status === "withdrawn" ? `Withdrawn ${timeShort(c.sent_at)}` : c.status === "finished" ? `${c.final_score ?? "Final"} · ${c.outcome === "won" ? "Won ✓" : c.outcome === "lost" ? "Lost" : "Void"}` : left > 0 ? `Kicks off in ${countdown(left)}` : "Kicked off"}</p>
      <div className="mt-4 rounded-[16px] border border-border bg-surface p-4">
        <p className="text-[13px] text-muted">The call</p>
        <p className="chrome text-[clamp(26px,8vw,36px)] font-semibold leading-tight">{c.pick_label}</p>
        <p className="mt-1 font-mono text-[22px]">{c.probability}%</p>
      </div>
      <div className="mt-3 flex flex-1 flex-col justify-center gap-1">
        <CopyRow label="Home" value={c.home} copied={!!r.copied.home} onCopied={() => onCopy("home")} />
        <CopyRow label="Away" value={c.away} copied={!!r.copied.away} onCopied={() => onCopy("away")} />
        <CopyRow label="Pick" value={c.pick_label} copied={!!r.copied.pick} onCopied={() => onCopy("pick")} />
        <CopyRow label="Kickoff" value={local} copied={!!r.copied.kickoff} onCopied={() => onCopy("kickoff")} />
      </div>
      <div className="mt-2 space-y-2">
        {canTake ? <SwipeConfirm unlocked={unlocked} lockedHint="Copy the pick to unlock" onConfirm={onTake} />
                 : <div className="flex h-[60px] items-center justify-center rounded-full border border-border"><StatusChip status={r.status} /></div>}
        {!finished && r.status !== "skipped" && r.status !== "taken" ? <Button variant="quiet" full type="button" onClick={onSkip}>Skip this one</Button> : <div className="h-12" />}
      </div>
    </div>
  );
}
