# TJR liquidity sweep: strategy specification

Rules version **0.1.0** (`tjr/jtjr/config.py`). This document says exactly what the code does, and keeps apart what
the source shows from what was filled in. Nothing below is presented as "exact TJR".

## 1. The source

One screenshot of a short video, supplied by the owner: `docs/tjr/source-screenshot.jpg`. The note on screen reads,
as far as it is legible (the right edge is hidden by the app's buttons):

```
1: liquidity sweep(1hr, 4hr, session highs/lows)
2: 5 confirmation conf (bos,ifvg,smt,79% ext)
2b: IF the liq sweep happens during premarket or a dif sess…        [rest hidden]
3: 5 continuation conf (eq or fvg or if 2b happens a smt div…      [rest hidden]
4: 1 confirmation conf (bos,ifvg,smt,79%ext)
5: enter
6: target prev draws on liq in our direction
```

### How "5" and "1" are read here

The brief that came with the screenshot reads steps 2 to 4 as *five* reversal confirmations, *five* continuation
confirmations and *one* final confirmation. Read against the rest of the note, the numbers look like **timeframes**:

- step 2: a **5-minute** confirmation confluence (one of BOS, iFVG, SMT, 79% extension);
- step 3: a **5-minute** continuation confluence (equilibrium or FVG);
- step 4: a **1-minute** confirmation confluence (the same four choices as step 2).

Reasons: steps 2 and 4 list the same four items, and there are only four, so "five of them" cannot be met; step 3
offers two alternatives joined by "or"; and "conf" after the number reads as "confluence". This is an interpretation
of an image, not a statement by the author, and it could be wrong. Model E below implements this reading and is
labelled experimental. The count reading is not implemented, because nothing in the source says what five distinct
confirmations would be.

## 2. What the source supports, and what is a hypothesis

| Element | In the source | In the code |
|---|---|---|
| Liquidity = 1H swings, 4H swings, session highs and lows | **Yes** (step 1) | Yes, plus previous-day and overnight highs and lows (from the brief), and optional equal highs / lows |
| Sweep = trade through a level, then reverse | Implied by "sweep" | Trade through by at least 1 tick, then a 5-minute close back across within 3 closes: **hypothesis** |
| BOS, iFVG, SMT as confirmations | **Named** (steps 2, 4), not defined | Mechanical definitions in section 4: **hypotheses** |
| 79% extension | **Named**, anchors not given | Off. A candidate definition exists for model E only: **hypothesis** |
| Continuation by equilibrium or FVG | **Named** (step 3), not defined | Model E: pullback to 50% of the leg, or back into a gap: **hypothesis** |
| Step 2b (sweep in premarket or another session) | Present, **unreadable** | Not modelled. Sweeps outside the session are ignored |
| Enter after the last confirmation | **Yes** (step 5) | Next bar's open after the trigger bar closes |
| Target = previous draws on liquidity in the trade direction | **Yes** (step 6) | Nearest untouched opposing level |
| Stop | **Not in the source** | One tick beyond the sweep extreme: **hypothesis** (ATR and structure stops as experiments) |
| All numbers (6 bars, 12 bars, 2R, pivot sizes, 09:30 to 11:30) | **Not in the source** | Test parameters from the brief |
| Instruments, session | **Not in the source** | NQ / ES and their micros, 09:30 to 11:30 New York, from the brief |
| Higher low, break of the continuation candle (models A to D) | **Not in the source** | The brief's baseline: **hypothesis** |

## 3. Time

- Bars are stamped with their **open** time, UTC. Nothing acts on a bar before it has closed.
- Sessions are New York times (`America/New_York`), daylight saving included.
- The CME trading day runs 18:00 to 17:00 New York; Monday's day opens Sunday 18:00.
- 5-minute, 15-minute and 1-hour bars are cut on the clock; 4-hour bars start at 18:00.
- At a contract roll (a change of contract in the data file) all levels and structure are thrown away and rebuilt:
  the old contract's prices do not carry over. Any open position is closed.

## 4. Definitions

### Liquidity map (`market.py`, class `Liquidity`)

| Level | Becomes usable | Default |
|---|---|---|
| Previous trading day high / low | 18:00, when the day is over | on |
| Overnight high / low (18:00 to 09:30) | 09:30 | on |
| Session high / low: Asia 18:00–03:00, London 03:00–08:00, premarket 08:00–09:30, NY morning 09:30–12:00, NY afternoon 12:00–17:00 | when that session ends | on |
| 1H and 4H swing high / low: higher (lower) than the 2 bars before and not exceeded by the 2 bars after | at the close of the second bar after it | on |
| Equal highs / lows: two confirmed 15-minute pivots within 4 ticks | when the second is confirmed | **off** |

A level is used only from the moment in the middle column: a pivot never counts on its own candle. Levels older than
10 days are dropped. A level is consumed the first time price trades through it.

### Sweep and reclaim

- **Breach:** a 1-minute bar trades through a level by at least `sweep_min_ticks` (1).
- **Sweep (long):** a 5-minute bar then **closes back above** the level, within `reclaim_timeout_bars` (3) closes,
  the breaching bar included. Short: mirror.
- No close back in time: the level was **broken**, not swept. No setup.
- The **sweep extreme** is the furthest price reached while the level was breached.
- Only sweeps that complete inside the session count (`sweep_in_session_only`).
- If the same move sweeps more levels, they join the one setup.

### Break of structure (BOS)

A 5-minute **close** beyond the most recent confirmed 5-minute swing (2 bars each side) that was made before the sweep
began and had not already been closed through. It must come within `bos_window_bars` (6) bars of the sweep.

### Higher low / lower high, and the continuation candle (models A to D)

After the BOS, a small swing (1 bar each side) that stays inside the sweep extreme. Its candle is the continuation
candle. The **trigger** is a later 5-minute close beyond that candle's high (long) or low (short).

### Fair value gap (FVG) and inverse FVG

- **FVG:** three candles where candle 3's low is above candle 1's high (bullish) or candle 3's high is below candle
  1's low (bearish), by at least `fvg_min_ticks` (1). Known at candle 3's close.
- **Inverse FVG:** a candle **closes right through** a gap. A bearish gap closed above now counts for longs.
- **Void:** a candle closes back through the far side of an inversed gap.
- **Validated iFVG (models B, D):** an opposing gap formed no more than `ifvg_lookback_bars` (12) bars before the
  sweep, inversed between the breach and the trigger, and not void.

### SMT divergence

The traded index sweeps a level while the other index (ES for NQ, NQ for ES) has **not** traded through the same
level of its own by the time of the trigger. "The same level" is the same day or session level, or a swing of the
same timeframe made within one bar of that timeframe. If the other index has no matching level, its own extreme
around the time ours was made is used (`smt_window_bars`, 6).

### 79% extension (off)

Not defined by the source. Candidate used only if switched on, and only in model E: a 5-minute close beyond 79% of
the leg from the sweep extreme back to the swing that a BOS would have to break.

## 5. Entry models

| Model | Requires | Status |
|---|---|---|
| **A** | sweep + reclaim, BOS within 6 bars, higher low / lower high, close beyond the continuation candle | Baseline |
| **B** | A, plus a validated inverse FVG | |
| **C** | A, plus SMT | Needs both indices |
| **D** | A, plus inverse FVG and SMT | Needs both indices |
| **E** | sweep; a 5-minute confirmation (BOS, iFVG or SMT; 79% if on); a 5-minute continuation (pullback to the middle of the leg, or back into a gap that holds); a 1-minute confirmation (1-minute BOS or 1-minute inverse FVG) | **Experimental reconstruction** |

B, C and D can only ever take a subset of A's trades: they are filters. A setup expires `setup_expiry_bars` (12) bars
after the sweep, and dies at once if price trades back beyond the sweep extreme.

## 6. Entry, stop, target, risk

- **Entry:** market, at the next 1-minute bar's open after the trigger bar closes.
- **Stop:** one tick beyond the sweep extreme. Experiments: under the higher low (`structure`), or 1.5 × ATR(14).
- **Target:** the nearest untouched opposing level, which must be at least 2R away at signal time or the trade is
  skipped. Experiments: the first level that is 2R away; fixed 1.5R to 3R; a partial exit; stop to break-even;
  trailing behind 5-minute swings.
- **Session:** no new entry within 10 minutes of 11:30; everything is flat at 11:30 New York.
- **Risk:** 0.5% of equity a trade, at most 2 trades a day, stop for the day after 2 full losses, one trade at a
  time. Size = budget ÷ (stop distance + slippage, in dollars, plus fees), whole contracts; if that is less than one
  contract the trade is skipped.

## 7. How a backtest fills orders (`execution.py`)

- Entry at the next open, plus 1 tick.
- A stop fills at its price or worse (at the open if the bar gapped through), minus 1 tick.
- A target fills only if price trades **through** it by 1 tick.
- If one 1-minute bar touches both stop and target, it is counted as the stop.
- Fees: $0.61 a contract a side (Interactive Brokers' all-in figure for micros, see `providers.md`).

## 8. No look-ahead

The engine is fed one 1-minute bar at a time and can only read bars it has already been given; the backtest and the
paper service drive the same object. A test (`test_cutting_the_tape_anywhere_never_changes_what_was_already_decided`)
cuts a tape at several points and checks that everything decided before the cut is identical to the full run.

## 9. Unknown, and left unknown

- Step 2b and the end of step 3 of the source.
- What the author counts as a valid BOS, FVG or SMT in detail, and his stop.
- Whether the author trades this session, these instruments or these timeframes exclusively.
