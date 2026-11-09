// Dev-only fixtures for reviewing screens without a backend:
//   /__preview/signal?state=live|closed   /__preview/wann   /__preview/backtest   /__preview/backtest-card?format=post|story
//   /__preview/wann-report   /__preview/called-it?n=1..8&format=post|story   /__preview/wann?min=90   /__preview/wann-call?state=live|won
//   /__preview/signal-shots?format=post|story&state=closed|live   (images from window.__J_SHOTS, else drawn placeholders)
import { useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { SignalCard } from "../components/SignalCard";
import { WannGallery, type WannRow } from "../components/WannGallery";
import { WannBadge, WannCard } from "../components/WannCard";
import { PromoBacktest } from "../components/PromoCard";
import { PageTitle } from "../components/ui";
import { Backtest } from "./admin/Backtest";
import { WannReport } from "./admin/WannReport";
import { PromoCalledIt } from "../components/PromoCalledIt";
import { PromoSignalShots } from "../components/PromoCard";
import { combineBacktests, type BacktestSummary } from "../lib/backtest";
import type { Profile, Receipt, Signal, WannCall } from "../lib/types";

const profile: Profile = { id: "u", email: "wolf@example.com", name: "Wolf", role: "admin", status: "active", balance: 10000, balance_currency: "USD", risk_pct: 1, balance_source: "manual", last_seen: null, created_at: "" };

const teams = [["Arsenal", "Chelsea", "Premier League"], ["Real Madrid", "Getafe", "La Liga"], ["Bayern München", "Borussia Mönchengladbach", "Bundesliga"], ["Inter", "Lecce", "Serie A"], ["PSG", "Le Havre", "Ligue 1"], ["Ajax", "Heracles", "Eredivisie"], ["Benfica", "Arouca", "Primeira Liga"], ["Celtic", "Ross County", "Scottish Premiership"], ["Galatasaray", "Hatayspor", "Süper Lig"], ["Boca Juniors", "Platense", "Liga Profesional"], ["Flamengo", "Cuiabá", "Brasileirão"], ["Manchester City", "Burnley", "Premier League"]];
const picks: [WannCall["pick"], string][] = [["home", "Arsenal wins"], ["home_or_draw", "Home or draw"], ["away", "Away wins"], ["home", "Home wins"]];
function wannRows(min = 85): WannRow[] {
  const rows: WannRow[] = []; const now = Date.now();
  for (let i = 0; i < 44; i++) {
    const [home, away, competition] = teams[i % teams.length]; const day = Math.floor(i / 9); const hour = 12 + (i % 9) * 1.25;
    const kickoff = new Date(now); kickoff.setDate(kickoff.getDate() + day); kickoff.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);
    const pick = picks[i % picks.length]; const label = pick[1] === "Home wins" || pick[1] === "Arsenal wins" ? `${home} wins` : pick[1] === "Away wins" ? `${away} wins` : `${home} or draw`;
    const call: WannCall = { id: `c${i}`, wann_game_id: i, sport: "Football", competition, home, away, kickoff_utc: kickoff.toISOString(), pick: pick[0], pick_label: label, probability: min + ((i * 7) % (100 - min)), call_type: pick[0].includes("or") ? "win_or_draw" : "straight", status: "live", final_score: null, outcome: null, sent_at: new Date().toISOString(), created_at: new Date().toISOString() };
    const status: Receipt["status"] = i % 11 === 3 ? "taken" : i % 13 === 5 ? "skipped" : "pending";
    rows.push({ id: `r${i}`, signal_id: null, wann_call_id: call.id, user_id: "u", kind: "wann", delivered_at: null, opened_at: null, copied: {}, status, status_source: null, user_lot: null, ring_count: 1, question_sent_at: null, answered_at: null, user_entry: null, user_close: null, user_pips: null, call });
  }
  for (let i = 0; i < 6; i++) {
    const [home, away, competition] = teams[(i + 5) % teams.length]; const kickoff = new Date(now - (i + 1) * 36e5 * 7);
    const won = i % 3 !== 1;
    const call: WannCall = { id: `p${i}`, wann_game_id: 900 + i, sport: "Football", competition, home, away, kickoff_utc: kickoff.toISOString(), pick: "home", pick_label: `${home} wins`, probability: Math.max(min, 88) + i, call_type: "straight", status: i === 4 ? "withdrawn" : "finished", final_score: i === 4 ? null : won ? "2–0" : "1–1", outcome: i === 4 ? null : won ? "won" : "lost", sent_at: kickoff.toISOString(), created_at: kickoff.toISOString() };
    rows.push({ id: `pr${i}`, signal_id: null, wann_call_id: call.id, user_id: "u", kind: "wann", delivered_at: null, opened_at: null, copied: {}, status: i % 2 ? "taken" : "missed", status_source: null, user_lot: null, ring_count: 1, question_sent_at: null, answered_at: null, user_entry: null, user_close: null, user_pips: null, call });
  }
  return rows;
}

