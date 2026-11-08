// Dev-only fixtures for reviewing screens without a backend:
//   /__preview/signal?state=live|closed   /__preview/wann   /__preview/backtest   /__preview/backtest-card?format=post|story
//   /__preview/wann-report   /__preview/called-it?n=1..8&format=post|story
import { useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { SignalCard } from "../components/SignalCard";
import { WannGallery, type WannRow } from "../components/WannGallery";
import { WannBadge } from "../components/WannCard";
import { PromoBacktest } from "../components/PromoCard";
import { PageTitle } from "../components/ui";
import { Backtest } from "./admin/Backtest";
import { WannReport } from "./admin/WannReport";
import { PromoCalledIt } from "../components/PromoCalledIt";
import type { BacktestSummary } from "../lib/backtest";
import type { Profile, Receipt, Signal, WannCall } from "../lib/types";

const profile: Profile = { id: "u", email: "wolf@example.com", name: "Wolf", role: "admin", status: "active", balance: 10000, balance_currency: "USD", risk_pct: 1, balance_source: "manual", last_seen: null, created_at: "" };

const teams = [["Arsenal", "Chelsea", "Premier League"], ["Real Madrid", "Getafe", "La Liga"], ["Bayern München", "Borussia Mönchengladbach", "Bundesliga"], ["Inter", "Lecce", "Serie A"], ["PSG", "Le Havre", "Ligue 1"], ["Ajax", "Heracles", "Eredivisie"], ["Benfica", "Arouca", "Primeira Liga"], ["Celtic", "Ross County", "Scottish Premiership"], ["Galatasaray", "Hatayspor", "Süper Lig"], ["Boca Juniors", "Platense", "Liga Profesional"], ["Flamengo", "Cuiabá", "Brasileirão"], ["Manchester City", "Burnley", "Premier League"]];
const picks: [WannCall["pick"], string][] = [["home", "Arsenal wins"], ["home_or_draw", "Home or draw"], ["away", "Away wins"], ["home", "Home wins"]];
function wannRows(): WannRow[] {
  const rows: WannRow[] = []; const now = Date.now();
  for (let i = 0; i < 44; i++) {
    const [home, away, competition] = teams[i % teams.length]; const day = Math.floor(i / 9); const hour = 12 + (i % 9) * 1.25;
    const kickoff = new Date(now); kickoff.setDate(kickoff.getDate() + day); kickoff.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);
    const pick = picks[i % picks.length]; const label = pick[1] === "Home wins" || pick[1] === "Arsenal wins" ? `${home} wins` : pick[1] === "Away wins" ? `${away} wins` : `${home} or draw`;
    const call: WannCall = { id: `c${i}`, wann_game_id: i, sport: "Football", competition, home, away, kickoff_utc: kickoff.toISOString(), pick: pick[0], pick_label: label, probability: 85 + ((i * 7) % 13), call_type: pick[0].includes("or") ? "win_or_draw" : "straight", status: "live", final_score: null, outcome: null, sent_at: new Date().toISOString(), created_at: new Date().toISOString() };
    const status: Receipt["status"] = i % 11 === 3 ? "taken" : i % 13 === 5 ? "skipped" : "pending";
    rows.push({ id: `r${i}`, signal_id: null, wann_call_id: call.id, user_id: "u", kind: "wann", delivered_at: null, opened_at: null, copied: {}, status, status_source: null, user_lot: null, ring_count: 1, question_sent_at: null, answered_at: null, user_entry: null, user_close: null, user_pips: null, call });
  }
  for (let i = 0; i < 6; i++) {
    const [home, away, competition] = teams[(i + 5) % teams.length]; const kickoff = new Date(now - (i + 1) * 36e5 * 7);
    const won = i % 3 !== 1;
    const call: WannCall = { id: `p${i}`, wann_game_id: 900 + i, sport: "Football", competition, home, away, kickoff_utc: kickoff.toISOString(), pick: "home", pick_label: `${home} wins`, probability: 88 + i, call_type: "straight", status: i === 4 ? "withdrawn" : "finished", final_score: i === 4 ? null : won ? "2–0" : "1–1", outcome: i === 4 ? null : won ? "won" : "lost", sent_at: kickoff.toISOString(), created_at: kickoff.toISOString() };
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
    return { id: `w${i}`, wann_game_id: 500 + i, sport: "Football", competition, home, away, kickoff_utc: k, pick: label.includes("or draw") ? "home_or_draw" : "home", pick_label: label, probability: 98.4 - i * 1.1, call_type: label.includes("or draw") ? "win_or_draw" : "straight", status: "finished", final_score: score, outcome: "won", sent_at: k, created_at: k };
  });
}

