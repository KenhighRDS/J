export type Role = "admin" | "subscriber";
export type ProfileStatus = "invited" | "active" | "removed";
export interface Profile {
  id: string; email: string; name: string | null; role: Role; status: ProfileStatus;
  balance: number | null; balance_currency: string | null; risk_pct: number; balance_source: "manual" | "tracker";
  last_seen: string | null; created_at: string;
  default_amount?: number;   // what a Wann stake or a stock buy is recorded at unless the member changes it (100 to start)
}
export type Direction = "buy" | "sell";
export type OrderType = "market" | "buy_stop" | "sell_stop" | "buy_limit" | "sell_limit";
export type SignalStatus = "live" | "triggered" | "closed" | "cancelled" | "expired";
export interface Signal {
  id: string; ea_source_id: string | null; ea_uid: string | null; source_name: string | null;
  symbol: string; base_symbol: string; direction: Direction; order_type: OrderType;
  entry: number; sl: number | null; tp: number | null; ea_lot: number | null;
  digits: number; point: number | null; pip_size: number; tick_size: number | null; tick_value: number | null; contract_size: number | null;
  vol_min: number; vol_step: number; vol_max: number; account_currency: string | null;
  status: SignalStatus; expires_at: string | null; triggered_at: string | null; trigger_price: number | null;
  closed_at: string | null; close_price: number | null; result_pips: number | null; outcome: "win" | "loss" | "be" | null; close_reason: "tp" | "sl" | "manual" | null;
  is_test: boolean; sent_at: string | null; created_at: string;
  shot_open?: string | null; shot_close?: string | null;   // EA chart images (storage paths in trade-shots)
}
export type ReceiptStatus = "pending" | "opened" | "likely_taken" | "taken" | "skipped" | "missed" | "not_taken";
export type ReceiptSource = "open" | "swipe" | "skip" | "copy" | "tracker" | "close_answer" | "expiry" | null;
export interface Receipt {
  id: string; signal_id: string | null; wann_call_id: string | null; user_id: string; kind: "ea" | "wann";
  delivered_at: string | null; opened_at: string | null; copied: Record<string, string>;
  status: ReceiptStatus; status_source: ReceiptSource; user_lot: number | null; ring_count: number;
  question_sent_at: string | null; answered_at: string | null; user_entry: number | null; user_close: number | null; user_pips: number | null;
  stake_usd?: number | null; payout_usd?: number | null; profit_usd?: number | null;   // portfolio: Wann stake / payout if it wins, the member's own EA result
  payout_asked_at?: string | null;   // the one time the app asked what a won Wann call paid
}
export interface SignalEvent { id: number; signal_id: string; type: string; payload: Record<string, unknown>; created_at: string }
export interface Device { id: string; user_id: string; platform: "android" | "web"; fcm_token: string; app_version: string | null; last_seen: string; created_at: string }
export interface EaSource { id: string; name: string; active: boolean; last_seen: string | null; created_at: string }
export interface Settings {
  market_expiry_sec: number; re_ring_sec: number; match_tolerance_pips: Record<string, number>;
  pip_size_overrides: Record<string, number>; report_hour_ny: number; wann_window_days: number; close_question_hours: number;
}
export interface WannCall {
  id: string; wann_game_id: number; sport: string; competition: string; home: string; away: string; kickoff_utc: string;
  pick: "home" | "draw" | "away" | "home_or_draw" | "away_or_draw"; pick_label: string; probability: number;
  call_type: "straight" | "win_or_draw"; status: "live" | "withdrawn" | "finished"; final_score: string | null;
  outcome: "won" | "lost" | "void" | null; sent_at: string | null; created_at: string;
  prediction_time?: string | null;   // when Wann made (or last updated) the call, from the Wann feed
}
export interface Report { id: string; user_id: string | null; period: "weekly" | "monthly"; period_start: string; period_end: string; data: ReportData; created_at: string }
export interface ReportSymbolLine { symbol: string; pips: number; n: number }
export interface ReportData {
  app: { called: number; wins: number; losses: number; be: number; win_rate: number; pips: number; best: { symbol: string; pips: number } | null; symbols: ReportSymbolLine[] };
  user?: { name: string | null; received: number; taken: number; likely: number; missed: number; skipped: number; wins: number; losses: number; pips: number; tracker: boolean };
  wann?: { called: number; won: number; lost: number; hit_rate: number; taken: number; missed: number } | null;
}
export interface StockReason { label: string; detail: string }
export interface StockFact { label: string; value: string }
export interface StockInvestor { name: string; firm: string; value_usd: number; shares: number | null; pct: number | null; period: string | null }
export interface StockPick {
  id: string; symbol: string; name: string; exchange: string | null; industry: string | null; logo_url: string | null; website: string | null;
  kind: "ipo" | "catalyst"; horizon: "swing" | "long"; headline: string; description: string | null;
  reasons: StockReason[]; risks: string[]; facts: StockFact[]; investors: StockInvestor[]; score: number;
  entry_price: number; buy_below: number | null; stop_price: number | null; target_price: number | null;
  status: "open" | "closed"; close_reason: "target" | "stop" | "time" | "manual" | null; close_price: number | null; result_pct: number | null;
  last_price: number | null; last_price_at: string | null; expires_at: string | null; is_test: boolean;
  sent_at: string | null; closed_at: string | null; created_at: string;
}
export interface StockPosition { id: string; user_id: string; pick_id: string; amount_usd: number; buy_price: number; bought_at: string; sell_price: number | null; sold_at: string | null }
