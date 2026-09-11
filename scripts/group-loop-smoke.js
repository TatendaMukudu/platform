/* Truth layer — THE GROUP'S HALF OF THE A → B LOOP, AND WHO MAY WALK IT.

   High/Low → Inquiry → Focus → outcome → what was recorded since. The PERSONAL half of that
   has been walkable for a while. The GROUP half was three routes — `/api/group/:nodeId/inquiry`,
   `/api/group/:nodeId/focus` and its `/outcome` — fully built, fully governed, fully tested
   server-side, and reachable by NOTHING A PERSON COULD TAP. That is why the human evidence web
   was reported PARTIAL for two passes running: the server owned the loop and the product did not
   expose it, which `reachability-smoke` records by name.

   A doorway is not a feature until somebody who should be refused is refused, so most of this
   file is the refusals. The matrix, and why each one is here rather than assumed:

     the group's own leader      may set a focus and record its outcome
     a member of the group       may READ the loop and may not set or close it
     a SIBLING node's leader     may not read it at all — leading one squad is not leading another
     a REMOVED participant       loses it the moment the roster moves, with no sweep
     another tenant              gets 404, never 403, because 403 confirms the thing exists

   AND THE OBJECT MUST STAY THE SAME OBJECT. A loop is worthless if the thing at the end is not
   the thing at the start, so identity is asserted across every step rather than at the end.

   THE LOOP REOPENS. A focus that has been closed and had its outcome recorded stays visible with
   what came of it, and a NEW focus can be set on the same inquiry later — because "we tried that,
   it did not help, we are trying something else" is the single most valuable thing a group record
   can hold, and a loop that can only run once cannot hold it.

   Run: node scripts/group-loop-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, orgNodes, inquiryStates } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { let v = false; try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'glp';            // the org under test
const X = 'oth';            // another tenant entirely

/* Two independent origins on one concept, because a group inquiry that rests on one telling is
   refused by the kernel and would make every assertion below vacuous for the wrong reason. */
const now = Date.now();
const SIG = (source, originRef, at) => ({
  kind: 'observation', status: 'active', source, originRef, at,
  turnId: `t_${source}`, directness: 'direct', authority: 'corroborated', specificity: 0.7,
  ref: `ev_${originRef}`,
});

