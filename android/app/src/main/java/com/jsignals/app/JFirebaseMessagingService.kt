package com.jsignals.app

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/** The only FirebaseMessagingService in the app. Signals arrive as data-only, high-priority messages. */
class JFirebaseMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(msg: RemoteMessage) {
        val d = HashMap(msg.data)
        when (d["type"]) {
            "signal", "test" -> JAlerts.showSignal(this, d)
            "followup" -> if (d["style"] == "call") JAlerts.showSignal(this, d) else JAlerts.showInfo(this, d)
            "question" -> JAlerts.showQuestion(this, d)
            "wann" -> JAlerts.showSignal(this, d)
            else -> {
                // anything else (or a notification-block message) is shown as a plain notification
                msg.notification?.let { n -> d.putIfAbsent("title", n.title ?: "J"); d.putIfAbsent("body", n.body ?: "") }
                if (d.isNotEmpty()) JAlerts.showInfo(this, d)
            }
        }
        JAlertPlugin.instance?.onPushData(d)
    }

    override fun onNewToken(token: String) {
        JStore.set(this, JStore.FCM_TOKEN, token)
        JAlertPlugin.instance?.onNewToken(token)
    }
}
