/* Truth layer — ONBOARDING: ADD MEMBER, INVITES, AND THE ORG TREE.

   Every assertion here pins a defect an independent audit (Codex, `codex/onboard-pilot-audit-r1`)
   reported and this branch reproduced before changing anything.

   WHO MAY MINT AN INVITE was left open in the first round because it was a founder decision rather
   than a defect. The decision has since been made — the canonical `edit_members` permission, and
   never a position in the Org Tree — so section F now asserts it.

   WHETHER EMAIL IS EVER SENT is still a product decision, and nothing here sends it. The pilot
   creates a link for a person to share; the interface says so in those words.

   THE ONE THAT MATTERED MOST. Add Member created a real account with `passwordSet: false` and then
   handed the admin a link described as "share this link so they can set their password". The link
   was a NEW-ACCOUNT token, so redeeming it hit the duplicate-email refusal and the account could
   never be activated: it could not log in (random unknown password) and could not register (its
   address was already indexed). One dormant account, forever, behind a success message.

   Run: node scripts/onboard-invite-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, orgUsers, orgNodes } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { let v = false; try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const A = 'onba', B = 'onbb';
const mk = (code, extra = {}) => ({
  lead: { id: 'lead', name: 'Lead', email: `lead@${code}.test`, role: 'admin', orgCode: code,
    status: 'active', assignedNodeIds: ['n1'], leadershipNodeIds: ['n1'], passwordSet: true, passwordHash: 'x' },
  live: { id: 'live', name: 'Live Person', email: `live@${code}.test`, role: 'member', orgCode: code,
    status: 'active', assignedNodeIds: ['n1'], passwordSet: true, passwordHash: 'ORIGINAL' },
  ...extra,
});
_loadAllStores({
  orgMeta: { [A]: { orgName: 'Org A' }, [B]: { orgName: 'Org B' } },
  orgUsers: { [A]: mk(A), [B]: mk(B) },
  orgNodes: {
    [A]: { n1: { nodeId: 'n1', name: 'First Team', memberIds: ['lead', 'live'], leaderIds: ['lead'] } },
    [B]: { n1: { nodeId: 'n1', name: 'Other', memberIds: ['lead', 'live'], leaderIds: ['lead'] } },
  },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const T = { a: issueToken('lead', A, 'admin'), b: issueToken('lead', B, 'admin') };
  const req = (m, u, b, t) => fetch(base + u, { method: m,
    headers: { ...(t ? { Authorization: 'Bearer ' + t } : {}), 'Content-Type': 'application/json' },
    body: b ? JSON.stringify(b) : undefined }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const invite = (body, t) => req('POST', '/api/auth/invite', body, t);
  const join = body => req('POST', '/api/auth/join-invite', body);

  try {
    console.log('\n  A — ADD MEMBER PRODUCES AN ACCOUNT THAT CAN ACTUALLY BE ACTIVATED');
    const added = await req('POST', '/api/auth/create-user',
      { orgCode: A, creatorId: 'lead', firstName: 'Added', lastName: 'Person',
        name: 'Added Person', email: 'added@onba.test', role: 'member' }, T.a);
    ok('OI-A1 the account is created, dormant, exactly as the screen says',
      added.status === 200 && (Object.values(orgUsers[A]).find(u => u.email === 'added@onba.test') || {}).passwordSet === false);

    // The exact second call the client makes: an invite labelled with the added person's address.
    const link = await invite({ orgCode: A, role: 'member', label: 'added@onba.test', expiryDays: 14 }, T.a);
    ok('OI-A2 the invite the admin is told to share is created', link.status === 200 && !!link.j.token);
    const act = await join({ token: link.j.token, name: 'Added Person', email: 'added@onba.test', password: 'demo1234' });
    ok('OI-A3 …and it ACTIVATES that account rather than refusing as a duplicate',
      act.status === 200 && act.j.activated === true);
    const now = Object.values(orgUsers[A]).find(u => u.email === 'added@onba.test');
    ok('OI-A4 …the account is the SAME one, now with a password set — not a second account',
      !!now && now.passwordSet === true && now.id === added.j.user.id
      && Object.values(orgUsers[A]).filter(u => u.email === 'added@onba.test').length === 1);
    ok('OI-A5 …and they are signed in, so the promise on the screen is now true',
      typeof act.j.token === 'string' && act.j.token.length > 10);

    console.log('\n  B — AN INVITE AIMED AT SOMEBODY IS BOUND TO THEM');
    const targeted = await invite({ role: 'member', label: 'target@onba.test' }, T.a);
    const wrong = await join({ token: targeted.j.token, name: 'Someone Else', email: 'different@onba.test', password: 'demo1234' });
    ok('OI-B1 a targeted link cannot be redeemed under a different address', wrong.status === 403);
    ok('OI-B2 …and says so plainly, without naming who it was for',
      /different email address/i.test(String((wrong.j || {}).error || ''))
      && !/target@onba\.test/.test(JSON.stringify(wrong.j)));
    const right = await join({ token: targeted.j.token, name: 'Target Person', email: 'target@onba.test', password: 'demo1234' });
    ok('OI-B3 …while the person it names can use it', right.status === 200);

    /* ── A TYPO IS NOT AN OPEN LINK ─────────────────────────────────────────────────────────────
       Found by driving the real page in a browser, not by any of the assertions above: the
       "Invite by Email" panel sent the typed address as `label`, and binding was INFERRED by
       running a regex over it. So "also bad" simply failed to look like an address and became a
       general join link — one anybody holding it may redeem — from the one screen whose entire
       purpose is a link per named person. Three links came back for three lines and the panel
       reported three successes.

       `email` is the declared field for "this invite is for this person". Present and malformed
       is a refusal. Absent still means an open link, which is what Generate Join Link is for. */
    console.log('\n  B — A TYPO IS A REFUSAL, NOT AN OPEN LINK');
    ok('OI-B6 an address that is not one is refused when declared as an address',
      (await invite({ role: 'member', email: 'also bad' }, T.a)).status === 400
      && (await invite({ role: 'member', email: 'nope' }, T.a)).status === 400);
    ok('OI-B7 …and the refusal says what was wrong with it',
      /is not an email address/i.test(String(((await invite({ role: 'member', email: 'also bad' }, T.a)).j || {}).error || '')));
    ok('OI-B8 …an empty declared address is refused too, rather than quietly becoming an open link',
      (await invite({ role: 'member', email: '' }, T.a)).status === 400);
    const declared = await invite({ role: 'member', email: 'Declared@ONBA.test' }, T.a);
    ok('OI-B9 …while a real one is accepted and bound, lower-cased',
      declared.status === 200 && S.inviteTokens[declared.j.token].email === 'declared@onba.test');
    ok('OI-B10 …and that binding is enforced at redemption, like any other',
      (await join({ token: declared.j.token, name: 'Someone', email: 'other@onba.test', password: 'demo1234' })).status === 403);

    console.log('\n  B — AND AN UNBOUND JOIN LINK IS STILL AN OPEN ONE');
    const general = await invite({ role: 'member' }, T.a);
    const anyone = await join({ token: general.j.token, name: 'New Recruit', email: 'recruit@onba.test', password: 'demo1234' });
    ok('OI-B4 a general join link still admits anyone, unchanged', anyone.status === 200);
    ok('OI-B5 …a non-email label binds nothing, so "First Team intake" stays a label',
      (async () => true)() && (await join({
        token: (await invite({ role: 'member', label: 'First Team intake' }, T.a)).j.token,
        name: 'Labelled Join', email: 'labelled@onba.test', password: 'demo1234' })).status === 200);

    console.log('\n  C — ACTIVATION CANNOT BECOME ACCOUNT TAKEOVER');
    const atLive = await invite({ role: 'member', label: 'live@onba.test' }, T.a);
    const steal = await join({ token: atLive.j.token, name: 'Impostor', email: 'live@onba.test', password: 'hacked99' });
    ok('OI-C1 an ACTIVE account is never claimable, even by a correctly-targeted invite',
      steal.status === 400 && orgUsers[A].live.passwordHash === 'ORIGINAL');
    // Dormant, but in the OTHER organisation: the invite is org-scoped, so it must not reach them.
    orgUsers[B].dorm = { id: 'dorm', name: 'Dormant B', email: 'dorm@onbb.test', role: 'member',
      orgCode: B, status: 'active', assignedNodeIds: ['n1'], passwordSet: false };
    _rebuildEmailIndex();
    const crossToken = await invite({ role: 'member', label: 'dorm@onbb.test' }, T.a);
    const cross = await join({ token: crossToken.j.token, name: 'Dormant B', email: 'dorm@onbb.test', password: 'demo1234' });
    ok('OI-C2 a dormant account in ANOTHER organisation is not reachable from this one\'s invite',
      cross.status === 400 && orgUsers[B].dorm.passwordSet === false);

    /* ══ C — AND AN INVITE MAY NOT HAND BACK A ROLE IT COULD NOT HAVE MINTED ═══════════════════
       The activation guard asked three questions — same address, same organisation, still dormant
       — and never the fourth: is this invite entitled to THIS ACCOUNT'S ROLE? Reported by an
       independent review and reproduced end to end as a full privilege escalation:

         admin mints role=superadmin                       -> 403 "above your own level"
         admin mints role=member at a dormant superadmin   -> 200
         admin redeems it with a password they choose      -> 200, activated, role: superadmin
         that session mints a superadmin invite            -> 200
         that session reads /api/admin/persistence         -> 200

       The ceiling was enforced where invites are minted and discarded where an account is handed
       over, so the ladder could be climbed by aiming a permitted invite at an account nobody was
       permitted to invite. */
    orgUsers[A].dormsa = { id: 'dormsa', name: 'Dormant Owner', email: 'dormsa@onba.test',
      role: 'superadmin', orgCode: A, status: 'active', passwordSet: false };
    orgUsers[A].dormadm = { id: 'dormadm', name: 'Dormant Admin', email: 'dormadm@onba.test',
      role: 'admin', orgCode: A, status: 'active', passwordSet: false };
    orgUsers[A].dormmem = { id: 'dormmem', name: 'Dormant Member', email: 'dormmem@onba.test',
      role: 'member', orgCode: A, status: 'active', passwordSet: false };
    _rebuildEmailIndex();
    const memberInviteFor = async addr =>
      (await invite({ role: 'member', email: addr }, T.a)).j.token;

    const grabSA = await join({ token: await memberInviteFor('dormsa@onba.test'),
      name: 'Dormant Owner', email: 'dormsa@onba.test', password: 'chosen123' });
    ok('OI-C4 a MEMBER invite cannot activate a dormant SUPERADMIN and hand back their role',
      grabSA.status !== 200 && grabSA.j.activated !== true
      && orgUsers[A].dormsa.passwordSet === false);
    ok('OI-C5 …nor a dormant ADMIN, so the ceiling holds at every rung, not just the top one',
      (await join({ token: await memberInviteFor('dormadm@onba.test'),
        name: 'Dormant Admin', email: 'dormadm@onba.test', password: 'chosen123' })).status !== 200
      && orgUsers[A].dormadm.passwordSet === false);
    ok('OI-C6 …and the refusal does not announce that a privileged account is at that address',
      !/superadmin|admin|privileg/i.test(JSON.stringify(grabSA.j || {})));
    /* The legitimate case the whole activation branch exists for must still work, or this is not
       a fix but a removal. */
    ok('OI-C7 …while a member invite still activates a dormant MEMBER, which is the point of it',
      (await join({ token: await memberInviteFor('dormmem@onba.test'),
        name: 'Dormant Member', email: 'dormmem@onba.test', password: 'demo1234' })).j.activated === true
      && orgUsers[A].dormmem.passwordSet === true);
    /* And an invite minted AT the account's own level still activates it — the rule is a ceiling,
       not a ban on ever activating a privileged account. Only a superadmin can mint this. */
    orgUsers[A].dormadm2 = { id: 'dormadm2', name: 'Dormant Admin Two', email: 'dormadm2@onba.test',
      role: 'admin', orgCode: A, status: 'active', passwordSet: false };
    orgUsers[A].owner = { id: 'owner', name: 'Owner', email: 'owner@onba.test', role: 'superadmin',
      orgCode: A, status: 'active', passwordSet: true, passwordHash: 'x' };
    _rebuildEmailIndex();
    const adminInvite = await invite({ role: 'admin', email: 'dormadm2@onba.test' }, issueToken('owner', A, 'superadmin'));
    ok('OI-C8 …and an ADMIN invite does activate a dormant admin — a ceiling, not a ban',
      (await join({ token: adminInvite.j.token, name: 'Dormant Admin Two',
        email: 'dormadm2@onba.test', password: 'demo1234' })).j.activated === true
      && orgUsers[A].dormadm2.passwordSet === true && orgUsers[A].dormadm2.role === 'admin');

    /* OI-C3 — THE LAW A MUTATION FOUND. Removing `invite.email === emailNorm` from the activation
       guard left every assertion green, because the ones above are held by the dormancy and
       organisation checks instead. What that clause alone protects is this: a GENERAL join link,
       which anybody may hold, must not be usable to claim a dormant account by typing its
       address. Without it, one open invite link would activate any pending member in the org. */
    orgUsers[A].pending = { id: 'pending', name: 'Pending Person', email: 'pending@onba.test',
      role: 'member', orgCode: A, status: 'active', assignedNodeIds: ['n1'], passwordSet: false };
    _rebuildEmailIndex();
    const openLink = await invite({ role: 'member' }, T.a);
    const grab = await join({ token: openLink.j.token, name: 'Pending Person', email: 'pending@onba.test', password: 'grabbed1' });
    ok('OI-C3 an UNBOUND join link cannot activate somebody else\'s pending account',
      grab.status === 400 && orgUsers[A].pending.passwordSet === false);

    console.log('\n  D — THE ORG TREE SURVIVES A RETRY');
    const t1 = await req('POST', '/api/tree/node', { name: 'Retry Node', parentId: null }, T.a);
    const t2 = await req('POST', '/api/tree/node', { name: 'Retry Node', parentId: null }, T.a);
    const named = Object.values(orgNodes[A]).filter(n => String(n.name).trim() === 'Retry Node');
    ok('OI-D1 pressing create twice produces ONE node, not two',
      t1.status === 200 && t2.status === 200 && named.length === 1);
    ok('OI-D2 …and the second call says it was already there rather than claiming a new one',
      t2.j.already === true && t2.j.node.nodeId === t1.j.node.nodeId);
    const blank = await req('POST', '/api/tree/node', { name: '   ', parentId: null }, T.a);
    ok('OI-D3 a name that is only spaces is refused, not stored empty',
      blank.status === 400 && !Object.values(orgNodes[A]).some(n => String(n.name) === ''));
    /* Creating UNDER a parent carries the tree's existing CAS precondition, so `ifRev` is
       required — the first version of this omitted it and got a 428 that had nothing to do with
       the duplicate rule under test. */
    const parentRev = (orgNodes[A][t1.j.node.nodeId] || {}).rev || 0;
    const sibling = await req('POST', '/api/tree/node',
      { name: 'Retry Node', parentId: t1.j.node.nodeId, ifRev: parentRev }, T.a);
    ok('OI-D4 …but the same name under a DIFFERENT parent is a different unit and is allowed',
      sibling.status === 200 && sibling.j.already !== true
      && sibling.j.node.nodeId !== t1.j.node.nodeId);

    /* ══ F — ONE PERMISSION GOVERNS ADDING PEOPLE ═══════════════════════════════════════════════
       Three doors lead into this capability and they used to disagree about who may open them.
       `bulk-import` asked for `edit_members`; Add Member and invite asked `_isLeader`, which is a
       DETECTOR — it returns true for anyone who merely SITS IN a node that has a sub-node beneath
       it, appointed or not. Measured before the fix, the two rules were not merely different but
       inverted: the person the organisation had actually authorised was refused at two doors out
       of three, and a person nobody had authorised was admitted at the other two.

       The header note on this file says who may mint an invite was left as a founder decision.
       It has since been made: `edit_members`, the canonical permission, at every door. */
    console.log('\n  F — ADDING PEOPLE ASKS FOR edit_members, AT EVERY DOOR');
    orgUsers[A].granted = { id: 'granted', name: 'Granted Person', email: 'granted@onba.test',
      role: 'member', orgCode: A, status: 'active', passwordSet: true, passwordHash: 'x' };
    /* Sits in a node that HAS a child node and is not named its leader: `_isLeader` says yes via
       hierarchy, and nobody granted them anything. This is the exact shape the founder ruled out. */
    orgUsers[A].sitter = { id: 'sitter', name: 'Node Sitter', email: 'sitter@onba.test',
      role: 'member', orgCode: A, status: 'active', assignedNodeIds: ['parent'], passwordSet: true, passwordHash: 'x' };
    orgNodes[A].parent = { nodeId: 'parent', name: 'Parent Unit', memberIds: ['sitter'], leaderIds: [], childNodeIds: ['kid'] };
    orgNodes[A].kid    = { nodeId: 'kid', name: 'Child Unit', parentId: 'parent', memberIds: [], leaderIds: [] };
    S.userPermissions[A] = { ...(S.userPermissions[A] || {}), granted: { edit_members: true } };
    _rebuildEmailIndex();
    const grantTok = issueToken('granted', A, 'member');
    const sitTok   = issueToken('sitter',  A, 'member');
    const addUser  = (body, t) => req('POST', '/api/auth/create-user', body, t);

    ok('OI-F1 someone holding edit_members may invite, though they lead nothing at all',
      !S._isLeader(A, 'granted') && (await invite({ role: 'member' }, grantTok)).status === 200);
    ok('OI-F2 …and may add a member directly, through the same permission',
      (await addUser({ firstName: 'By', lastName: 'Granted', email: 'bygranted@onba.test', role: 'member' }, grantTok)).status === 200);
    ok('OI-F3 a tree position alone does NOT confer it, however leaderish the tree looks',
      S._isLeader(A, 'sitter') === true
      && (await invite({ role: 'member' }, sitTok)).status === 403
      && (await addUser({ firstName: 'By', lastName: 'Sitter', email: 'bysitter@onba.test', role: 'member' }, sitTok)).status === 403);
    ok('OI-F4 …and nothing was created by those refusals',
      !Object.values(orgUsers[A]).some(u => u.email === 'bysitter@onba.test'));
    /* OI-F4b ISOLATES THE MIDDLEWARE. A mutation putting create-user back on bare `requireAuth`
       left every other assertion here green: the sitter is role 'member', so the inner role
       ceiling ("you cannot create someone at or above your level") refused them anyway, and the
       outer gate was doing no visible work. A COACH is the case that separates the two — level 3
       creating a level-4 member clears the ceiling, so only the permission can stop them, and a
       coach's role defaults do not include edit_members. */
    orgUsers[A].coachy = { id: 'coachy', name: 'Coach Person', email: 'coachy@onba.test',
      role: 'coach', orgCode: A, status: 'active', passwordSet: true, passwordHash: 'x' };
    _rebuildEmailIndex();
    const coachTok = issueToken('coachy', A, 'coach');
    ok('OI-F4b a coach clears the role ceiling and is STILL refused, because the permission is what decides',
      S._resolveRoleDefaults('coach').edit_members === false
      && (await addUser({ firstName: 'By', lastName: 'Coach', email: 'bycoach@onba.test', role: 'member' }, coachTok)).status === 403
      && (await invite({ role: 'member' }, coachTok)).status === 403
      && !Object.values(orgUsers[A]).some(u => u.email === 'bycoach@onba.test'));
    S.userPermissions[A] = { ...(S.userPermissions[A] || {}), coachy: { edit_members: true } };
    ok('OI-F4c …and admitted the moment the organisation grants it, without changing their role',
      (await addUser({ firstName: 'By', lastName: 'Coach', email: 'bycoach@onba.test', role: 'member' }, coachTok)).status === 200
      && orgUsers[A].coachy.role === 'coach');
    ok('OI-F5 nobody may invite into a role above their own',
      (await invite({ role: 'admin' }, grantTok)).status === 403
      && (await addUser({ firstName: 'Too', lastName: 'High', email: 'toohigh@onba.test', role: 'admin' }, grantTok)).status === 403);
    const crossReq = await invite({ orgCode: B, role: 'member', label: 'x@onbb.test' }, grantTok);
    ok('OI-F6 a cross-tenant invite is still impossible — the org is the session, not the body',
      crossReq.status === 200 && S.inviteTokens[crossReq.j.token].orgCode === A
      && !Object.values(S.inviteTokens).some(t => t && t.orgCode === B));
    ok('OI-F7 all three doors — invite, add member, CSV import — ask the SAME permission owner',
      (await req('POST', '/api/auth/bulk-import', { rows: [] }, grantTok)).status !== 403
      && (await req('POST', '/api/auth/bulk-import', { rows: [] }, sitTok)).status === 403);

    /* ══ G — AN IMPORT HAS A SIZE, AND SAYS SO ══════════════════════════════════════════════════
       The route accepted an array of any length and bcrypt-hashed a password for every row it
       kept. bcrypt is deliberately slow, on the one event loop this process has, so a large array
       is not a large import — it is an outage with accounts left behind it. */
    console.log('\n  G — AN IMPORT HAS A SIZE, AND SAYS SO');
    const imp = (rows, t) => req('POST', '/api/auth/bulk-import', { users: rows }, t || T.a);
    const rowsOf = (n, tag) => Array.from({ length: n }, (_, i) =>
      ({ name: `${tag} ${i}`, email: `${tag}${i}@onba.test`, role: 'member' }));
    const beforeOver = Object.keys(orgUsers[A]).length;
    const over = await imp(rowsOf(501, 'over'));
    ok('OI-G1 an import past the limit is refused whole, before a single account is minted',
      over.status === 413 && Object.keys(orgUsers[A]).length === beforeOver);
    ok('OI-G2 …and the refusal names the limit and what was sent, so the file can be split',
      over.j.limit === 500 && over.j.received === 501 && /500/.test(String(over.j.error)));
    const atLimit = await imp(rowsOf(500, 'atlim'));
    ok('OI-G3 …while exactly the limit is accepted — the boundary is not off by one',
      atLimit.status === 200 && atLimit.j.counts.created === 500);
    const long = await imp([{ name: 'x'.repeat(121), email: 'long@onba.test' },
      { name: 'Fine Person', email: 'fine@onba.test' },
      { name: 'Long Group', email: 'lg@onba.test', group: 'g'.repeat(121) }]);
    ok('OI-G4 an absurd field costs that ROW, not the whole file',
      long.j.counts.created === 1 && long.j.counts.failed === 2
      && long.j.failed.every(f => /longer than 120/.test(f.reason)));
    ok('OI-G5 …and the refusal does not echo the absurd value back',
      JSON.stringify(long.j).length < 4000);

    /* ══ H — AN IMPORTED GROUP IS THE SAME OBJECT AS A CREATED ONE ═══════════════════════════════
       The importer assigned straight into orgNodes with a bare generateId(): no rev, no parentId,
       no childNodeIds, and outside the serialisation and compare-and-set the tree route uses. */
    console.log('\n  H — AN IMPORTED GROUP GOES THROUGH THE ORG TREE OWNER');
    const g1 = await imp([{ name: 'Group One', email: 'g1@onba.test', group: 'Defenders' }]);
    const defenders = Object.values(orgNodes[A]).filter(n => String(n.name) === 'Defenders');
    /* The first draft of this asserted `rev === 0` and went red. The product was right: placing
       the imported person into the node is a membership write, and a membership write bumps the
       revision exactly as it does on PUT /api/tree/node. What matters is that the node HAS a
       numeric revision for compare-and-set to read — the old importer wrote none at all — and
       that it carries the id prefix and link fields every other node has. */
    ok('OI-H1 importing with a group column creates ONE node, shaped like every other node',
      g1.status === 200 && defenders.length === 1
      && typeof defenders[0].rev === 'number' && defenders[0].rev >= 1
      && Array.isArray(defenders[0].childNodeIds)
      && defenders[0].parentId === null && /^nd_/.test(defenders[0].nodeId)
      && typeof defenders[0].updatedAt === 'string');
    ok('OI-H2 …and the imported person is in it',
      defenders[0].memberIds.includes(g1.j.created[0].id));
    /* OI-H2b PINS THE COMMIT ITSELF, which nothing did. Removing `_commitTreeMutation` from the
       import left every assertion green, so "the import commits through the tree owner" was a
       claim with no test behind it. The commit is not only a save: it calls `_backfillUserNodeIds`,
       which rebuilds `user.assignedNodeIds` from node membership — and THAT is what scope reads.
       Without it an imported person sits in the node's memberIds while being, to every visibility
       computation in the product, in no unit at all. */
    ok('OI-H2b …and their SCOPE knows it, because the import went through the tree commit',
      (orgUsers[A][g1.j.created[0].id].assignedNodeIds || []).includes(defenders[0].nodeId));
    const g2 = await imp([{ name: 'Group Two', email: 'g2@onba.test', group: 'defenders' }]);
    ok('OI-H3 a second import naming the same group differently-cased reuses the node',
      g2.status === 200 && Object.values(orgNodes[A]).filter(n => /^defenders$/i.test(String(n.name))).length === 1);
    /* CONCURRENCY. Two imports naming a group that does not exist yet, in flight together. The
       route is serialised on the tree lock, so the second sees the first's node. */
    const [c1, c2] = await Promise.all([
      imp([{ name: 'Race One', email: 'r1@onba.test', group: 'Keepers' }]),
      imp([{ name: 'Race Two', email: 'r2@onba.test', group: 'Keepers' }]),
    ]);
    const keepers = Object.values(orgNodes[A]).filter(n => String(n.name) === 'Keepers');
    ok('OI-H4 two simultaneous imports naming one new group produce ONE node, not two',
      c1.status === 200 && c2.status === 200 && keepers.length === 1);
    ok('OI-H5 …with both people in it, so neither import silently lost its placement',
      keepers[0].memberIds.includes(c1.j.created[0].id)
      && keepers[0].memberIds.includes(c2.j.created[0].id));
    /* OI-H7 IS A WIRING CHECK AND IS LABELLED AS ONE. Removing `_serializeTreeMutation` from the
       import route leaves OI-H4 and OI-H5 green, tested by mutation — the duplicate check inside
       the canonical owner is what holds those, not the queue. What the queue protects is the
       compare-and-set in `_commitTreeMutation`: two imports that both snapshot before either
       commits make the second conflict. That needs a live store to observe, which this harness
       does not have, so this asserts only that the route carries the same middleware the tree
       route carries. It is not proof the queue works, and the report says so. */
    ok('OI-H7 the import route carries the tree serializer, as the tree route does (WIRING, not behaviour)',
      (() => {
        const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
        const line = (src.match(/app\.post\('\/api\/auth\/bulk-import'[^\n]*/) || [''])[0];
        return /_serializeTreeMutation/.test(line) && /requirePermission\('edit_members'\)/.test(line);
      })());
    const again = await imp([{ name: 'Race One', email: 'r1@onba.test', group: 'Keepers' }]);
    ok('OI-H6 re-importing the same file skips the person and does not touch the tree',
      again.j.counts.created === 0 && again.j.counts.skipped === 1
      && Object.values(orgNodes[A]).filter(n => String(n.name) === 'Keepers').length === 1);

    /* ══ I — A PARTIAL IMPORT IS NEVER REPORTED AS A WHOLE ONE ═══════════════════════════════════ */
    console.log('\n  I — A PARTIAL IMPORT IS NEVER REPORTED AS A WHOLE ONE');
    const mixed = await imp([{ name: 'Good One', email: 'good1@onba.test' },
      { name: 'No Email', email: '' }, { name: '', email: 'noname@onba.test' },
      { name: 'Bad Address', email: 'not-an-email' }]);
    ok('OI-I1 ok is false when any row failed — the client cannot render a blanket success',
      mixed.status === 200 && mixed.j.ok === false);
    ok('OI-I2 …and every failed row is named with the reason it failed',
      mixed.j.counts.created === 1 && mixed.j.counts.failed === 3
      && mixed.j.failed.some(f => /Missing email/.test(f.reason))
      && mixed.j.failed.some(f => /Missing name/.test(f.reason))
      && mixed.j.failed.some(f => /Invalid email/.test(f.reason)));
    ok('OI-I3 …while an import where everything worked still reports ok',
      (await imp([{ name: 'All Fine', email: 'allfine@onba.test' }])).j.ok === true);

    console.log('\n  E — AUTHORITY IS UNCHANGED');
    const memberTok = issueToken('live', A, 'member');
    ok('OI-E1 a plain member still cannot mint an invite',
      (await invite({ role: 'member' }, memberTok)).status === 403);
    ok('OI-E2 …nor create a node', (await req('POST', '/api/tree/node', { name: 'Nope' }, memberTok)).status === 403);
    ok('OI-E3 an invite still lands in the SESSION organisation, whatever the body claims',
      (await invite({ orgCode: B, role: 'member', label: 'scoped@onba.test' }, T.a)).status === 200
      && (await join({ token: (await invite({ orgCode: B, role: 'member' }, T.a)).j.token,
        name: 'Scoped Join', email: 'scoped2@onba.test', password: 'demo1234' })).j.user.orgCode === A);
  } catch (e) { fail++; console.error('  FAIL onboard suite threw:', e && e.stack); }

  server.close();
  console.log(`\nonboard-invite-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
