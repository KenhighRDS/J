// Signal lifecycle shared by ingest-signal (EA) and admin-send-signal (manual). One code path, idempotent on retries.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { fail } from "./http.ts";
import { dispatchSignal, dispatchFollowUp, dispatchCloseQuestion } from "./dispatch.ts";
import { isTrailOnly, level } from "./levels.ts";
import { decodePngBase64, shotPath } from "./shots.ts";

export type OrderType = "market" | "buy_stop" | "sell_stop" | "buy_limit" | "sell_limit";
export interface IncomingEvent {
  event: "open" | "triggered" | "update" | "move_be" | "partial" | "close" | "cancel" | "shot";
  ea_uid: string; symbol: string; ea?: string;
  direction?: "buy" | "sell"; order_type?: OrderType;
  entry?: number; sl?: number | null; tp?: number | null; ea_lot?: number; expiry_sec?: number;
  digits?: number; point?: number; pip_size?: number; tick_size?: number; tick_value?: number; contract_size?: number;
  vol_min?: number; vol_step?: number; vol_max?: number; account_currency?: string;
  sent_at?: string; price?: number; lots?: number; reason?: "tp" | "sl" | "manual"; profit?: number; test?: boolean;
  kind?: "open" | "close"; png_base64?: string;   // "shot": the chart image at open or close
}
export interface Source { id: string | null; name: string }
export interface ApplyOptions { createdBy?: string; isTest?: boolean; testTargets?: string[] }
interface SignalRow {
  id: string; symbol: string; base_symbol: string; direction: "buy" | "sell"; order_type: OrderType; entry: number; sl: number | null; tp: number | null;
  digits: number; point: number | null; pip_size: number; status: string; trigger_price: number | null; ea_lot: number | null; expires_at: string | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const orderTypeLabel: Record<OrderType, string> = { market: "", buy_stop: "BUY STOP", sell_stop: "SELL STOP", buy_limit: "BUY LIMIT", sell_limit: "SELL LIMIT" };
export function headline(s: Pick<SignalRow, "base_symbol" | "direction" | "order_type">): string {
  return s.order_type === "market" ? `${s.base_symbol} ${s.direction.toUpperCase()}` : `${s.base_symbol} ${orderTypeLabel[s.order_type]}`;
}
const fmt = (v: number | null | undefined, d: number) => (v == null ? "–" : v.toFixed(d));
export function pipsLabel(p: number): string { const r = Math.round(p * 10) / 10; return `${r > 0 ? "+" : ""}${r} pips`; }

export async function applyEvent(sb: SupabaseClient, source: Source, ev: IncomingEvent, opts: ApplyOptions = {}): Promise<{ signal_id: string; action: string; duplicate?: boolean }> {
  if (!ev.event || !ev.ea_uid || !ev.symbol) fail(400, "event, ea_uid and symbol are required");
  const sentAt = ev.sent_at && !Number.isNaN(Date.parse(ev.sent_at)) ? new Date(ev.sent_at).toISOString() : new Date().toISOString();
  const dedupe = `${source.id ?? "manual"}:${ev.ea_uid}:${ev.event}:${sentAt}`;

  let sig: SignalRow | null = null;
  {
    let q = sb.from("signals").select("id,symbol,base_symbol,direction,order_type,entry,sl,tp,digits,point,pip_size,status,trigger_price,ea_lot,expires_at").eq("ea_uid", ev.ea_uid);
    q = source.id ? q.eq("ea_source_id", source.id) : q.is("ea_source_id", null);
    const { data } = await q.maybeSingle();
    sig = data as SignalRow | null;
  }

  if (ev.event === "open") {
    if (sig) return { signal_id: sig.id, action: "open", duplicate: true };
    const direction = ev.direction, orderType = ev.order_type ?? "market", entry = num(ev.entry);
    if (direction !== "buy" && direction !== "sell") fail(400, "direction must be buy or sell");
    if (entry == null) fail(400, "entry is required");
    const digits = num(ev.digits) ?? 5;
    const point = num(ev.point) ?? Math.pow(10, -digits);
    const { data: base } = await sb.rpc("base_symbol", { p_symbol: ev.symbol });
    const baseSymbol = (base as string) || ev.symbol.toUpperCase();
    let pip = num(ev.pip_size);
    if (!pip || pip <= 0) { const { data: p } = await sb.rpc("pip_size_for", { p_base: baseSymbol, p_digits: digits, p_point: point }); pip = Number(p) || point; }
    const { data: overrideStr } = await sb.rpc("setting_json", { p_key: "pip_size_overrides" });
    const override = overrideStr && typeof overrideStr === "object" ? (overrideStr as Record<string, number>)[baseSymbol] : undefined;
    if (override) pip = Number(override);
    let expiresAt: string | null = null;
    if (orderType === "market") {
      let sec = num(ev.expiry_sec) ?? 0;
      if (sec <= 0) { const { data: d } = await sb.rpc("setting_num", { p_key: "market_expiry_sec", p_default: 120 }); sec = Number(d) || 120; }
      expiresAt = new Date(Date.now() + sec * 1000).toISOString();
    }
    const isTest = Boolean(opts.isTest ?? ev.test);
    const { data: ins, error } = await sb.from("signals").insert({
      ea_source_id: source.id, ea_uid: ev.ea_uid, source_name: source.name, symbol: ev.symbol, base_symbol: baseSymbol, direction, order_type: orderType,
      entry, sl: level(ev.sl), tp: level(ev.tp), ea_lot: num(ev.ea_lot), digits, point, pip_size: pip,
      tick_size: num(ev.tick_size), tick_value: num(ev.tick_value), contract_size: num(ev.contract_size),
      vol_min: num(ev.vol_min) ?? 0.01, vol_step: num(ev.vol_step) ?? 0.01, vol_max: num(ev.vol_max) ?? 100, account_currency: ev.account_currency ?? null,
      status: "live", expires_at: expiresAt, is_test: isTest, test_targets: opts.testTargets ?? [], created_by: opts.createdBy ?? null, sent_at: sentAt,
    }).select("id").single();
    if (error) {
      if (error.code === "23505") { const { data: again } = await sb.from("signals").select("id").eq("ea_uid", ev.ea_uid).maybeSingle(); return { signal_id: again?.id, action: "open", duplicate: true }; }
      fail(500, error.message);
    }
    await sb.from("signal_events").insert({ signal_id: ins.id, type: "open", payload: ev as unknown as Record<string, unknown>, dedupe_key: dedupe });
    await sb.rpc("signal_create_receipts", { p_signal: ins.id });
    await sb.from("receipts").update({ delivered_at: new Date().toISOString() }).eq("signal_id", ins.id);
    await dispatchSignal(sb, ins.id);
    return { signal_id: ins.id, action: "open" };
  }

  if (!sig) fail(404, `Unknown signal ${ev.ea_uid} for ${source.name}`);
  if (ev.event === "shot") return await attachShot(sb, sig.id, ev);
  const { error: evErr } = await sb.from("signal_events").insert({ signal_id: sig.id, type: ev.event, payload: ev as unknown as Record<string, unknown>, dedupe_key: dedupe });
  if (evErr) { if (evErr.code === "23505") return { signal_id: sig.id, action: ev.event, duplicate: true }; fail(500, evErr.message); }
  const d = sig.digits, head = headline(sig), dirWord = sig.direction.toUpperCase();

  if (ev.event === "triggered") {
    const price = num(ev.price) ?? sig.entry;
    await sb.from("signals").update({ status: "triggered", triggered_at: new Date().toISOString(), trigger_price: price }).eq("id", sig.id).in("status", ["live"]);
    await sb.rpc("receipts_resolve", { p_signal: sig.id, p_call: null });
    await dispatchFollowUp(sb, sig.id, { type: "triggered", title: `${head} triggered`, body: `${head} triggered at ${fmt(price, d)}`, style: "call", ringSec: 30 });
    return { signal_id: sig.id, action: "triggered" };
  }
  if (ev.event === "update" || ev.event === "move_be") {
    const sl = level(ev.sl), tp = level(ev.tp), entry = num(ev.entry);
    const patch: Record<string, unknown> = {};
    if (ev.sl !== undefined) patch.sl = sl; if (ev.tp !== undefined) patch.tp = tp;   // 0 / null from MT5 clears the level
    if (entry != null && sig.order_type !== "market" && sig.status === "live") patch.entry = entry;
    const effEntry = sig.trigger_price ?? sig.entry;
    const be = ev.event === "move_be" || (sl != null && Math.abs(sl - effEntry) <= (sig.point ?? Math.pow(10, -d)) * 1.0001);
    if (Object.keys(patch).length) await sb.from("signals").update(patch).eq("id", sig.id);
    const newSl = ev.sl !== undefined ? sl : sig.sl, newTp = ev.tp !== undefined ? tp : sig.tp;
    if (!be && isTrailOnly(sig.direction, sig.sl, newSl, sig.tp, ev.tp !== undefined ? tp : undefined)) {
      // trailing stop: a quiet notification, no ring (the EA already merges these to one per few minutes)
      await dispatchFollowUp(sb, sig.id, { type: "update", title: `Trail SL to ${fmt(newSl, d)}`, body: `${sig.base_symbol} ${dirWord}: move your stop to ${fmt(newSl, d)}`, style: "normal" });
      return { signal_id: sig.id, action: "update" };
    }
    const f = be
      ? { type: "move_be", title: "Move SL to breakeven", body: `Move SL to breakeven — ${sig.base_symbol} ${dirWord}` }
      : { type: "update", title: `New SL ${fmt(newSl, d)} · TP ${fmt(newTp, d)}`, body: `New SL ${fmt(newSl, d)} · TP ${fmt(newTp, d)} — ${sig.base_symbol} ${dirWord}` };
    await dispatchFollowUp(sb, sig.id, { ...f, style: "call", ringSec: 30 });
    return { signal_id: sig.id, action: be ? "move_be" : "update" };
  }
  if (ev.event === "partial") {
    const lots = num(ev.lots), total = sig.ea_lot;
    const body = lots != null && total ? `Close ${lots >= total / 2 - 1e-9 && lots <= total / 2 + 1e-9 ? "half" : `${lots}`} (${lots} of ${total}) — ${sig.base_symbol} ${dirWord}` : `Partial close — ${sig.base_symbol} ${dirWord}`;
    await dispatchFollowUp(sb, sig.id, { type: "partial", title: "Partial close", body, style: "call", ringSec: 30 });
    return { signal_id: sig.id, action: "partial" };
  }
  if (ev.event === "close") {
    if (sig.status === "closed") return { signal_id: sig.id, action: "close", duplicate: true };
    const price = num(ev.price) ?? sig.entry;
    const reason = ev.reason === "tp" || ev.reason === "sl" ? ev.reason : "manual";
    const effEntry = sig.trigger_price ?? sig.entry;
    const pips = ((price - effEntry) / sig.pip_size) * (sig.direction === "buy" ? 1 : -1);
    const outcome = Math.abs(pips) <= 1 ? "be" : pips > 0 ? "win" : "loss";
    await sb.from("signals").update({ status: "closed", closed_at: new Date().toISOString(), close_price: price, result_pips: Math.round(pips * 10) / 10, outcome, close_reason: reason }).eq("id", sig.id);
    await sb.rpc("receipts_resolve", { p_signal: sig.id, p_call: null });
    if (reason === "manual") {
      await dispatchFollowUp(sb, sig.id, { type: "close", title: `Close now — ${sig.base_symbol} ${dirWord}`, body: `Close now — ${sig.base_symbol} ${dirWord} at ${fmt(price, d)}`, style: "call", ringSec: 60 });
    } else {
      const hit = reason.toUpperCase();
      await dispatchFollowUp(sb, sig.id, { type: "close", title: `${sig.base_symbol} ${dirWord} hit ${hit} · ${pipsLabel(pips)}`, body: `${sig.base_symbol} ${dirWord} hit ${hit} · ${pipsLabel(pips)}`, style: "normal" });
    }
    const q = reason === "manual" ? `${sig.base_symbol} ${dirWord} closed at ${fmt(price, d)} (${pipsLabel(pips)}) — did you catch it?` : `${sig.base_symbol} ${dirWord} hit ${reason.toUpperCase()} ${pipsLabel(pips)} — did you catch it?`;
    await dispatchCloseQuestion(sb, sig.id, q);
    return { signal_id: sig.id, action: "close" };
  }
  if (ev.event === "cancel") {
    if (sig.status !== "live") return { signal_id: sig.id, action: "cancel", duplicate: true };
    await sb.from("signals").update({ status: "cancelled", closed_at: new Date().toISOString() }).eq("id", sig.id);
    await dispatchFollowUp(sb, sig.id, { type: "cancel", title: `Cancel your ${head}`, body: `Cancel your ${head}`, style: "call", ringSec: 60 });
    await sb.rpc("receipts_resolve", { p_signal: sig.id, p_call: null });
    return { signal_id: sig.id, action: "cancel" };
  }
  fail(400, `Unknown event ${String(ev.event)}`);
}

/** The EA's chart image at open or close: stored privately (trade-shots bucket) and linked on the signal. Not an event row. */
async function attachShot(sb: SupabaseClient, signalId: string, ev: IncomingEvent): Promise<{ signal_id: string; action: string }> {
  const kind = ev.kind === "open" || ev.kind === "close" ? ev.kind : fail(400, "kind must be open or close");
  const bytes = decodePngBase64(ev.png_base64);
  if (!bytes) fail(400, "png_base64 must be a PNG of at most 3 MB");
  const path = shotPath(signalId, kind);
  const { error } = await sb.storage.from("trade-shots").upload(path, bytes, { contentType: "image/png", upsert: true });
  if (error) fail(500, `storage: ${error.message}`);
  await sb.from("signals").update(kind === "open" ? { shot_open: path } : { shot_close: path }).eq("id", signalId);
  return { signal_id: signalId, action: `shot:${kind}` };
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
