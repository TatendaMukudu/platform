/* Truth layer — ASK INTELLIQ INSIDE A FORUM, WITHOUT SPEAKING IN IT.

   FOUNDER RULING, September 2026, after this seam was escalated rather than built:

     Answer the asker privately using only the Forum/object-governed projection; never
     automatically publish that answer to the room. Sharing into the Forum must remain deliberate
     through the existing governed share path.

   WHY IT WAS ESCALATED. Priority R&D P2 asks that any governed Forum expose Ask IntelliQ. That is
   not a UI task. Every other assistant answer is built from `_allObjectsFor(code, userId)` — the
   individual reader's whole authorised set, which is WIDER than the room and differs between two
   people in it. Answering from that set and letting the answer reach the room would widen
   readership by exactly the gap between them, which is the one thing P2 forbids. The ruling
   removes the problem rather than solving it: the scope is the OBJECT and the answer never
   reaches the room on its own.

   SO THE THREE PROPERTIES THIS FILE EXISTS FOR ARE PRIVACY PROPERTIES, not answer quality:

     the room's live gate decides who may ask (section A);
     the answer is bounded to the object's projection, so two members are answered from the same
       material and neither receives anything the other could not read (section B);
     nothing is posted — no message, no author, no timestamp — and the room is byte-for-byte
       unchanged by asking (section C).

   AND IT IS DETERMINISTIC. This pass established that a rule living only in a model prompt is not
   implemented; the suite runs with models off, which is the pilot's state, and the answer is
   composed by the route itself.

   Run: node scripts/forum-ask-http-smoke.js */

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

