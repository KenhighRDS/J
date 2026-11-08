import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Empty, Notice, Spinner } from "../../components/ui";
import { PromoCalledIt } from "../../components/PromoCalledIt";
import { shareSize, type ShareFormat } from "../../components/ShareCard";
import { MAX_LEGS, calledAt, claimable } from "../../lib/calledIt";
import { canDownloadDirectly, downloadDataUrl, renderPng, sharePng } from "../../lib/share";
import { supabase } from "../../lib/supabase";
import type { WannCall } from "../../lib/types";

const dayOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/** Admin: pick won Wann calls and turn them into a "J × Wann called it" image. One call makes a single card, two or more a combo. */
export function WannReport({ initial }: { initial?: WannCall[] }) {
  const [calls, setCalls] = useState<WannCall[] | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [stage, setStage] = useState<"pick" | "card">("pick");
  const [format, setFormat] = useState<ShareFormat>("post");
  const [busy, setBusy] = useState<"share" | "download" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const previewBox = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);

  useEffect(() => {
    if (initial) return;
    void (async () => {
      const { data, error: e } = await supabase.from("wann_calls").select("*").eq("status", "finished").eq("outcome", "won").order("prediction_time", { ascending: false, nullsFirst: false }).limit(400);
      if (e) setError(e.message); else setCalls((data ?? []) as WannCall[]);
    })();
  }, [initial]);
  useEffect(() => {
    const el = previewBox.current; if (!el) return;
    const fit = () => setScale(el.clientWidth / shareSize[format].w);
    fit(); const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect();
  }, [format, stage]);

  const days = useMemo(() => {
    const won = [...claimable(calls ?? [])].reverse();                       // newest first in the picker
    const groups: { day: string; rows: WannCall[] }[] = [];
    for (const c of won) { const d = dayOf(calledAt(c)); const g = groups[groups.length - 1]; if (g && g.day === d) g.rows.push(c); else groups.push({ day: d, rows: [c] }); }
    return groups;
  }, [calls]);
  const selected = useMemo(() => claimable((calls ?? []).filter((c) => picked.includes(c.id))), [calls, picked]);
  const full = picked.length >= MAX_LEGS;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_LEGS ? p : [...p, id]));
  const pickDay = (rows: WannCall[]) => setPicked((p) => {
    const ids = rows.map((r) => r.id); const all = ids.every((id) => p.includes(id));
    if (all) return p.filter((id) => !ids.includes(id));
    const next = [...p]; for (const id of ids) if (!next.includes(id) && next.length < MAX_LEGS) next.push(id); return next;
  });
  const go = async (mode: "share" | "download") => {
    if (!card.current) return; setBusy(mode); setMsg(null);
    const name = `J-x-Wann-called-it-${selected.length === 1 ? "single" : `${selected.length}-for-${selected.length}`}-${format}.png`;
    try {
      const png = await renderPng(card.current);
      if (mode === "download" && canDownloadDirectly) downloadDataUrl(png, name);
      else { const r = await sharePng(png, name, "J × Wann"); if (r === "shared" && !canDownloadDirectly) setMsg("To keep the file, pick Save to Photos, Files or Gallery in the share sheet."); }
    } catch (e) { setMsg(e instanceof Error ? e.message : "Couldn't create the image"); }
    finally { setBusy(null); }
  };
  const { w, h } = shareSize[format];

  if (error) return <Notice tone="warn">Couldn't load Wann calls: {error}</Notice>;
  if (!calls) return <div className="flex justify-center py-16"><Spinner /></div>;

  if (stage === "card" && selected.length) return (
    <div className="space-y-4">
      <Button type="button" variant="quiet" onClick={() => setStage("pick")}>Change selection</Button>
      <div ref={previewBox} className="mx-auto w-full max-w-[420px] overflow-hidden rounded-[16px] border border-border" style={{ aspectRatio: `${w} / ${h}` }}>
        <div style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "top left" }}><PromoCalledIt calls={selected} format={format} inline /></div>
      </div>
      <div className="flex rounded-[12px] bg-surface-2 p-1">
        {(["post", "story"] as ShareFormat[]).map((f) => <button key={f} type="button" onClick={() => setFormat(f)} className={`focus-ring flex-1 h-9 rounded-[9px] text-[14px] ${format === f ? "bg-text text-black" : "text-muted"}`}>{f === "post" ? "Post 1080×1350" : "Story 1080×1920"}</button>)}
      </div>
      {format === "post" && selected.length > 6 && <p className="text-[13px] text-muted">{selected.length} games fit on a post in a tighter layout. Story gives each one more room.</p>}
      <div className={`grid gap-3 ${canDownloadDirectly ? "grid-cols-2" : "grid-cols-1"}`}>
        <Button type="button" busy={busy === "share"} onClick={() => go("share")}>{canDownloadDirectly ? "Share" : "Share or save"}</Button>
        {canDownloadDirectly && <Button type="button" variant="ghost" busy={busy === "download"} onClick={() => go("download")}>Download</Button>}
      </div>
      {msg && <p className="text-[13px] text-muted">{msg}</p>}
      <PromoCalledIt cardRef={card} calls={selected} format={format} />
    </div>
  );

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-[17px] font-semibold">Wann report</h2>
        <p className="mt-1.5 text-[14px] text-muted">Pick won calls for a “J × Wann called it” image. One call makes a single card, two or more make a combo, up to {MAX_LEGS}. Times are when Wann made the call.</p>
      </Card>
      {days.length === 0 ? <Empty title="No won calls yet" body="Calls show up here once their game is finished and the call won." /> : days.map((g) => {
        const allIn = g.rows.every((r) => picked.includes(r.id));
        return (
          <section key={g.day} aria-label={g.day}>
            <div className="flex items-center justify-between px-1 pb-2">
              <p className="text-[14px] text-muted">{g.day} <span className="tabular">· {g.rows.length} won</span></p>
              <button type="button" onClick={() => pickDay(g.rows)} disabled={!allIn && full} className="focus-ring rounded-full px-3 h-8 text-[13px] text-muted disabled:opacity-40">{allIn ? "Clear day" : "Select day"}</button>
            </div>
            <Card className="overflow-hidden">
              {g.rows.map((c) => {
                const on = picked.includes(c.id);
                return (
                  <button key={c.id} type="button" role="checkbox" aria-checked={on} disabled={!on && full} onClick={() => toggle(c.id)}
                    className={`focus-ring flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 disabled:opacity-40 ${on ? "bg-surface-2" : ""}`}>
                    <span aria-hidden className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${on ? "chrome-bg text-black" : "border border-chrome-3"}`}>
                      {on && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px]">{c.home} <span className="font-mono tabular">{c.final_score}</span> {c.away}</span>
                      <span className="mt-0.5 block truncate text-[13px] text-muted">{c.pick_label} · <span className="font-mono tabular">{Math.round(c.probability)}%</span> · {c.competition}</span>
                    </span>
                    <span className="shrink-0 text-right text-[11px] leading-tight text-muted">called<span className="block font-mono text-[13px] tabular">{timeOf(calledAt(c))}</span></span>
                  </button>
                );
              })}
            </Card>
          </section>
        );
      })}
      <div className="sticky bottom-3 z-10 flex items-center gap-3 rounded-[16px] border border-border bg-surface/95 p-2 pl-4 backdrop-blur" aria-live="polite">
        <p className="min-w-0 flex-1 text-[14px] leading-tight">{picked.length === 0 ? <span className="text-muted">Pick a won call</span> : <><span className="whitespace-nowrap">{picked.length} picked</span>{full && <span className="block text-[12px] text-muted">That's the most for one card</span>}</>}</p>
        {picked.length > 0 && <Button type="button" variant="quiet" className="!px-3" onClick={() => setPicked([])}>Clear</Button>}
        <Button type="button" className="!px-4 whitespace-nowrap" disabled={!picked.length} onClick={() => { setStage("card"); window.scrollTo?.({ top: 0 }); }}>Make card</Button>
      </div>
    </div>
  );
}