/** Finished, won Wann calls over the last three days (newest first), for the Wann report previews. */
function wonCalls(): WannCall[] {
  const games: [string, string, string, string, string][] = [["Arsenal", "Chelsea", "Premier League", "2–0", "Arsenal wins"], ["Real Madrid", "Getafe", "La Liga", "3–1", "Real Madrid wins"], ["Bayern München", "Borussia Mönchengladbach", "Bundesliga", "4–1", "Bayern München wins"], ["Inter", "Lecce", "Serie A", "2–0", "Inter wins"], ["PSG", "Le Havre", "Ligue 1", "3–0", "PSG wins"], ["Ajax", "Heracles", "Eredivisie", "2–2", "Ajax or draw"], ["Benfica", "Arouca", "Primeira Liga", "1–0", "Benfica wins"], ["Celtic", "Ross County", "Scottish Premiership", "3–1", "Celtic wins"], ["Galatasaray", "Hatayspor", "Süper Lig", "2–1", "Galatasaray wins"], ["Boca Juniors", "Platense", "Liga Profesional", "1–0", "Boca Juniors wins"]];
  const base = new Date(); base.setHours(21, 0, 0, 0);
  return games.map(([home, away, competition, score, label], i) => {
    const k = new Date(base.getTime() - (Math.floor(i / 4) * 24 + (i % 4) * 2.5) * 36e5).toISOString();
    return { id: `w${i}`, wann_game_id: 500 + i, sport: "Football", competition, home, away, kickoff_utc: k, pick: label.includes("or draw") ? "home_or_draw" : "home", pick_label: label, probability: 98.4 - i * 1.1, call_type: label.includes("or draw") ? "win_or_draw" : "straight", status: "finished", final_score: score, outcome: "won", sent_at: k, created_at: k, prediction_time: new Date(new Date(k).getTime() - (18 + i) * 36e5).toISOString() };
  });
}

const backtest: BacktestSummary = { platform: "mt5", expert: "Gold Scalper v3", symbol: "XAUUSD", timeframe: "H1", periodStart: "2024-01-01 00:00", periodEnd: "2024-12-31 00:00", currency: "USD", initialDeposit: 10000,
  firstTrade: "2024-01-02 09:00", lastTrade: "2024-12-20 17:45", trades: 312, buys: 160, sells: 152, wins: 190, losses: 122, winRate: 60.9, totalPips: 4812.3, netProfit: 12480.5, profitFactor: 1.92, maxDrawdownPct: 8.4, digits: 2, pipSize: 0.1, pipSizeGuessed: true, baseLot: 0.1, tradesList: [] };

const backtestJpy: BacktestSummary = { ...backtest, expert: "JPY Grid", symbol: "USDJPYm", timeframe: "M5", digits: 3, pipSize: 0.01, baseLot: 0.01, trades: 180, buys: 95, sells: 85, wins: 120, losses: 60, winRate: 66.7, totalPips: 2210.5, netProfit: 3120.4, profitFactor: 1.4, maxDrawdownPct: 12.1, firstTrade: "2024-03-04 08:05", lastTrade: "2024-11-29 21:50" };

