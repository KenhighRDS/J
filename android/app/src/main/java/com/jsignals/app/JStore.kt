package com.jsignals.app

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.security.SecureRandom

/** Encrypted on-device state: device secret (for native receipt actions), ids, server config, pending route. */
object JStore {
    private const val FILE = "j_secure"
    @Volatile private var cached: SharedPreferences? = null

    fun prefs(ctx: Context): SharedPreferences {
        cached?.let { return it }
        val app = ctx.applicationContext
        val p = try {
            val master = MasterKey.Builder(app).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
            EncryptedSharedPreferences.create(app, FILE, master,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
        } catch (e: Exception) {
            app.getSharedPreferences("${FILE}_fallback", Context.MODE_PRIVATE)
        }
        cached = p
        return p
    }

    fun deviceSecret(ctx: Context): String {
        val p = prefs(ctx)
        p.getString("device_secret", null)?.let { return it }
        val bytes = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val hex = bytes.joinToString("") { "%02x".format(it) }
        p.edit().putString("device_secret", hex).apply()
        return hex
    }

    fun get(ctx: Context, key: String): String? = prefs(ctx).getString(key, null)
    fun set(ctx: Context, key: String, value: String?) { prefs(ctx).edit().putString(key, value).apply() }

    const val DEVICE_ID = "device_id"
    const val FUNCTIONS_URL = "functions_url"
    const val ANON_KEY = "anon_key"
    const val FCM_TOKEN = "fcm_token"
    const val PENDING_ROUTE = "pending_route"
}
