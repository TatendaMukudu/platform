/* Truth layer — P0-3 startup baseline and durable revision propagation. */
'use strict';

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV = 'test';
process.env.SAVE_DEBOUNCE_MS = '100';

const db = require('../db.js');
const key = 'store:orgMeta:casboot';
const durable = { casboot: { orgName: 'CAS Boot', orgMode: 'universal' } };
const writes = [];

db.loadStores = async ({ withRevisions = false } = {}) => withRevisions
  ? { units: { [key]: durable }, revisions: { [key]: 7 } }
  : { [key]: durable };
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
  await S._reconstruct({});
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
