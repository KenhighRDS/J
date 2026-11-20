// tjr-worker: the only door the Python TJR worker has into J. Auth: header X-J-Key holding the worker key an admin
// made in Admin > TJR (only its hash is stored). The worker can report in, take a job, and store runs, trades and
// journal lines. It cannot read members, signals or anything outside the tjr_ tables, and it cannot change the mode,
// the emergency stop or the live lock: those belong to the admin.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { handler, json, readJson, fail } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";

type Row = Record<string, unknown>;
interface Body { action?: string; info?: Row; run?: Row; run_id?: string; trades?: Row[]; events?: Row[]; datasets?: Row[]; job_id?: string; status?: string; note?: string; run_ids?: string[]; patch?: Row }

const RUN_FIELDS = ["kind", "status", "label", "group_id", "version_id", "model", "experimental", "symbol", "trade_symbol", "config", "config_id", "rules_version", "period_from", "period_to", "metrics", "rejected", "curve", "provenance", "extra", "error"];
const PATCH_FIELDS = ["status", "metrics", "rejected", "curve", "extra", "error", "period_to", "label"];
const TRADE_FIELDS = ["seq", "model", "symbol", "side", "qty", "signal_at", "entry_at", "entry", "stop", "target", "target_label", "exit_at", "exit", "exit_reason", "risk_usd", "gross_usd", "costs_usd", "net_usd", "r", "mae", "mfe", "levels", "confirmations", "marks", "partials", "bars", "experimental"];
const MAX_ROWS = 500;

const pick = (o: Row, keys: string[]) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const uuid = (v: unknown, what: string): string => { if (typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v)) fail(400, `${what} must be a run or job id`); return v; };
async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> { const { data, error } = await p; if (error) fail(400, error.message); return data; }
/** A paper or live run may only be written to while the admin has that mode on; a backtest is always allowed. */
async function allowed(sb: SupabaseClient, kind: unknown): Promise<void> {
  if (kind === "backtest" || kind === "walkforward") return;
  const { data } = await sb.from("tjr_state").select("mode,kill,live_unlocked").single();
  if (!data || data.kill) fail(403, "The emergency stop is on");
  if (kind === "paper" && data.mode !== "paper" && data.mode !== "live") fail(403, "Paper trading is switched off in J");
  if (kind === "live" && !(data.mode === "live" && data.live_unlocked)) fail(403, "Live trading is locked in J");
}

Deno.serve(handler(async (req) => {
  if (req.method !== "POST") fail(405, "POST only");
  const key = req.headers.get("x-j-key") ?? "";
  if (!key) fail(401, "Missing X-J-Key");
  const sb = serviceClient();
  const { data: ok } = await sb.rpc("tjr_worker_ok", { p_key: key });
  if (ok !== true) fail(401, "Unknown worker key");
  const b = await readJson<Body>(req);

  switch (b.action) {
    case "state":                      // heartbeat; answers with what the worker must obey
      return json(await must(sb.rpc("tjr_worker_state", { p_info: b.info ?? {} })));
    case "claim":
      return json({ job: await must(sb.rpc("tjr_claim_job")) });
    case "job_done": {
      const status = b.status === "failed" ? "failed" : "done";
      await must(sb.from("tjr_jobs").update({ status, note: String(b.note ?? "").slice(0, 600), run_ids: (b.run_ids ?? []).map((r) => uuid(r, "run_ids")), finished_at: new Date().toISOString() }).eq("id", uuid(b.job_id, "job_id")).eq("status", "running").select("id"));
      return json({ ok: true });
    }
    case "run": {                      // start a record; trades and journal lines follow in batches
      const run = pick(b.run ?? {}, RUN_FIELDS);
      await allowed(sb, run.kind);
      const row = await must(sb.from("tjr_runs").insert({ ...run, finished_at: run.status === "running" ? null : new Date().toISOString() }).select("id").single());
      return json({ run_id: (row as { id: string }).id });
    }
    case "patch": {
      const id = uuid(b.run_id, "run_id");
      const patch = pick(b.patch ?? {}, PATCH_FIELDS);
      await must(sb.from("tjr_runs").update({ ...patch, ...(patch.status && patch.status !== "running" ? { finished_at: new Date().toISOString() } : {}) }).eq("id", id).select("id"));
      return json({ ok: true });
    }
    case "trades": {
      const id = uuid(b.run_id, "run_id");
      const rows = (b.trades ?? []).slice(0, MAX_ROWS).map((t) => ({ ...pick(t, TRADE_FIELDS), run_id: id }));
      if (rows.length) await must(sb.from("tjr_trades").upsert(rows, { onConflict: "run_id,seq" }).select("id"));
      return json({ stored: rows.length });
    }
    case "events": {
      const id = uuid(b.run_id, "run_id");
      const rows = (b.events ?? []).slice(0, MAX_ROWS).map((e) => ({ run_id: id, ts: e.ts, type: String(e.type ?? "note").slice(0, 40), data: e.data ?? {} }));
      if (rows.length) await must(sb.from("tjr_events").insert(rows).select("id"));
      return json({ stored: rows.length });
    }
    case "datasets": {
      const rows = (b.datasets ?? []).slice(0, 20).map((d) => ({ ...pick(d, ["symbol", "source", "first_at", "last_at", "rows", "sha256", "roll_method"]), seen_at: new Date().toISOString() }));
      if (rows.length) await must(sb.from("tjr_datasets").upsert(rows, { onConflict: "symbol" }).select("symbol"));
      return json({ stored: rows.length });
    }
    default:
      fail(400, "Unknown action");
  }
}));
