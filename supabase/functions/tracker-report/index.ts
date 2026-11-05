// tracker-report: J_Tracker.mq5 heartbeats and position events. Auth: X-J-Tracker-Key (hash matched against tracker_links).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handler, json, readJson, fail } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { sha256Hex } from "../_shared/signals.ts";

interface Heartbeat { type: "heartbeat"; balance?: number; currency?: string; account_login?: string; server?: string }
interface PositionEv { type: "position"; event: "open" | "modify" | "close"; ticket: number; symbol: string; position_type: "buy" | "sell"; volume?: number; open_price?: number; open_time?: string; sl?: number; tp?: number; close_price?: number; close_time?: string; profit?: number; account_login?: string; server?: string }

Deno.serve(handler(async (req) => {
  const key = req.headers.get("x-j-tracker-key") ?? "";
  if (!key) fail(401, "Missing X-J-Tracker-Key");
  const sb = serviceClient();
  const { data: link } = await sb.from("tracker_links").select("id,user_id").eq("key_hash", await sha256Hex(key)).maybeSingle();
  if (!link) fail(401, "Unknown tracker key");
  const b = await readJson<Heartbeat | PositionEv>(req);
  if (b.type === "heartbeat") {
    await sb.rpc("tracker_heartbeat", { p_user: link.user_id, p_balance: b.balance ?? null, p_currency: b.currency ?? null, p_login: b.account_login ?? null, p_server: b.server ?? null });
    return json({ ok: true });
  }
  if (b.type === "position") {
    if (!b.ticket || !b.symbol || !b.position_type) fail(400, "ticket, symbol, position_type required");
    const { data: base } = await sb.rpc("base_symbol", { p_symbol: b.symbol });
    const row: Record<string, unknown> = { user_id: link.user_id, ticket: b.ticket, symbol: b.symbol, base_symbol: base ?? b.symbol.toUpperCase(), type: b.position_type };
    if (b.volume != null) row.volume = b.volume; if (b.open_price != null && b.open_price > 0) row.open_price = b.open_price; if (b.open_time) row.open_time = b.open_time;
    if (b.sl != null) row.sl = b.sl; if (b.tp != null) row.tp = b.tp;
    if (b.event === "close") { row.close_price = b.close_price ?? null; row.close_time = b.close_time ?? new Date().toISOString(); row.profit = b.profit ?? null; }
    const { data: pos, error } = await sb.from("tracker_positions").upsert(row, { onConflict: "user_id,ticket" }).select("id").single();
    if (error) fail(500, error.message);
    await sb.rpc("tracker_heartbeat", { p_user: link.user_id, p_balance: null, p_currency: null, p_login: b.account_login ?? null, p_server: b.server ?? null });
    const { data: matched } = await sb.rpc("tracker_match_position", { p_position: pos.id });
    return json({ ok: true, matched_signal_id: matched ?? null });
  }
  fail(400, "Unknown type");
}));
