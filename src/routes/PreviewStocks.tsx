// Dev-only fixtures for the stock and portfolio screens:
//   /__preview/stocks   /__preview/stock?state=swing|ipo|long|closed&pos=1|sold   /__preview/portfolio?empty=1   /__preview/shell (tab bar)
//   /__preview/admin-stocks   /__preview/settings   /__preview/amount (the one-time question)
//   /__preview/crypto   /__preview/coin?state=swing|long|listing&pos=1   (what the rules produced when replayed on 10 July 2025)
import { Route, Routes } from "react-router-dom";
import { Shell } from "../components/Shell";
import { StockRoute, StocksList } from "./Stocks";
import { Portfolio, type PortfolioData } from "./Portfolio";
import { AdminStocks } from "./admin/Stocks";
import { Settings } from "./Settings";
import { Users, type Channel, type UserRow } from "./admin/Users";
import { PageTitle } from "../components/ui";
import type { Profile, Receipt, Signal, StockPick, StockPosition, WannCall } from "../lib/types";

const profile: Profile = { id: "u", email: "wolf@example.com", name: "Wolf", role: "admin", status: "active", balance: 10000, balance_currency: "USD", risk_pct: 1, balance_source: "manual", last_seen: null, created_at: "" };
const ago = (days: number, hours = 0) => new Date(Date.now() - (days * 24 + hours) * 36e5).toISOString();

const base: StockPick = {
  id: "k1", symbol: "NVTS", name: "Navitas Semiconductor Corp", exchange: "NASDAQ", industry: "Semiconductors", logo_url: null, website: "https://navitassemi.com/",
  kind: "catalyst", horizon: "swing", headline: "Beat earnings by 31% and closed up 9% near the top of the day's range.",
  description: "Navitas Semiconductor designs gallium nitride and silicon carbide power chips. They let chargers, data-centre power supplies, solar inverters and electric-vehicle systems run smaller, cooler and more efficiently than with ordinary silicon. The company sells to phone and laptop makers, server builders and car suppliers, and makes its chips through contract factories rather than its own plants. Most revenue comes from Asia, where its customers assemble their products.",
  reasons: [
    { label: "Earnings beat by 31%", detail: "Reported $0.21 a share against the $0.16 analysts expected, on 4 Nov." },
    { label: "Sales beat too", detail: "Revenue of $412M came in 6% above the estimate and 28% above a year ago." },
    { label: "Buyers stepped in", detail: "Up 9.2% on the day and closed in the top fifth of the day's range." },
    { label: "Close to its high", detail: "4% below its 52-week high, with a 22% gain over 13 weeks." },
  ],
  risks: ["Stocks that jump on earnings often give some of it back in the first days.", "It moves about 1.8 times as much as the market, in both directions.", "The company is not profitable yet over the last 12 months."],
  facts: [{ label: "Company value", value: "$8.4B" }, { label: "Sales growth (1 year)", value: "+28%" }, { label: "Profit margin", value: "−4.1%" }, { label: "52-week range", value: "$41.20 – $117.60" }, { label: "Price vs 13 weeks ago", value: "+22%" }, { label: "Analysts saying buy", value: "14 of 19" }, { label: "Next earnings", value: "about 3 months" }, { label: "Moves vs market", value: "1.8×" }],
  investors: [
    { name: "Stanley Druckenmiller", firm: "Duquesne Family Office LLC", value_usd: 184_000_000, shares: 1_640_000, pct: 4.6, period: "2026-09-30" },
    { name: "Philippe Laffont", firm: "Coatue Management LLC", value_usd: 97_500_000, shares: 870_000, pct: 0.4, period: "2026-09-30" },
    { name: "Cathie Wood", firm: "ARK Investment Management LLC", value_usd: 12_300_000, shares: 110_000, pct: 0.08, period: "2026-09-30" },
  ],
  score: 84, entry_price: 112.4, buy_below: 115.8, stop_price: 103.1, target_price: 131, status: "open", close_reason: null, close_price: null, result_pct: null,
  last_price: 117.15, last_price_at: ago(0, 2), expires_at: new Date(Date.now() + 26 * 864e5).toISOString(), is_test: false, sent_at: ago(4), closed_at: null, created_at: ago(4),
};
const ipo: StockPick = { ...base, id: "k2", symbol: "KLAR", name: "Klarna Group plc", industry: "Financial Services", kind: "ipo", headline: "Listed 9 weeks ago, holding 24% above its offer price and 3% from its high.", exchange: "NYSE",
  reasons: [{ label: "Listed 9 weeks ago", detail: "Went public on 10 Sep at $40.00 and raised $1.4B." }, { label: "Holding above the offer price", detail: "Trades 24% above what the first investors paid." }, { label: "Near its high since listing", detail: "3% below the highest price since it started trading." }],
  risks: ["New listings swing more than established stocks and have little history.", "Insiders can usually sell from about 9 Mar, which often weighs on the price."], investors: [], entry_price: 49.6, buy_below: 51.1, stop_price: 44.6, target_price: 59.6, last_price: 48.9, score: 76, sent_at: ago(1), last_price_at: ago(0, 3) };
