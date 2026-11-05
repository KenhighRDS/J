/* J push service worker. Self-contained on purpose: no importScripts from gstatic/Firebase
   (that import fails in the background on iOS and Safari then drops pushes and revokes the permission).
   Registered with scope "/push/" so it never replaces an app-shell worker at "/". */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { notification: { title: "J", body: e.data ? e.data.text() : "" } }; }
  const n = d.notification || (d.webpush && d.webpush.notification) || {};
  const data = d.data || {};
  const title = n.title || data.title || "J";
  const opts = {
    body: n.body || data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
    data,
    tag: data.notification_id || `j-${Date.now()}`,
    renotify: true,
    requireInteraction: true,
  };
  e.waitUntil(Promise.all([
    self.registration.showNotification(title, opts),
    self.clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((ws) => ws.forEach((w) => w.postMessage({ type: "j-push", data }))),
  ]));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const route = (e.notification.data && e.notification.data.route) || "/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ws) => {
    const w = ws.find((x) => "focus" in x);
    if (w) { w.postMessage({ type: "j-open", route }); return w.focus(); }
    return self.clients.openWindow(route);
  }));
});
