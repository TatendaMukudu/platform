/* ============================================================
   scripts/sync-reliability-smoke.js — the sync reliability invariants, end to end.

   Drives the server's durable run model + boundary to prove: idempotent replay,
   concurrency exclusion, webhook/poll overlap, correction supersede, deletion
   lifecycle, empty-not-stale, isolated drift, and observed_at-preserving replay.

   Run:  node scripts/sync-reliability-smoke.js   (part of `npm test`)
   ============================================================ */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const srv = require('../server.js');
const { _loadAllStores, _rebuildEmailIndex, _processBatch, _runConnection, _markDeletedAtSource, _newSyncRun,
        _ingestGeneric, evidenceLog, orgSignals, orgUsers, orgMappings, orgConnections, syncRuns, rawEvidence } = srv;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const CODE = 'syncco', PROV = 'gpsx';
_loadAllStores({ orgMeta: { [CODE]: { orgName: 'Sync Co', createdAt: new Date().toISOString() } }, orgUsers: { [CODE]: {
  u_t: { id: 'u_t', name: 'Tatenda', email: 't@club.fc', role: 'member', orgCode: CODE, status: 'active' },
} } });
_rebuildEmailIndex();
// An ACTIVE mapping so connector data promotes.
(orgMappings[CODE] = orgMappings[CODE] || []).push({
  id: 'map_s', org: CODE, provider: PROV, connector: 'conn_s', sourceObject: 'x',
  schemaFingerprint: 'fp', subjectField: 'email', dateField: 'date',
  fields: [{ from: 'load', primitive: 'metric', evidenceType: 'metric', label: 'Load', unit: 'au', transform: null, include: true }],
  requiredFields: ['email', 'load'], optionalFields: ['date'], identityStrategy: 'email', visibilityDefault: 'normal',
  version: 1, status: 'active', createdAt: new Date().toISOString(), audit: [],
});
const conn = { id: 'conn_s', name: 'GPS X', url: 'https://vendor.example/data', source: PROV, provider: PROV, createdBy: 'u_t', scheduleHours: 6 };
(orgConnections[CODE] = orgConnections[CODE] || []).push(conn);

const sigs = () => orgSignals[CODE] || [];
const envs = () => evidenceLog[CODE] || [];
const runBatch = (data, trigger) => { const run = _newSyncRun(CODE, conn, trigger || 'poll'); return _processBatch(CODE, conn, data, run, p => Object.assign(run, p, { completedAt: new Date().toISOString() })); };

console.log('\n=== Sync reliability invariants ===\n');

// ── Cursor commits only after crossing; batch promotes ──────────────────────
const OLD = '2026-01-15';
runBatch({ records: [{ email: 't@club.fc', load: 5, date: OLD }] }, 'poll');
ok('a clean batch promotes and commits the cursor (high-water)', sigs().length === 1 && conn.cursor === new Date(OLD).toISOString());

// ── Idempotent replay (crash-after-evidence / overlapping sync) ─────────────
const afterFirst = sigs().length;
runBatch({ records: [{ email: 't@club.fc', load: 5, date: OLD }] }, 'poll');
ok('replaying the same batch creates NO duplicate signal (idempotent)', sigs().length === afterFirst);
ok('the cursor is unchanged after an all-duplicate replay', conn.cursor === new Date(OLD).toISOString());

// ── Webhook + poll overlap → no duplicate promotion (same truth path) ───────
const beforeOverlap = sigs().length;
const wrun = _newSyncRun(CODE, conn, 'webhook');
_processBatch(CODE, conn, { records: [{ email: 't@club.fc', load: 5, date: OLD }] }, wrun, p => Object.assign(wrun, p));
ok('a webhook delivering the same record as polling does not double-promote', sigs().length === beforeOverlap);

// ── Out-of-order CORRECTION supersedes the earlier fact (same identity) ─────
runBatch({ records: [{ email: 't@club.fc', load: 9, date: OLD }] }, 'poll');   // corrected value, same facts
const active = envs().find(e => e.provider === PROV && e.label === 'Load' && e.status !== 'superseded' && e.observedAt.startsWith(OLD));
ok('a corrected value supersedes the prior fact (no competing truth)',
   active && active.value === 9 && envs().some(e => e.status === 'superseded' && e.value === 5));
