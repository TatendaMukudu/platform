/* Truth layer — ASK INTELLIQ IN A FORUM THAT IS NOT A GROUP.

   LIVE iPHONE BLOCKER (findings R1 #19). On a Focus Forum, tapping "Ask IntelliQ about this"
   returned:

     Unknown API endpoint: POST /group//forum/foc_rkvv6fnb/ask

   Two defects in one tap. `forumAsk()` built its own path with the group route hard-coded, so a
   room with no node produced an empty segment — even though `_forumURL` next to it has known how
   to address both room kinds since focus rooms existed. And there was no ask route for a
   focus-backed room at all, so even a well-formed path had nothing to answer it.

   THE SAME THREE PROPERTIES AS THE GROUP ROOM, because the founder ruling is about rooms and not
   about nodes: the room's own gate decides who may ask; the answer is bounded to what the room can
   already see, so two members receive the same one; and nothing is posted.

   AND THE SECOND HALF OF THE BOUNDING MATTERS MORE HERE. A Focus lives in the asker's own
   authorised set, so the obvious implementation — hand it to the deterministic object reader — is
   the wrong one: that reader also reports what ELSE this person has tried on the same question,
   which is theirs and differs between two people in one room. The answer is composed from the
   Focus's own record and nothing else.

   Run: node scripts/forum-ask-focus-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const fs = require('fs');
const path = require('path');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'faf', NOW = Date.now(), DAY = 86400000;

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma', orgMode: 'sports' } },
  orgUsers: { [C]: {
    p1: { id: 'p1', name: 'Player One', email: 'p1@f.io', role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['n'], profileComplete: true },
    p2: { id: 'p2', name: 'Player Two', email: 'p2@f.io', role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['n'], profileComplete: true },
    p3: { id: 'p3', name: 'Player Three', email: 'p3@f.io', role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['n'], profileComplete: true },
    /* IN THE ORGANISATION, NOT IN THIS ROOM. The room must refuse them exactly as it refuses
       them a read. */
    out: { id: 'out', name: 'Outsider', email: 'o@f.io', role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['n'], profileComplete: true },
  } },
  orgNodes: { [C]: { n: { nodeId: 'n', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: ['p1', 'p2', 'p3', 'out'], leaderIds: [] } } },
  /* A FOCUS THE FOUNDER'S OWN REHEARSAL PRODUCED: created straight from a conversation, shared
     with chosen people, no originating Inquiry. That is the shape the live defect appeared on. */
  userAiProfiles: { [`${C}:p1`]: { focuses: [{
    id: 'foc_live', text: 'Focus more on wins and conceding less', status: 'active',
    visibility: 'selected', participants: ['p1', 'p2', 'p3'],
    createdAt: new Date(NOW - 3 * DAY).toISOString(),
    target: 'fewer goals conceded in the last twenty minutes',
  }] } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = w => ({ Authorization: `Bearer ${issueToken(w, C, 'member')}`,
    'Content-Type': 'application/json' });
  const call = (m, u, b, w) => fetch(base + u, { method: m, headers: H(w),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const room = (w) => call('GET', '/api/forum/focus/foc_live', undefined, w);
  const ask  = (w) => call('POST', '/api/forum/focus/foc_live/ask', {}, w);

  try {
    console.log('\n  A — THE ROOM ITSELF WORKS, WHICH IS WHY THE ASK WAS WORTH TAPPING');
    const before = await room('p1');
    ok('FAF-A1 a Focus shared with chosen people has a room its members can open',
      before.status === 200 && (before.j || {}).people === 3);
    const said = await call('POST', '/api/forum/focus/foc_live',
      { text: 'We tried an extra defender and still conceded.' }, 'p2');
    ok('FAF-A2 …and speaking in it works', said.status === 200);

    console.log('\n  B — AND ASK INTELLIQ REACHES A ROUTE THAT EXISTS');
    /* THE LIVE FAILURE. There was no ask route for a room without a node, so the tap produced
       "Unknown API endpoint" and the founder saw the raw route on screen. */
    const a1 = await ask('p1');
    ok('FAF-B1 asking in a Focus room is answered rather than 404ing on a missing route',
      a1.status === 200 && !!(a1.j || {}).answer);
    ok('FAF-B2 …about this Focus, in its own words',
      /wins and conceding less/i.test(String((a1.j || {}).answer)));
    ok('FAF-B3 …and it says what it is reading from, rather than implying a fresh look',
      /answers/.test(JSON.stringify(a1.j || {}))
      && (a1.j || {}).answers === 'current_object_read');

    console.log('\n  C — SOMEBODY OUTSIDE THE ROOM IS REFUSED, EXACTLY AS THE ROOM REFUSES THEM');
    /* AND NOT A CLAIM ABOUT WHICH GATE DID IT. This route is fail-closed twice — `_forumRoom`
       refuses a non-member, and the object lookup refuses anybody the Focus is not shared with —
       and for a Focus room those are the SAME SET by construction, because room membership IS the
       participant list. Removing either one alone leaves this green, which is not a weak test but
       a true fact about the shape: there is no fixture that can pull them apart. So the assertion
       says what it can prove, which is the outcome, and the two owners are named here rather than
       one of them being claimed as load-bearing on evidence that does not exist. */
    ok('FAF-C1 somebody the room refuses a read also cannot ask about it',
      [403, 404].includes((await ask('out')).status));
    ok('FAF-C2 …which is the same answer the room gives them',
      [403, 404].includes((await room('out')).status));

    console.log('\n  D — BOUNDED TO THE ROOM, NOT TO THE ASKER');
    const a2 = await ask('p2');
    const a3 = await ask('p3');
    /* THE PROPERTY THE FOUNDER RULING TURNS ON, and the one a Focus makes easy to break: a Focus
       sits in each member's own authorised set, so an answer built from that set would differ
       between two people in one room — and the difference is exactly what would leak if either
       answer ever reached the room. */
    ok('FAF-D1 two members of the room receive the same answer',
      String((a2.j || {}).answer) === String((a3.j || {}).answer));
    ok('FAF-D2 …and it says the scope is what the room can already see',
      ((a2.j || {}).limitations || []).some(l => /what the room can already see/i.test(String(l))));

    console.log('\n  E — AND IT DOES NOT SPEAK IN THE ROOM');
    const after = await room('p1');
    ok('FAF-E1 asking posts no message',
      ((after.j || {}).messages || []).length === ((before.j || {}).messages || []).length + 1);
    ok('FAF-E2 …that one message being the one somebody deliberately said, not the answer',
      !JSON.stringify((after.j || {}).messages || [])
        .includes(String((a1.j || {}).answer).slice(0, 40)));
    ok('FAF-E3 …and the reply says plainly that it was not posted',
      (a1.j || {}).posted === false && /only you can see this/i.test(String((a1.j || {}).note)));

    console.log('\n  F — AND THE CLIENT ADDRESSES THE ROOM IT OPENED');
    /* THE OTHER HALF OF THE LIVE DEFECT. `forumAsk` built its own path with the group route
       hard-coded, so a room with no node produced `/api/group//forum/...`. `_forumURL` beside it
       has always known how to address both kinds; the ask now goes through it. */
    const ui = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    const askFn = ui.slice(ui.indexOf('async forumAsk('), ui.indexOf('async forumAsk(') + 1800);
    ok('FAF-F1 the ask builds its route from the same owner that opened the room',
      /_forumURL\(/.test(askFn));
    ok('FAF-F2 …and never hard-codes the group path, which is what produced the empty segment',
      !/\/api\/group\/\$\{/.test(askFn));

  } catch (e) { fail++; console.error('  FAIL forum-ask-focus suite threw:', e && e.stack); }

  server.close();
  console.log(`\nforum-ask-focus-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
