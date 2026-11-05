import { type FormEvent, useEffect, useState } from "react";
import { Button, Card, Empty, Field, Notice, Row, Sheet, Toggle } from "../../components/ui";
import { supabase } from "../../lib/supabase";
import { agoShort } from "../../lib/format";
import type { EaSource } from "../../lib/types";

export function Sources() {
  const [rows, setRows] = useState<EaSource[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [shownKey, setShownKey] = useState<{ name: string; key: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => { const { data } = await supabase.from("ea_sources").select("id,name,active,last_seen,created_at").order("created_at"); setRows((data ?? []) as EaSource[]); };
  useEffect(() => { void load(); }, []);

  const add = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    const { data, error: err } = await supabase.rpc("admin_create_ea_source", { p_name: name.trim() });
    setBusy(false);
    if (err) { setError(err.message.includes("duplicate") ? "An EA with that name exists" : err.message); return; }
    const d = data as { name: string; api_key: string };
    setShownKey({ name: d.name, key: d.api_key }); setAddOpen(false); setName(""); await load();
  };
  const rotate = async (s: EaSource) => {
    if (!window.confirm(`Rotate the key for ${s.name}? The EA stops sending until you paste the new key.`)) return;
    const { data } = await supabase.rpc("admin_rotate_ea_key", { p_id: s.id });
    setShownKey({ name: s.name, key: data as string });
  };
  const setActive = async (s: EaSource, active: boolean) => { await supabase.rpc("admin_set_ea_active", { p_id: s.id, p_active: active }); await load(); };

  return (
    <div className="space-y-4">
      <p className="text-[14px] text-muted">Each EA gets its own key for J_Signal.mqh. The key is shown once.</p>
      {rows && rows.length === 0 && <Empty title="No EA sources yet" body="Add your first EA to get a key for J_Signal.mqh." />}
      {rows && rows.length > 0 && (
        <Card>
          {rows.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] truncate">{s.name}</p>
                <p className="text-[13px] text-muted">{s.last_seen ? `Last seen ${agoShort(s.last_seen)}` : "Never connected"}</p>
              </div>
              <button type="button" className="text-[13px] text-muted underline" onClick={() => rotate(s)}>Rotate key</button>
              <Toggle on={s.active} onChange={(v) => setActive(s, v)} label={`${s.name} active`} />
            </div>
          ))}
        </Card>
      )}
      <Button variant="ghost" full type="button" onClick={() => setAddOpen(true)}>Add EA source</Button>
      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add EA source">
        <form onSubmit={add} className="space-y-4">
          <Field label="EA name" placeholder="XAU EA" value={name} onChange={(e) => setName(e.target.value)} error={error} autoFocus />
          <Button type="submit" full busy={busy} disabled={!name.trim()}>Create key</Button>
        </form>
      </Sheet>
      <Sheet open={shownKey != null} onClose={() => setShownKey(null)} title={`Key for ${shownKey?.name ?? ""}`}>
        <KeyReveal value={shownKey?.key ?? ""} />
        <Row label="Paste it into the EA input InpJKey" />
      </Sheet>
    </div>
  );
}

export function KeyReveal({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <Notice tone="warn">Shown once. Copy it now.</Notice>
      <code className="block break-all rounded-[12px] bg-surface-2 border border-border p-3 font-mono text-[13px]">{value}</code>
      <Button full type="button" onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); }}>{copied ? "Copied" : "Copy key"}</Button>
    </div>
  );
}
