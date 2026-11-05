// ingest-signal: receives J_Signal.mqh events. Auth: header X-J-Key (hash matched against ea_sources). Idempotent.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handler, json, readJson, fail } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { applyEvent, sha256Hex, type IncomingEvent } from "../_shared/signals.ts";

Deno.serve(handler(async (req) => {
  if (req.method !== "POST") fail(405, "POST only");
  const key = req.headers.get("x-j-key") ?? "";
  if (!key) fail(401, "Missing X-J-Key");
  const sb = serviceClient();
  const { data: src } = await sb.from("ea_sources").select("id,name,active").eq("api_key_hash", await sha256Hex(key)).maybeSingle();
  if (!src) fail(401, "Unknown key");
  if (!src.active) fail(403, "This EA source is paused");
  await sb.from("ea_sources").update({ last_seen: new Date().toISOString() }).eq("id", src.id);
  const ev = await readJson<IncomingEvent>(req);
  const result = await applyEvent(sb, { id: src.id, name: src.name }, ev);
  return json(result);
}));
