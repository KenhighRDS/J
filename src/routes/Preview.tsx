// Dev-only fixtures for reviewing the card without a backend: /__preview/signal?state=live|closed
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SignalCard } from "../components/SignalCard";
import type { Profile, Receipt, Signal } from "../lib/types";

const profile: Profile = { id: "u", email: "wolf@example.com", name: "Wolf", role: "admin", status: "active", balance: 10000, balance_currency: "USD", risk_pct: 1, balance_source: "manual", last_seen: null, created_at: "" };
export function Preview() {
  const [params] = useSearchParams();
  const state = params.get("state") ?? "live";
  const base: Signal = { id: "s1", ea_source_id: null, ea_uid: "1", source_name: "XAU EA", symbol: "XAUUSDm", base_symbol: "XAUUSD", direction: "buy", order_type: state === "pending" ? "buy_stop" : "market",
    entry: 2341.5, sl: 2335, tp: 2355, ea_lot: 0.5, digits: 2, point: 0.01, pip_size: 0.1, tick_size: 0.01, tick_value: 1, contract_size: 100, vol_min: 0.01, vol_step: 0.01, vol_max: 100, account_currency: "USD",
    status: state === "closed" ? "closed" : "live", expires_at: state === "pending" ? null : new Date(Date.now() + 95_000).toISOString(), triggered_at: null, trigger_price: null, closed_at: null, close_price: state === "closed" ? 2355 : null,
    result_pips: state === "closed" ? 135 : null, outcome: state === "closed" ? "win" : null, close_reason: state === "closed" ? "tp" : null, is_test: false, sent_at: new Date(Date.now() - 25_000).toISOString(), created_at: new Date().toISOString() };
  const [receipt, setReceipt] = useState<Receipt>({ id: "r", signal_id: "s1", wann_call_id: null, user_id: "u", kind: "ea", delivered_at: null, opened_at: new Date().toISOString(), copied: {}, status: state === "closed" ? "taken" : "opened", status_source: null, user_lot: null, ring_count: 1, question_sent_at: null, answered_at: null, user_entry: null, user_close: null, user_pips: state === "closed" ? 135 : null });
  return (
    <div className="app-frame">
      <SignalCard signal={base} receipt={receipt} profile={profile} events={[]} onCopy={(f) => setReceipt({ ...receipt, copied: { ...receipt.copied, [f]: "x" } })} onTake={() => setReceipt({ ...receipt, status: "taken" })} onSkip={() => setReceipt({ ...receipt, status: "skipped" })} onClose={() => undefined} onSetBalance={() => undefined} />
    </div>
  );
}
