import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/** Seeds/repairs admin accounts from J_ADMIN_EMAILS. Idempotent and cheap. */
export async function ensureAdmins(sb: SupabaseClient): Promise<number> {
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
