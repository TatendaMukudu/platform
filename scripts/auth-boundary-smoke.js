/* Truth layer — THE PUBLIC ROUTES OBEY THE ARCHITECTURE THE KERNEL ALREADY ENFORCES.

   Seven routes were reachable without a session, and several of them took the caller's word for
   who the caller was. Every one is exercised here over real HTTP, because a scanner that finds
   the word `requireAuth` proves the word is present and nothing else.

   The worst of them was /api/member/join, which minted a VALID SESSION TOKEN carrying the target
   user's own role in exchange for an organisation code and a user id:

       if (userId && orgUsers[code]?.[userId]) token = issueToken(userId, code, user.role);

   No password, no invitation, no expiring proof. Both inputs are public-shaped — an org code is
   in the link a coach shares, and user ids travel in every roster response — so possession of two
   identifiers was possession of the account. It is retired rather than patched: its entire
   purpose was the thing that was wrong with it, and obscuring the ids would have been hiding the
   hole rather than closing it.

   The rest were IDOR of the same shape the codebase had already fixed once, on
   /api/groups/:groupId/feed, and then missed here: a body field called requesterId, trusted.

   WHAT THIS SUITE IS FOR. Not "does the route 401" — that is one line of it. It is: can a real
   session in org A reach org B, act as another user, or spend somebody else's model budget.

   Run: node scripts/auth-boundary-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, orgNotes, orgMessages, orgStore } = S;

/* HERMETIC BY CONSTRUCTION. Deterministic-only is on for the whole suite, so no assertion here
   can reach a provider even if a route is wide open. That is not a convenience: a mutation that
   removes requireAuth from a model route otherwise leaves the anonymous request retrying against
   the network with backoff, and the suite HANGS rather than failing — which reads as "still
   running" instead of the red it is. A security test must fail fast under exactly the conditions
   it exists to detect. */
const ai = require('../ai/gateway.js');
ai.setDeterministicOnly(true);

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const A = 'orga', B = 'orgb';
_loadAllStores({
  orgMeta: { [A]: { orgName: 'Club A', orgMode: 'sports' }, [B]: { orgName: 'Club B', orgMode: 'sports' } },
  orgUsers: {
    [A]: {
      ua: { id: 'ua', name: 'A Member', email: 'a@x.io', role: 'member', orgCode: A, status: 'active' },
      ca: { id: 'ca', name: 'A Coach',  email: 'ca@x.io', role: 'coach',  orgCode: A, status: 'active' },
      // A SECOND MEMBER OF THE SAME ORG, and the fixture depends on it. Forging from org B is
      // refused by the tenancy check before the identity check is ever reached, so a mutation
      // that re-trusted a body `requesterId` passed the cross-org case untouched. The forger has
      // to be a teammate for the ownership rule to be the only thing standing.
      ua2: { id: 'ua2', name: 'A Teammate', email: 'a2@x.io', role: 'member', orgCode: A, status: 'active' },
    },
    [B]: {
      ub: { id: 'ub', name: 'B Member', email: 'b@x.io', role: 'member', orgCode: B, status: 'active' },
    },
  },
  orgStore: { [A]: { orgName: 'Club A', orgMode: 'sports' }, [B]: { orgName: 'Club B', orgMode: 'sports' } },
});
_rebuildEmailIndex();

