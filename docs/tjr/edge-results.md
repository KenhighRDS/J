# Looking for a real edge: results

Run once on 20 November 2026, with the code committed at 01:52 UTC, following `edge-protocol.md` (committed at
01:49 UTC, before the run). Reproduce with `python -m jtjr lab --data NQ=… ES=…` from `tjr/`.

## The short answer

**None of the seven published strategies passes.** On ES and NQ from 17 December 2024 to 18 November 2026 (about 475
trading days), after realistic costs, not one reaches the "promising" mark, let alone "evidence of an edge".

Simply holding the index over the same days made **+19.8% (ES) and +21.7% (NQ)**. No strategy below beat that.

Two things in the results are worth following up. Neither is proven:

1. Intraday momentum is still positive on NQ (not on ES).
2. The last half hour of the day now tends to **reverse** the day's move, the opposite of what was published. This
   was noticed in the results, so it is a lead and not a finding. It needs data that has not been looked at yet.

## The seven tests

Net of costs: one tick of slippage each way plus $0.61 a contract a side. One unit of notional, no leverage.
"t" is the t-statistic of the daily results; the pass mark was 2.6 (2.0 for "promising").

| # | Strategy | Market | Trades | Before costs | **After costs** | t | 2025 | 2026 | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Noise-area intraday momentum | NQ | 389 | +19.1% | **+17.4%** | 1.26 | +9.2% | +6.6% | |
| | | ES | 428 | +3.5% | **−1.2%** | −0.13 | −0.6% | −3.0% | not shown |
| 2 | 5-minute opening range breakout | NQ | 472 | +4.4% | **+2.3%** | 0.19 | +1.2% | +1.0% | |
| | | ES | 471 | +5.7% | **+0.4%** | 0.05 | −1.8% | +3.1% | not shown |
| 3 | VWAP trend | NQ | 7,635 | +8.7% | **−25.9%** | −1.14 | −5.6% | −20.6% | |
| | | ES | 8,047 | −2.3% | **−92.1%** | −4.73 | −49.5% | −44.3% | not shown |
| 4 | First half hour predicts the last | NQ | 466 | −0.4% | **−2.5%** | −0.41 | −4.3% | +1.1% | |
| | | ES | 467 | −4.0% | **−9.2%** | −1.93 | −3.1% | −4.0% | not shown |
| 5 | Rest of day predicts the last half hour | NQ | 466 | −10.7% | **−12.8%** | −2.15 | −10.9% | −3.4% | |
| | | ES | 468 | −10.3% | **−15.5%** | −3.28 | −8.2% | −8.0% | not shown |
| 6 | The same, days of 1% or more | NQ | 172 | −6.4% | **−7.1%** | −1.78 | −3.6% | −4.2% | |
| | | ES | 104 | −2.8% | **−4.0%** | −1.38 | −3.8% | −1.0% | not shown |
| 7 | Overnight drift, 02:00 to 03:00 | NQ | 473 | +5.9% | **+3.8%** | 0.97 | +0.2% | +3.8% | |
| | | ES | 476 | +3.3% | **−2.0%** | −0.68 | −2.5% | +0.6% | not shown |

What each one shows:

- **1. Intraday momentum.** The published Sharpe was 1.33. On NQ it is 0.92 here, positive in both years, with a
  largest drawdown of 7.9%; with the paper's own sizing (up to 4 times) +24.5% and a drawdown of 18.9%. On ES it is
  flat to negative, as three independent re-tests since publication also found. A t of 1.26 means this could easily be
  luck. It is the best of the seven and it is not enough.
- **2. Opening range breakout.** 340 of 472 NQ trades were stopped; 13 reached the 10R target. The paper assumed no
  slippage. Nothing left.
- **3. VWAP trend.** About 16 reversals a day. Before costs it is roughly zero; costs then take everything. The paper
  assumed no slippage.
- **4, 5, 6. Last half hour.** The published direction lost. See the lead below.
- **7. Overnight drift.** A small positive drift before costs (about 1 basis point a night), which the costs of
  getting in and out cancel. The authors themselves reported in July 2026 that it has averaged close to zero since 2021.

## Lead: the last half hour reverses

