// receipt-action: native Android actions without the WebView. Auth: device_id + device_secret (hash stored on the device row).
// { device_id, device_secret, action: "opened"|"skip"|"yes"|"no", signal_id? , wann_call_id? }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handler, json, readJson, fail } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { sha256Hex } from "../_shared/signals.ts";

interface Body { device_id: string; device_secret: string; action: "opened" | "skip" | "yes" | "no"; signal_id?: string; wann_call_id?: string }

Deno.serve(handler(async (req) => {
  const b = await readJson<Body>(req);
  if (!b.device_id || !b.device_secret || !b.action) fail(400, "device_id, device_secret and action are required");
  const sb = serviceClient();
  const { data, error } = await sb.rpc("receipt_action_by_device", {
    p_device: b.device_id, p_secret_hash: await sha256Hex(b.device_secret), p_action: b.action, p_signal: b.signal_id ?? null, p_call: b.wann_call_id ?? null,
  });
  if (error) fail(error.code === "42501" ? 401 : 400, error.message);
  return json(data);
}));
