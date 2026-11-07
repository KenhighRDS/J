import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Notice } from "./ui";
import type { Profile } from "../lib/types";
import { isAndroidNative } from "../lib/platform";
import { enablePush, getLastPushError, isThisDeviceRegistered, pushState, type PushState } from "../lib/webPush";
import { callFunction, supabase } from "../lib/supabase";

export function NotificationsCard({ profile }: { profile: Profile }) {
  const [state, setState] = useState<PushState | "native">(isAndroidNative ? "native" : "default");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [focusNoteSeen, setFocusNoteSeen] = useState(() => { try { return localStorage.getItem("j:focusNote") === "1"; } catch { return true; } });
  useEffect(() => {
    if (isAndroidNative) return;
    void pushState().then(async (s) => { setState(s); if (s === "granted") { setRegistered(await isThisDeviceRegistered(profile.id)); const err = getLastPushError(); if (err) setMsg(err); } });
  }, [profile.id]);

  const enable = async () => {
    setBusy(true); setMsg(null);
    const r = await enablePush();
    setState(r.state);
    setRegistered(r.ok);
    if (!r.ok && r.error) setMsg(r.error);
    if (r.ok) setMsg("This device is registered. Send yourself a test.");
    setBusy(false);
  };
  const sendTest = async () => {
    setBusy(true); setMsg(null);
    try {
      const token = localStorage.getItem("j:pushToken");
      const { data: devs } = await supabase.from("devices").select("id,fcm_token").eq("user_id", profile.id);
      const dev = (devs ?? []).find((d: { fcm_token: string }) => d.fcm_token === token) ?? (devs ?? [])[0];
      if (!dev) throw new Error("This device isn't registered yet");
      const r = await callFunction<{ result: { ok: boolean; status: string; error?: string } }>("admin-push-test", { device_id: dev.id });
      setMsg(r.result.ok ? "Test sent. Lock your phone and wait a few seconds." : `Not sent: ${r.result.status}`);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Couldn't send the test"); }
    setBusy(false);
  };

  return (
    <Card className="p-4">
      <h2 className="text-[17px] font-semibold">Notifications</h2>
      {state === "native" && <p className="mt-1.5 text-[14px] text-muted">Signals ring like a call on this phone. Check <Link className="text-text underline" to="/settings/alerts">Alerts and permissions</Link> once.</p>}
      {state === "not_configured" && <p className="mt-1.5 text-[14px] text-muted">Push isn't configured for this build yet.</p>}
      {state === "unsupported" && <p className="mt-1.5 text-[14px] text-muted">This browser can't receive push notifications. On iPhone, add J to the Home Screen (iOS 16.4 or newer).</p>}
      {state === "ios_not_installed" && (
        <ol className="mt-2 space-y-1.5 text-[14px] text-muted list-decimal pl-5">
          <li>Tap <span className="text-text">Share</span> in Safari.</li>
          <li>Tap <span className="text-text">Add to Home Screen</span>, then <span className="text-text">Add</span>.</li>
          <li>Open J from the icon and tap <span className="text-text">Enable notifications</span>.</li>
        </ol>
      )}
      {state === "denied" && <div className="mt-2"><Notice tone="warn">Notifications are blocked — allow J in Settings → Notifications.</Notice></div>}
      {state === "default" && (
        <>
          <p className="mt-1.5 text-[14px] text-muted">Get every signal the second it's called, even when J is closed.</p>
          <Button className="mt-3" full busy={busy} onClick={enable} type="button">Enable notifications</Button>
        </>
      )}
      {state === "granted" && registered === false && (
        <>
          <div className="mt-2"><Notice tone="warn">Notifications are allowed, but this device isn't registered with J yet.</Notice></div>
          <Button className="mt-3" full busy={busy} onClick={enable} type="button">Register this device</Button>
        </>
      )}
      {state === "granted" && registered !== false && (
        <>
          <p className="mt-1.5 text-[14px] text-buy">Signals will reach this {/iPhone|iPad/.test(navigator.userAgent) ? "iPhone" : "device"} even when J is closed.</p>
          <Button className="mt-3" variant="ghost" full busy={busy} onClick={sendTest} type="button">Send me a test</Button>
          {!focusNoteSeen && /iPhone|iPad/.test(navigator.userAgent) && (
            <div className="mt-3 flex items-start gap-3">
              <Notice>If you use Focus modes, add J to their allowed apps so signals aren't silenced.</Notice>
              <button type="button" className="text-[13px] text-muted shrink-0" onClick={() => { setFocusNoteSeen(true); try { localStorage.setItem("j:focusNote", "1"); } catch { /* ignore */ } }}>Got it</button>
            </div>
          )}
        </>
      )}
      {msg && <p className="mt-2 text-[13px] text-muted">{msg}</p>}
    </Card>
  );
}
