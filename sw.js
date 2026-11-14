// Offline support: serve saved copies instantly, refresh them in the background.
// Bump VERSION when you change app files so phones pick up the new version.
const VERSION = "kiron-v2";
const SHELL = ["./", "index.html", "styles.css", "app.js", "prompt.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "quizzes.json"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(res => { if (res && (res.ok || res.type === "opaque")) cache.put(e.request, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
