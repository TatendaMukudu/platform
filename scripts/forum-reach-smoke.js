/* Truth layer — ANY THREAD WITH TWO OR MORE PEOPLE CAN HAVE A DISCUSSION.

   Founder: "Let's fix the forum issue! We need that! Any thread with 2+ people can have a
   discussion and that valuable information we would be missing out on."

   A forum existed only where the room was a NODE. A focus with people invited into it satisfied
   the founder's rule and had no route behind it — and the thread endpoint had been saying so out
   loud (`sharedByRule` true, `forumAvailable` false) rather than offering a button that 404s.
   That honesty was the right holding position and a bad end state. This is the route.

   TWO MEMBERSHIP RULES, WHICH IS WHY THERE ARE TWO HELPERS AND NOT ONE CLEVER ONE:

     A NODE ROOM   — whoever is on the roster right now. Take somebody off the squad and they
                     are out of the room, because the room IS the squad.
     A FOCUS ROOM  — the people named on it. An invitation does not expire because a roster
                     moved, and it was never the roster that put them there.

   Collapsing those would make one of them silently wrong the first time a roster changed, so
   the suite pins them apart on purpose.

   AND THE BOUNDARY IS UNCHANGED. Forum creates SPEECH before it creates evidence. Ten people
   agreeing in a focus room moves no confidence anywhere, and that is structural rather than a
   rule anybody has to remember: the post path touches forumThreads and nothing else.

   Run: node scripts/forum-reach-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const teamState = require('../ai/team-state.js');
const diagnose  = require('../ai/diagnose.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, _teamFocuses, orgNodes, inquiryStates } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'frm';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'A Club', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coach: { id: 'coach', name: 'Head Coach', email: 'c@x.io',  role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['n1'] },
    p1:    { id: 'p1',    name: 'Player One', email: 'p1@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'] },
    p2:    { id: 'p2',    name: 'Player Two', email: 'p2@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'] },
    p3:    { id: 'p3',    name: 'Player Three', email: 'p3@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'] },
    out:   { id: 'out',   name: 'Other Squad', email: 'o@x.io',  role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n2'] },
  } },
  orgNodes: { [C]: {
    n1: { nodeId: 'n1', name: 'First Team', parentId: null, childNodeIds: [], memberIds: ['p1', 'p2', 'p3'], leaderIds: ['coach'] },
    n2: { nodeId: 'n2', name: 'Reserves',   parentId: null, childNodeIds: [], memberIds: ['out'],            leaderIds: [] },
  } },
});
_rebuildEmailIndex();

/* REAL BELIEFS, because FM3 is the assertion this whole suite exists to protect and the first
   version of it compared an empty object with an empty object. `inquiryStates[C] = {}` meant a
   mutation that rewrote every confidence band on every post sailed through it untouched. A
   boundary test needs something on the other side of the boundary to not be moved. */
const mk = (owner, id, concept, label) => {
  let i = diagnose.newInquiry({ id, subjectRef: `member:${owner}`, concept, label, domain: 'sports' });
  i = diagnose.applyProposals(i, [0, 1, 2].map(k => ({
    id: `pr${k}`, level: 'observation', directness: 'direct', authority: 'self_report',
    source: 'self', specificity: 0.7, statement: 'x',
    originKind: 'self_report', originRef: `${id}_o${k}`, turnId: `${id}_t${k}`,
  })), { now: Date.now(), evidenceRefOf: pr => pr.originRef });
  i.hypotheses = [diagnose.newHypothesis({ id: `h_${id}`, statement: `about ${label}` })];
  i.leadingHypothesisId = i.hypotheses[0].id;
  return i;
};
inquiryStates[C] = {
  'member:p1': { finish: mk('p1', 'inq_f1', 'soccer.finishing', 'Finishing') },
  'member:p2': { touch:  mk('p2', 'inq_t2', 'soccer.touch', 'First touch') },
};

