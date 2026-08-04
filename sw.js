/* IntelliQ service worker — installability + offline resilience, WITHOUT the
   stale-bundle trap. Strategy is NETWORK-FIRST: every GET tries the network
   first and only falls back to the cache when the device is offline. So a fresh
   deploy is always picked up the moment the phone is online — the cache is a
   safety net, never the source of truth. */
const CACHE = 'iq-cache-v20';   // bump: safeguarding duty-of-care card + Library

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

  // Only the DOCUMENT navigation may ever fall back to the app shell. An asset
  // request (script/style/etc.) must NEVER be answered with the HTML shell —
  // that hands the browser HTML where it expects JS/CSS and produces a boot-time
  // "Unexpected token" parse failure (the mobile crash this guards against).
  const isNavigation = req.mode === 'navigate' || req.destination === 'document';

  e.respondWith((async () => {
    try {
      const res = await fetch(req);                 // network first — always fresh when online
      // Cache ONLY a complete, same-origin, 200 response. Never cache a redirect,
      // an opaque/partial response, or an error — a truncated cache entry would be
      // re-served forever and break parsing.
      if (res && res.ok && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (_) {
      const cached = await caches.match(req);        // offline: serve the exact asset if we have it
      if (cached) return cached;
      // Offline MISS: fall back to the shell ONLY for a navigation; for any asset,
      // fail honestly rather than return HTML that can't be parsed as JS/CSS.
      if (isNavigation) return (await caches.match('/')) || Response.error();
      return Response.error();
    }
  })());
});

/* ── Proactive delivery: web-push ──────────────────────────────────────────
   IntelliQ reaches the person off-platform. The payload is composed server-side by
   ai/delivery (grounded, never a prediction, never a sensitive read) and arrives as JSON
   { title, body, url, kind }. We render a notification; clicking it opens (or focuses) the
   app at the deep link. Defensive: a malformed/empty push still shows a safe default. */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { try { d = { body: e.data && e.data.text() }; } catch (__) { d = {}; } }
  const title = (d && d.title) || 'IntelliQ';
  const opts = {
    body: (d && d.body) || 'You have a new rundown.',
    tag: (d && d.kind) || 'iq-digest',           // same-kind pushes collapse instead of stacking
    renotify: false,
    data: { url: (d && d.url) || '/' },
    icon: '/icon-192.png',
    badge: '/icon-192.png',
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) { try { await c.focus(); if (c.navigate && target !== '/') await c.navigate(target); return; } catch (_) {} } }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
