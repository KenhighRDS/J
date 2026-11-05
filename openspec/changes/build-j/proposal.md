# Build J v1 — live trade-signal delivery for invited subscribers

## Why
Wolf's MT5 Expert Advisors open trades that paying subscribers copy by hand. Today there is no delivery channel. J delivers each trade as a call-style alert (Android) or push (iPhone PWA), shows a no-scroll copy card with a per-user lot size, and tracks who took each trade, with follow-ups, weekly/monthly reports, and a second signal type (Wann sports calls).

## What changes
The full product described in `docs/SPEC.md` (the authoritative spec, supplied by Wolf on 2026-11-04). Everything is new: web app, Android wrapper + native alert plugin, Supabase backend (schema, RLS, RPCs, edge functions, cron), FCM push sender, MQL5 sender/tracker modules, reports, admin panel, Wann feed (edge function in the wann repo), promo images, APK CI.

## Scope
In: every section of docs/SPEC.md. Out: anything not in the spec (no iOS native app, no automated trade copying, no payments).

## Acceptance
The acceptance checklist in docs/SPEC.md (automated where possible; a phone checklist for the rest, in SETUP.md).