Test 5 lost on both markets in both years, with a t-statistic of −3.3 on ES. A strategy that loses that steadily is
the mirror image of one that wins. Recent research gives a reason: with daily-expiring options, dealers are now mostly
on the side that dampens moves, where they used to amplify them (Adams et al., 2026 working paper; the 2021 paper
itself showed its effect only existed when dealers were on the amplifying side).

**After-the-fact look** at the mirror image (go against the day's move from 15:30 to 16:00), on the same data that
suggested it. This is not a test and cannot count as evidence:

| | Market | Trades | Before costs | After costs | t after costs | 2025 | 2026 | Per trade, one micro contract |
|---|---|---|---|---|---|---|---|---|
| Every day | ES | 468 | +10.3% | +5.1% | 1.08 | +2.5% | +3.5% | about $3 |
| | NQ | 466 | +10.7% | +8.6% | 1.45 | +8.5% | +1.6% | about $9 |
| Days that moved 0.5% or more by 15:30 | ES | 249 | +9.2% | +6.4% | 1.67 | +3.8% | +3.5% | about $8 |
| | NQ | 287 | +10.7% | +9.4% | 1.79 | +8.0% | +2.1% | about $16 |

Even looked at kindly, after costs it does not reach t = 2 on the data that produced it, and it is small: a few
dollars a trade on a micro contract, against daily swings of a hundred or more.

### How it will be tested (fixed now, before any such data is seen)

- **Hypothesis 8:** on days when the market has moved at least 0.5% from the previous close by 15:30, it moves the
  other way between 15:30 and 16:00. Secondary: the same on every day.
- **Data not yet seen:** ES and NQ 1-minute bars from 1 June 2022 (S&P 500 options expiring on every weekday
  arrived in spring 2022) to 22 November 2024 (the last trading day before our data starts). And, separately, every new session after
  19 November 2026.
- **Costs:** the same.
- **Pass:** after costs, positive on both markets, and the t-statistic of the average of the two daily series at
  least 2.0. One hypothesis, one direction.
- Whatever comes out is added to this file.

The older data is not free. Databento quotes about $40 for five years of these bars, inside the $125 credit it gives
new accounts (`providers.md`). A free source of older index prices was tried and refused connections from this
environment.

## What the whole exercise says

- Published day-trading edges in the two most heavily traded index futures do not survive their own publication plus
  real costs. Three of the papers assumed little or no slippage; that assumption was most of their result.
- Two years of data cannot prove a modest edge. To reach the pass mark a strategy would need a Sharpe ratio near 1.9.
  "Not shown" means exactly that.
- The one thing that reliably paid over these two years was owning the index.

## Sources

Papers and the re-tests made after their publication (read 20 November 2026):

- Zarattini, Aziz, Barbon, "Beat the Market: An Effective Intraday Momentum Strategy for S&P500 ETF (SPY)", first
  version 10 May 2024: `alexandria.unisg.ch/server/api/core/bitstreams/a99aba00-f967-49b3-aceb-f544dc386e0b/content`.
  Re-tests after publication: `github.com/PazSheimy/spy-intraday-momentum-oos` (Sharpe 0.39),
  `github.com/giovannibrusco/zarattini-2024-momentum-spy` (ES −0.07), `github.com/NostroBenJ/intraday-strategy-replication` (ES −0.19).
- Zarattini, Aziz, "Can Day Trading Really Be Profitable?" (2023) and "Volume Weighted Average Price (VWAP) The Holy
  Grail for Day Trading Systems" (2023): `concretumgroup.com/papers`. Critique of the breakout paper:
  `kruegeralgorithms.com/en/research/opening-range-breakout-paper-replication`.
- Gao, Han, Li, Zhou, "Market intraday momentum", Journal of Financial Economics 2018. Out of sample: Rosa, Journal
  of Futures Markets 2022.
- Baltussen, Da, Lammers, Martens, "Hedging demand and market intraday momentum", Journal of Financial Economics
  2021: `academicweb.nd.edu/~zda/intramom.pdf`. Adams et al., "0DTE options and volatility" (2026 working paper).
- Boyarchenko, Larsen, Whelan, "The Overnight Drift", Review of Financial Studies 2023; and their July 2026 note
  "The disappearing overnight drift": `libertystreeteconomics.newyorkfed.org/2026/07/the-disappearing-overnight-drift/`.