const long: StockPick = { ...base, id: "k3", symbol: "ANET", name: "Arista Networks Inc", industry: "Communications Equipment", exchange: "NYSE", horizon: "long", headline: "Growing 27% a year with 40% profit margins, and it just beat earnings again.",
  buy_below: 148.5, stop_price: null, target_price: null, entry_price: 141.4, last_price: 152.3, score: 88, sent_at: ago(19), expires_at: new Date(Date.now() + 346 * 864e5).toISOString(),
  investors: [{ name: "Bill Gates' foundation", firm: "Bill & Melinda Gates Foundation Trust", value_usd: 1_240_000_000, shares: 8_700_000, pct: 2.9, period: "2026-09-30" }] };
const closed: StockPick = { ...base, id: "k4", symbol: "CELH", name: "Celsius Holdings Inc", industry: "Beverages", status: "closed", close_reason: "target", close_price: 71.3, result_pct: 16.5, entry_price: 61.2, last_price: 71.3, sent_at: ago(23), closed_at: ago(6) };
const stopped: StockPick = { ...closed, id: "k5", symbol: "RXRX", name: "Recursion Pharmaceuticals", close_reason: "stop", close_price: 8.92, result_pct: -8.1, entry_price: 9.71, sent_at: ago(30), closed_at: ago(21) };
const picks = [ipo, base, long, closed, stopped];
const position: StockPosition = { id: "p1", user_id: "u", pick_id: "k1", amount_usd: 500, buy_price: 113.05, bought_at: ago(3), sell_price: null, sold_at: null };
const positions: StockPosition[] = [position, { ...position, id: "p3", pick_id: "k3", amount_usd: 1200, buy_price: 142 }, { ...position, id: "p4", pick_id: "k4", amount_usd: 400, buy_price: 61.9, sell_price: 71.1, sold_at: ago(6) }];

// Crypto fixtures: the picks the shipped rules build when replayed on the candles of 10 July 2025.
const xrp: StockPick = { ...base, id: "x1", asset: "crypto", symbol: "XRP", name: "XRP", exchange: "Crypto", industry: "Layer 1 (L1)", website: "https://xrpl.org/", kind: "catalyst", horizon: "swing",
  headline: "Closed at its highest close in 56 days, up 6% on 2× its usual volume.",
  description: "XRP is the native digital asset of the XRP Ledger, an open-source, public blockchain built for payments. It settles transactions in a few seconds for a fraction of a cent, and is used to move money across borders and between currencies.",
  reasons: [{ label: "Highest close in 56 days", detail: "Closed at $2.55, above every daily close since 14 May." }, { label: "Volume 2× normal", detail: "$518M traded on the day, against its 20-day average." }, { label: "Buyers in control", detail: "Up 6% on the day, closing in the top quarter of the day's range." }, { label: "Stronger than Bitcoin", detail: "+10.4% over 30 days, against +5.2% for Bitcoin." }],
  risks: ["Breakouts fail often: if it closes back under the old high, the move is probably over.", "Crypto moves fast. A fall of 20% in a day is normal for this market."],
  facts: [{ label: "Market value", value: "$150B" }, { label: "Rank by value", value: "#4" }, { label: "Traded per day", value: "$518M" }, { label: "Price vs 30 days ago", value: "+10.4%" }, { label: "Bitcoin, 30 days", value: "+5.2%" }, { label: "Below its all-time high", value: "33.2%" }, { label: "Listed on Binance", value: "7 years ago" }, { label: "Supply in circulation", value: "59%" }],
  investors: [], score: 74, entry_price: 2.5471, buy_below: 2.649, stop_price: 2.3036, target_price: 3.0341, last_price: 2.7312, sent_at: ago(3), last_price_at: ago(0, 1), expires_at: new Date(Date.now() + 18 * 864e5).toISOString() };
