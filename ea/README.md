# MT5 files

- `source/XAU_RetraceEA_v3.2_NEW.mq5` — gold, v3.2 (the profitable one: Asian-session entries, see `research/`). Single file, J built in.
- `source/USDJPY_JARVIS_v11.2_J.mq5` — USDJPY opening-range breakout. Single file, J built in. The two stop orders stay in MT5 and are **not** sent; when one side breaks, J gets one market signal at the fill.
- `J_Signal.mqh` — the J code itself (source of truth). It is **copied into** each EA between the `J BRIDGE BEGIN/END` markers by `python3 ea/embed_bridge.py`; the EAs never include it, so nothing extra is installed in MetaTrader. Edit the .mqh, then run the script.
- `J_Tracker.mq5` — read-only tracker EA for subscribers (works with the investor password).
- `research/` — the gold backtest replay and its findings.

## What J gets from an EA

- Open (market, or a breakout fill), SL/TP moves (merged to one update per position every 5 minutes; breakeven at once), partial close, close.
- SL/TP of 0 means "none" and is sent as null.
- **Chart images** (input `InpJShots`, live only): about a minute after the open, a clean chart zoomed to the entry with "Nou achte la" / "Nou vann la" and the SL; after the close, the trade from entry to exit with "Nou close la" and the result in pips. Drawn on a temporary chart (no dashboard, no balance), sent to J, stored privately with the signal, and offered on the admin share card as one card with both images.

## Install

1. J → Admin → EA sources: create one source per EA and copy its key (shown once).
2. Copy the `.mq5` into `MQL5/Experts`, compile in MetaEditor.
3. Tools → Options → Expert Advisors → Allow WebRequest for `https://ismyqqqfmvvlupufcqys.supabase.co`.
4. Attach the EA, paste the key into `InpJKey`, and the Telegram bot token into its Telegram input (tokens are never stored in the code).
