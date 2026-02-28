/* eslint-disable no-restricted-globals */
const CACHE_NAME = "htc-shell-v1";

// Keep this list small. The important one is "/" for offline refresh.
const PRECACHE_URLS = ["/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE_URLS);
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Cleanup old caches if you bump CACHE_NAME later
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => (key === CACHE_NAME ? null : caches.delete(key))));
      self.clients.claim();
    })()
  );
});

// Cache strategy:
// - Navigations (document requests): cache-first (so refresh works offline)
// - Next static assets: stale-while-revalidate
// - Everything else: network-first (fallback to cache)
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // 1) Navigations: serve cached "/" when offline (or even cache-first always)
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match("/");
        try {
          const fresh = await fetch(req);
          // Optionally update the cached "/" with the latest
          cache.put("/", fresh.clone());
          return fresh;
        } catch {
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // 2) Next static assets
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        const fetchPromise = fetch(req)
          .then((res) => {
            cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })()
    );
    return;
  }

  // 3) Default: network-first with cache fallback
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const fresh = await fetch(req);
        return fresh;
      } catch {
        const cached = await cache.match(req);
        return cached || Response.error();
      }
    })()
  );
});