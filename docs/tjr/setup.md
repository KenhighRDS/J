# TJR module: setup

Nothing here is switched on by a deploy. After deploying, the module sits in **Admin → TJR** with the mode Off, live
trading locked and no worker connected.

## 1. Put the J side live (owner says "deploy")

- Migration `20261120000100_tjr.sql`: tables for versions, runs, trades, journal, jobs, data files and one state row.
  Admin-only.
- Function `tjr-worker` (no JWT check; it has its own key): the worker's only door into J.
- The web app and the Android build, as usual.

## 2. Start the worker

The worker is the Python program in `tjr/`. It runs wherever you like (your PC is fine); it connects out to J.

```bash
cd tjr
python -m pip install -e ".[data]"
```

In the app: **Admin → TJR → Setup → Make the worker key**. Copy the two values it shows:

```bash
export J_TJR_URL="https://<project>.supabase.co/functions/v1/tjr-worker"
export J_TJR_KEY="jt_..."        # shown once; keep it out of any file that gets committed
```

Get the price files (free Massive futures plan, two years; 5 requests a minute, about 10 minutes):

```bash
export MASSIVE_API_KEY="..."
python -m jtjr fetch-massive --symbols NQ ES --start 2024-11-25 --end 2026-11-20 --out data
```

Then leave this running:

```bash
python -m jtjr worker --data NQ=data/NQ_1m_2024-11-25_2026-11-20_massive.csv ES=data/ES_1m_2024-11-25_2026-11-20_massive.csv
```

The desk shows the worker Online. **Backtests → Run a backtest** now works: the request waits in J, the worker runs
it on its files and stores the result.

To store the three experiments of `results.md` in the app:

```bash
python -m jtjr compare --data NQ=... ES=... --set risk.start_equity=100000 --publish --label "As specified" --out reports/exp1
```

## 3. What each control does

| Control | Where | Effect |
|---|---|---|
| Mode: Off / Paper / Live | Desk | What the worker is allowed to do. Live cannot be chosen while the lock is closed. |
| Stop everything | Desk | Mode to Off, live locked again; the worker closes what is open and takes nothing new. Clearing it restarts nothing. |
| Live lock | Setup | Opens only when `ENABLE LIVE TRADING` is typed exactly. |
| Worker key | Setup | Lets the worker store runs and take jobs. It cannot change the mode, the stop or the lock. |

Real orders need all three at once: the lock opened, Live chosen, and a switch on the worker's own machine. The
worker has **no broker connection yet**, so today none of this can send an order.

## 4. Not built yet

- **Paper trading as a running service.** The simulated book and its risk limits exist and are tested (they are what
  the backtests run on), but nothing feeds them fresh bars yet. The free data plan releases bars about 8 hours late,
  so the first version would replay each session after it ends.
- **Broker adapter and live orders.** Waiting on the choice of broker (`providers.md`), and on results that justify it.

## 5. Checks

```bash
cd tjr && python -m pytest -q                 # engine, fills, data, worker link
npm test && npm run typecheck && npm run lint # app
bash supabase/tests/run.sh                    # database: admin-only access, live lock, emergency stop
```
