import { Link } from "react-router-dom";
import type { Receipt, WannCall } from "../lib/types";
import { StatusChip } from "./StatusChip";
import { Empty } from "./ui";

export type WannRow = Receipt & { call: WannCall };

const key = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export function dayLabel(k: string, now: number): string {
  const [y, m, d] = k.split("-").map(Number); const date = new Date(y, m - 1, d); const t = new Date(now);
  const diff = Math.round((date.getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) / 86_400_000);
  if (diff === 0) return "Today"; if (diff === 1) return "Tomorrow";
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const scrollTo = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); };

function Tile({ row: r }: { row: WannRow }) {
  const c = r.call;
  const taken = r.status === "taken" || r.status === "likely_taken";
  const dim = r.status === "skipped" || r.status === "missed" || r.status === "not_taken";
  return (
    <Link to={`/wann/${c.id}`} className={`focus-ring flex min-w-0 flex-col rounded-[14px] border p-3 ${taken ? "border-chrome-3/70 bg-surface-2" : "border-border bg-surface"} ${dim ? "opacity-55" : ""}`}>
      <div className="flex items-baseline gap-2 text-[11px] text-muted"><span className="min-w-0 flex-1 truncate">{c.competition}</span><span className="shrink-0 font-mono">{time(c.kickoff_utc)}</span></div>
      <p className="mt-1.5 truncate text-[14px] font-medium leading-tight">{c.home}</p>
      <p className="truncate text-[14px] font-medium leading-tight text-text/75">{c.away}</p>
      <div className="mt-2.5 flex items-end justify-between gap-2">
        <span className="min-w-0 truncate text-[12px] text-muted">{c.pick_label}</span>
        <span className="chrome shrink-0 font-mono text-[24px] font-semibold leading-none">{c.probability}%</span>
      </div>
      <div className="mt-2 h-6">{(taken || dim) && <StatusChip status={r.status} />}</div>
    </Link>
  );
}

function PastRow({ row: r }: { row: WannRow }) {
  const c = r.call;
  const result = c.status === "finished" ? (c.outcome === "won" ? <span className="text-buy">Won</span> : c.outcome === "lost" ? <span className="text-sell">Lost</span> : <span className="text-muted">Void</span>) : <span className="text-muted">{c.status === "withdrawn" ? "Withdrawn" : "Kicked off"}</span>;
  return (
    <li><Link to={`/wann/${c.id}`} className="focus-ring flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px]">{c.home} <span className="font-mono text-muted">{c.final_score ?? "–"}</span> {c.away}</p>
        <p className="truncate text-[13px] text-muted">{c.pick_label} · {c.probability}% · {result}</p>
      </div>
      <StatusChip status={r.status} />
    </Link></li>
  );
}

/** Day-by-day gallery of the calls a user received: the probability is the hero of each tile, finished games sit at the end. */
export function WannGallery({ rows, now }: { rows: WannRow[]; now: number }) {
  const upcoming = rows.filter((r) => r.call.status === "live" && new Date(r.call.kickoff_utc).getTime() > now).sort((a, b) => a.call.kickoff_utc.localeCompare(b.call.kickoff_utc));
  const past = rows.filter((r) => !upcoming.includes(r)).sort((a, b) => b.call.kickoff_utc.localeCompare(a.call.kickoff_utc));
  const groups: { key: string; rows: WannRow[] }[] = [];
  for (const r of upcoming) { const k = key(r.call.kickoff_utc); const g = groups[groups.length - 1]; if (g && g.key === k) g.rows.push(r); else groups.push({ key: k, rows: [r] }); }
  const won = past.filter((r) => r.call.outcome === "won").length, lost = past.filter((r) => r.call.outcome === "lost").length;
  if (!rows.length) return <Empty title="No Wann calls yet" body="Games at or above the minimum probability for the coming week show up here." />;
  return (
    <>
      <p className="-mt-1 px-4 text-[13px] text-muted">{upcoming.length === 0 ? "Nothing coming up" : `${upcoming.length} ${upcoming.length === 1 ? "call" : "calls"} over the next ${groups.length} ${groups.length === 1 ? "day" : "days"}`}{won + lost > 0 ? ` · record ${won}–${lost}` : ""}</p>
      {groups.length > 1 && (
        <nav aria-label="Days" className="sticky top-0 z-10 mt-2 flex gap-2 overflow-x-auto bg-bg/95 px-4 py-2 backdrop-blur [scrollbar-width:none]">
          {groups.map((g) => <a key={g.key} href={`#wann-${g.key}`} onClick={scrollTo(`wann-${g.key}`)} className="focus-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 text-[13px]">{dayLabel(g.key, now)}<span className="font-mono text-[12px] text-muted">{g.rows.length}</span></a>)}
          {past.length > 0 && <a href="#wann-results" onClick={scrollTo("wann-results")} className="focus-ring inline-flex h-8 shrink-0 items-center rounded-full border border-border px-3 text-[13px] text-muted">Results</a>}
        </nav>
      )}
      {groups.map((g) => (
        <section key={g.key} id={`wann-${g.key}`} className="scroll-mt-14 px-4 pt-4">
          <h2 className="flex items-baseline justify-between text-[15px] font-semibold">{dayLabel(g.key, now)}<span className="text-[13px] font-normal text-muted">{g.rows.length} {g.rows.length === 1 ? "call" : "calls"}</span></h2>
          <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(156px,1fr))] gap-2">{g.rows.map((r) => <Tile key={r.id} row={r} />)}</div>
        </section>
      ))}
      {past.length > 0 && (
        <section id="wann-results" className="scroll-mt-14 px-4 pt-6">
          <h2 className="flex items-baseline justify-between text-[15px] font-semibold">Results<span className="text-[13px] font-normal text-muted">{won} won · {lost} lost</span></h2>
          <ul className="mt-2 divide-y divide-border rounded-[16px] border border-border bg-surface">{past.slice(0, 60).map((r) => <PastRow key={r.id} row={r} />)}</ul>
        </section>
      )}
    </>
  );
}
