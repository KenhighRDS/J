import { useState } from "react";
import { Button, Card, Field, Notice } from "../../../components/ui";
import { copyText } from "../../../lib/clipboard";
import { supabase, supabaseUrl } from "../../../lib/supabase";
import { LIVE_PHRASE, nyDay, type TjrDataset } from "../../../lib/tjr";
import { Figure, Section, loadStatus, rows, useLoad, type TjrPreview } from "./parts";

function Copy({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={() => { void copyText(value).then((ok) => { if (ok) { setDone(true); window.setTimeout(() => setDone(false), 1400); } }); }} className="focus-ring block w-full border-b border-border px-4 py-3 text-left last:border-b-0 active:bg-surface-2" aria-label={`Copy ${label}`}>
      <span className="flex items-baseline justify-between gap-3"><span className="text-[13px] text-muted">{label}</span><span className="shrink-0 text-[13px] text-muted">{done ? "Copied" : "Copy"}</span></span>
      <span className="mt-0.5 block break-all font-mono text-[13px] leading-snug">{value}</span>
    </button>
  );
}

/** Setup: the worker's key and how to start it, the price files it holds, and the lock on live trading. */
export function Setup({ preview }: { preview?: TjrPreview }) {
  const status = useLoad(loadStatus, [], preview?.status);
  const data = useLoad(() => rows<TjrDataset[]>(supabase.from("tjr_datasets").select("*").order("symbol")), [], preview ? preview.datasets ?? [] : undefined);
  const [key, setKey] = useState<string | null>(null), [phrase, setPhrase] = useState(""), [busy, setBusy] = useState(""), [err, setErr] = useState<string | null>(null);
  const s = status.data, url = `${supabaseUrl}/functions/v1/tjr-worker`;
  const call = async (k: string, fn: () => PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
    if (preview) return null;
    setBusy(k); setErr(null);
    const { data: d, error } = await fn();
    setBusy(""); if (error) setErr(error.message); status.reload();
    return error ? null : d;
  };
  if (!s) return <p className="px-1 py-8 text-[14px] text-muted">{status.error ?? "Loading…"}</p>;
  return (
    <div>
      <p className="px-1 text-[14px] leading-snug text-muted">The strategy runs in a small Python program, the worker, on a computer you choose. It connects out to J; J never connects to it.</p>

      <Section title="Worker">
        <Card>
          <Figure label="Key">{s.has_worker_key ? "made" : "none yet"}</Figure>
          <Figure label="Connection">{s.worker_online ? <span className="text-buy">Online</span> : "Not connected"}</Figure>
        </Card>
        {key ? (
          <div className="mt-3">
            <Notice tone="ok">This key is shown once. Put it on the worker's computer now; J keeps only a fingerprint of it.</Notice>
            <Card className="mt-3"><Copy label="J_TJR_KEY" value={key} /><Copy label="J_TJR_URL" value={url} /><Copy label="Start the worker (from the tjr folder)" value="python -m jtjr worker --data NQ=data/NQ.csv ES=data/ES.csv" /></Card>
          </div>
        ) : (
          <div className="mt-3"><Button variant="ghost" full busy={busy === "key"} onClick={() => { void call("key", () => supabase.rpc("tjr_new_worker_key")).then((d) => { if (typeof d === "string") setKey(d); }); }}>{s.has_worker_key ? "Make a new key" : "Make the worker key"}</Button></div>
        )}
        <p className="mt-2 px-1 text-[13px] leading-snug text-muted">{s.has_worker_key && !key ? "A new key replaces the old one, which stops working at once. " : ""}The key lets the worker store runs and take jobs. It cannot change the mode, clear the emergency stop or open the live lock.</p>
      </Section>

      <Section title="Price files on the worker">
        {(data.data ?? []).length === 0 ? <Card className="px-4 py-5 text-[15px] text-muted">The worker has not reported any file yet.</Card> : (
          <Card>{(data.data ?? []).map((d) => <Figure key={d.symbol} label={d.symbol} sub={`${d.rows.toLocaleString("en-US")} one-minute bars`}><span className="font-sans text-[14px]">{d.first_at && d.last_at ? `${nyDay(d.first_at)} to ${nyDay(d.last_at)}` : "–"}</span><span className="block font-sans text-[12px] text-muted">{d.source}</span></Figure>)}</Card>
        )}
        <p className="mt-2 px-1 text-[13px] leading-snug text-muted">Price data is licensed for your own use. It stays on the worker and in this admin section; members never see it.</p>
      </Section>

      <Section title="Live trading">
        {s.live_unlocked ? (
          <>
            <Notice tone="warn"><b>The live lock is open.</b> Choosing Live on the desk would send real orders, if the worker has a broker connection and its own switch is on.</Notice>
            <div className="mt-3"><Button variant="ghost" full busy={busy === "lock"} onClick={() => { void call("lock", () => supabase.rpc("tjr_lock_live")); }}>Lock live trading again</Button></div>
          </>
        ) : (
          <Card className="px-4 py-4">
            <p className="text-[15px]">Locked.</p>
            <p className="mt-1 text-[14px] leading-snug text-muted">Real orders need three things at once: this lock opened here, Live chosen on the desk, and a separate switch on the worker's own computer. The worker has no broker connection yet, so opening the lock sends nothing by itself.</p>
            <p className="mt-3 text-[14px] leading-snug text-muted">The backtests so far show no edge. Read them before opening this.</p>
            <Field className="mt-4" label={`Type ${LIVE_PHRASE} to open the lock`} value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
            <div className="mt-3"><Button variant="danger" full busy={busy === "unlock"} disabled={phrase !== LIVE_PHRASE || s.kill} onClick={() => { void call("unlock", () => supabase.rpc("tjr_unlock_live", { p_phrase: phrase })).then(() => setPhrase("")); }}>Open the live lock</Button></div>
            {s.kill && <p className="mt-2 text-[13px] text-sell">The emergency stop is on. Clear it on the desk first.</p>}
          </Card>
        )}
        {err && <div className="mt-3"><Notice tone="warn">{err}</Notice></div>}
      </Section>

      <Section title="Where the details are">
        <Card>
          <Figure label="The rules, and what is a guess"><span className="font-sans text-[13px]">docs/tjr/strategy-spec.md</span></Figure>
          <Figure label="Results so far"><span className="font-sans text-[13px]">docs/tjr/results.md</span></Figure>
          <Figure label="Data, broker and hosting costs"><span className="font-sans text-[13px]">docs/tjr/providers.md</span></Figure>
        </Card>
      </Section>
    </div>
  );
}
