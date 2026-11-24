// Работа без интернета: сначала сеть, при её отсутствии — последняя сохранённая копия.
const CACHE = "pary-v1";
const SHELL = ["./", "index.html", "data.json", "meta.json", "manifest.webmanifest", "icon.svg", "icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !isFont) return;
  const key = sameOrigin ? url.pathname.replace(/\/$/, "/") : req.url; // data.json?t=… → data.json
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
      return res;
    }).catch(() => caches.match(key).then(r => r || caches.match(sameOrigin ? url.pathname.split("/").pop() || "./" : req.url)))
  );
});
