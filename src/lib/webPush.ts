// iPhone / web push, the exact recipe: whole enable flow inside the user's tap, worker at scope /push/,
// token refreshed on every start, worker is the only renderer, close a signal's notifications when its card opens.
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { firebaseApp, firebaseConfigured, vapidKey } from "./firebase";
import { supabase } from "./supabase";
import { appVersion, isIOSDevice, isNative, isStandalone } from "./platform";

export type PushState = "unsupported" | "ios_not_installed" | "denied" | "default" | "granted" | "not_configured";
const SW_URL = "/firebase-messaging-sw.js";
const SW_SCOPE = "/push/";

export async function pushState(): Promise<PushState> {
  if (isNative) return "unsupported";
  if (!firebaseConfigured) return "not_configured";
  if (isIOSDevice && !isStandalone()) return "ios_not_installed";
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  if (!(await isSupported())) return "unsupported";
  return Notification.permission === "denied" ? "denied" : Notification.permission === "granted" ? "granted" : "default";
}

async function registerWorker(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
  await navigator.serviceWorker.ready.catch(() => undefined);
  return reg;
}

async function tokenAndUpsert(reg: ServiceWorkerRegistration): Promise<string> {
  const token = await getToken(getMessaging(firebaseApp()), { vapidKey, serviceWorkerRegistration: reg });
  if (!token) throw new Error("No push token");
  const { error } = await supabase.rpc("device_register", { p_platform: "web", p_token: token, p_app_version: appVersion, p_user_agent: navigator.userAgent });
  if (error) throw new Error(error.message);
  try { localStorage.setItem("j:pushToken", token); } catch { /* ignore */ }
  return token;
}

/** Must be called directly from a user gesture (Safari refuses the prompt otherwise). */
export async function enablePush(): Promise<{ ok: boolean; state: PushState; error?: string }> {
  const s = await pushState();
  if (s !== "default" && s !== "granted") return { ok: false, state: s };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, state: perm === "denied" ? "denied" : "default" };
  try { await tokenAndUpsert(await registerWorker()); return { ok: true, state: "granted" }; }
  catch (e) { return { ok: false, state: "granted", error: e instanceof Error ? e.message : "Couldn't register this device" }; }
}

/** On every app start where permission is already granted: register again and refresh the token (tokens rotate). */
export async function refreshPushIfGranted(): Promise<void> {
  if ((await pushState()) !== "granted") return;
  try { await tokenAndUpsert(await registerWorker()); } catch (e) { console.warn("push refresh failed", e); }
}

export async function disablePush(): Promise<void> {
  try { const t = localStorage.getItem("j:pushToken"); if (t) await supabase.rpc("device_unregister", { p_token: t }); localStorage.removeItem("j:pushToken"); } catch { /* ignore */ }
}

/** Foreground: the worker posts j-push (data) and j-open (route). The page never shows its own banner. */
export function listenPushMessages(onData: (data: Record<string, string>) => void, onOpen: (route: string) => void): () => void {
  if (!("serviceWorker" in navigator)) return () => undefined;
  const h = (e: MessageEvent) => {
    const m = e.data as { type?: string; data?: Record<string, string>; route?: string } | null;
    if (!m) return;
    if (m.type === "j-push" && m.data) onData(m.data);
    if (m.type === "j-open" && m.route) onOpen(m.route);
  };
  navigator.serviceWorker.addEventListener("message", h);
  return () => navigator.serviceWorker.removeEventListener("message", h);
}

/** Close every notification of one signal once its card is open. */
export async function closeSignalNotifications(signalId: string): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
    const list = await reg?.getNotifications() ?? [];
    list.filter((n) => (n.data as { signal_id?: string } | null)?.signal_id === signalId).forEach((n) => n.close());
  } catch { /* ignore */ }
}
