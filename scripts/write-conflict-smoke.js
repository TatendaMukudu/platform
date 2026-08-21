/* Truth layer — P0-3: A STALE WRITE NEVER SILENTLY WINS.

   Pilot blocker. Contract: docs/briefs/p0-3-adjudication.md.

   REWRITTEN 2026-08-21 by the reviewer, after Codex correctly refused to implement the previous
   version. That version was invalid in three ways and all three are fixed here:

     · it called /api/org/nodes and PATCH /api/org/nodes/:id, which do not exist. The real tree
       API is GET /api/tree, POST /api/tree/node, PUT /api/tree/node/:id, DELETE /api/tree/node/:id
       (server.js:2201-2295).
     · it used coaches as the two writers. `manage_tree` is admin/superadmin only
       (server.js:1560-1576) — a coach cannot edit the tree at all. Two ADMINS is the real case.
     · it asserted only process-local revisions, which cannot detect the cross-process overwrite
       that P0-2's shutdown flush is about to make reachable on every deploy.

   WRITTEN BEFORE THE FIX. Do not edit an assertion to make it pass.

   NOT REGISTERED in scripts/test.js yet. Register it in the commit that makes it green.

   ── The two defects, which are not the same defect ───────────────────────────────────────

   A · IN-PROCESS STALE CLIENT. Two admins open the org tree. Both edit teamA. Both PUT. The
       second write overwrites the first in memory, both callers get 200, and nothing records
       the loss. Both mutations land inside one 1.5s debounce window, so ONE save is written and
       the database never sees a conflict to detect. No amount of database-level protection can
       catch this: by the time anything is persisted, the first writer's change is already gone.

   B · CROSS-PROCESS OVERWRITE. db.js saveStores upserts unconditionally (db.js:172-176) and
       iq_store has no revision column (db.js:53-56). Render replaces an instance by booting the
       new one before stopping the old, so during every deploy two processes hold the same
       aggregate. P0-2 makes the old process flush at SIGTERM — which is correct, and which is
       exactly what the new process, holding state loaded before that flush, will then overwrite.
       Object revisions cannot catch this either: the new process's in-memory object carries the
       revision it loaded, and it is internally consistent.

   A needs an object revision checked in the request. B needs a compare-and-swap in PostgreSQL.
   They are different mechanisms at different layers and P0-3 requires both.

   ── The invariant ───────────────────────────────────────────────────────────────────────

       A write computed against state that is no longer current is refused, never silently
       applied — whether it went stale inside this process or in another one. The refusal names
       what the writer must re-read.

   Run: node scripts/write-conflict-smoke.js */

'use strict';

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const db = require('../db.js');
const S  = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, orgNodes, orgUsers } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };
const TOTAL = 19;   // keep in step with the assertions below, for the bail-out count

/* What the protected save path handed to the store. A fake, so we assert on what actually
   crossed the durable boundary rather than on what we hoped crossed it. */
let saves = [];
let casConflictOn = null;    // unit key the store should report as a CAS conflict
let throwNext = false;       // simulate a real database failure (NOT a conflict)
db.saveStores = async (units, opts = {}) => {
  if (throwNext) { throwNext = false; throw new Error('simulated database failure'); }
  const keys = Object.keys(units || {});
  saves.push({ keys, expect: opts.expect || null });
  if (casConflictOn && keys.includes(casConflictOn)) {
    return { rows: 0, bytes: 0, conflicts: [casConflictOn] };
  }
  return { rows: keys.length, bytes: 0, conflicts: [] };
};
db.deleteStores = async () => 0;

