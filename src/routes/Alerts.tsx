import { useCallback, useEffect, useState } from "react";
import { Button, Card, Notice, PageTitle } from "../components/ui";
import { JAlert, hasNativeAlerts, type PermissionStatus } from "../lib/native";

type Which = "notifications" | "fullScreen" | "overlay" | "battery" | "dnd" | "samsung";
const rows: { key: keyof PermissionStatus; which: Which; title: string; why: string; optional?: boolean }[] = [
  { key: "notifications", which: "notifications", title: "Notifications", why: "Needed for any alert at all." },
  { key: "fullScreen", which: "fullScreen", title: "Full-screen alerts", why: "Lets a signal take over the screen like an incoming call." },
  { key: "overlay", which: "overlay", title: "Display over other apps", why: "Shows the alert on top while you're using another app." },
  { key: "battery", which: "battery", title: "Battery: unrestricted", why: "Keeps Android from pausing J in the background." },
  { key: "dnd", which: "dnd", title: "Ring through Do Not Disturb", why: "Optional. Lets signals ring during Do Not Disturb.", optional: true },
];

/** First launch + Settings → Alerts: every permission with its status and a button to the exact system page. */
export function Alerts({ onDone }: { onDone?: () => void }) {
  const [status, setStatus] = useState<PermissionStatus | null>(null);
  const [testArmed, setTestArmed] = useState(false);
  const refresh = useCallback(async () => { if (hasNativeAlerts) setStatus(await JAlert.getPermissions()); }, []);
  useEffect(() => {
    void refresh();
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  if (!hasNativeAlerts) return <div className="mx-auto w-full max-w-md"><PageTitle>Alerts</PageTitle><p className="px-5 text-muted">Call-style alerts are part of the Android app.</p></div>;
  const fix = async (which: Which) => {
    if (which === "notifications") { const r = await JAlert.requestNotifications(); if (!r.granted) await JAlert.openPermission({ which }); }
    else await JAlert.openPermission({ which });
    window.setTimeout(() => { void refresh(); }, 1500);
  };
  const allGood = status ? rows.filter((r) => !r.optional).every((r) => status[r.key]) : false;
  return (
    <div className="mx-auto w-full max-w-md pb-6">
      <PageTitle>Alerts</PageTitle>
      <div className="px-4 space-y-4">
        <p className="text-[14px] text-muted">A signal should ring like a call, even on the lock screen. Android needs these once.</p>
        <Card>
          {rows.map((r) => {
            const ok = status ? Boolean(status[r.key]) : false;
            return (
              <div key={r.key} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ok ? "bg-buy" : r.optional ? "bg-muted" : "bg-sell"}`} aria-hidden />
                <div className="min-w-0 flex-1"><p className="text-[15px]">{r.title}</p><p className="text-[13px] text-muted">{ok ? "On" : r.why}</p></div>
                {!ok && <Button variant="ghost" type="button" className="h-10 px-4" onClick={() => fix(r.which)}>{r.optional ? "Allow" : "Fix"}</Button>}
              </div>
            );
          })}
        </Card>
        {status?.samsung && (
          <Notice>Samsung: Settings → Battery → Background usage limits → <span className="text-text">Never sleeping apps</span> → add J. <button type="button" className="underline" onClick={() => fix("samsung")}>Open app settings</button></Notice>
        )}
        <Card className="p-4">
          <p className="text-[15px]">Test alert</p>
          <p className="mt-1 text-[13px] text-muted">Rings a fake signal in 10 seconds. Tap, then lock your phone and wait.</p>
          <Button className="mt-3" full type="button" onClick={async () => { await JAlert.testAlert({ delaySec: 10 }); setTestArmed(true); window.setTimeout(() => setTestArmed(false), 12000); }}>{testArmed ? "Ringing in 10 s… lock your phone" : "Test alert"}</Button>
        </Card>
        {onDone && <Button variant={allGood ? "primary" : "ghost"} full type="button" onClick={onDone}>{allGood ? "Done" : "Continue anyway"}</Button>}
      </div>
    </div>
  );
}
