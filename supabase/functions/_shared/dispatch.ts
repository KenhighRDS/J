// Push dispatch: new signals, follow-ups, close questions, re-rings. Android gets data-only alerts (native ring);
// web (iPhone) gets notifications with unique tags, re-rung by `tick` until opened.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { sendPush, type Device, type PushContent } from "./fcm.ts";

export interface FollowUp { type: string; title: string; body: string; style: "call" | "normal"; ringSec?: number }
interface Sig { id: string; base_symbol: string; direction: string; order_type: string; entry: number; sl: number | null; tp: number | null; digits: number; expires_at: string | null; status: string; is_test: boolean }
const label: Record<string, string> = { market: "", buy_stop: "BUY STOP", sell_stop: "SELL STOP", buy_limit: "BUY LIMIT", sell_limit: "SELL LIMIT" };
const fmt = (v: number | null, d: number) => (v == null ? "–" : v.toFixed(d));
export const headlineOf = (s: Sig) => (s.order_type === "market" ? `${s.base_symbol} ${s.direction.toUpperCase()}` : `${s.base_symbol} ${label[s.order_type]}`);
export const secondsLeft = (iso: string | null, fallback = 120) => (iso ? Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000)) : fallback);

async function devicesFor(sb: SupabaseClient, userIds: string[]): Promise<Device[]> {
  if (!userIds.length) return [];
  const { data } = await sb.from("devices").select("id,user_id,platform,fcm_token").in("user_id", userIds);
  return (data ?? []) as Device[];
}
async function loadSignal(sb: SupabaseClient, id: string): Promise<Sig | null> {
  const { data } = await sb.from("signals").select("id,base_symbol,direction,order_type,entry,sl,tp,digits,expires_at,status,is_test").eq("id", id).maybeSingle();
  return data as Sig | null;
}

export function signalContent(s: Sig, opts: { rering?: boolean } = {}): PushContent {
  const head = headlineOf(s);
  const left = secondsLeft(s.expires_at, 0);
  const title = opts.rering ? `⏰ ${head} — ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} left` : `${s.base_symbol} · ${head.slice(s.base_symbol.length + 1)}`;
  const body = `Entry ${fmt(s.entry, s.digits)} · SL ${fmt(s.sl, s.digits)} · TP ${fmt(s.tp, s.digits)} — tap to open`;
  return {
    title, body, route: `/signal/${s.id}`, ttlSec: s.expires_at ? Math.max(30, left) : 3600,
    data: { notification_id: crypto.randomUUID(), type: "signal", signal_id: s.id, symbol: s.base_symbol, direction: s.direction, order_type: s.order_type,
      expires_at: s.expires_at ?? "", is_test: String(s.is_test), ring_sec: String(s.expires_at ? Math.max(30, left) : 120) },
  };
}

export async function dispatchSignal(sb: SupabaseClient, signalId: string): Promise<{ sent: number }> {
  const s = await loadSignal(sb, signalId);
  if (!s) return { sent: 0 };
  const { data: receipts } = await sb.from("receipts").select("id,user_id").eq("signal_id", signalId);
  const rs = (receipts ?? []) as { id: string; user_id: string }[];
  const devices = await devicesFor(sb, rs.map((r) => r.user_id));
  const content = signalContent(s);
  let sent = 0;
  const { data: every } = await sb.rpc("setting_num", { p_key: "re_ring_sec", p_default: 30 });
  const everySec = Number(every) || 30;
  for (const r of rs) {
    const mine = devices.filter((d) => d.user_id === r.user_id);
    for (const d of mine) { const res = await sendPush(sb, d, content, { signal_id: s.id, kind: "signal" }); if (res.ok) sent++; }
    await sb.from("receipts").update({ delivered_at: new Date().toISOString(), ring_count: 1, last_ring_at: new Date().toISOString() }).eq("id", r.id);
    if (mine.some((d) => d.platform === "web")) {
      await sb.from("rerings").insert({ receipt_id: r.id, user_id: r.user_id, kind: "signal", title: content.title, body: content.body, route: content.route,
        data: { signal_id: s.id }, every_sec: everySec, until: s.expires_at ?? new Date(Date.now() + 10 * 60_000).toISOString(), last_sent_at: new Date().toISOString() });
    }
  }
  return { sent };
}

