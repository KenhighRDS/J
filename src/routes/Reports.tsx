import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Empty, PageTitle, Spinner } from "../components/ui";
import { supabase } from "../lib/supabase";
import { dateRange, pips } from "../lib/format";
import type { Profile, Report } from "../lib/types";

export function Reports({ profile }: { profile: Profile }) {
  const [rows, setRows] = useState<Report[] | null>(null);
  useEffect(() => { void supabase.from("reports").select("*").eq("user_id", profile.id).order("period_start", { ascending: false }).limit(100).then(({ data }) => setRows((data ?? []) as Report[])); }, [profile.id]);
  if (!rows) return <div className="mx-auto w-full max-w-md"><PageTitle>Reports</PageTitle><div className="flex justify-center py-16"><Spinner /></div></div>;
  return (
    <div className="mx-auto w-full max-w-md pb-6">
      <PageTitle>Reports</PageTitle>
      {rows.length === 0 && <Empty title="No reports yet" body="Your first weekly report lands on Friday at 5 pm New York time." />}
      {rows.length > 0 && (
        <ul className="mx-4 divide-y divide-border rounded-[16px] border border-border bg-surface">
          {rows.map((r) => (
            <li key={r.id}><Link to={`/reports/${r.id}`} className="focus-ring flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1"><p className="text-[15px]">{r.period === "weekly" ? "Week" : "Month"} · {dateRange(r.period_start, r.period_end)}</p><p className="text-[13px] text-muted">{r.data.app.called} called · {r.data.app.win_rate}% win rate</p></div>
              <span className={`font-mono text-[16px] ${r.data.app.pips > 0 ? "text-buy" : r.data.app.pips < 0 ? "text-sell" : ""}`}>{pips(r.data.app.pips)}</span>
            </Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}
