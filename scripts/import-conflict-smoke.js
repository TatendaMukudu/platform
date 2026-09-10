/* Truth layer — WHAT AN IMPORT LEAVES BEHIND WHEN THE TREE REFUSES IT.

   A CSV import does two kinds of write with no transaction spanning them: it mints accounts into
   `orgUsers` and `emailIndex`, and it creates the group node those people belong to. The node goes
   through the tree's compare-and-set, which can refuse — that is its job, and it is exactly what
   happens when somebody else is editing the tree while a squad is being imported.

   An independent review pointed out that the route returned at that point, and every part of it
   reproduced. Before the fix, with a real conflict injected at `db.saveStores`:

     HTTP 409, body {"error":"conflict","reason":"changed elsewhere"}
     accounts left in orgUsers : a1@cas.test, b2@cas.test
     tree nodes after rollback : (none)
     their assignedNodeIds     : [[],[]]
     the retry an operator makes: created 0, skipped 2, still no group, still unplaced

   Two real accounts, in no unit, invisible to every scope computation, PERMANENTLY unrecoverable
   through this route because the retry skips them by email before it would have placed them. And
   `scheduleSave()` never ran, so whether they survived a restart depended on an unrelated later
   save happening to catch them.

   THE CONFLICT IS INJECTED AT THE DURABLE BOUNDARY, not simulated by calling an internal. This
   file stubs `db.saveStores` BEFORE server.js is required, so the stub is the one the server
   holds, and it reports the conflict the same way a concurrent writer would.

   Run: node scripts/import-conflict-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const db = require('../db.js');
const _realSave = db.saveStores;
let conflictNextTreeSave = false;
db.saveStores = async (units, opts) => {
  const keys = Object.keys(units || {});
  const treeKeys = keys.filter(k => k.startsWith('store:orgNodes:'));
  if (conflictNextTreeSave && treeKeys.length) return { conflicts: treeKeys };
  return _realSave ? _realSave(units, opts) : {};
};

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, orgUsers, orgNodes, emailIndex } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { let v = false; try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'imc';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Import Conflict' } },
  orgUsers: { [C]: { lead: { id: 'lead', name: 'Lead', email: 'lead@imc.test', role: 'admin',
    orgCode: C, status: 'active', passwordSet: true, passwordHash: 'x' } } },
  orgNodes: { [C]: {} },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const T = issueToken('lead', C, 'admin');
  const imp = rows => fetch(`${base}/api/auth/bulk-import`, { method: 'POST',
    headers: { Authorization: 'Bearer ' + T, 'Content-Type': 'application/json' },
    body: JSON.stringify({ users: rows }) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  const ROWS = [
    { name: 'Alpha One', email: 'a1@imc.test', group: 'Keepers' },
    { name: 'Beta Two',  email: 'b2@imc.test', group: 'Keepers' },
  ];
  const mineOnly = () => Object.values(orgUsers[C]).filter(u => u.id !== 'lead');

  try {
    console.log('\n  A — A REFUSED IMPORT LEAVES NOTHING BEHIND');
    conflictNextTreeSave = true;
    const conflicted = await imp(ROWS);
    conflictNextTreeSave = false;

    ok('IC-A1 the tree\'s compare-and-set answer reaches the caller as a conflict',
      conflicted.status === 409 && /conflict/i.test(String((conflicted.j || {}).error || '')));
    ok('IC-A2 …no account minted by that request is left in the roster',
      mineOnly().length === 0);
    ok('IC-A3 …nor in the email index, which is what would refuse the retry as a duplicate',
      !emailIndex['a1@imc.test'] && !emailIndex['b2@imc.test']);
    ok('IC-A4 …and the group node is gone too, so the tree is exactly as it was',
      Object.keys(orgNodes[C]).length === 0);

    console.log('\n  A — SO THE RETRY AN OPERATOR MAKES ACTUALLY WORKS');
    const retried = await imp(ROWS);
    ok('IC-A5 the same file, imported again, creates both people rather than skipping them',
      retried.status === 200 && retried.j.ok === true
      && retried.j.counts.created === 2 && retried.j.counts.skipped === 0);
    const keepers = Object.values(orgNodes[C]).filter(n => String(n.name) === 'Keepers');
    ok('IC-A6 …the group exists once', keepers.length === 1);
    ok('IC-A7 …both people are in it', mineOnly().every(u => keepers[0].memberIds.includes(u.id)));
    ok('IC-A8 …and their SCOPE knows it, so they are not invisible to every visibility computation',
      mineOnly().every(u => (u.assignedNodeIds || []).includes(keepers[0].nodeId)));

    console.log('\n  B — A GROUPLESS IMPORT DOES NOT TOUCH THE TREE AT ALL');
    /* If nothing about the tree changed, a tree conflict cannot apply — the commit is skipped, so
       a contended tree must not be able to refuse an import that never went near it. */
    conflictNextTreeSave = true;
    const noGroup = await imp([{ name: 'Gamma Three', email: 'g3@imc.test' }]);
    conflictNextTreeSave = false;
    ok('IC-B1 an import with no group column succeeds even while the tree is contended',
      noGroup.status === 200 && noGroup.j.counts.created === 1);
    ok('IC-B2 …and that person really is in the roster',
      !!emailIndex['g3@imc.test'] && Object.values(orgUsers[C]).some(u => u.email === 'g3@imc.test'));

    console.log('\n  C — THE ROLLBACK IS SCOPED TO THIS REQUEST');
    /* People who were already there must survive a conflict caused by somebody else's import. */
    const before = Object.values(orgUsers[C]).map(u => u.id).sort();
    conflictNextTreeSave = true;
    await imp([{ name: 'Delta Four', email: 'd4@imc.test', group: 'Backs' }]);
    conflictNextTreeSave = false;
    ok('IC-C1 a failed import removes only what IT minted, never anybody already in the roster',
      JSON.stringify(Object.values(orgUsers[C]).map(u => u.id).sort()) === JSON.stringify(before));
    ok('IC-C2 …and the person it tried to add is not half-present',
      !emailIndex['d4@imc.test'] && !Object.values(orgUsers[C]).some(u => u.email === 'd4@imc.test'));
  } catch (e) { fail++; console.error('  FAIL import conflict suite threw:', e && e.stack); }

  server.close();
  console.log(`\nimport-conflict-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
