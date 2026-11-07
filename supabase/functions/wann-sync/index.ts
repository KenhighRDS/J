// wann-sync: pulls j-feed from the wann project every 15 minutes (cron key) or on demand by an admin
// ({ catchup_user?: uuid } sends every live call in the window to one user who was just switched on).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handler, json, readJson, fail, isCronCall } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { dispatchWannBatch, dispatchWannUpdate, dispatchWannQuestion } from "../_shared/dispatch.ts";

interface FeedCall { game_id: number; sport: string; competition: string; home: string; away: string; kickoff_utc: string; status: string; pick: string; pick_label: string; probability: number; call_type: "straight" | "win_or_draw"; model_version: string; prediction_time: string }
interface FeedUpdate { game_id: number; status: string; kickoff_utc: string; still_clears: boolean; current: Pick<FeedCall, "pick" | "pick_label" | "probability" | "call_type" | "model_version" | "prediction_time"> | null; result: { home_ft: number; away_ft: number; outcome: "home" | "draw" | "away" } | null }
interface Feed { calls: FeedCall[]; updates: FeedUpdate[] }

const pickWon = (pick: string, outcome: "home" | "draw" | "away") =>
  pick === outcome || (pick === "home_or_draw" && outcome !== "away") || (pick === "away_or_draw" && outcome !== "home");

Deno.serve(handler(async (req) => {
  const sb = serviceClient();
  const isCron = await isCronCall(req);
  let body: { catchup_user?: string } = {};
  try { body = await readJson(req); } catch { body = {}; }
  if (!isCron) await requireAdmin(req);

  const feedUrl = Deno.env.get("WANN_FEED_URL") ?? "https://nuwnrrkfvhhirlgftqfq.supabase.co/functions/v1/j-feed";
  const feedKey = Deno.env.get("J_FEED_KEY");
  if (!feedKey) fail(500, "Missing secret J_FEED_KEY");
  const { data: windowSetting } = await sb.rpc("setting_num", { p_key: "wann_window_days", p_default: 7 });
  const windowDays = Number(windowSetting) || 7;
  const { data: minSetting } = await sb.rpc("setting_num", { p_key: "wann_min_probability", p_default: 85 });
  const minProb = Math.min(99, Math.max(50, Number(minSetting) || 85));   // admin setting: only calls at or above this

  if (body.catchup_user) {
    const { data: live } = await sb.from("wann_calls").select("id").eq("status", "live").gte("kickoff_utc", new Date().toISOString());
    const ids = (live ?? []).map((c: { id: string }) => c.id);
    for (const id of ids) await sb.rpc("wann_create_receipts", { p_call: id, p_only_user: body.catchup_user });
    const r = await dispatchWannBatch(sb, ids, body.catchup_user);
    return json({ catchup: ids.length, ...r });
  }

  const { data: held } = await sb.from("wann_calls").select("id,wann_game_id,status,pick,probability,home,away").in("status", ["live"]);
  const knownIds = (held ?? []).map((c: { wann_game_id: number }) => c.wann_game_id);
  const res = await fetch(feedUrl, { method: "POST", headers: { "Content-Type": "application/json", "x-j-feed-key": feedKey }, body: JSON.stringify({ window_days: windowDays, known_game_ids: knownIds }) });
  if (!res.ok) fail(502, `j-feed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const feed = (await res.json()) as Feed;

  // new calls
  const newIds: string[] = [];
  for (const c of feed.calls) {
    if (c.probability < minProb) continue;
    const { data: existing } = await sb.from("wann_calls").select("id").eq("wann_game_id", c.game_id).maybeSingle();
    if (existing) continue;
    const { data: ins } = await sb.from("wann_calls").insert({ wann_game_id: c.game_id, sport: c.sport, competition: c.competition, home: c.home, away: c.away, kickoff_utc: c.kickoff_utc, pick: c.pick, pick_label: c.pick_label, probability: c.probability, call_type: c.call_type, model_version: c.model_version, prediction_time: c.prediction_time, status: "live", sent_at: new Date().toISOString() }).select("id").single();
    if (ins) { await sb.rpc("wann_create_receipts", { p_call: ins.id, p_only_user: null }); newIds.push(ins.id); }
  }
  const sent = newIds.length ? await dispatchWannBatch(sb, newIds, null) : { sent: 0 };

  // changes and results for held calls
  let withdrawn = 0, finished = 0;
  for (const u of feed.updates) {
    const h = (held ?? []).find((c: { wann_game_id: number }) => c.wann_game_id === u.game_id) as { id: string; pick: string; probability: number; home: string; away: string } | undefined;
    if (!h) continue;
    const isFinal = ["finished", "awarded"].includes(u.status) && u.result;
    if (isFinal && u.result) {
      const outcome = pickWon(h.pick, u.result.outcome) ? "won" : "lost";
      const score = `${u.result.home_ft}–${u.result.away_ft}`;
      await sb.from("wann_calls").update({ status: "finished", outcome, final_score: score, finished_at: new Date().toISOString() }).eq("id", h.id);
      await sb.rpc("receipts_resolve", { p_signal: null, p_call: h.id });
      const who = h.pick.startsWith("home") ? h.home : h.pick.startsWith("away") ? h.away : "Draw";
      await dispatchWannUpdate(sb, h.id, "finished", `${h.home} ${score} ${h.away}`, `${who} · ${outcome === "won" ? "Won ✓" : "Lost"}`);
      await dispatchWannQuestion(sb, h.id, `${h.home} ${score} ${h.away} — ${outcome === "won" ? "won" : "lost"}. Did you take it?`);
      finished++;
      continue;
    }
    if (["cancelled", "abandoned", "suspended"].includes(u.status)) {
      await sb.from("wann_calls").update({ status: "finished", outcome: "void", finished_at: new Date().toISOString() }).eq("id", h.id);
      await dispatchWannUpdate(sb, h.id, "withdrawn", `Wann update: ${h.home} vs ${h.away}`, `Game ${u.status} — call void.`);
      continue;
    }
    const clears = u.still_clears && u.current != null && u.current.probability >= minProb;
    if (new Date(u.kickoff_utc).getTime() > Date.now() && (!clears || (u.current && u.current.pick !== h.pick))) {
      await sb.from("wann_calls").update({ status: "withdrawn", withdrawn_at: new Date().toISOString() }).eq("id", h.id);
      await sb.rpc("receipts_resolve", { p_signal: null, p_call: h.id });
      const now = u.current ? `${u.current.pick_label} now ${u.current.probability}%` : `now below ${minProb}%`;
      await dispatchWannUpdate(sb, h.id, "withdrawn", `Wann update: ${h.home} vs ${h.away}`, `${now} — call withdrawn.`);
      withdrawn++;
      continue;
    }
    if (u.current && u.current.probability !== h.probability) await sb.from("wann_calls").update({ probability: u.current.probability, prediction_time: u.current.prediction_time, model_version: u.current.model_version }).eq("id", h.id);
    if (u.kickoff_utc) await sb.from("wann_calls").update({ kickoff_utc: u.kickoff_utc }).eq("id", h.id);
  }
  return json({ new: newIds.length, pushed: sent.sent, withdrawn, finished, feed_calls: feed.calls.filter((c) => c.probability >= minProb).length, min_probability: minProb });
}));
