import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Empty, Field, Notice } from "../../components/ui";
import { callFunction, supabase } from "../../lib/supabase";
import { dateRange, pips } from "../../lib/format";
import type { Report } from "../../lib/types";

export function AdminReports() {
  const [rows, setRows] = useState<(Report & { profile: { email: string; name: string | null } | null })[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => { const { data } = await supabase.from("reports").select("*, profile:profiles(email,name)").order("created_at", { ascending: false }).limit(200); setRows((data ?? []) as typeof rows); }, []);
  useEffect(() => { void load(); }, [load]);
  const gen = async (period: "weekly" | "monthly") => { setBusy(period); setMsg(null); try { const r = await callFunction<Record<string, unknown>>("scheduler", { force: period, date, notify: false }); setMsg(`Generated ${period}: ${JSON.stringify(r[period])}`); await load(); } catch (e) { setMsg(e instanceof Error ? e.message : "Failed"); } setBusy(null); };
  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <Field label="Generate for a date in the period" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="grid grid-cols-2 gap-3"><Button type="button" variant="ghost" busy={busy === "weekly"} onClick={() => gen("weekly")}>Weekly now</Button><Button type="button" variant="ghost" busy={busy === "monthly"} onClick={() => gen("monthly")}>Monthly now</Button></div>
        {msg && <Notice>{msg}</Notice>}
      </Card>
      {rows.length === 0 ? <Empty title="No reports yet" /> : (
        <Card>{rows.map((r) => <Link key={r.id} to={`/reports/${r.id}`} className="focus-ring flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0"><div className="min-w-0 flex-1"><p className="truncate text-[15px]">{r.user_id ? (r.profile?.name ?? r.profile?.email ?? "user") : "App-wide"} · {r.period}</p><p className="text-[13px] text-muted">{dateRange(r.period_start, r.period_end)} · {r.data.app.called} called</p></div><span className="font-mono text-[15px]">{pips(r.data.app.pips)}</span></Link>)}</Card>
      )}
    </div>
  );
}
