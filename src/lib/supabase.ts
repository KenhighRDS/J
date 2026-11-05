import { createClient, type SupportedStorage } from "@supabase/supabase-js";
import { Preferences } from "@capacitor/preferences";
import { isNative } from "./platform";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
export const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/** Survives WebView storage clears in the APK. */
const nativeStorage: SupportedStorage = {
  getItem: async (key) => (await Preferences.get({ key })).value,
  setItem: async (key, value) => { await Preferences.set({ key, value }); },
  removeItem: async (key) => { await Preferences.remove({ key }); },
};

export const supabase = createClient(supabaseUrl || "https://placeholder.supabase.co", supabaseAnonKey || "placeholder", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "implicit",
    storageKey: "j-auth",
    storage: isNative ? nativeStorage : window.localStorage,
  },
});

export const functionsUrl = `${supabaseUrl}/functions/v1`;

/** Calls an edge function with the user's JWT. Throws an Error with the server message on failure. */
export async function callFunction<T = unknown>(name: string, body: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${functionsUrl}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: supabaseAnonKey, ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { error: text }; }
  if (!res.ok) {
    if (res.status === 401) accessEnded();
    const msg = (json as { error?: string } | null)?.error ?? `${name} failed (${res.status})`;
    throw new Error(msg);
  }
  return json as T;
}

/** Set when the server says our session is gone (admin removal, ban). Login shows the message once. */
export function accessEnded(): void {
  try { sessionStorage.setItem("j:accessEnded", "1"); } catch { /* storage may be unavailable */ }
  void supabase.auth.signOut({ scope: "local" });
}
