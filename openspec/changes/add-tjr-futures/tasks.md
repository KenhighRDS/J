# Tasks

## 1. Audit and research
- [x] Read the brief and the screenshot; record what the source supports and what is hypothesis (docs/tjr/strategy-spec.md)
- [x] Provider, broker and hosting costs from official pages, with check date (docs/tjr/providers.md)
- [ ] Wolf: approve reading futures data with the Massive key (free plan)

## 2. Engine (tjr/jtjr)
- [x] Clock, contracts, bar aggregation, confirmed pivots, fair value gaps, liquidity map
- [x] Sweep and reclaim, BOS, higher low / lower high, inverse FVG, SMT; models A to E
- [x] Risk checks, sizing, pessimistic fill simulation, kill switch
- [x] Backtester, statistics, walk-forward with a frozen protocol and a test-stretch ledger
- [x] Data files with provenance; Massive downloader; command line; JSON / CSV / HTML reports
- [x] Tests: 52 (rules, strategy, fills, data, command line, no look-ahead)

## 3. Real backtest
- [ ] Download 2 years of NQ and ES minute bars (blocked on the key)
- [ ] Models A to E on identical data and assumptions; walk-forward for the baseline
- [ ] Candid conclusion on profitability (docs/tjr/results.md)

## 4. J integration
- [ ] Migration: tjr_versions, tjr_runs, tjr_trades, tjr_events, tjr_jobs, tjr_state; admin-only RLS; assertions
- [ ] Worker: publish runs, poll jobs, heartbeat, obey the kill switch
- [ ] Admin > TJR: dashboard, backtests and comparison, candle chart with reasons, builder with versions, journal
- [ ] Rendered and checked at phone, tablet and desktop widths

## 5. Paper and live
- [ ] Forward paper test (replays each session when its data is released)
- [ ] Real-time paper service and broker adapter (needs the route Wolf chooses, see providers.md)
- [ ] Live adapter behind three locks; authorisation and emergency stop tested; stays off
