# Design

## Where things run
J is a React app on Supabase (Postgres, TypeScript edge functions, pg_cron). It has no Python host and no broker or
market-data connection for futures. The brief asks for Python, so:

```
tjr/jtjr (Python)                          J (Supabase + React)
  rules + backtester + paper book   --->   tjr_* tables  <---  Admin > TJR pages
  worker: polls tjr_jobs, obeys            (runs, trades, journal, versions, state)
  tjr_state (mode, kill switch)
```

- The worker **pulls**: it reads jobs and the kill switch from J's database and writes results back. J never has to
  reach the machine the worker runs on, so the worker can sit on Wolf's PC, a small server or a scheduled cloud job.
- Backtests asked for in the app become rows in `tjr_jobs`; the worker runs them and stores the result.
- One engine object is driven by both the backtest and the paper service, so they cannot disagree.

## Why not TypeScript in an edge function
It would need no host, but the rules would then exist twice (Python for research, TypeScript for live) and could
drift. The brief asks for Python signal detection; one implementation is the safer design.

## Data
Bars are read from files (CSV / Parquet) with a recorded fingerprint. Licensed bars are never committed
(`tjr/data/` is ignored). First source: Massive's free futures plan (2 years of minute bars); fallback Databento.
Each contract keeps its own prices; levels are rebuilt at every roll.

## Safety
- Live trading has three locks: a database flag only an admin can set, a confirmation phrase typed in the app, and an
  environment variable on the worker. Missing any one, the live adapter refuses every order.
- Kill switch in `tjr_state`: the worker checks it every bar, closes what is open and stops.
- Daily loss lockout and trade limits live in the book and are covered by tests.
- The module is admin-only (RLS), because the data licences are for personal use.

## Honesty rules in code
- Every report carries a "hypothetical backtest" notice, the costs assumed and the data fingerprint.
- Fewer than 100 trades is flagged as a small sample.
- Model E and the 79% extension are marked experimental in results and in the app.
- A second look at a test stretch with other settings is counted and flagged.
