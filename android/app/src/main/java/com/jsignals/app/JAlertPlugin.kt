package com.jsignals.app

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.google.firebase.messaging.FirebaseMessaging

@CapacitorPlugin(name = "JAlert", permissions = [Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications")])
class JAlertPlugin : Plugin() {
    companion object { @Volatile var instance: JAlertPlugin? = null }

    override fun load() {
        instance = this
        JAlerts.ensureChannels(context)
    }

    @PluginMethod
    fun getToken(call: PluginCall) {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (!task.isSuccessful || task.result.isNullOrEmpty()) { call.reject("No FCM token: ${task.exception?.message}"); return@addOnCompleteListener }
            JStore.set(context, JStore.FCM_TOKEN, task.result)
            call.resolve(JSObject().put("token", task.result).put("deviceSecret", JStore.deviceSecret(context)))
        }
    }

    @PluginMethod
    fun setServer(call: PluginCall) {
        JStore.set(context, JStore.FUNCTIONS_URL, call.getString("functionsUrl"))
        JStore.set(context, JStore.ANON_KEY, call.getString("anonKey"))
        JStore.set(context, JStore.DEVICE_ID, call.getString("deviceId"))
        call.resolve()
    }

    @PluginMethod
    fun getPermissions(call: PluginCall) { call.resolve(permissionsJson()) }

    private fun permissionsJson(): JSObject {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return JSObject()
            .put("notifications", NotificationManagerCompat.from(context).areNotificationsEnabled())
            .put("fullScreen", if (Build.VERSION.SDK_INT >= 34) nm.canUseFullScreenIntent() else true)
            .put("overlay", Settings.canDrawOverlays(context))
            .put("battery", pm.isIgnoringBatteryOptimizations(context.packageName))
            .put("dnd", nm.isNotificationPolicyAccessGranted)
            .put("samsung", Build.MANUFACTURER.equals("samsung", ignoreCase = true))
    }

    @PluginMethod
    fun requestNotifications(call: PluginCall) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(JSObject().put("granted", NotificationManagerCompat.from(context).areNotificationsEnabled())); return
        }
        requestPermissionForAlias("notifications", call, "notificationsResult")
    }

    @PermissionCallback
    private fun notificationsResult(call: PluginCall) {
        call.resolve(JSObject().put("granted", NotificationManagerCompat.from(context).areNotificationsEnabled()))
    }

    @PluginMethod
    fun openPermission(call: PluginCall) {
        val pkg = context.packageName
        val i: Intent = when (call.getString("which")) {
            "notifications" -> Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
            "fullScreen" -> if (Build.VERSION.SDK_INT >= 34) Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$pkg"))
                            else Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
            "overlay" -> Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$pkg"))
            "battery" -> Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$pkg"))
            "dnd" -> Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
            "samsung" -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg"))
            else -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg"))
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try { activity.startActivity(i) } catch (e: Exception) {
            activity.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        call.resolve()
    }

    /** Rings a fake signal locally after `delaySec` so the user can lock the phone and verify. */
    @PluginMethod
    fun testAlert(call: PluginCall) {
        val delay = (call.getInt("delaySec") ?: 10).coerceIn(1, 120)
        val ctx = context.applicationContext
        val fire = Intent(ctx, JActionReceiver::class.java).setAction(JActionReceiver.ACTION_TEST)
        Handler(Looper.getMainLooper()).postDelayed({ ctx.sendBroadcast(fire) }, delay * 1000L)
        call.resolve()
    }

    @PluginMethod
    fun stopRinging(call: PluginCall) { JAlerts.cancelSignal(context); call.resolve() }

    @PluginMethod
    fun consumeLaunchRoute(call: PluginCall) {
        val route = JStore.get(context, JStore.PENDING_ROUTE)
        JStore.set(context, JStore.PENDING_ROUTE, null)
        call.resolve(JSObject().put("route", route))
    }

    fun onNewToken(token: String) { notifyListeners("token", JSObject().put("token", token), true) }
    fun onPushData(d: Map<String, String>) { val o = JSObject(); d.forEach { (k, v) -> o.put(k, v) }; notifyListeners("push", o, true) }
    fun onOpenRoute(route: String) { notifyListeners("signal", JSObject().put("route", route), true) }
}
