import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, Logo } from "../components/ui";
import { sendCode, verifyCode } from "../lib/auth";

export function Code() {
  const nav = useNavigate();
  const { state } = useLocation() as { state?: { email?: string } };
  const email = state?.email ?? "";
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(30);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!email) nav("/login", { replace: true }); }, [email, nav]);
  useEffect(() => { if (resendIn <= 0) return; const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000); return () => window.clearTimeout(t); }, [resendIn]);

  const submit = async (value: string) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await verifyCode(email, value); nav("/", { replace: true }); }
    catch (err) { setError(err instanceof Error ? err.message : "That code didn't work"); setCode(""); input.current?.focus(); }
    finally { setBusy(false); }
  };
  const onChange = (raw: string) => {
    const v = raw.replace(/\D/g, "").slice(0, 6);
    setCode(v);
    if (v.length === 6) void submit(v);
  };
  const paste = async () => {
    try { const t = await navigator.clipboard.readText(); onChange(t); } catch { input.current?.focus(); }
  };
  const resend = async () => {
    setResendIn(30); setError(null);
    try { await sendCode(email); } catch (err) { setError(err instanceof Error ? err.message : "Couldn't resend"); }
  };

  return (
    <div className="app-frame">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 pb-16">
        <Logo size={56} className="mb-6" />
        <h1 className="text-[28px] font-semibold tracking-tight leading-none">Enter your code</h1>
        <p className="mt-3 text-[15px] text-muted">Sent to <span className="text-text">{email}</span></p>
        <button type="button" className="relative mt-8 flex gap-2 w-full text-left" onClick={() => input.current?.focus()} aria-label="6-digit code">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className={`flex h-14 flex-1 items-center justify-center rounded-[12px] border bg-surface-2 font-mono text-[24px] ${i === code.length ? "border-chrome-2" : "border-border"}`}>{code[i] ?? ""}</span>
          ))}
        </button>
        <input ref={input} className="absolute opacity-0 h-px w-px -z-10" type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={6}
          value={code} onChange={(e) => onChange(e.target.value)} autoFocus aria-hidden />
        {error && <p className="mt-3 text-[14px] text-sell">{error}</p>}
        <div className="mt-6 flex gap-3">
          <Button variant="ghost" onClick={paste} type="button">Paste</Button>
          <Button variant="quiet" type="button" onClick={resend} disabled={resendIn > 0}>{resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}</Button>
        </div>
        <Button className="mt-6" full busy={busy} disabled={code.length < 6} onClick={() => submit(code)} type="button">Continue</Button>
        <button type="button" className="mt-5 text-[14px] text-muted self-start" onClick={() => nav("/login")}>Use a different email</button>
      </div>
    </div>
  );
}