export function Preview() {
  const [params] = useSearchParams(); const { pathname } = useLocation();
  const state = params.get("state") ?? "live";
  if (pathname === "/__preview/wann") return <div className="app-frame"><div className="scroll-area"><div className="mx-auto w-full max-w-2xl pb-6"><PageTitle right={<WannBadge />}>Wann</PageTitle><WannGallery rows={wannRows(Number(params.get("min") ?? 85))} now={Date.now()} /></div></div></div>;
  if (pathname === "/__preview/backtest") return <div className="app-frame"><div className="scroll-area"><div className="mx-auto w-full max-w-md pb-6"><PageTitle>Admin</PageTitle><div className="px-4"><Backtest initial={params.get("two") === "1" ? [backtest, backtestJpy] : [backtest]} /></div></div></div></div>;
  if (pathname === "/__preview/signal-shots") {
    const closed = params.get("state") !== "live";
    const given = (window as unknown as { __J_SHOTS?: { open?: string; close?: string } }).__J_SHOTS;
    const s: Signal = { id: "s9", ea_source_id: null, ea_uid: "9", source_name: "J", symbol: "XAUUSDm", base_symbol: "XAUUSD", direction: "buy", order_type: "market", entry: 4182.4, sl: 4161.5, tp: null, ea_lot: 0.2, digits: 2, point: 0.01, pip_size: 0.1,
      tick_size: 0.01, tick_value: 1, contract_size: 100, vol_min: 0.01, vol_step: 0.01, vol_max: 100, account_currency: "USD", status: closed ? "closed" : "live", expires_at: null, triggered_at: null, trigger_price: null,
      closed_at: closed ? new Date(Date.now() - 2 * 36e5).toISOString() : null, close_price: closed ? 4226.9 : null, result_pips: closed ? 445 : null, outcome: closed ? "win" : null, close_reason: closed ? "manual" : null,
      is_test: false, sent_at: new Date(Date.now() - 14 * 36e5).toISOString(), created_at: new Date().toISOString() };
    const shots = given ?? { open: placeholderShot("Nou achte la"), close: closed ? placeholderShot("Nou close la") : null };
    return <PromoSignalShots signal={s} shots={closed ? shots : { open: shots.open }} format={params.get("format") === "story" ? "story" : "post"} inline />;
  }
  if (pathname === "/__preview/wann-call") return <WannCallPreview won={params.get("state") === "won"} />;
  if (pathname === "/__preview/wann-report") return <div className="app-frame"><div className="scroll-area"><div className="mx-auto w-full max-w-md pb-6"><PageTitle>Admin</PageTitle><div className="px-4"><WannReport initial={wonCalls()} /></div></div></div></div>;
  if (pathname === "/__preview/called-it") return <PromoCalledIt calls={wonCalls().slice(0, Number(params.get("n") ?? 1)).reverse()} format={params.get("format") === "story" ? "story" : "post"} inline />;
  if (pathname === "/__preview/backtest-card") return <PromoBacktest result={params.get("two") === "1" ? combineBacktests([backtest, backtestJpy]) : backtest} parts={params.get("two") === "1" ? [backtest, backtestJpy] : undefined} title="J Signal" show={params.get("show") === "cash" ? "cash" : params.get("money") === "1" || params.get("show") === "both" ? "both" : "pips"} format={params.get("format") === "story" ? "story" : "post"} inline />;
  const base: Signal = { id: "s1", ea_source_id: null, ea_uid: "1", source_name: "XAU EA", symbol: "XAUUSDm", base_symbol: "XAUUSD", direction: "buy", order_type: state === "pending" ? "buy_stop" : "market",
    entry: 2341.5, sl: 2335, tp: 2355, ea_lot: 0.5, digits: 2, point: 0.01, pip_size: 0.1, tick_size: 0.01, tick_value: 1, contract_size: 100, vol_min: 0.01, vol_step: 0.01, vol_max: 100, account_currency: "USD",
    status: state === "closed" ? "closed" : "live", expires_at: state === "pending" ? null : new Date(Date.now() + 95_000).toISOString(), triggered_at: null, trigger_price: null, closed_at: null, close_price: state === "closed" ? 2355 : null,
    result_pips: state === "closed" ? 135 : null, outcome: state === "closed" ? "win" : null, close_reason: state === "closed" ? "tp" : null, is_test: false, sent_at: new Date(Date.now() - 25_000).toISOString(), created_at: new Date().toISOString() };
  return <SignalPreview base={base} state={state} />;
}

