/* Truth layer — TAKING SOMEBODY OFF A SQUAD IS NOT DELETING THEM.

   Founder: "bolt on that take someone off my squad or invite someone onto my squad", and in the
   same breath: "only the admin can delete email address."

   Those are two acts and the entire safety of this rests on never confusing them:

     ROSTER   — no longer on my squad. They keep their account, their conversations, their
                focuses, every word they have ever said. Reversible by adding them back.
     ACCOUNT  — gone from the organisation, data erasable. Irreversible, admin only.

   A leader owns the first and has never owned the second. Conflating them is how "tidy up my
   squad list" quietly becomes "delete a person" — which is a mistake to design out, not to warn
   about. So the assertions below are mostly about what a removal does NOT touch.

   Run: node scripts/roster-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, orgUsers, orgNodes, emailIndex,
  assistantConversations, _getMemory } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'rst';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'A Club', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coach:   { id: 'coach',   name: 'Head Coach', email: 'coach@x.io', role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['first'], assignedNodeIds: [] },
    second:  { id: 'second',  name: 'Other Coach', email: 'two@x.io',  role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['first'], assignedNodeIds: ['first'] },
    player:  { id: 'player',  name: 'A Player',   email: 'p@x.io',    role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['first'] },
    bench:   { id: 'bench',   name: 'Not On It',  email: 'b@x.io',    role: 'member', orgCode: C, status: 'active', assignedNodeIds: [] },
    outsider:{ id: 'outsider',name: 'Other Coach2',email: 'o@x.io',   role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['other'], assignedNodeIds: [] },
  } },
  orgNodes: { [C]: {
    first: { nodeId: 'first', name: 'First Team', parentId: null, childNodeIds: [], memberIds: ['player', 'second'], leaderIds: ['coach', 'second'] },
    other: { nodeId: 'other', name: 'Reserves',   parentId: null, childNodeIds: [], memberIds: [], leaderIds: ['outsider'] },
  } },
  assistantConversations: { [`${C}:player`]: [{ id: 'conv_p', messages: [{ role: 'user', text: 'something I said' }] }] },
});
_rebuildEmailIndex();
_getMemory(C, 'player').focuses = [{ id: 'foc_1', text: 'Work on my touch', status: 'active', visibility: 'private' }];

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = t => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const post = (u, t, b) => fetch(base + u, { method: 'POST', headers: H(t), body: JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const del = (u, t) => fetch(base + u, { method: 'DELETE', headers: H(t) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  const coachTok    = issueToken('coach', C, 'coach');
  const outsiderTok = issueToken('outsider', C, 'coach');
  const playerTok   = issueToken('player', C, 'member');
  const members = () => orgNodes[C].first.memberIds;

  try {
    /* ── R1-R3: adding somebody to a squad you lead. ── */
    ok('R1 the player starts on the squad and the bench player does not',
      members().includes('player') && !members().includes('bench'));

    const added = await post('/api/group/first/roster', coachTok, { userId: 'bench' });
    ok('R2 a leader can put somebody on a squad they lead',
      added.status === 200 && added.j.ok === true && members().includes('bench'));
    ok('R3 …and the person\'s own record knows about it, so scoped reads agree with the node',
      (orgUsers[C].bench.assignedNodeIds || []).includes('first'));

    const twice = await post('/api/group/first/roster', coachTok, { userId: 'bench' });
    ok('R4 adding somebody already on it is safe and does not put them on twice',
      twice.status === 200 && members().filter(id => id === 'bench').length === 1);

    /* ── R5-R9: REMOVAL TOUCHES THE ROSTER AND NOTHING ELSE. ── */
    const removed = await del('/api/group/first/roster/player', coachTok);
    ok('R5 a leader can take somebody off a squad they lead',
      removed.status === 200 && !members().includes('player'));
    ok('R6 …and it says plainly that only the group changed',
      /account/i.test(removed.j.note || '') && /untouched/i.test(removed.j.note || ''));

    ok('R7 THE ACCOUNT SURVIVES — they are still a person in this organisation',
      !!orgUsers[C].player && orgUsers[C].player.status === 'active');
    ok('R8 …their email still resolves, so they can still sign in',
      !!emailIndex['p@x.io']);
    ok('R9 …and everything they ever said is still theirs',
      (assistantConversations[`${C}:player`] || []).length === 1 &&
      (_getMemory(C, 'player').focuses || []).length === 1);

    /* ── R10-R13: who may do it. ── */
    const byOutsider = await del('/api/group/first/roster/bench', outsiderTok);
    ok('R10 a leader of a DIFFERENT group cannot change this one — leading is scoped to the node, not to the org',
      byOutsider.status === 403 && members().includes('bench'));

    const byPlayer = await post('/api/group/first/roster', playerTok, { userId: 'player' });
    ok('R11 somebody who leads nothing cannot change a roster at all', byPlayer.status === 403);

    const coLeader = await del('/api/group/first/roster/second', coachTok);
    ok('R12 a leader cannot remove another LEADER of the same group — two people who both run something settle that between them, not by racing',
      coLeader.status === 403 && members().includes('second'));

    const ghost = await post('/api/group/first/roster', coachTok, { userId: 'nobody' });
    ok('R13 adding a person who does not exist is refused rather than creating a dangling id',
      ghost.status === 404);

    /* ── R14: THE LINE. Roster is a leader's; the account is not, and still is not. ── */
    const accountDelete = await del('/api/auth/users/player', coachTok);
    ok('R14 the same leader still cannot delete the account — "off my squad" and "gone" stay different acts',
      accountDelete.status === 403 && !!orgUsers[C].player);

  } catch (e) { fail++; console.error('  FAIL suite threw:', e && e.stack); }

  server.close();
  console.log(`\nroster-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
