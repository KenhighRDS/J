// TJR module: the rows the admin pages read, and how they are worded and formatted. Admin only (see docs/tjr).
import defaults from "./tjr-defaults.json" with { type: "json" };

export type Model = "A" | "B" | "C" | "D" | "E";
export type Side = "long" | "short";

export interface Metrics {
  trades: number; net_usd?: number; costs_usd?: number; win_rate?: number; expectancy_r?: number; expectancy_r_stderr?: number | null; total_r?: number;
  profit_factor?: number | null; max_drawdown_usd?: number; max_drawdown_pct?: number; longest_win_streak?: number; longest_loss_streak?: number;
  avg_hold_minutes?: number; sharpe_daily_252?: number; start_equity?: number; end_equity?: number; signals?: number; sweeps?: number; small_sample?: boolean;
  by_month?: Record<string, Bucket>; by_hour?: Record<string, Bucket>; by_side?: Record<string, Bucket>; by_exit?: Record<string, number>;
  monte_carlo?: { runs: number; net_p05?: number; net_p50?: number; net_p95?: number; drawdown_p95?: number; share_losing?: number };
}
export interface Bucket { trades: number; wins: number; net_usd: number; r: number }
export interface Provenance { source?: string; file?: string; rows?: number; first?: string; last?: string; sha256?: string; roll_method?: string; contracts?: string[] }
export interface TjrRun {
  id: string; kind: "backtest" | "walkforward" | "paper" | "live"; status: "running" | "done" | "failed"; label: string; group_id: string | null; version_id: string | null;
  model: Model; experimental: boolean; symbol: string; trade_symbol: string; config: Record<string, unknown>; config_id: string; rules_version: string;
  period_from: string | null; period_to: string | null; metrics: Metrics; rejected: Record<string, number>; curve: [string, number][];
  provenance: Record<string, Provenance>; extra: WalkForward | Record<string, never>; error: string | null; created_at: string; finished_at: string | null;
}
export interface WalkForward {
  spans?: Record<"train" | "validation" | "test", [string, string]>; frozen?: { params: Record<string, unknown>; protocol: string };
  grid?: { params: Record<string, unknown>; train: Metrics; validation?: Metrics | null }[]; test_stretch_used_times?: number; test_is_out_of_sample?: boolean;
  sensitivity?: { settings: number; with_enough_trades: number; train_expectancy_min: number | null; train_expectancy_median: number | null; train_expectancy_max: number | null; share_positive: number | null };
}
export interface Confirmation { kind: string; side: Side; ts: string; value: number; timeframe: number; reason: string; expires_at: string | null; extra: { top?: number; bottom?: number; since?: string } }
export interface Mark { role: "swept" | "target"; label: string; price: number; formed_at: string }
export type Candle = [number, number, number, number, number, number];     // open time (s), open, high, low, close, volume
export interface TjrTrade {
  id: string; run_id: string; seq: number; model: Model; symbol: string; side: Side; qty: number; signal_at: string; entry_at: string; entry: number; stop: number;
  target: number | null; target_label: string; exit_at: string | null; exit: number | null; exit_reason: string; risk_usd: number; gross_usd: number; costs_usd: number;
  net_usd: number; r: number; mae: number; mfe: number; levels: string[]; confirmations: Confirmation[]; marks: Mark[]; partials: { ts: string; qty: number; price: number; reason: string }[];
  bars: Candle[]; experimental: boolean;
}
export interface TjrEvent { id: number; run_id: string; ts: string; type: string; data: Record<string, unknown> }
export interface TjrJob { id: string; kind: "backtest" | "compare" | "walkforward"; params: Record<string, unknown>; status: "queued" | "running" | "done" | "failed"; note: string | null; run_ids: string[]; created_at: string; finished_at: string | null }
export interface TjrVersion { id: string; name: string; note: string; config: Record<string, unknown>; model: Model; experimental: boolean; created_at: string }
export interface TjrDataset { symbol: string; source: string; first_at: string | null; last_at: string | null; rows: number; roll_method: string; seen_at: string }
export interface TjrStatus {
  mode: "off" | "paper" | "live"; kill: boolean; kill_at: string | null; live_unlocked: boolean; live_unlocked_at: string | null; active_version_id: string | null;
  has_worker_key: boolean; worker_seen_at: string | null; worker_online: boolean; worker_info: { feed?: string; broker?: string; datasets?: string[]; rules_version?: string; live_capable?: boolean };
}

