/* ============================================================
   ai/rate-limit.js — a tiny, deterministic fixed-window limiter.

   Pure: the caller owns the store (a plain object), so this is fully testable and does no IO.
   Used for two things:
     • login attempts — bound brute-force per email+IP;
     • per-org LLM calls — stop one org draining the shared key or starving the others.

   hit() counts one event against a key inside a rolling fixed window and says whether it's
   still under the limit. sweep() prunes stale keys so the store can't grow forever.
   ============================================================ */

/* Count one hit against `key`. Returns { allowed, remaining, resetInMs, count }. The window
   resets the first time a key is seen after windowMs has elapsed. */
function hit(store, key, { limit, windowMs, now = Date.now() } = {}) {
  const e = store[key];
  if (!e || now - e.start >= windowMs) {
    store[key] = { start: now, count: 1 };
    return { allowed: 1 <= limit, remaining: Math.max(0, limit - 1), resetInMs: windowMs, count: 1 };
  }
  e.count++;
  return { allowed: e.count <= limit, remaining: Math.max(0, limit - e.count), resetInMs: windowMs - (now - e.start), count: e.count };
}

/* Peek without counting — is this key currently at/over the limit? */
function isLimited(store, key, { limit, windowMs, now = Date.now() } = {}) {
  const e = store[key];
  if (!e || now - e.start >= windowMs) return false;
  return e.count >= limit;
}

/* Clear a key (e.g. a successful login resets its failure counter). */
function reset(store, key) { delete store[key]; }

/* Drop windows that have fully elapsed, so the in-memory store stays bounded. */
function sweep(store, { windowMs, now = Date.now() } = {}) {
  for (const k of Object.keys(store)) { if (now - store[k].start >= windowMs) delete store[k]; }
}

module.exports = { hit, isLimited, reset, sweep };
