import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Empty, Field, Notice, Sheet } from "../../components/ui";
import { StatusChip } from "../../components/StatusChip";
import { PromoShare } from "../../components/PromoShare";
import { callFunction, supabase } from "../../lib/supabase";
import { headline, pips, price, timeShort } from "../../lib/format";
import type { ReceiptStatus, Signal } from "../../lib/types";
import { useRealtime } from "../../hooks/useRealtime";

interface UserStatus { user_id: string; email: string; name: string | null; status: ReceiptStatus; status_source: string | null; opened_at: string | null; user_lot: number | null; user_entry: number | null; user_close: number | null; user_pips: number | null }

export function AdminSignals() {
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [sel, setSel] = useState<Signal | null>(null);
  const [users, setUsers] = useState<UserStatus[]>([]);
  const [share, setShare] = useState<{ kind: "signal"; signal: Signal } | { kind: "wins"; signals: Signal[] } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [follow, setFollow] = useState<"move_be" | "update" | "close" | "cancel" | null>(null);
  const [f, setF] = useState({ sl: "", tp: "", price: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => { const { data } = await supabase.from("signals").select("*").order("created_at", { ascending: false }).limit(300); setSignals((data ?? []) as Signal[]); }, []);
  useEffect(() => { void load(); }, [load]);
  useRealtime([{ table: "signals" }, { table: "receipts" }], () => { void load(); if (sel) void openSignal(sel); }, [sel?.id]);
  const openSignal = async (s: Signal) => { setSel(s); const { data } = await supabase.rpc("admin_signal_receipts", { p_signal: s.id }); setUsers((data ?? []) as UserStatus[]); };
  const sendFollow = async (e: FormEvent) => {
    e.preventDefault(); if (!sel || !follow) return; setMsg(null);
    try {
      await callFunction("admin-send-signal", { action: "follow", signal_id: sel.id, type: follow, sl: f.sl ? Number(f.sl) : undefined, tp: f.tp ? Number(f.tp) : undefined, price: f.price ? Number(f.price) : undefined, reason: follow === "close" ? "manual" : undefined });
      setMsg("Sent"); setFollow(null); await load();
    } catch (err) { setMsg(err instanceof Error ? err.message : "Failed"); }
  };
  if (!signals) return null;
  const live = signals.filter((s) => s.status === "live" || s.status === "triggered"), past = signals.filter((s) => !live.includes(s));
  const row = (s: Signal) => (
    <div key={s.id} className="flex items-center gap-2 px-3 py-2.5 border-b border-border last:border-b-0">
      {s.status === "closed" && <input type="checkbox" aria-label="Select for recent wins image" checked={picked.includes(s.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, s.id].slice(-6) : picked.filter((x) => x !== s.id))} className="h-5 w-5 accent-white" />}
      <button type="button" onClick={() => openSignal(s)} className="focus-ring min-w-0 flex-1 text-left">
        <p className="truncate text-[15px]">{s.base_symbol} <span className={s.direction === "buy" ? "text-buy" : "text-sell"}>{headline("", s.direction, s.order_type).trim()}</span>{s.is_test && <span className="text-muted"> · TEST</span>}</p>
        <p className="text-[13px] text-muted">{timeShort(s.sent_at ?? s.created_at)} · {s.source_name ?? "manual"} · {s.status}{s.result_pips != null ? ` · ${pips(s.result_pips)}` : ""}</p>
      </button>
      <Link to={`/signal/${s.id}`} className="text-[13px] text-muted underline">Card</Link>
      <button type="button" className="text-[13px] text-muted underline" onClick={() => setShare({ kind: "signal", signal: s })}>Share</button>
    </div>
  );
  return (
    <div className="space-y-4">
      {signals.length === 0 && <Empty title="No signals yet" body="Send one from the Send tab or connect an EA." />}
      {live.length > 0 && <section><h2 className="mb-2 text-[15px] font-semibold">Live</h2><Card>{live.map(row)}</Card></section>}
      {past.length > 0 && <section><div className="mb-2 flex items-center justify-between"><h2 className="text-[15px] font-semibold">History</h2>{picked.length > 0 && <Button type="button" className="h-9 px-3" onClick={() => setShare({ kind: "wins", signals: signals.filter((s) => picked.includes(s.id)) })}>Recent wins image ({picked.length})</Button>}</div><Card>{past.map(row)}</Card></section>}
      {share && <PromoShare subject={share} open onClose={() => setShare(null)} />}
      <Sheet open={sel != null} onClose={() => { setSel(null); setFollow(null); }} title={sel ? `${sel.base_symbol} ${headline("", sel.direction, sel.order_type).trim()}` : ""}>
        {sel && (
          <div className="space-y-3 max-h-[70vh] overflow-y-auto">
            <p className="text-[13px] text-muted">Entry {price(sel.entry, sel.digits)} · SL {price(sel.sl, sel.digits)} · TP {price(sel.tp, sel.digits)} · {sel.status}{sel.close_price ? ` at ${price(sel.close_price, sel.digits)}` : ""}</p>
            {users.length === 0 ? <p className="text-[14px] text-muted">No recipients.</p> : (
              <ul className="divide-y divide-border rounded-[12px] border border-border">
                {users.map((u) => <li key={u.user_id} className="flex items-center gap-2 px-3 py-2"><div className="min-w-0 flex-1"><p className="truncate text-[14px]">{u.name ?? u.email}</p><p className="text-[12px] text-muted">{u.status_source ?? "—"}{u.user_entry != null ? ` · in ${u.user_entry}` : ""}{u.user_close != null ? ` · out ${u.user_close}` : ""}{u.user_pips != null ? ` · ${pips(u.user_pips)}` : ""}</p></div><StatusChip status={u.status} /></li>)}
              </ul>
            )}
            {(sel.status === "live" || sel.status === "triggered") && (
              <div>
                <p className="mb-2 text-[13px] text-muted">Follow-up</p>
                <div className="flex flex-wrap gap-2">
                  {(["move_be", "update", "close", "cancel"] as const).filter((t) => t !== "cancel" || sel.order_type !== "market" || sel.status === "live").map((t) => <button key={t} type="button" onClick={() => setFollow(t)} className={`focus-ring rounded-full px-3 h-9 text-[13px] ${follow === t ? "bg-text text-black" : "bg-surface-2 text-muted"}`}>{{ move_be: "Move to BE", update: "New SL/TP", close: "Close now", cancel: "Cancel" }[t]}</button>)}
                </div>
                {follow && (
                  <form onSubmit={sendFollow} className="mt-3 space-y-3">
                    {follow === "update" && <div className="grid grid-cols-2 gap-3"><Field label="New SL" type="number" step="any" value={f.sl} onChange={(e) => setF({ ...f, sl: e.target.value })} /><Field label="New TP" type="number" step="any" value={f.tp} onChange={(e) => setF({ ...f, tp: e.target.value })} /></div>}
                    {follow === "close" && <Field label="Close price" type="number" step="any" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} required />}
                    <Button type="submit" full>{{ move_be: "Send: move SL to breakeven", update: "Send new levels", close: "Send: close now", cancel: "Send: cancel order" }[follow]}</Button>
                  </form>
                )}
              </div>
            )}
            {msg && <Notice>{msg}</Notice>}
          </div>
        )}
      </Sheet>
    </div>
  );
}
