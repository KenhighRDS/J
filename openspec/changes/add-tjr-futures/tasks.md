# Tasks

## 1. Audit and research
- [x] Read the brief and the screenshot; record what the source supports and what is hypothesis (docs/tjr/strategy-spec.md)
- [x] Provider, broker and hosting costs from official pages, with check date (docs/tjr/providers.md)
- [x] Wolf saved the Massive key (20 Nov); the free futures plan works on it

## 2. Engine (tjr/jtjr)
- [x] Clock, contracts, bar aggregation, confirmed pivots, fair value gaps, liquidity map
- [x] Sweep and reclaim, BOS, higher low / lower high, inverse FVG, SMT; models A to E
- [x] Risk checks, sizing, pessimistic fill simulation, kill switch
- [x] Backtester, statistics, walk-forward with a frozen protocol and a test-stretch ledger
- [x] Data files with provenance; Massive downloader; command line; JSON / CSV / HTML reports
- [x] Tests: 61 (rules, strategy, fills, data, command line, worker link, no look-ahead)

## 3. Real backtest
- [x] Downloaded 2 years of NQ and ES minute bars (701,769 and 702,151 bars; not committed)
- [x] Protocol committed first (docs/tjr/research-protocol.md); models A to E as specified; walk-forward for A and E
- [x] Candid conclusion (docs/tjr/results.md): no edge shown; the chosen settings lost on the held-back six months
- [ ] Wolf: decide whether to buy more history (Databento, about $40 for five years, inside its $125 credit)

## 4. J integration
- [x] Migration: tjr_versions, tjr_runs, tjr_trades, tjr_events, tjr_jobs, tjr_datasets, tjr_state; admin-only RLS; assertions
- [x] Server function tjr-worker and Python worker: publish runs, do jobs, heartbeat (not deployed yet)
- [ ] Admin > TJR: dashboard, backtests and comparison, candle chart with reasons, builder with versions, journal
- [ ] Rendered and checked at phone, tablet and desktop widths

## 5. Paper and live
- [ ] Forward paper test (replays each session when its data is released)
- [ ] Real-time paper service and broker adapter (needs the route Wolf chooses, see providers.md)
- [ ] Live adapter behind three locks; authorisation and emergency stop tested; stays off
