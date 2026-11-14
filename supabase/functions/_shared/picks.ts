// What the stocks and crypto functions share: settings, the push to members, and closing a pick.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { sendPush, type Device } from "./fcm.ts";
import { resultPct } from "./stockRules.ts";

export type Asset = "stock" | "crypto";
export const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const setting = async (sb: SupabaseClient, key: string, def: number) => { const { data } = await sb.rpc("setting_num", { p_key: key, p_default: def }); return Number(data ?? def); };
export const routeOf = (asset: Asset, id: string) => `/${asset === "crypto" ? "crypto" : "stocks"}/${id}`;

/** A plain notification to active members (or admins only), optionally narrowed to some users or to the members who
 *  have a channel switched on. Returns how many devices took it. */
export async function push(sb: SupabaseClient, userIds: string[] | null, adminsOnly: boolean, title: string, body: string, route: string, pickId: string, channel?: string): Promise<number> {
  let q = sb.from("profiles").select("id").eq("status", "active");
  if (adminsOnly) q = q.eq("role", "admin");
  const { data: people } = await q;
  let ids = ((people ?? []) as { id: string }[]).map((p) => p.id);
  if (userIds) ids = ids.filter((id) => userIds.includes(id));
  if (channel) {
    const { data: allowed } = await sb.rpc("channel_users", { p_channel: channel });
    const on = new Set(((allowed ?? []) as (string | { channel_users: string })[]).map((u) => (typeof u === "string" ? u : u.channel_users)));
    ids = ids.filter((id) => on.has(id));
  }
  if (!ids.length) return 0;
  const { data: devs } = await sb.from("devices").select("id,user_id,platform,fcm_token").in("user_id", ids);
  let sent = 0;
  for (const d of (devs ?? []) as Device[]) {
    const r = await sendPush(sb, d, { title, body, route, ttlSec: 86_400, data: { notification_id: crypto.randomUUID(), type: "stock", pick_id: pickId } }, { kind: "stock" });
    if (r.ok) sent++;
  }
  return sent;
}

/** Closes an open pick at a price, then tells the members who hold it and the admins. Does nothing if it is already closed. */
export async function closePick(sb: SupabaseClient, k: { id: string; symbol: string; entry_price: number }, reason: "stop" | "target" | "time" | "manual", price: number): Promise<void> {
  const pct = resultPct(Number(k.entry_price), price);
  const { data: upd } = await sb.from("stock_picks").update({ status: "closed", close_reason: reason, close_price: price, result_pct: pct, last_price: price, last_price_at: new Date().toISOString(), closed_at: new Date().toISOString() })
    .eq("id", k.id).eq("status", "open").select("id,asset");
  if (!upd?.length) return;
  const route = routeOf((upd[0] as { asset: Asset }).asset, k.id);
  const label = { stop: "stop hit", target: "target hit", time: "time ran out", manual: "closed by J" }[reason];
  const { data: holders } = await sb.from("stock_positions").select("user_id").eq("pick_id", k.id).is("sold_at", null);
  const ids = ((holders ?? []) as { user_id: string }[]).map((h) => h.user_id);
  const title = `${k.symbol} closed: ${label}`, moved = `${pct > 0 ? "+" : ""}${pct}% since the pick.`;
  if (ids.length) await push(sb, ids, false, title, `${moved} If you sold, record it in your portfolio.`, route, k.id);
  await push(sb, null, true, title, moved, route, k.id);   // admins always hear about a close
}
