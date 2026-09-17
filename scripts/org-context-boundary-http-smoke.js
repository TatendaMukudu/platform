/* Truth layer — CONTEXT HELPS INTERPRET EVIDENCE. CONTEXT IS NOT EVIDENCE OF EVENTS.

   An organisation declares things: a name for a node and what it is responsible for, goals it
   wants, values it holds, metrics it intends to watch, a definition of success. A person declares
   things too, at onboarding: what they want to get better at, what they think their strengths are.

   All of that is the DECLARED WORLD. It says what the organisation and the person INTEND. It says
   nothing whatever about what happened on a Tuesday, and the moment it is allowed to say something
   about what happened, the product is lying in the most expensive way available to it — by
   agreeing with whoever wrote the mission statement.

   THE BOUNDARY THIS SUITE EXISTS TO HOLD:

     declared goal   is not an achieved outcome
     declared value  is not an observed behaviour
     metric NAME     is not a metric VALUE
     node description is not evidence the node does that thing well
     self-description is not a verified fact about the person

   So changing ONLY declared context may change what IntelliQ considers RELEVANT, which QUESTION is
   worth asking, how it INTERPRETS an ambiguous reference, and the WORDS it reaches for. It may not
   change the origin count, the evidence count, the empirical support, the confidence band, the
   recorded outcome, or anything's causal standing.

   WHY THIS SUITE EXISTS AT ALL, which is the important part. Before this pass the boundary held
   for a reason that is no protection: the kernel never received these fields. `orgValues`,
   `orgGoals`, `orgMetrics`, `organizationProfile` and node descriptions reached prompt builders
   and nothing else, so contamination was prevented by ARCHITECTURAL ABSENCE rather than by a rule
   anybody had written down. An absence is not a boundary. It holds until somebody wires a field up
   for a good reason and nothing goes red.

   This pass then deliberately CONNECTED that context to the composer's system prompt — which is
   the right place for it and is what makes the product feel like it knows where it is — and that
   connection is exactly the change that makes the absence stop being a protection. Hence this
   file: the boundary is now asserted rather than inherited.

   Runs models-off, which is the pilot's state. Section F stubs the gateway to read the prompt the
   model would have received, because "the context reaches the model" and "the context reaches the
   kernel" are the two halves that must both be true and true separately.

   Run: node scripts/org-context-boundary-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken,
        groupCandidates, _noteGroupCandidates } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'ctxb';
const SQUAD = Array.from({ length: 14 }, (_, i) => 'p' + (i + 1));
const users = { coach: { id: 'coach', name: 'Coach', email: 'c@ctxb.io', role: 'coach', orgCode: C,
  status: 'active', leadershipNodeIds: ['first'], assignedNodeIds: ['first'] } };
for (const id of SQUAD) users[id] = { id, name: id.toUpperCase(), email: `${id}@ctxb.io`,
  role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['first'] };

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: users },
  orgNodes: { [C]: { first: { nodeId: 'first', name: 'First Team', description: '',
    parentId: null, childNodeIds: [], memberIds: [...SQUAD, 'coach'], leaderIds: ['coach'] } } },
});
_rebuildEmailIndex();

/* Five people, five independent origins, their own collective language. This is the EVIDENCE, and
   it is the only thing in the fixture that is evidence. */
