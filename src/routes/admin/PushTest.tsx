import { useEffect, useState } from "react";
import { Button, Card, Empty, Notice } from "../../components/ui";
import { callFunction, supabase } from "../../lib/supabase";
import { agoShort } from "../../lib/format";
import type { Device } from "../../lib/types";

export function PushTest({ userId }: { userId: string }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<unknown>(null);
  useEffect(() => { void supabase.from("devices").select("*").eq("user_id", userId).order("last_seen", { ascending: false }).then(({ data }) => setDevices((data ?? []) as Device[])); }, [userId]);
  const send = async (d: Device) => {
    setBusy(d.id); setOut(null);
    try { setOut(await callFunction("admin-push-test", { device_id: d.id })); } catch (e) { setOut({ error: e instanceof Error ? e.message : String(e) }); }
    setBusy(null);
  };
  return (
    <div className="space-y-4">
      <p className="text-[14px] text-muted">Sends a test alert to one of your devices and shows the FCM response and the push_log row.</p>
      {devices.length === 0 && <Empty title="No devices yet" body="Enable notifications on a phone signed in with your admin account." />}
      {devices.length > 0 && (
        <Card>
          {devices.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="text-[15px]">{d.platform === "android" ? "Android app" : "Web / iPhone"} <span className="text-muted">· {d.app_version ?? "?"}</span></p>
                <p className="text-[13px] text-muted truncate">Seen {agoShort(d.last_seen)} · {d.fcm_token.slice(0, 14)}…</p>
              </div>
              <Button variant="ghost" type="button" busy={busy === d.id} onClick={() => send(d)}>Send test</Button>
            </div>
          ))}
        </Card>
      )}
      {out != null && <Notice><pre className="whitespace-pre-wrap break-all font-mono text-[12px]">{JSON.stringify(out, null, 2)}</pre></Notice>}
    </div>
  );
}
