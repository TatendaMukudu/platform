/* Truth layer — D54: orgNodes IS THE GROUP MODEL. Lane F, consolidation 1.

   The decision is "migrate callers off legacy orgGroups; do not maintain both". The danger in a
   consolidation like this is not that the new store fails — it is that the old one survives as a
   second truth wearing a compatibility mask. So most of what follows asserts SAMENESS, not
   existence: one store, one id, one leadership field, and no way to write a value into one name
   that the other cannot see.

   `leadIds` and `id` remain as NON-ENUMERABLE projections over `leaderIds` and `nodeId`, purely
   so a front end that already reads them keeps working. Non-enumerable matters twice, and both
   were real defects caught in review rather than hypotheticals:

     • persistence content-hashes JSON.stringify(unit) to decide what changed, so an enumerable
       accessor makes merely READING a group dirty the store and manufacture CAS conflicts
     • an enumerable accessor serialises as data; on reload the accessor is not reinstalled, and
       `leadIds` becomes a plain array that no longer writes through to `leaderIds`. Leadership
       decides who can see whom, so two drifting copies of it is a privacy defect

   Run: node scripts/group-model-owner-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'group-owner';
S._loadAllStores({
  orgMeta:  { [C]: { orgName: 'Owner' } },
  orgUsers: { [C]: { a: { id: 'a', name: 'Admin', email: 'a@g.test', role: 'superadmin', orgCode: C, status: 'active' } } },
  // The legacy shape, exactly as an older save file carries it.
  orgGroups: { [C]: [{ id: 'legacy', name: 'Legacy', memberIds: ['a'], leadIds: ['a'] }] },
});
S._rebuildEmailIndex();

ok('F54.1 the load boundary migrates legacy groups into the canonical orgNodes model',
  !!(S.orgNodes[C] && S.orgNodes[C].legacy && S.orgNodes[C].legacy.leaderIds[0] === 'a'));

/* ONE STORE. The legacy name is a view, so a write through either name is the same write.
   If these ever diverge, both are being maintained and D54 has been undone. */
S.orgGroups[C][0].leadIds = ['a', 'b'];
ok('F54.2 a write through the legacy name lands in the canonical store',
  S.orgNodes[C].legacy.leaderIds.join(',') === 'a,b');
S.orgNodes[C].legacy.leaderIds = ['a'];
ok('F54.3 …and a write to the canonical store is what the legacy name reads back',
  S.orgGroups[C][0].leadIds.join(',') === 'a');

/* ONE ID, ONE LEADERSHIP FIELD. What is stored must not carry the legacy names at all — that
   is the difference between a projection and a second copy. */
const stored = () => JSON.parse(JSON.stringify(S._persistedStores().orgNodes[C].legacy));
const storedKeys = Object.keys(stored());
ok('F54.4 the stored node carries neither legacy name — they are projections, never fields',
  !storedKeys.includes('id') && !storedKeys.includes('leadIds')
  && storedKeys.includes('nodeId') && storedKeys.includes('leaderIds'));

/* READING IS NOT WRITING. Persistence decides what to save by hashing this exact string, so a
   read that changes it turns every concurrent reader into a writer competing for the same CAS.
   The node must be one NOTHING has viewed yet — a group already read has already paid whatever
   cost the first read carries, which is exactly how this went unnoticed. */
S.orgNodes[C].untouched = { nodeId: 'untouched', name: 'Untouched', memberIds: ['a'], leaderIds: ['a'] };
const beforeRead = JSON.stringify(S._persistedStores().orgNodes);
S.orgGroups[C].forEach(g => { void g.id; void g.leadIds; });
ok('F54.5 reading a group for the first time does not change the persisted state',
  JSON.stringify(S._persistedStores().orgNodes) === beforeRead);
delete S.orgNodes[C].untouched;

/* THE ROUND TRIP. Save, wipe, reload — and the two names must still be one truth. This is where
   an enumerable accessor silently split them in two. */
const snapshot = JSON.parse(JSON.stringify(S._persistedStores()));
ok('F54.6 orgGroups is not persisted as a store of its own', !('orgGroups' in snapshot));
delete S.orgNodes[C];
S._loadAllStores(snapshot);
S.orgGroups[C][0].leadIds = ['c'];
ok('F54.7 after a save and reload the legacy name still writes through to the canonical one',
  S.orgNodes[C].legacy.leaderIds.join(',') === 'c');

const server = S.app.listen(0, async () => {
  const base  = `http://127.0.0.1:${server.address().port}`;
  const token = S.issueToken('a', C, 'superadmin');
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  try {
    const created = await fetch(base + '/api/groups/create', { method: 'POST', headers: H,
      body: JSON.stringify({ name: 'Canonical', memberIds: ['a'], leadIds: ['a'] }) }).then(r => r.json());
    ok('F54.8 the existing group HTTP boundary writes orgNodes directly',
      !!(created.group && S.orgNodes[C][created.group.id]
        && S.orgNodes[C][created.group.id].name === 'Canonical'
        && S.orgNodes[C][created.group.id].leaderIds[0] === 'a'));

    /* NOTHING A PERSON SEES CHANGED. Lane F is an ownership move; the wire shape a front end
       already reads must survive it intact, legacy names and all. */
    const listed = await fetch(base + '/api/groups', { headers: H }).then(r => r.json());
    const wire   = (listed.groups || []).find(g => g.name === 'Canonical');
    ok('F54.9 the wire shape still carries the legacy id and leadIds a front end reads',
      !!(wire && wire.id === created.group.id && Array.isArray(wire.leadIds) && wire.leadIds[0] === 'a'));

    const updated = await fetch(base + `/api/groups/${created.group.id}`, { method: 'PUT', headers: H,
      body: JSON.stringify({ leadIds: ['a'], memberIds: ['a'], name: 'Renamed' }) }).then(r => r.json());
    ok('F54.10 an update over HTTP lands in the canonical store and answers in the legacy shape',
      updated.ok === true && updated.group.id === created.group.id
      && S.orgNodes[C][created.group.id].name === 'Renamed');

    await fetch(base + `/api/groups/${created.group.id}`, { method: 'DELETE', headers: H });
    ok('F54.11 deleting a group removes it from the canonical store, leaving nothing behind',
      !S.orgNodes[C][created.group.id] && !S.orgGroups[C].some(g => g.id === created.group.id));
  } catch (e) { fail++; console.error('  FAIL suite threw:', e && e.stack); }

  server.close(() => {
    console.log(`\ngroup-model-owner-smoke: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  });
});
