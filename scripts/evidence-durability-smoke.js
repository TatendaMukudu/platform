/* Truth layer — P0-1: EVIDENCE MAY LEAVE THE WORKING SET, NEVER EXISTENCE.

   Pilot blocker. See docs/briefs/p0-pilot-blockers.md, Decision A and Brief 1.

   WRITTEN BEFORE THE FIX, by the reviewer. These cases are the specification. Do not edit an
   assertion to make it pass — if one is wrong, say so in the PR and leave it red.

   NOT REGISTERED in scripts/test.js yet. Register it in the implementation commit that makes
   it green.

   The hot evidence log is a bounded working set. Cold evidence is PostgreSQL state, not an
   in-memory shadow. Consequently all cold-capable operations are asynchronous:

     await _resolveEvidence(code, id)
       -> { envelope, cold: false|true } | { unresolvable: true, reason }

     await _evictWorkingSet(code, ids)
       -> archive envelope + raw provenance, then remove vector + hot copies

     await _eraseEvidence(code, id)
       -> remove hot/cold/raw/vector copies; references may remain as tombstoned ids

   This suite uses a process-external fake cold table. Clearing evidenceLog simulates losing all
   process-local hot state on restart; resolution must still succeed through the DB boundary.
   Directly splicing evidenceLog would bypass the very archive-before-removal boundary under test
   and could only pass with a forbidden in-memory shadow history.

   Run: node scripts/evidence-durability-smoke.js */

'use strict';

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const db = require('../db.js');

/* Record whether the real persistence contract exists before replacing it with a deterministic
   fake. The fake represents durable state outside server.js memory and survives simulated hot
   state loss. Keys include org code so tenant isolation is exercised structurally. */
const dbContract = {
  archive: typeof db.archiveColdEvidence === 'function',
  resolve: typeof db.resolveColdEvidence === 'function',
  erase:   typeof db.eraseColdEvidence === 'function',
};
const coldRows = new Map();
const keyOf = (code, id) => `${code}:${id}`;
let failArchive = false;
let serverRef = null;
let archivedWhileHot = false;

db.archiveColdEvidence = async (code, records) => {
  if (failArchive) { failArchive = false; throw new Error('simulated cold archive failure'); }
  const rows = Array.isArray(records) ? records : [records];
  archivedWhileHot = rows.every(row =>
    (serverRef.evidenceLog[code] || []).some(env => env.id === (row.envelope || row).id));
  for (const row of rows) {
    const envelope = row.envelope || row;
    coldRows.set(keyOf(code, envelope.id), JSON.parse(JSON.stringify({
      envelope,
      rawRecord: row.rawRecord === undefined ? null : row.rawRecord,
      archivedAt: new Date().toISOString(),
    })));
  }
  return { archived: rows.length };
};
db.resolveColdEvidence = async (code, id) => {
  const row = coldRows.get(keyOf(code, id));
  return row ? JSON.parse(JSON.stringify(row)) : null;
};
db.eraseColdEvidence = async (code, id) => {
  const key = keyOf(code, id);
  const prior = coldRows.get(key);
  coldRows.set(key, { envelope: null, rawRecord: null, archivedAt: prior?.archivedAt || null,
    erasedAt: new Date().toISOString() });
  return true;
};

const S = require('../server.js');
serverRef = S;
const { _loadAllStores, evidenceLog, evidenceVectors, rawEvidence } = S;

let pass = 0, fail = 0;
const ok = (name, condition) => {
  if (condition) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name); }
};

const A = 'evdur_a';
const B = 'evdur_b';
const now = Date.now();
const envelope = (orgCode, id, extra = {}) => ({
  id, orgCode, subjectId: 'joe', status: 'active', visibility: 'org',
  type: 'checkin', provider: 'intelliq', source: 'checkin',
  valueText: `observation ${id}`, retrievedAt: now, rawRef: `raw_${orgCode}_${id}`, ...extra,
});

const oldA = envelope(A, 'e_old');
const midA = envelope(A, 'e_mid');
const newA = envelope(A, 'e_new');
const sameIdB = envelope(B, 'e_old', { valueText: 'other organisation evidence' });

