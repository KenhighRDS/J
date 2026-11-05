import { createClient } from "jsr:@supabase/supabase-js@2";
import { env } from "./env.ts";
import { fail } from "./http.ts";
import { serviceClient } from "./supabase.ts";

export interface Caller { id: string; email: string; role: "admin" | "subscriber"; status: string; name: string | null }

/** The signed-in user behind the Authorization header, with their profile. */
export async function requireUser(req: Request): Promise<Caller> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) fail(401, "Not signed in");
  const anon = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) fail(401, "Session expired");
  const { data: p } = await serviceClient().from("profiles").select("id,email,role,status,name").eq("id", data.user.id).maybeSingle();
  if (!p || p.status === "removed") fail(401, "Your access has ended");
  return p as Caller;
}
export async function requireAdmin(req: Request): Promise<Caller> {
  const u = await requireUser(req);
  if (u.role !== "admin") fail(403, "Admin only");
  return u;
}
