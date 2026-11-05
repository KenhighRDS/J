import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Field, Logo, Notice } from "../components/ui";
import { lastEmail, sendCode } from "../lib/auth";

export function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState(lastEmail());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    try { if (sessionStorage.getItem("j:accessEnded")) { setEnded(true); sessionStorage.removeItem("j:accessEnded"); } } catch { /* ignore */ }
  }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(null); setBusy(true);
    try { await sendCode(email.trim()); nav("/login/code", { state: { email: email.trim() } }); }
    catch (err) { setError(err instanceof Error ? err.message : "Couldn't send the code"); }
    finally { setBusy(false); }
  };
  return (
    <div className="app-frame">
      <form onSubmit={submit} className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 pb-16">
        <Logo size={72} className="mb-8" />
        <h1 className="text-[32px] font-semibold tracking-tight leading-none">Sign in to J</h1>
        <p className="mt-3 text-[15px] text-muted">We'll email you a 6-digit code. No password.</p>
        {ended && <div className="mt-5"><Notice tone="warn">Your access has ended.</Notice></div>}
        <Field className="mt-8" label="Email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
          value={email} onChange={(e) => setEmail(e.target.value)} error={error} required autoFocus={!email} />
        <Button type="submit" className="mt-4" full busy={busy} disabled={!email.includes("@")}>Send code</Button>
      </form>
    </div>
  );
}
