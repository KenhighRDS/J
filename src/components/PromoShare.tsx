import { useEffect, useRef, useState } from "react";
import { Button, Sheet, Toggle } from "./ui";
import type { ShareFormat } from "./ShareCard";
import { PromoSignal, PromoSignalShots, PromoWann, PromoWins, type SignalShots } from "./PromoCard";
import { loadShots } from "../lib/shots";
import { canDownloadDirectly, renderPng, sharePng, downloadDataUrl } from "../lib/share";
import type { Signal, WannCall } from "../lib/types";

type Subject = { kind: "signal"; signal: Signal } | { kind: "wann"; call: WannCall } | { kind: "wins"; signals: Signal[] };

/** Admin-only share sheet: Hide levels (on for live, off for closed), post / story format, Share or Download. */
export function PromoShare({ subject, open, onClose }: { subject: Subject; open: boolean; onClose: () => void }) {
  const live = subject.kind === "signal" ? subject.signal.status !== "closed" : subject.kind === "wann" ? subject.call.status !== "finished" : false;
  const [hide, setHide] = useState(live);
  const hasShots = subject.kind === "signal" && Boolean(subject.signal.shot_open || subject.signal.shot_close);
  const [withShots, setWithShots] = useState(hasShots);
  const [shots, setShots] = useState<SignalShots | null>(null);
  useEffect(() => {
    if (!open || !hasShots || shots || subject.kind !== "signal") return;
    let alive = true; void loadShots(subject.signal).then((x) => { if (alive) setShots(x); });
    return () => { alive = false; };
  }, [open, hasShots, shots, subject]);
  const useShots = withShots && hasShots;
  const shotsReady = !useShots || (shots != null && Boolean(shots.open || shots.close));
  const [format, setFormat] = useState<ShareFormat>("post");
  const [busy, setBusy] = useState<"share" | "download" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const name = subject.kind === "signal" ? `J-${subject.signal.base_symbol}-${subject.signal.id.slice(0, 6)}` : subject.kind === "wann" ? `wann-${subject.call.home}-${subject.call.away}`.replace(/\s+/g, "-") : "J-recent-wins";
  const go = async (mode: "share" | "download") => {
    if (!ref.current) return; setBusy(mode); setMsg(null);
    try {
      const png = await renderPng(ref.current);
      if (mode === "download" && canDownloadDirectly) downloadDataUrl(png, `${name}-${format}.png`);
      else { const r = await sharePng(png, `${name}-${format}.png`, "J"); if (r === "shared" && !canDownloadDirectly) setMsg("To keep the file, pick Save to Photos, Files or Gallery in the share sheet."); }
    } catch (e) { setMsg(e instanceof Error ? e.message : "Couldn't create the image"); }
    finally { setBusy(null); }
  };
  if (!open) return null;
  return (
    <>
      <Sheet open={open} onClose={onClose} title="Share as image">
        {hasShots && (
          <div className="flex items-center justify-between py-2"><div><p className="text-[15px]">Chart images</p><p className="text-[13px] text-muted">{shots && !shots.open && !shots.close ? "The images could not be loaded" : "Where we opened and where we closed, one card"}</p></div><Toggle on={withShots} onChange={setWithShots} label="Chart images" /></div>
        )}
        {subject.kind !== "wins" && !useShots && (
          <div className="flex items-center justify-between py-2"><div><p className="text-[15px]">Hide levels</p><p className="text-[13px] text-muted">Blur the numbers so a live call can be teased</p></div><Toggle on={hide} onChange={setHide} label="Hide levels" /></div>
        )}
        <div className="mt-2 flex rounded-[12px] bg-surface-2 p-1">
          {(["post", "story"] as ShareFormat[]).map((f) => <button key={f} type="button" onClick={() => setFormat(f)} className={`focus-ring flex-1 h-9 rounded-[9px] text-[14px] ${format === f ? "bg-text text-black" : "text-muted"}`}>{f === "post" ? "Post 1080×1350" : "Story 1080×1920"}</button>)}
        </div>
        <div className={`mt-4 grid gap-3 ${canDownloadDirectly ? "grid-cols-2" : "grid-cols-1"}`}><Button type="button" busy={busy === "share"} disabled={!shotsReady} onClick={() => go("share")}>{canDownloadDirectly ? "Share" : "Share or save"}</Button>{canDownloadDirectly && <Button type="button" variant="ghost" busy={busy === "download"} disabled={!shotsReady} onClick={() => go("download")}>Download</Button>}</div>
        {msg && <p className="mt-3 text-[13px] text-muted">{msg}</p>}
      </Sheet>
      {subject.kind === "signal" && (useShots && shots && (shots.open || shots.close)
        ? <PromoSignalShots cardRef={ref} signal={subject.signal} shots={shots} format={format} />
        : <PromoSignal cardRef={ref} signal={subject.signal} format={format} hideLevels={hide} />)}
      {subject.kind === "wann" && <PromoWann cardRef={ref} call={subject.call} format={format} hideLevels={hide} />}
      {subject.kind === "wins" && <PromoWins cardRef={ref} signals={subject.signals} format={format} />}
    </>
  );
}

export function ShareIconButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label="Share as image" className="focus-ring flex h-11 w-11 items-center justify-center text-muted"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v13M7 8l5-5 5 5" /></svg></button>;
}
