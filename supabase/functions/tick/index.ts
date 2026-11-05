// tick (every 15 s via pg_cron): re-rings, expiries, close-question timeouts, admin seeding.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handler, json, requireCronKey } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { runRerings } from "../_shared/dispatch.ts";

async function ensureAdmins(sb: ReturnType<typeof serviceClient>): Promise<number> {
  const raw = Deno.env.get("J_ADMIN_EMAILS") ?? "";
  const emails = raw.split(/[,\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
  let changed = 0;
  for (const email of emails) {
    const { data: p } = await sb.from("profiles").select("id,role,status").eq("email", email).maybeSingle();
    if (!p) {
      const { data: u, error } = await sb.auth.admin.createUser({ email, email_confirm: true });
      if (error || !u.user) continue;
      await sb.from("profiles").upsert({ id: u.user.id, email, role: "admin", status: "active" }, { onConflict: "id" });
      changed++;
    } else if (p.role !== "admin" || p.status !== "active") {
      await sb.from("profiles").update({ role: "admin", status: "active" }).eq("id", p.id);
      changed++;
    }
  }
  return changed;
}

Deno.serve(handler(async (req) => {
  requireCronKey(req);
  const sb = serviceClient();
  const out: Record<string, unknown> = {};
  const { data: expired } = await sb.rpc("signals_expire_due");
  out.expired = Array.isArray(expired) ? expired.length : 0;
  out.rerings = await runRerings(sb);
  const { data: timeouts } = await sb.rpc("receipts_question_timeout");
  out.question_timeouts = timeouts ?? 0;
  // admin seeding is cheap and idempotent; run it once a minute (every 4th tick is fine, but simplest: always)
  out.admins = await ensureAdmins(sb);
  return json(out);
}));
