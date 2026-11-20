# TJR backtest results

Run on 20 November 2026, following `research-protocol.md` (committed before the validation and test stretches were
opened). Everything here is a **hypothetical backtest** of fixed rules on past data, after costs. No order was placed
in a real or a paper account. Reproduce with `tjr/research/run.sh` on the same two data files.

## The short answer

**No edge was shown.** On two years of real NQ data:

- The models as the brief specifies them (A to D) almost never trade: **5 trades or fewer in two years**, and those
  few lost.
- The best setting found for the baseline on the first 18 months **lost on the last 6 months** it had never seen.
- The experimental model E (the source read as timeframes) was positive for 18 months and negative for the last 6.
  Over the whole two years it is **+0.16 R a trade, give or take 0.18**: not distinguishable from zero.

The samples are small, so the fair wording is "not shown", not "proven worthless". It is not something to put money
on as it stands.

## Data

| | NQ | ES |
|---|---|---|
| Bars (1-minute) | 701,769 | 702,151 |
| First / last | 25 Nov 2024 / 19 Nov 2026 | same |
| Contracts | NQZ4 … NQZ6 (9, 8 rolls) | ESZ4 … ESZ6 |
| Gaps over 5 minutes inside a session | 12 | 11 |
| SHA-256 | `9b1ca1965f15…c977d` | `a54924bec62a…ffccc` |

Source: Massive futures aggregates (bars built from trades), Futures Basic plan, downloaded 20 Nov 2026. Each
contract's own prices, no adjustment. Costs: $0.61 a contract a side, 1 tick of slippage in and out, stop assumed
first when a bar touches both. Trades are booked in MNQ on a research equity of $100,000 at 0.5% risk; results are
read in R.

## Experiment 1: the models as specified, whole period

| Model | Trades | Wins | Average R a trade (± standard error) | Net | Profit factor | Largest drawdown |
|---|---|---|---|---|---|---|
| A baseline | 5 | 1 | −0.57 (± 0.27) | −$1,083.52 | 0.10 | $1,083.52 |
| B + inverse FVG | 2 | 0 | −1.01 | −$661.38 | 0 | $661.38 |
| C + SMT | 2 | 0 | −0.60 | −$355.32 | 0 | $355.32 |
| D + both | 1 | 0 | −1.00 | −$269.22 | 0 | $269.22 |
| **E experimental** | **63** | 24 (38.1%) | **+0.16 (± 0.18)** | +$5,252.66 | 1.36 | $3,738.24 (3.5%) |

Why A to D hardly trade, from the baseline's funnel:

| Step | Count |
|---|---|
| Liquidity sweeps, any time of day | 3,174 |
| … completed inside 09:30 to 11:30 | 871 |
| … followed by a break of structure within 6 bars | 205 |
| … then a higher low / lower high | 156 |
| … then a close beyond the continuation candle (the trigger) | 107 |
| … with the nearest opposing liquidity at least 2R away | **5** |

At the trigger the stop (beyond the sweep extreme) is already far away, and the nearest untouched level is close: in
the 90 refused cases it was a median **0.47R** away. The "nearest liquidity, at least 2R" rule and the "enter after
BOS, pullback and break" rule pull against each other.

Model E, in more detail:

- Exits: 31 stopped, 25 closed at 11:30, 7 reached the target.
- Long 31 trades, −0.08 R in total. Short 32 trades, +10.4 R in total. All of the gain came from shorts.
- 45 of the 63 entries had SMT as their 5-minute confirmation: it is the quickest of the choices to become true.
- By entry hour: 09:30–10:00 10 trades, +5.4 R; 10:00–11:00 39 trades, −0.8 R; 11:00–11:30 14 trades, +5.6 R.
- Longest losing run: 7. Reshuffling the same 63 results 2,000 times: 17% of the orderings end in a loss.

