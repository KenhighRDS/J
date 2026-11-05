import { useRef, useState } from "react";
import { Button, Sheet, Toggle } from "./ui";
import type { ShareFormat } from "./ShareCard";
import { PromoSignal, PromoWann, PromoWins } from "./PromoCard";
import { renderPng, sharePng, downloadDataUrl } from "../lib/share";
import type { Signal, WannCall } from "../lib/types";

type Subject = { kind: "signal"; signal: Signal } | { kind: "wann"; call: WannCall } | { kind: "wins"; signals: Signal[] };

/** Admin-only share sheet: Hide levels (on for live, off for closed), post / story format, Share or Download. */
export function PromoShare({ subject, open, onClose }: { subject: Subject; open: boolean; onClose: () => void }) {
  const live = subject.kind === "signal" ? subject.signal.status !== "closed" : subject.kind === "wann" ? subject.call.status !== "finished" : false;
  const [hide, setHide] = useState(live);
  const [format, setFormat] = useState<ShareFormat>("post");
  const [busy, setBusy] = useState<"share" | "download" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const name = subject.kind === "signal" ? `J-${subject.signal.base_symbol}-${subject.signal.id.slice(0, 6)}` : subject.kind === "wann" ? `wann-${subject.call.home}-${subject.call.away}`.replace(/\s+/g, "-") : "J-recent-wins";
  const go = async (mode: "share" | "download") => {
    if (!ref.current) return; setBusy(mode);
    try { const png = await renderPng(ref.current); if (mode === "share") await sharePng(png, `${name}-${format}.png`, "J"); else downloadDataUrl(png, `${name}-${format}.png`); }
    finally { setBusy(null); }
  };
  if (!open) return null;
  return (
    <>
      <Sheet open={open} onClose={onClose} title="Share as image">
        {subject.kind !== "wins" && (
          <div className="flex items-center justify-between py-2"><div><p className="text-[15px]">Hide levels</p><p className="text-[13px] text-muted">Blur the numbers so a live call can be teased</p></div><Toggle on={hide} onChange={setHide} label="Hide levels" /></div>
        )}
        <div className="mt-2 flex rounded-[12px] bg-surface-2 p-1">
          {(["post", "story"] as ShareFormat[]).map((f) => <button key={f} type="button" onClick={() => setFormat(f)} className={`focus-ring flex-1 h-9 rounded-[9px] text-[14px] ${format === f ? "bg-text text-black" : "text-muted"}`}>{f === "post" ? "Post 1080×1350" : "Story 1080×1920"}</button>)}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3"><Button type="button" busy={busy === "share"} onClick={() => go("share")}>Share</Button><Button type="button" variant="ghost" busy={busy === "download"} onClick={() => go("download")}>Download</Button></div>
      </Sheet>
      {subject.kind === "signal" && <PromoSignal cardRef={ref} signal={subject.signal} format={format} hideLevels={hide} />}
      {subject.kind === "wann" && <PromoWann cardRef={ref} call={subject.call} format={format} hideLevels={hide} />}
      {subject.kind === "wins" && <PromoWins cardRef={ref} signals={subject.signals} format={format} />}
    </>
  );
}

export function ShareIconButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label="Share as image" className="focus-ring flex h-11 w-11 items-center justify-center text-muted"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v13M7 8l5-5 5 5" /></svg></button>;
}
