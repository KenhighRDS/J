import { type FormEvent, useEffect, useState } from "react";
import { Button, Field, Notice, Toggle } from "../../components/ui";
import { callFunction, supabase } from "../../lib/supabase";
import type { OrderType, Profile } from "../../lib/types";

const presets: Record<string, { digits: number; pip_size: number; tick_size: number; tick_value: number }> = {
  XAUUSD: { digits: 2, pip_size: 0.1, tick_size: 0.01, tick_value: 1 },
  EURUSD: { digits: 5, pip_size: 0.0001, tick_size: 0.00001, tick_value: 1 },
  GBPUSD: { digits: 5, pip_size: 0.0001, tick_size: 0.00001, tick_value: 1 },
  USDJPY: { digits: 3, pip_size: 0.01, tick_size: 0.001, tick_value: 0.65 },
  US30: { digits: 1, pip_size: 1, tick_size: 0.1, tick_value: 0.1 },
};

export function SendSignal() {
  const [symbol, setSymbol] = useState("XAUUSD");
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [entry, setEntry] = useState(""); const [sl, setSl] = useState(""); const [tp, setTp] = useState("");
  const [pip, setPip] = useState(""); const [expiry, setExpiry] = useState("");
  const [test, setTest] = useState(true);
  const [targets, setTargets] = useState<string[]>([]);
  const [users, setUsers] = useState<Pick<Profile, "id" | "email" | "name">[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { void supabase.from("profiles").select("id,email,name").eq("status", "active").order("email").then(({ data }) => setUsers((data ?? []) as typeof users)); }, []);
  const preset = presets[symbol.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)];

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      const p = preset;
      const r = await callFunction<{ signal_id: string }>("admin-send-signal", {
        action: "send", test, targets,
        signal: { symbol: symbol.trim().toUpperCase(), direction, order_type: orderType, entry: Number(entry), sl: sl ? Number(sl) : null, tp: tp ? Number(tp) : null,
          digits: p?.digits, pip_size: pip ? Number(pip) : p?.pip_size, tick_size: p?.tick_size, tick_value: p?.tick_value, expiry_sec: expiry ? Number(expiry) : 0 },
      });
      setMsg({ ok: true, text: `Sent. Signal ${r.signal_id.slice(0, 8)}…` });
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "Couldn't send" }); }
    finally { setBusy(false); }
  };
  const seg = (opts: { v: string; l: string }[], cur: string, set: (v: string) => void) => (
    <div className="flex rounded-[12px] bg-surface-2 p-1">
      {opts.map((o) => <button type="button" key={o.v} onClick={() => set(o.v)} className={`focus-ring flex-1 h-9 rounded-[9px] text-[14px] ${cur === o.v ? "bg-text text-black" : "text-muted"}`}>{o.l}</button>)}
    </div>
  );
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center justify-between rounded-[14px] border border-border px-4 py-3">
        <div><p className="text-[15px]">Test signal</p><p className="text-[13px] text-muted">{test ? "Admins only, never counts in reports" : "Goes to every subscriber"}</p></div>
        <Toggle on={test} onChange={setTest} label="Test signal" />
      </div>
      {test && users.length > 0 && (
        <div className="rounded-[14px] border border-border p-3">
          <p className="text-[13px] text-muted mb-2">Also send to</p>
          <div className="flex flex-wrap gap-2">
            {users.map((u) => { const on = targets.includes(u.id); return <button key={u.id} type="button" onClick={() => setTargets(on ? targets.filter((t) => t !== u.id) : [...targets, u.id])} className={`focus-ring rounded-full px-3 h-8 text-[13px] ${on ? "bg-text text-black" : "bg-surface-2 text-muted"}`}>{u.name ?? u.email}</button>; })}
          </div>
        </div>
      )}
      <Field label="Symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} hint={preset ? `Preset: ${preset.digits} digits, pip ${preset.pip_size}` : "No preset — set the pip size below"} autoCapitalize="characters" />
      {seg([{ v: "buy", l: "Buy" }, { v: "sell", l: "Sell" }], direction, (v) => setDirection(v as "buy" | "sell"))}
      {seg([{ v: "market", l: "Market" }, { v: `${direction}_stop`, l: "Stop" }, { v: `${direction}_limit`, l: "Limit" }], orderType === "market" ? "market" : orderType.endsWith("stop") ? `${direction}_stop` : `${direction}_limit`, (v) => setOrderType(v as OrderType))}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Entry" type="number" inputMode="decimal" step="any" value={entry} onChange={(e) => setEntry(e.target.value)} required />
        <Field label="SL" type="number" inputMode="decimal" step="any" value={sl} onChange={(e) => setSl(e.target.value)} />
        <Field label="TP" type="number" inputMode="decimal" step="any" value={tp} onChange={(e) => setTp(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Pip size" type="number" inputMode="decimal" step="any" value={pip} onChange={(e) => setPip(e.target.value)} placeholder={preset ? String(preset.pip_size) : "0.0001"} />
        <Field label="Expiry (s)" type="number" inputMode="numeric" value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="120" />
      </div>
      {msg && <Notice tone={msg.ok ? "ok" : "warn"}>{msg.text}</Notice>}
      <Button type="submit" full busy={busy} disabled={!entry}>{test ? "Send test signal" : "Send to everyone"}</Button>
    </form>
  );
}
