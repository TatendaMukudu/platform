/* Truth layer — P0-1 production entry points not duplicated in the 25-case contract.
   Pins cap-triggered scheduling, SQL tenant scoping, retention, subject erasure, and
   preservation of a real durable reasoning reference. */
'use strict';

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV = 'test';
process.env.EVIDENCE_LOG_CAP = '2';

const fs = require('fs');
const path = require('path');
const dbSource = fs.readFileSync(path.join(__dirname, '..', 'db.js'), 'utf8');
const db = require('../db.js');
const cold = new Map();
const key = (code, id) => `${code}:${id}`;

db.archiveColdEvidence = async (code, records) => {
  for (const row of records) cold.set(key(code, row.envelope.id), {
    envelope: JSON.parse(JSON.stringify(row.envelope)), rawRecord: row.rawRecord,
  });
  return { archived: records.length };
};
db.resolveColdEvidence = async (code, id) => cold.get(key(code, id)) || null;
db.eraseColdEvidence = async (code, id) => {
  cold.set(key(code, id), { envelope: null, rawRecord: null, erasedAt: new Date().toISOString() });
  return { erased: true };
};
db.eraseColdEvidenceForSubject = async (code, userId) => {
  let erased = 0;
  for (const [k, row] of cold) {
    if (!k.startsWith(`${code}:`) || !row.envelope) continue;
    const env = row.envelope;
    if (env.subjectId !== userId && env.ownerRef !== userId && env.attributes?.contributorId !== userId) continue;
    cold.set(k, { envelope: null, rawRecord: null, erasedAt: new Date().toISOString() });
    erased++;
  }
  return { erased };
};
db.eraseColdEvidenceBefore = async (code, cutoffIso) => {
  let erased = 0;
  for (const [k, row] of cold) {
    if (!k.startsWith(`${code}:`) || !row.envelope) continue;
    const ts = row.envelope.observedAt || row.envelope.createdAt;
    if (!ts || Date.parse(ts) >= Date.parse(cutoffIso)) continue;
    cold.set(k, { envelope: null, rawRecord: null, erasedAt: new Date().toISOString() });
    erased++;
  }
  return { erased };
};

const S = require('../server.js');
let pass = 0, fail = 0;
const ok = (name, condition) => {
  if (condition) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name); }
};

const C = 'evbound';
S._loadAllStores({
  orgMeta: { [C]: { orgName: 'Boundary Co', orgMode: 'sports' } },
  orgUsers: { [C]: {
    joe: { id: 'joe', name: 'Joe', role: 'member', orgCode: C, status: 'active' },
    admin: { id: 'admin', name: 'Admin', role: 'superadmin', orgCode: C, status: 'active' },
  } },
  evidenceLog: { [C]: [] },
  reasoningArtifacts: { [C]: [] },
});

const record = (externalId, subjectId = 'joe', observedAt = new Date().toISOString()) =>
  S._recordEvidence(C, {
    provider: 'test', source: 'reported', externalId, subjectId, ownerRef: subjectId,
    type: 'observation', label: externalId, valueText: externalId, observedAt,
    retrievedAt: new Date().toISOString(), confidence: 'reported', visibility: 'normal',
  }, { text: externalId });

(async () => {
  console.log('evidence-durability-boundaries-smoke — P0-1 wiring\n');

  /* SQL is part of the isolation boundary. All three single-record helpers must
     bind both org_code and evidence_id, never a global evidence id. */
  for (const name of ['resolveColdEvidence', 'eraseColdEvidence']) {
    const start = dbSource.indexOf(`async function ${name}`);
    const end = dbSource.indexOf('\n}', start) + 2;
    const body = dbSource.slice(start, end);
    ok(`${name} predicates on organisation and evidence id`,
      /org_code\s*=\s*\$1/.test(body) && /evidence_id\s*=\s*\$2/.test(body));
  }
  const schema = dbSource.slice(dbSource.indexOf('CREATE TABLE IF NOT EXISTS cold_evidence'),
    dbSource.indexOf('`;', dbSource.indexOf('CREATE TABLE IF NOT EXISTS cold_evidence')));
  ok('cold evidence has a composite tenant-local primary key',
    /PRIMARY KEY \(org_code, evidence_id\)/.test(schema));

  const one = record('one');
  record('two');
  record('three');
  await S._awaitEvidenceMaintenance();
  ok('recording past the cap uses the scheduled production eviction path',
    S.evidenceLog[C].length === S.EVIDENCE_LOG_CAP && !S.evidenceLog[C].some(e => e.id === one.id));
  ok('the cap-triggered eviction archived the oldest evidence',
    (await S._resolveEvidence(C, one.id)).cold === true);

  const artifact = { id: 'art1', stage: 'kernel', basis: [one.id], result: { evidenceId: one.id } };
  S.reasoningArtifacts[C].push(artifact);
  await S._eraseEvidence(C, one.id);
  ok('erasure preserves ids in an actual durable reasoning artifact',
    S.reasoningArtifacts[C][0].basis[0] === one.id && S.reasoningArtifacts[C][0].result.evidenceId === one.id);

  const subjectEvidence = record('subject-private', 'joe');
  await S._evictWorkingSet(C, [subjectEvidence.id]);
  const removed = S._removePerson(C, 'joe', true);
  await removed.evidenceErasure;
  const subjectResolved = await S._resolveEvidence(C, subjectEvidence.id);
  ok('subject deletion erases archived canonical evidence',
    subjectResolved.unresolvable === true && /eras/.test(subjectResolved.reason));

  const old = record('retention-old', 'admin', '2000-01-01T00:00:00.000Z');
  await S._evictWorkingSet(C, [old.id]);
  S._purgeExpired(1);
  await S._awaitEvidenceMaintenance();
  const expired = await S._resolveEvidence(C, old.id);
  ok('retention erases archived evidence through the cold boundary',
    expired.unresolvable === true && /eras/.test(expired.reason));

  console.log(`\nevidence-durability-boundaries-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(err => {
  console.log('  FAIL unexpected exception:', err && err.message);
  process.exit(1);
});
