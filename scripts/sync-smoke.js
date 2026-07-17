/* ============================================================
   scripts/sync-smoke.js — sync reliability primitives (pure).

   Failure classification, backoff, rate-limit parsing, health, and staleness — the
   deterministic decisions behind "late, twice, out of order, or not at all, but
   never silently corrupt truth."

   Run:  node scripts/sync-smoke.js   (part of `npm test`)
   ============================================================ */

const s = require('../lib/sync');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

console.log('\n=== Sync reliability primitives ===\n');

// ── Failure classification ──────────────────────────────────────────────────
ok('a timeout is temporary', s.classifyFailure({ message: 'request timeout' }) === 'temporary');
ok('a 429 is temporary', s.classifyFailure({ status: 429 }) === 'temporary');
ok('a 503 is temporary', s.classifyFailure({ status: 503 }) === 'temporary');
ok('a 401 is authorization', s.classifyFailure({ status: 401 }) === 'authorization');
ok('a refresh-token failure is authorization', s.classifyFailure({ message: 'refresh token failed' }) === 'authorization');
ok('no active mapping is configuration', s.classifyFailure({ message: 'no active mapping' }) === 'configuration');
ok('schema drift is a data failure', s.classifyFailure({ message: 'schema drift detected' }) === 'data');
ok('a 410 gone is permanent', s.classifyFailure({ status: 410 }) === 'permanent');
ok('only temporary failures auto-retry', s.isRetryable('temporary') && !s.isRetryable('authorization') && !s.isRetryable('permanent'));

// ── Backoff + jitter ────────────────────────────────────────────────────────
ok('backoff grows with attempts (full-jitter upper bound)', s.backoffMs(1, { rand: () => 1 }) <= s.backoffMs(4, { rand: () => 1 }));
ok('backoff has jitter (rand=0 → 0)', s.backoffMs(5, { rand: () => 0 }) === 0);
ok('a provider Retry-After overrides the computed backoff', s.backoffMs(1, { retryAfterSec: 30 }) === 30000);
ok('backoff is capped', s.backoffMs(50, { rand: () => 1 }) <= 15 * 60 * 1000);

// ── Rate-limit parsing ──────────────────────────────────────────────────────
const rl = s.parseRateLimit({ 'X-RateLimit-Remaining': '0', 'Retry-After': '12', 'X-RateLimit-Limit': '100' });
ok('rate-limit headers are parsed (remaining/retry-after/quota)', rl.remaining === 0 && rl.retryAfterSec === 12 && rl.quota === 100);
ok('a missing rate-limit header is null, not zero', s.parseRateLimit({}).remaining === null);

// ── Health derivation — never "healthy" just because OAuth works ─────────────
ok('a fresh completed sync is healthy', s.deriveHealth({ lastCompletedSync: new Date().toISOString() }).status === 'healthy');
ok('an expired token → action_required (not healthy)', s.deriveHealth({ lastFailureClass: 'authorization', lastCompletedSync: new Date().toISOString() }).status === 'action_required');
ok('mapping approval required → action_required', s.deriveHealth({ needsMappingApproval: true }).status === 'action_required');
ok('schema drift → action_required', s.deriveHealth({ driftPaused: true }).status === 'action_required');
ok('paused → paused', s.deriveHealth({ paused: true }).status === 'paused');
ok('running → syncing', s.deriveHealth({ running: true }).status === 'syncing');
ok('failed records → degraded', s.deriveHealth({ lastCompletedSync: new Date().toISOString(), failedRecordCount: 3 }).status === 'degraded');
ok('a permanent failure → disconnected', s.deriveHealth({ lastFailureClass: 'permanent' }).status === 'disconnected');

// ── Staleness ≠ "no new data" ───────────────────────────────────────────────
const fresh = new Date().toISOString();
const old = new Date(Date.now() - 60 * 60000).toISOString();
ok('a recent completed sync within policy is NOT stale', !s.isStale({ lastCompletedSync: fresh, expectedFreshnessMinutes: 15 }).stale);
ok('a successful-but-EMPTY response is not stale (nothing changed is valid)', !s.isStale({ lastCompletedSync: fresh }).stale);
ok('no sync past 2× the freshness window is genuinely stale', s.isStale({ lastCompletedSync: old, expectedFreshnessMinutes: 15 }).case === 'genuinely_stale');
ok('a failed last attempt reads as stale (ran but failed)', s.isStale({ lastAttemptedSync: fresh, lastCompletedSync: old, lastFailureClass: 'temporary' }).case === 'ran_but_failed');
ok('never-run is distinguished from stale', s.isStale({}).case === 'never_ran');

console.log(`\n=== sync-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