function WannCallPreview({ won }: { won: boolean }) {
  const kickoff = new Date(Date.now() + (3 * 3600 + 12 * 60 + 40) * 1000).toISOString();
  const call: WannCall = { id: "rm", wann_game_id: 77, sport: "Football", competition: "La Liga", home: "Real Madrid", away: "Getafe", kickoff_utc: kickoff, pick: "home", pick_label: "Real Madrid wins", probability: 94, call_type: "straight",
    status: won ? "finished" : "live", final_score: won ? "3–0" : null, outcome: won ? "won" : null, sent_at: new Date().toISOString(), created_at: new Date().toISOString() };
  const [receipt, setReceipt] = useState<Receipt>({ id: "r", signal_id: null, wann_call_id: "rm", user_id: "u", kind: "wann", delivered_at: null, opened_at: new Date().toISOString(), copied: {}, status: won ? "taken" : "opened", status_source: null, user_lot: null, ring_count: 1, question_sent_at: null, answered_at: null, user_entry: null, user_close: null, user_pips: null });
  return <div className="app-frame"><WannCard call={call} receipt={receipt} onCopy={(f) => setReceipt({ ...receipt, copied: { ...receipt.copied, [f]: "x" } })} onTake={() => setReceipt({ ...receipt, status: "taken" })} onSkip={() => setReceipt({ ...receipt, status: "skipped" })} onClose={() => undefined} /></div>;
}

/** A drawn stand-in for an EA chart image (1200 × 675) when no real one is injected. */
function placeholderShot(label: string): string {
  const c = document.createElement("canvas"); c.width = 1200; c.height = 675; const g = c.getContext("2d")!;
  g.fillStyle = "#0a0a0c"; g.fillRect(0, 0, 1200, 675);
  let p = 340;
  for (let i = 0; i < 70; i++) { const o = p; p += Math.sin(i / 5) * 9 + (i > 40 ? -5 : 2); const x = 40 + i * 15; g.fillStyle = p < o ? "#2fbf71" : "#e5484d"; g.fillRect(x, Math.min(o, p), 9, Math.max(3, Math.abs(p - o))); }
  g.fillStyle = "#f5f5f7"; g.font = "bold 34px Arial"; g.fillText(label, 640, 300);
  return c.toDataURL("image/png");
}

function SignalPreview({ base, state }: { base: Signal; state: string }) {
  const [receipt, setReceipt] = useState<Receipt>({ id: "r", signal_id: "s1", wann_call_id: null, user_id: "u", kind: "ea", delivered_at: null, opened_at: new Date().toISOString(), copied: {}, status: state === "closed" ? "taken" : "opened", status_source: null, user_lot: null, ring_count: 1, question_sent_at: null, answered_at: null, user_entry: null, user_close: null, user_pips: state === "closed" ? 135 : null });
  return (
    <div className="app-frame">
      <SignalCard signal={base} receipt={receipt} profile={profile} events={[]} onCopy={(f) => setReceipt({ ...receipt, copied: { ...receipt.copied, [f]: "x" } })} onTake={() => setReceipt({ ...receipt, status: "taken" })} onSkip={() => setReceipt({ ...receipt, status: "skipped" })} onClose={() => undefined} onSetBalance={() => undefined} />
    </div>
  );
}