/** Follow-ups go only to receipts that are taken or likely_taken. */
export async function dispatchFollowUp(sb: SupabaseClient, signalId: string, f: FollowUp): Promise<{ sent: number }> {
  const s = await loadSignal(sb, signalId);
  if (!s) return { sent: 0 };
  const { data: receipts } = await sb.from("receipts").select("id,user_id").eq("signal_id", signalId).in("status", ["taken", "likely_taken"]);
  const rs = (receipts ?? []) as { id: string; user_id: string }[];
  const devices = await devicesFor(sb, rs.map((r) => r.user_id));
  const ring = f.style === "call" ? String(f.ringSec ?? 30) : "0";
  const content: PushContent = { title: f.title, body: f.body, route: `/signal/${s.id}?event=${f.type}`, ttlSec: 600,
    data: { notification_id: crypto.randomUUID(), type: "followup", followup: f.type, style: f.style, signal_id: s.id, symbol: s.base_symbol, direction: s.direction, order_type: s.order_type, ring_sec: ring } };
  let sent = 0;
  const rering = f.type === "close" && f.style === "call" || f.type === "cancel";
  for (const r of rs) {
    const mine = devices.filter((d) => d.user_id === r.user_id);
    for (const d of mine) { const res = await sendPush(sb, d, content, { signal_id: s.id, kind: `followup:${f.type}` }); if (res.ok) sent++; }
    if (rering && mine.some((d) => d.platform === "web")) {
      await sb.from("rerings").insert({ receipt_id: r.id, user_id: r.user_id, kind: "followup", title: f.title, body: f.body, route: content.route, data: { signal_id: s.id, followup: f.type },
        every_sec: 30, until: new Date(Date.now() + (f.ringSec ?? 60) * 1000).toISOString(), last_sent_at: new Date().toISOString() });
    }
  }
  return { sent };
}

/** One question to everyone still uncertain (likely_taken or opened). Android shows Yes/No natively; iPhone opens a sheet. */
export async function dispatchCloseQuestion(sb: SupabaseClient, signalId: string, body: string): Promise<{ sent: number }> {
  const s = await loadSignal(sb, signalId);
  if (!s) return { sent: 0 };
  const { data: receipts } = await sb.from("receipts").select("id,user_id").eq("signal_id", signalId).in("status", ["likely_taken", "opened"]).is("question_sent_at", null);
  const rs = (receipts ?? []) as { id: string; user_id: string }[];
  if (!rs.length) return { sent: 0 };
  await sb.from("receipts").update({ question_sent_at: new Date().toISOString() }).in("id", rs.map((r) => r.id));
  const devices = await devicesFor(sb, rs.map((r) => r.user_id));
  const content: PushContent = { title: "Did you catch it?", body, route: `/signal/${s.id}?ask=1`, ttlSec: 48 * 3600,
    data: { notification_id: crypto.randomUUID(), type: "question", signal_id: s.id, symbol: s.base_symbol, direction: s.direction } };
  let sent = 0;
  for (const d of devices) { const res = await sendPush(sb, d, content, { signal_id: s.id, kind: "question" }); if (res.ok) sent++; }
  return { sent };
}

/** Re-sends due re-rings to web devices (iPhone). Called by tick every 15 s. */
export async function runRerings(sb: SupabaseClient): Promise<{ sent: number; closed: number }> {
  const now = Date.now();
  const { data: due } = await sb.from("rerings").select("id,receipt_id,user_id,kind,title,body,route,data,every_sec,until,last_sent_at").eq("done", false).limit(200);
  let sent = 0, closed = 0;
  for (const r of (due ?? []) as { id: string; receipt_id: string; user_id: string; kind: string; title: string; body: string; route: string; data: Record<string, string>; every_sec: number; until: string; last_sent_at: string | null }[]) {
    if (new Date(r.until).getTime() <= now) { await sb.from("rerings").update({ done: true }).eq("id", r.id); closed++; continue; }
    const { data: rc } = await sb.from("receipts").select("status,opened_at,signal_id").eq("id", r.receipt_id).maybeSingle();
    if (!rc || (r.kind === "signal" && (rc.opened_at || rc.status !== "pending"))) { await sb.from("rerings").update({ done: true }).eq("id", r.id); closed++; continue; }
    if (r.last_sent_at && now - new Date(r.last_sent_at).getTime() < r.every_sec * 1000 - 2000) continue;
    const s = rc.signal_id ? await loadSignal(sb, rc.signal_id) : null;
    if (s && s.status !== "live" && r.kind === "signal") { await sb.from("rerings").update({ done: true }).eq("id", r.id); closed++; continue; }
    const content: PushContent = s && r.kind === "signal" ? signalContent(s, { rering: true }) :
      { title: r.title, body: r.body, route: r.route, ttlSec: Math.max(30, secondsLeft(r.until)), data: { notification_id: crypto.randomUUID(), type: r.kind === "followup" ? "followup" : "signal", ...r.data } };
    const { data: devs } = await sb.from("devices").select("id,user_id,platform,fcm_token").eq("user_id", r.user_id).eq("platform", "web");
    for (const d of (devs ?? []) as Device[]) { const res = await sendPush(sb, d, content, { signal_id: rc.signal_id, kind: "rering" }); if (res.ok) sent++; }
    await sb.rpc("rering_mark_sent", { p_rering: r.id });
  }
  return { sent, closed };
}
