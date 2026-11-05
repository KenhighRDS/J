// admin-send-signal (admin only):
//   { action: "send", signal: {symbol, direction, order_type, entry, sl, tp, digits?, pip_size?, tick_size?, tick_value?, expiry_sec?}, test: boolean, targets?: uuid[] }
//   { action: "follow", signal_id, type: "move_be"|"update"|"partial"|"close"|"cancel", sl?, tp?, price?, lots?, reason? }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handler, json, readJson, fail } from "../_shared/http.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { applyEvent, type IncomingEvent } from "../_shared/signals.ts";

interface SendBody { action: "send"; signal: Partial<IncomingEvent>; test?: boolean; targets?: string[] }
interface FollowBody { action: "follow"; signal_id: string; type: "move_be" | "update" | "partial" | "close" | "cancel"; sl?: number; tp?: number; price?: number; lots?: number; reason?: "tp" | "sl" | "manual" }

Deno.serve(handler(async (req) => {
  const admin = await requireAdmin(req);
  const body = await readJson<SendBody | FollowBody>(req);
  const sb = serviceClient();
  if (body.action === "send") {
    const s = body.signal ?? {};
    if (!s.symbol || !s.direction || s.entry == null) fail(400, "symbol, direction and entry are required");
    const digits = s.digits ?? (String(s.entry).split(".")[1]?.length ?? 2);
    const ev: IncomingEvent = {
      event: "open", ea_uid: `manual-${crypto.randomUUID()}`, symbol: s.symbol, direction: s.direction, order_type: s.order_type ?? "market",
      entry: Number(s.entry), sl: s.sl ?? null, tp: s.tp ?? null, ea_lot: s.ea_lot, expiry_sec: s.expiry_sec ?? 0, digits, point: Math.pow(10, -digits),
      pip_size: s.pip_size, tick_size: s.tick_size ?? Math.pow(10, -digits), tick_value: s.tick_value ?? 1, vol_min: s.vol_min ?? 0.01, vol_step: s.vol_step ?? 0.01, vol_max: s.vol_max ?? 100,
      sent_at: new Date().toISOString(),
    };
    const isTest = body.test !== false;
    const r = await applyEvent(sb, { id: null, name: "J admin" }, ev, { createdBy: admin.id, isTest, testTargets: isTest ? body.targets ?? [] : [] });
    return json(r);
  }
  if (body.action === "follow") {
    const { data: sig } = await sb.from("signals").select("id,ea_uid,ea_source_id,source_name").eq("id", body.signal_id).maybeSingle();
    if (!sig) fail(404, "Signal not found");
    const ev: IncomingEvent = { event: body.type, ea_uid: sig.ea_uid, symbol: "x", sl: body.sl, tp: body.tp, price: body.price, lots: body.lots, reason: body.reason, sent_at: new Date().toISOString() };
    const r = await applyEvent(sb, { id: sig.ea_source_id, name: sig.source_name ?? "J admin" }, ev);
    return json(r);
  }
  fail(400, "Unknown action");
}));
