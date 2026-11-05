package com.jsignals.app

import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import java.time.Instant

/** Builds and shows the call-style signal alert, follow-ups and the close question. */
object JAlerts {
    const val CHANNEL_SIGNALS = "j_signals"
    const val CHANNEL_INFO = "j_info"
    const val ID_SIGNAL = 1001
    const val ID_INFO_BASE = 2000
    val VIBRATION = longArrayOf(0, 800, 400, 800, 400, 800, 600)

    fun ringtoneUri(ctx: Context): Uri = Uri.parse("android.resource://${ctx.packageName}/raw/j_ring")

    fun ensureChannels(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_SIGNALS) == null) {
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
            val ch = NotificationChannel(CHANNEL_SIGNALS, "Signals", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Trade signals (rings like a call)"
                setSound(ringtoneUri(ctx), attrs)
                enableVibration(true); vibrationPattern = VIBRATION
                enableLights(true); lightColor = 0xFFFFFFFF.toInt()
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setBypassDnd(true)
            }
            nm.createNotificationChannel(ch)
        }
        if (nm.getNotificationChannel(CHANNEL_INFO) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL_INFO, "Updates", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Trade results and questions"
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            })
        }
    }

    private fun flags() = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

    fun headline(d: Map<String, String>): String {
        val sym = d["symbol"] ?: ""
        val dir = (d["direction"] ?: "").uppercase()
        val ot = d["order_type"] ?: "market"
        return if (ot == "market") "$sym $dir" else "$sym ${ot.replace('_', ' ').uppercase()}"
    }

    fun msUntil(iso: String?, fallbackSec: Long): Long {
        if (iso.isNullOrEmpty()) return fallbackSec * 1000
        return try { Instant.parse(iso).toEpochMilli() - System.currentTimeMillis() } catch (e: Exception) { fallbackSec * 1000 }
    }

    private fun openIntent(ctx: Context, route: String, signalId: String?): PendingIntent {
        val i = Intent(ctx, MainActivity::class.java).apply {
            action = "com.jsignals.app.OPEN"
            putExtra("route", route); putExtra("signal_id", signalId); putExtra("from_alert", true)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        return PendingIntent.getActivity(ctx, route.hashCode(), i, flags())
    }

    private fun actionIntent(ctx: Context, action: String, d: Map<String, String>, reqOffset: Int): PendingIntent {
        val i = Intent(ctx, JActionReceiver::class.java).apply {
            this.action = action
            putExtra("signal_id", d["signal_id"]); putExtra("wann_call_id", d["wann_call_id"]); putExtra("route", d["route"])
        }
        return PendingIntent.getBroadcast(ctx, (d["notification_id"] ?: d["signal_id"] ?: "").hashCode() + reqOffset, i, flags())
    }

    /** The incoming-call style alert. Newest wins (fixed id). */
    fun showSignal(ctx: Context, d: Map<String, String>) {
        ensureChannels(ctx)
        val route = d["route"] ?: "/signal/${d["signal_id"]}"
        val title = d["title"] ?: headline(d)
        val body = d["body"] ?: ""
        val ringSec = d["ring_sec"]?.toLongOrNull() ?: 120
        val timeout = if (d["type"] == "followup") ringSec * 1000 else msUntil(d["expires_at"], ringSec)
        if (timeout <= 0) return
        val fullScreen = Intent(ctx, SignalAlertActivity::class.java).apply {
            putExtras(bundleOf(d)); putExtra("route", route)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        val fullPI = PendingIntent.getActivity(ctx, 7001, fullScreen, flags())
        val person = Person.Builder().setName("J · ${headline(d)}").setImportant(true).build()
        val n = NotificationCompat.Builder(ctx, CHANNEL_SIGNALS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title).setContentText(body)
            .setStyle(NotificationCompat.CallStyle.forIncomingCall(person, actionIntent(ctx, JActionReceiver.ACTION_SKIP, d, 1), openIntent(ctx, route, d["signal_id"])))
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setFullScreenIntent(fullPI, true)
            .setContentIntent(openIntent(ctx, route, d["signal_id"]))
            .setOngoing(true).setAutoCancel(false)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setSound(ringtoneUri(ctx), android.media.AudioManager.STREAM_RING)
            .setVibrate(VIBRATION)
            .setTimeoutAfter(timeout)
            .build()
        n.flags = n.flags or Notification.FLAG_INSISTENT
        if (NotificationManagerCompat.from(ctx).areNotificationsEnabled()) {
            try { NotificationManagerCompat.from(ctx).notify(ID_SIGNAL, n) } catch (e: SecurityException) { /* notifications disabled */ }
        }
        // Unlocked and in use with "Display over other apps": put the full-screen activity on top right away.
        val km = ctx.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
        if (pm.isInteractive && !km.isKeyguardLocked && Settings.canDrawOverlays(ctx)) {
            try { ctx.startActivity(fullScreen) } catch (e: Exception) { /* the heads-up banner stays */ }
        }
    }

    /** Normal (non-ringing) notification: TP/SL results, Wann results. */
    fun showInfo(ctx: Context, d: Map<String, String>) {
        ensureChannels(ctx)
        val route = d["route"] ?: "/"
        val n = NotificationCompat.Builder(ctx, CHANNEL_INFO)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(d["title"] ?: "J").setContentText(d["body"] ?: "")
            .setStyle(NotificationCompat.BigTextStyle().bigText(d["body"] ?: ""))
            .setPriority(NotificationCompat.PRIORITY_HIGH).setAutoCancel(true)
            .setContentIntent(openIntent(ctx, route, d["signal_id"]))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()
        notifyInfo(ctx, d, n)
    }

    /** "Did you catch it?" with native Yes / No. */
    fun showQuestion(ctx: Context, d: Map<String, String>) {
        ensureChannels(ctx)
        val route = d["route"] ?: "/signal/${d["signal_id"]}?ask=1"
        val n = NotificationCompat.Builder(ctx, CHANNEL_INFO)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(d["title"] ?: "Did you catch it?").setContentText(d["body"] ?: "")
            .setStyle(NotificationCompat.BigTextStyle().bigText(d["body"] ?: ""))
            .setPriority(NotificationCompat.PRIORITY_HIGH).setAutoCancel(true)
            .setContentIntent(openIntent(ctx, route, d["signal_id"]))
            .addAction(0, "Yes, I took it", actionIntent(ctx, JActionReceiver.ACTION_YES, d, 2))
            .addAction(0, "No", actionIntent(ctx, JActionReceiver.ACTION_NO, d, 3))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setTimeoutAfter(48L * 3600 * 1000)
            .build()
        notifyInfo(ctx, d, n)
    }

    private fun notifyInfo(ctx: Context, d: Map<String, String>, n: Notification) {
        if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return
        val id = ID_INFO_BASE + ((d["notification_id"] ?: d["signal_id"] ?: "").hashCode() and 0xffff)
        try { NotificationManagerCompat.from(ctx).notify(id, n) } catch (e: SecurityException) { }
    }

    fun cancelSignal(ctx: Context) {
        NotificationManagerCompat.from(ctx).cancel(ID_SIGNAL)
        ctx.sendBroadcast(Intent(SignalAlertActivity.ACTION_STOP).setPackage(ctx.packageName))
    }

    fun bundleOf(d: Map<String, String>): android.os.Bundle = android.os.Bundle().apply { d.forEach { (k, v) -> putString(k, v) } }
    fun mapOf(b: android.os.Bundle?): Map<String, String> {
        val m = HashMap<String, String>()
        b?.keySet()?.forEach { k -> b.getString(k)?.let { m[k] = it } }
        return m
    }
}
