/* Truth layer — P0-3 startup baseline and durable revision propagation. */
'use strict';

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV = 'test';
process.env.SAVE_DEBOUNCE_MS = '100';

const db = require('../db.js');
const key = 'store:orgMeta:casboot';
const durable = { casboot: { orgName: 'CAS Boot', orgMode: 'universal' } };
const writes = [];
let loadFails = true;

db.loadStores = async ({ withRevisions = false } = {}) => {
  if (loadFails) throw new Error('simulated split read failure');
  return withRevisions
    ? { units: { [key]: durable }, revisions: { [key]: 7 } }
    : { [key]: durable };
};
db.saveStores = async (units, opts) => {
  writes.push({ units: JSON.parse(JSON.stringify(units)), expect: { ...(opts.expect || {}) } });
  return { rows: Object.keys(units).length, bytes: 0, conflicts: [] };
};
db.deleteStores = async () => 0;

const S = require('../server.js');
let pass = 0, fail = 0;
const ok = (name, condition) => {
  if (condition) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name); }
};
const settle = () => new Promise(resolve => setTimeout(resolve, 180));

(async () => {
  console.log('persistence-cas-boundary-smoke — P0-3 reconstruction baseline\n');
  await S._reconstruct({
    orgMeta: { broken: { orgName: 'Broken', orgMode: 'universal' } },
    orgUsers: { broken: { admin: { id: 'admin', role: 'admin', orgCode: 'broken', status: 'active' } } },
    orgNodes: { broken: { team: { nodeId: 'team', memberIds: [], leaderIds: [], rev: 0 } } },
  });
  ok('failed split reconstruction marks durable persistence unavailable',
    S._persistenceReadiness().ready === false);
  ok('failed reconstruction fabricates no durable revision zero', S._unitRevs.size === 0);

  const token = S.issueToken('admin', 'broken', 'admin');
  const http = S.app.listen(0);
  await new Promise(resolve => http.once('listening', resolve));
  const response = await fetch(`http://127.0.0.1:${http.address().port}/api/tree/node/team`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ifRev: 0, memberIds: [] }),
  });
  ok('a protected tree mutation cannot succeed without an authoritative baseline', response.status === 503);
  await new Promise(resolve => http.close(resolve));
  await settle();
  ok('unready persistence issues no guaranteed-stale revision-zero write', writes.length === 0);

  loadFails = false;
  await S._reconstruct({});
  ok('a successful authoritative reload restores persistence readiness',
    S._persistenceReadiness().ready === true);
  ok('reconstruction retains the durable unit revision', S._unitRevs.get(key) === 7);

  S.scheduleSave();
  await settle();
  ok('an unchanged reconstructed unit is not rewritten on the first save',
    !writes.some(write => Object.prototype.hasOwnProperty.call(write.units, key)));

  writes.length = 0;
  S.orgMeta.casboot.orgName = 'CAS Boot Updated';
  S.scheduleSave();
  await settle();
  ok('a changed reconstructed unit names the revision it replaces',
    writes.length === 1 && writes[0].expect[key] === 7);
  ok('a successful CAS advances process-local durable revision knowledge', S._unitRevs.get(key) === 8);

  console.log(`\npersistence-cas-boundary-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(err => {
  console.log('  FAIL unexpected exception:', err && err.message);
  process.exit(1);
});
