// admin-invite: { action: "invite" | "resend" | "revoke", email, name? }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handler, json, readJson, fail } from "../_shared/http.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { SITE_URL } from "../_shared/env.ts";

interface Body { action?: "invite" | "resend" | "revoke"; email: string; name?: string }

Deno.serve(handler(async (req) => {
  const admin = await requireAdmin(req);
  const body = await readJson<Body>(req);
  const email = (body.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, "Enter a valid email");
  const sb = serviceClient();
  const action = body.action ?? "invite";
  const { data: existing } = await sb.from("profiles").select("id,status,role").eq("email", email).maybeSingle();

  if (action === "revoke") {
    if (!existing) fail(404, "No invite for that email");
    if (existing.status !== "invited") fail(400, "This user already confirmed; use Remove instead");
    await sb.auth.admin.deleteUser(existing.id);
    await sb.from("invites").update({ revoked_at: new Date().toISOString() }).eq("email", email).is("accepted_at", null);
    return json({ ok: true });
  }
  if (existing && existing.status === "active") fail(409, "That email already has access");
  if (existing && existing.status === "removed") {
    // re-invite a removed user: lift the ban, reset the profile
    await sb.auth.admin.updateUserById(existing.id, { ban_duration: "none" });
    await sb.from("profiles").update({ status: "invited" }).eq("id", existing.id);
  }
  const { data, error } = await sb.auth.admin.inviteUserByEmail(email, { redirectTo: `${SITE_URL}/welcome`, data: body.name ? { name: body.name } : undefined });
  if (error) fail(400, error.message);
  const userId = data.user?.id;
  if (userId) {
    await sb.from("profiles").upsert({ id: userId, email, name: body.name ?? null, status: "invited" }, { onConflict: "id" });
    // The email button is optional: a code login proves the same inbox, and Supabase refuses codes for unconfirmed users while signups are off.
    await sb.auth.admin.updateUserById(userId, { email_confirm: true });
  }
  await sb.from("invites").insert({ email, invited_by: admin.id });
  return json({ ok: true, user_id: userId });
}));
