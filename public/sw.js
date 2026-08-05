/*
 * Vault Explorer service worker (hand-written, no build plugin — Turbopack-safe).
 *
 * Strategy:
 *   - Navigations (HTML): network-first, fall back to cache, then an offline
 *     shell — so visited vault pages stay readable offline.
 *   - Static assets (_next/static, fonts, images): stale-while-revalidate.
 *   - /api/*: never touched — always straight to the network (an /api/ask or
 *     /api/reindex response must never be served from cache).
 */
const VERSION = "v1";
const STATIC_CACHE = `vault-static-${VERSION}`;
const PAGE_CACHE = `vault-pages-${VERSION}`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== PAGE_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // API traffic is always live — never cached.
  if (url.pathname.startsWith("/api/")) return;

  // HTML navigations: network-first with a cached fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(PAGE_CACHE);
          cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(request);
          return cached ?? caches.match("/");
        }
      })(),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  if (
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:css|js|woff2?|png|jpg|jpeg|svg|ico|webp|json)$/.test(url.pathname)
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached ?? network;
      })(),
    );
  }
});
