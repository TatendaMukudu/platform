/* Truth layer — ONBOARDING: ADD MEMBER, INVITES, AND THE ORG TREE.

   Every assertion here pins a defect an independent audit (Codex, `codex/onboard-pilot-audit-r1`)
   reported and this branch reproduced before changing anything. The two that were left alone are
   left alone deliberately and are NOT asserted either way:

     - who may mint an invite (any admin, or only somebody who leads a node) is a founder decision;
     - whether email is ever sent is a product decision, and nothing here sends it.

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
