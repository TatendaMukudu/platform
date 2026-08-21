/* Manual production-boundary verification for PostgreSQL durable-unit CAS.
   Requires DATABASE_URL and is intentionally not part of the DB-free truth layer. */
'use strict';

if (!process.env.DATABASE_URL) {
  console.error('db-cas-live: DATABASE_URL is required');
  process.exit(2);
}

const db = require('../db.js');
const key = `store:casLive:${Date.now()}`;
let pass = 0, fail = 0;
const ok = (name, condition) => {
  if (condition) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name); }
};
const valueAt = async () => {
  const loaded = await db.loadStores({ withRevisions: true });
  return { value: loaded.units[key], rev: loaded.revisions[key] };
};

(async () => {
  console.log(`db-cas-live — ${key}\n`);
  await db.init();

  const created = await db.saveStores({ [key]: { writer: 'create' } }, { expect: { [key]: 0 } });
  let current = await valueAt();
  ok('absent row with expected revision zero creates revision one',
    created.conflicts.length === 0 && current.rev === 1 && current.value.writer === 'create');

  const updated = await db.saveStores({ [key]: { writer: 'current' } }, { expect: { [key]: 1 } });
  current = await valueAt();
  ok('existing revision one with expected revision one advances to revision two',
    updated.conflicts.length === 0 && current.rev === 2 && current.value.writer === 'current');

  const stale = await db.saveStores({ [key]: { writer: 'stale' } }, { expect: { [key]: 1 } });
  current = await valueAt();
  ok('stale expected revision cannot overwrite current truth',
    stale.conflicts.includes(key) && current.rev === 2 && current.value.writer === 'current');

  const removed = await db.deleteStores([key], { expect: { [key]: 2 } });
  ok('current revision deletion succeeds', removed.conflicts.length === 0 && !(await valueAt()).value);

  const resurrect = await db.saveStores({ [key]: { writer: 'resurrect' } }, { expect: { [key]: 2 } });
  ok('stale nonzero revision cannot recreate a deleted row',
    resurrect.conflicts.includes(key) && !(await valueAt()).value);

  const recreated = await db.saveStores({ [key]: { writer: 'recreate' } }, { expect: { [key]: 0 } });
  current = await valueAt();
  ok('expected revision zero can legitimately recreate an absent row at revision one',
    recreated.conflicts.length === 0 && current.rev === 1 && current.value.writer === 'recreate');

  await db.deleteStores([key], { expect: { [key]: 1 } });
  console.log(`\ndb-cas-live: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(err => {
  console.error('db-cas-live: unexpected failure:', err && err.stack ? err.stack : err);
  process.exit(1);
});
