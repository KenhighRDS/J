import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { App as CapApp } from "@capacitor/app";
import { supabase, accessEnded } from "./supabase";
import { isNative } from "./platform";
import type { Profile } from "./types";

const LAST_EMAIL = "j:lastEmail";
export const lastEmail = (): string => { try { return localStorage.getItem(LAST_EMAIL) ?? ""; } catch { return ""; } };
export const rememberEmail = (e: string): void => { try { localStorage.setItem(LAST_EMAIL, e); } catch { /* ignore */ } };

export async function sendCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) {
    if (/signups? not allowed|not found|invalid/i.test(error.message)) throw new Error("This email isn't invited to J. Ask the admin.");
    throw new Error(error.message);
  }
  rememberEmail(email);
}
export async function verifyCode(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw new Error(/expired|invalid/i.test(error.message) ? "That code didn't work. Check it or send a new one." : error.message);
}
export async function logOut(): Promise<void> { await supabase.auth.signOut({ scope: "local" }); }

/** Session state shared by the whole app; refreshes on resume and never logs out by itself. */
export function useSession(): { session: Session | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => { if (alive) { setSession(data.session); setLoading(false); } });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (alive) { setSession(s); setLoading(false); } });
    const onVisible = () => { if (document.visibilityState === "visible") { supabase.auth.startAutoRefresh(); void supabase.auth.getSession(); } else { supabase.auth.stopAutoRefresh(); } };
    document.addEventListener("visibilitychange", onVisible);
    let nativeSub: { remove: () => void } | null = null;
    if (isNative) { void CapApp.addListener("appStateChange", ({ isActive }) => { if (isActive) { supabase.auth.startAutoRefresh(); void supabase.auth.getSession(); } else supabase.auth.stopAutoRefresh(); }).then((h) => { nativeSub = h; }); }
    return () => { alive = false; sub.subscription.unsubscribe(); document.removeEventListener("visibilitychange", onVisible); nativeSub?.remove(); };
  }, []);
  return { session, loading };
}

export function useProfile(session: Session | null): { profile: Profile | null; reload: () => Promise<void> } {
  const [profile, setProfile] = useState<Profile | null>(null);
  const load = async () => {
    if (!session) { setProfile(null); return; }
    const { data, error } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
    if (error) { if (error.code === "PGRST301" || /JWT/i.test(error.message)) accessEnded(); return; }
    if (!data || data.status === "removed") { accessEnded(); return; }
    setProfile(data as Profile);
    void supabase.rpc("profile_touch");
  };
  useEffect(() => { void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);
  return { profile, reload: load };
}
