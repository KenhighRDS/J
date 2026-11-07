import { type FormEvent, useEffect, useState } from "react";
import { Button, Card, Field, Notice } from "../../components/ui";
import { callFunction, supabase } from "../../lib/supabase";

interface Row { key: string; value: unknown }
const numeric: { key: string; label: string; hint: string }[] = [
  { key: "market_expiry_sec", label: "Market signal expiry (seconds)", hint: "Default 120" },
  { key: "re_ring_sec", label: "iPhone re-ring interval (seconds)", hint: "Default 30" },
  { key: "report_hour_ny", label: "Report hour (New York, 0–23)", hint: "Default 17" },
  { key: "wann_window_days", label: "Wann window (days)", hint: "Default 7" },
  { key: "wann_min_probability", label: "Wann minimum probability (%)", hint: "Default 85. Set 90 to send only new calls at 90%+; calls already sent keep following wann's own rule" },
  { key: "close_question_hours", label: "Close question timeout (hours)", hint: "Default 48" },
];

export function AdminSettings() {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [tol, setTol] = useState("{}"); const [pipo, setPipo] = useState("{}");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { void supabase.from("settings").select("key,value").then(({ data }) => {
    const v: Record<string, string> = {};
    for (const r of (data ?? []) as Row[]) { if (r.key === "match_tolerance_pips") setTol(JSON.stringify(r.value, null, 1)); else if (r.key === "pip_size_overrides") setPipo(JSON.stringify(r.value, null, 1)); else v[r.key] = String(r.value); }
    setVals(v);
  }); }, []);
  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy("save"); setMsg(null);
    try {
      for (const n of numeric) { const num = Number(vals[n.key]); if (!Number.isFinite(num)) throw new Error(`${n.label}: enter a number`); if (n.key === "wann_min_probability" && (num < 50 || num > 99)) throw new Error(`${n.label}: enter 50 to 99`); const { error } = await supabase.rpc("admin_set_setting", { p_key: n.key, p_value: num }); if (error) throw new Error(error.message); }
      for (const [k, raw] of [["match_tolerance_pips", tol], ["pip_size_overrides", pipo]] as const) { let parsed: unknown; try { parsed = JSON.parse(raw); } catch { throw new Error(`${k}: invalid JSON`); } const { error } = await supabase.rpc("admin_set_setting", { p_key: k, p_value: parsed }); if (error) throw new Error(error.message); }
      setMsg({ ok: true, text: "Saved" });
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "Failed" }); }
    setBusy(null);
  };
  const sync = async () => { setBusy("sync"); setMsg(null); try { const r = await callFunction<{ new: number; feed_calls: number; withdrawn: number; finished: number }>("wann-sync", {}); setMsg({ ok: true, text: `Wann sync: ${r.feed_calls} games clear the rule, ${r.new} new, ${r.withdrawn} withdrawn, ${r.finished} finished` }); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Sync failed" }); } setBusy(null); };
  return (
    <form onSubmit={save} className="space-y-4">
      <Card className="p-4 space-y-3">
        {numeric.map((n) => <Field key={n.key} label={n.label} hint={n.hint} type="number" inputMode="numeric" value={vals[n.key] ?? ""} onChange={(e) => setVals({ ...vals, [n.key]: e.target.value })} />)}
      </Card>
      <Card className="p-4 space-y-3">
        <label className="block"><span className="block text-[13px] text-muted mb-1.5">Tracker match tolerance (pips) per base symbol</span><textarea className="focus-ring w-full rounded-[14px] bg-surface-2 border border-border p-3 font-mono text-[13px]" rows={3} value={tol} onChange={(e) => setTol(e.target.value)} /></label>
        <label className="block"><span className="block text-[13px] text-muted mb-1.5">Pip size overrides per base symbol</span><textarea className="focus-ring w-full rounded-[14px] bg-surface-2 border border-border p-3 font-mono text-[13px]" rows={3} value={pipo} onChange={(e) => setPipo(e.target.value)} /></label>
      </Card>
      {msg && <Notice tone={msg.ok ? "ok" : "warn"}>{msg.text}</Notice>}
      <Button type="submit" full busy={busy === "save"}>Save settings</Button>
      <Card className="p-4"><p className="text-[15px]">Wann</p><p className="text-[13px] text-muted mb-3">Pulls the coming games at or above the minimum probability from wann now (runs every 15 minutes anyway).</p><Button variant="ghost" full type="button" busy={busy === "sync"} onClick={sync}>Sync now</Button></Card>
    </form>
  );
}