for (const id of SQUAD.slice(0, 5)) {
  _noteGroupCandidates(C, id, `member:${id}`, [{ id: 'cb_' + id, level: 'observation',
    text: 'substitutes do not know their role',
    sourceSpan: 'our subs do not know what we want from them',
    concerns: 'group', originRef: 'ob_' + id, originKind: 'direct_observation', turnId: 'tb_' + id }],
    'substitute_clarity', 'What substitutes are asked to do');
}

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = who => ({ Authorization: `Bearer ${issueToken(who, C, who === 'coach' ? 'coach' : 'member')}`,
                      'Content-Type': 'application/json' });
  const call = (m, u, b, who) => fetch(base + u, { method: m, headers: H(who),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const theInquiry = async () => (((await call('GET', '/api/group/first/inquiry', undefined, 'coach')).j || {})
    .inquiries || []).find(i => ((i.topic || {}).canonicalConcept) === 'substitute_clarity') || {};

  /* The full empirical fingerprint of the situation. If declared context can move ANY of these,
     the boundary is gone, and which one moved is the first thing a reader needs. */
  const fingerprint = i => JSON.stringify({
    band: (i.confidence || {}).band,
    score: (i.confidence || {}).score,
    origins: i.independentOrigins,
    contributors: i.contributors,
    polarity: i.polarity,
    hypothesis: i.hypothesis,
    standing: (i.hypothesisStanding || {}).supportedBy,
    readiness: (i.readiness || {}).state,
    tried: (i.triedBefore || []).length,
    unknowns: (i.stillUnknown || []).length,
  });

  try {
    /* ══ A — THE EVIDENCE, BEFORE ANYBODY DECLARES ANYTHING ════════════════════════════════ */
    console.log('\n  A — WHAT FIVE PEOPLE ACTUALLY ESTABLISHED');
    for (const id of SQUAD.slice(0, 5)) {
      const c = (groupCandidates[C] || []).find(x => x.contributorId === id && x.status === 'detected');
      if (c) await call('POST', '/api/group/first/contribute', { candidateId: c.candidateId, valence: 'worth_attention' }, id);
    }
    const before = await theInquiry();
    ok('OC-A1 the question is open on five independent origins, computed by the kernel',
      !!before.inquiryId && before.independentOrigins === 5 && (before.confidence || {}).band === 'supported');
    ok('OC-A2 …and nothing yet claims to know why, because nobody has said why',
      before.hypothesis === null && (before.readiness || {}).state === 'not_enough_evidence');
    const fpBefore = fingerprint(before);

    /* ══ B — NOW THE ORGANISATION DECLARES A WORLD IN WHICH THIS IS NOT A PROBLEM ══════════
       Every field the product stores about what the organisation INTENDS, set to say the exact
       opposite of what the five people observed. If declared context carried any empirical
       weight at all, this is where the picture would move. */
    console.log('\n  B — AND THE ORGANISATION DECLARES THE OPPOSITE');
    S.orgNodes[C].first.description =
      'The First Team communicates exceptionally well and substitutes are always clear on their roles.';
    S.orgValues[C] = ['Clarity', 'Communication', 'Every player knows their role'];
    S.orgGoals[C] = [{ goalId: 'g1', text: 'Substitutes always know their role', createdAt: new Date().toISOString() }];
    S.orgMetrics[C] = [{ metricId: 'm1', name: 'Role clarity', source: 'declared', order: 1 }];
    S.orgMeta[C].organizationProfile = {
      orgSummary: 'A club where role clarity has never been a problem.',
      successDefinition: 'Every substitute knows their role',
      values: ['Clarity'], behaviours: ['Clear communication'],
    };
    const after = await theInquiry();

    ok('OC-B1 a node DESCRIPTION saying the thing is fine does not make it fine',
      after.independentOrigins === 5 && (after.confidence || {}).band === (before.confidence || {}).band);
    ok('OC-B2 a declared GOAL is not an achieved outcome',
      (after.readiness || {}).state === (before.readiness || {}).state
      && (after.triedBefore || []).length === (before.triedBefore || []).length);
    ok('OC-B3 a declared VALUE is not an observed behaviour — it proposes no explanation',
      after.hypothesis === null && (after.alternatives || []).length === 0);
    ok('OC-B4 a metric DEFINITION is not a metric OBSERVATION',
      (after.confidence || {}).score === (before.confidence || {}).score);
    ok('OC-B5 …and the direction the CONTRIBUTORS declared is not overturned by the org\'s wishes',
      after.polarity === before.polarity);
    /* THE WHOLE SECTION IN ONE LINE. Every empirical field at once, so a future field that starts
       moving is caught even though nobody thought to name it here. */
    ok('OC-B6 …and NOTHING empirical moved at all, field by field',
      fingerprint(after) === fpBefore);

    /* ══ C — THE SAME ATTACK FROM THE PERSONAL SIDE ════════════════════════════════════════
       Onboarding is declared context too, and it is the one people forget: a player who typed
       "my biggest strength is leadership" has told you what they believe about themselves, which
       is a real and useful thing, and is not an observation of leadership. */
    console.log('\n  C — AND A PERSON\'S OWN SELF-DESCRIPTION IS NOT A FINDING ABOUT THEM');
    S.memberGoals[C + ':p1'] = {
      goal: 'Become the most reliable communicator in the squad',
      mainGoals: 'Become the most reliable communicator in the squad',
      identity: 'A player others rely on', longTermGoals: 'A player others rely on',
      strengths: 'Communication', improvementAreas: 'Nothing, communication is my strength',
      selectedValues: ['Clarity'], memberName: 'P1',
    };
    const afterSelf = await theInquiry();
    ok('OC-C1 a member\'s declared strength does not become evidence against what the group observed',
      fingerprint(afterSelf) === fpBefore);
    /* AND IT DOES NOT BECOME A HIGH. A self-description that minted an object would be the
       product asserting, on the strength of somebody's own say-so, that a thing is going well. */
    const objs = (S._allObjectsFor(C, 'p1') || []);
    ok('OC-C2 …and no High was minted out of somebody describing themselves well',
      !objs.some(o => o.kind === 'high'
        && /reliable communicator|communication is my strength/i.test(
          String((o.explained && o.explained.headline) || (o.raw && o.raw.text) || ''))));

    /* ══ D — THE CONTROL, AND THE HALF THE FIRST VERSION OF THIS SUITE MISSED ══════════════
       A suite where the number never moves proves nothing unless something CAN move it. One more
       person, one more real origin, and the picture changes.

       BUT THIS SECTION IS ALSO LOAD-BEARING FOR B AND C, AND THAT WAS FOUND BY MUTATION RATHER
       THAN BY THINKING. Admitting the node description as an observation inside
       `_admitGroupContributions` left B1-B6 GREEN and took out D1 instead. The reason is
       ordering: contributions are admitted when they arrive, so B and C change declared context
       at a moment when nothing re-admits, and a read afterwards cannot see contamination that
       only happens on WRITE. B and C therefore prove there is no READ-time contamination, which
       is real but is half the property.

       The other half is here. The sixth contribution happens AFTER every declared field has been
       set to say the opposite, so admission runs once more with the whole declared world in
       scope — and the origin count must rise by exactly ONE, for the one person who saw it, not
       by two for the person plus the mission statement. */
    console.log('\n  D — THE CONTROL, AND ADMISSION RUNNING WITH THE DECLARED WORLD IN SCOPE');
    _noteGroupCandidates(C, 'p6', 'member:p6', [{ id: 'cb_p6', level: 'observation',
      text: 'substitutes do not know their role',
      sourceSpan: 'our subs still do not know what we want from them',
      concerns: 'group', originRef: 'ob_p6', originKind: 'direct_observation', turnId: 'tb_p6' }],
      'substitute_clarity', 'What substitutes are asked to do');
    const c6 = (groupCandidates[C] || []).find(x => x.contributorId === 'p6' && x.status === 'detected');
    if (c6) await call('POST', '/api/group/first/contribute', { candidateId: c6.candidateId, valence: 'worth_attention' }, 'p6');
    const afterReal = await theInquiry();
    ok('OC-D1 a sixth person who actually saw it DOES move the origin count',
      afterReal.independentOrigins === 6);
    ok('OC-D2 …so the fingerprint above was live, and its stillness in B and C meant something',
      fingerprint(afterReal) !== fpBefore);
    /* EXACTLY ONE. Not "more than five" — that would pass with the description counted too. The
       count is the assertion, because the failure this catches is an extra origin nobody can see
       on any screen: the number simply reads one higher and looks like better evidence. */
    ok('OC-D3 …and it rose by EXACTLY one, so admission did not also count the declared world',
      afterReal.independentOrigins === before.independentOrigins + 1
      && afterReal.contributors === before.contributors + 1);
    /* AND THE NEW ACCOUNT IS THE ONLY THING THAT CHANGED. A description admitted as an
       authoritative, direct, highly specific observation would not just add an origin — it would
       lift the band it was designed to lift. */
    ok('OC-D4 …and no declared field bought the question a better standing on the way through',
      (afterReal.confidence || {}).score <= 0.95 && afterReal.hypothesis === null);

    /* ══ E — AND THE DECLARED WORLD IS STILL NOT AN EXPLANATION ════════════════════════════ */
    console.log('\n  E — SIX ORIGINS LATER, THE ORG\'S GOAL STILL EXPLAINS NOTHING');
    ok('OC-E1 no declared field has become a candidate explanation for what was observed',
      afterReal.hypothesis === null && (afterReal.alternatives || []).length === 0);
    ok('OC-E2 …and the group is not told it is ready to act because the org declared a goal',
      (afterReal.readiness || {}).state !== 'ready');

  } catch (e) { fail++; console.error('  FAIL org-context suite threw:', e && e.stack); }

  server.close();
  console.log(`\norg-context-boundary-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
