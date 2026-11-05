import { useEffect, useRef, useState } from "react";
import { success } from "../lib/clipboard";

/** Drag the chrome knob to the end to confirm. Locked until `unlocked`; keyboard: Enter/Space on the knob confirms. */
export function SwipeConfirm({ unlocked, lockedHint, onConfirm, label = "Swipe · I took it" }: { unlocked: boolean; lockedHint: string; onConfirm: () => void; label?: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [drag, setDrag] = useState(false);
  const [done, setDone] = useState(false);
  const max = () => (track.current ? track.current.clientWidth - 60 : 240);
  useEffect(() => { if (!drag && !done) setX(0); }, [drag, done]);
  const start = (e: React.PointerEvent) => { if (!unlocked || done) return; (e.target as HTMLElement).setPointerCapture(e.pointerId); setDrag(true); };
  const move = (e: React.PointerEvent) => {
    if (!drag || !track.current) return;
    const rect = track.current.getBoundingClientRect();
    setX(Math.max(0, Math.min(max(), e.clientX - rect.left - 30)));
  };
  const end = () => {
    if (!drag) return;
    setDrag(false);
    if (x >= max() * 0.9) { setDone(true); setX(max()); void success(); onConfirm(); }
  };
  const pct = max() > 0 ? x / max() : 0;
  return (
    <div ref={track} className={`relative h-[60px] w-full overflow-hidden rounded-full border ${unlocked ? "border-border bg-surface-2" : "border-border/60 bg-surface"} no-select`} aria-live="polite">
      <div className="absolute inset-y-0 left-0 chrome-bg opacity-30" style={{ width: x + 60 }} />
      <span className={`absolute inset-y-0 left-[64px] right-4 flex items-center justify-center text-center text-[14px] leading-tight ${unlocked ? "text-text" : "text-muted"}`} style={{ opacity: 1 - pct }}>
        {done ? "Taken" : unlocked ? label : lockedHint}
      </span>
      <div role="button" tabIndex={unlocked && !done ? 0 : -1} aria-label={unlocked ? "Swipe to confirm you took it" : lockedHint}
        onKeyDown={(e) => { if (unlocked && !done && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setDone(true); setX(max()); void success(); onConfirm(); } }}
        onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
        className={`focus-ring absolute top-[4px] left-[4px] flex h-[52px] w-[52px] items-center justify-center rounded-full ${unlocked ? "chrome-bg text-black" : "bg-border text-muted"} ${drag ? "" : "transition-transform duration-300"}`}
        style={{ transform: `translateX(${x}px)`, touchAction: "none" }}>
        {done ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
              : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>}
      </div>
    </div>
  );
}
