// CineApe's installable app worker. Network requests stay live so account,
// recommendations, and watch progress are always current.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const data = payload && typeof payload === "object" ? payload : {};
  event.waitUntil(self.registration.showNotification(data.title || "CineApe", {
    body: data.body || "A new pick is waiting for you.",
    icon: "/cineape-pwa-192.png",
    badge: "/cineape-browser-tab.png",
    tag: data.tag || "cineape-alert",
    data: { url: data.url || "/?page=discover" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const client = windows.find((item) => item.url.startsWith(self.location.origin));
    if (client) { client.navigate(target); return client.focus(); }
    return clients.openWindow(target);
  }));
});
