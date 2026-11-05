// scheduler: hourly via pg_cron (cron key) — decides in America/New_York: weekly on Friday at report_hour_ny (Mon–Fri),
// monthly on the last calendar day at report_hour_ny. Admins can call it with a JWT: { force: "weekly"|"monthly", date?: "YYYY-MM-DD" }.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handler, json, readJson, fail } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { sendPush, type Device } from "../_shared/fcm.ts";
import { ensureAdmins } from "../_shared/admins.ts";

function nyParts(d = new Date()): { y: number; m: number; day: number; hour: number; weekday: number } {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false, weekday: "short" });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { y: Number(p.year), m: Number(p.month), day: Number(p.day), hour: Number(p.hour) % 24, weekday };
}
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function periodFor(kind: "weekly" | "monthly", ny: { y: number; m: number; day: number; weekday: number }): { start: string; end: string } {
  if (kind === "monthly") return { start: iso(ny.y, ny.m, 1), end: iso(ny.y, ny.m, lastDay(ny.y, ny.m)) };
  const d = new Date(Date.UTC(ny.y, ny.m - 1, ny.day));
  const back = (ny.weekday + 6) % 7;                        // days since Monday
  const mon = new Date(d.getTime() - back * 86400e3), fri = new Date(mon.getTime() + 4 * 86400e3);
  return { start: mon.toISOString().slice(0, 10), end: fri.toISOString().slice(0, 10) };
}

async function generate(sb: ReturnType<typeof serviceClient>, kind: "weekly" | "monthly", start: string, end: string, notify: boolean): Promise<{ created: number; pushed: number }> {
  let created = 0, pushed = 0;
  const { data: appData } = await sb.rpc("report_build", { p_period: kind, p_start: start, p_end: end, p_user: null });
  await sb.from("reports").upsert({ user_id: null, period: kind, period_start: start, period_end: end, data: appData }, { onConflict: "user_id,period,period_start", ignoreDuplicates: false }).select("id");
  const { data: users } = await sb.from("profiles").select("id,name").eq("status", "active");
  const label = kind === "weekly" ? "Your weekly report is ready" : `Your ${new Date(`${start}T12:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" })} report is ready`;
  for (const u of users ?? []) {
    const { data: existing } = await sb.from("reports").select("id").eq("user_id", u.id).eq("period", kind).eq("period_start", start).maybeSingle();
    const { data } = await sb.rpc("report_build", { p_period: kind, p_start: start, p_end: end, p_user: u.id });
    let id = existing?.id as string | undefined;
    if (id) await sb.from("reports").update({ data }).eq("id", id);
    else { const { data: ins } = await sb.from("reports").insert({ user_id: u.id, period: kind, period_start: start, period_end: end, data }).select("id").single(); id = ins?.id; created++; }
    if (notify && id && !existing) {
      const { data: devs } = await sb.from("devices").select("id,user_id,platform,fcm_token").eq("user_id", u.id);
      for (const d of (devs ?? []) as Device[]) {
        const r = await sendPush(sb, d, { title: label, body: `${start} – ${end}. Tap to see your results.`, route: `/reports/${id}`, ttlSec: 86400, data: { notification_id: crypto.randomUUID(), type: "report", report_id: id } }, { kind: "report" });
        if (r.ok) pushed++;
      }
    }
  }
  return { created, pushed };
}

Deno.serve(handler(async (req) => {
  const sb = serviceClient();
  const cronKey = Deno.env.get("J_CRON_KEY");
  const isCron = cronKey && req.headers.get("x-j-cron-key") === cronKey;
  let body: { force?: "weekly" | "monthly"; date?: string; notify?: boolean } = {};
  try { body = await readJson(req); } catch { body = {}; }
  if (!isCron) { await requireAdmin(req); if (!body.force) fail(400, "force: weekly|monthly required"); }
  const { data: hourSetting } = await sb.rpc("setting_num", { p_key: "report_hour_ny", p_default: 17 });
  const reportHour = Number(hourSetting) || 17;
  const ny = nyParts(body.date ? new Date(`${body.date}T17:00:00-05:00`) : new Date());
  const out: Record<string, unknown> = { ny };
  if (body.force) {
    const p = periodFor(body.force, ny);
    out[body.force] = await generate(sb, body.force, p.start, p.end, body.notify ?? false);
    return json(out);
  }
  // hourly housekeeping (cheap): admin seeding, close-question timeouts
  out.admins = await ensureAdmins(sb);
  const { data: timeouts } = await sb.rpc("receipts_question_timeout");
  out.question_timeouts = timeouts ?? 0;
  if (ny.hour !== reportHour) return json({ ...out, skipped: "not the report hour" });
  if (ny.weekday === 5) { const p = periodFor("weekly", ny); out.weekly = await generate(sb, "weekly", p.start, p.end, true); }
  if (ny.day === lastDay(ny.y, ny.m)) { const p = periodFor("monthly", ny); out.monthly = await generate(sb, "monthly", p.start, p.end, true); }
  return json(out);
}));
