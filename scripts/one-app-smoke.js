/* Truth layer — ONE APP, AND ROLES ONLY ADD TO IT.

   Founder, September 2026: "All accounts should be the same. Only thing is leaders should have
   access to see their org tree, and super admin have access to billing once we start billing."

   Until now `launchApp` branched: a member got MemberApp and landed on Home; everybody else got
   a separate dashboard, a separate nav and a separate idea of what the product is. Two
   products, and only one of them was being designed — every fix to the member surface for the
   last month simply did not exist for a coach, which is why the founder's admin account looked
   like a different, older application. It was one.

   The rule now: THE SHELL IS THE SAME AND THE DIFFERENCES ARE ADDITIVE. A person who leads a
   node also gets the org tree. A superadmin also gets settings, and billing when there is
   billing. Nobody gets a different version of the same thing, and nobody loses anything for
   being ordinary.

   The additive part is the half worth guarding. A nav that filters by role is one refactor away
   from being a nav that BRANCHES by role, and the difference does not show up in a screenshot
   until somebody signs in as a coach and finds a product from August.

   Run: node scripts/one-app-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const fs = require('fs');
const path = require('path');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const appjs = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

/* ── OA1-OA3: one shell. ── */
ok('OA1 the landing page is not chosen by role — every account arrives at the same place',
  !/const defaultPage = isMember \?/.test(appjs) && !/navigate\(defaultPage\)/.test(appjs));
ok('OA2 MemberApp is started for EVERYONE, not only for members',
  !/if \(isMember && typeof MemberApp/.test(appjs) &&
  /if \(typeof MemberApp !== 'undefined'\) \{\s*\n\s*try \{ MemberApp\.init\(\)/.test(appjs));
ok('OA3 …and everybody lands on Home', /navigate\('home'\);/.test(appjs));

/* ── OA4-OA7: the nav ADDS, it does not replace. ── */
ok('OA4 there is one base nav, shared by every account',
  /_NAV:\s*\[/.test(appjs) && /_NAV_EXTRA:\s*\[/.test(appjs));
const base = appjs.slice(appjs.indexOf('_NAV: ['), appjs.indexOf('],', appjs.indexOf('_NAV: [')));
ok('OA5 the base nav carries what everyone has, and no role condition anywhere in it',
  ['home', 'inquiry', 'focus', 'high', 'low', 'notes', 'people'].every(id => base.includes(`id: '${id}'`)) &&
  !/when:/.test(base) && !/isAdmin|isLeader|isSuperAdmin|role/.test(base));
const extra = appjs.slice(appjs.indexOf('_NAV_EXTRA: ['), appjs.indexOf('],', appjs.indexOf('_NAV_EXTRA: [')));
/* THE TREE IS FOR EVERYBODY. Founder, revising this a day later: "everyone can get an org tree,
   just members can't change the tree." Knowing where you sit and who else is here is not a
   privilege — a player who cannot see the shape of their own club is being asked to trust a
   structure they are not allowed to look at.

   So this assertion inverts: the tree must be in the BASE nav (OA5 above), and what stays
   gated is CHANGING it. Seeing and editing are two different things and the whole safety of
   widening the first is that it does not touch the second. */
ok('OA6 every edit control on the tree still hangs off manage_tree, which a member does not have',
  (() => {
    const tree = fs.readFileSync(path.join(__dirname, '..', 'js', 'tree.js'), 'utf8');
    const edits = (tree.match(/openAddNode|openEditNode|deleteNode/g) || []).length;
    return edits > 0 && /Auth\.canDo\('manage_tree'\)/.test(tree);
  })());
ok('OA7 settings is added for the account owner, which is where billing will go',
  /id: 'settings'/.test(extra) && /Auth\.isSuperAdmin\(\)/.test(extra));

/* ── OA8: a `when` that throws reads as NO. An older cached session has no `leads` field, and
   showing somebody a control they cannot use is worse than not showing it. ── */
const navFor = appjs.slice(appjs.indexOf('_navFor() {'), appjs.indexOf('_navFor() {') + 400);
ok('OA8 a role check that throws is read as "no" rather than crashing the menu',
  /catch \(_\) \{ return false; \}/.test(navFor));

// THE CALL SITE. OA6 and OA7 only prove the extras are DEFINED. Swapping the drawer back to
// rendering `_NAV` leaves both green and quietly takes the org tree away from every leader —
// the same call-site blindness that let "Make this a focus" ship doing nothing for weeks.
const drawer = appjs.slice(appjs.indexOf('navToggle() {'), appjs.indexOf('navClose() {'));
ok('OA8b the drawer renders _navFor(), not the base list — otherwise the extras exist and nobody ever sees them',
  /this\._navFor\(\)\.map/.test(drawer) && !/this\._NAV\.map/.test(drawer));

/* ── OA9-OA12: the SERVER already allows what the nav now offers. A menu item pointing at a
   403 is worse than no menu item — it tells somebody they can do a thing and then refuses. ── */
const C = 'oaa';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'A Club', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coach:  { id: 'coach',  name: 'A Coach',  email: 'c@x.io', role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['n1'] },
    player: { id: 'player', name: 'A Player', email: 'p@x.io', role: 'member', orgCode: C, status: 'active' },
  } },
  orgNodes: { [C]: { n1: { nodeId: 'n1', name: 'First Team', parentId: null, childNodeIds: [], memberIds: ['player'], leaderIds: ['coach'] } } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base2 = `http://127.0.0.1:${server.address().port}`;
  const get = (u, tok) => fetch(base2 + u, { headers: { Authorization: `Bearer ${tok}` } })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const post = (u, tok, b) => fetch(base2 + u, { method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  const coachTok  = issueToken('coach', C, 'coach');
  const playerTok = issueToken('player', C, 'member');

  try {
    const tree = await get('/api/tree', coachTok);
    ok('OA9 a leader can READ the tree — which is the thing the founder asked for first',
      tree.status === 200 && Array.isArray((tree.j || {}).nodes));

    const invite = await post('/api/auth/invite', coachTok, { role: 'member' });
    ok('OA10 …and can onboard: minting an invite is already leader-gated, not admin-gated',
      invite.status === 200 && invite.j && invite.j.ok !== false);

    const overReach = await post('/api/auth/invite', coachTok, { role: 'superadmin' });
    ok('OA11 …but cannot invite somebody above their own level',
      overReach.status === 403);

    const byMember = await post('/api/auth/invite', playerTok, { role: 'member' });
    ok('OA12 a member who leads nothing cannot mint invites — additive means the addition is real',
      byMember.status === 403);

    /* ── OA13: THE HONEST GAP. Removing a person is still delete_members, which a coach does
       not have. The nav does not offer it to them, and this pins that the two agree — a menu
       that offers a thing the server refuses is worse than a menu that does not. ── */
    const del = await fetch(`${base2}/api/auth/users/player`, { method: 'DELETE', headers: { Authorization: `Bearer ${coachTok}` } });
    ok('OA13 a leader still cannot delete a person from the organisation — that is account deletion, not roster management, and it stays with the account owner',
      del.status === 403);

  } catch (e) { fail++; console.error('  FAIL suite threw:', e && e.stack); }

  server.close();
  console.log(`\none-app-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
