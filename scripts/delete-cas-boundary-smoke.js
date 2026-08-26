/* Truth layer — P0-3 stale durable deletion is a semantic conflict. */
'use strict';

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV = 'test';
process.env.SAVE_DEBOUNCE_MS = '100';

const db = require('../db.js');
const key = 'store:orgMeta:deletecas';
let row = { deletecas: { orgName: 'Newer Durable Truth', orgMode: 'universal' } };
let rev = 7;
let deleteMode = 'conflict';
const deletes = [];
const writes = [];

db.loadStores = async ({ withRevisions = false } = {}) => withRevisions
  ? { units: { [key]: JSON.parse(JSON.stringify(row)) }, revisions: { [key]: rev } }
  : { [key]: JSON.parse(JSON.stringify(row)) };
db.saveStores = async (units, opts) => {
  writes.push({ units, opts });
  return { rows: Object.keys(units).length, bytes: 0, conflicts: [] };
};
db.deleteStores = async (keys, opts = {}) => {
  deletes.push({ keys: [...keys], expect: { ...(opts.expect || {}) } });
  if (deleteMode === 'failure') throw new Error('simulated delete database failure');
  if (deleteMode === 'conflict') {
    rev = 8;
    return { rows: 0, conflicts: [key] };
  }
  row = {};
  return { rows: 1, conflicts: [] };
};

const S = require('../server.js');
let pass = 0, fail = 0;
const ok = (name, condition) => {
  if (condition) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name); }
};
const settle = () => new Promise(resolve => setTimeout(resolve, 180));

(async () => {
  console.log('delete-cas-boundary-smoke — P0-3 stale delete protection\n');
  await S._reconstruct({});
  delete S.orgMeta.deletecas;
  S.scheduleSave();
  await settle();

  ok('stale deletion names the durable revision it read',
    deletes.length === 1 && deletes[0].expect[key] === 7);
  ok('a stale delete is a semantic conflict and does not issue an overwrite', writes.length === 0);
  ok('conflict recovery retains the newer durable row',
    S.orgMeta.deletecas && S.orgMeta.deletecas.orgName === 'Newer Durable Truth');
  ok('conflict recovery advances local knowledge only to the reloaded revision', S._unitRevs.get(key) === 8);

  deleteMode = 'success';
  delete S.orgMeta.deletecas;
  S.scheduleSave();
  await settle();
  ok('deletion with the current durable revision succeeds',
    deletes.length === 2 && deletes[1].expect[key] === 8 && !S.orgMeta.deletecas);
  ok('successful deletion removes local durable revision knowledge', !S._unitRevs.has(key));

  row = { deletecas: { orgName: 'Failure Case', orgMode: 'universal' } };
  rev = 9;
  await S._reconstruct({});
  deleteMode = 'failure';
  delete S.orgMeta.deletecas;
  let error = null;
  try { await S._flushPersistence(); } catch (err) { error = err; }
  ok('a database failure remains distinguishable from a semantic conflict',
    !!error && error.message === 'simulated delete database failure' && error.code !== 'DURABLE_CONFLICT');

  console.log(`\ndelete-cas-boundary-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(err => {
  console.log('  FAIL unexpected exception:', err && err.message);
  process.exit(1);
});
