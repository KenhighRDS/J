# J — Claude Code Build Prompt
Nov 4, 2026 · @wolf kenny
## How to use this prompt
Paste everything below into Claude Code, attach the J logo (PNG, 1254×1254, chrome "J" on black), and let it build the whole system end to end. Part A is the spec; Part B is the guide for the steps only Wolf can do.
Instructions to Claude Code:
- You are building J, a real production app for paying subscribers — not a demo. Never write "demo", "sample" or "school project" in the UI.
- Build in the stages listed in Build order. After each stage: typecheck, build, commit, push to main. No mockups or screenshots for review — just build and push.
- Work economically: batch related changes, don't re-read files you just wrote, don't run long builds more than needed.
- Where you have CLI/MCP access (GitHub gh, Supabase, Netlify, Firebase), do the setup yourself. Where you need a secret or a click only I can do, stop and ask me with the exact step, then continue.
- The iPhone web push section is a proven recipe from my other apps (GER+ and 35K). Follow it exactly — do not substitute a "simpler" approach. iOS push is the most important feature after signal delivery itself.
- At the end, write SETUP.md in the repo: a complete step-by-step guide for every part I must do myself (Part B is the starting point — update it with the real names, URLs and values you created).
- All UI text in English.
## Product overview
J delivers live trade signals from my MT5 Expert Advisors to invited subscribers, who copy them manually into their own broker. The app rings like a phone call when a signal arrives, shows one full-screen card with everything to copy, and tracks who took each trade.
Core loop:
- One of my EAs opens a trade (market or pending) → the J_Signal.mqh module sends it to Supabase.
- Every active subscriber gets the signal at once:
- Android APK: call-style alert — full-screen over everything (even the lock screen), long vibration + ringtone until opened, skipped or expired.
- iPhone (web app on Home Screen): push notification; tapping it opens the signal card. Re-rings until opened (see iPhone section).
- The signal card is full screen, no scroll, with an expiry countdown and tap-to-copy on every field, including a lot size calculated for that subscriber.
- Subscriber swipes "I took it" or taps Skip. If they do neither, the app works out taken / not taken automatically (three layers, see Taken detection).
- Follow-ups from the EA (move SL to BE, close now, cancel pending, TP/SL hit) go only to subscribers who took the trade.
- When the EA closes the trade, anyone still uncertain gets one question: "did you catch it?"
- Every Friday and on the last day of each month, everyone gets a shareable results report.
Access: invite-only. Admin types an email → invite email → subscriber confirms → logs in with a 6-digit email code. Sessions last indefinitely; the APK adds fingerprint unlock.
Per-user access: every subscriber gets every EA by default; the admin can block any EA for a specific user (e.g. no XAU signals for one person). Wann signals — every 85%+ game my wann sports app sees in the coming week — are a second signal type, off by default and switched on per user by the admin.
## Stack, repos and infrastructure
One codebase: React + Vite + TypeScript web app, deployed to Netlify for iPhone/desktop, and wrapped with Capacitor for the Android APK, plus a small native Kotlin plugin for the call-style alert. All new projects — nothing shared with my other apps.
Piece
Choice
Name (default — confirm with me)
Repo
GitHub, private, branch main
KenhighRDS/j-app
Releases
Public repo for APK downloads + latest.json
KenhighRDS/j-releases
Backend
Supabase: Postgres + RLS, Auth, Edge Functions, pg_cron, pg_net, Storage
project J
Push
Firebase Cloud Messaging, HTTP v1 API from edge functions
project j-signals
Web hosting
Netlify, auto-deploy from main
site j-signals
Email
Resend SMTP plugged into Supabase Auth, my own domain
signals@<mydomain>
Android package
Capacitor app id
com.jsignals.app
MT5
MQL5 include J_Signal.mqh (sender) + J_Tracker.mq5 (subscriber tracker)
—
Rules:
- Env vars for the web build use the VITE_ prefix (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_FIREBASE_*, VITE_FIREBASE_VAPID_KEY). Netlify env vars only reach the next build — trigger a new deploy after setting them.
- Server secrets live only in Supabase secrets: FCM_SERVICE_ACCOUNT (full JSON), J_ADMIN_EMAILS, plus generated keys. Never ship them in the client.
- Edge functions that import _shared/ must be deployed with all shared files included.
- GitHub Actions minutes are limited: the APK build runs only on commits whose message contains [apk] or [release], never on every push.
- Android signing: a dedicated release keystore generated once, stored as GitHub Actions secrets (base64 keystore + passwords), never Expo/debug keys. The same key forever so updates install over old versions.
## Database model
Every table has RLS on. Subscribers read signals and their own rows; every state change goes through RPCs or edge functions, never direct client writes to shared tables. Admin (role admin) sees everything.
Table
Purpose
Key columns
profiles
One per auth user
id, email, name, role (admin/subscriber), status (invited/active/removed), balance, risk_pct (default 1), balance_source (manual/tracker)
invites
Invite history
email, invited_by, sent_at, expires_at (+7 days), accepted_at
devices
Push targets, many per user
user_id, platform (android/web), fcm_token (unique), device_secret_hash (for native notification actions), app_version, last_seen
ea_sources
My EAs
name, api_key_hash, active, last_seen
signals
One per trade the EA calls
ea_source_id, ea_uid (unique per source, idempotency), symbol, base_symbol, direction, order_type (market/buy_stop/sell_stop/buy_limit/sell_limit), entry, sl, tp, digits, pip_size, tick_size, tick_value, contract_size, vol_min, vol_step, vol_max, status (live/triggered/closed/cancelled/expired), expires_at, is_test, test_targets (user ids), close_price, result_pips, outcome (win/loss/be), close_reason
signal_events
Follow-ups and lifecycle
signal_id, type, payload jsonb, created_at
receipts
One per user per signal
signal_id, user_id, delivered_at, opened_at, copied jsonb (field → time), status (pending/opened/likely_taken/taken/skipped/missed/not_taken), status_source (swipe/skip/copy/tracker/close_answer/expiry), user_lot, ring_count, question_sent_at, answered_at, user_entry, user_close, user_pips
tracker_links
Subscriber Tracker EA pairing
user_id, key_hash, account_login, server, last_heartbeat
tracker_positions
Raw positions reported by trackers
user_id, ticket, symbol, type, volume, open_price, open_time, close_price, close_time, profit, matched_signal_id
reports
Generated weekly/monthly reports
user_id (null = app-wide), period (weekly/monthly), period_start, period_end, data jsonb
settings
Admin-tunable values
market_expiry_sec 120, re_ring_sec 30, match_tolerance_pips per base symbol, report_hour_ny 17
push_log
Delivery debugging
device_id, signal_id, fcm_status, error, created_at
Status rules for receipts: pending on delivery → opened when the card opens → taken (swipe or tracker match), skipped (Skip), likely_taken (all of entry/SL/TP/lot copied, no skip, at expiry), missed (never opened before expiry and no tracker match), not_taken (answered No at close). A tracker match always wins over every other source.
Also: user_source_blocks (user_id, ea_source_id) — a row blocks that EA for that user; they get no signal, follow-up or report line from it. receipts gets kind (ea/wann) and wann_call_id. wann_calls and wann_access are described in Wann signals.
## Signals from MT5
Write ea/J_Signal.mqh, a drop-in include that any of my EAs can use with three lines, and the ingest-signal edge function that receives it. I will put my EA sources in ea/source/; integrate the module into each one and keep their trading logic untouched.
Integration (all that an EA needs):
#include "J_Signal.mqh"int OnInit(){ J_Init("https://<ref>.supabase.co/functions/v1/ingest-signal", InpJKey, "XAU EA", InpMagic); EventSetTimer(5); ... }void OnTradeTransaction(const MqlTradeTransaction& t,const MqlTradeRequest& rq,const MqlTradeResult& rs){ J_OnTradeTransaction(t,rq,rs); }void OnTimer(){ J_OnTimer(); ... }
What the module does automatically (filtered by the EA's magic number, so manual trades are ignored):
- Pending order placed → open (order_type buy_stop/sell_stop/buy_limit/sell_limit). Market position opened → open (market).
- Pending filled → triggered (fill price). ea_uid = the order ticket, which MT5 reuses as the position identifier.
- SL/TP modified → update; if new SL equals entry (± 1 point) it is sent as move_be.
- Partial close → partial (closed lots, price). Full close → close (price, reason tp/sl/manual from the deal reason, result pips).
- Pending deleted or expired → cancel.
- Manual helper J_SendTest() for a test signal from the EA inputs.
Payload (JSON, all prices as numbers, sent with header X-J-Key):
{ "event":"open", "ea_uid":"123456789", "symbol":"XAUUSDm", "direction":"buy", "order_type":"buy_stop",  "entry":2341.50, "sl":2335.00, "tp":2355.00, "ea_lot":0.50, "expiry_sec":0,  "digits":2, "point":0.01, "pip_size":0.10, "tick_size":0.01, "tick_value":1.0, "contract_size":100,  "vol_min":0.01, "vol_step":0.01, "vol_max":100, "account_currency":"USD", "sent_at":"2026-11-04T21:30:00Z" }
Module rules:
- base_symbol is derived server-side by stripping broker suffixes/prefixes (XAUUSDm, XAUUSD.r, #XAUUSD → XAUUSD).
- pip_size default: digits 3 or 5 → 10 × point; XAU → 0.10; otherwise point. Admin can override per base symbol in settings.
- expiry_sec: market orders default 120 (from settings when 0); pending orders stay live until triggered or cancel.
- WebRequest timeout 3000 ms. On any failure, append the payload to a queue file and retry it every OnTimer tick, in order, until accepted. Never block trading logic.
- Skip all network calls in the Strategy Tester (MQL_TESTER) and log instead.
- Log a clear message if WebRequest fails with error 4014 (URL not in the allowed list), telling me to add it in Tools → Options → Expert Advisors.
ingest-signal edge function:
- Validates X-J-Key against ea_sources.api_key_hash; updates last_seen.
- Idempotent on (ea_source_id, ea_uid, event, sent_at) — retries never double-send.
- open → insert signal, create a receipts row for every active subscriber not blocked for this EA (and admins), then call dispatch-signal.
- Other events → insert signal_events, update the signal, and dispatch follow-ups (see Follow-ups). close stores close_price, result_pips, outcome and runs the close question.
## Android: call-style alerts
A new signal must behave like an incoming phone call: full screen over whatever is open (or over the lock screen), ringtone + long repeating vibration, and it keeps ringing until the user opens it, skips it, or the signal expires. Build this as a native Kotlin Capacitor plugin JAlert — JavaScript alone cannot do it when the app is killed.
Delivery:
- Signals go to Android as data-only, high-priority FCM messages (android.priority: HIGH, no notification block), so our own FirebaseMessagingService runs even when the app is closed or killed. TTL = seconds left until expiry.
- Register exactly ONE FirebaseMessagingService (ours). If @capacitor/push-notifications is used for token handling, remove its service from the merged manifest (tools:node="remove") and forward non-signal messages ourselves as normal notifications. Expose the FCM token to JS through the plugin.
The alert (type: signal):
- Notification channel j_signals: IMPORTANCE_HIGH, custom ringtone res/raw/j_ring.ogg with AudioAttributes.USAGE_NOTIFICATION_RINGTONE, long vibration pattern, lights on, public on lock screen.
- Notification built with NotificationCompat.CallStyle.forIncomingCall(person "J · XAUUSD BUY STOP", declineIntent = Skip, answerIntent = Open), CATEGORY_CALL, setFullScreenIntent(openIntent, true), setOngoing(true), FLAG_INSISTENT (sound + vibration repeat), setTimeoutAfter(msUntilExpiry).
- Full-screen SignalAlertActivity (showWhenLocked, turnScreenOn, excludeFromRecents): black screen, logo, big symbol/direction/order type, countdown, Open and Skip. It plays the ringtone on loop and runs a repeating VibrationEffect.createWaveform pattern itself, so ringing continues even if the system mutes the insistent notification. Stops on Open, Skip, expiry, or volume-button press (silence, keep the card).
- Open → launches the app straight to /signal/:id (the card), cancels the ring, marks opened. Skip → marks skipped without opening the app.
- When the phone is unlocked and in use: if "Display over other apps" is granted, launch the full-screen activity directly on top; otherwise Android shows the call-style heads-up banner, which stays and keeps ringing until acted on.
- A new signal while one is ringing replaces it (newest wins); the older one stays reachable in the app's signal list.
Native actions without the WebView: Skip, the close-question Yes/No buttons and "opened" receipts must work even when the app is not running. At device registration, generate a random device_secret, store it in EncryptedSharedPreferences and its hash in devices; the native code calls the receipt-action edge function with device_id + device_secret.
Permission checklist screen (first launch + Settings → Alerts, each row with status and a button that opens the exact system page):
- Notifications (Android 13+ POST_NOTIFICATIONS).
- Full-screen alerts — Android 14+: check NotificationManager.canUseFullScreenIntent(), else open ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT.
- Display over other apps (SYSTEM_ALERT_WINDOW, ACTION_MANAGE_OVERLAY_PERMISSION).
- Ignore battery optimization (ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS) + a Samsung note: Settings → Battery → Background usage limits → add J to "Never sleeping apps".
- Optional: Do Not Disturb access so the alert can ring through DND (setBypassDnd on the channel, ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS).
- A "Test alert" button that rings a fake signal locally in 10 seconds so the user can lock the phone and verify.
## iPhone web push — the exact recipe (critical)
This is how push was made to work on iPhone for my GER+ and 35K web apps. Reproduce every point; each one fixes a real failure we hit. Web push on iPhone needs iOS 16.4+ and works only for the site added to the Home Screen.
1. Head tags and manifest (index.html):
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black"><meta name="apple-mobile-web-app-title" content="J"><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest">
Status bar style must be black (opaque) — NOT black-translucent, which slides the page under the notch. Manifest: name "J", display: "standalone", start_url: "/", background_color and theme_color #000000, icons 192, 512 and 512 maskable.
2. Enable flow (src/lib/webPush.ts) — the whole flow must run inside the user's tap, or Safari refuses the permission prompt:
- await isSupported() from firebase/messaging; if false → unsupported.
- If Notification.permission === "denied" → show the "blocked" state and stop.
- await Notification.requestPermission().
- navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/push/" }) — its own scope /push/, never /. With / it replaces the PWA's app-shell worker and the two keep swapping and reloading the page.
- getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration }) → upsert into devices with platform: "web".
- On every app start where permission is already granted: register again, call getToken again and upsert (tokens rotate).
3. The service worker public/firebase-messaging-sw.js must be self-contained — no importScripts from gstatic/Firebase. That import fails in the background on iOS; Safari then silently drops pushes and eventually revokes the permission.
self.addEventListener("install", () => self.skipWaiting());self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));self.addEventListener("push", (e) => {  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { notification: { title: "J", body: e.data ? e.data.text() : "" } }; }  const n = d.notification || (d.webpush && d.webpush.notification) || {};  const data = d.data || {};  const title = n.title || data.title || "J";  const opts = { body: n.body || data.body || "", icon: "/icons/icon-192.png", badge: "/icons/badge-72.png", data,    tag: data.notification_id || `j-${Date.now()}`, renotify: true, requireInteraction: true };  e.waitUntil(Promise.all([    self.registration.showNotification(title, opts),    self.clients.matchAll({ type: "window", includeUncontrolled: true })      .then((ws) => ws.forEach((w) => w.postMessage({ type: "j-push", data })))  ]));});self.addEventListener("notificationclick", (e) => {  e.notification.close();  const route = (e.notification.data && e.notification.data.route) || "/";  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ws) => {    const w = ws.find((x) => "focus" in x);    if (w) { w.postMessage({ type: "j-open", route }); return w.focus(); }    return self.clients.openWindow(route);  }));});
- Every push must show a notification (Safari rule — silent pushes get the permission revoked).
- Every notification needs a unique tag + renotify: true. With a repeated tag iOS silently replaces the previous banner and the user sees and hears nothing.
- The worker is the only renderer. Do not also show a banner from the page's onMessage — 35K got double notifications that way. In the foreground the page just listens for j-push / j-open messages and navigates.
- netlify.toml: Cache-Control: no-cache and Service-Worker-Allowed: / for /firebase-messaging-sw.js.
4. Sender payload (FCM HTTP v1 with the service account, per web token). All data values must be strings:
{ "message": { "token": "…",  "notification": { "title": "XAUUSD · BUY STOP", "body": "Entry 2341.50 · SL 2335.00 · TP 2355.00 — tap to open" },  "data": { "notification_id": "<uuid>", "type": "signal", "signal_id": "…", "route": "/signal/…", "title": "…", "body": "…" },  "webpush": { "headers": { "Urgency": "high", "TTL": "<seconds until expiry>" },    "notification": { "title": "…", "body": "…", "icon": "/icons/icon-192.png", "badge": "/icons/badge-72.png", "tag": "<notification_id>", "renotify": true, "require_interaction": true },    "fcm_options": { "link": "/signal/…" } } } }
Delete the device row on UNREGISTERED / NOT_FOUND. Log every send in push_log.
5. Re-ring on iPhone. iOS web push cannot do long vibration, custom sounds, full-screen alerts or notification buttons. To get as close as possible to "rings until opened": a pg_cron job every 15 seconds re-sends the signal push to web devices whose receipt is still not opened, every re_ring_sec (30 s), until opened, skipped or expired. Each re-ring has a new unique tag so iOS alerts again. Title of re-rings: ⏰ XAUUSD BUY STOP — 1:30 left. When the card opens, close all of that signal's notifications (registration.getNotifications() filtered by data.signal_id).
6. Install guide and states (Settings → Notifications card, and a banner on first open):
- iPhone/iPad in Safari but NOT installed (/iPhone|iPad|iPod/ and not matchMedia("(display-mode: standalone)") / navigator.standalone) → hide the button, show: 1. Tap Share, 2. "Add to Home Screen", 3. Tap Add, then open J from the icon and tap Enable notifications.
- Installed → Enable notifications button. Denied → "Notifications are blocked — allow J in Settings → Notifications". Enabled → "Signals will reach this iPhone even when J is closed" + Send me a test button.
- Also tell iPhone users once: add J to the allowed apps of any Focus mode so signals aren't silenced.
7. iOS layout fixes that came with it: pad the app root with env(safe-area-inset-top). iOS reports a wrong viewport height on first paint in the installed app, so size the root from JS: --app-h = window.visualViewport?.height ?? window.innerHeight, set at load, after 250 ms and 1 s, and on resize / orientationchange / visualViewport.resize. The bottom menu is the last flex row of a fixed full-height frame, not position: fixed; bottom: 0.
8. Android browser bar: on Android browsers (not the APK, not installed PWA), a 30 px bar at the top, in flow: "Tap here to download the J app" → APK from latest.json (fallback: releases page); ✕ hides it for 14 days. Never on iPhone, never in the APK.
## Signal card
Route /signal/:id, opened from the alert, the push, or the signal list. Full screen, no scrolling on any phone down to 360×640 (size with --app-h, not 100vh). Opening it marks the receipt opened and stops all ringing for that signal on every device of that user.
Layout, top to bottom:
- Header: EA name, time received, close (✕) back to the list.
- Big line: XAUUSD · BUY STOP (buy in green, sell in red, muted tones on black).
- Countdown ring for market orders (expires_at); pending orders show LIVE — until cancelled.
- Tap-to-copy rows: Symbol · Direction · Order type · Entry · SL · TP · Your lot. Each row: label, value in large monospace with the signal's digits, copy icon. Tap → copies the plain value (no thousands separators), haptic tick, row turns to a check mark. Copy state is saved to receipts.copied immediately.
- Swipe to confirm "I took it" slider — locked until Entry + SL + TP + Lot are copied, or 10 seconds after opening (whichever comes first). Swipe → taken (source swipe), confetti-free subtle success state.
- Skip text button → skipped.
Lot size: lot = (balance × risk_pct / 100) ÷ (|entry − sl| ÷ tick_size × tick_value), rounded down to vol_step, clamped to vol_min/vol_max. Balance and risk % come from the user's settings (or from their Tracker EA when linked). If no balance is set, the lot row shows Set balance and opens a one-field sheet. Small hint under the lot: "Based on {risk}% of {balance} — check your broker's contract size." No SL → lot row shows "No SL — use your own size".
After the moment: the same route shows later states — Expired (not taken), Triggered (pending filled), Follow-up banners ("Move SL to BE"), Closed with result in pips and the user's status. "I took it" stays available until the signal closes, so a late swipe or tracker match can still turn missed into taken.
Signal list (home tab): live signals pinned on top with countdowns, then history (newest first) with symbol, direction, result pips and the user's status chip (taken / skipped / missed / likely). Realtime updates through Supabase Realtime.
Fingerprint: opening the card from an alert or push skips the fingerprint prompt (speed matters); everything else in the APK is behind fingerprint unlock.
## Taken / not-taken detection
We must always know which user took which trade, without forcing them to report it. Three layers, strongest wins: Tracker match > swipe/skip > close answer > copy heuristic > expiry.
Layer 1 — copy heuristic (automatic, everyone). At expiry (or at trigger/cancel for pending), a job sets receipts with no explicit action: Entry + SL + TP + Lot all copied → likely_taken; opened but not all copied → stays opened (unknown); never opened → missed.
Layer 2 — Tracker EA (optional, exact). ea/J_Tracker.mq5, a read-only EA the subscriber attaches to any chart of their own MT5 on PC or VPS. It works when logged in with the investor (read-only) password, and never trades.
- In the app: Settings → Connect MT5 tracker shows a one-time pairing key and the 4 steps (download the .ex5, allow the WebRequest URL, attach to a chart, paste the key). Status shows Connected · last seen 12 s ago.
- The EA sends a heartbeat every 60 s with balance + currency (fills the lot calculator automatically), and on OnTradeTransaction sends every position open/modify/close: ticket, symbol, type, volume, open price/time, SL/TP, close price/time, profit. Same queue-and-retry and tester rules as J_Signal.mqh.
- tracker-report edge function matches a new position to a signal when: same base_symbol, same direction, opened between signal time − 30 s and expires_at + 120 s (pending: within 120 s after triggered), entry within match_tolerance_pips of the signal entry (default 20 pips XAU, 5 pips FX — admin setting). Match → receipt taken (source tracker), store user_lot, user_entry; on close store user_close and user_pips.
- Unmatched positions are stored but never shown to admin as signals.
Layer 3 — one question at close. When the EA closes the trade, every receipt still likely_taken or opened (no tracker, no swipe, no skip) gets ONE push: "XAUUSD BUY hit TP +45 pips — did you catch it?"
- Android: normal high-priority notification (not call-style) with Yes / No action buttons handled natively via receipt-action (no app launch).
- iPhone: web push cannot show buttons, so the push opens a small question sheet; the same sheet also appears on the next app open until answered.
- Yes → taken (source close_answer); No → not_taken. Unanswered after 48 h → likely_taken stays likely_taken, opened becomes not_taken.
Admin view: for each signal, a list of every user with status, source and (when tracked) their real entry/close.
## Follow-ups
Follow-ups go only to users whose receipt is taken or likely_taken for that signal. Users who skipped, missed or answered No get nothing.
EA event
Push text
Android style
triggered
XAUUSD BUY STOP triggered at 2341.62
Call-style, 30 s ring
move_be
Move SL to breakeven — XAUUSD BUY
Call-style, 30 s ring
update (SL/TP)
New SL 2338.00 · TP 2360.00 — XAUUSD BUY
Call-style, 30 s ring
partial
Close half (0.25 of 0.50) — XAUUSD BUY
Call-style, 30 s ring
close (manual)
Close now — XAUUSD BUY at 2349.10
Call-style, 30 s ring
cancel (pending)
Cancel your XAUUSD BUY STOP
Call-style, 30 s ring
close (tp / sl)
XAUUSD BUY hit TP · +45 pips
Normal notification
- Each follow-up opens the signal card with the change highlighted at the top and its new values tap-to-copy.
- For a cancel of a pending order, every receipt that was not taken is closed silently (no push) — nobody else needs it.
- On iPhone all of these are normal pushes with unique tags (no re-ring except for close manual and cancel, which re-ring like a signal for 60 s).
- Then the close question from Taken detection runs for anyone still uncertain.
## Wann signals
Wann signals push my wann app's strongest game calls (85%+) to the J users I enable. wann is my private sports-probability platform (repo KenhighRDS/wann, Supabase project nuwnrrkfvhhirlgftqfq, site wann-app.netlify.app). Read its README.md, supabase/migrations/20261007000500_predictions.sql and app/src/lib/format.ts before building this.
What counts as a Wann signal — the same rule as wann's own "85%+" filter (clearsLean in format.ts), on the game's current prediction from v_current_predictions:
- Straight call: the top pick (home / draw / away) is at 85% or more.
- Win or draw: for sports with a draw, the stronger side + draw is at 90% or more (wann shows double chance only from 90%).
- Window: 1 week. Every game that clears the rule and kicks off within the next 7 days and is still scheduled (window is an admin setting, default 7 days). One signal per game, sent as soon as the game first clears the rule inside the window.
Getting the calls out of wann (wann's predictions are behind sign-in, so J must not read them with an anon key):
- In the wann repo, add one edge function j-feed, protected by header X-J-Feed-Key (secret J_FEED_KEY in both projects). It returns: games that clear the rule above (game id, sport, competition, home/away names, kickoff UTC, pick side, pick label, probability, call type straight/win-or-draw, model version, prediction time), the latest prediction for every game J already holds (to catch changes), and final results + wann's grade for those games. Read-only, no other change to wann. Commit to wann's main; deploy to its Supabase project.
- In J, a pg_cron job every 15 minutes calls wann-sync, which pulls j-feed and upserts wann_calls.
Database (J):
- wann_calls: wann_game_id (unique), sport, competition, home, away, kickoff_utc, pick (home/draw/away/home_or_draw/away_or_draw), pick_label (e.g. "Arsenal to win", "Arsenal win or draw"), probability, call_type, status (live/withdrawn/finished), final_score, outcome (won/lost/void), sent_at.
- wann_access: user_id, enabled (default false), enabled_at, enabled_by. No row = off.
- Receipts reuse the same receipts table with a kind column (ea / wann) and wann_call_id.
Delivery: like an EA signal — Android call-style ring, iPhone push + re-ring until opened — to every user with Wann on. Because a 1-week window can surface many games at once, all new calls from one sync go out as one alert ("Wann · 6 new games 85%+") that opens a list; a single new call opens its card directly. When the admin switches Wann on for a user, they immediately get every live call in the window as one alert. Card (/wann/:id, no scroll, Wann badge): sport + competition, Home vs Away, kickoff in the user's local time with a countdown (days/hours), the pick in large type, the probability (e.g. 87%), tap-to-copy on teams, pick and kickoff, swipe I took it / Skip. No lot calculator. The card expires at kickoff.
Changes and results:
- If a later wann prediction (24 h, 1 h, official lineup) changes the pick or drops it below the rule before kickoff → status withdrawn and a push to everyone who received it: "Wann update: Arsenal now 81% — call withdrawn." (takers get it call-style).
- When the game finishes → finished + outcome; takers get "Arsenal 2–0 · Won ✓"; the close question goes to anyone still uncertain (same rules as EA signals: copy heuristic → likely_taken, swipe/skip, one question at the end). No tracker for Wann.
Admin: on each user, a Wann signals switch, off by default. On = the user receives every 85%+ game in the coming 7 days, continuously, until the admin turns it off. Off stops new Wann signals at once (calls already received stay in their history).
Reports: users who had Wann access in the period get a separate Wann block: games called, won, lost, hit rate, and their taken/missed — never mixed into pips.
Logo: copy docs/brand-logo.png from the wann repo (white "1" on black) to assets/wann-logo.png; it is the badge on Wann cards and the background of Wann share images.
## Promo sharing (admin)
The admin can share or download any call — live or past, EA or Wann — as a branded image for promotion. Buttons Share and Download on every signal in Admin → Signals and on the signal card when viewed by an admin.
- EA signal image: black background, the J logo large and faded behind, symbol + direction + order type, entry / SL / TP, time called. When closed: the result stamped big (e.g. +45 pips · TP hit ✓) in chrome/silver.
- Wann signal image: same layout with the wann logo in the background instead of J, sport + competition, Home vs Away, kickoff, the pick and its probability. When finished: the final score + Won ✓ / Lost.
- Hide levels toggle (default off for closed calls, on for live calls): blurs entry/SL/TP or the pick so a live call can be teased without giving it away ("XAUUSD signal sent at 14:32 — members only").
- Formats: 1080×1350 (post) and 1080×1920 (story), picked at share time.
- Never shows any subscriber's name, balance or status. Footer: "J signals" (or "wann × J" on Wann images).
- Batch: select several closed calls → one "recent wins" image (up to 6 rows) for the same two formats.
- Rendered with the same html-to-image component as the reports; share via navigator.share({ files }) on web/iPhone, Capacitor Share on Android, plus plain PNG download.
## Invites, login and sessions
Invite-only. No passwords anywhere: email + 6-digit code, then the user stays signed in until they log out or I remove them.
Invite:
- Admin → Users → type an email → Send invite. Edge function admin-invite (admin only) calls auth.admin.inviteUserByEmail(email, { redirectTo: "https://<site>/welcome" }), creates the profiles row (invited) and an invites row (expires in 7 days). Resend and Revoke buttons on pending invites.
- The invite email (custom J template, black and silver, logo) has one button: Confirm my email.
- /welcome marks the profile active and shows "Get J on your phone": Android → download APK; iPhone → the Add to Home Screen steps; then Log in. (The installed iPhone app has its own storage, so the user logs in once inside it with a code — explain this on the page.)
Login:
- Screen: J logo, email field (remembers last email), Send code.
- signInWithOtp({ email, options: { shouldCreateUser: false } }). Not invited → "This email isn't invited to J. Ask the admin."
- Code screen: 6 boxes, autocomplete="one-time-code", Paste button, auto-submit at 6 digits → verifyOtp({ email, token, type: "email" }). Resend code after 30 s.
- Supabase Auth settings to apply: public sign-ups off; email OTP length 6; OTP expiry 600 s; Magic Link email template replaced by a code email: "Your J code is {{ .Token }}" (no link); invite template customized; rate limit for emails raised (custom SMTP required — Part B).
Long sessions:
- persistSession: true, autoRefreshToken: true. Web: localStorage. APK: a Capacitor Preferences storage adapter (survives WebView storage clears).
- Supabase Auth: no session time-box, no inactivity timeout. Refresh the session on app resume.
- The app never logs out by itself. Only Log out (current device) or admin removal ends a session.
Admin removal: admin-remove-user bans the auth user, deletes their sessions and refresh tokens, deletes their devices, sets profile removed. Any open app gets 401 → returns to login with "Your access has ended."
Fingerprint (APK only): after the first login, offer Unlock with fingerprint. When on, the app asks for biometrics (device PIN fallback) on cold start and after 5 minutes in background — except when opened from a signal alert or push, which goes straight to the card.
Admins: seed my account as admin from the J_ADMIN_EMAILS secret (ask me for the email). Admin and subscriber use the same app; admins get an extra Admin tab.
## Reports
Every Friday at 17:00 New York time (weekly, Monday–Friday) and on the last calendar day of each month at 17:00 New York time (monthly), generate a report for the app and for each user, then push "Your weekly report is ready" / "Your November report is ready". Schedule with a pg_cron job that runs hourly and decides in America/New_York time, so daylight-saving changes never shift it. Test signals never count.
Report page (/reports/:id, plus a Reports tab listing all past reports newest first):
- J results: signals called · wins · losses · breakevens · win rate · total pips · best trade · per-symbol line (e.g. XAUUSD +312 pips, USDJPY −24).
- Your results: signals received · taken · missed · skipped · your wins/losses · your pips (tracker pips when linked, otherwise the signal's result pips for trades marked taken). Likely-taken trades count as taken, marked with a small "incl. likely" note.
- Pips use each signal's pip_size, so gold, JPY pairs and indices add up correctly.
Share as image:
- Share renders a 1080×1350 card (Instagram-portrait) from a dedicated hidden component with html-to-image: black background, the J logo large and faded in the background, chrome/silver headline numbers, period dates, the user's first name, and a small "J signals" footer.
- iPhone/web: navigator.share({ files: [png] }), fallback download. APK: Capacitor Filesystem + Share plugins.
- Report data is frozen in reports.data when generated, so a shared image never changes later.
- Admin can Generate now for any period (also used to test).
## Admin panel
An Admin tab, visible to admins only, in the same app (web and APK). Every action goes through admin-checked edge functions or RPCs.
- Users: invite by email, pending invites (resend / revoke), active users with last seen, devices (Android / iPhone web / desktop), tracker status, per-EA access switches (block any EA for this user), the Wann signals switch, taken/missed history per user, Remove.
- Signals: live and past signals; per signal, every user's status, source and tracked entry/close.
- Send signal (manual): the same fields as the EA (symbol, direction, order type, entry, SL, TP, pip size or symbol preset, expiry). Toggle Test (default ON): goes only to admins or to chosen users, shows a TEST badge, never counts in reports. Test OFF sends to everyone. Manual signals also support follow-ups (move BE, close, cancel) and a manual close with result.
- Push test: send a test alert to one of my devices; show the FCM response and the push_log row so I can debug iPhone delivery.
- EA sources: add an EA → shows its API key once (copy button) for J_Signal.mqh; rotate key; last seen; active toggle.
- Settings: market expiry (120 s), iPhone re-ring interval (30 s), tracker match tolerance per base symbol, pip-size overrides, report hour (17 NY).
- Reports: list, generate now, open any user's report.
## Design
The look comes from the logo: a chrome/silver folded "J" on pure black. Premium, quiet, fast to read under pressure.
- Palette: background #000000, surfaces #0B0B0C / #141416, borders #232326, text #F5F5F7, secondary text #8E8E93. Accent = a chrome gradient (#FFFFFF → #BFC3C9 → #6E7279) for headlines, the swipe slider and key numbers. Buy #2FBF71, sell #E5484D, both used sparingly.
- Type: Inter (UI) + JetBrains Mono (prices, lots, countdowns), self-hosted.
- Dark only. Large tap targets (≥ 48 px). Haptics on copy, swipe and alerts.
- Icons from the logo (I attach logo.png, 1254×1254): web 192/512/maskable, apple-touch-icon 180, favicon, Android adaptive icon (logo on black), and a white monochrome silhouette of the J for the Android notification small icon and the web badge (a full-color icon shows as a grey square there).
- Splash: black with the logo centered.
- Ringtone j_ring.ogg: a short, clean, non-annoying synth chime loop (generate or pick a royalty-free one) — also used for the in-app test alert.
## Build order, CI and delivery
Build in these stages; commit and push after each one. Stop to ask me only for secrets or clicks I must do.
- Foundation: repo, Vite + React + TS + Capacitor, routing, design tokens, icons from the logo, Supabase project + full schema + RLS, invite/OTP login + long sessions, Netlify site with auto-deploy.
- Signals in: ingest-signal, J_Signal.mqh, integration into my EAs in ea/source/, EA sources admin, manual/test signal sender.
- Push out: dispatch-signal + FCM v1 sender (OAuth token from the service account, cached), the full iPhone web push recipe, re-ring cron, Android browser bar, admin push test.
- Android: JAlert native plugin (call-style alert, full-screen activity, ringtone/vibration loop, native Skip / Yes / No actions), permission checklist, fingerprint, signed APK build.
- Signal card: card, list, lot calculator, copy tracking, swipe/skip, realtime.
- Tracking: expiry jobs, J_Tracker.mq5 + tracker-report + pairing, follow-ups, close question.
- Reports: generator, cron, report pages, share image.
- Finish: remaining admin screens, SETUP.md, run the acceptance tests and fix what fails.
Stage 7b — Wann signals + promo sharing, right after Reports: j-feed in the wann repo, wann-sync cron, Wann card and alerts, Wann access in admin, promo images. They reuse the alert, card, receipt and image components.
APK CI (GitHub Actions): runs only when the commit message contains [apk] or [release]. Steps: build web → cap sync android → assembleRelease signed with the release keystore from secrets → upload J-<version>.apk to a release in j-releases → update latest.json (version, versionCode, url, notes) there. versionCode increases every build.
In-app update: on APK start, compare versionCode with latest.json; if newer → a sheet "New version available" with Update (downloads and opens the APK installer) and the release notes.
MT5 files: commit .mq5/.mqh sources. I compile them in MetaEditor myself; the app's tracker instructions link to J_Tracker.ex5 in the j-releases repo, which I upload.
## Acceptance tests
The build is done when all of these pass. Automate what can be automated; give me a short checklist for the ones that need my phones.
- ☐ Invite an email → invite arrives from my domain → confirm → code login works; a non-invited email is refused.
- ☐ Close and reopen the app after 7+ days → still logged in (web, installed iPhone app, APK).
- ☐ iPhone, app closed, phone locked: test signal → banner + sound within 5 s; not opened → re-rings every 30 s until expiry; tap → card opens directly.
- ☐ iPhone, app open in foreground: exactly one notification, no duplicate; the card updates live.
- ☐ 10 signals in a row on iPhone → 10 separate alerts (unique tags), permission still granted afterwards.
- ☐ Android, app killed, phone locked: full-screen call alert with ringtone + vibration looping until Open/Skip/expiry.
- ☐ Android, unlocked in another app: alert pops over it (overlay granted) or call-style heads-up keeps ringing (not granted).
- ☐ Android Skip and close-question Yes/No work with the app killed.
- ☐ Card fits without scrolling at 360×640; every copy puts the exact value on the clipboard; lot math matches a hand calculation for XAUUSD and USDJPY.
- ☐ Swipe locked until all four copies or 10 s; swipe → taken; Skip → skipped; never opened → missed at expiry.
- ☐ Tracker EA (investor password) opens a matching position → receipt becomes taken with no user action; balance syncs.
- ☐ Follow-ups reach only taken/likely users; skipped/missed users get nothing.
- ☐ EA retry: disconnect internet, open a trade, reconnect → signal arrives once, not twice.
- ☐ Weekly report generates at Friday 17:00 New York; share image exports at 1080×1350 with the logo; test signals excluded.
- ☐ Removing a user signs them out everywhere and stops their pushes.
- ☐ Block XAU for one user → that user gets no XAU signal, follow-up or report line; other EAs still arrive.
- ☐ Wann off by default; switch it on → the user gets every 85%+ game of the next 7 days in one alert, then each new one as it appears; switch off → nothing more arrives.
- ☐ A Wann call that drops below the rule before kickoff → withdrawn push; a finished game → Won/Lost and the close question.
- ☐ Admin shares a closed EA call (J logo bg, result stamped) and a Wann call (wann logo bg) in both formats; Hide levels blurs a live call.
## Part B — Wolf's setup guide
These are the steps only you can do. Claude Code will turn this into SETUP.md with the real names, URLs and values filled in. Do them in this order; each one is quick.
### 1. GitHub
- Make sure Claude Code can push: gh auth login, or give it a fine-grained token with Contents, Workflows, Actions secrets and Administration (to create repos) on j-app and j-releases.
- If it can't create them itself: create j-app (private) and j-releases (public), both empty.
- When it asks: add the Actions secrets it lists (release keystore in base64 + its passwords) under j-app → Settings → Secrets and variables → Actions.
### 2. Supabase
- supabase.com → New project "J", region East US, save the database password.
- Give Claude Code access: Account → Access Tokens → generate, or connect the Supabase MCP.
- Project Settings → API: copy the Project URL and the anon key (for Netlify, step 5).
- Authentication → Sign In / Providers: Email on, Allow new users to sign up: OFF, email OTP length 6, OTP expiry 600.
- Authentication → Email Templates: paste the Invite and Magic Link (code) templates Claude Code gives you. The Magic Link one must contain {{ .Token }}.
- Authentication → URL Configuration: Site URL = your Netlify (or custom) URL; Redirect URLs: add <site>/welcome and https://localhost/* (the APK).
- Authentication → SMTP Settings → enable custom SMTP with the Resend values from step 4 (host smtp.resend.com, port 465, user resend, password = Resend API key, sender signals@<yourdomain>, name J).
- Authentication → Rate Limits: raise emails per hour (e.g. 100).
- Edge Functions → Secrets: FCM_SERVICE_ACCOUNT (paste the whole JSON from Firebase step 5) and J_ADMIN_EMAILS (your admin email).
### 3. Firebase
- console.firebase.google.com → Add project "j-signals" (Analytics off).
- Add app → Android, package com.jsignals.app → download google-services.json → give it to Claude Code (it goes in android/app/).
- Add app → Web "J web" → copy the config values (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId).
- Project settings → Cloud Messaging → Web Push certificates → Generate key pair → copy the public key (VAPID). Check that Firebase Cloud Messaging API (V1) shows Enabled.
- Project settings → Service accounts → Generate new private key → JSON file → paste it into the Supabase secret above. Never commit it or share it in chat history you keep.
### 4. Email on your domain (Resend)
- resend.com → sign up → Domains → Add domain → your domain.
- Add the DNS records it shows (SPF/DKIM TXT and the MX for bounces) at your domain registrar → Verify (minutes to a few hours).
- API Keys → Create (sending access) → this is the SMTP password in Supabase step 7.
- Optional: point app.<yourdomain> to Netlify (CNAME to the Netlify site, then add it in Netlify → Domain management), and update the Supabase Site URL to it.
### 5. Netlify
- Let Claude Code create the site, or: Add new site → Import from GitHub → j-app, build npm run build, publish dist.
- Site configuration → Environment variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID, VITE_FIREBASE_VAPID_KEY.
- Deploys → Trigger deploy after setting them (values only reach the next build).
### 6. MT5 on your PC
- Copy J_Signal.mqh to MQL5/Include and the updated EAs to MQL5/Experts; compile in MetaEditor.
- Tools → Options → Expert Advisors → tick Allow WebRequest for listed URL → add https://<ref>.supabase.co. Keep Allow algorithmic trading on.
- In J → Admin → EA sources → add each EA → copy its key → paste into the EA input InpJKey.
- Attach the EAs; send one test with the EA's test input or Admin → Send signal (Test on).
- Windows power settings: sleep Never, and keep MT5 running (a VPS is safer for 24/5).
- Compile J_Tracker.mq5 and upload J_Tracker.ex5 to the j-releases repo for subscribers.
### 7. Your phones (and what subscribers will do)
Android: download the APK from the releases page → allow installs from this source → open → log in with the code → complete the Alerts checklist: notifications, full-screen alerts, display over other apps, battery Unrestricted, Samsung Never sleeping apps, optional Do Not Disturb access → Test alert, then lock the phone and wait.
iPhone (iOS 16.4+): open the site in Safari → Share → Add to Home Screen → Add → open J from the icon → log in with the code → Settings → Enable notifications → Allow → Send me a test → lock the phone. If you use Focus modes, add J to their allowed apps.
### 7b. Link wann
- Give Claude Code push access to KenhighRDS/wann too (same token or gh login), and access to the wann Supabase project to deploy j-feed.
- Make one long random key (Claude Code can generate it) and save it as the secret J_FEED_KEY in both Supabase projects (wann and J): Edge Functions → Secrets.
- Check: Admin → Wann → Sync now shows the next 85%+ games.
### 8. Go-live check
- Invite a second email of yours, install on both phones.
- Send a test signal from Admin, then a real one from an EA on a demo account.
- Run the acceptance checklist above, then invite subscribers.
