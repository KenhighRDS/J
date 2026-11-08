# MT5 files

- `J_Signal.mqh` — drop-in include for your Expert Advisors (sender). Copy to `MQL5/Include/`. Sends SL/TP of 0 as "none"; merges trailing-stop moves to at most one update per position every 5 minutes (`J_SetUpdatePolicy(seconds)` changes it, 0 = every move). `J_OnTimer()` must be called from `OnTimer` so held updates go out.
- `J_Tracker.mq5` — read-only tracker EA for subscribers (works with the investor password). Copy to `MQL5/Experts/`, compile, upload the `.ex5` to the releases repo.
- `source/` — EA sources wired to J: `RetraceEA_XAUUSD.mq5` (gold, v3.2) and `JARVIS_v11_J.mq5` (USDJPY). Each one is integrated with the lines below; Telegram tokens are inputs, never stored here.

## Integrate J_Signal.mqh into an EA (three lines)

```mql5
#include <J_Signal.mqh>
input string InpJKey = "";                // from J → Admin → EA sources

int OnInit() {
  J_Init("https://ismyqqqfmvvlupufcqys.supabase.co/functions/v1/ingest-signal", InpJKey, "XAU EA", InpMagic);
  EventSetTimer(5);
  // ... your init
  return INIT_SUCCEEDED;
}
void OnTradeTransaction(const MqlTradeTransaction& t, const MqlTradeRequest& rq, const MqlTradeResult& rs) { J_OnTradeTransaction(t, rq, rs); }
void OnTimer() { J_OnTimer(); /* ... */ }
```

MetaTrader: Tools → Options → Expert Advisors → Allow WebRequest for listed URL → add `https://ismyqqqfmvvlupufcqys.supabase.co`.
