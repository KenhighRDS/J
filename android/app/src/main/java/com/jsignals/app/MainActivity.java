package com.jsignals.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(JAlertPlugin.class);
        super.onCreate(savedInstanceState);
        handleRoute(getIntent(), false);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleRoute(intent, true);
    }

    /** Opened from an alert or push: stop the ring and hand the route to the web app (fingerprint is skipped for it). */
    private void handleRoute(Intent intent, boolean running) {
        if (intent == null) return;
        String route = intent.getStringExtra("route");
        if (route == null) return;
        JAlerts.INSTANCE.cancelSignal(this);
        JStore.INSTANCE.set(this, JStore.PENDING_ROUTE, route);
        JAlertPlugin p = JAlertPlugin.Companion.getInstance();
        if (running && p != null) p.onOpenRoute(route);
        intent.removeExtra("route");
    }
}
