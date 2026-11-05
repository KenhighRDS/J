package com.jsignals.app

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Calls the receipt-action edge function with device_id + device_secret (no user session needed). */
object JApi {
    private const val TAG = "JApi"

    fun receiptAction(ctx: Context, action: String, signalId: String?, callId: String?) {
        val url = JStore.get(ctx, JStore.FUNCTIONS_URL) ?: return
        val anon = JStore.get(ctx, JStore.ANON_KEY) ?: ""
        val deviceId = JStore.get(ctx, JStore.DEVICE_ID) ?: return
        val body = JSONObject()
            .put("device_id", deviceId)
            .put("device_secret", JStore.deviceSecret(ctx))
            .put("action", action)
        if (signalId != null) body.put("signal_id", signalId)
        if (callId != null) body.put("wann_call_id", callId)
        Thread {
            try {
                val c = (URL("$url/receipt-action").openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"; connectTimeout = 8000; readTimeout = 8000; doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("apikey", anon)
                }
                c.outputStream.use { it.write(body.toString().toByteArray()) }
                val code = c.responseCode
                if (code >= 400) Log.w(TAG, "receipt-action $action -> $code")
                c.disconnect()
            } catch (e: Exception) {
                Log.w(TAG, "receipt-action failed: ${e.message}")
            }
        }.start()
    }
}
