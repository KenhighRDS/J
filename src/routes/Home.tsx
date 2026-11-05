import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Empty, PageTitle, Spinner } from "../components/ui";
import { StatusChip } from "../components/StatusChip";
import { supabase } from "../lib/supabase";
import { countdown, headline, pips, timeShort } from "../lib/format";
import type { Profile, Receipt, Signal } from "../lib/types";
import { useRealtime } from "../hooks/useRealtime";

type Row = Receipt & { signal: Signal };

export function Home({ profile }: { profile: Profile }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [now, setNow] = useState(Date.now());
  const load = useCallback(async () => {
    const { data } = await supabase.from("receipts").select("*, signal:signals(*)").eq("user_id", profile.id).eq("kind", "ea").order("created_at", { ascending: false }).limit(200);
    setRows(((data ?? []) as Row[]).filter((r) => r.signal));
  }, [profile.id]);
  useEffect(() => { void load(); }, [load]);
  useRealtime([{ table: "receipts", filter: `user_id=eq.${profile.id}` }, { table: "signals" }], () => { void load(); }, [profile.id]);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);

  if (!rows) return <div className="mx-auto w-full max-w-md"><PageTitle>Signals</PageTitle><div className="flex justify-center py-16"><Spinner /></div></div>;
  const live = rows.filter((r) => r.signal.status === "live" || r.signal.status === "triggered");
  const history = rows.filter((r) => !live.includes(r));
  return (
    <div className="mx-auto w-full max-w-md pb-4">
      <PageTitle>Signals</PageTitle>
      {rows.length === 0 && <Empty title="No signals yet" body="When a trade is called, it rings here with everything to copy." />}
      {live.length > 0 && (
        <section className="px-4 space-y-2">
          {live.map((r) => {
            const s = r.signal; const left = s.expires_at ? new Date(s.expires_at).getTime() - now : null;
            return (
              <Link key={r.id} to={`/signal/${s.id}`} className="focus-ring flex items-center gap-3 rounded-[16px] border border-chrome-3/50 bg-surface-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] font-semibold"><span>{s.base_symbol}</span> <span className={s.direction === "buy" ? "text-buy" : "text-sell"}>{headline("", s.direction, s.order_type).trim()}</span></p>
                  <p className="text-[13px] text-muted">{s.status === "triggered" ? "Triggered" : s.order_type === "market" ? "Expires soon" : "Pending"} · {timeShort(s.sent_at ?? s.created_at)}{s.is_test ? " · TEST" : ""}</p>
                </div>
                <span className="font-mono tabular text-[20px]">{s.status === "triggered" ? "·" : left == null ? "LIVE" : countdown(Math.max(0, left))}</span>
              </Link>
            );
          })}
        </section>
      )}
      {history.length > 0 && (
        <section className={`px-4 ${live.length ? "mt-5" : ""}`}>
          <ul className="divide-y divide-border rounded-[16px] border border-border bg-surface">
            {history.map((r) => { const s = r.signal; return (
              <li key={r.id}>
                <Link to={`/signal/${s.id}`} className="focus-ring flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px]"><span>{s.base_symbol}</span> <span className={s.direction === "buy" ? "text-buy" : "text-sell"}>{headline("", s.direction, s.order_type).trim()}</span>{s.is_test && <span className="text-muted"> · TEST</span>}</p>
                    <p className="text-[13px] text-muted">{timeShort(s.sent_at ?? s.created_at)} · {s.status === "closed" ? (s.close_reason ? s.close_reason.toUpperCase() : "closed") : s.status}</p>
                  </div>
                  <span className={`font-mono tabular text-[15px] ${s.result_pips == null ? "text-muted" : s.result_pips > 0 ? "text-buy" : s.result_pips < 0 ? "text-sell" : ""}`}>{s.result_pips == null ? "–" : pips(s.result_pips)}</span>
                  <StatusChip status={r.status} />
                </Link>
              </li>); })}
          </ul>
        </section>
      )}
    </div>
  );
}
