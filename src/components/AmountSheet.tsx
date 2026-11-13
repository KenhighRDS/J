import { type FormEvent, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { parseAmount } from "../lib/stocks";
import { Button, Field, Sheet } from "./ui";

/** The one amount J uses for every Wann call and stock a member takes. `first` is the one-time question; without it
 *  this is the same field opened from Settings. */
export function AmountSheet({ open, onClose, amount, onSaved, first, preview }: { open: boolean; onClose: () => void; amount: number; onSaved: () => Promise<void>; first?: boolean; preview?: boolean }) {
  const [value, setValue] = useState(String(amount));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setValue(String(amount)); setError(null); } }, [open, amount]);
  const save = async (e: FormEvent) => {
    e.preventDefault(); setError(null);
    const n = parseAmount(value);
    if (n == null || !(n > 0)) { setError("Enter an amount above 0"); return; }
    if (preview) { onClose(); return; }
    setBusy(true);
    const { error: err } = await supabase.rpc("profile_set_default_amount", { p_amount: n });
    setBusy(false);
    if (err) { setError(err.message); return; }
    await onSaved(); onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={first ? "What amount do you use?" : "Default amount"}>
      <form onSubmit={save} className="space-y-4">
        {first && <p className="text-[15px] leading-snug text-muted">One amount for every Wann call and stock you take. J uses it to work out your profits, so it never has to ask again.</p>}
        <Field label="Amount ($)" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus error={error}
          hint={first ? "You can change it any time in Settings." : "J uses this amount for every Wann call and stock you take from now on. What is already in your portfolio keeps its amount."} />
        <Button type="submit" full busy={busy}>Save</Button>
      </form>
    </Sheet>
  );
}
