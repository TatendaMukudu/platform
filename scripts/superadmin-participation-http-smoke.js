/* Truth layer — THE SUPER-ADMIN IS ALSO A PERSON IN THE ORGANISATION.

   In a small organisation the super-admin is usually the founder, and usually also coaches a
   team. The server has always treated them that way: `getVisibleUserIds` returns them like
   anybody else, `_contactsFor` offers them, they can set a focus, check in, hold a Focus, be in
   a node's `memberIds`. Every one of those is driven below and every one already worked.

   THE CLIENT ERASED THEM ANYWAY, in two places, for a reason that was not true.

     js/app.js   `realUsers = (flat || []).filter(u => u.role !== 'superadmin')`
                 commented "superadmin is not a 'member' in the UI", and the branch beside it
                 asserted "visible-members already strips superadmin".
     js/tree.js  `(AppState?.members || []).filter(m => m.role !== 'superadmin')`
                 — the Assign People list, so no node could ever record them.

   The server strips nothing. Driven at 5891c82: a coach's own roster read returns
   `Boss(superadmin)` beside everybody else, and a member's contacts include them. So the product
   deleted from the screen somebody the server had deliberately included, and justified it with a
   claim about the server that was false.

   THE CONSEQUENCE IS NOT COSMETIC. The founder could be on a squad, talk to people, set a focus
   and appear in a teammate's contact list — and not appear in the People list, so nobody could
   assign them to the node they were already in, and their own squad's roster was wrong by
   exactly one person: them. An account you can talk to but cannot see is the worst of both.

   NOTHING IS LOOSENED BY SHOWING THEM, and section E is the proof: the server already refuses a
   role change from anybody who is not a super-admin, refuses a member the tree, and refuses a
   tenant super-admin a host operation. A complete list is not a permissive one.

   Run: node scripts/superadmin-participation-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, orgNodes, getVisibleUserIds,
        _contactsFor } = S;

let pass = 0, fail = 0;
/* A THROW IS A FAILURE, NOT A SILENT EXIT — PROTOCOL lie #8. */
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const O = 'sap';
/* THE FOUNDER IS ON THE SQUAD. That is the ordinary case in a pilot-sized organisation and the
   one the filters made impossible to represent. */
