package com.jsignals.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat

/** Native notification actions that work with the app killed: Skip, Yes, No, and the local test alert. */
class JActionReceiver : BroadcastReceiver() {
    companion object {
        const val ACTION_SKIP = "com.jsignals.app.SKIP"
        const val ACTION_YES = "com.jsignals.app.YES"
        const val ACTION_NO = "com.jsignals.app.NO"
        const val ACTION_TEST = "com.jsignals.app.TEST"
    }

    override fun onReceive(ctx: Context, intent: Intent) {
        val signalId = intent.getStringExtra("signal_id")
        val callId = intent.getStringExtra("wann_call_id")
        when (intent.action) {
            ACTION_SKIP -> { JAlerts.cancelSignal(ctx); JApi.receiptAction(ctx, "skip", signalId, callId) }
            ACTION_YES -> { dismiss(ctx, intent); JApi.receiptAction(ctx, "yes", signalId, callId) }
            ACTION_NO -> { dismiss(ctx, intent); JApi.receiptAction(ctx, "no", signalId, callId) }
            ACTION_TEST -> JAlerts.showSignal(ctx, testData())
        }
    }

    private fun dismiss(ctx: Context, intent: Intent) {
        val key = intent.getStringExtra("notification_key") ?: intent.getStringExtra("signal_id") ?: ""
        NotificationManagerCompat.from(ctx).cancel(JAlerts.ID_INFO_BASE + (key.hashCode() and 0xffff))
        NotificationManagerCompat.from(ctx).cancelAll()
    }

    private fun testData(): Map<String, String> {
        val exp = java.time.Instant.now().plusSeconds(60).toString()
        return mapOf("type" to "test", "notification_id" to "test-${System.currentTimeMillis()}", "signal_id" to "",
            "symbol" to "XAUUSD", "direction" to "buy", "order_type" to "buy_stop", "title" to "XAUUSD · TEST ALERT",
            "body" to "Entry 2341.50 · SL 2335.00 · TP 2355.00 — this is a test", "route" to "/settings/alerts?test=1",
            "expires_at" to exp, "ring_sec" to "60", "is_test" to "true")
    }
}