orgNotes['note_a'] = { noteId: 'note_a', orgCode: A, authorId: 'ua', text: 'mine', type: 'private' };
orgMessages['msg_a'] = { msgId: 'msg_a', orgCode: A, fromId: 'ca', toId: 'ua', text: 'hello', readBy: [] };

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = t => (t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }
                    : { 'Content-Type': 'application/json' });
  const call = (u, t, method = 'POST', body) => fetch(base + u, {
    method, headers: H(t), ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  const tokA  = issueToken('ua', A, 'member');
  const tokCA = issueToken('ca', A, 'coach');
  const tokB  = issueToken('ub', B, 'member');

  try {
    /* ── AB1: THE TOKEN MINT. The one that mattered most. ── */
    const minted = await call('/api/member/join', null, 'POST', { orgCode: A, memberName: 'A Member', userId: 'ua' });
    ok('AB1 A VALID ORG CODE AND A VALID USER ID CANNOT MINT A SESSION — the route that did is gone, not hidden',
      minted.status === 404 && !(minted.j && minted.j.token));

    /* ── AB2-AB8: every previously-open route now needs a session. Asserted as 401 rather than
       "not 200", so a route that starts answering 500 to everything cannot pass this. ── */
    /* The bodies here are deliberately EMPTY. requireAuth runs before any handler logic, so a
       secured route answers 401 without reading them — while an UNSECURED one falls through to
       its own field validation and answers 400 immediately. Both are fast and neither touches a
       model. Sending a valid body instead meant that a mutation removing requireAuth ran the
       whole handler, and the suite hung in provider retries rather than reporting the failure. */
    const openRoutes = [
      ['/api/chat', 'POST', {}],
      ['/api/coach-debrief', 'POST', {}],
      ['/api/org/describe', 'POST', {}],
      ['/api/platform/register-org', 'POST', { orgName: 'Renamed', orgMode: 'sports' }],
      ['/api/messages/msg_a/read', 'POST', { requesterId: 'ua' }],
    ];
    for (const [u, m, b] of openRoutes) {
      const r = await call(u, null, m, b);
      ok(`AB2 ${u} refuses an anonymous caller with 401`, r.status === 401);
    }
    const delAnon = await fetch(`${base}/api/notes/note_a`, { method: 'DELETE', headers: H(null), body: JSON.stringify({ requesterId: 'ua' }) });
    ok('AB2 /api/notes/:noteId refuses an anonymous caller with 401', delAnon.status === 401);

    /* ── AB3: FORGERY. A session exists, but the body lies about who is acting. ── */
    const tokA2 = issueToken('ua2', A, 'member');
    const forged = await fetch(`${base}/api/notes/note_a`, {
      method: 'DELETE', headers: H(tokA2), body: JSON.stringify({ requesterId: 'ua' }) });
    ok('AB3 a TEAMMATE forging requesterId cannot delete somebody else\'s note — same org, so tenancy is satisfied and ownership is the only thing standing',
      forged.status === 403 && !!orgNotes['note_a']);
    const forgedCrossOrg = await fetch(`${base}/api/notes/note_a`, {
      method: 'DELETE', headers: H(tokB), body: JSON.stringify({ requesterId: 'ua' }) });
    ok('AB3a …and somebody in another organisation cannot even see that the note exists',
      forgedCrossOrg.status === 404 && !!orgNotes['note_a']);

    const forgedRead = await call('/api/messages/msg_a/read', tokB, 'POST', { requesterId: 'ua' });
    ok('AB3b …and cannot write a read receipt for somebody else, in another organisation',
      forgedRead.status === 404 && (orgMessages['msg_a'].readBy || []).length === 0);
    // Same masking as AB3: the cross-org attempt is stopped by tenancy before the recipient rule
    // is reached, so deleting that rule changed nothing observable. The teammate case is where it
    // is the only thing standing.
    const nosyTeammate = await call('/api/messages/msg_a/read', issueToken('ua2', A, 'member'), 'POST', {});
    ok('AB3c a TEAMMATE who was not the recipient cannot mark the message read — a read receipt nobody checked is a claim about a person that is worth nothing',
      nosyTeammate.status === 403 && !(orgMessages['msg_a'].readBy || []).includes('ua2'));

    /* ── AB4: CROSS-ORG. A real session in A must not reach B by naming it. ── */
    const rename = await call('/api/platform/register-org', tokA, 'POST', { orgCode: B, orgName: 'HACKED', orgMode: 'x' });
    ok('AB4 a member of org A cannot rename org B by naming it in the body — the organisation comes from the session and the body\'s orgCode is ignored',
      rename.status === 200 && orgStore[B].orgName === 'Club B');
    ok('AB4b …and their own org is what actually changed, so the route still works',
      orgStore[A].orgName === 'HACKED');
    orgStore[A].orgName = 'Club A';

    /* ── AB5: the legitimate owner still works. A security fix that breaks the feature is a
       different kind of failure, not a success. ── */
    const readMine = await call('/api/messages/msg_a/read', tokA, 'POST', {});
    ok('AB5 the person the message was actually for CAN mark it read',
      readMine.status === 200 && orgMessages['msg_a'].readBy.includes('ua'));
    const delMine = await fetch(`${base}/api/notes/note_a`, { method: 'DELETE', headers: H(tokA) });
    ok('AB5b …and the note\'s real author can still delete their own note',
      delMine.status === 200 && !orgNotes['note_a']);

    /* ── AB6: SCOPE. Authenticated is not the same as authorised. ── */
    const memberDebrief = await call('/api/coach-debrief', tokA, 'POST',
      { conversation: [{ role: 'user', content: 'x' }], scores: { overall: 50 } });   // real body: scope, not validation
    ok('AB6 a plain member cannot generate a leader-facing debrief about somebody — a session is not a permission',
      memberDebrief.status === 403);

    /* ── AB7: NO EGRESS ON AN AUTHENTICATED ROUTE EITHER. The routes are secured; that must not
       be mistaken for the model calls behind them being governed. ── */
    const chatDet = await call('/api/chat', tokA, 'POST', { messages: [{ role: 'user', content: 'hi' }] });
    ok('AB7 with a session, a permission and deterministic-only mode on, the model route still sends nothing outside',
      chatDet.status !== 200 || !(chatDet.j && chatDet.j.text));

    /* ── AB8: identity is not selectable on the secured route. ── */
    // The first version of AB8 asserted `status !== 200 || true`, which is true for every
    // possible response — a tautology dressed as a security test. What can actually be observed
    // from outside is that naming another org does not make the route behave like that org's;
    // what can be proved exactly is the handler's shape, which AB8b does.
    const srcServer = require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
    const chatHead = srcServer.slice(srcServer.indexOf("app.post('/api/chat'"), srcServer.indexOf("app.post('/api/chat'") + 1400);
    ok('AB8 the chat handler takes its organisation and its user from the SESSION, by name, so there is no path for a body field to become identity',
      /const code\s*=\s*String\(req\.iqSession\.orgCode/.test(chatHead) &&
      /const userId\s*=\s*req\.iqSession\.userId/.test(chatHead));
    const chatBody = srcServer.slice(srcServer.indexOf("app.post('/api/chat'"), srcServer.indexOf("/* ─── SCENARIO DRAFT ENDPOINT"));
    ok('AB8b …and that is structural: the handler destructures no orgCode, userId or memberName from the body at all',
      !/const\s*\{[^}]*\borgCode\b[^}]*\}\s*=\s*req\.body/.test(chatBody) &&
      !/\buserId\b\s*,?[^;]*\}\s*=\s*req\.body/.test(chatBody));

    /* ── AB9: THE CALLERS. A route that now needs a header is broken until its callers send
       one, and a security fix that silently breaks the product is not shipped. ── */
    const front = ['js/app.js', 'js/chat.js', 'js/scenarios.js']
      .map(f => require('fs').readFileSync(require('path').join(__dirname, '..', f), 'utf8')).join('\n');
    const chatCalls = (front.match(/fetch\('\/api\/chat'[\s\S]{0,120}?headers:\s*([^,\n]+)/g) || []);
    ok(`AB9 every /api/chat caller sends authentication (${chatCalls.length} found)`,
      chatCalls.length === 3 && chatCalls.every(c => /Auth\._headers\(\)/.test(c)));
    ok('AB9b …and so do the debrief and register-org callers',
      /fetch\('\/api\/coach-debrief',\s*\{\s*\n?\s*method:\s*'POST',\s*\n?\s*headers:\s*Auth\._headers\(\)/.test(front) &&
      /register-org'[\s\S]{0,80}headers: Auth\._headers\(\)/.test(front));

  } catch (e) { fail++; console.error('  FAIL suite threw:', e && e.stack); }

  server.close();
  console.log(`\nauth-boundary-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
