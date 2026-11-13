import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAskPrompt } from "../lib/useAskPrompt";
import type { Profile, Receipt, WannCall } from "../lib/types";
import { WannBadge, WannCard } from "../components/WannCard";
import { WannGallery, type WannRow } from "../components/WannGallery";
import { Button, Empty, PageTitle, Sheet, Spinner } from "../components/ui";
import { useRealtime } from "../hooks/useRealtime";
import { hasNativeAlerts, JAlert } from "../lib/native";
import { PromoShare, ShareIconButton } from "../components/PromoShare";
import { MoneySheet } from "../components/MoneySheet";

export function WannList({ profile }: { profile: Profile }) {
  const [rows, setRows] = useState<WannRow[] | null>(null);
  const [now, setNow] = useState(Date.now());
  const load = useCallback(async () => { const { data } = await supabase.from("receipts").select("*, call:wann_calls(*)").eq("user_id", profile.id).eq("kind", "wann").order("created_at", { ascending: false }).limit(600); setRows(((data ?? []) as WannRow[]).filter((r) => r.call)); }, [profile.id]);
  useEffect(() => { void load(); }, [load]);
  useRealtime([{ table: "receipts", filter: `user_id=eq.${profile.id}` }, { table: "wann_calls" }], () => { void load(); }, [profile.id]);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(t); }, []);
  return (
    <div className="mx-auto w-full max-w-2xl pb-6">
      <PageTitle right={<WannBadge />}>Wann</PageTitle>
      {!rows ? <div className="flex justify-center py-16"><Spinner /></div> : <WannGallery rows={rows} now={now} />}
    </div>
  );
}

export function WannRoute({ profile }: { profile: Profile }) {
  const { id = "" } = useParams(); const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [call, setCall] = useState<WannCall | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [missing, setMissing] = useState(false);
  const ask = useAskPrompt(receipt, params, setParams);
  const [shareOpen, setShareOpen] = useState(false);
  const [moneyOpen, setMoneyOpen] = useState(false);
  const load = useCallback(async () => {
    const [{ data: c }, { data: r }] = await Promise.all([supabase.from("wann_calls").select("*").eq("id", id).maybeSingle(), supabase.from("receipts").select("*").eq("wann_call_id", id).eq("user_id", profile.id).maybeSingle()]);
    if (!c) { setMissing(true); return; }
    setCall(c as WannCall); setReceipt(r as Receipt | null);
  }, [id, profile.id]);
  useEffect(() => { void (async () => { const { data } = await supabase.rpc("receipt_open", { p_call: id }); if (data) setReceipt(data as Receipt); if (hasNativeAlerts) void JAlert.stopRinging({}).catch(() => undefined); await load(); })(); }, [id, load]);
  useRealtime([{ table: "wann_calls", filter: `id=eq.${id}` }, { table: "receipts", filter: `wann_call_id=eq.${id}` }], () => { void load(); }, [id]);
  if (missing) return <Empty title="This call isn't available" action={<Button type="button" onClick={() => nav("/wann")}>Back</Button>} />;
  if (!call || !receipt) return <div className="flex h-full items-center justify-center"><Spinner /></div>;
  const rpc = async (fn: string, args: Record<string, unknown> = {}) => { const { data } = await supabase.rpc(fn, { p_call: id, ...args }); if (data) setReceipt(data as Receipt); };
  return (
    <>
      <WannCard call={call} receipt={receipt} onCopy={(f) => { setReceipt({ ...receipt, copied: { ...receipt.copied, [f]: "x" } }); void rpc("receipt_copy", { p_field: f }); }} onTake={() => { void rpc("receipt_take").then(() => setMoneyOpen(true)); }} onSkip={() => { void rpc("receipt_skip"); }} onClose={() => nav("/wann")} adminActions={profile.role === "admin" ? <ShareIconButton onClick={() => setShareOpen(true)} /> : undefined} />
      {profile.role === "admin" && <PromoShare subject={{ kind: "wann", call }} open={shareOpen} onClose={() => setShareOpen(false)} />}
      <MoneySheet open={moneyOpen} onClose={() => setMoneyOpen(false)} kind="wann" receipt={receipt} title="How much did you put on it?" onSaved={setReceipt} skippable />
      <Sheet open={ask.open} onClose={ask.settle} title="Did you catch it?">
        <p className="text-[15px] text-muted">{call.home} {call.final_score ?? ""} {call.away} — {call.outcome === "won" ? "won" : "lost"}. Did you take this call?</p>
        <div className="mt-4 grid grid-cols-2 gap-3"><Button type="button" onClick={() => { void rpc("receipt_answer", { p_yes: true }); ask.settle(); }}>Yes, I took it</Button><Button variant="ghost" type="button" onClick={() => { void rpc("receipt_answer", { p_yes: false }); ask.settle(); }}>No</Button></div>
      </Sheet>
    </>
  );
}
