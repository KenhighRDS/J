# jtjr: the TJR liquidity-sweep engine for J

Deterministic rules, an event-driven backtester and the simulated book that also runs paper trading. Pure Python
(3.11+), no dependencies; `pandas` + `pyarrow` only if you feed it Parquet.

What the rules are, and which of them come from the source: `docs/tjr/strategy-spec.md`.
Where data and a broker can come from, and what they cost: `docs/tjr/providers.md`.

```bash
cd tjr
python -m pip install -e ".[dev]"
python -m pytest -q
```

## Real data

Nothing in this package invents prices. Download bars, or bring your own file (CSV or Parquet, 1-minute, bar open
time in UTC; see `jtjr/data.py` for the columns).

```bash
export MASSIVE_API_KEY=...   # never commit it
python -m jtjr fetch-massive --symbols NQ ES --start 2024-12-01 --end 2026-11-19 --out data
```

Files land in `tjr/data/`, which git ignores: licensed data must not be committed.

## Run

```bash
# one model
python -m jtjr backtest --data NQ=data/NQ.csv ES=data/ES.csv --model A --out reports/a

# models A to E on identical data and assumptions
python -m jtjr compare --data NQ=data/NQ.csv ES=data/ES.csv --out reports/compare

# train / validation / test; the test stretch is opened once and a second look is flagged
python -m jtjr walkforward --data NQ=data/NQ.csv --model A --out reports/wf

# change a setting
python -m jtjr backtest --data NQ=data/NQ.csv --set exits.min_rr=1.5 risk.start_equity=25000 --out reports/x
```

Each run writes `result.json` (everything, including the candles around each trade), `trades.csv` and `report.html`.
Every report states that it is a hypothetical backtest, the costs it assumed and the fingerprint of the data file.

## Layout

| File | What it holds |
|---|---|
| `config.py` | Every number, versioned (`RULES_VERSION`), with a fingerprint per setting |
| `clock.py`, `instruments.py` | New York time and CME trading day; contract multipliers and ticks |
| `market.py` | Bars, confirmed pivots, gaps, the liquidity map |
| `strategy.py` | Sweep → confirmations → signal, models A to E |
| `execution.py` | Risk checks, sizing, fills, kill switch (backtest and paper share it) |
| `backtest.py`, `metrics.py`, `walkforward.py`, `report.py` | Running it over history and saying what happened |
| `data.py`, `providers/` | Reading files with provenance; downloading |