const btcPick: StockPick = { ...xrp, id: "x2", symbol: "BTC", name: "Bitcoin", website: "http://www.bitcoin.org", horizon: "long", headline: "Back in an uptrend: its highest close in over 9 months, on 2.1× its usual volume.",
  description: "Bitcoin is the world's first decentralized cryptocurrency, created in 2009 by the pseudonymous Satoshi Nakamoto. It enables peer-to-peer electronic cash transactions without intermediaries like banks, and its supply is capped at 21 million coins.",
  reasons: [{ label: "Highest close in over 9 months", detail: "Closed at $116,010, above every daily close since 25 Oct 2024." }, { label: "Volume 2.1× normal", detail: "$2.8B traded on the day, against its 20-day average." }, { label: "In an uptrend", detail: "Above its 50-day and 200-day averages, with the 50-day on top." }],
  risks: ["Breakouts fail often: if it closes back under the old high, the move is probably over.", "Crypto moves fast. A fall of 20% in a day is normal for this market.", "A long-term hold has no stop: crypto bear markets have taken even the biggest coins down by more than half."],
  facts: [{ label: "Market value", value: "$2.31T" }, { label: "Rank by value", value: "#1" }, { label: "Traded per day", value: "$2.8B" }, { label: "Price vs 30 days ago", value: "+5.2%" }, { label: "Listed on Binance", value: "8 years ago" }, { label: "Supply in circulation", value: "95%" }],
  investors: [{ name: "Strategy", firm: "850,363 BTC", value_usd: 57_153_744_123, shares: 850363, pct: 4.049, period: "2026-11-14" }, { name: "Metaplanet", firm: "44,000 BTC", value_usd: 2_957_283_820, shares: 44000, pct: 0.21, period: "2026-11-14" }, { name: "Twenty One Capital", firm: "43,514 BTC", value_usd: 2_924_619_276, shares: 43514, pct: 0.207, period: "2026-11-14" }],
  score: 80, entry_price: 116010, buy_below: 121810, stop_price: null, target_price: null, last_price: 118240, sent_at: ago(5) };
const listing: StockPick = { ...xrp, id: "x3", symbol: "PEPE", name: "Pepe", kind: "ipo", industry: "Meme", headline: "Listed 9 weeks ago, holding 61% above its first day and 3.2% from its high.", investors: [], entry_price: 0.00001234, buy_below: 0.00001283, stop_price: 0.00001012, target_price: 0.00001678, last_price: 0.00001301, score: 72, sent_at: ago(1) };
const coins = [listing, xrp, btcPick];
const coinPos: StockPosition = { id: "cp1", user_id: "u", pick_id: "x1", amount_usd: 100, buy_price: 2.56, bought_at: ago(3), sell_price: null, sold_at: null };

const sig = (o: Partial<Signal>): Signal => ({ id: "s1", ea_source_id: null, ea_uid: null, source_name: "J", symbol: "XAUUSD", base_symbol: "XAUUSD", direction: "buy", order_type: "market", entry: 4012.4, sl: 4002.4, tp: 4032.4, ea_lot: 0.1, digits: 2, point: 0.01, pip_size: 0.1,
  tick_size: 0.01, tick_value: 1, contract_size: 100, vol_min: 0.01, vol_step: 0.01, vol_max: 100, account_currency: "USD", status: "closed", expires_at: null, triggered_at: null, trigger_price: null, closed_at: ago(2), close_price: 4032.4, result_pips: 200, outcome: "win", close_reason: "tp", is_test: false, sent_at: ago(2, 3), created_at: ago(2, 3), ...o });
