# J — project overview (for future sessions)
- Product: live MT5 trade signals → invited subscribers (Android call-style alert, iPhone PWA push). Spec: docs/SPEC.md. Setup for the owner: SETUP.md.
- Code map: src/routes (Login, Code, Welcome, Home, Signal, Wann, Reports, Report, Settings, Alerts, Tracker, admin/*), src/components (SignalCard, WannCard, SwipeConfirm, CopyRow, PromoCard, ShareCard, NotificationsCard, PushListener, BiometricGate), src/lib (supabase, auth, webPush, native, lot, format, share, biometric, update).
- Backend: supabase/migrations (schema, functions = receipt engine + RPCs, rls, cron, push, tracker, reports), supabase/functions (ingest-signal, dispatch via _shared, tick, scheduler, wann-sync, tracker-report, receipt-action, admin-*). Tests: supabase/tests/run.sh (local Postgres), npm test (lot math).
- Android: android/app/src/main/java/com/jsignals/app (JAlertPlugin, JAlerts, SignalAlertActivity, JFirebaseMessagingService, JActionReceiver, JStore, JApi). CI: .github/workflows/apk.yml ([apk]/[release] commits).
- MT5: ea/J_Signal.mqh (sender), ea/J_Tracker.mq5 (subscriber tracker).
- Wann: j-feed lives in the wann repo (branch j-feed, deployed to project nuwnrrkfvhhirlgftqfq); J pulls it with wann-sync every 15 min.
- Receipt precedence: tracker > swipe/skip > close_answer > copy heuristic > expiry (SQL receipt_apply).