**At $10,000** (the brief's scale): model E gives 64 signals, and 57 are refused because one MNQ contract would risk
more than the $50 budget (0.5%). Seven trades are left. The stops this method produces (median 48 NQ points, about
$97 a micro contract) are too wide for a $10,000 account at 0.5% risk. Model A: none of its 5 signals fits.

## Experiment 2: walk-forward, model A

Train 7 Dec 2024 → 28 Nov 2025. Validation → 25 May 2026. Test → 19 Nov 2026.

- 48 settings on train. 36 had at least 15 trades; their average R ranged from −0.26 to +0.15, median +0.06; 61%
  were above zero. Nothing stood out.
- The five best on train, then on validation:

| Target | BOS swing | BOS within | Train | Validation |
|---|---|---|---|---|
| First liquidity at least 2R away | 1 bar | 6 bars | 29 trades, +0.15 R | 20 trades, +0.12 R |
| First liquidity at least 2R away | 1 bar | 9 bars | 29 trades, +0.15 R | 20 trades, +0.12 R |
| Fixed 2R | 1 bar | 6 bars | 43 trades, +0.10 R | 31 trades, +0.04 R |
| Fixed 2R | 1 bar | 9 bars | 43 trades, +0.10 R | 30 trades, +0.03 R |
| Fixed 3R | 1 bar | 6 bars | 43 trades, +0.09 R | 31 trades, −0.00 R |

- Frozen choice: first liquidity at least 2R away, stop beyond the sweep, 1-bar swing, BOS within 6 bars
  (protocol `6a3c4bf6d68908d5`).
- **Test, opened once: 14 trades, 3 wins, −0.38 R a trade (± 0.15), net −$1,908.18, profit factor 0.19.**
  5 stopped, 9 closed at 11:30, none reached its target.

## Experiment 3: walk-forward, model E

Same split. (For model E the "structure" stop is the same as the sweep stop, so the 12 settings are really 6.)

| Target | Train | Validation |
|---|---|---|
| Nearest liquidity, at least 2R (the default) | 28 trades, +0.47 R | 16 trades, +0.24 R |
| Nearest liquidity, at least 1R | 60 trades, +0.23 R | 32 trades, +0.03 R |
| First liquidity at least 2R away | 95 trades, +0.16 R | 55 trades, +0.08 R |
| Fixed 3R | 115 trades, +0.13 R | not in the top five |
| Fixed 2R | 114 trades, +0.03 R | |
| Fixed 1.5R | 115 trades, −0.04 R | |

- Frozen choice: the default (protocol `7ac7e635cf207ff3`).
- **Test, opened once: 17 trades, 4 wins, −0.28 R a trade (± 0.23), net −$1,882.04, profit factor 0.52.**

## Against the bar set in advance

The protocol asked for, on the test stretch: average R more than two standard errors above zero, at least 30 trades,
train and validation agreeing. Neither model has 30 test trades, and both are **below** zero there. **Not shown.**

## What this does and does not say

- It says these mechanical readings of the screenshot, on NQ, 09:30 to 11:30, over these two years, did not make
  money after costs once tested on unseen months.
- It does not say the author's own trading fails. He decides by eye; the source gives a sequence, not definitions, and
  every definition here is a hypothesis (`strategy-spec.md`). Step 2b of the source could not even be read.
- Two years is all the free data plan gives. Model E's 63 trades leave an uncertainty of about ±0.37 R around its
  average; a real edge of +0.1 R could hide in that, and so could a loss.

## Limits of this test

- One index (NQ), one session, 1-minute bars: when a bar touches stop and target, the stop is assumed.
- Bars are built from trades; no order-book data, so queue position and partial fills are not modelled.
- Levels are rebuilt at each contract roll, so the first days after a roll have fewer levels.
- The whole-period run of the default settings (experiment 1) was made before experiment 3; it used no information
  from the test stretch to choose anything.

## If the work continues

1. **More history first.** Databento quotes about $40 for five years of 1-minute bars on these four contracts, inside
   its $125 new-account credit (`providers.md`). That would take model E past 150 trades and show whether the first
   18 months or the last 6 were the exception.
2. **Forward paper test**, free: replay each session after it ends and let the record build.
3. Only then think about a broker. Nothing here justifies live orders.