const rec = (o: Partial<Receipt>): Receipt => ({ id: "r1", signal_id: "s1", wann_call_id: null, user_id: "u", kind: "ea", delivered_at: null, opened_at: null, copied: {}, status: "taken", status_source: "swipe", user_lot: 0.12, ring_count: 1, question_sent_at: null, answered_at: null, user_entry: null, user_close: null, user_pips: null, stake_usd: null, payout_usd: null, profit_usd: null, ...o });
const call = (o: Partial<WannCall>): WannCall => ({ id: "c1", wann_game_id: 1, sport: "Football", competition: "La Liga", home: "Real Madrid", away: "Getafe", kickoff_utc: ago(1), pick: "home", pick_label: "Real Madrid wins", probability: 93.1, call_type: "straight", status: "finished", final_score: "3–0", outcome: "won", sent_at: ago(2), created_at: ago(2), ...o });
const portfolio: PortfolioData = {
  stocks: [...positions.map((p) => ({ ...p, pick: picks.find((k) => k.id === p.pick_id) ?? null })), { ...coinPos, pick: xrp }],
  ea: [
    { ...rec({}), signal: sig({}) },
    { ...rec({ id: "r2", signal_id: "s2", user_lot: 0.3 }), signal: sig({ id: "s2", symbol: "USDJPY", base_symbol: "USDJPY", direction: "sell", digits: 3, pip_size: 0.01, tick_size: 0.001, tick_value: 0.65, result_pips: -18.4, outcome: "loss", close_reason: "sl", closed_at: ago(5), sent_at: ago(5, 2) }) },
    { ...rec({ id: "r3", signal_id: "s3", user_lot: null }), signal: sig({ id: "s3", result_pips: 64, closed_at: ago(8), sent_at: ago(8, 4) }) },
    { ...rec({ id: "r4", signal_id: "s4" }), signal: sig({ id: "s4", status: "triggered", closed_at: null, result_pips: null, outcome: null, close_reason: null, sent_at: ago(0, 1) }) },
  ],
  wann: [
    { ...rec({ id: "r5", kind: "wann", signal_id: null, wann_call_id: "c1", user_lot: null, stake_usd: 50, payout_usd: 54 }), call: call({}) },
    { ...rec({ id: "r6", kind: "wann", signal_id: null, wann_call_id: "c2", user_lot: null, stake_usd: 30 }), call: call({ id: "c2", home: "Inter", away: "Lecce", pick_label: "Inter wins", outcome: "lost", final_score: "0–1", kickoff_utc: ago(3) }) },
    { ...rec({ id: "r7", kind: "wann", signal_id: null, wann_call_id: "c3", user_lot: null, stake_usd: 40, payout_usd: 44 }), call: call({ id: "c3", home: "Arsenal", away: "Chelsea", pick_label: "Arsenal or draw", status: "live", outcome: null, final_score: null, kickoff_utc: new Date(Date.now() + 5 * 36e5).toISOString() }) },
    { ...rec({ id: "r8", kind: "wann", signal_id: null, wann_call_id: "c4", user_lot: null, stake_usd: 100 }), call: call({ id: "c4", home: "PSG", away: "Le Havre", pick_label: "PSG wins", kickoff_utc: ago(4) }) },
  ],
  tracker: [],
};
const frame = (child: React.ReactNode) => <div className="app-frame"><div className="scroll-area">{child}</div></div>;