_loadAllStores({
  orgMeta: { [O]: { orgName: 'Super Org', orgMode: 'sports' } },
  orgUsers: { [O]: {
    boss: { id: 'boss', name: 'Boss',  email: 'b@s.io', role: 'superadmin', orgCode: O, status: 'active', assignedNodeIds: ['squad'] },
    mem:  { id: 'mem',  name: 'Mem',   email: 'm@s.io', role: 'member',     orgCode: O, status: 'active', assignedNodeIds: ['squad'] },
    co:   { id: 'co',   name: 'Coach', email: 'c@s.io', role: 'coach',      orgCode: O, status: 'active', leadershipNodeIds: ['squad'] },
  } },
  orgNodes: { [O]: { squad: { nodeId: 'squad', name: 'Squad', parentId: null, childNodeIds: [],
    memberIds: ['boss', 'mem'], leaderIds: ['co'], rev: 1 } } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = who => ({ Authorization: `Bearer ${issueToken(who, O,
    who === 'boss' ? 'superadmin' : who === 'co' ? 'coach' : 'member')}`, 'Content-Type': 'application/json' });
  const call = (m, u, b, who) => fetch(base + u, { method: m, headers: H(who),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  try {
    console.log('\n  A — EVERY ORDINARY THING A PERSON DOES, DONE BY THE SUPER-ADMIN');
    /* The whole of this section already passed before the change. It is here because "the
       super-admin can participate" is the law, and a later tidy-up that special-cased them at
       one of these routes would otherwise go unnoticed. */
    const focus = await call('POST', '/api/me/focus', { text: 'Be in the building before the players' }, 'boss');
    ok('SP-A1 they can set a focus of their own',
      focus.status === 200 && !!((focus.j || {}).focus || {}).id);
    const turn = await call('POST', '/api/assistant/turn',
      { text: 'I am finding the admin side heavy this week and it is wearing me down' }, 'boss');
    ok('SP-A2 …and say something difficult, and be answered',
      turn.status === 200 && !!String(((turn.j || {}).response || {}).responseText || '').trim());
    const theirs = await call('GET', '/api/objects?kind=focus&scope=all', undefined, 'boss');
    ok('SP-A3 …and read their own objects back',
      theirs.status === 200 && ((theirs.j || {}).objects || []).length >= 1);
    const contacts = await call('GET', '/api/contacts', undefined, 'boss');
    ok('SP-A4 …and have people they can reach',
      contacts.status === 200 && ((contacts.j || {}).contacts || []).length >= 1);
    const mine = await call('GET', '/api/group/mine', undefined, 'boss');
    ok('SP-A5 …and belong to a group, which is where all of this hangs',
      mine.status === 200 && ((mine.j || {}).groups || []).some(g => g.nodeId === 'squad'));

    console.log('\n  B — AND THE SERVER HAS ALWAYS SAID SO');
    ok('SP-B1 the canonical visibility owner returns them like anybody else',
      getVisibleUserIds(O, 'co').includes('boss'));
    const roster = await call('GET', '/api/workspace/visible-members', undefined, 'co');
    ok('SP-B2 …and the coach\'s roster read returns them over the wire, super-admin and all',
      ((roster.j || {}).members || []).some(m => m.userId === 'boss' && m.role === 'superadmin'));
    ok('SP-B3 …and a member can address them, so they were never hidden from the product',
      _contactsFor(O, 'mem').some(c => c.id === 'boss'));
    ok('SP-B4 …and the node they are in really holds them',
      (orgNodes[O].squad.memberIds || []).includes('boss'));

    console.log('\n  C — SO THE CLIENT MUST NOT DELETE THEM FROM THE SCREEN');
    /* THESE THREE READ THE SOURCE, AND THAT IS A WEAKER PROOF THAN THE REST OF THIS FILE.
       The People list and the Assign People list are rendered from state this process does not
       hold, so there is no request to make against them. A source assertion catches the
       regression that would actually happen — somebody re-adding the filter — and was confirmed
       to by mutation. It would NOT catch a rewrite that expressed the same filter differently,
       and saying so here is better than implying a guarantee this cannot give. The behavioural
       half of the same law is sections B and D, which go through the real routes. */
    const fs = require('fs'), path = require('path');
    const strip = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const appJs  = strip('js/app.js');
    const treeJs = strip('js/tree.js');
    ok('SP-C1 the People list no longer filters the super-admin out of the organisation',
      !/filter\(\s*u\s*=>\s*u\.role\s*!==\s*['"]superadmin['"]\s*\)/.test(appJs));
    ok('SP-C2 …and neither does Assign People, so a node can record where they actually sit',
      !/filter\(\s*m\s*=>\s*m\.role\s*!==\s*['"]superadmin['"]\s*\)/.test(treeJs));
    ok('SP-C3 …and no client file strips them anywhere else',
      !/role\s*!==\s*['"]superadmin['"]/.test(appJs) && !/role\s*!==\s*['"]superadmin['"]/.test(treeJs));

    console.log('\n  D — AND ASSIGNING THEM THROUGH THE REAL ROUTE WORKS');
    /* The list offering them would be an empty gesture if the write refused. */
    const assign = await call('PUT', '/api/tree/node/squad',
      { leaderIds: ['co', 'boss'], ifRev: orgNodes[O].squad.rev }, 'boss');
    ok('SP-D1 a super-admin can be recorded as leading the node they are in',
      assign.status === 200 && (orgNodes[O].squad.leaderIds || []).includes('boss'));
    const rosterAfter = await call('GET', '/api/workspace/visible-members', undefined, 'co');
    ok('SP-D2 …and the roster reflects it immediately, with no second store to keep in step',
      ((rosterAfter.j || {}).members || []).some(m => m.userId === 'boss'));

    console.log('\n  E — AND NONE OF THIS LOOSENS ANYTHING');
    /* A complete list is not a permissive one. Each of these is a rule from an earlier round of
       this pass, re-driven here because "show them" must not have quietly become "let anybody". */
    const demote = await call('PUT', '/api/members/boss',
      { updates: { role: 'member' } }, 'mem');
    ok('SP-E1 an ordinary member still cannot change anybody\'s role',
      demote.status === 403 || demote.status === 404);
    const memberTree = await call('PUT', '/api/tree/node/squad',
      { name: 'Renamed By Member', ifRev: orgNodes[O].squad.rev }, 'mem');
    ok('SP-E2 …nor rename a node they merely sit in',
      memberTree.status === 403 && orgNodes[O].squad.name === 'Squad');
    const hostOp = await call('POST', '/api/admin/seed-alma', {}, 'boss');
    ok('SP-E3 …and the super-admin is still not the operator of the machine',
      hostOp.status === 403);
    /* THE FIRST VERSION OF THIS ASSERTED SOMETHING THAT IS NOT THE LAW — that a leader cannot
       rewrite their own node's roster. They can, and should: R8.1 says an assigned leader manages
       the node they lead and everything beneath it. What they may never do is move THEMSELVES,
       and that is the rule worth re-driving here, because "the super-admin is a person too" must
       not have quietly become "placement is anybody's to edit". */
    const leaderSelfAnchor = await call('PUT', '/api/tree/node/squad',
      { leaderIds: ['boss'], ifRev: orgNodes[O].squad.rev }, 'co');
    ok('SP-E4 …and a leader still cannot write themselves out of their own anchor',
      leaderSelfAnchor.status === 403 && (orgNodes[O].squad.leaderIds || []).includes('co'));
    const leaderOthers = await call('PUT', '/api/tree/node/squad',
      { memberIds: ['mem'], ifRev: orgNodes[O].squad.rev }, 'co');
    ok('SP-E5 …while managing the people they lead is still theirs to do, which is the other half',
      leaderOthers.status === 200 && !(orgNodes[O].squad.memberIds || []).includes('boss'));

  } catch (e) { fail++; console.error('  FAIL superadmin-participation suite threw:', e && e.stack); }

  server.close();
  console.log(`\nsuperadmin-participation-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
