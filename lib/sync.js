/* ============================================================
   lib/sync.js — sync reliability primitives (pure).

   The promise this layer keeps: external data may arrive late, twice, out of order,
   partially, or not at all — but IntelliQ processes it predictably and never
   silently corrupts truth.

   This module holds the deterministic decisions of that promise — failure
   classification, backoff, rate-limit parsing, health, and staleness — so they can
   be unit-tested in isolation. The server owns the durable run model, storage,
   locking, and the evidence boundary.
   ============================================================ */

/* Failures are not equal. Classifying them decides whether we retry, pause, or ask
   for a human — retrying an expired token forever is as wrong as giving up on a
   timeout. */
const FAILURE_CLASSES = ['temporary', 'authorization', 'configuration', 'data', 'permanent'];

function classifyFailure(info = {}) {
  const status = info.status || 0;
  const code = String(info.code || info.errorCode || '').toLowerCase();
  const msg = String(info.message || '').toLowerCase();

  // authorization — pause + ask to reconnect (never retry blindly)
  if (status === 401 || status === 403 || /token expired|refresh.*fail|invalid.?scope|revoked|unauthor/.test(msg)) return 'authorization';
  // configuration — a human must fix setup (no active mapping, bad endpoint…)
  if (/no active mapping|no url|invalid endpoint|missing.*resource|unsafe/.test(msg) || status === 404) return 'configuration';
  // data — the record/shape is the problem (drift, malformed, identity conflict)
  if (/schema|drift|malformed|not json|identity conflict|parse/.test(msg)) return 'data';
  // permanent — the resource/account is gone
  if (status === 410 || /account unavailable|resource deleted|gone/.test(msg)) return 'permanent';
  // temporary — timeout, rate limit, provider 5xx, transient network
  if (status === 429 || (status >= 500 && status <= 599) || /timeout|aborted|econnreset|etimedout|network|fetch failed|transient/.test(msg + code)) return 'temporary';
  // default: treat unknown as temporary (safer to retry a few times than to drop)
  return 'temporary';
}

/* Only these retry automatically. Authorization/configuration need intervention;
   permanent never retries; data goes to the dead-letter queue for a human. */
function isRetryable(failureClass) { return failureClass === 'temporary'; }

/* Exponential backoff with full jitter, capped. `attempt` is 1-based. A provider's
   Retry-After (seconds) always wins when present (rate-limit courtesy). */
function backoffMs(attempt, opts = {}) {
  const base = opts.baseMs || 1000;
  const cap = opts.capMs || 15 * 60 * 1000;   // 15 min ceiling
  if (opts.retryAfterSec != null && Number.isFinite(opts.retryAfterSec)) return Math.min(cap, Math.max(0, opts.retryAfterSec * 1000));
  const exp = Math.min(cap, base * Math.pow(2, Math.max(0, attempt - 1)));
  const rng = (typeof opts.rand === 'function') ? opts.rand() : Math.random();
  return Math.floor(rng * exp);               // full jitter: [0, exp)
}

/* Parse the rate-limit signals providers return, tolerating the common header
   spellings. Returns { remaining, resetAt, retryAfterSec, quota } (nulls if absent). */
function parseRateLimit(headers) {
  const get = (k) => {
    if (!headers) return null;
    if (typeof headers.get === 'function') return headers.get(k);
    const lk = k.toLowerCase();
    for (const key of Object.keys(headers)) if (key.toLowerCase() === lk) return headers[key];
    return null;
  };
  const num = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));
  const remaining = num(get('x-ratelimit-remaining') ?? get('ratelimit-remaining'));
  const retryAfterRaw = get('retry-after');
  let retryAfterSec = num(retryAfterRaw);
  if (retryAfterSec == null && retryAfterRaw) { const d = Date.parse(retryAfterRaw); if (!isNaN(d)) retryAfterSec = Math.max(0, Math.round((d - Date.now()) / 1000)); }
  const resetRaw = get('x-ratelimit-reset') ?? get('ratelimit-reset');
  let resetAt = null;
  if (resetRaw != null) { const n = num(resetRaw); if (n != null) resetAt = new Date((n > 1e12 ? n : n * 1000)).toISOString(); }
  const quota = get('x-ratelimit-limit') != null ? num(get('x-ratelimit-limit')) : null;
  return { remaining, resetAt, retryAfterSec, quota };
}

/* Derive a connection's HEALTH from its real operational state — never "healthy"
   just because OAuth still works. Precedence: hard blockers first. Returns
   { status, reason }. */
const HEALTH_STATES = ['healthy', 'syncing', 'degraded', 'action_required', 'paused', 'disconnected'];
function deriveHealth(conn = {}, now = Date.now()) {
  if (conn.running) return { status: 'syncing', reason: 'sync in progress' };
  if (conn.paused) return { status: 'paused', reason: conn.pauseReason || 'paused by admin' };
  const lc = conn.lastFailureClass;
  if (lc === 'authorization') return { status: 'action_required', reason: 'token expired or access revoked — reconnect' };
  if (lc === 'configuration') return { status: 'action_required', reason: conn.lastReason || 'setup needs attention' };
  if (conn.needsMappingApproval) return { status: 'action_required', reason: 'mapping approval required' };
  if (conn.driftPaused) return { status: 'action_required', reason: 'source schema changed — review the mapping' };
  if (conn.identityReviewRequired) return { status: 'action_required', reason: 'identity review required' };
  if (lc === 'permanent') return { status: 'disconnected', reason: conn.lastReason || 'provider resource unavailable' };
  if (conn.failedRecordCount > 0) return { status: 'degraded', reason: `${conn.failedRecordCount} record(s) need replay` };
  if (conn.rateLimited) return { status: 'degraded', reason: 'rate limited — backing off' };
  if (isStale(conn, now).stale) return { status: 'degraded', reason: isStale(conn, now).reason };
  if (!conn.lastCompletedSync) return { status: 'degraded', reason: 'has not completed a sync yet' };
  return { status: 'healthy', reason: 'up to date' };
}

/* Staleness ≠ "no new data". Distinguish the real cases against the expected
   freshness policy. Returns { stale, reason, case }. */
function isStale(conn = {}, now = Date.now()) {
  const freshMin = conn.expectedFreshnessMinutes || null;
  const lastCompleted = conn.lastCompletedSync ? Date.parse(conn.lastCompletedSync) : null;
  const lastAttempt = conn.lastAttemptedSync ? Date.parse(conn.lastAttemptedSync) : null;
  if (lastAttempt && (!lastCompleted || lastAttempt > lastCompleted) && conn.lastFailureClass) return { stale: true, reason: 'last sync failed', case: 'ran_but_failed' };
  if (!lastCompleted) return { stale: false, reason: 'never completed a sync', case: 'never_ran' };
  // A successful-but-empty response is NOT stale — nothing changed is a valid answer.
  if (!freshMin) return { stale: false, reason: 'no freshness policy', case: 'ok' };
  const ageMin = (now - lastCompleted) / 60000;
  if (ageMin > freshMin * 2) return { stale: true, reason: `no successful sync in ${Math.round(ageMin)}m (expected ≤ ${freshMin}m)`, case: 'genuinely_stale' };
  return { stale: false, reason: 'within freshness window', case: 'fresh' };
}

module.exports = {
  FAILURE_CLASSES, HEALTH_STATES,
  classifyFailure, isRetryable, backoffMs, parseRateLimit, deriveHealth, isStale,
};
