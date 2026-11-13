# Tasks

- [x] EA bridge: test button, weekend-safe clock (ea/J_Signal.mqh, both EAs)
- [x] Migration: stock_picks, stock_positions, stock_scans, stock_candidates, investors, investor_holdings, cusip_map,
      money columns on receipts, RPCs, RLS, cron entry
- [x] Rules: seeds, filters, score, plan, wording, tracking, 13F parsing (tests/stocks.test.ts)
- [x] Edge function `stocks`: auto, scan, track, investors, probe, test_pick, close
- [x] App: Stocks list and pick page, Portfolio, stake sheet on Wann, admin Stocks page, tabs
- [x] Portfolio math (tests/portfolio.test.ts), database assertions
- [x] Live check of the keyless sources (SEC filings, ticker lookup)
- [ ] Live check of Finnhub and Massive once Wolf saves the keys (Admin → Stocks → Check keys, Preview the scan)
- [ ] Decide on paid data plans if the free-plan licence terms matter (docs/stocks.md, Licence note)
