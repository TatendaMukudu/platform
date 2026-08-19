/* Truth layer — P0-3: A STALE WRITE NEVER SILENTLY WINS.

   Pilot blocker. See docs/briefs/p0-pilot-blockers.md.

   WRITTEN BEFORE THE FIX, by the reviewer. Do not edit an assertion to make it pass.

   NOT REGISTERED in scripts/test.js yet. Register it in the commit that makes it green.

   ── The defect ──────────────────────────────────────────────────────────────────────────

   Shared objects are mutated in place — `store[code][id].field = value; scheduleSave();` —
   with no version, no compare-and-set and no conflict detection. The only lock in the process
   is `_syncLocks` (server.js:1007), scoped to connector runs.

   Two leaders open the same node. Both edit membership. Both save. The second write erases
   the first, both callers see success, and nothing records that anything was lost. At a
   hundred people this happens weekly, and because the loser is told it worked, it is never
   reported as a bug — it presents as "IntelliQ forgot".

   ── Scope, and a correction to the pilot review ─────────────────────────────────────────

   The review named three contended stores: nodes, inquiries, group subjects. Group subjects
   are not a separate store — they are keys inside `inquiryStates` (`group:<nodeId>`, proven by
   scripts/persistence-smoke.js case 11). So the protected set is TWO stores:

       orgNodes        structure: who is in which team, who leads it
       inquiryStates   member: and group: subjects alike

   Everything else is single-writer in practice and deliberately stays unprotected for pilot.

   ── The model ───────────────────────────────────────────────────────────────────────────

   A monotonic integer `rev` per object. The client sends the `rev` it read as `ifRev`.
   Mismatch is a conflict: refuse with 409 and return the current state so the client can
   re-read, show the user what changed, and decide. Retries are explicit and human — an
   automatic retry re-applies a decision made against state the human never saw, which is the
   bug wearing a helpful mask.

   Run: node scripts/write-conflict-smoke.js */

'use strict';

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, orgNodes } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'wconf';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Conflict Co', orgMode: 'sports' } },
  orgUsers: { [C]: {
    lead1: { id: 'lead1', name: 'Ada', role: 'coach', orgCode: C, status: 'active', leadershipNodeIds: ['teamA'] },
    lead2: { id: 'lead2', name: 'Ben', role: 'coach', orgCode: C, status: 'active', leadershipNodeIds: ['teamA'] },
    joe:   { id: 'joe',   name: 'Joe', role: 'member', orgCode: C, status: 'active' },
    kim:   { id: 'kim',   name: 'Kim', role: 'member', orgCode: C, status: 'active' },
  } },
  orgNodes: { [C]: {
    teamA: { nodeId: 'teamA', parentId: null, leaderIds: ['lead1', 'lead2'], memberIds: ['joe'] },
  } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok  = { lead1: issueToken('lead1', C, 'coach'), lead2: issueToken('lead2', C, 'coach') };

  const readNode = async who => {
    const r = await fetch(`${base}/api/org/nodes`, { headers: { Authorization: `Bearer ${tok[who]}` } });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, j };
  };
  const writeNode = async (who, body) => {
    const r = await fetch(`${base}/api/org/nodes/teamA`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tok[who]}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, j };
  };

  console.log('write-conflict-smoke — P0-3\n');
  try {
    /* 1 — protected objects must carry a revision at all. Without it there is nothing for a
       writer to be stale against, and the conflict cannot be detected even in principle. */
    const node = orgNodes[C].teamA;
    ok('1 · a protected object carries a monotonic revision', Number.isInteger(node.rev));

    if (!Number.isInteger(node.rev)) {
      console.log('\n  → orgNodes entries carry no `rev`. The remaining cases cannot run.');
      console.log(`\nwrite-conflict-smoke: ${pass} passed, ${fail + 6} failed`);
      server.close(); process.exit(1);
    }

    /* 2 — the revision is readable by a client, or it cannot send it back. */
    const read = await readNode('lead1');
    const seen = read.j && (read.j.nodes || {}).teamA;
    ok('2 · the revision is visible to a reader', !!seen && Number.isInteger(seen.rev));

    const rev0 = node.rev;

    /* 3 — an in-date write succeeds and advances the revision. */
    const first = await writeNode('lead1', { ifRev: rev0, memberIds: ['joe', 'kim'] });
    ok('3 · a write against current state is accepted', first.status === 200);
    ok('3 · …and the revision advances', orgNodes[C].teamA.rev === rev0 + 1);

    /* 4 — THE HEADLINE. The second leader read rev0 too. Their write must be refused, not
       silently applied over the first leader's change. */
    const stale = await writeNode('lead2', { ifRev: rev0, memberIds: ['joe'] });
    ok('4 · a stale write is refused with a conflict', stale.status === 409);
    ok('4 · …and the first writer\'s change survives intact',
      orgNodes[C].teamA.memberIds.includes('kim'));
    ok('4 · …and the refusal returns the current revision so the client can re-read',
      !!stale.j && Number.isInteger(stale.j.currentRev) && stale.j.currentRev === rev0 + 1);

    /* 5 — a write with NO precondition on a protected object fails closed. Accepting it would
       leave the exact hole this law exists to close, reachable by simply omitting a field. */
    const noPrecondition = await writeNode('lead2', { memberIds: ['joe'] });
    ok('5 · a write omitting the precondition is refused, not accepted by default',
      noPrecondition.status === 428 || noPrecondition.status === 409);

    /* 6 — after re-reading, the second leader can proceed. Conflict detection must not become
       a deadlock: the point is to make the human see what changed, then decide. */
    const fresh = orgNodes[C].teamA.rev;
    const retry = await writeNode('lead2', { ifRev: fresh, memberIds: ['joe', 'kim'] });
    ok('6 · re-reading and retrying succeeds', retry.status === 200);

  } catch (e) {
    fail++; console.log('  ✗ threw:', e && e.message);
  } finally {
    server.close();
    console.log(`\nwrite-conflict-smoke: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
