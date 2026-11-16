// Offline support, tuned to feel instant and to stay out of the way.
//  - App files and quizzes: answer from the saved copy at once, and fetch a fresh copy in the background for next time.
//  - Fonts and icons never change: saved copy only (fetched once).
//  - "?net=1" (the app's quiet check for new quizzes): network first, saved copy if that fails.
// The page is never reloaded from here. Bump VERSION when you change app files.
const VERSION = "kiron-v28";
const SHELL = ["./", "index.html", "styles.css", "maths.js", "app.js", "prompt.js", "import.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "quizzes.json", "poppins-500.woff2", "poppins-600.woff2", "poppins-700.woff2", "poppins-800.woff2", "poppins-400.woff2", "poppins-400-italic.woff2"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const clean = url => { const u = new URL(url); u.search = ""; u.hash = ""; return u.href; };
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const key = clean(url.href);
  const refresh = cache => fetch(key, { cache: "no-cache" }).then(res => { if (res && res.ok) return cache.put(key, res.clone()).then(() => res); return res; });
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(key);
    if (/\.(woff2|png)$/.test(url.pathname)) return hit || refresh(cache);
    if (url.searchParams.has("net")) {
      const net = refresh(cache);
      if (!hit) return net;
      const slow = new Promise(r => setTimeout(() => r(hit), 4000));
      return Promise.race([net.then(res => res && res.ok ? res : hit, () => hit), slow]);
    }
    if (!hit) return refresh(cache);
    e.waitUntil(refresh(cache).catch(() => {}));
    return hit;
  }));
});
