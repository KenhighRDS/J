# Design

- **One edge function, many short runs.** `stocks` is called by pg_cron once a minute only while there is work
  (`private.stocks_due`). A scan is a row in `stock_scans` with its candidates in `stock_candidates`; each run enriches
  a batch or finalises two picks, so the work fits the free limits and the 150-second function limit. Rejected over a
  GitHub Actions job: that needs secrets in a second place and its schedule drifts.
- **Rules are pure.** `_shared/stockRules.ts` has no network or database code, so node tests run it as shipped.
- **Stocks are not receipts.** A pick is not time-critical to the minute, so it has no ring, countdown or copy rows.
  Picks are readable by every active member; what a member put in lives in `stock_positions`.
- **Money on receipts.** `stake_usd`, `payout_usd`, `profit_usd` are added to `receipts`; a new RPC
  `receipt_set_money` sets them, so `receipt_take` keeps its signature. Portfolio totals are computed in the app.
- **Keys in `private.config`,** set from the admin page through `admin_set_data_key`, read only by the service role
  through `data_key`. Nothing to paste into the Supabase dashboard, and the app can never read a key back.
- **Never invented.** A missing number lowers the score or fails a filter. The description is the provider's text or
  absent. Investor holdings are the filed numbers with their date.
- **Existing APK keeps working.** A push of type `stock` falls through to the plain-notification branch on Android.
