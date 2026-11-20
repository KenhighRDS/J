# Add the TJR liquidity-sweep futures strategy

## Why
Wolf's brief of 19 Nov 2026 (`J_TJR_Futures_Strategy_Complete_Brief.docx`, with one screenshot of the source): build,
validate and integrate an automated liquidity-sweep strategy for index futures (NQ / ES and their micros) into the
existing J app. Not a separate app. Live orders off until Wolf says otherwise.

## What changes
- A Python package (`tjr/jtjr`): deterministic rules (liquidity map, sweep and reclaim, BOS, FVG / inverse FVG, SMT),
  five entry models (A to D from the brief, E an experimental reading of the source), an event-driven backtester on
  real 1-minute bars, walk-forward with a test stretch opened once, reports (JSON, CSV, HTML).
- The same engine and the same simulated book run automatic paper trading; live orders go through a broker adapter
  that is disabled and locked.
- A new admin module in J, "TJR": dashboard, candle chart with the reasons drawn on it, strategy builder with saved
  versions, backtest runs and comparison, trade journal.
- Verified provider costs (`docs/tjr/providers.md`) and a specification that separates what the source shows from
  what is hypothesis (`docs/tjr/strategy-spec.md`).

Decisions already taken (from the brief): Python for the engine, 5-minute signals, 09:30 to 11:30 New York first,
paper before live, no paid purchase or credential without Wolf's approval, never report a result that was not run.

## Scope
In: everything above. Out: sending these signals to members (the data licences are personal-use, so the module is
admin-only), any paid plan, switching live trading on.

## Acceptance (from the brief, section 11)
- J still works; the module is in its navigation.
- The screenshot is in the docs; unreadable wording stays marked unknown.
- A reproducible backtest runs on real data, or the blocked dependency is stated.
- A paper trade can be traced from market event to signal, order, risk check and journal.
- Live execution cannot be triggered by accident; authorisation and the emergency stop are tested.
- Every cost claim has an official source and a check date.
- Code, test results, reports, setup guide and a candid conclusion on profitability, even if it fails.
