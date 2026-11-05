// admin-remove-user: { user_id } — bans the auth user, kills sessions, deletes devices, marks the profile removed.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handler, json, readJson, fail } from "../_shared/http.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { serviceClient } from "../_shared/supabase.ts";

Deno.serve(handler(async (req) => {
  const admin = await requireAdmin(req);
  const { user_id } = await readJson<{ user_id: string }>(req);
  if (!user_id) fail(400, "user_id required");
  if (user_id === admin.id) fail(400, "You can't remove yourself");
  const sb = serviceClient();
  const { data: target } = await sb.from("profiles").select("id,role").eq("id", user_id).maybeSingle();
  if (!target) fail(404, "User not found");
  const { error: banErr } = await sb.auth.admin.updateUserById(user_id, { ban_duration: "876600h" });
  if (banErr) fail(500, banErr.message);
  await sb.rpc("admin_kill_sessions", { p_user: user_id });
  await sb.from("devices").delete().eq("user_id", user_id);
  await sb.from("tracker_links").delete().eq("user_id", user_id);
  await sb.from("wann_access").update({ enabled: false }).eq("user_id", user_id);
  await sb.from("profiles").update({ status: "removed" }).eq("id", user_id);
  return json({ ok: true });
}));
