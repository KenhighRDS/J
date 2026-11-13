import { type FormEvent, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Receipt } from "../lib/types";
import { parseAmount } from "../lib/stocks";
import { Button, Field, Sheet } from "./ui";

/** Asks what the member put on a Wann call (what they paid, what it pays if it wins) or used on a J trade (lot, or their real result). */
export function MoneySheet({ open, onClose, kind, receipt, title, onSaved, skippable, won }: { open: boolean; onClose: () => void; kind: "wann" | "ea"; receipt: Receipt | null; title: string; onSaved: (r: Receipt) => void; skippable?: boolean; won?: boolean }) {
  const [a, setA] = useState(""); const [b, setB] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !receipt) return;
    setErr(null);
    if (kind === "wann") { setA(receipt.stake_usd != null ? String(receipt.stake_usd) : ""); setB(receipt.payout_usd != null ? String(receipt.payout_usd) : ""); }
    else { setA(receipt.user_lot != null ? String(receipt.user_lot) : ""); setB(receipt.profit_usd != null ? String(receipt.profit_usd) : ""); }
  }, [open, receipt, kind]);
  if (!receipt) return null;
  const save = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    const x = parseAmount(a), y = parseAmount(b);
    const args: Record<string, unknown> = receipt.kind === "wann" ? { p_call: receipt.wann_call_id } : { p_signal: receipt.signal_id };
    if (kind === "wann") {
      if (x == null || x <= 0) { setErr("Enter what you paid"); return; }
      if (won && y == null) { setErr("Enter what it paid you"); return; }
      if (y != null && y < x) { setErr("The payout is the full amount you get back if it wins, so it is more than what you paid"); return; }
      args.p_stake = x; if (y != null) args.p_payout = y;
    } else {
      if (x == null && y == null) { setErr("Enter your lot or your result"); return; }
      if (x != null && x <= 0) { setErr("The lot must be above 0"); return; }
      if (x != null) args.p_lot = x;
      if (y != null) args.p_profit = y;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("receipt_set_money", args);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    if (data) onSaved(data as Receipt);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <form onSubmit={save} className="space-y-3">
        {kind === "wann" ? (
          <>
            <Field label="What you paid ($)" inputMode="decimal" autoFocus={!won} placeholder="100" value={a} onChange={(e) => setA(e.target.value)} />
            <Field label={won ? "What it paid you ($)" : "Payout if it wins ($)"} inputMode="decimal" autoFocus={won} placeholder="112" value={b} onChange={(e) => setB(e.target.value)} hint={won ? "The total Kalshi paid out for this call, your stake included." : "Kalshi shows both numbers when you place the order. You can add the payout later."} error={err} />
          </>
        ) : (
          <>
            <Field label="Lot you used" inputMode="decimal" autoFocus placeholder="0.10" value={a} onChange={(e) => setA(e.target.value)} hint="J works out the money from your lot and the pips." />
            <Field label="Or your real result ($)" inputMode="text" placeholder="-35.20" value={b} onChange={(e) => setB(e.target.value)} hint="Optional. If you enter what your broker shows, J uses that instead." error={err} />
          </>
        )}
        <div className={skippable ? "grid grid-cols-2 gap-3" : ""}>
          {skippable && <Button variant="ghost" type="button" onClick={onClose}>Skip</Button>}
          <Button full type="submit" busy={busy}>Save</Button>
        </div>
      </form>
    </Sheet>
  );
}
