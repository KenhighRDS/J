# TJR research protocol

Written and committed on 20 November 2026 **before** any setting was tried on the validation or test stretch. The
commit time of this file is the evidence. Results are in `results.md`.

## Data

| | |
|---|---|
| Source | Massive futures aggregates, 1-minute bars built from trades (`api.massive.com/futures/v1/aggs`), Futures Basic plan |
| Downloaded | 20 November 2026 |
| Instruments | NQ and ES, each contract under its own ticker (NQZ4 … NQZ6, ESZ4 … ESZ6), unadjusted prices |
| Period | 25 November 2024 to 19 November 2026 (the two years the plan allows) |
| Front contract | until 4 days before the third Friday of its month (CME's roll date), switched at 18:00 New York the evening before; levels are rebuilt at each of the 8 rolls |
| Size | NQ 701,769 bars |
| Not committed | the files stay in `tjr/data/` (licensed data); reports carry their SHA-256 |

Signals are computed on NQ, SMT on ES, and the trade is booked in MNQ (same prices, $2 a point).

## Assumptions, identical in every run

- Fees $0.61 a contract a side; 1 tick of slippage on entry, on stops and on timed exits.
- Entry at the next 1-minute open. A target fills only one tick through. Stop and target in one bar counts as the stop.
- Session 09:30 to 11:30 New York; flat at 11:30; at most 2 trades a day; stop after 2 full losses.
- Risk 0.5% a trade on a **research equity of $100,000**, so that position size is not what decides whether a trade
  exists. Separately reported: what the same signals do at $10,000.
- Results are judged in **R** (net result ÷ planned risk), which does not depend on account size.

## What was already seen before this file

One run of model A with its default settings over the whole period, to check that the data and the engine work: 871
in-session sweeps, 107 entry triggers, 5 signals, 0 trades at $10,000. No profit or loss of any variant was seen.

## Experiment 1: the models as specified

Models A, B, C, D and E with the default settings in `tjr/jtjr/config.py` (rules 0.1.0), whole period. Nothing is
tuned, so the whole period may be used. Expected to be a small sample; reported as it comes out.

## Experiment 2: walk-forward, model A

The period after a 12-day warm-up is cut in time order: **train** 50%, **validation** 25%, **test** 25% (about
7 December 2024 → late November 2025 → late May 2026 → 19 November 2026).

Grid, 48 settings, all tried on train:

| Setting | Values |
|---|---|
| Target | nearest liquidity ≥ 2R (baseline) · first liquidity ≥ 2R · nearest liquidity ≥ 1R · fixed 1.5R · fixed 2R · fixed 3R |
| Stop | beyond the sweep extreme · beyond the higher low / lower high |
| Swing size for the BOS | 1 or 2 bars each side |
| BOS must come within | 6 or 9 bars |

Selection: the 5 best on train by average R a trade, among settings with at least 15 train trades, are run on
validation; the best of those on validation (at least 7 trades) is frozen. It is then run **once** on the test
stretch. The ledger (`tjr/reports/test-ledger.json`) counts every use of a test stretch.

## Experiment 3: walk-forward, model E (experimental)

Same split and selection. Grid, 12 settings: the six targets above × the two stops.

## What will be reported, whatever comes out

Trade count, net result, win rate, average R with its standard error, profit factor, drawdown, costs, long and short,
by month and by hour, and how many setups were refused and why. Fewer than 100 trades is called a small sample.
If the test stretch disagrees with train and validation, the test stretch is what counts.

## What would count as evidence of an edge

On the **test** stretch: average R clearly above zero (more than two standard errors), from at least 30 trades, with
train and validation pointing the same way. Anything less is "not shown".
