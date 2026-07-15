/* IntelliQ service worker — installability + offline resilience, WITHOUT the
   stale-bundle trap. Strategy is NETWORK-FIRST: every GET tries the network
   first and only falls back to the cache when the device is offline. So a fresh
   deploy is always picked up the moment the phone is online — the cache is a
   safety net, never the source of truth. */
const CACHE = 'iq-cache-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Drop any older caches, then take control of open pages immediately.
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // never touch POST/PUT/DELETE
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // let cross-origin (CDN/API) pass through
  if (url.pathname.startsWith('/api/')) return;     // never cache API responses

  e.respondWith((async () => {
    try {
      const res = await fetch(req);                 // network first — always fresh when online
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (_) {
      const cached = await caches.match(req);        // offline fallback
      return cached || caches.match('/');            // last resort: the app shell
    }
  })());
});
