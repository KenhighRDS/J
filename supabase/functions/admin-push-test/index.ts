// admin-push-test: { device_id } → sends a test signal-style push to one of the caller's own devices; returns FCM response + log row.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handler, json, readJson, fail } from "../_shared/http.ts";
import { requireUser } from "../_shared/auth.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { sendPush, type Device } from "../_shared/fcm.ts";

Deno.serve(handler(async (req) => {
  const admin = await requireUser(req);
  const { device_id } = await readJson<{ device_id: string }>(req);
  const sb = serviceClient();
  const { data: d } = await sb.from("devices").select("id,user_id,platform,fcm_token").eq("id", device_id).maybeSingle();
  if (!d) fail(404, "Device not found");
  if (d.user_id !== admin.id) fail(403, "You can only push-test your own devices");
  const expires = new Date(Date.now() + 120_000).toISOString();
  const res = await sendPush(sb, d as Device, {
    title: "XAUUSD · TEST", body: "Entry 2341.50 · SL 2335.00 · TP 2355.00 — tap to open", route: "/settings/notifications?test=1", ttlSec: 120,
    data: { notification_id: crypto.randomUUID(), type: "test", symbol: "XAUUSD", direction: "buy", order_type: "market", expires_at: expires, ring_sec: "20", is_test: "true" },
  }, { kind: "test" });
  const { data: log } = await sb.from("push_log").select("*").eq("device_id", d.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return json({ result: res, log });
}));
