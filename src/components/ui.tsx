import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, useEffect } from "react";

export function Logo({ size = 56, className = "" }: { size?: number; className?: string }) {
  return <img src="/icons/icon-512.png" width={size} height={size} alt="" className={`rounded-2xl ${className}`} draggable={false} />;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "quiet"; busy?: boolean; full?: boolean };
export function Button({ variant = "primary", busy, full, className = "", children, disabled, ...rest }: ButtonProps) {
  const base = "focus-ring inline-flex items-center justify-center gap-2 h-12 px-5 rounded-[14px] text-[15px] font-medium transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 no-select";
  const look = {
    primary: "chrome-bg text-black",
    ghost: "border border-border text-text",
    quiet: "text-muted hover:text-text",
    danger: "border border-sell/50 text-sell",
  }[variant];
  return (
    <button className={`${base} ${look} ${full ? "w-full" : ""} ${className}`} disabled={disabled || busy} {...rest}>
      {busy ? <Spinner /> : children}
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`inline-block h-4 w-4 rounded-full border-2 border-current border-r-transparent animate-spin ${className}`} />;
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | null };
export function Field({ label, hint, error, id, className = "", ...rest }: FieldProps) {
  const fid = id ?? label.toLowerCase().replace(/\s+/g, "-");
  return (
    <label htmlFor={fid} className={`block ${className}`}>
      <span className="block text-[13px] text-muted mb-1.5">{label}</span>
      <input id={fid} className="focus-ring w-full h-12 px-4 rounded-[14px] bg-surface-2 border border-border text-text placeholder:text-muted/60" {...rest} />
      {error ? <span className="block mt-1.5 text-[13px] text-sell">{error}</span> : hint ? <span className="block mt-1.5 text-[13px] text-muted">{hint}</span> : null}
    </label>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[16px] bg-surface border border-border ${className}`}>{children}</div>;
}

export function Row({ label, value, onClick, trailing }: { label: ReactNode; value?: ReactNode; onClick?: () => void; trailing?: ReactNode }) {
  const inner = (
    <>
      <span className="text-[15px] text-text">{label}</span>
      <span className="ml-auto flex items-center gap-2 text-[15px] text-muted">{value}{trailing}</span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="focus-ring flex w-full items-center min-h-12 px-4 py-3 text-left border-b border-border last:border-b-0 active:bg-surface-2">
      {inner}
    </button>
  ) : (
    <div className="flex items-center min-h-12 px-4 py-3 border-b border-border last:border-b-0">{inner}</div>
  );
}

/** Bottom sheet. Children render inside; Escape and backdrop close it. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-[22px] bg-surface border-t border-border p-5 pb-[max(20px,env(safe-area-inset-bottom))] fade-up">
        {title && <h2 className="text-[17px] font-semibold mb-3">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center px-8 py-16">
      <p className="text-[17px] font-medium">{title}</p>
      {body && <p className="mt-2 text-[14px] text-muted max-w-[32ch]">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`focus-ring relative h-7 w-12 rounded-full transition ${on ? "chrome-bg" : "bg-surface-2 border border-border"}`}>
      <span className={`absolute top-1 h-5 w-5 rounded-full transition ${on ? "left-6 bg-black" : "left-1 bg-muted"}`} />
    </button>
  );
}

export function Notice({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "warn" | "ok" }) {
  const t = { muted: "border-border text-muted", warn: "border-sell/40 text-text", ok: "border-buy/40 text-text" }[tone];
  return <div className={`rounded-[14px] border px-4 py-3 text-[14px] leading-snug ${t}`}>{children}</div>;
}

export function PageTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between px-5 pt-4 pb-3">
      <h1 className="text-[28px] font-semibold tracking-tight">{children}</h1>
      {right}
    </div>
  );
}
