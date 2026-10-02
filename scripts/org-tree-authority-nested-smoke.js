/* Truth layer — WHERE YOU SIT IS NOT YOURS TO DECIDE.

   A person's placement in the organisation tree is authoritative organisational structure. It is
   what decides whose evidence reaches whom, which group's inquiry a contribution can open, who
   may close a focus, and who is in a cohort. If a member can move themselves, every one of those
   answers becomes self-service, and the whole authority model is decorative.

   Self-service may legitimately mean "request to join". It may never mean mutating canonical
   structure.

   WHY THIS SUITE EXISTS RATHER THAN THE EXISTING ONE. The org-tree law is already covered, on a
   FLAT fixture — and flat is precisely where the failure this brief names cannot appear. The
   historical false-green shape is:

       A plain member belongs to a parent node that HAS CHILDREN.
       That fact alone must not make them a leader of those children.

   On a flat tree there are no children, so an implementation that confused "in a node above" with
   "leads a node above" passes everything. This fixture is three levels deep with two branches, and
   every role below is a real person in it rather than a permission flag in a request.

       club ....................... clubLeader leads it, boss is superadmin
        |- senior ................. seniorMember is a MEMBER of it, and leads nothing
        |   |- first .............. coachFirst leads it; p1 is an ordinary member
        |   \- reserves ........... coachRes leads it (the sibling branch)
        \- academy ................ nobody leads it
            \- u18 ................ coachU18 leads it (a child leader, looking upward)

   Plus exLeader (led `first`, no longer does), drifter (in no node at all), and alien (another
   tenant entirely).

   Every assertion drives `PUT /api/tree/node/:nodeId`, which is the one route that writes
   placement, through `_canManageNode` and `_mayChangeAnchor`. Nothing here asserts on those
   functions directly: a law tested at its own owner is a law that stops holding the moment a
   route forgets to ask.

   Run: node scripts/org-tree-authority-nested-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, orgNodes } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'tree', OTHER = 'rival';

const U = (id, name, role, opts = {}) => ({ id, name, email: `${id}@tree.io`, role, orgCode: C,
  status: 'active', assignedNodeIds: opts.in || [], leadershipNodeIds: opts.leads || [] });

const users = {
  boss:         U('boss', 'Boss', 'superadmin', {}),
  clubLeader:   U('clubLeader', 'Club Leader', 'coach', { leads: ['club'], in: ['club'] }),
  seniorMember: U('seniorMember', 'Senior Member', 'member', { in: ['senior'] }),
  coachFirst:   U('coachFirst', 'First Coach', 'coach', { leads: ['first'], in: ['first'] }),
  coachRes:     U('coachRes', 'Reserves Coach', 'coach', { leads: ['reserves'], in: ['reserves'] }),
  coachU18:     U('coachU18', 'U18 Coach', 'coach', { leads: ['u18'], in: ['u18'] }),
  p1:           U('p1', 'Player One', 'member', { in: ['first'] }),
  exLeader:     U('exLeader', 'Former Coach', 'coach', { in: ['first'] }),   // leads nothing now
  drifter:      U('drifter', 'Unassigned', 'member', {}),
};
const rivals = { alien: { id: 'alien', name: 'Alien', email: 'a@rival.io', role: 'superadmin',
  orgCode: OTHER, status: 'active', assignedNodeIds: [], leadershipNodeIds: [] } };

const N = (nodeId, name, parentId, memberIds, leaderIds, childNodeIds = []) =>
  ({ nodeId, name, parentId, childNodeIds, memberIds, leaderIds, rev: 1 });

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' },
             [OTHER]: { orgName: 'Rival FC', orgMode: 'sports' } },
  orgUsers: { [C]: users, [OTHER]: rivals },
  orgNodes: { [C]: {
    club:     N('club', 'The Club', null, ['clubLeader'], ['clubLeader'], ['senior', 'academy']),
    senior:   N('senior', 'Senior Section', 'club', ['seniorMember'], [], ['first', 'reserves']),
    first:    N('first', 'First Team', 'senior', ['coachFirst', 'p1', 'exLeader'], ['coachFirst']),
    reserves: N('reserves', 'Reserves', 'senior', ['coachRes'], ['coachRes']),
    academy:  N('academy', 'Academy', 'club', [], [], ['u18']),
    u18:      N('u18', 'Under 18s', 'academy', ['coachU18'], ['coachU18']),
  }, [OTHER]: { theirs: N('theirs', 'Their Squad', null, [], []) } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = who => issueToken(who, who === 'alien' ? OTHER : C,
    (users[who] || rivals[who] || {}).role || 'member');
  const call = (m, u, b, who) => fetch(base + u, { method: m,
    headers: { Authorization: `Bearer ${tok(who)}`, 'Content-Type': 'application/json' },
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  const node = id => (orgNodes[C] || {})[id] || {};
  const membersOf = id => [...(node(id).memberIds || [])].sort();
  const leadersOf = id => [...(node(id).leaderIds || [])].sort();
  /* Edit through the real route, always sending the CURRENT rev so a refusal is never just an
     optimistic-concurrency miss dressed up as an authority decision. */
  const edit = (who, nodeId, body) => call('PUT', `/api/tree/node/${nodeId}`,
    { ifRev: node(nodeId).rev, ...body }, who);

  try {
    /* ══ A — THE ATTACK THE FLAT FIXTURE CANNOT SEE ════════════════════════════════════════ */
    console.log('\n  A — BELONGING TO A NODE THAT HAS CHILDREN IS NOT LEADING THEM');
    const beforeFirst = membersOf('first');
    const r1 = await edit('seniorMember', 'first', { memberIds: [...node('first').memberIds, 'drifter'] });
    ok('TA-A1 a member of the parent cannot add somebody to a child node', r1.status === 403);
    ok('TA-A2 …and the child node is unchanged', JSON.stringify(membersOf('first')) === JSON.stringify(beforeFirst));
    const r2 = await edit('seniorMember', 'senior', { leaderIds: ['seniorMember'] });
    ok('TA-A3 …nor can they make themselves the leader of the node they are merely in', r2.status === 403);
    ok('TA-A4 …and `senior` still has no leader', leadersOf('senior').length === 0);
    /* AND THE SAME PERSON CANNOT REACH SIDEWAYS EITHER, which is the same defect wearing a
       different hat: being under `senior` does not put `reserves` in reach. */
    const r3 = await edit('seniorMember', 'reserves', { memberIds: ['coachRes', 'seniorMember'] });
    ok('TA-A5 …nor add themselves to the sibling branch under the same parent', r3.status === 403);

    /* ══ B — AN ORDINARY MEMBER MOVES NOBODY, LEAST OF ALL THEMSELVES ══════════════════════ */
    console.log('\n  B — AN ORDINARY MEMBER IS NOT AN ADMINISTRATOR OF THEIR OWN PLACEMENT');
    const rb1 = await edit('p1', 'reserves', { memberIds: ['coachRes', 'p1'] });
    ok('TA-B1 a player cannot write themselves into another squad', rb1.status === 403);
    ok('TA-B2 …and Reserves did not gain them', !membersOf('reserves').includes('p1'));
    const rb2 = await edit('p1', 'first', { memberIds: node('first').memberIds.filter(x => x !== 'p1') });
    ok('TA-B3 …nor remove themselves from the one they are in', rb2.status === 403);
    ok('TA-B4 …and First Team still has them', membersOf('first').includes('p1'));
    const rb3 = await edit('p1', 'first', { leaderIds: ['coachFirst', 'p1'] });
    ok('TA-B5 …nor add themselves to the people who lead it', rb3.status === 403);
    ok('TA-B6 …and the leadership of First Team is untouched',
      JSON.stringify(leadersOf('first')) === JSON.stringify(['coachFirst']));

    /* ══ C — A LEADER LEADS DOWNWARD, AND ONLY DOWNWARD ════════════════════════════════════ */
    console.log('\n  C — LEADERSHIP RUNS DOWN THE TREE, NOT UP OR ACROSS');
    const rc1 = await edit('coachU18', 'academy', { name: 'Academy (renamed)' });
    ok('TA-C1 a child-node leader cannot edit the parent they hang under', rc1.status === 403);
    ok('TA-C2 …and the parent keeps its name', node('academy').name === 'Academy');
    const rc2 = await edit('coachFirst', 'reserves', { memberIds: ['coachRes', 'p1'] });
    ok('TA-C3 a leader of one branch cannot reach its sibling', rc2.status === 403);
    const rc3 = await edit('coachFirst', 'senior', { leaderIds: ['coachFirst'] });
    ok('TA-C4 …nor promote themselves into the node above their own', rc3.status === 403);
    ok('TA-C5 …and `senior` still has no leader', leadersOf('senior').length === 0);

    console.log('\n  C2 — AND THE CONTROL: A LEADER REALLY CAN LEAD THEIR OWN SUBTREE');
    const rc4 = await edit('coachFirst', 'first', { memberIds: [...node('first').memberIds, 'drifter'] });
    ok('TA-C6 the First Team coach CAN add somebody to the First Team',
      rc4.status === 200 && membersOf('first').includes('drifter'));
    /* Without this, every refusal above would be satisfied by a route that refuses everybody, and
       the suite would be measuring a broken endpoint rather than an authority model. */
    const rc5 = await edit('clubLeader', 'first', { name: 'First Team' });
    ok('TA-C7 …and the club leader, who is above it, can edit it too', rc5.status === 200);

    /* ══ D — AUTHORITY THAT HAS BEEN TAKEN AWAY IS GONE NOW ════════════════════════════════ */
    console.log('\n  D — A FORMER LEADER IS A MEMBER, IMMEDIATELY');
    ok('TA-D1 the former coach is in the squad and leads nothing',
      membersOf('first').includes('exLeader') && !leadersOf('first').includes('exLeader'));
    const rd1 = await edit('exLeader', 'first', { memberIds: node('first').memberIds.filter(x => x !== 'p1') });
    ok('TA-D2 …and cannot edit the squad they used to run', rd1.status === 403);
    /* AND IT IS THE LIVE RECORD THAT DECIDES, NOT THE TOKEN. Their token still says `coach`; the
       authority comes from the tree, and the tree no longer names them. */
    ok('TA-D3 …even though their session still carries the coach role',
      (users.exLeader || {}).role === 'coach');

    console.log('\n  D2 — AND SOMEBODY IN NO NODE AT ALL REACHES NOTHING');
    for (const target of ['club', 'senior', 'first', 'academy', 'u18']) {
      const r = await edit('drifter', target, { name: 'Taken over' });
      if (r.status !== 403) { fail++; console.error('  FAIL TA-D4 unassigned person edited', target); }
    }
    ok('TA-D4 an unassigned person is refused by every node in the tree', true);

    /* ══ E — ANOTHER TENANT IS NOT A ROLE, IT IS A DIFFERENT WORLD ═════════════════════════ */
    console.log('\n  E — A SUPERADMIN OF ANOTHER ORGANISATION IS NOBODY HERE');
    const re1 = await edit('alien', 'first', { name: 'Rival FC First Team' });
    ok('TA-E1 their superadmin cannot edit this tenant\'s node', re1.status === 403 || re1.status === 404);
    ok('TA-E2 …and the node is untouched', node('first').name === 'First Team');

    /* ══ F — AND NOBODY, AT ANY RANK, MOVES THEIR OWN ANCHOR BY THE SELF-SERVICE DOOR ══════ */
    console.log('\n  F — THE ANCHOR RULE APPLIES UPWARDS TOO');
    const rf1 = await edit('clubLeader', 'club', { leaderIds: [] });
    ok('TA-F1 a club leader removing themselves as leader is refused or leaves the club led',
      rf1.status === 403 || leadersOf('club').includes('clubLeader'));
    /* THE SUPERADMIN IS THE ONE EXEMPTION AND IT IS DELIBERATE — an administrator reassigning
       anybody, themselves included, is a legitimate administrative act through the tree routes.
       Asserted so that the exemption is a decision on the record rather than a gap. */
    const rf2 = await edit('boss', 'academy', { leaderIds: ['boss'] });
    ok('TA-F2 …while a superadmin may still administer the tree, which is the documented exemption',
      rf2.status === 200 && leadersOf('academy').includes('boss'));

    /* ══ G — THE ANCHOR RULE, ISOLATED FROM THE AUTHORITY RULE ═════════════════════════════
       EVERY REFUSAL IN SECTION B IS MASKED, and mutation is what said so. Removing the self-check
       in `_mayChangeAnchor` changed nothing here, because an ordinary member is refused one gate
       earlier by `_canManageNode` — they do not lead the node, so the anchor rule is never
       reached. B therefore proves "a member cannot edit that node", which is true and is not the
       property it claims.

       The isolating case needs somebody who CAN manage the node and is changing their OWN
       placement in it. `coachFirst` leads `first`, so authority passes and only the anchor rule
       stands between them and writing themselves out of their own squad.

       AND THE TREE ROUTE DOES NOT USE `_mayChangeAnchor`. It carries its own inline copy of the
       rule (server.js, "THE ADMINISTRATOR'S DOOR OBEYS THE SAME ANCHOR LAW"), deliberately: the
       tree version exempts a superadmin, the shared helper refuses self-changes unconditionally
       for the group door. Two doors, two policies, both written down — so this is not a duplicate
       owner to converge, and it IS two things to test separately. */
    console.log('\n  G — A LEADER WITH REAL AUTHORITY STILL CANNOT MOVE THEMSELVES');
    const wasMember = membersOf('first').includes('coachFirst');
    const rg1 = await edit('coachFirst', 'first',
      { memberIds: node('first').memberIds.filter(x => x !== 'coachFirst') });
    ok('TA-G1 the First Team coach cannot write themselves out of the First Team', rg1.status === 403);
    ok('TA-G2 …and they are still in it', membersOf('first').includes('coachFirst') === wasMember);
    /* The error must name the anchor rule rather than the authority rule, because a coach who
       genuinely leads this node and is told "you can only change a part you lead" is being told
       something false about why they were refused. */
    ok('TA-G3 …and the refusal says it is about their own placement, not about what they lead',
      /your own placement/i.test(String((rg1.j || {}).error || '')));
    /* AND THE CONTROL FOR THIS SECTION: the same coach, in the same request shape, editing
       somebody ELSE'S placement in the same node, succeeds. So G1 is the anchor rule biting and
       not the route refusing every membership edit. */
    const rg2 = await edit('coachFirst', 'first',
      { memberIds: node('first').memberIds.filter(x => x !== 'drifter') });
    ok('TA-G4 …while removing somebody else from the same node, as the same coach, works',
      rg2.status === 200 && !membersOf('first').includes('drifter'));

  } catch (e) { fail++; console.error('  FAIL org-tree suite threw:', e && e.stack); }

  server.close();
  console.log(`\norg-tree-authority-nested-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
