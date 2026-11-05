import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { Profile, Receipt, Signal, SignalEvent } from "../lib/types";
import { SignalCard } from "../components/SignalCard";
import { QuestionSheet } from "../components/QuestionSheet";
import { BalanceSheet } from "./Settings";
import { Spinner, Empty, Button } from "../components/ui";
import { useRealtime } from "../hooks/useRealtime";
import { closeSignalNotifications } from "../lib/webPush";
import { hasNativeAlerts, JAlert } from "../lib/native";
import { PromoShare, ShareIconButton } from "../components/PromoShare";

export function SignalRoute({ profile, reloadProfile }: { profile: Profile; reloadProfile: () => Promise<void> }) {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const [signal, setSignal] = useState<Signal | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [events, setEvents] = useState<SignalEvent[]>([]);
  const [missing, setMissing] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const load = useCallback(async () => {
    const [{ data: s }, { data: r }, { data: ev }] = await Promise.all([
      supabase.from("signals").select("*").eq("id", id).maybeSingle(),
      supabase.from("receipts").select("*").eq("signal_id", id).eq("user_id", profile.id).maybeSingle(),
      supabase.from("signal_events").select("id,signal_id,type,payload,created_at").eq("signal_id", id).order("created_at"),
    ]);
    if (!s) { setMissing(true); return; }
    setSignal(s as Signal); setReceipt(r as Receipt | null); setEvents((ev ?? []) as SignalEvent[]);
  }, [id, profile.id]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data: r } = await supabase.rpc("receipt_open", { p_signal: id });
      if (!alive) return;
      if (r) setReceipt(r as Receipt);
      void closeSignalNotifications(id);
      if (hasNativeAlerts) void JAlert.stopRinging({ signalId: id }).catch(() => undefined);
      await load();
    })();
    return () => { alive = false; };
  }, [id, load]);
  useRealtime([{ table: "signals", filter: `id=eq.${id}` }, { table: "receipts", filter: `signal_id=eq.${id}` }, { table: "signal_events", filter: `signal_id=eq.${id}` }], () => { void load(); }, [id]);

  useEffect(() => {
    if (!receipt) return;
    const pending = receipt.question_sent_at && !receipt.answered_at && (receipt.status === "likely_taken" || receipt.status === "opened");
    if (params.get("ask") === "1" || pending) setAskOpen(true);
  }, [receipt, params]);

  if (missing) return <div className="app-frame"><Empty title="This signal isn't available" body="It may have been sent before you joined, or to a different EA access." action={<Button type="button" onClick={() => nav("/")}>Back to signals</Button>} /></div>;
  if (!signal || !receipt) return <div className="flex h-full items-center justify-center"><Spinner /></div>;

  const rpc = async (fn: string, args: Record<string, unknown>) => { const { data } = await supabase.rpc(fn, { p_signal: id, ...args }); if (data) setReceipt(data as Receipt); };
  return (
    <>
      <SignalCard signal={signal} receipt={receipt} profile={profile} events={events} highlightEvent={params.get("event")}
        onCopy={(f) => { setReceipt({ ...receipt, copied: { ...receipt.copied, [f]: new Date().toISOString() } }); void rpc("receipt_copy", { p_field: f }); }}
        onTake={(lot) => { void rpc("receipt_take", { p_lot: lot }); }}
        onSkip={() => { void rpc("receipt_skip", {}); }}
        onClose={() => nav("/")}
        onSetBalance={() => setBalanceOpen(true)}
        adminActions={profile.role === "admin" ? <ShareIconButton onClick={() => setShareOpen(true)} /> : undefined} />
      {profile.role === "admin" && <PromoShare subject={{ kind: "signal", signal }} open={shareOpen} onClose={() => setShareOpen(false)} />}
      <BalanceSheet open={balanceOpen} onClose={() => setBalanceOpen(false)} profile={profile} onSaved={reloadProfile} />
      <QuestionSheet signal={signal} open={askOpen} onClose={() => { setAskOpen(false); if (params.get("ask")) setParams({}, { replace: true }); }}
        onAnswer={(yes) => { void rpc("receipt_answer", { p_yes: yes }); setAskOpen(false); setParams({}, { replace: true }); }} />
    </>
  );
}