export function isStocksPreview(pathname: string): boolean { return /^\/__preview\/(stocks|stock|portfolio|shell|admin-stocks|settings|amount|crypto|coin|users|member)$/.test(pathname); }
export function StocksPreview({ pathname, params }: { pathname: string; params: URLSearchParams }) {
  if (pathname === "/__preview/settings") return <Routes><Route path="/__preview/settings" element={<Shell profile={{ ...profile, default_amount_set_at: "2026-11-13T00:00:00Z" }} />}><Route index element={<Settings profile={{ ...profile, default_amount: 100 }} reload={async () => undefined} />} /></Route></Routes>;
  if (pathname === "/__preview/amount") return <Routes><Route path="/__preview/amount" element={<Shell profile={{ ...profile, default_amount: 100, default_amount_set_at: null }} previewAsk />}><Route index element={<StocksList profile={profile} preview={{ picks, positions }} />} /></Route></Routes>;
  if (pathname === "/__preview/users") {
    const chans: Channel[] = [{ key: "usdjpy", label: "USDJPY", kind: "forex", default_enabled: true, sort: 10 }, { key: "gold", label: "Gold", kind: "forex", default_enabled: true, sort: 20 }, { key: "wann", label: "Wann", kind: "wann", default_enabled: false, sort: 30 }, { key: "stocks", label: "Stocks", kind: "stocks", default_enabled: false, sort: 40 }, { key: "crypto", label: "Crypto", kind: "crypto", default_enabled: false, sort: 50 }];
    const row = (o: Partial<UserRow>): UserRow => ({ ...profile, devices: [{ platform: "android", last_seen: ago(0, 1) }], on: { usdjpy: true, gold: true, wann: true, stocks: true, crypto: true }, tracker: null, stats: { taken: 12, missed: 3, skipped: 1 }, ...o });
    return frame(<div className="mx-auto w-full max-w-md pb-6"><PageTitle>Admin</PageTitle><div className="px-4"><Users me={profile} preview={{ channels: chans, users: [row({}), row({ id: "u2", email: "member@example.com", name: "Jean", role: "subscriber", on: { usdjpy: true, gold: true, wann: false, stocks: false, crypto: false }, stats: { taken: 4, missed: 1, skipped: 0 } })] }} /></div></div>);
  }
  // a member with only the default signals: no Stocks or Crypto tab. ?channels=crypto (or wann, or nothing) shows the other menus
  if (pathname === "/__preview/member") return <Routes><Route path="/__preview/member" element={<Shell profile={{ ...profile, role: "subscriber", default_amount_set_at: "2026-11-13T00:00:00Z" }} channels={new URLSearchParams(window.location.search).get("channels")?.split(",").filter(Boolean) ?? ["usdjpy", "gold"]} />}><Route index element={<Settings profile={{ ...profile, role: "subscriber", default_amount: 100 }} reload={async () => undefined} />} /></Route></Routes>;
  if (pathname === "/__preview/crypto") return <Routes><Route path="/__preview/crypto" element={<Shell profile={{ ...profile, default_amount_set_at: "2026-11-13T00:00:00Z" }} />}><Route index element={<StocksList profile={profile} asset="crypto" preview={params.get("empty") ? { picks: [], positions: [] } : { picks: coins, positions: [coinPos] }} />} /></Route></Routes>;
  if (pathname === "/__preview/coin") { const st = params.get("state") ?? "swing"; const k = st === "long" ? btcPick : st === "listing" ? listing : xrp; return frame(<StockRoute profile={profile} asset="crypto" preview={{ pick: k, position: params.get("pos") ? { ...coinPos, pick_id: k.id, buy_price: k.entry_price } : null }} />); }
  if (pathname === "/__preview/shell") return <Routes><Route path="/__preview/shell" element={<Shell profile={{ ...profile, default_amount_set_at: "2026-11-13T00:00:00Z" }} />}><Route index element={<StocksList profile={profile} preview={{ picks, positions }} />} /></Route></Routes>;
  if (pathname === "/__preview/admin-stocks") return frame(<div className="mx-auto w-full max-w-md pb-6"><PageTitle>Admin</PageTitle><div className="px-4"><AdminStocks preview={{
    keys: { finnhub_key: true, massive_key: false, sec_contact: "owner@example.com" },
    probe: { sources: { finnhub: { ok: true, note: "Apple at $271.4, 212 earnings reports in the last 3 days, every number the scan uses is there" }, massive: { ok: false, note: "No key saved. Picks go out without a company description and with a simpler stop" }, sec: { ok: true, note: "Reached the SEC (BERKSHIRE HATHAWAY INC)" }, openfigi: { ok: true, note: "Ticker lookup works" } }, investors_loaded: 17, holdings_matched: 2840 },
    scan: { id: "s", trading_day: new Date().toISOString().slice(0, 10), dry_run: true, stage: "done", stats: { seeded: { earnings: 31, ipo: 44 }, picked: 2, passed_over: 6, rejected: 67, min_score: 70, uptrend: true }, error: null, started_at: ago(0, 1) },
    cands: [
      { id: 1, symbol: "NVTS", source: "earnings", status: "picked", score: 84, detail: { name: "Navitas Semiconductor Corp", preview: { headline: base.headline } } },
      { id: 2, symbol: "KLAR", source: "ipo", status: "picked", score: 76, detail: { name: "Klarna Group plc", preview: { headline: ipo.headline } } },
      { id: 3, symbol: "DDOG", source: "earnings", status: "scored", score: 66, detail: { name: "Datadog Inc" } },
      { id: 4, symbol: "UPST", source: "earnings", status: "rejected", score: null, detail: { name: "Upstart Holdings", reject: "Sold off from the day's high" } },
      { id: 5, symbol: "FIGR", source: "ipo", status: "rejected", score: null, detail: { name: "Figure Technology Solutions", reject: "Too far below its high since listing" } },
    ], open: [ipo, base, long] }} /></div></div>);
  if (pathname === "/__preview/stocks") return frame(<StocksList profile={profile} preview={params.get("empty") ? { picks: [], positions: [] } : { picks, positions }} />);
  if (pathname === "/__preview/portfolio") return frame(<Portfolio profile={profile} preview={params.get("empty") ? { stocks: [], ea: [], wann: [], tracker: [] } : portfolio} />);
  const state = params.get("state") ?? "swing"; const pos = params.get("pos");
  const pick = state === "ipo" ? ipo : state === "long" ? long : state === "closed" ? closed : base;
  const mine = pos ? { ...position, pick_id: pick.id, ...(pos === "sold" ? { sell_price: pickSell(pick), sold_at: ago(1) } : {}) } : null;
  return frame(<StockRoute profile={profile} preview={{ pick, position: mine }} />);
}
const pickSell = (k: StockPick) => k.close_price ?? k.last_price ?? k.entry_price;
