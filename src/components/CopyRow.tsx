import { useState } from "react";
import { copyText, tick } from "../lib/clipboard";

export function CopyRow({ label, value, display, copied, onCopied, highlight, hint }: { label: string; value: string | null; display?: string; copied: boolean; onCopied: () => void; highlight?: boolean; hint?: string }) {
  const [flash, setFlash] = useState(false);
  const disabled = value == null;
  const copy = async () => {
    if (disabled) return;
    const ok = await copyText(value);
    if (!ok) return;
    void tick(); setFlash(true); window.setTimeout(() => setFlash(false), 500); onCopied();
  };
  return (
    <button type="button" onClick={copy} disabled={disabled} aria-label={`Copy ${label}${value ? ` ${value}` : ""}`}
      className={`focus-ring flex w-full items-center gap-3 rounded-[12px] px-3 min-h-[42px] text-left transition ${highlight ? "bg-surface-2 ring-1 ring-chrome-2/60" : "bg-surface"} ${flash ? "scale-[0.99]" : ""} disabled:opacity-60`}>
      <span className="w-[76px] shrink-0 text-[13px] text-muted">{label}</span>
      <span className={`min-w-0 flex-1 truncate font-mono tabular ${value ? "text-[19px]" : "text-[14px] text-muted"}`}>{display ?? value ?? hint ?? "–"}</span>
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${copied ? "bg-buy/20 text-buy" : "text-muted"}`} aria-hidden>
        {copied ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
        )}
      </span>
    </button>
  );
}