export const RULES_VERSION: string = defaults.rules_version;
export const DEFAULT_CONFIG = defaults.config as Record<string, unknown>;
export const MODEL_TEXT = defaults.models as Record<Model, string>;
export const MODELS: Model[] = ["A", "B", "C", "D", "E"];
/** Short names for lists; the long description is MODEL_TEXT. */
export const MODEL_NAME: Record<Model, string> = { A: "Baseline", B: "Baseline + inverse FVG", C: "Baseline + SMT", D: "Baseline + inverse FVG + SMT", E: "Timeframe reading" };
export const LIVE_PHRASE = "ENABLE LIVE TRADING";

const NY = "America/New_York";
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: NY, ...o });
const T_HM = fmt({ hour: "2-digit", minute: "2-digit", hour12: false }), T_DAY = fmt({ day: "numeric", month: "short", year: "numeric" }), T_SHORT = fmt({ day: "numeric", month: "short" });
/** New York clock time, 24 hours: "09:45". Every session rule of this strategy is a New York time. */
export const nyTime = (t: string | number) => T_HM.format(typeof t === "number" ? t * 1000 : new Date(t)).replace(/^24/, "00");
export const nyDay = (t: string | number) => T_DAY.format(typeof t === "number" ? t * 1000 : new Date(t));
export const nyShort = (t: string | number) => T_SHORT.format(typeof t === "number" ? t * 1000 : new Date(t));