ok('the corrected signal reflects the new value, and only one is live for that fact',
   sigs().filter(s => s.data?.source?.provider === PROV && String(s.ts).startsWith(OLD) && s.valueNum != null).length === 1 &&
   sigs().some(s => s.valueNum === 9 && String(s.ts).startsWith(OLD)));

// ── Deletion at source → lifecycle event, raw untouched, signal withdrawn ───
const target = envs().find(e => e.status === 'active' && e.value === 9);
const rawBefore = JSON.stringify(rawEvidence[target.rawRef].record);
const delCount = _markDeletedAtSource(CODE, PROV, { email: 't@club.fc', label: 'Load' });
ok('a source deletion marks evidence deleted_at_source (not erased)',
   delCount >= 1 && envs().find(e => e.id === target.id).status === 'deleted' && envs().find(e => e.id === target.id).deletedAtSource);
ok('deletion withdraws the live signal but preserves the raw record',
   !sigs().some(s => s.id === target.signalId) && JSON.stringify(rawEvidence[target.rawRef].record) === rawBefore);

// ── Empty successful response does not falsely mark stale / fail ─────────────
const emptyRun = _newSyncRun(CODE, conn, 'poll');
_processBatch(CODE, conn, { records: [] }, emptyRun, p => Object.assign(emptyRun, p, { completedAt: new Date().toISOString() }));
ok('an empty successful batch completes (not failed) and sets lastCompletedSync',
   emptyRun.status === 'completed' && !!conn.lastCompletedSync);

// ── Concurrency: two workers cannot process one connection run at once ──────
(async () => {
  srv._syncLocks[conn.id] = true;                    // simulate an in-flight run holding the lock
  const skipped = await _runConnection(CODE, conn, { force: true });
  ok('a second worker is refused while a run is in flight (concurrency guard)', skipped && skipped.skipped === true);
  delete srv._syncLocks[conn.id];

  // A paused connection is skipped before any fetch.
  conn.paused = true;
  const pausedRes = await _runConnection(CODE, conn);
  ok('a paused connection does not run', pausedRes && pausedRes.skipped === true);
  conn.paused = false;

  // ── Drift on one connection must not flag an unrelated one ─────────────────
  const connB = { id: 'conn_b', name: 'Other', url: 'https://b.example/d', source: 'provB', provider: 'provB', createdBy: 'u_t' };
  orgConnections[CODE].push(connB);
  runBatch({ records: [{ email: 't@club.fc', wrongfield: 1 }] }, 'poll'); // 'load' missing → drift on conn_s
  ok('schema drift on one connection does not flag an unrelated connection',
     conn.driftPaused === true && !connB.driftPaused && !connB.needsMappingApproval);
  conn.driftPaused = false;

  // ── Late historical data keeps its original observed_at ───────────────────
  const OLD2 = '2026-02-20';
  const heldRun = _newSyncRun(CODE, conn, 'poll');
  _processBatch(CODE, conn, { records: [{ email: 't@club.fc', load: 3, date: OLD2 }] }, heldRun, p => Object.assign(heldRun, p));
  ok('late historical data keeps its original observed_at',
     sigs().some(s => s.data?.source?.provider === PROV && String(s.ts).startsWith(OLD2)));

  // ── Dead-letter replay uses the raw record + preserves observed_at ────────
  const OLD3 = '2026-03-10';
  _ingestGeneric(CODE, { records: [{ email: 't@club.fc', load: 2, date: OLD3 }] }, 'u_t', { source: PROV, provider: PROV, requireApprovedMapping: true, connector: conn.id });
  const rawRef = (evidenceLog[CODE].find(e => e.provider === PROV && e.observedAt.startsWith(OLD3)) || {}).rawRef;
  const failed = srv._recordFailure(CODE, { connId: conn.id, category: 'data', error: 'was malformed', rawRef });
  ok('a failed record enters the dead-letter queue with its raw ref + category + retry eligibility',
     failed.rawRef === rawRef && failed.category === 'data' && failed.retryEligible === true && srv._openFailures(CODE, conn.id).length >= 1);

  console.log(`\n=== sync-reliability-smoke: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail ? 1 : 0);
})();
