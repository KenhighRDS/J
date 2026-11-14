import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Field, PageTitle, Row, Sheet } from "../components/ui";
import { logOut } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { appVersion, isAndroidNative } from "../lib/platform";
import type { Profile } from "../lib/types";
import { NotificationsCard } from "../components/NotificationsCard";
import { FingerprintRow } from "../components/FingerprintRow";
import { AmountSheet } from "../components/AmountSheet";

export function Settings({ profile, reload }: { profile: Profile; reload: () => Promise<void> }) {
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [amountOpen, setAmountOpen] = useState(false);
  const amount = profile.default_amount ?? 100;
  const money = profile.balance != null ? `${profile.balance.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${profile.balance_currency ?? ""}` : "Not set";
  return (
    <div className="mx-auto w-full max-w-md pb-6">
      <PageTitle>Settings</PageTitle>
      <div className="px-4 space-y-4">
        <NotificationsCard profile={profile} />
        <Card>
          <Row label="Account balance" value={money} onClick={() => setBalanceOpen(true)} trailing={<Chevron />} />
          <Row label="Risk per trade" value={`${profile.risk_pct}%`} onClick={() => setBalanceOpen(true)} trailing={<Chevron />} />
          <Link to="/settings/tracker" className="focus-ring flex items-center min-h-12 px-4 py-3"><span className="text-[15px]">MT5 tracker</span><span className="ml-auto flex items-center gap-2 text-[15px] text-muted">{profile.balance_source === "tracker" ? "Connected" : "Not connected"}<Chevron /></span></Link>
        </Card>
        <Card>
          <Row label="Default amount" value={"$" + amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} onClick={() => setAmountOpen(true)} trailing={<Chevron />} />
          <Link to="/portfolio" className="focus-ring flex items-center min-h-12 px-4 py-3 border-b border-border"><span className="text-[15px]">My portfolio</span><span className="ml-auto flex items-center gap-2 text-[15px] text-muted">Your results in money<Chevron /></span></Link>
          <Link to="/reports" className="focus-ring flex items-center min-h-12 px-4 py-3"><span className="text-[15px]">Reports</span><span className="ml-auto flex items-center gap-2 text-[15px] text-muted">Weekly and monthly<Chevron /></span></Link>
        </Card>
        {isAndroidNative && (
          <Card>
            <Link to="/settings/alerts" className="focus-ring flex items-center min-h-12 px-4 py-3 border-b border-border"><span className="text-[15px]">Alerts and permissions</span><span className="ml-auto text-muted"><Chevron /></span></Link>
            <FingerprintRow />
          </Card>
        )}
        <Card>
          <Row label="Name" value={profile.name ?? "Add"} onClick={() => setNameOpen(true)} trailing={<Chevron />} />
          <Row label="Email" value={profile.email} />
          <Row label="Version" value={appVersion} />
        </Card>
        <Button variant="ghost" full onClick={() => { void logOut(); }} type="button">Log out of this device</Button>
      </div>
      <BalanceSheet open={balanceOpen} onClose={() => setBalanceOpen(false)} profile={profile} onSaved={reload} />
      <NameSheet open={nameOpen} onClose={() => setNameOpen(false)} profile={profile} onSaved={reload} />
      <AmountSheet open={amountOpen} onClose={() => setAmountOpen(false)} amount={amount} onSaved={reload} />
    </div>
  );
}

export function Chevron() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>; }

export function BalanceSheet({ open, onClose, profile, onSaved }: { open: boolean; onClose: () => void; profile: Profile; onSaved: () => Promise<void> }) {
  const [balance, setBalance] = useState(profile.balance?.toString() ?? "");
  const [risk, setRisk] = useState(profile.risk_pct.toString());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    const b = Number(balance), r = Number(risk);
    if (!(b > 0)) { setError("Enter your account balance"); setBusy(false); return; }
    if (!(r > 0 && r <= 100)) { setError("Risk must be between 0 and 100%"); setBusy(false); return; }
    const { error: err } = await supabase.rpc("profile_set_balance", { p_balance: b, p_risk: r });
    setBusy(false);
    if (err) { setError(err.message); return; }
    await onSaved(); onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Balance and risk">
      <form onSubmit={save} className="space-y-4">
        <Field label={`Account balance (${profile.balance_currency ?? "USD"})`} type="number" inputMode="decimal" step="any" min="0" value={balance} onChange={(e) => setBalance(e.target.value)} hint="Used for your lot size on every signal." autoFocus />
        <Field label="Risk per trade (%)" type="number" inputMode="decimal" step="0.1" min="0.1" max="100" value={risk} onChange={(e) => setRisk(e.target.value)} error={error} />
        <Button type="submit" full busy={busy}>Save</Button>
      </form>
    </Sheet>
  );
}

function NameSheet({ open, onClose, profile, onSaved }: { open: boolean; onClose: () => void; profile: Profile; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(profile.name ?? "");
  const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    await supabase.rpc("profile_set_name", { p_name: name });
    setBusy(false); await onSaved(); onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Your name">
      <form onSubmit={save} className="space-y-4">
        <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} hint="Shown on your reports." autoFocus />
        <Button type="submit" full busy={busy}>Save</Button>
      </form>
    </Sheet>
  );
}
