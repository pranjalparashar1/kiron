// Offline support. Online: always fetch the latest file (falls back to the saved copy after 4s or when offline).
// Offline: serve the saved copy. Bump VERSION when you change app files.
const VERSION = "kiron-v14";
const SHELL = ["./", "index.html", "styles.css", "app.js", "prompt.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "quizzes.json", "poppins-500.woff2", "poppins-600.woff2", "poppins-700.woff2", "poppins-800.woff2", "poppins-400.woff2", "poppins-400-italic.woff2"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const net = fetch(e.request, { cache: "no-cache" }).then(res => { if (res && res.ok) cache.put(e.request, res.clone()); return res; });
    const slow = new Promise(r => setTimeout(r, 4000));
    try {
      const res = await Promise.race([net, slow.then(() => cache.match(e.request, { ignoreSearch: true }).then(h => h || net))]);
      if (res) return res;
    } catch (err) {}
    return (await cache.match(e.request, { ignoreSearch: true })) || net;
  }));
});
