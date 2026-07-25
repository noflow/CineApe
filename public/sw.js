// CineApe's installable app worker. Network requests stay live so account,
// recommendations, and watch progress are always current.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
