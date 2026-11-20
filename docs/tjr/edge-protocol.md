# Looking for a real edge: test plan

Written and committed on 20 November 2026 **before** any of these strategies was run on our data. The commit time of
this file is the evidence. Results go in `edge-results.md`.

## The idea

Tuning rules until a backtest looks good produces a strategy fitted to the past. So nothing is tuned here. Each
strategy below was published by someone else, with its rules and numbers; it is run on our data **exactly as
published**. Our data (NQ and ES, 25 November 2024 to 19 November 2026) is from after every one of these papers, so
for each of them it is a genuinely unseen test.

## What the literature already says

Read on 20 November 2026 (links in `edge-results.md`). For every strategy below, at least one independent re-test
after publication reports that the effect weakened or disappeared. That is the normal fate of a published edge in the
most heavily traded futures in the world. This test checks it on our own bars instead of taking it on trust.

## The seven tests

All on the New York stock session, 09:30 to 16:00. A decision uses only bars that have closed; the order then fills at
the **next bar's open**. Each is run on ES and on NQ.

| # | Strategy | Rules, as published | Published claim |
|---|---|---|---|
| 1 | **Noise-area intraday momentum** (Zarattini, Aziz, Barbon 2024) | For each half hour from 10:00 to 15:30: the "noise area" is today's open (or yesterday's close, whichever is further) plus or minus the average absolute move from the open at that time of day over the last 14 days. Above it and above VWAP: long. Below it and below VWAP: short. Otherwise flat. Checked only on the half hours. Flat at 16:00. | Sharpe 1.33, 2007 to April 2024 |
| 2 | **5-minute opening range breakout** (Zarattini, Aziz 2023) | First 5-minute candle up: buy at 09:35. Down: sell. Equal open and close: no trade. Stop at that candle's low (high for a short). Target 10 times the risk. Otherwise out at the close. | Sharpe 1.13, 2016 to February 2023 |
| 3 | **VWAP trend** (Zarattini, Aziz 2023) | From 09:31: long while 1-minute closes are above the session VWAP, short while below, reversing at each cross. Flat at 16:00. | Sharpe 2.1, 2018 to September 2023 |
| 4 | **First half hour predicts the last** (Gao, Han, Li, Zhou 2018) | Return from yesterday's close to 10:00. Positive: long from 15:30 to 16:00. Negative: short. | Sharpe 1.08, 1993 to 2013 |
| 5 | **Rest of the day predicts the last half hour** (Baltussen, Da, Lammers, Martens 2021) | Return from yesterday's close to 15:30. Positive: long 15:30 to 16:00. Negative: short. | Sharpe 1.73 before costs, 1974 to 2020 |
| 6 | The same, **only on big days** | As 5, but only when that return is at least 1% either way. The paper's mechanism (dealers hedging) is strongest on large moves; 1% is a round number chosen now, not fitted. | none: this is my one conditional variant |
| 7 | **Overnight drift** (Boyarchenko, Larsen, Whelan 2023) | Long from 02:00 to 03:00 New York, every night. | 1.48 bp a night, 1998 to 2020 |

Sizing: results are judged on **one unit of notional, no leverage**. Where a paper has its own sizing rule (test 1:
volatility target 2% a day, at most 4 times; test 2: 1% risk a trade, at most 4 times) that version is reported too.

Not tested: the pre-FOMC drift (8 events a year, far too few in two years).

## Costs, identical in every test

One tick of slippage on the way in and one on the way out, plus $0.61 a contract a side (Interactive Brokers, micro
contracts). The papers mostly assume no slippage at all; that difference is part of what is being tested. Each result
is also shown with double the slippage.

Days left out: US holidays and half days, days with a hole in the data, the first 14 days (test 1 needs them), and for
tests that use yesterday's close, the 8 days on which the contract rolled.

## Pass mark, fixed now

Seven tests means one of them can look good by luck. So the bar is higher than for a single test.

- **Evidence of an edge:** t-statistic of the daily results at least **2.6**, positive in **both** years, positive on
  **both** ES and NQ, and still positive with double slippage.
- **Promising, not proven:** t-statistic at least 2.0 and positive on both markets.
- **Not shown:** anything less.

With about 490 trading days, a strategy needs an annual Sharpe ratio of roughly 1.9 to reach t = 2.6. A real but
modest edge (Sharpe 0.5 to 1) cannot be proven on two years of data, in either direction. That limit is stated here
so that "not shown" is read correctly: it means not shown.

## What happens with the outcome

Whatever comes out is reported, including if all seven fail. Nothing is adjusted and re-run to rescue a result.
