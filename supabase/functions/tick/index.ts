// tick: called once a minute by pg_cron, and only when there is work (private.tick_due). One invocation runs
// four 15-second passes (re-rings + expiries) so the free-tier invocation budget stays small.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handler, json, requireCronKey } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { runRerings } from "../_shared/dispatch.ts";
import { ensureAdmins } from "../_shared/admins.ts";

const PASSES = 4, PASS_MS = 15_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(handler(async (req) => {
  await requireCronKey(req);
  const sb = serviceClient();
  const out = { expired: 0, rerings: 0, closed: 0, admins: 0, passes: 0 };
  const { count } = await sb.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
  if (!count) out.admins = await ensureAdmins(sb);
  const started = Date.now();
  for (let i = 0; i < PASSES; i++) {
    const { data: expired } = await sb.rpc("signals_expire_due");
    out.expired += Array.isArray(expired) ? expired.length : 0;
    const r = await runRerings(sb);
    out.rerings += r.sent; out.closed += r.closed; out.passes++;
    const { data: more } = await sb.rpc("tick_due_check");
    if (i === PASSES - 1 || !more) break;
    const wait = started + (i + 1) * PASS_MS - Date.now();
    if (wait > 0) await sleep(wait);
  }
  return json(out);
}));
