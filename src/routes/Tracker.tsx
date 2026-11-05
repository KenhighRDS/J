import { useCallback, useEffect, useState } from "react";
import { Button, Card, Notice, PageTitle } from "../components/ui";
import { KeyReveal } from "./admin/Sources";
import { supabase, supabaseUrl } from "../lib/supabase";
import { agoShort } from "../lib/format";
import type { Profile } from "../lib/types";
import { useRealtime } from "../hooks/useRealtime";

interface Link { account_login: string | null; server: string | null; balance: number | null; currency: string | null; last_heartbeat: string | null }
const trackerEx5 = `${import.meta.env.VITE_RELEASES_PAGE ?? "https://github.com/KenhighRDS/j-releases/releases"}`;

export function Tracker({ profile, reload }: { profile: Profile; reload: () => Promise<void> }) {
  const [link, setLink] = useState<Link | null | undefined>(undefined);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const { data } = await supabase.from("tracker_links").select("account_login,server,balance,currency,last_heartbeat").eq("user_id", profile.id).maybeSingle(); setLink((data as Link | null) ?? null); }, [profile.id]);
  useEffect(() => { void load(); }, [load]);
  useRealtime([{ table: "tracker_links", filter: `user_id=eq.${profile.id}` }], () => { void load(); void reload(); }, [profile.id]);
  const pair = async () => { setBusy(true); const { data } = await supabase.rpc("tracker_pair_key"); setKey(data as string); setBusy(false); await load(); };
  const unlink = async () => { if (!window.confirm("Disconnect the tracker? Your balance goes back to manual.")) return; await supabase.rpc("tracker_unlink"); setKey(null); await load(); await reload(); };
  const connected = link?.last_heartbeat && Date.now() - new Date(link.last_heartbeat).getTime() < 3 * 60_000;
  const url = `${supabaseUrl}/functions/v1/tracker-report`;
  return (
    <div className="mx-auto w-full max-w-md pb-6">
      <PageTitle>MT5 tracker</PageTitle>
      <div className="px-4 space-y-4">
        <p className="text-[14px] text-muted">A read-only EA on your own MT5 (PC or VPS) tells J which signals you actually took and keeps your balance up to date. It works with the investor password and never trades.</p>
        {link !== undefined && link && (
          <Card className="p-4">
            <p className="text-[15px]">{connected ? "Connected" : link.last_heartbeat ? "Not reporting" : "Waiting for the EA"}</p>
            <p className="text-[13px] text-muted">{link.last_heartbeat ? `Last seen ${agoShort(link.last_heartbeat)}` : "No heartbeat yet"}{link.account_login ? ` · ${link.account_login}@${link.server ?? ""}` : ""}{link.balance != null ? ` · ${link.balance} ${link.currency ?? ""}` : ""}</p>
          </Card>
        )}
        {key && <KeyReveal value={key} />}
        <Card className="p-4 space-y-3">
          <ol className="space-y-2 text-[14px] text-muted list-decimal pl-5">
            <li>Download <a className="text-text underline" href={trackerEx5} target="_blank" rel="noreferrer">J_Tracker.ex5</a> and put it in MT5 → File → Open Data Folder → MQL5 → Experts.</li>
            <li>In MT5: Tools → Options → Expert Advisors → tick <span className="text-text">Allow WebRequest for listed URL</span> → add <code className="font-mono text-text break-all">{supabaseUrl}</code>.</li>
            <li>Attach J_Tracker to any chart. Keep algorithmic trading on.</li>
            <li>Paste your pairing key into the EA input <span className="text-text">InpJKey</span>, and the URL <code className="font-mono text-text break-all">{url}</code> into <span className="text-text">InpJUrl</span>.</li>
          </ol>
          <Button full type="button" busy={busy} onClick={pair}>{link ? "Generate a new pairing key" : "Connect MT5 tracker"}</Button>
          {link && <Button variant="quiet" full type="button" onClick={unlink}>Disconnect</Button>}
        </Card>
        <Notice>Once paired, your lot size uses the balance the tracker reports.</Notice>
      </div>
    </div>
  );
}
