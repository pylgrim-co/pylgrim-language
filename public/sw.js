/**
 * Service worker — deliberately hand-rolled (IMPLEMENTATION.md 3.9 calls
 * the choice out as real work; the choice here is NO library). The app is
 * a single page whose data lives in IndexedDB, so offline needs exactly
 * three behaviours:
 *
 *   1. immutable build assets (/_next/static/*): cache-first, cached as
 *      they are first fetched
 *   2. navigations: network-first, falling back to the cached shell
 *   3. /api/*: network only — generation is the one online-only feature,
 *      and the client shows its own offline message
 *
 * Bump VERSION to invalidate old caches on deploy.
 */

const VERSION = "pylgrim-v3";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(["/"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // network only, always

  // Immutable hashed assets: cache-first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icon-")) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Navigations and everything else same-origin: network-first, cache fallback.
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      try {
        const res = await fetch(req);
        if (res.ok && (req.mode === "navigate" || url.pathname === "/")) cache.put(req, res.clone());
        return res;
      } catch {
        const hit = await cache.match(req);
        if (hit) return hit;
        if (req.mode === "navigate") {
          const shell = await cache.match("/");
          if (shell) return shell;
        }
        throw new Error("offline and uncached");
      }
    }),
  );
});
