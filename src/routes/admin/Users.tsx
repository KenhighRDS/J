import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Button, Card, Empty, Field, Notice, Toggle } from "../../components/ui";
import { callFunction, supabase } from "../../lib/supabase";
import { agoShort } from "../../lib/format";
import type { Device, Profile } from "../../lib/types";

export interface Channel { key: string; label: string; kind: "forex" | "wann" | "stocks" | "crypto"; default_enabled: boolean; sort: number }
const channelHint: Record<Channel["kind"], string> = { forex: "Forex signals from the EA", wann: "Game calls from Wann", stocks: "Stock picks after each US close", crypto: "Crypto picks, daily" };
export interface UserRow extends Profile { devices: Pick<Device, "platform" | "last_seen">[]; on: Record<string, boolean>; tracker: { last_heartbeat: string | null } | null; stats: { taken: number; missed: number; skipped: number } }

export function Users({ me, preview }: { me: Profile; preview?: { users: UserRow[]; channels: Channel[] } }) {
  const [users, setUsers] = useState<UserRow[] | null>(preview?.users ?? null);
  const [channels, setChannels] = useState<Channel[]>(preview?.channels ?? []);
  const [email, setEmail] = useState(""); const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(preview?.users[1]?.id ?? null);

  const load = useCallback(async () => {
    if (preview) return;
    const [{ data: ps }, { data: cs }, { data: ds }, { data: us }, { data: ts }, { data: rs }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at"),
      supabase.from("signal_channels").select("key,label,kind,default_enabled,sort").order("sort"),
      supabase.from("devices").select("user_id,platform,last_seen"),
      supabase.rpc("admin_user_channels"),
      supabase.from("tracker_links").select("user_id,last_heartbeat"),
      supabase.from("receipts").select("user_id,status").eq("kind", "ea"),
    ]);
    setChannels((cs ?? []) as Channel[]);
    const switches = (us ?? []) as { user_id: string; channel_key: string; enabled: boolean }[];
    const rows: UserRow[] = ((ps ?? []) as Profile[]).map((p) => {
      const mine = ((rs ?? []) as { user_id: string; status: string }[]).filter((r) => r.user_id === p.id);
      return { ...p,
        devices: ((ds ?? []) as { user_id: string; platform: "android" | "web"; last_seen: string }[]).filter((d) => d.user_id === p.id),
        on: Object.fromEntries(switches.filter((x) => x.user_id === p.id).map((x) => [x.channel_key, x.enabled])),
        tracker: ((ts ?? []) as { user_id: string; last_heartbeat: string | null }[]).find((t) => t.user_id === p.id) ?? null,
        stats: { taken: mine.filter((r) => r.status === "taken" || r.status === "likely_taken").length, missed: mine.filter((r) => r.status === "missed" || r.status === "not_taken").length, skipped: mine.filter((r) => r.status === "skipped").length } };
    });
    setUsers(rows);
  }, [preview]);
  useEffect(() => { void load(); }, [load]);

  const act = async (key: string, fn: () => Promise<void>, okText?: string) => {
    setBusy(key); setMsg(null);
    try { await fn(); if (okText) setMsg({ ok: true, text: okText }); await load(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed" }); }
    setBusy(null);
  };
  const invite = (e: FormEvent) => { e.preventDefault(); void act("invite", async () => { await callFunction("admin-invite", { action: "invite", email: email.trim(), name: name.trim() || undefined }); setEmail(""); setName(""); }, "Invite sent"); };
  const setChannel = (u: UserRow, c: Channel, on: boolean) => act(`c${u.id}${c.key}`, async () => {
    const { error } = await supabase.rpc("admin_set_channel", { p_user: u.id, p_channel: c.key, p_enabled: on }); if (error) throw new Error(error.message);
    if (on && c.kind === "wann") await callFunction("wann-sync", { catchup_user: u.id });   // send them the calls that are live right now
  }, `${c.label} ${on ? "on" : "off"} for ${u.name ?? u.email}${on && c.kind === "wann" ? ". Live calls sent" : ""}`);
  const remove = (u: UserRow) => { if (!window.confirm(`Remove ${u.email}? They are signed out everywhere and stop getting pushes.`)) return; void act(`r${u.id}`, async () => { await callFunction("admin-remove-user", { user_id: u.id }); }, "Removed"); };

  if (!users) return null;
  const pending = users.filter((u) => u.status === "invited"), active = users.filter((u) => u.status === "active"), removed = users.filter((u) => u.status === "removed");
  return (
    <div className="space-y-5">
      <form onSubmit={invite} className="space-y-3">
        <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
          <Field label="Invite by email" type="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" required />
          <Button type="submit" busy={busy === "invite"} disabled={!email.includes("@")}>Send invite</Button>
        </div>
        <Field label="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        {msg && <Notice tone={msg.ok ? "ok" : "warn"}>{msg.text}</Notice>}
      </form>
      {pending.length > 0 && (
        <section><h2 className="mb-2 text-[15px] font-semibold">Pending invites</h2><Card>
          {pending.map((u) => (
            <div key={u.id} className="flex items-center gap-2 px-4 py-3 border-b border-border last:border-b-0">
              <div className="min-w-0 flex-1"><p className="truncate text-[15px]">{u.email}</p><p className="text-[13px] text-muted">Invited {agoShort(u.created_at)}</p></div>
              <Button variant="ghost" type="button" className="h-9 px-3" busy={busy === `rs${u.id}`} onClick={() => act(`rs${u.id}`, async () => { await callFunction("admin-invite", { action: "resend", email: u.email }); }, "Invite resent")}>Resend</Button>
              <Button variant="quiet" type="button" className="h-9 px-3" busy={busy === `rv${u.id}`} onClick={() => act(`rv${u.id}`, async () => { await callFunction("admin-invite", { action: "revoke", email: u.email }); }, "Invite revoked")}>Revoke</Button>
            </div>))}
        </Card></section>
      )}
      <section><h2 className="mb-2 text-[15px] font-semibold">Active ({active.length})</h2>
        {active.length === 0 && <Empty title="No active users yet" />}
        <div className="space-y-2">
          {active.map((u) => {
            const isOpen = open === u.id; const android = u.devices.filter((d) => d.platform === "android").length, web = u.devices.length - android;
            const trackerOk = u.tracker?.last_heartbeat && Date.now() - new Date(u.tracker.last_heartbeat).getTime() < 3 * 60_000;
            return (
              <Card key={u.id}>
                <button type="button" onClick={() => setOpen(isOpen ? null : u.id)} className="focus-ring flex w-full items-center gap-3 px-4 py-3 text-left">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px]">{u.name ?? u.email}{u.role === "admin" && <span className="ml-2 rounded-full border border-border px-2 text-[11px] text-muted">admin</span>}</p>
                    <p className="truncate text-[13px] text-muted">{u.name ? `${u.email} · ` : ""}seen {agoShort(u.last_seen)} · {android ? `${android} Android` : ""}{android && web ? ", " : ""}{web ? `${web} web` : ""}{!u.devices.length ? "no devices" : ""}{u.tracker ? ` · tracker ${trackerOk ? "on" : "off"}` : ""}</p>
                  </div>
                  <span className="text-[12px] text-muted">{u.stats.taken} taken · {u.stats.missed} missed</span>
                </button>
                {isOpen && (
                  <div className="border-t border-border px-4 py-3 space-y-3">
                    <div>
                      <p className="mb-1 text-[13px] text-muted">Signals this member gets</p>
                      {channels.map((c) => (
                        <div key={c.key} className="flex items-center justify-between gap-3 py-1.5">
                          <div className="min-w-0"><p className="text-[15px]">{c.label}</p><p className="truncate text-[13px] text-muted">{channelHint[c.kind]}</p></div>
                          <Toggle on={Boolean(u.on[c.key])} onChange={(v) => { void setChannel(u, c, v); }} label={`${c.label} for ${u.email}`} />
                        </div>
                      ))}
                    </div>
                    <p className="text-[13px] text-muted">History: {u.stats.taken} taken · {u.stats.missed} missed · {u.stats.skipped} skipped</p>
                    {u.id !== me.id && <Button variant="danger" type="button" full busy={busy === `r${u.id}`} onClick={() => remove(u)}>Remove {u.name ?? u.email}</Button>}
                  </div>
                )}
              </Card>);
          })}
        </div>
      </section>
      {removed.length > 0 && <section><h2 className="mb-2 text-[15px] font-semibold text-muted">Removed</h2><Card>{removed.map((u) => <div key={u.id} className="flex items-center gap-2 px-4 py-3 border-b border-border last:border-b-0"><p className="min-w-0 flex-1 truncate text-[15px] text-muted">{u.email}</p><Button variant="ghost" type="button" className="h-9 px-3" busy={busy === `ri${u.id}`} onClick={() => act(`ri${u.id}`, async () => { await callFunction("admin-invite", { action: "invite", email: u.email }); }, "Invited again")}>Invite again</Button></div>)}</Card></section>}
    </div>
  );
}