const C = 'fak', NOW = Date.now(), DAY = 86400000;
const SQUAD = ['p1', 'p2', 'p3', 'p4', 'p5'];
const SIG = (w, n) => ({ kind: 'observation', status: 'active', source: w, originRef: `o_${w}_${n}`,
  at: NOW - 9 * DAY, turnId: `t_${w}_${n}`, directness: 'direct', authority: 'corroborated',
  specificity: 0.7, ref: `ev_${w}_${n}`, contributedBy: w, text: 'we fade late' });

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma', orgMode: 'sports' } },
  orgUsers: { [C]: Object.fromEntries([
    ...SQUAD.map((id, i) => [id, { id, name: `Player ${i + 1}`, email: `${id}@f.io`, role: 'member',
      orgCode: C, status: 'active', assignedNodeIds: ['n'], profileComplete: true }]),
    ['coach', { id: 'coach', name: 'Coach', email: 'c@f.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['n'], assignedNodeIds: ['n'], profileComplete: true }],
    /* Somebody in the organisation who is NOT in this node. The room must refuse them. */
    ['out', { id: 'out', name: 'Outsider', email: 'o@f.io', role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['other'], profileComplete: true }],
  ]) },
  orgNodes: { [C]: {
    n: { nodeId: 'n', name: 'First Team', parentId: null, childNodeIds: [],
      memberIds: [...SQUAD, 'coach'], leaderIds: ['coach'] },
    other: { nodeId: 'other', name: 'Reserves', parentId: null, childNodeIds: [],
      memberIds: ['out'], leaderIds: [] },
  } },
  inquiryStates: { [C]: { 'group:n': { m: {
    inquiryId: 'q1', subjectRef: 'group:n',
    topic: { canonicalConcept: 'f.late', label: 'How the last twenty go' }, status: 'exploring',
    hypotheses: [{ id: 'h1', statement: 'legs go late', supportRefs: SQUAD.map((w, i) => `ev_${w}_${i}`),
      challengeRefs: [], confidence: { score: 0.7, band: 'probable' }, status: 'open', createdAt: NOW }],
    leadingHypothesisId: 'h1', signals: SQUAD.map((w, i) => SIG(w, i)),
    confidence: { score: 0.7, band: 'probable', because: ['5 independent origins'] },
    missingSignals: [], falsifiers: [], timeline: [], lastUpdatedAt: NOW } } } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = w => ({ Authorization: `Bearer ${issueToken(w, C, w === 'coach' ? 'coach' : 'member')}`,
    'Content-Type': 'application/json' });
  const call = (m, u, b, w = 'coach') => fetch(base + u, { method: m, headers: H(w),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const ask = (w, text) => call('POST', '/api/group/n/forum/q1/ask', { text }, w);
  const room = (w = 'coach') => call('GET', '/api/group/n/forum/q1', undefined, w);

  try {
    console.log('\n  A — THE ROOM\'S OWN GATE DECIDES WHO MAY ASK');
    await call('POST', '/api/group/n/forum/q1', { text: 'Anyone else seeing this late on?' }, 'p1');
    const before = await room();
    ok('FA-A1 the room exists and has speech in it',
      before.status === 200 && ((before.j || {}).messages || []).length === 1);
    const asked = await ask('p2', 'What do we actually know about this?');
    ok('FA-A2 a member of the room can ask IntelliQ about it', asked.status === 200 && !!(asked.j || {}).answer);
    /* Somebody who cannot read the room cannot ask IntelliQ about it either — the same live gate,
       not a second opinion about membership. */
    ok('FA-A3 somebody outside the node is refused, exactly as the room refuses them',
      (await ask('out', 'What do we know?')).status === 403
      && (await room('out')).status === 403);

    console.log('\n  B — BOUNDED TO WHAT THE ROOM CAN ALREADY SEE');
    const a2 = await ask('p2', 'What do we know?');
    const a3 = await ask('p3', 'What do we know?');
    ok('FA-B1 the answer is about this object', /last twenty/i.test(String((a2.j || {}).answer)));
    ok('FA-B2 …and rests on what the projection records rather than a fresh reading',
      /separate accounts/i.test(String((a2.j || {}).answer)));
    /* THE PROPERTY THE RULING TURNS ON. Two members of one room are answered from the SAME
       material, because the material belongs to the object rather than to the asker. If this were
       built from each reader's own authorised set the two would diverge, and the difference is
       precisely what would leak if either answer reached the room. */
    ok('FA-B3 two different members of the room receive the same answer, because the scope is the object',
      String((a2.j || {}).answer) === String((a3.j || {}).answer));
    ok('FA-B4 …and it says so, rather than implying a wider read of anybody',
      ((a2.j || {}).limitations || []).some(l => /what the room can already see/i.test(String(l))));

    console.log('\n  C — AND IT DOES NOT SPEAK IN THE ROOM');
    const after = await room();
    ok('FA-C1 asking posts no message', ((after.j || {}).messages || []).length === 1);
    ok('FA-C2 …the room is unchanged by it',
      JSON.stringify((after.j || {}).messages) === JSON.stringify((before.j || {}).messages));
    ok('FA-C3 …the reply says plainly that it was not posted',
      (a2.j || {}).posted === false && /only you can see this/i.test(String((a2.j || {}).note)));
    /* AND NOBODY ELSE RECEIVES IT. The answer went to the asker; another member opening the room
       a moment later finds exactly the speech that was there. */
    ok('FA-C4 …and another member opening the room sees none of it',
      !JSON.stringify(((await room('p4')).j || {}).messages || [])
        .includes(String((a2.j || {}).answer).slice(0, 40)));

    console.log('\n  D — SHARING STAYS DELIBERATE');
    /* The ruling's second half: the existing governed path is still the only way in, and this
       route did not become a shortcut around its audience preview and confirmation. */
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const route = src.slice(src.indexOf("app.post('/api/group/:nodeId/forum/:inquiryId/ask'"),
      src.indexOf("/* POST /api/group/:nodeId/forum/:inquiryId — say something"));
    ok('FA-D1 the ask route exists and is bounded to one projection', route.length > 400);
    ok('FA-D2 …and never writes a message, an author or a thread',
      !/\.messages\.push|forum\.say|addMessage|thread\.messages/.test(route));
    ok('FA-D3 …and never persists anything at all',
      !/scheduleSave\(\)/.test(route));
    /* AND THE DELIBERATE PATH STILL WORKS, so this did not close a door while opening one. */
    const posted = await call('POST', '/api/group/n/forum/q1', { text: 'Putting this to the group deliberately.' }, 'p2');
    ok('FA-D4 …while saying something to the room deliberately still does reach it',
      posted.status === 200 && ((( await room()).j || {}).messages || []).length === 2);

    console.log('\n  E — AND IT REACHES A SCREEN, AS A BUTTON RATHER THAN A SECOND BOX');
    const ui = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    /* Scoped to the room's own markup on purpose. A bare search of the file would also match the
       handler's own definition, so deleting the control a person actually taps would leave this
       green — an assertion no deletion could contradict is not proof that anything is on screen. */
    const forumView = ui.slice(ui.indexOf('async openForum('), ui.indexOf('async forumAsk('));
    ok('FA-E1 the Forum offers Ask IntelliQ, as a control in the room itself',
      /<button[^>]*onclick="MemberApp\.forumAsk\(\)"/.test(forumView) && /iqf-ask/.test(forumView));
    /* THE ROUTE COMES FROM THE OWNER, NOT FROM A SPELLING. This pinned the literal hard-coded
       path `/api/group/${…}/forum/${…}/ask` — which is precisely the construction that produced
       the live iPhone failure, because a Focus room has no node and the group segment came out
       empty. An assertion that pins the defect cannot catch the defect. What matters is that the
       ask addresses the same room the reader opened, and `_forumURL` is the one thing that knows
       how to do that for both kinds. */
    const askFn = ui.slice(ui.indexOf('async forumAsk('), ui.indexOf('async forumAsk(') + 1800);
    ok('FA-E2 …calling the same room the reader opened, through the one owner of that address',
      /_forumURL\(/.test(askFn) && /\/ask/.test(askFn) && !/\/api\/group\/\$\{/.test(askFn));
    /* THE ONE-COMPOSER LAW. The Forum view's own comment records why there is a single text box:
       two would be the costliest ambiguity in the product, because the difference between them is
       who reads what you type. A second box labelled "ask IntelliQ" would put a private question
       one careless tap from the room. */
    ok('FA-E3 …and adds no second text box to the room, which is the ambiguity that matters',
      (forumView.match(/_composerHTML\(/g) || []).length === 1);
    /* AND THE PRIVATE ANSWER MUST NOT LOOK LIKE ROOM SPEECH. A reply styled as a message is the
       exact confusion this whole route exists to avoid. */
    ok('FA-E4 …rendering the answer outside the message list, under its own private heading',
      /iqf-answer-h/.test(ui) && /Only you can see this/.test(ui)
      && !/iq-msg[^"]*">\$\{esc\(d\.answer\)/.test(ui));
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');
    ok('FA-E5 …and the panel is visually distinct from a message bubble',
      /\.iqf-answer-w\{[^}]*border:1px dashed/.test(css));
    ok('FA-E6 …with a tap target big enough to hit on a phone',
      /\.iqf-ask\{[^}]*min-height:4[0-9]px/.test(css));

  } catch (e) { fail++; console.error('  FAIL forum-ask suite threw:', e && e.stack); }

  server.close();
  console.log(`\nforum-ask-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
