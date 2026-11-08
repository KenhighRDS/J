# Gold RetraceEA research

Replays `source/RetraceEA_XAUUSD.mq5` on XAUUSD M1 bars in broker server time (New York + 7 h, GMT+2/+3), costs included, results in R (1 R = the 0.5 % stop).

```bash
python3 load_xauusd.py data            # DAT_MT_XAUUSD_M1_*.csv from HistData → data/m1_server.npz
python3 -c "from retrace_engine import *; stats(run(), 'v3.1', show_years=True); stats(run(entry_until=8, entry_from=65), 'v3.2', show_years=True)"
```

Findings (2015 – Jan 2026, $0.30 spread + $0.07/oz commission):

| | trades | total | PF | max DD |
|---|---|---|---|---|
| v3.1 as shipped | 1264 | +36.7 R | 1.08 | 28.0 R |
| v3.2 (entries 01:05–08:00 server) | 340 | +71.4 R | 1.49 | 10.6 R |

- The edge sits in Asian-session dips; dips at the London open (08–10 server) lost about −39 R. The window was chosen on 2015–2021 and holds on 2022–2026 (PF 1.62 / 1.41 for the 08:00 cut-off), and the result falls steadily as the window widens, so it is not a single lucky hour.
- Exit, stop, retrace depth and MA alternatives did not beat the v3 defaults in both halves, so they are unchanged.
- The v2 behaviour (re-entry on every tick below the threshold, trail from the first tick on the chart ATR) loses −60 R to −263 R with costs: the v3 fixes were right.
- Stress: PF 1.42 at a $0.50 spread, 1.38 at $0.80. Longest losing streak 8.

Not a promise of future results; confirm in the MT5 Strategy Tester ("Every tick based on real ticks") on your broker.