_loadAllStores({
  orgMeta: {
    [C]: { orgName: 'Alma College', orgMode: 'sports' },
    [X]: { orgName: 'Another Club', orgMode: 'sports' },
  },
  orgUsers: {
    [C]: {
      coach:   { id: 'coach',   name: 'Head Coach',  email: 'c@x.io', role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['first'], assignedNodeIds: [] },
      player:  { id: 'player',  name: 'A Player',    email: 'p@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['first'] },
      leaver:  { id: 'leaver',  name: 'Left Later',  email: 'l@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['first'] },
      sibling: { id: 'sibling', name: 'Other Coach', email: 's@x.io', role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['res'], assignedNodeIds: [] },
    },
    [X]: {
      stranger: { id: 'stranger', name: 'Elsewhere', email: 'e@x.io', role: 'coach', orgCode: X, status: 'active', leadershipNodeIds: ['their'], assignedNodeIds: [] },
    },
  },
  orgNodes: {
    [C]: {
      first: { nodeId: 'first', name: 'First Team', parentId: null, childNodeIds: [],
        memberIds: ['player', 'leaver'], leaderIds: ['coach'] },
      res:   { nodeId: 'res', name: 'Reserves', parentId: null, childNodeIds: [],
        memberIds: [], leaderIds: ['sibling'] },
    },
    [X]: { their: { nodeId: 'their', name: 'Their Team', parentId: null, childNodeIds: [], memberIds: [], leaderIds: ['stranger'] } },
  },
  inquiryStates: {
    [C]: {
      'group:first': {
        inq_press: {
          inquiryId: 'inq_press', subjectRef: 'group:first',
          topic: { canonicalConcept: 'football.press_shape', label: 'Press shape' },
          status: 'exploring',
          hypotheses: [{ id: 'h1', statement: 'The press keeps forcing us backwards',
            confidence: { score: 0.6, band: 'probable' }, status: 'open' }],
          leadingHypothesisId: 'h1',
          signals: [SIG('player', 'o_player', now - 86400000 * 3), SIG('leaver', 'o_leaver', now - 86400000 * 2)],
          confidence: { score: 0.6, band: 'probable', because: ['2 independent origins'] },
          missingSignals: [{ question: 'What changes when we start deeper?' }],
          falsifiers: [{ statement: 'We keep the ball when we start deeper' }],
          timeline: [], lastUpdatedAt: now,
        },
      },
    },
    // The other tenant has an inquiry with the SAME id, which is the shape that catches an
    // org-blind lookup: a route reading by id alone would find this one and never notice.
    [X]: {
      'group:their': {
        inq_press: {
          inquiryId: 'inq_press', subjectRef: 'group:their',
          topic: { canonicalConcept: 'football.press_shape', label: 'Their press shape' },
          status: 'exploring', hypotheses: [], signals: [SIG('x1', 'o_x', now)],
          confidence: { score: 0.3, band: 'emerging', because: [] },
          missingSignals: [], falsifiers: [], timeline: [], lastUpdatedAt: now,
        },
      },
    },
  },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = t => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const get  = (u, t) => fetch(base + u, { headers: H(t) }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const post = (u, t, b) => fetch(base + u, { method: 'POST', headers: H(t), body: JSON.stringify(b || {}) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  const coachT   = issueToken('coach', C, 'coach');
  const playerT  = issueToken('player', C, 'member');
  const leaverT  = issueToken('leaver', C, 'member');
  const siblingT = issueToken('sibling', C, 'coach');
  const strangeT = issueToken('stranger', X, 'coach');

  try {
    console.log('\n  A — THE GROUP IS WORKING SOMETHING OUT, AND ITS PEOPLE CAN READ IT');
    const asCoach = await get('/api/group/first/inquiry', coachT);
    ok('GL-A1 the group inquiry route answers its own leader',
      asCoach.status === 200 && asCoach.j.ok === true);
    ok('GL-A1b …with the inquiry that actually exists for this group',
      (asCoach.j.inquiries || []).some(i => i.inquiryId === 'inq_press'));
    const row = (asCoach.j.inquiries || []).find(i => i.inquiryId === 'inq_press') || {};
    ok('GL-A2 …carrying what it rests on, counted as independent ORIGINS rather than as voices',
      row.independentOrigins === 2);
    ok('GL-A2b …and what is still unknown, which is the half that makes it an inquiry',
      Array.isArray(row.stillUnknown) && row.stillUnknown.length >= 1);
    /* GL-A3 NAMES STRINGS THAT ARE DEFINITELY IN THE STORED RECORD. An absence test is only worth
       anything when the thing would otherwise be there, and the fixture's signals carry every one
       of these — `source: 'player'`, `originRef: 'o_player'`, `ref: 'ev_o_player'`, a turnId. What
       reaches a reader is `signals: 2`, a COUNT. The first version of this used an `||` between
       two absences, which passes whenever either holds and so proves neither. */
    const groupPayload = JSON.stringify(asCoach.j);
    ok('GL-A3 …and no evidence internals reach the reader — the group holds references, never words',
      !groupPayload.includes('o_player') && !groupPayload.includes('ev_o_player')
      && !groupPayload.includes('turnId') && !groupPayload.includes('"source"'));
    ok('GL-A3b …what it rests on arrives as a COUNT, which is the shape that cannot leak',
      row.signals === 2 && !Array.isArray(row.signals));

    const asMember = await get('/api/group/first/inquiry', playerT);
    ok('GL-A4 a member of the group may READ what their group is working out',
      asMember.status === 200 && (asMember.j.inquiries || []).some(i => i.inquiryId === 'inq_press'));

    console.log('\n  B — AND THE PEOPLE WHO ARE NOT ITS PEOPLE CANNOT');
    const asSibling = await get('/api/group/first/inquiry', siblingT);
    ok('GL-B1 a SIBLING node’s leader is refused — leading one squad is not leading another',
      asSibling.status === 403);
    const crossTenant = await get('/api/group/first/inquiry', strangeT);
    ok('GL-B2 another tenant gets 404, not 403 — a 403 confirms the group exists',
      crossTenant.status === 404);
    ok('GL-B2b …and nothing of this org’s comes back with it',
      !JSON.stringify(crossTenant.j || {}).includes('Press shape'));

    console.log('\n  C — A FOCUS IS SET OUT OF THE INQUIRY, AND ONLY BY SOMEBODY WHO LEADS');
    const memberTry = await post('/api/group/first/focus', playerT, { text: 'Start deeper', fromInquiryId: 'inq_press' });
    ok('GL-C1 a member of the group may not set its focus — a commitment is a leader’s act',
      memberTry.status === 403);
    const siblingTry = await post('/api/group/first/focus', siblingT, { text: 'Start deeper', fromInquiryId: 'inq_press' });
    ok('GL-C1b …nor may a sibling node’s leader', siblingTry.status === 403);

    /* THE ORIGIN CANNOT BE CLAIMED FOR EVIDENCE THAT DOES NOT EXIST. The cross-tenant inquiry has
       the SAME ID, so a lookup that forgot the org would find it and stamp a real-looking origin
       on a focus that came out of another organisation's evidence. */
    const forged = await post('/api/group/first/focus', coachT, { text: 'x', fromInquiryId: 'inq_nope' });
    ok('GL-C2 a focus may not name an origin inquiry this group does not have', forged.status === 404);

    const made = await post('/api/group/first/focus', coachT,
      { text: 'Start our build-up deeper for three matches', fromInquiryId: 'inq_press' });
    ok('GL-C3 the group’s own leader sets it', made.status === 200 && made.j.ok === true);
    const focusId = made.j.focus && made.j.focus.focusId;
    ok('GL-C3b …and it records that it came OUT OF the inquiry, not out of a leader’s hunch',
      made.j.focus && made.j.focus.origin && made.j.focus.origin.from === 'inquiry'
      && made.j.focus.origin.inquiryId === 'inq_press');
    ok('GL-C3c …naming who set it and when, since intent cannot be back-filled',
      made.j.focus.origin.by === 'coach' && Number(made.j.focus.origin.at) > 0);

    console.log('\n  D — THE OBJECT IS THE SAME OBJECT ALL THE WAY ROUND');
    const stateAfter = await get('/api/group/first/state', coachT);
    ok('GL-D1 the focus the leader just set is the one the group’s state reports',
      stateAfter.j.focus && stateAfter.j.focus.focusId === focusId);
    ok('GL-D1b …with its text unchanged by the round trip',
      stateAfter.j.focus.text === 'Start our build-up deeper for three matches');
    ok('GL-D2 …and the inquiry it came out of still carries its own identity',
      (inquiryStates[C]['group:first'].inq_press || {}).inquiryId === 'inq_press');
    ok('GL-D3 the state read tells the CALLER whether they lead, from the same function that guards the writes',
      stateAfter.j.viewer && stateAfter.j.viewer.leads === true);
    const memberState = await get('/api/group/first/state', playerT);
    ok('GL-D3b …and says so honestly to somebody who does not',
      memberState.j.viewer && memberState.j.viewer.leads === false);

    console.log('\n  E — WHAT CAME OF IT');
    const memberClose = await post(`/api/group/first/focus/${focusId}/outcome`, playerT, { result: 'helped' });
    ok('GL-E1 a member may not record the outcome either', memberClose.status === 403);
    const wrongOrg = await post(`/api/group/first/focus/${focusId}/outcome`, strangeT, { result: 'helped' });
    ok('GL-E1b …and another tenant is 404 at the node before the focus is ever looked up',
      wrongOrg.status === 404);

    const closed = await post(`/api/group/first/focus/${focusId}/outcome`, coachT,
      { result: 'unclear', note: 'we changed three things at once' });
    ok('GL-E2 the leader records what happened', closed.status === 200 && closed.j.ok === true);
    ok('GL-E2b …and "we cannot separate it" is a first-class answer, not a failure to answer',
      closed.j.focus.outcome && closed.j.focus.outcome.result === 'unclear');

    console.log('\n  F — AND THE LOOP CAN BE RUN AGAIN');
    /* "We tried that, it did not help, we are trying something else" is the most valuable thing a
       group record can hold, and a loop that runs once cannot hold it. */
    const second = await post('/api/group/first/focus', coachT,
      { text: 'Press higher instead, for three matches', fromInquiryId: 'inq_press' });
    ok('GL-F1 a NEW focus can be set on the same inquiry after the first one closed',
      second.status === 200 && second.j.focus.focusId !== focusId);
    ok('GL-F1b …and it carries the same origin, so both attempts hang off the thing they addressed',
      second.j.focus.origin.inquiryId === 'inq_press');
    const after = await get('/api/group/first/state', coachT);
    ok('GL-F2 the new one is what the group is working on now',
      after.j.focus && after.j.focus.focusId === second.j.focus.focusId);
    ok('GL-F3 …while the closed one stays visible with what came of it, rather than disappearing',
      (after.j.history || []).some(f => f.focusId === focusId
        && f.outcome && f.outcome.result === 'unclear'));

    console.log('\n  G — A REMOVED PARTICIPANT LOSES IT, WITH NO SWEEP');
    const beforeRemoval = await get('/api/group/first/inquiry', leaverT);
    ok('GL-G1 while they are on the roster they can read the group’s loop',
      beforeRemoval.status === 200);
    const removed = await fetch(base + '/api/group/first/roster/leaver',
      { method: 'DELETE', headers: H(coachT) }).then(r => r.status);
    ok('GL-G2 the leader takes them off the squad', removed === 200);
    const afterRemoval = await get('/api/group/first/inquiry', leaverT);
    ok('GL-G3 …and the very next read is refused — membership is resolved live, never stored as a list',
      afterRemoval.status === 403);
    const stateAfterRemoval = await get('/api/group/first/state', leaverT);
    ok('GL-G3b …on the group’s state as well, not only on one route',
      stateAfterRemoval.status === 403);
    ok('GL-G4 …and the group’s own record is untouched by somebody leaving it',
      (orgNodes[C].first.memberIds || []).includes('player')
      && (inquiryStates[C]['group:first'].inq_press.signals || []).length === 2);

    console.log('\n  H — CROSS-TENANT OBJECTS NEVER MIX');
    const theirs = await get('/api/group/their/inquiry', strangeT);
    ok('GL-H1 the other tenant reads their OWN group, which has the same inquiry id',
      theirs.status === 200 && (theirs.j.inquiries || []).some(i => i.inquiryId === 'inq_press'));
    ok('GL-H1b …and gets THEIR topic, not this org’s — the id collision is the point of the fixture',
      JSON.stringify(theirs.j).includes('Their press shape')
      && !JSON.stringify(theirs.j).includes('keeps forcing us backwards'));
    const ourNodeTheirToken = await get('/api/group/their/inquiry', coachT);
    ok('GL-H2 …and this org’s coach cannot reach their node either', ourNodeTheirToken.status === 404);

  } catch (e) { fail++; console.error('  FAIL group-loop suite threw:', e && e.stack); }

  server.close();
  console.log(`\ngroup-loop-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