_teamFocuses(C, 'n1').push(teamState.newFocus({
  focusId: 'tf_1', nodeId: 'n1', text: 'Press higher in the first 20', by: 'coach', now: Date.now() }));

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = t => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const get  = (u, t) => fetch(base + u, { headers: H(t) }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const post = (u, t, b) => fetch(base + u, { method: 'POST', headers: H(t), body: JSON.stringify(b || {}) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  const coachT = issueToken('coach', C, 'coach');
  const p1T = issueToken('p1', C, 'member');
  const p2T = issueToken('p2', C, 'member');
  const p3T = issueToken('p3', C, 'member');
  const outT = issueToken('out', C, 'member');

  try {
    /* Snapshotted HERE, before a single forum message exists anywhere. The first version took
       this snapshot midway through, after FM2 had already posted — so a corruption that was
       IDEMPOTENT had already been applied to `before` and comparing the two proved nothing.
       The boundary is "no amount of talking moves anything", and it has to be measured from
       silence. */
    const before = JSON.stringify(inquiryStates[C] || {});

    /* ── FM1-FM3: a focus with people invited into it now HAS a room. ── */
    const inv = await post('/api/me/focus', p1T, { text: 'Extra finishing on Tuesdays', participants: ['p2', 'p3'] });
    const fid = inv.j.focus.id;
    ok('FM1 a focus with people named on it reports a forum as AVAILABLE, not merely as something the rule says should exist',
      (await get(`/api/objects/focus/${fid}/thread?scope=self`, p1T)).j.forumAvailable === true);

    const said = await post(`/api/forum/focus/${fid}`, p2T, { text: 'I can do Tuesdays after lifting' });
    ok('FM2 somebody invited into it can say something — this is the route that did not exist',
      said.status === 200 && said.j.messageId);
    const read = await get(`/api/forum/focus/${fid}`, p1T);
    ok('FM2b …and the person whose focus it is can read it',
      read.status === 200 && (read.j.messages || []).some(m => /after lifting/.test(m.text)));

    /* ── FM3: THE EPISTEMIC BOUNDARY, which is the whole reason a forum is safe to add. ── */
    ok('FM3a the fixture has real beliefs to move, so the boundary assertion below is standing on something',
      /supported|probable/.test(before) && before.length > 400);
    await post(`/api/forum/focus/${fid}`, p3T, { text: 'Tuesdays are hard for me' });
    await post(`/api/forum/focus/${fid}`, p2T, { text: 'Agreed, Tuesdays are hard' });
    ok('FM3 FOUR PEOPLE TALKING CHANGES NOTHING THE SYSTEM BELIEVES — speech is not evidence, and here that is structural rather than a rule somebody has to remember',
      JSON.stringify(inquiryStates[C] || {}) === before);

    /* ── FM4-FM6: the room is the INVITATION, and nobody else is in it. ── */
    // WHAT THESE TWO ACTUALLY PROVE, having been mutation-tested. The room is found by looking
    // the focus up in the VIEWER'S OWN object bucket, and that bucket only contains focuses you
    // own, were invited into, or share a squad with. So the explicit membership check inside
    // _forumRoom is unreachable defence in depth: deleting it changes no answer any request can
    // produce, because a non-participant never gets past the lookup. Both are kept — the day
    // the bucket widens, the check is what stops the room widening with it — but the assertions
    // below are honest about which one they are standing on.
    const stranger = await post(`/api/forum/focus/${fid}`, outT, { text: 'let me in' });
    ok('FM4 somebody who was not invited cannot post into it — the focus is not in their world at all, so there is nothing to address',
      stranger.status === 404 || stranger.status === 403);
    const coachPeek = await get(`/api/forum/focus/${fid}`, coachT);
    ok('FM4b …and a LEADER is not automatically in it either — leading the squad is not being invited to what two players are working on together',
      coachPeek.status === 404 || coachPeek.status === 403);

    /* ── FM5: one person is not two. ── */
    const priv = await post('/api/me/focus', p1T, { text: 'Something just for me' });
    const solo = await get(`/api/forum/focus/${priv.j.focus.id}`, p1T);
    ok('FM5 a focus with nobody else on it has no forum — that is a conversation, and it already has one',
      solo.status === 400 && /just you/i.test(solo.j.error || ''));

    /* ── FM6: THE TWO MEMBERSHIP RULES, PINNED APART. A node room follows the roster; a focus
       room follows the invitation. Getting this wrong in either direction is a disclosure or a
       lockout, and one shared members list would guarantee one of them. ── */
    const groupFocus = (await get('/api/objects?kind=focus&scope=self', p2T)).j.objects
      .find(o => /Press higher/i.test(((o.present || {}).summary || {}).title || ''));
    ok('FM6 a SQUAD focus is a room for the squad — everyone on the roster is in it',
      !!groupFocus && (await get(`/api/forum/focus/${groupFocus.id}`, p2T)).status === 200);

    orgNodes[C].n1.memberIds = ['p1', 'p3'];      // p2 is taken off the squad
    ok('FM6b …and taking somebody off the roster takes them out of THAT room, because the room is the squad',
      (await get(`/api/forum/focus/${groupFocus.id}`, p2T)).status !== 200);
    ok('FM6c …but NOT out of the focus they were invited into by name — an invitation does not expire because a roster moved, and it was never the roster that put them there',
      (await get(`/api/forum/focus/${fid}`, p2T)).status === 200);
    orgNodes[C].n1.memberIds = ['p1', 'p2', 'p3'];

    /* ── FM7: anonymity, and the honest limit of it. The forum hides authorship from every human
       reader including leaders. In a room of three that hides a name and not an identity, and
       promising otherwise would be the product telling somebody they are safer than they are. ── */
    const room = await get(`/api/forum/focus/${fid}`, p1T);
    ok('FM7 no message carries an author — the anonymity rule is unchanged by the new room',
      (room.j.messages || []).every(m => !m.authorId && !m.by && !m.name));
    // Asserted on the WHOLE payload, not just the message objects. The first version checked
    // each message and a mutation that added a parallel `authors: [...]` array beside them
    // sailed straight through it — anonymity is a property of the response, not of one field.
    ok('FM7c …and no author id appears ANYWHERE in the response, in any shape',
      !/\bp2\b/.test(JSON.stringify(room.j)) && !/\bp3\b/.test(JSON.stringify(room.j)) &&
      !/\bcoach\b/.test(JSON.stringify(room.j)));
    ok('FM7b …the room says how many people are in it, so the surface can be honest about how much a hidden name is worth in a room this small',
      room.j.people === 3);

    /* ── FM8: your own words stay yours. ── */
    await post(`/api/forum/focus/${fid}`, p1T, { text: 'Then let us make it Thursdays' });
    const room2 = await get(`/api/forum/focus/${fid}`, p1T);
    const mine = (room2.j.messages || []).find(m => m.mine);
    ok('FM8 you can still tell which are yours', !!mine);
    const others = (room.j.messages || []).find(m => !m.mine);
    const notYours = await fetch(`${base}/api/forum/focus/${fid}/${others.messageId}`, {
      method: 'PATCH', headers: H(p1T), body: JSON.stringify({ remove: true }) }).then(r => r.status);
    ok('FM8b …and cannot withdraw somebody else\'s', notYours === 403);

    /* ── FM9: THE CALL SITE. The route existing is not the discussion being reachable, which is
       the defect this project has shipped four times. ── */
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
    ok('FM9 the client opens the room it is actually in, rather than assuming every forum is a node',
      /_forumURL\(/.test(src) && /\/api\/forum\/focus\//.test(src));
    ok('FM9b …and the Forum button is offered where a forum WORKS, not where the rule merely says it should',
      /data\.forumAvailable \?/.test(src));
    ok('FM9c …and a small room is told the truth about what a hidden name is worth in it',
      /will not stop anyone working out who said what/.test(src));

  } catch (e) { fail++; console.error('  FAIL suite threw:', e && e.stack); }

  server.close();
  console.log(`\nforum-reach-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
