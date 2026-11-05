import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { Profile, Receipt, WannCall } from "../lib/types";
import { WannBadge, WannCard } from "../components/WannCard";
import { Button, Empty, PageTitle, Sheet, Spinner } from "../components/ui";
import { StatusChip } from "../components/StatusChip";
import { useRealtime } from "../hooks/useRealtime";
import { countdown } from "../lib/format";
import { hasNativeAlerts, JAlert } from "../lib/native";
import { PromoShare, ShareIconButton } from "../components/PromoShare";

type Row = Receipt & { call: WannCall };

export function WannList({ profile }: { profile: Profile }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [now, setNow] = useState(Date.now());
  const load = useCallback(async () => { const { data } = await supabase.from("receipts").select("*, call:wann_calls(*)").eq("user_id", profile.id).eq("kind", "wann").order("created_at", { ascending: false }).limit(200); setRows(((data ?? []) as Row[]).filter((r) => r.call)); }, [profile.id]);
  useEffect(() => { void load(); }, [load]);
  useRealtime([{ table: "receipts", filter: `user_id=eq.${profile.id}` }, { table: "wann_calls" }], () => { void load(); }, [profile.id]);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(t); }, []);
  if (!rows) return <div className="mx-auto w-full max-w-md"><PageTitle>Wann</PageTitle><div className="flex justify-center py-16"><Spinner /></div></div>;
  const live = rows.filter((r) => r.call.status === "live" && new Date(r.call.kickoff_utc).getTime() > now).sort((a, b) => a.call.kickoff_utc.localeCompare(b.call.kickoff_utc));
  const past = rows.filter((r) => !live.includes(r));
  const item = (r: Row) => (
    <li key={r.id}><Link to={`/wann/${r.call.id}`} className="focus-ring flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1"><p className="truncate text-[15px]">{r.call.home} <span className="text-muted">vs</span> {r.call.away}</p><p className="truncate text-[13px] text-muted">{r.call.pick_label} · {r.call.probability}% · {r.call.status === "live" ? `in ${countdown(new Date(r.call.kickoff_utc).getTime() - now)}` : r.call.status === "finished" ? `${r.call.final_score ?? ""} ${r.call.outcome === "won" ? "Won ✓" : r.call.outcome === "lost" ? "Lost" : "Void"}` : "Withdrawn"}</p></div>
      <StatusChip status={r.status} />
    </Link></li>
  );
  return (
    <div className="mx-auto w-full max-w-md pb-6">
      <PageTitle right={<WannBadge />}>Wann</PageTitle>
      {rows.length === 0 && <Empty title="No Wann calls yet" body="Games at 85% or more for the coming week show up here." />}
      {live.length > 0 && <ul className="mx-4 divide-y divide-border rounded-[16px] border border-chrome-3/50 bg-surface-2">{live.map(item)}</ul>}
      {past.length > 0 && <ul className={`mx-4 divide-y divide-border rounded-[16px] border border-border bg-surface ${live.length ? "mt-4" : ""}`}>{past.map(item)}</ul>}
    </div>
  );
}

export function WannRoute({ profile }: { profile: Profile }) {
  const { id = "" } = useParams(); const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [call, setCall] = useState<WannCall | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [missing, setMissing] = useState(false);
  const [ask, setAsk] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const load = useCallback(async () => {
    const [{ data: c }, { data: r }] = await Promise.all([supabase.from("wann_calls").select("*").eq("id", id).maybeSingle(), supabase.from("receipts").select("*").eq("wann_call_id", id).eq("user_id", profile.id).maybeSingle()]);
    if (!c) { setMissing(true); return; }
    setCall(c as WannCall); setReceipt(r as Receipt | null);
  }, [id, profile.id]);
  useEffect(() => { void (async () => { const { data } = await supabase.rpc("receipt_open", { p_call: id }); if (data) setReceipt(data as Receipt); if (hasNativeAlerts) void JAlert.stopRinging({}).catch(() => undefined); await load(); })(); }, [id, load]);
  useRealtime([{ table: "wann_calls", filter: `id=eq.${id}` }, { table: "receipts", filter: `wann_call_id=eq.${id}` }], () => { void load(); }, [id]);
  useEffect(() => { if (receipt && (params.get("ask") === "1" || (receipt.question_sent_at && !receipt.answered_at && (receipt.status === "likely_taken" || receipt.status === "opened")))) setAsk(true); }, [receipt, params]);
  if (missing) return <Empty title="This call isn't available" action={<Button type="button" onClick={() => nav("/wann")}>Back</Button>} />;
  if (!call || !receipt) return <div className="flex h-full items-center justify-center"><Spinner /></div>;
  const rpc = async (fn: string, args: Record<string, unknown> = {}) => { const { data } = await supabase.rpc(fn, { p_call: id, ...args }); if (data) setReceipt(data as Receipt); };
  return (
    <>
      <WannCard call={call} receipt={receipt} onCopy={(f) => { setReceipt({ ...receipt, copied: { ...receipt.copied, [f]: "x" } }); void rpc("receipt_copy", { p_field: f }); }} onTake={() => { void rpc("receipt_take"); }} onSkip={() => { void rpc("receipt_skip"); }} onClose={() => nav("/wann")} adminActions={profile.role === "admin" ? <ShareIconButton onClick={() => setShareOpen(true)} /> : undefined} />
      {profile.role === "admin" && <PromoShare subject={{ kind: "wann", call }} open={shareOpen} onClose={() => setShareOpen(false)} />}
      <Sheet open={ask} onClose={() => { setAsk(false); setParams({}, { replace: true }); }} title="Did you catch it?">
        <p className="text-[15px] text-muted">{call.home} {call.final_score ?? ""} {call.away} — {call.outcome === "won" ? "won" : "lost"}. Did you take this call?</p>
        <div className="mt-4 grid grid-cols-2 gap-3"><Button type="button" onClick={() => { void rpc("receipt_answer", { p_yes: true }); setAsk(false); }}>Yes, I took it</Button><Button variant="ghost" type="button" onClick={() => { void rpc("receipt_answer", { p_yes: false }); setAsk(false); }}>No</Button></div>
      </Sheet>
    </>
  );
}
