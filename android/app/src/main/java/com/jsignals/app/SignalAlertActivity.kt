package com.jsignals.app

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.KeyEvent
import android.view.WindowManager
import android.widget.TextView
import androidx.core.content.ContextCompat

/** Full-screen incoming-signal screen: black, logo, headline, countdown, Open / Skip. Rings and vibrates on its own. */
class SignalAlertActivity : Activity() {
    companion object { const val ACTION_STOP = "com.jsignals.app.STOP_RING" }

    private var player: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private val handler = Handler(Looper.getMainLooper())
    private var data: Map<String, String> = emptyMap()
    private var expiresAt = 0L
    private val stopReceiver = object : BroadcastReceiver() { override fun onReceive(c: Context?, i: Intent?) { stopRinging(); finish() } }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) { setShowWhenLocked(true); setTurnScreenOn(true) }
        else {
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_signal_alert)
        ContextCompat.registerReceiver(this, stopReceiver, IntentFilter(ACTION_STOP), ContextCompat.RECEIVER_NOT_EXPORTED)
        bind(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        stopRinging()
        bind(intent)
    }

    private fun bind(i: Intent) {
        data = JAlerts.mapOf(i.extras)
        val ringSec = data["ring_sec"]?.toLongOrNull() ?: 120
        expiresAt = System.currentTimeMillis() + if (data["type"] == "followup") ringSec * 1000 else JAlerts.msUntil(data["expires_at"], ringSec)
        findViewById<TextView>(R.id.headline).text = data["title"] ?: JAlerts.headline(data)
        findViewById<TextView>(R.id.subline).text = data["body"] ?: ""
        findViewById<TextView>(R.id.kicker).text = when (data["type"]) { "followup" -> "Follow-up"; "test" -> "Test alert"; "wann" -> "Wann signal"; else -> "New signal" }
        findViewById<TextView>(R.id.open).setOnClickListener { open() }
        findViewById<TextView>(R.id.skip).setOnClickListener { skip() }
        startRinging()
        handler.removeCallbacksAndMessages(null)
        tick()
    }

    private fun tick() {
        val left = expiresAt - System.currentTimeMillis()
        if (left <= 0) { stopRinging(); finish(); return }
        val s = (left / 1000).toInt()
        findViewById<TextView>(R.id.countdown).text = String.format("%d:%02d", s / 60, s % 60)
        handler.postDelayed({ tick() }, 500)
    }

    private fun startRinging() {
        if (player != null) return
        try {
            player = MediaPlayer().apply {
                setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                setDataSource(this@SignalAlertActivity, JAlerts.ringtoneUri(this@SignalAlertActivity))
                isLooping = true; prepare(); start()
            }
        } catch (e: Exception) { player = null }
        vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
                   else @Suppress("DEPRECATION") getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        try { vibrator?.vibrate(VibrationEffect.createWaveform(JAlerts.VIBRATION, 0)) } catch (e: Exception) { }
    }

    private fun stopRinging() {
        try { player?.stop(); player?.release() } catch (e: Exception) { }
        player = null
        try { vibrator?.cancel() } catch (e: Exception) { }
    }

    private fun open() {
        stopRinging()
        val route = data["route"] ?: "/signal/${data["signal_id"]}"
        androidx.core.app.NotificationManagerCompat.from(this).cancel(JAlerts.ID_SIGNAL)
        if (!data["signal_id"].isNullOrEmpty()) JApi.receiptAction(this, "opened", data["signal_id"], data["wann_call_id"])
        startActivity(Intent(this, MainActivity::class.java).apply {
            action = "com.jsignals.app.OPEN"
            putExtra("route", route); putExtra("from_alert", true)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        })
        finish()
    }

    private fun skip() {
        stopRinging()
        androidx.core.app.NotificationManagerCompat.from(this).cancel(JAlerts.ID_SIGNAL)
        if (!data["signal_id"].isNullOrEmpty()) JApi.receiptAction(this, "skip", data["signal_id"], data["wann_call_id"])
        finish()
    }

    /** Volume keys silence the ring but keep the card. */
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN || keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_MUTE) { stopRinging(); return true }
        return super.onKeyDown(keyCode, event)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { stopRinging(); super.onBackPressed() }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        stopRinging()
        try { unregisterReceiver(stopReceiver) } catch (e: Exception) { }
        super.onDestroy()
    }
}
