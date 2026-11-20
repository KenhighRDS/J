import { useState } from "react";
import { Button, Card, Field, Notice, Toggle } from "../../../components/ui";
import { supabase } from "../../../lib/supabase";
import { BUILDER, DEFAULT_CONFIG, MODELS, MODEL_NAME, MODEL_TEXT, RULES_VERSION, changes, getPath, nyShort, setPath, type BuilderField, type Model, type TjrStatus, type TjrVersion } from "../../../lib/tjr";
import { Section, Tag, loadStatus, rows, useLoad, type TjrPreview } from "./parts";

/** Strategy builder: start from the engine's defaults, change what you want to test, save it under a name. A saved
 *  version never changes; a new idea is a new version, so every run can say exactly which settings produced it. */
export function Builder({ preview }: { preview?: TjrPreview }) {
  const [cfg, setCfg] = useState<Record<string, unknown>>({ ...DEFAULT_CONFIG });
  const [name, setName] = useState(""), [note, setNote] = useState(""), [busy, setBusy] = useState(""), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const versions = useLoad(() => rows<TjrVersion[]>(supabase.from("tjr_versions").select("id,name,note,config,model,experimental,created_at").order("created_at", { ascending: false })), [], preview ? preview.versions ?? [] : undefined);
  const status = useLoad<TjrStatus | null>(loadStatus, [], preview?.status);
  const model = cfg.model as Model, diff = changes(cfg);
  const set = (path: string, v: unknown) => { setCfg((c) => setPath(c, path, v)); setMsg(null); };
  const call = async (key: string, fn: () => PromiseLike<{ error: { message: string } | null }>, done: string) => {
    if (preview) return;
    setBusy(key); setMsg(null);
    const { error } = await fn();
    setBusy(""); setMsg(error ? { ok: false, text: error.message } : { ok: true, text: done });
    if (!error) { versions.reload(); status.reload(); }
  };
  const save = () => call("save", () => supabase.rpc("tjr_save_version", { p_name: name, p_config: cfg, p_config_id: "", p_rules: RULES_VERSION, p_note: note }), `Saved "${name}"`);
  return (
    <div>
      <p className="px-1 text-[14px] leading-snug text-muted">These are test settings, not the author's own numbers: the source gives a sequence and no figures.</p>
      <Section title="Entry model">
        <div role="radiogroup" aria-label="Entry model" className="overflow-hidden rounded-[16px] border border-border bg-surface">
          {MODELS.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={model === m} onClick={() => set("model", m)} className={`focus-ring flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 ${model === m ? "bg-surface-2" : ""}`}>
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold ${model === m ? "border-text bg-text text-black" : "border-border text-muted"}`}>{m}</span>
              <span className="min-w-0"><span className="block text-[15px]">{MODEL_NAME[m]}{m === "E" && <span className="ml-2 align-middle"><Tag>Experimental</Tag></span>}</span><span className="mt-0.5 block text-[13px] leading-snug text-muted">{MODEL_TEXT[m].replace(/^[^:]+: /, "")}</span></span>
            </button>
          ))}
        </div>
      </Section>
      {BUILDER.map((g) => (
        <Section key={g.title} title={g.title}>
          <Card>{g.fields.map((f) => <Control key={f.path} f={f} value={getPath(cfg, f.path)} onChange={(v) => set(f.path, v)} />)}</Card>
        </Section>
      ))}
      <Section title="Save as a version">
        <Card className="px-4 py-4">
          <p className="text-[14px] leading-snug text-muted">{diff.length === 0 && model === "A" ? "Nothing changed: this is the baseline as specified." : `Model ${model}${diff.length ? `. Changed: ${diff.join("; ")}.` : ", default numbers."}`}</p>
          <Field className="mt-4" label="Name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Wider BOS window" />
          <Field className="mt-3" label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this is worth testing" />
          {msg && <div className="mt-3"><Notice tone={msg.ok ? "ok" : "warn"}>{msg.text}</Notice></div>}
          <div className="mt-4 flex gap-3"><Button full busy={busy === "save"} disabled={!name.trim()} onClick={() => { void save(); }}>Save version</Button><Button variant="ghost" onClick={() => { setCfg({ ...DEFAULT_CONFIG }); setMsg(null); }}>Reset</Button></div>
        </Card>
      </Section>
      <Section title="Saved versions">
        {(versions.data ?? []).length === 0 ? <Card className="px-4 py-5 text-[15px] text-muted">None yet. A saved version can be picked when you run a backtest.</Card> : (
          <Card>{(versions.data ?? []).map((v) => {
            const active = status.data?.active_version_id === v.id, d = changes(v.config);
            return (
              <div key={v.id} className="border-b border-border px-4 py-3 last:border-b-0">
                <div className="flex items-baseline justify-between gap-3"><span className="min-w-0 truncate text-[15px]"><span className="font-semibold">{v.model}</span> {v.name}</span><span className="shrink-0 text-[13px] text-muted">{nyShort(v.created_at)}</span></div>
                <p className="mt-0.5 text-[13px] leading-snug text-muted">{d.length ? d.join("; ") : "Default numbers"}{v.note ? `. ${v.note}` : ""}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {v.experimental && <Tag>Experimental</Tag>}
                  {active ? <Tag tone="ok">Used for paper trading</Tag> : <button type="button" disabled={busy !== ""} onClick={() => { void call(`a${v.id}`, () => supabase.rpc("tjr_set_active", { p_version: v.id }), `"${v.name}" is now the version used for paper trading`); }} className="focus-ring h-8 rounded-full border border-border px-3 text-[13px] text-text disabled:opacity-40">Use for paper trading</button>}
                  <button type="button" onClick={() => { setCfg({ ...DEFAULT_CONFIG, ...v.config }); setName(""); window.scrollTo({ top: 0 }); }} className="focus-ring h-8 rounded-full px-2 text-[13px] text-muted underline">Start from this</button>
                </div>
              </div>
            );
          })}</Card>
        )}
      </Section>
    </div>
  );
}

function Control({ f, value, onChange }: { f: BuilderField; value: unknown; onChange: (v: unknown) => void }) {
  const label = <span className="min-w-0"><span className="block text-[15px]">{f.label}{f.experimental && <span className="ml-2 align-middle"><Tag>Experimental</Tag></span>}</span>{f.hint && <span className="block text-[12px] leading-snug text-muted">{f.hint}</span>}</span>;
  const row = "flex items-center justify-between gap-4 border-b border-border px-4 py-2.5 last:border-b-0 min-h-[52px]";
  if (f.kind === "toggle") return <div className={row}>{label}<Toggle on={Boolean(value)} onChange={onChange} label={f.label} /></div>;
  if (f.kind === "choice") return (
    <div className={`${row} flex-wrap`}>{label}
      <div role="radiogroup" aria-label={f.label} className="flex rounded-full bg-surface-2 p-0.5">{(f.choices ?? []).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)} className={`focus-ring h-8 rounded-full px-3 text-[13px] ${value === k ? "bg-text text-black" : "text-muted"}`}>{l}</button>)}</div>
    </div>
  );
  return (
    <label className={row}>{label}
      <input aria-label={f.label} type={f.kind === "time" ? "time" : "number"} inputMode={f.kind === "number" ? "decimal" : undefined} step={f.step ?? 1} min={f.min} max={f.max} value={String(value ?? "")}
        onChange={(e) => onChange(f.kind === "time" ? e.target.value : e.target.value === "" ? "" : Number(e.target.value))}
        className="focus-ring h-10 w-[104px] shrink-0 rounded-[12px] border border-border bg-surface-2 px-3 text-right font-mono tabular text-[15px] text-text" />
    </label>
  );
}
