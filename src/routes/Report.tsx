import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Card, Spinner } from "../components/ui";
import { ShareCard, chromeText } from "../components/ShareCard";
import { supabase } from "../lib/supabase";
import { dateRange, pips } from "../lib/format";
import { renderPng, sharePng } from "../lib/share";
import type { Profile, Report as ReportT } from "../lib/types";

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "buy" | "sell" }) {
  return <div className="rounded-[12px] bg-surface-2 px-3 py-2.5"><p className="text-[12px] text-muted">{label}</p><p className={`font-mono text-[20px] tabular ${tone === "buy" ? "text-buy" : tone === "sell" ? "text-sell" : ""}`}>{value}</p></div>;
}

export function ReportRoute({ profile }: { profile: Profile }) {
  const { id = "" } = useParams(); const nav = useNavigate();
  const [r, setR] = useState<ReportT | null>(null);
  const [busy, setBusy] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => { void supabase.from("reports").select("*").eq("id", id).maybeSingle().then(({ data }) => setR(data as ReportT | null)); }, [id]);
  if (!r) return <div className="flex h-full items-center justify-center"><Spinner /></div>;
  const a = r.data.app, u = r.data.user, w = r.data.wann;
  const title = `${r.period === "weekly" ? "Week" : "Month"} · ${dateRange(r.period_start, r.period_end)}`;
  const share = async () => {
    if (!card.current) return; setBusy(true);
    try { await sharePng(await renderPng(card.current), `J-report-${r.period_start}.png`, "J results"); } finally { setBusy(false); }
  };
  const first = (u?.name ?? profile.name ?? profile.email.split("@")[0]).split(" ")[0];
  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col">
      <header className="flex h-12 items-center px-4"><button type="button" onClick={() => nav("/reports")} className="focus-ring -ml-2 h-11 w-11 text-muted" aria-label="Back">←</button><p className="text-[15px]">{title}</p></header>
      <div className="scroll-area px-4 pb-6 space-y-4">
        <Card className="p-4">
          <h2 className="text-[17px] font-semibold">J results</h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="Called" value={a.called} /><Stat label="Win rate" value={`${a.win_rate}%`} /><Stat label="Total pips" value={pips(a.pips)} tone={a.pips > 0 ? "buy" : a.pips < 0 ? "sell" : undefined} />
            <Stat label="Wins" value={a.wins} /><Stat label="Losses" value={a.losses} /><Stat label="Breakeven" value={a.be} />
          </div>
          {a.best && <p className="mt-3 text-[13px] text-muted">Best trade: {a.best.symbol} {pips(a.best.pips)} pips</p>}
          {a.symbols.length > 0 && <ul className="mt-2 space-y-1 text-[14px]">{a.symbols.map((s) => <li key={s.symbol} className="flex justify-between"><span>{s.symbol} <span className="text-muted">×{s.n}</span></span><span className={`font-mono ${s.pips > 0 ? "text-buy" : s.pips < 0 ? "text-sell" : ""}`}>{pips(s.pips)}</span></li>)}</ul>}
        </Card>
        {u && (
          <Card className="p-4">
            <h2 className="text-[17px] font-semibold">Your results</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat label="Received" value={u.received} /><Stat label="Taken" value={u.taken + u.likely} /><Stat label="Missed" value={u.missed} />
              <Stat label="Skipped" value={u.skipped} /><Stat label="Wins / losses" value={`${u.wins} / ${u.losses}`} /><Stat label="Your pips" value={pips(u.pips)} tone={u.pips > 0 ? "buy" : u.pips < 0 ? "sell" : undefined} />
            </div>
            <p className="mt-3 text-[12px] text-muted">{u.tracker ? "Pips from your tracker." : "Pips from the signals you marked taken."}{u.likely > 0 ? ` Incl. ${u.likely} likely taken.` : ""}</p>
          </Card>
        )}
        {w && (
          <Card className="p-4">
            <h2 className="text-[17px] font-semibold">Wann</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat label="Games called" value={w.called} /><Stat label="Won / lost" value={`${w.won} / ${w.lost}`} /><Stat label="Hit rate" value={`${w.hit_rate}%`} />
              <Stat label="You took" value={w.taken} /><Stat label="You missed" value={w.missed} />
            </div>
          </Card>
        )}
        <Button full type="button" busy={busy} onClick={share}>Share as image</Button>
      </div>
      <ShareCard ref={card} format="post">
        <div style={{ fontSize: 34, color: "#8E8E93" }}>{r.period === "weekly" ? "Weekly results" : "Monthly results"} · {dateRange(r.period_start, r.period_end)}</div>
        <div style={{ marginTop: 60, fontSize: 200, fontWeight: 700, lineHeight: 1, letterSpacing: -6, ...chromeText }}>{pips(a.pips)}</div>
        <div style={{ fontSize: 44, color: "#BFC3C9", marginTop: 8 }}>pips · {a.win_rate}% win rate</div>
        <div style={{ display: "flex", gap: 60, marginTop: 80, fontSize: 40 }}>
          <div><div style={{ color: "#8E8E93", fontSize: 28 }}>Called</div><div style={chromeText}>{a.called}</div></div>
          <div><div style={{ color: "#8E8E93", fontSize: 28 }}>Wins</div><div style={chromeText}>{a.wins}</div></div>
          <div><div style={{ color: "#8E8E93", fontSize: 28 }}>Losses</div><div style={chromeText}>{a.losses}</div></div>
          {a.best && <div><div style={{ color: "#8E8E93", fontSize: 28 }}>Best</div><div style={chromeText}>{a.best.symbol} {pips(a.best.pips)}</div></div>}
        </div>
        {u && <div style={{ marginTop: 90, fontSize: 40, color: "#F5F5F7" }}>{first}: {u.taken + u.likely} taken · <span style={{ color: u.pips >= 0 ? "#2FBF71" : "#E5484D" }}>{pips(u.pips)} pips</span></div>}
      </ShareCard>
    </div>
  );
}
