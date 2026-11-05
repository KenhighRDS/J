import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { env } from "./env.ts";

let admin: SupabaseClient | null = null;
/** Service-role client: bypasses RLS. Only ever used server-side. */
export function serviceClient(): SupabaseClient {
  if (!admin) admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}