export const usd = (x: number | null | undefined, sign = false) => x == null ? "–" : `${x < 0 ? "−" : sign && x > 0 ? "+" : ""}$${Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const rText = (x: number | null | undefined) => x == null ? "–" : `${x < 0 ? "−" : x > 0 ? "+" : ""}${Math.abs(x).toFixed(2)} R`;
export const px = (x: number | null | undefined) => x == null ? "–" : x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const tone = (x: number | null | undefined) => (x == null || x === 0 ? "text-muted" : x > 0 ? "text-buy" : "text-sell");

/** What a level or a confirmation is called on screen. */
export function levelName(label: string): string {
  const edge = label.endsWith(" high") ? "high" : "low", kind = label.replace(/ (high|low)$/, "");
  const names: Record<string, string> = { pd: "Previous day", overnight: "Overnight", "swing:60": "1-hour swing", "swing:240": "4-hour swing", "session:asia": "Asia", "session:london": "London", "session:premarket": "Premarket", "session:ny_am": "New York morning", "session:ny_pm": "New York afternoon", "equal:15": "Equal" };
  return `${names[kind] ?? kind} ${edge}`;
}
/** The same name inside a sentence: lower case unless it starts with a place name. */
export const levelPhrase = (label: string) => { const n = levelName(label); return /^(Asia|London|New York)/.test(n) ? n : n.charAt(0).toLowerCase() + n.slice(1); };
export const CONFIRMATION_NAME: Record<string, string> = {
  sweep: "Liquidity sweep", bos: "Break of structure", higher_low: "Higher low", lower_high: "Lower high", candle_break: "Entry trigger", ifvg: "Inverse FVG", smt: "SMT divergence",
  ext79: "79% extension", equilibrium: "Back to the middle of the leg", fvg_retest: "Back into the gap", bos_1m: "1-minute break of structure", ifvg_1m: "1-minute inverse FVG",
};
export const EXIT_NAME: Record<string, string> = { target: "Target reached", stop: "Stopped out", flatten: "Closed at 11:30", breakeven: "Stopped at entry", trail: "Trailing stop", kill: "Emergency stop", end_of_data: "End of data", "contract roll": "Contract roll", partial: "Partial exit" };
export const EVENT_NAME: Record<string, string> = { signal: "Signal", order: "Order", fill: "Fill", cancel: "Order cancelled", risk: "Risk check", rejected: "Setup refused", roll: "Contract roll", sweep: "Sweep", confirmation: "Confirmation", level: "Level" };

/** Is the average beyond its own margin of error, with enough trades to mean it? Only then does it get a colour. */
export const clear = (m: Metrics) => m.trades >= 30 && m.expectancy_r_stderr != null && Math.abs(m.expectancy_r ?? 0) > 2 * m.expectancy_r_stderr;
/** The sentence under a result: what kind of number it is and how much to trust it. */
export function verdict(m: Metrics): string {
  if (!m.trades) return "No trades in this period.";
  const se = m.expectancy_r_stderr ?? null, e = m.expectancy_r ?? 0;
  if (m.trades < 30 || se == null) return `Only ${m.trades} trade${m.trades === 1 ? "" : "s"}: too few to say anything.`;
  if (Math.abs(e) <= 2 * se) return `${rText(e)} a trade, give or take ${(2 * se).toFixed(2)}: not distinguishable from zero.`;
  return e > 0 ? `${rText(e)} a trade, more than its margin of error (${(2 * se).toFixed(2)}).` : `${rText(e)} a trade: a loss beyond its margin of error (${(2 * se).toFixed(2)}).`;
}

/** Settings the builder lets an admin change, grouped. `path` reaches into the config ("exits.min_rr"). */
export interface BuilderField { path: string; label: string; hint?: string; kind: "number" | "toggle" | "choice" | "time"; choices?: [string, string][]; step?: number; min?: number; max?: number; experimental?: boolean }
export const BUILDER: { title: string; fields: BuilderField[] }[] = [
  { title: "Session (New York time)", fields: [
    { path: "session_start", label: "Trade from", kind: "time" }, { path: "session_end", label: "Until", kind: "time" }, { path: "flatten_at", label: "Close everything at", kind: "time" },
    { path: "min_minutes_left", label: "No new entry this close to the close", kind: "number", min: 0, max: 60, hint: "minutes" },
  ] },
  { title: "Liquidity that counts", fields: [
    { path: "use_previous_day", label: "Previous day high and low", kind: "toggle" }, { path: "use_overnight", label: "Overnight high and low", kind: "toggle" },
    { path: "use_sessions", label: "Session highs and lows", kind: "toggle" }, { path: "use_swings_1h", label: "1-hour swings", kind: "toggle" }, { path: "use_swings_4h", label: "4-hour swings", kind: "toggle" },
    { path: "use_equal_levels", label: "Equal highs and lows", kind: "toggle" },
  ] },
  { title: "Sweep and confirmations", fields: [
    { path: "sweep_min_ticks", label: "Sweep: ticks through the level", kind: "number", min: 1, max: 20 },
    { path: "reclaim_timeout_bars", label: "Sweep: closes allowed to get back", kind: "number", min: 1, max: 6 },
    { path: "bos_pivot", label: "Swing size for a break of structure", kind: "number", min: 1, max: 5, hint: "bars each side" },
    { path: "bos_window_bars", label: "Break of structure within", kind: "number", min: 1, max: 24, hint: "5-minute bars" },
    { path: "setup_expiry_bars", label: "Setup expires after", kind: "number", min: 2, max: 48, hint: "5-minute bars" },
    { path: "use_ext79", label: "79% extension", kind: "toggle", experimental: true, hint: "The source does not say how it is drawn. Model E only." },
  ] },
  { title: "Stop and target", fields: [
    { path: "exits.stop", label: "Stop", kind: "choice", choices: [["sweep", "Beyond the sweep"], ["structure", "Beyond the pullback"], ["atr", "ATR"]] },
    { path: "exits.target", label: "Target", kind: "choice", choices: [["liquidity", "Liquidity"], ["r", "Fixed multiple"]] },
    { path: "exits.target_rule", label: "Which liquidity", kind: "choice", choices: [["nearest", "Nearest"], ["first_with_min_rr", "First far enough"]] },
    { path: "exits.min_rr", label: "Liquidity must be at least", kind: "number", step: 0.5, min: 0.5, max: 6, hint: "R away" },
    { path: "exits.target_r", label: "Fixed target", kind: "number", step: 0.5, min: 0.5, max: 8, hint: "R" },
    { path: "exits.breakeven_at_r", label: "Stop to entry after", kind: "number", step: 0.5, min: 0, max: 5, hint: "R, 0 = never" },
  ] },
  { title: "Risk", fields: [
    { path: "risk.risk_pct", label: "Risk a trade", kind: "number", step: 0.05, min: 0.05, max: 2, hint: "% of equity" },
    { path: "risk.start_equity", label: "Account size for tests", kind: "number", step: 1000, min: 1000, max: 10000000, hint: "$" },
    { path: "risk.max_trades_per_day", label: "Trades a day, at most", kind: "number", min: 1, max: 10 },
    { path: "risk.max_full_losses_per_day", label: "Stop for the day after", kind: "number", min: 1, max: 10, hint: "full losses" },
  ] },
];
export function getPath(cfg: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), cfg);
}
export function setPath(cfg: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const [head, ...rest] = path.split(".");
  return rest.length === 0 ? { ...cfg, [head]: value } : { ...cfg, [head]: setPath((cfg[head] as Record<string, unknown>) ?? {}, rest.join("."), value) };
}
/** Only what differs from the engine's defaults, as "path: old → new" lines: what a saved version actually changes. */
export function changes(cfg: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const g of BUILDER) for (const f of g.fields) {
    const a = getPath(DEFAULT_CONFIG, f.path), b = getPath(cfg, f.path);
    if (b !== undefined && JSON.stringify(a) !== JSON.stringify(b)) out.push(`${f.label}: ${String(b)}`);
  }
  return out;
}
