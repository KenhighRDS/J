# MT5 files

- `J_Signal.mqh` — drop-in include for your Expert Advisors (sender). Copy to `MQL5/Include/`.
- `J_Tracker.mq5` — read-only tracker EA for subscribers (works with the investor password). Copy to `MQL5/Experts/`, compile, upload the `.ex5` to the releases repo.
- `source/` — put your EA sources here; each one is integrated with the three lines below and its trading logic stays untouched.

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