const C = 'wconf';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Conflict Co', orgMode: 'sports' } },
  orgUsers: { [C]: {
    adm1: { id: 'adm1', name: 'Ada', role: 'admin',  orgCode: C, status: 'active' },
    adm2: { id: 'adm2', name: 'Ben', role: 'admin',  orgCode: C, status: 'active' },
    joe:  { id: 'joe',  name: 'Joe', role: 'member', orgCode: C, status: 'active' },
    kim:  { id: 'kim',  name: 'Kim', role: 'member', orgCode: C, status: 'active' },
  } },
  orgNodes: { [C]: {
    teamA: { nodeId: 'teamA', name: 'Team A', parentId: null, childNodeIds: [],
             leaderIds: [], memberIds: ['joe'] },
    teamB: { nodeId: 'teamB', name: 'Team B', parentId: null, childNodeIds: [],
             leaderIds: [], memberIds: [] },
  } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok  = { adm1: issueToken('adm1', C, 'admin'), adm2: issueToken('adm2', C, 'admin') };

  const call = async (who, method, path, body) => {
    const r = await fetch(base + path, {
      method,
      headers: { Authorization: `Bearer ${tok[who]}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, j };
  };
  const readTree = who => call(who, 'GET', '/api/tree');
  const putNode  = (who, id, body) => call(who, 'PUT', `/api/tree/node/${id}`, body);

  console.log('write-conflict-smoke — P0-3 (corrected: real routes, two layers)\n');
  try {
    /* ── 1 · The revision exists and reaches the client through the production route.
       Without it there is nothing for a writer to be stale against, and the conflict cannot be
       detected even in principle. ── */
    const read0 = await readTree('adm1');
    ok('1 · GET /api/tree answers the admin', read0.status === 200 && Array.isArray(read0.j && read0.j.nodes));

    const seen = ((read0.j || {}).nodes || []).find(n => n && n.nodeId === 'teamA');
    ok('1 · …and the node it returns carries a revision', !!seen && Number.isInteger(seen.rev));
    ok('1 · …the same revision the server holds',
      !!seen && Number.isInteger(seen.rev) &&
      Number.isInteger((orgNodes[C].teamA || {}).rev) && seen.rev === orgNodes[C].teamA.rev);

    if (!seen || !Number.isInteger(seen.rev)) {
      console.log('\n  → GET /api/tree returns no `rev` on a node. The remaining cases cannot run.');
      console.log(`\nwrite-conflict-smoke: ${pass} passed, ${TOTAL - pass} failed`);
      server.close(); process.exit(1);
    }
    const rev0 = seen.rev;

    /* ── 2 · An in-date write is accepted and advances the revision. ── */
    saves = [];
    const first = await putNode('adm1', 'teamA', { ifRev: rev0, memberIds: ['joe', 'kim'] });
    ok('2 · a write against current state is accepted', first.status === 200);
    ok('2 · …and the revision advances', orgNodes[C].teamA.rev === rev0 + 1);

    /* ── 3 · THE HEADLINE. The second admin read rev0 too. Their write must be refused, not
       silently applied over the first admin's change. This is defect A, and it happens entirely
       inside one process, inside one debounce window. ── */
    const stale = await putNode('adm2', 'teamA', { ifRev: rev0, memberIds: ['joe'] });
    ok('3 · a stale write is refused with a conflict', stale.status === 409);
    ok('3 · …and the first writer\'s change survives intact',
      (orgNodes[C].teamA.memberIds || []).includes('kim'));
    ok('3 · …and the refusal names the current revision so the client can re-read',
      !!stale.j && Number.isInteger(stale.j.currentRev) && stale.j.currentRev === rev0 + 1);

    /* ── 4 · A write with NO precondition fails closed. Accepting it would leave the exact hole
       this law exists to close, reachable by omitting a field. ── */
    const bare = await putNode('adm2', 'teamA', { memberIds: ['joe'] });
    ok('4 · a write omitting the precondition is refused, not accepted by default',
      bare.status === 428 || bare.status === 409);

    /* ── 5 · Conflict detection must not become deadlock. The point is to make the human see what
       changed, then decide — so re-reading and retrying works. ── */
    const fresh = orgNodes[C].teamA.rev;
    const retry = await putNode('adm2', 'teamA', { ifRev: fresh, memberIds: ['joe', 'kim'] });
    ok('5 · re-reading and retrying succeeds', retry.status === 200);

    /* ── 6 · Deletion is a mutation too. A protected route that forgets the precondition is the
       same hole with a different verb. ── */
    const delBare = await call('adm1', 'DELETE', '/api/tree/node/teamB', {});
    ok('6 · DELETE without a precondition is refused', delBare.status === 428 || delBare.status === 409);
    const delStale = await call('adm1', 'DELETE', '/api/tree/node/teamB', { ifRev: -1 });
    ok('6 · DELETE with a stale precondition is refused', delStale.status === 409);

    /* ── 7 · THE DERIVED CACHE IS NOT THE AUTHORITY.

       A tree mutation also writes orgUsers.assignedNodeIds / leadershipNodeIds
       (_syncUserNodeArrays, server.js:2409). Those live in a DIFFERENT durable unit
       (store:orgUsers:<org> vs store:orgNodes:<org>), which looks like a two-store atomicity
       problem — and is not, because _backfillUserNodeIds rebuilds them from orgNodes alone and
       is documented "safe to run repeatedly (always rebuilt fresh)" (server.js:2433).

       That is what makes single-unit CAS on orgNodes sufficient. It is asserted here so the
       claim is checkable rather than assumed, and because the recovery path in §8 depends on
       it: after reloading orgNodes from the database, the caches must be rebuilt. ── */
    ok('7 · the membership change reached the derived user cache',
      ((orgUsers[C].kim || {}).assignedNodeIds || []).includes('teamA'));

    const rebuild = S._backfillUserNodeIds;
    if (typeof rebuild === 'function') {
      orgUsers[C].kim.assignedNodeIds = ['garbage'];
      rebuild();
      ok('7 · …and the cache is fully reconstructible from orgNodes alone',
        ((orgUsers[C].kim || {}).assignedNodeIds || []).includes('teamA') &&
        !((orgUsers[C].kim || {}).assignedNodeIds || []).includes('garbage'));
    } else {
      ok('7 · …and the cache is fully reconstructible from orgNodes alone (export _backfillUserNodeIds)', false);
    }

    /* ── 8 · DURABLE ACCEPTANCE. Defect B.

       A protected mutation may not be acknowledged before PostgreSQL has proved it was based on
       the current authoritative version. So the route must carry an expected durable revision
       across the store boundary and WAIT for the answer — not schedule a debounced save and
       return 200 on hope. ── */
    saves = [];
    const acc = await putNode('adm1', 'teamA', { ifRev: orgNodes[C].teamA.rev, memberIds: ['joe'] });
    ok('8 · an accepted protected write reached the store before responding',
      acc.status === 200 && saves.length > 0);
    ok('8 · …writing the orgNodes unit for this org',
      saves.some(s => s.keys.includes(`store:orgNodes:${C}`)));
    ok('8 · …and carrying the durable revision it expected to be replacing',
      saves.some(s => s.expect && Object.prototype.hasOwnProperty.call(s.expect, `store:orgNodes:${C}`)
        && Number.isInteger(s.expect[`store:orgNodes:${C}`])));

    /* A durable CAS rejection is a SEMANTIC conflict — another process got there first. It must
       reach the caller as 409, and the rejected mutation must not be left applied in memory. */
    {
      const before = JSON.parse(JSON.stringify(orgNodes[C].teamA));
      casConflictOn = `store:orgNodes:${C}`;
      const lost = await putNode('adm1', 'teamA', { ifRev: orgNodes[C].teamA.rev, memberIds: [] });
      casConflictOn = null;
      ok('8 · a durable CAS rejection surfaces as a conflict, not a server error', lost.status === 409);
      ok('8 · …and the rejected mutation is not left applied in memory',
        JSON.stringify((orgNodes[C].teamA || {}).memberIds) === JSON.stringify(before.memberIds));
    }

    /* ── 9 · A DATABASE FAILURE IS NOT A CONFLICT. Telling a writer "someone else changed this"
       when the database was simply unreachable sends them to re-read state that is fine, and
       hides an outage behind a UX message. The two must not share a code. ── */
    {
      throwNext = true;
      const broke = await putNode('adm1', 'teamA', { ifRev: orgNodes[C].teamA.rev, memberIds: ['joe'] });
      throwNext = false;
      ok('9 · a database failure is reported as a failure, never as a conflict',
        broke.status >= 500 && broke.status !== 409);
    }

    /* ── 10 · Tenant isolation is unaffected by any of the above. ── */
    {
      const other = issueToken('ghost', 'otherorg', 'admin');
      const r = await fetch(`${base}/api/tree/node/teamA`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${other}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ifRev: 0, memberIds: [] }),
      });
      ok('10 · a writer from another org cannot touch this node', r.status === 401 || r.status === 403 || r.status === 404);
    }

  } catch (e) {
    fail++; console.log('  ✗ threw:', e && e.message);
  } finally {
    server.close();
    console.log(`\nwrite-conflict-smoke: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