const backtest: BacktestSummary = { platform: "mt5", expert: "Gold Scalper v3", symbol: "XAUUSD", timeframe: "H1", periodStart: "2024-01-01 00:00", periodEnd: "2024-12-31 00:00", currency: "USD", initialDeposit: 10000,
  firstTrade: "2024-01-02 09:00", lastTrade: "2024-12-20 17:45", trades: 312, buys: 160, sells: 152, wins: 190, losses: 122, winRate: 60.9, totalPips: 4812.3, netProfit: 12480.5, profitFactor: 1.92, maxDrawdownPct: 8.4, digits: 2, pipSize: 0.1, pipSizeGuessed: true, baseLot: 0.1, tradesList: [] };

export function Preview() {
  const [params] = useSearchParams(); const { pathname } = useLocation();
  const state = params.get("state") ?? "live";
  if (pathname === "/__preview/wann") return <div className="app-frame"><div className="scroll-area"><div className="mx-auto w-full max-w-2xl pb-6"><PageTitle right={<WannBadge />}>Wann</PageTitle><WannGallery rows={wannRows()} now={Date.now()} /></div></div></div>;
  if (pathname === "/__preview/backtest") return <div className="app-frame"><div className="scroll-area"><div className="mx-auto w-full max-w-md pb-6"><PageTitle>Admin</PageTitle><div className="px-4"><Backtest initial={params.get("two") === "1" ? [backtest, { ...backtest, expert: "JPY Grid", symbol: "USDJPY", timeframe: "M5", digits: 3, pipSize: 0.01, baseLot: 0.01, trades: 180, buys: 95, sells: 85, wins: 120, losses: 60, winRate: 66.7, totalPips: 2210.5, netProfit: 3120.4, profitFactor: 1.4, maxDrawdownPct: 12.1, firstTrade: "2024-03-04 08:05", lastTrade: "2024-11-29 21:50" }] : [backtest]} /></div></div></div></div>;
  if (pathname === "/__preview/wann-report") return <div className="app-frame"><div className="scroll-area"><div className="mx-auto w-full max-w-md pb-6"><PageTitle>Admin</PageTitle><div className="px-4"><WannReport initial={wonCalls()} /></div></div></div></div>;
  if (pathname === "/__preview/called-it") return <PromoCalledIt calls={wonCalls().slice(0, Number(params.get("n") ?? 1)).reverse()} format={params.get("format") === "story" ? "story" : "post"} inline />;
  if (pathname === "/__preview/backtest-card") return <PromoBacktest result={backtest} title="J Signal" show={params.get("show") === "cash" ? "cash" : params.get("money") === "1" || params.get("show") === "both" ? "both" : "pips"} format={params.get("format") === "story" ? "story" : "post"} inline />;
  const base: Signal = { id: "s1", ea_source_id: null, ea_uid: "1", source_name: "XAU EA", symbol: "XAUUSDm", base_symbol: "XAUUSD", direction: "buy", order_type: state === "pending" ? "buy_stop" : "market",
    entry: 2341.5, sl: 2335, tp: 2355, ea_lot: 0.5, digits: 2, point: 0.01, pip_size: 0.1, tick_size: 0.01, tick_value: 1, contract_size: 100, vol_min: 0.01, vol_step: 0.01, vol_max: 100, account_currency: "USD",
    status: state === "closed" ? "closed" : "live", expires_at: state === "pending" ? null : new Date(Date.now() + 95_000).toISOString(), triggered_at: null, trigger_price: null, closed_at: null, close_price: state === "closed" ? 2355 : null,
    result_pips: state === "closed" ? 135 : null, outcome: state === "closed" ? "win" : null, close_reason: state === "closed" ? "tp" : null, is_test: false, sent_at: new Date(Date.now() - 25_000).toISOString(), created_at: new Date().toISOString() };
  return <SignalPreview base={base} state={state} />;
}

function SignalPreview({ base, state }: { base: Signal; state: string }) {
  const [receipt, setReceipt] = useState<Receipt>({ id: "r", signal_id: "s1", wann_call_id: null, user_id: "u", kind: "ea", delivered_at: null, opened_at: new Date().toISOString(), copied: {}, status: state === "closed" ? "taken" : "opened", status_source: null, user_lot: null, ring_count: 1, question_sent_at: null, answered_at: null, user_entry: null, user_close: null, user_pips: state === "closed" ? 135 : null });
  return (
    <div className="app-frame">
      <SignalCard signal={base} receipt={receipt} profile={profile} events={[]} onCopy={(f) => setReceipt({ ...receipt, copied: { ...receipt.copied, [f]: "x" } })} onTake={() => setReceipt({ ...receipt, status: "taken" })} onSkip={() => setReceipt({ ...receipt, status: "skipped" })} onClose={() => undefined} onSetBalance={() => undefined} />
    </div>
  );
}
