/* Truth layer — P0-2 production boundary.
   Proves the shared signal path and that the final general persistence snapshot
   cannot outrun accepted P0-1 evidence maintenance. */
'use strict';

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV = 'test';
process.env.EVIDENCE_LOG_CAP = '1';
process.env.SAVE_DEBOUNCE_MS = '30000';

const fs = require('fs');
const path = require('path');
const db = require('../db.js');
let releaseArchive;
const archiveGate = new Promise(resolve => { releaseArchive = resolve; });
let archiveStarted = false;
const cold = new Map();
const writes = [];

db.archiveColdEvidence = async (code, records) => {
  archiveStarted = true;
  await archiveGate;
  for (const row of records) cold.set(`${code}:${row.envelope.id}`, row);
  return { archived: records.length };
};
db.resolveColdEvidence = async (code, id) => cold.get(`${code}:${id}`) || null;
db.eraseColdEvidence = async () => ({ erased: true });
db.eraseColdEvidenceForSubject = async () => ({ erased: 0 });
db.eraseColdEvidenceBefore = async () => ({ erased: 0 });
db.saveStores = async units => { writes.push(JSON.parse(JSON.stringify(units))); return { rows: Object.keys(units).length, bytes: 0 }; };
db.deleteStores = async () => 0;

const S = require('../server.js');
let pass = 0, fail = 0;
const ok = (name, condition) => {
  if (condition) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name); }
};

const C = 'shutdownboundary';
S._loadAllStores({
  orgMeta: { [C]: { orgName: 'Shutdown Boundary', orgMode: 'sports' } },
  orgUsers: { [C]: { joe: { id: 'joe', name: 'Joe', role: 'member', orgCode: C, status: 'active' } } },
  evidenceLog: { [C]: [] },
});

const record = id => S._recordEvidence(C, {
  provider: 'test', source: 'reported', externalId: id, subjectId: 'joe', ownerRef: 'joe',
  type: 'observation', label: id, valueText: id, observedAt: new Date().toISOString(),
  retrievedAt: new Date().toISOString(), confidence: 'reported', visibility: 'normal',
}, { text: id });

(async () => {
  console.log('shutdown-boundary-smoke — P0-2 production path\n');
  record('first');
  record('second'); // exceeds cap and starts P0-1 archival behind archiveGate
  await new Promise(resolve => setImmediate(resolve));
  ok('evidence maintenance is pending before shutdown flush', archiveStarted);

  let settled = false;
  const flush = S._flushAndClose().then(result => { settled = true; return result; });
  await new Promise(resolve => setImmediate(resolve));
  ok('shutdown does not settle while accepted evidence maintenance is pending', settled === false);
  ok('general persistence has not run ahead of evidence maintenance', writes.length === 0);

  releaseArchive();
  const result = await flush;
  ok('shutdown succeeds after evidence maintenance and persistence settle', result.ok === true && settled === true);
  ok('the final durable snapshot contains the post-eviction hot working set',
    writes.some(units => Object.entries(units).some(([key, value]) =>
      key === `store:evidenceLog:${C}` && value[C] && value[C].length === 1)));

  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  ok('SIGTERM and SIGINT converge on the same signal handler',
    /process\.on\('SIGTERM', \(\) => _handleShutdownSignal\('SIGTERM'\)\)/.test(src) &&
    /process\.on\('SIGINT',\s+\(\) => _handleShutdownSignal\('SIGINT'\)\)/.test(src));
  ok('production startup retains the HTTP listener for graceful close',
    /_httpServer = app\.listen\(PORT/.test(src));

  console.log(`\nshutdown-boundary-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(err => {
  console.log('  FAIL unexpected exception:', err && err.message);
  process.exit(1);
});
