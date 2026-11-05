# Design — J v1

## Stack (per spec)
React 19 + Vite + TypeScript, react-router, Tailwind v4 with design tokens from the logo (black, chrome gradient, Inter + JetBrains Mono self-hosted). Supabase (Postgres + RLS, Auth email OTP, Edge Functions on Deno, pg_cron, pg_net, Storage). Firebase Cloud Messaging HTTP v1 from edge functions. Capacitor 8 for Android with a native Kotlin plugin `JAlert`. Netlify hosting. MQL5 sources committed, compiled by Wolf.

## Key decisions
- One codebase, one repo (this one). Spec names `j-app`/`j-releases`; this session can only push to `KenhighRDS/J`, so the APK release flow targets a `j-releases` repo that Wolf creates (documented in SETUP.md); until then CI uploads the APK as a GitHub Release on this repo.
- Writes to shared tables only through SECURITY DEFINER RPCs or edge functions with the service role; clients read via RLS.
- Push sender: one shared module `_shared/fcm.ts` (OAuth2 JWT → access token, cached in a `fcm_tokens` table row with expiry) used by dispatch-signal, re-ring, follow-ups, close question, reports, Wann.
- Receipt state machine lives in SQL (`receipt_apply`), one function, called from RPCs (swipe/skip/copy), edge functions (tracker, close answer, expiry) so precedence rules are in one place.
- iPhone recipe followed verbatim (scope `/push/`, self-contained SW, unique tags, worker is the only renderer, re-ring cron every 15 s).
- Android: data-only high-priority FCM → `JFirebaseMessagingService` → `JAlert` (CallStyle notification + full-screen activity + ringtone/vibration loop). Native actions call `receipt-action` with device_id + device_secret.
- Reports and promo images: one hidden `ShareCard` component rendered with html-to-image at 1080×1350 / 1080×1920.
- Cron: hourly `scheduler` edge function decides in America/New_York; `tick` every 15 s for re-rings + expiries; `wann-sync` every 15 min.
