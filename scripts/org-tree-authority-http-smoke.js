/* Truth layer — WHO MAY SHAPE THE ORGANISATION.

   REPRODUCED at head cdf2a79, over HTTP, with no administrator anywhere in the chain. An ordinary
   member of a node that happened to have a child node was reported as a leader by `_isLeader`:

       for (const nid of getUserNodeIds(orgCode, userId))   // nodes they BELONG to, member OR leader
         if ((nodes[nid]?.childNodeIds || []).length) return true;

   `getUserNodeIds` answers "which nodes is this person IN". So the shape of the tree ABOVE
   somebody granted them LEADER_GRANTS — view_members, view_team, review_checkins, view_insights,
   assign_scenarios, view_reports — and `_isLeader` also gated `/api/groups/*`, which writes
   `orgNodes` through `_upsertGroupNode`. The driven chain, all 200:

       /api/auth/me      -> view_members:true, view_team:true, review_checkins:true ...
       POST /api/groups/create  -> 200, a new node written into the org tree
       PUT  /api/groups/beta    -> 200, an UNRELATED subtree's leaders set to the caller

   Meanwhile `/api/tree/*` — the same store, the front door — required `manage_tree`. Two doors,
   two locks, and the weaker one decided. In the browser `js/tree.js` rendered the action row with
   `${canManage || true ? ...}`, so every person in the organisation was shown "Assign People" on
   every node, and the ones without authority got a 403 for it.

   THE FIX IS ONE OWNER, NOT A THIRD LOCK. `_canManageNode(code, actorId, nodeId)` answers the
   question once — superadmin, or `manage_tree`, or an assigned leader over that node and its
   descendants, downward only — and `/api/tree/*`, `/api/groups/*` and `js/tree.js` all ask it.
   `_mayChangeAnchor` answers the separate question of who may move a person's placement, and
   refuses `actor === subject` before it considers authority at all.

   WHAT THIS SUITE ASSERTS, in the brief's order:
     1  an ordinary member cannot assign themselves
     2  an ordinary member cannot self-promote
     3  an assigned leader cannot move, remove, or alter their own anchor
     4  an assigned leader CAN create and manage valid child nodes
     5  an assigned leader CAN assign another person inside their subtree
     6  an assigned leader cannot act outside their subtree
     7  leadership is not conferred by a node containing them having children
     8  a superadmin can perform legitimate reassignment
     9  the browser's per-node control mirrors the server's answer
    10  the server refuses a forged request independently of the browser

   EVERY REFUSAL IS CHECKED AGAINST THE STORE, not against the status code. A 403 that still wrote
   and a 403 that did not are the same three digits, and only one of them is a fix.

   Run: node scripts/org-tree-authority-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const {
  app, _loadAllStores, _rebuildEmailIndex, issueToken,
  orgNodes, orgUsers, userPermissions,
  _canManageNode, _mayChangeAnchor, _ledNodeIds, _isLeader,
} = S;

let pass = 0, fail = 0;
/* A THROW IS A FAILURE, NOT A SILENT EXIT — PROTOCOL lie #8. */
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const O = 'ota';

/* THE SHAPE THE BUG NEEDED. `dept` has a child, so anybody merely sitting in `dept` was a leader.
   `squad` has none, so it is the control: a member of a childless node was always treated
   correctly, and without it "everybody is refused now" would look like a fix.

       org
        ├── dept        leader: lead      member: plain      <- plain is the escalation
        │    └── team                     member: junior
        └── other       leader: rival     member: outsider
        └── squad                         member: leaf       <- the control */