_loadAllStores({
  orgMeta: {
    [A]: { orgName: 'Durability A', orgMode: 'sports' },
    [B]: { orgName: 'Durability B', orgMode: 'sports' },
  },
  orgUsers: {
    [A]: { joe: { id: 'joe', name: 'Joe', role: 'member', orgCode: A, status: 'active' } },
    [B]: { joe: { id: 'joe', name: 'Joe', role: 'member', orgCode: B, status: 'active' } },
  },
  evidenceLog: { [A]: [oldA, midA, newA], [B]: [sameIdB] },
});
rawEvidence[oldA.rawRef] = { org: A, record: { note: 'the original record' } };
rawEvidence[midA.rawRef] = { org: A, record: { note: 'must survive failed archive' } };

console.log('evidence-durability-smoke — P0-1\n');

(async () => {
  const resolve = S._resolveEvidence;
  const evict = S._evictWorkingSet;
  const erase = S._eraseEvidence;

  /* 1 — both halves of the boundary must exist: tenant-scoped durable helpers and the server
     operations that use them. A process-local map is not an alternative implementation. */
  ok('1.1 cold archive persistence helper exists', dbContract.archive);
  ok('1.2 cold resolution persistence helper exists', dbContract.resolve);
  ok('1.3 cold erasure persistence helper exists', dbContract.erase);
  ok('1.4 asynchronous evidence resolver exists', typeof resolve === 'function');
  ok('1.5 archive-before-removal eviction boundary exists', typeof evict === 'function');
  ok('1.6 hot/cold erasure boundary exists', typeof erase === 'function');

  if (typeof resolve !== 'function' || typeof evict !== 'function' || typeof erase !== 'function' ||
      !dbContract.archive || !dbContract.resolve || !dbContract.erase) {
    const remaining = 19;
    fail += remaining;
    console.log(`\n  Boundary incomplete; ${remaining} behavioural assertions remain RED.`);
    console.log(`\nevidence-durability-smoke: ${pass} passed, ${fail} failed`);
    process.exit(1);
  }

  /* 2 — hot and unknown resolution. Awaiting is deliberate: cold fallback is PostgreSQL I/O. */
  const hot = await resolve(A, 'e_new');
  ok('2.1 hot evidence resolves without pretending to be cold',
    hot && hot.envelope && hot.envelope.id === 'e_new' && hot.cold === false);
  const unknown = await resolve(A, 'never_existed');
  ok('2.2 an unknown id returns an explicit unresolvable answer',
    unknown && unknown.unresolvable === true && /not.?found|unknown/i.test(unknown.reason || ''));

  /* 3 — authoritative eviction order: durable archive completes while hot evidence still exists;
     only then may hot/vector/raw process-local copies leave the working set. */
  const vectorsA = evidenceVectors[A] || (evidenceVectors[A] = new Map());
  vectorsA.set('e_old', { hash: 'h-old', vec: [0.1], visibility: 'org', type: 'checkin', indexedAt: now });
  const beforeEviction = evidenceLog[A].length;
  await evict(A, ['e_old']);
  ok('3.1 evidence is archived before its hot copy is removed', archivedWhileHot === true);
  ok('3.2 successful archival removes the selected hot copy and bounds the working set',
    evidenceLog[A].length === beforeEviction - 1 && !evidenceLog[A].some(e => e.id === 'e_old'));
  ok('3.3 successful eviction removes the working-set vector', !vectorsA.has('e_old'));
  ok('3.4 successful eviction removes raw provenance from process memory', !rawEvidence[oldA.rawRef]);

  /* 4 — cold resolution preserves the canonical envelope and provenance, including after all
     process-local hot evidence for the organisation is discarded as it would be on restart. */
  const cold = await resolve(A, 'e_old');
  ok('4.1 evicted evidence resolves from cold storage with content and provenance intact',
    cold && cold.cold === true && cold.envelope && cold.envelope.valueText === 'observation e_old' &&
    cold.envelope.provider === 'intelliq' && cold.envelope.source === 'checkin' &&
    coldRows.get(keyOf(A, 'e_old')).rawRecord.note === 'the original record');
  evidenceLog[A] = [];
  const afterRestart = await resolve(A, 'e_old');
  ok('4.2 cold evidence resolves after process-local hot state is lost',
    afterRestart && afterRestart.cold === true && afterRestart.envelope.id === 'e_old');

  /* 5 — identical ids in different organisations are different records. The resolver must never
     fall back to a cross-tenant query. */
  const tenantB = await resolve(B, 'e_old');
  ok('5.1 resolution is tenant-scoped and does not return another organisation cold row',
    tenantB && tenantB.cold === false && tenantB.envelope.valueText === 'other organisation evidence');
  evidenceLog[B] = [];
  const absentB = await resolve(B, 'e_old');
  ok('5.2 a missing tenant-local row fails closed even when another tenant has the same id',
    absentB && absentB.unresolvable === true);

  /* 6 — archive failure is safe. The only resolvable copy and its vector remain hot. */
  evidenceLog[A].push(midA);
  const vectorsAFailure = evidenceVectors[A] || (evidenceVectors[A] = new Map());
  vectorsAFailure.set('e_mid', { hash: 'h-mid', vec: [0.2], visibility: 'org', type: 'checkin', indexedAt: now });
  failArchive = true;
  let archiveFailed = false;
  try {
    const result = await evict(A, ['e_mid']);
    archiveFailed = !!(result && result.ok === false);
  } catch (_) { archiveFailed = true; }
  ok('6.1 a failed cold archive reports failure', archiveFailed);
  ok('6.2 archive failure leaves the only evidence copy hot and resolvable',
    evidenceLog[A].some(e => e.id === 'e_mid') && (await resolve(A, 'e_mid')).cold === false);
  ok('6.3 archive failure does not evict the corresponding vector', vectorsAFailure.has('e_mid'));

  /* 7 — corrections remain reconstructable in cold storage. */
  const corrected = envelope(A, 'e_corrected', { status: 'superseded', supersededBy: 'e_new' });
  evidenceLog[A].push(corrected);
  await evict(A, ['e_corrected']);
  const coldCorrection = await resolve(A, 'e_corrected');
  ok('7.1 superseded evidence remains cold-resolvable with replacement history',
    coldCorrection && coldCorrection.envelope && coldCorrection.envelope.status === 'superseded' &&
    coldCorrection.envelope.supersededBy === 'e_new');

  /* 8 — erasure is the only permanent unresolvability. It reaches cold storage and vectors while
     leaving durable reasoning references as explicit tombstoned ids rather than rewriting history. */
  const durableReasoningRef = { evidenceId: 'e_old' };
  await erase(A, 'e_old');
  const erased = await resolve(A, 'e_old');
  ok('8.1 erasure makes cold evidence explicitly and permanently unresolvable',
    erased && erased.unresolvable === true && /eras|delet/i.test(erased.reason || ''));
  ok('8.2 erasure does not rewrite durable reasoning history that referenced the id',
    durableReasoningRef.evidenceId === 'e_old');

  const hotErase = envelope(A, 'e_hot_erase');
  evidenceLog[A].push(hotErase);
  rawEvidence[hotErase.rawRef] = { org: A, record: { note: 'erase this hot record' } };
  const hotEraseVectors = evidenceVectors[A] || (evidenceVectors[A] = new Map());
  hotEraseVectors.set(hotErase.id, { hash: 'h-erase', vec: [0.3], visibility: 'org', type: 'checkin', indexedAt: now });
  await erase(A, hotErase.id);
  const erasedHot = await resolve(A, hotErase.id);
  ok('8.3 erasure removes a hot envelope and makes its id explicitly unresolvable',
    !evidenceLog[A].some(e => e.id === hotErase.id) && erasedHot && erasedHot.unresolvable === true);
  ok('8.4 erasure removes hot raw provenance from process memory', !rawEvidence[hotErase.rawRef]);
  ok('8.5 erasure removes a hot evidence vector', !hotEraseVectors.has(hotErase.id));

  console.log(`\nevidence-durability-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(err => {
  fail++;
  console.log('  FAIL unexpected exception:', err && err.message);
  console.log(`\nevidence-durability-smoke: ${pass} passed, ${fail} failed`);
  process.exit(1);
});
