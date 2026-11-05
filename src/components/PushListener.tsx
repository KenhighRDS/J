import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listenPushMessages, refreshPushIfGranted } from "../lib/webPush";
import { hasNativeAlerts, JAlert } from "../lib/native";
import { supabase } from "../lib/supabase";
import { appVersion } from "../lib/platform";

/** Wires push into the running app: token refresh on start, worker messages → navigation, native alert opens → card. */
export function PushListener() {
  const nav = useNavigate();
  useEffect(() => {
    void refreshPushIfGranted();
    const off = listenPushMessages(
      (data) => { window.dispatchEvent(new CustomEvent("j:push", { detail: data })); },
      (route) => nav(route),
    );
    let handle: { remove: () => void } | null = null;
    if (hasNativeAlerts) {
      void JAlert.consumeLaunchRoute().then(({ route }) => { if (route) nav(route); }).catch(() => undefined);
      void JAlert.addListener("signal", (e) => { if (e.route) nav(e.route); }).then((h) => { handle = h; });
      void JAlert.getToken().then(async ({ token, deviceSecret }) => {
        const secretHash = await sha256(deviceSecret);
        const { data: id } = await supabase.rpc("device_register", { p_platform: "android", p_token: token, p_app_version: appVersion, p_secret_hash: secretHash, p_user_agent: navigator.userAgent });
        const url = import.meta.env.VITE_SUPABASE_URL ?? "";
        if (id) await JAlert.setServer({ functionsUrl: `${url}/functions/v1`, anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "", deviceId: String(id) });
      }).catch((e) => console.warn("native token", e));
    }
    return () => { off(); handle?.remove(); };
  }, [nav]);
  return null;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
