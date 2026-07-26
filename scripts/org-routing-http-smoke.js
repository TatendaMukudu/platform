/* Truth layer — NODE-AWARE ROUTING over HTTP. Proves an unresolved item routes to its
   resolved owner's inbox, appears in that owner's subtree rollup, and NEVER appears for a
   sibling branch lead (no cross-branch leak); the top leader's rollup spans the org; a
   node-less org answers without error. Reuses org-state uncertainties + role bindings + the
   web graph. Run: node scripts/org-routing-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const A = 'routa', N = 'routn';
_loadAllStores({
  orgMeta: { [A]: { orgName: 'A', orgMode: 'sports' }, [N]: { orgName: 'N', orgMode: 'sports' } },
  orgUsers: {
    [A]: {
      ceo:    { id: 'ceo',    name: 'Chris', role: 'coach', orgCode: A, status: 'active', leadershipNodeIds: ['root'] },
      coachA: { id: 'coachA', name: 'Alex',  role: 'coach', orgCode: A, status: 'active', leadershipNodeIds: ['teamA'] },
      coachB: { id: 'coachB', name: 'Bev',   role: 'coach', orgCode: A, status: 'active', leadershipNodeIds: ['teamB'] },
    },
    [N]: { boss: { id: 'boss', name: 'Boss', role: 'coach', orgCode: N, status: 'active' } },
  },
  orgNodes: {
    [A]: {
      root:  { nodeId: 'root',  parentId: null,  leaderIds: ['ceo'],    memberIds: [] },
      teamA: { nodeId: 'teamA', parentId: 'root', leaderIds: ['coachA'], memberIds: [] },
      teamB: { nodeId: 'teamB', parentId: 'root', leaderIds: ['coachB'], memberIds: [] },
    },
  },
});
_rebuildEmailIndex();
// A missing game-plan requirement → an unresolved uncertainty owned by the 'coach' role,
// which is bound to coachA → it should route to coachA (node teamA), never to coachB.
S.orgStateConfig[A] = { requirements: [{ claimType: 'game_plan', matches: 'game plan|tactics|formation', freshDays: 365 }] };
S.roleBindings[A] = [{ id: 'rb1', roleRef: 'coach', userId: 'coachA', status: 'active', effectiveFrom: new Date().toISOString(), effectiveTo: null }];

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = { ceo: issueToken('ceo', A, 'coach'), coachA: issueToken('coachA', A, 'coach'), coachB: issueToken('coachB', A, 'coach'), boss: issueToken('boss', N, 'coach') };
  const routing = who => (async () => { const r = await fetch(base + '/api/org/routing', { headers: { Authorization: `Bearer ${tok[who]}` } }); let j = null; try { j = await r.json(); } catch (_) {} return { status: r.status, j }; })();

  try {
    const a = await routing('coachA');
    ok('1 · the resolved owner gets the unresolved item in their inbox', a.j.ok && (a.j.inbox || []).some(x => /game plan/i.test(x.label)));
    ok('1 · the owner\'s subtree rollup counts the item', a.j.rollup && a.j.rollup.total >= 1);

    const b = await routing('coachB');
    ok('2 · a sibling branch lead does NOT get the item in their inbox', !(b.j.inbox || []).some(x => /game plan/i.test(x.label)));
    ok('2 · a sibling branch lead\'s rollup is empty (no cross-branch leak)', b.j.rollup && b.j.rollup.total === 0 && !/game plan|coachA|teamA/i.test(JSON.stringify(b.j)));

    const c = await routing('ceo');
    ok('3 · the top leader\'s rollup spans the whole org', c.j.rollup && c.j.rollup.total >= 1);
    ok('3 · the top leader does not inherit the item into their personal inbox (owner has it)', !(c.j.inbox || []).some(x => /game plan/i.test(x.label)));

    ok('4 · conflicts is always a safe array (none here — nothing is inferred)', Array.isArray(a.j.conflicts));
    ok('4 · routing never leaks internal ids / node scopes / evidence', !/subjectNodeId|ownerUserId|nodeScope|contentHash|requirementId/.test(JSON.stringify([a.j, b.j, c.j])));

    const n = await routing('boss');
    ok('5 · a node-less org returns a valid, empty-ish routing view (no crash)', n.j.ok && Array.isArray(n.j.inbox) && n.j.rollup === null);
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\norg-routing-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