function seed() {
  _loadAllStores({
    orgMeta:  { [O]: { orgName: 'Org Tree Authority', orgMode: 'business' } },
    orgUsers: {
      [O]: {
        boss:     { id: 'boss',     name: 'Boss',     email: 'boss@ota.io',  role: 'superadmin', orgCode: O, status: 'active' },
        lead:     { id: 'lead',     name: 'Lead',     email: 'lead@ota.io',  role: 'coach',      orgCode: O, status: 'active', leadershipNodeIds: ['dept'] },
        plain:    { id: 'plain',    name: 'Plain',    email: 'plain@ota.io', role: 'member',     orgCode: O, status: 'active' },
        junior:   { id: 'junior',   name: 'Junior',   email: 'jun@ota.io',   role: 'member',     orgCode: O, status: 'active' },
        rival:    { id: 'rival',    name: 'Rival',    email: 'riv@ota.io',   role: 'coach',      orgCode: O, status: 'active', leadershipNodeIds: ['other'] },
        outsider: { id: 'outsider', name: 'Outsider', email: 'out@ota.io',   role: 'member',     orgCode: O, status: 'active' },
        leaf:     { id: 'leaf',     name: 'Leaf',     email: 'leaf@ota.io',  role: 'member',     orgCode: O, status: 'active' },
      },
    },
    orgNodes: {
      [O]: {
        org:   { nodeId: 'org',   name: 'Org',   parentId: null,  childNodeIds: ['dept', 'other', 'squad'], memberIds: [], leaderIds: [], rev: 1 },
        dept:  { nodeId: 'dept',  name: 'Dept',  parentId: 'org', childNodeIds: ['team'], memberIds: ['plain'], leaderIds: ['lead'], rev: 1 },
        team:  { nodeId: 'team',  name: 'Team',  parentId: 'dept', childNodeIds: [], memberIds: ['junior'], leaderIds: [], rev: 1 },
        other: { nodeId: 'other', name: 'Other', parentId: 'org', childNodeIds: [], memberIds: ['outsider'], leaderIds: ['rival'], rev: 1 },
        squad: { nodeId: 'squad', name: 'Squad', parentId: 'org', childNodeIds: [], memberIds: ['leaf'], leaderIds: [], rev: 1 },
      },
    },
  });
  for (const k of Object.keys(userPermissions)) delete userPermissions[k];
  _rebuildEmailIndex();
}
seed();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = t => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const call = (m, u, b, t) => fetch(base + u, {
    method: m, headers: H(t), body: b === undefined ? undefined : JSON.stringify(b),
  }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const get  = (u, t)    => call('GET',    u, undefined, t);
  const post = (u, b, t) => call('POST',   u, b, t);
  const put  = (u, b, t) => call('PUT',    u, b, t);
  const del  = (u, b, t) => call('DELETE', u, b, t);

  /* THE WHOLE TREE, AS BYTES. What a route DID, as opposed to what it answered. */
  const tree = () => JSON.stringify(orgNodes[O]);
  const leadersOf = id => [...((orgNodes[O][id] || {}).leaderIds || [])].sort();
  const membersOf = id => [...((orgNodes[O][id] || {}).memberIds || [])].sort();

  const tBoss  = issueToken('boss',  O, 'superadmin');
  const tLead  = issueToken('lead',  O, 'coach');
  const tPlain = issueToken('plain', O, 'member');
  const tRival = issueToken('rival', O, 'coach');
  const tLeaf  = issueToken('leaf',  O, 'member');

  try {
    console.log('\n  1 — AN ORDINARY MEMBER CANNOT ASSIGN THEMSELVES');
    /* `plain` sits in `dept`, which has a child. That was the entire qualification. */
    let before = tree();
    const selfAssignTree = await put('/api/tree/node/team',
      { memberIds: ['junior', 'plain'], ifRev: orgNodes[O].team.rev }, tPlain);
    ok('OT-1a a member cannot write themselves into a node through the tree route',
      selfAssignTree.status === 403);
    ok('OT-1b …and the tree is byte-identical, which the status code alone cannot tell you',
      tree() === before);
    ok('OT-1c …and the refusal says what they lack rather than "Forbidden"',
      /part of the organisation you lead/i.test(String((selfAssignTree.j || {}).error || '')));

    const selfAssignGroup = await put('/api/groups/team', { memberIds: ['junior', 'plain'] }, tPlain);
    ok('OT-1d …nor through the OTHER door into the same store, which is how it was done before',
      selfAssignGroup.status === 403 && !membersOf('team').includes('plain'));

    console.log('\n  2 — AN ORDINARY MEMBER CANNOT SELF-PROMOTE');
    before = tree();
    const promoteSelf = await put('/api/groups/team', { leadIds: ['plain'] }, tPlain);
    ok('OT-2a a member cannot make themselves the leader of a node (was 200 at cdf2a79)',
      promoteSelf.status === 403 && !leadersOf('team').includes('plain'));

    const promoteElsewhere = await put('/api/groups/other', { leadIds: ['plain'] }, tPlain);
    ok('OT-2b …nor of an UNRELATED subtree, which is the escalation as originally driven',
      promoteElsewhere.status === 403 && JSON.stringify(leadersOf('other')) === '["rival"]');

    const makeNode = await post('/api/groups/create', { name: 'Mine', leadIds: ['plain'] }, tPlain);
    ok('OT-2c …nor create a node of their own to lead (was 200, and it landed in orgNodes)',
      makeNode.status === 403);
    ok('OT-2d …and nothing was written to the tree on the way to that refusal',
      tree() === before);

    /* AND THE PERMISSION SURFACE AGREES. The escalation was visible in /api/auth/me before any
       write was attempted — the member was simply handed a leader's read of the organisation. */
    const mePlain = await get('/api/auth/me', tPlain);
    const perms = (mePlain.j || {}).permissions || {};
    ok('OT-2e …and they were never granted a leader\'s read of the organisation to begin with',
      perms.view_members === false && perms.view_team === false && perms.review_checkins === false);

    console.log('\n  3 — AN ASSIGNED LEADER CANNOT ALTER THEIR OWN ANCHOR');
    before = tree();
    const moveSelfIn = await put('/api/groups/team', { leadIds: ['lead'] }, tLead);
    ok('OT-3a a leader may not write themselves into a node they manage',
      moveSelfIn.status === 403 && !leadersOf('team').includes('lead'));
    ok('OT-3b …and the refusal points them at a person rather than at a policy',
      /Ask somebody who leads this part/i.test(String((moveSelfIn.j || {}).error || '')));

    const moveSelfOut = await put('/api/tree/node/dept',
      { leaderIds: [], ifRev: orgNodes[O].dept.rev }, tLead);
    ok('OT-3c …nor out of the node that anchors them, which is the same change in reverse',
      moveSelfOut.status === 403 && leadersOf('dept').includes('lead'));

    const deleteOwn = await del('/api/tree/node/dept', { ifRev: orgNodes[O].dept.rev }, tLead);
    ok('OT-3d …nor remove it, which would reparent their people past them',
      deleteOwn.status === 403 && !!orgNodes[O].dept);
    ok('OT-3e …and across all three attempts the tree is untouched',
      tree() === before);

    console.log('\n  4 — AN ASSIGNED LEADER CAN BUILD INSIDE THEIR SUBTREE');
    /* THE OTHER HALF. A gate that refused everybody would pass every assertion above and be a
       worse product than the bug: the department head could no longer run their department. */
    const child = await post('/api/tree/node',
      { name: 'Squad A', parentId: 'team', ifRev: orgNodes[O].team.rev }, tLead);
    ok('OT-4a a leader creates a child node two levels down inside their subtree',
      child.status === 200 && !!(child.j || {}).node);
    const newId = ((child.j || {}).node || {}).nodeId;
    ok('OT-4b …and it is really in the tree, hung off the parent they named',
      !!orgNodes[O][newId] && orgNodes[O][newId].parentId === 'team'
      && (orgNodes[O].team.childNodeIds || []).includes(newId));

    const rename = await put(`/api/tree/node/${newId}`,
      { name: 'Squad Alpha', ifRev: orgNodes[O][newId].rev }, tLead);
    ok('OT-4c …and can manage what they built',
      rename.status === 200 && orgNodes[O][newId].name === 'Squad Alpha');

    const topLevel = await post('/api/tree/node', { name: 'New Division', parentId: null }, tLead);
    ok('OT-4d …but a new TOP-LEVEL branch is an administrator\'s act, not a department head\'s',
      topLevel.status === 403
      && !Object.values(orgNodes[O]).some(n => n.name === 'New Division'));

    console.log('\n  5 — AND CAN ASSIGN ANOTHER PERSON INSIDE IT');
    const assignOther = await put('/api/tree/node/team',
      { memberIds: ['junior', 'leaf'], ifRev: orgNodes[O].team.rev }, tLead);
    ok('OT-5a a leader assigns somebody else into a node beneath them',
      assignOther.status === 200 && membersOf('team').includes('leaf'));
    ok('OT-5b …and it is the canonical store that changed, not a response body',
      (orgUsers[O].leaf.assignedNodeIds || []).includes('team'));

    const appointDeputy = await put('/api/tree/node/team',
      { leaderIds: ['junior'], ifRev: orgNodes[O].team.rev }, tLead);
    ok('OT-5c …and may appoint a leader beneath them — somebody else\'s anchor is theirs to set',
      appointDeputy.status === 200 && leadersOf('team').includes('junior'));
    ok('OT-5d …which is exactly the act they were refused when the subject was themselves',
      _mayChangeAnchor(O, 'lead', 'junior', 'team') === true
      && _mayChangeAnchor(O, 'lead', 'lead', 'team') === false);

    console.log('\n  6 — AND CANNOT ACT OUTSIDE IT');
    before = tree();
    const sideways = await put('/api/tree/node/other',
      { name: 'Renamed By Outsider', ifRev: orgNodes[O].other.rev }, tLead);
    ok('OT-6a a leader cannot edit a SIBLING subtree',
      sideways.status === 403 && orgNodes[O].other.name === 'Other');

    const upward = await put('/api/tree/node/org',
      { name: 'Renamed Root', ifRev: orgNodes[O].org.rev }, tLead);
    ok('OT-6b …nor the node ABOVE them, which is the direction authority does not flow',
      upward.status === 403 && orgNodes[O].org.name === 'Org');

    const stealChild = await post('/api/tree/node',
      { name: 'Wedge', parentId: 'other', ifRev: orgNodes[O].other.rev }, tLead);
    ok('OT-6c …nor build inside somebody else\'s',
      stealChild.status === 403);

    const escape = await put('/api/tree/node/team',
      { parentId: 'other', ifRev: orgNodes[O].team.rev }, tLead);
    ok('OT-6d …nor move a node they DO manage out from under their superior',
      escape.status === 403 && orgNodes[O].team.parentId === 'dept');
    ok('OT-6e …and the tree survived all four attempts unchanged',
      tree() === before);

    console.log('\n  7 — LEADERSHIP IS NOT CONFERRED BY THE SHAPE OF THE TREE');
    /* THE FINDING, STATED AS A LAW. `plain` is a member of `dept`; `dept` has a child; `leaf` is a
       member of `squad`, which has none. Before the fix those two were treated differently, and
       the only difference between them was a node neither of them had been given. */
    ok('OT-7a a member of a node WITH children is not a leader',
      _isLeader(O, 'plain') === false);
    ok('OT-7b …and neither is a member of a node without them — same answer, so it is a rule',
      _isLeader(O, 'leaf') === false);
    ok('OT-7c …and the person actually assigned to lead still is',
      _isLeader(O, 'lead') === true);
    ok('OT-7d …because leadership is read from the assignment, not from membership',
      _ledNodeIds(O, 'plain').size === 0 && _ledNodeIds(O, 'lead').has('dept'));

    const meLeaf = await get('/api/auth/me', tLeaf);
    ok('OT-7e …and the two members receive the same permissions over the wire',
      JSON.stringify((meLeaf.j || {}).permissions) === JSON.stringify(perms));

    console.log('\n  8 — A SUPERADMIN CAN PERFORM LEGITIMATE REASSIGNMENT');
    const bossMove = await put('/api/tree/node/other',
      { leaderIds: ['rival', 'lead'], ifRev: orgNodes[O].other.rev }, tBoss);
    ok('OT-8a an administrator may set leadership anywhere in the organisation',
      bossMove.status === 200 && leadersOf('other').includes('lead'));

    const bossReparent = await put('/api/tree/node/squad',
      { parentId: 'dept', ifRev: orgNodes[O].squad.rev }, tBoss);
    ok('OT-8b …and may move a node across the tree, which every leader was refused',
      bossReparent.status === 200 && orgNodes[O].squad.parentId === 'dept');

    const bossTop = await post('/api/tree/node', { name: 'New Division' }, tBoss);
    ok('OT-8c …and may add a top-level branch',
      bossTop.status === 200 && Object.values(orgNodes[O]).some(n => n.name === 'New Division'));

    /* AND A DELEGATED PERMISSION IS NOT A ROLE. `manage_tree` can be handed to one person; it
       must not become a ladder they can climb. */
    userPermissions[O] = { ...(userPermissions[O] || {}), plain: { manage_tree: true } };
    const delegatedBuild = await post('/api/tree/node', { name: 'Delegated' }, tPlain);
    ok('OT-8d a person granted manage_tree can shape the tree — the permission still means that',
      delegatedBuild.status === 200);
    const delegatedSelf = await put('/api/tree/node/other',
      { leaderIds: ['rival', 'lead', 'plain'], ifRev: orgNodes[O].other.rev }, tPlain);
    ok('OT-8e …but still cannot write their OWN placement, because that is an anchor, not an edit',
      delegatedSelf.status === 403 && !leadersOf('other').includes('plain'));
    ok('OT-8f …and the refusal sends them to an administrator, which the superadmin above was',
      /cannot change your own placement/i.test(String((delegatedSelf.j || {}).error || '')));
    delete userPermissions[O].plain;

    /* AND REASSIGNMENT RUNS BOTH WAYS. OT-8a gave `lead` authority over `other`; taking it back
       is the same administrative act, and leaving it in place would make the next section assert
       something false — `lead` genuinely leads `other` until this runs. */
    const bossUndo = await put('/api/tree/node/other',
      { leaderIds: ['rival'], ifRev: orgNodes[O].other.rev }, tBoss);
    ok('OT-8g …and an administrator can take leadership back, which is the other half of assigning it',
      bossUndo.status === 200 && JSON.stringify(leadersOf('other')) === '["rival"]'
      && !(orgUsers[O].lead.leadershipNodeIds || []).includes('other'));

    console.log('\n  9 — THE BROWSER MIRRORS THE SERVER, PER NODE');
    /* `js/tree.js` decided with `Auth.canDo('manage_tree')` and then rendered the row with
       `canManage || true`, so the answer shown was "everyone, everywhere". The mirror is loaded
       and asked the same questions the server was asked above; the two must agree node by node. */
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(path.join(__dirname, '..', 'js', 'tree.js'), 'utf8');
    const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ok('OT-9a the row is no longer rendered with an always-true condition',
      !/canManage\s*\|\|\s*true/.test(bare));

    const sandbox = { Auth: null, OrgTree: null, document: undefined, window: {} };
    const vm = require('vm');
    vm.createContext(sandbox);
    vm.runInContext(bare + '\n;this.OrgTree = OrgTree;', sandbox, { filename: 'tree.js' });
    const T = sandbox.OrgTree;
    ok('OT-9b …and the browser has a per-node answer at all',
      typeof T._mayManage === 'function');

    /* THE SAME TREE THE SERVER HOLDS, shaped as the client receives it. */
    T._nodes = {};
    for (const n of Object.values(orgNodes[O])) T._nodes[n.nodeId] = JSON.parse(JSON.stringify(n));

    const asUser = (id, permMap) => { sandbox.Auth = {
      currentUser: { id }, canDo: p => !!(permMap || {})[p] }; };

    const nodeIds = Object.keys(orgNodes[O]);
    asUser('plain', {});
    ok('OT-9c a member is offered nothing, on every node in the organisation',
      nodeIds.every(id => T._mayManage(id) === false));
    ok('OT-9d …and the server agrees on every one of them — same answer, both sides',
      nodeIds.every(id => T._mayManage(id) === _canManageNode(O, 'plain', id)));

    asUser('lead', {});
    ok('OT-9e a leader is offered their own node and what hangs beneath it',
      T._mayManage('dept') === true && T._mayManage('team') === true);
    ok('OT-9f …and not the root above them or a sibling beside them',
      T._mayManage('org') === false && T._mayManage('other') === false);
    ok('OT-9g …and matches the server on every node, which is what "mirror" has to mean',
      nodeIds.every(id => T._mayManage(id) === _canManageNode(O, 'lead', id)));

    asUser('boss', { manage_tree: true });
    ok('OT-9h an administrator is offered the whole tree',
      nodeIds.every(id => T._mayManage(id) === true && _canManageNode(O, 'boss', id) === true));

    console.log('\n 10 — AND THE SERVER DECIDES WITHOUT THE BROWSER');
    /* THE MIRROR IS A COURTESY. Every refusal in sections 1-3 and 6 was an HTTP request made
       without a browser at all, so the gate is already proven to be server-side. What is asserted
       here is that a request which *looks* like it came from an authorised screen is judged on
       the session and the tree, and on nothing the caller can put in the envelope. */
    before = tree();
    const forgedRole = await put('/api/tree/node/other',
      { name: 'Forged', role: 'superadmin', orgCode: O, permissions: { manage_tree: true },
        iqSession: { userId: 'boss', role: 'superadmin' }, ifRev: orgNodes[O].other.rev }, tPlain);
    ok('OT-10a a body claiming a role, permissions and another session is still refused',
      forgedRole.status === 403 && orgNodes[O].other.name !== 'Forged');

    const forgedHeaders = await fetch(base + '/api/tree/node/other', {
      method: 'PUT',
      headers: { ...H(tPlain), 'x-user-role': 'superadmin', 'x-org-code': O,
        'x-platform-key': process.env.IQ_PLATFORM_KEY || 'anything' },
      body: JSON.stringify({ name: 'Forged By Header', ifRev: orgNodes[O].other.rev }),
    }).then(r => r.status);
    ok('OT-10b …and so is one that asserts the same things in headers',
      forgedHeaders === 403 && orgNodes[O].other.name !== 'Forged By Header');

    const noAuth = await fetch(base + '/api/tree/node/other', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Anonymous' }),
    }).then(r => r.status);
    ok('OT-10c …and an unauthenticated request never reaches the question',
      noAuth === 401 && orgNodes[O].other.name !== 'Anonymous');
    ok('OT-10d …and after every forgery the tree is byte-identical',
      tree() === before);

    /* FAIL CLOSED ON A PERSON WHO IS NOT THERE — AGENTS.md #7. A token can outlive its user. */
    ok('OT-10e authority over a node is refused for a user who does not exist',
      _canManageNode(O, 'ghost', 'dept') === false);
    orgUsers[O].lead.status = 'suspended';
    ok('OT-10f …and for a suspended one, whose assignment has not changed at all',
      _canManageNode(O, 'lead', 'dept') === false && _ledNodeIds(O, 'lead').has('dept'));
    orgUsers[O].lead.status = 'active';

  } catch (e) { fail++; console.error('  FAIL org-tree-authority suite threw:', e && e.stack); }

  server.close();
  console.log(`\norg-tree-authority-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
