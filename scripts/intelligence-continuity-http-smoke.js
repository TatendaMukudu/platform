/* Truth layer — ONE UNDERSTANDING, SEVERAL FACES, AND NONE OF THEM CONTRADICTS THE OTHERS.

   FOUNDER PRODUCT LAW: High, Low, Inquiry and Focus are not four intelligence pipelines. They are
   different human-facing forms of ONE learning system, and the intelligence follows the thing —
   it does not disappear or change its mind because the presentation changed.

   So this suite builds ONE deterministic situation and then reads it from every surface a person
   can reach it from, asserting that they agree about the things it would be a lie to disagree
   about. Wording and layout may differ; these may not:

     what the observation rests on          (origins, not voices)
     the standing of the candidate explanation  (tentative, unsupported — on every surface)
     the unknown                            (present, and not quietly dropped)
     the outcome word                       (the group's own, identical everywhere)
     the absence of a causal claim          (everywhere, without exception)

   THE SITUATION, fixed and unremarkable:

     OBSERVATION  communication drops after difficult results  (five independent origins)
     LOW          it deserves attention
     INQUIRY      why does it happen
     EXPLANATION  players may be reluctant to criticise each other  (a human offered it)
     STANDING     tentative — nothing supports it yet
     UNKNOWN      whether that reluctance is actually driving the pattern
     FOCUS        a player-led debrief after the next two difficult results
     OUTCOME      it got better
     LEARNING     it improved afterwards; nothing establishes that the debrief caused it

   HOW THE FIXTURE IS BUILT, said plainly. Group candidates are minted through the exported
   `_noteGroupCandidates`, because candidate DETECTION is model-gated and this suite runs with
   models off. Everything after that is the product's own: contributing is the real route with the
   real valence, the inquiry opens on the real rule, the explanation goes through the real
   boundary, the focus and the outcome are the real writers. Nothing below reads a seeded
   projection.

   Run: node scripts/intelligence-continuity-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken,
        groupCandidates, _noteGroupCandidates, _allObjectsFor } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'cont';
/* Fourteen members, five contributors — the two-sided cohort floor needs k >= 5 AND n-k >= 5, so
   a thinner squad could only ever prove that the floor withholds. */
const SQUAD = Array.from({ length: 14 }, (_, i) => 'p' + (i + 1));
const users = { coach: { id: 'coach', name: 'Coach', email: 'c@cont.io', role: 'coach', orgCode: C,
  status: 'active', leadershipNodeIds: ['first'], assignedNodeIds: ['first'] } };
for (const id of SQUAD) users[id] = { id, name: id.toUpperCase(), email: `${id}@cont.io`,
  role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['first'] };

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: users },
  orgNodes: { [C]: { first: { nodeId: 'first', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: [...SQUAD, 'coach'], leaderIds: ['coach'] } } },
});
_rebuildEmailIndex();

for (const id of SQUAD.slice(0, 5)) {
  _noteGroupCandidates(C, id, `member:${id}`, [{ id: 'ct_' + id, level: 'observation',
    text: 'talking drops off after we lose', sourceSpan: 'nobody talks after a loss',
    concerns: 'group', originRef: 'oc_' + id, originKind: 'direct_observation', turnId: 'tc_' + id }],
    'communication', 'Communication after results');
}

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = who => ({ Authorization: `Bearer ${issueToken(who, C, who === 'coach' ? 'coach' : 'member')}`,
                      'Content-Type': 'application/json' });
  const call = (m, u, b, who) => fetch(base + u, { method: m, headers: H(who),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const ask = async (text, who = 'coach') => {
    const r = await call('POST', '/api/assistant/turn', { text }, who);
    return String(((r.j || {}).response || {}).responseText || '');
  };
  const NO_CAUSE = /because of (?:this|the) focus|the focus (?:worked|caused|fixed)|caused by|led to the improvement|proved that|thanks to the/i;

  try {
    /* ══ 1 — THE OBSERVATION, THROUGH THE REAL CONTRIBUTION PATH ════════════════════════════ */
    console.log('\n  1 — FIVE PEOPLE OFFER IT, AND SAY WHICH WAY IT POINTS');
    for (const id of SQUAD.slice(0, 5)) {
      const cand = (groupCandidates[C] || []).find(x => x.contributorId === id && x.status === 'detected');
      if (cand) await call('POST', '/api/group/first/contribute',
        { candidateId: cand.candidateId, valence: 'worth_attention' }, id);
    }
    const inqs = ((await call('GET', '/api/group/first/inquiry', undefined, 'coach')).j || {}).inquiries || [];
    const inq = inqs[0] || {};
    ok('IC-1a the inquiry opened on five INDEPENDENT ORIGINS, not five voices',
      inq.independentOrigins === 5 && inq.contributors === 5);
    ok('IC-1b …and the contributors called it something worth attention, which is what makes it a Low',
      inq.polarity === 'friction' || inq.polarity === 'low');

    /* ══ 2 — A HUMAN OFFERS AN EXPLANATION, AND IT STAYS A CANDIDATE ════════════════════════ */
    console.log('\n  2 — SOMEBODY SAYS WHY, THROUGH THE REAL BOUNDARY');
    const said = await call('POST', `/api/group/first/inquiry/${inq.inquiryId}/explanation`,
      { text: 'players are reluctant to criticise each other' }, 'p1');
    ok('IC-2a the explanation is accepted as a candidate',
      said.status === 200 && (said.j.explanation || {}).band === 'tentative');
    ok('IC-2b …and the INQUIRY\'s own confidence did not move because somebody explained it',
      said.j.inquiryConfidence && said.j.inquiryConfidence.unchanged === true);

    /* ══ 3 — THE ACTION HALF, THROUGH THE REAL WRITERS ══════════════════════════════════════ */
    console.log('\n  3 — THE GROUP TRIES SOMETHING, AND RECORDS WHAT FOLLOWED');
    const made = await call('POST', '/api/group/first/focus',
      { text: 'Player-led debrief after the next two difficult results', fromInquiryId: inq.inquiryId }, 'coach');
    const focusId = made.j.focus.focusId;
    await call('POST', `/api/group/first/focus/${focusId}/outcome`, { result: 'better' }, 'coach');
    ok('IC-3a the focus records which question it came out of',
      made.j.focus.origin.from === 'inquiry' && made.j.focus.origin.inquiryId === inq.inquiryId);

    /* ══ 4 — NOW READ IT FROM EVERY SURFACE ════════════════════════════════════════════════ */
    console.log('\n  4 — THE SAME UNDERSTANDING, READ FROM EVERY SURFACE');
    const groupInq = (((await call('GET', '/api/group/first/inquiry', undefined, 'coach')).j || {}).inquiries || [])
      .find(i => i.inquiryId === inq.inquiryId) || {};
    const state    = (await call('GET', '/api/group/first/state', undefined, 'coach')).j || {};
    const squadFace = state.low || state.high || state.question || {};
    const objects  = _allObjectsFor(C, 'coach') || [];
    const asObject = objects.find(o => String(o.id) === inq.inquiryId) || {};
    const thread   = (await call('GET', `/api/objects/${asObject.kind}/${inq.inquiryId}/thread?scope=group:first`,
      undefined, 'coach')).j || {};
    const focusThread = (await call('GET', `/api/objects/focus/${focusId}/thread?scope=group:first`,
      undefined, 'coach')).j || {};
    const related  = (await call('GET', `/api/objects/${asObject.kind}/${inq.inquiryId}/related?scope=group:first`,
      undefined, 'coach')).j || {};
    const composerWhy    = await ask('What could explain it?');
    const composerTried  = await ask('What have we tried?');

    ok('IC-4a the question exists on all of them — group route, squad surface, object index, thread',
      !!groupInq.inquiryId && !!squadFace.inquiryId && !!asObject.kind && thread.ok !== false);

    console.log('\n  4a — WHAT IT RESTS ON DOES NOT CHANGE WITH THE FACE');
    ok('IC-4b the group route and the object projection agree about independent origins',
      groupInq.independentOrigins === 5
      && Number((asObject.raw || {}).independentOrigins) === 5);
    ok('IC-4c …and no surface reports it as five separate PEOPLE agreeing, which is a different claim',
      !/five people agree|5 people agree/i.test(JSON.stringify({ thread, state })));

    console.log('\n  4b — THE EXPLANATION IS UNSUPPORTED ON EVERY ONE OF THEM');
    ok('IC-4d the group route carries its own standing, and it is tentative with nothing behind it',
      (groupInq.hypothesisStanding || {}).band === 'tentative'
      && (groupInq.hypothesisStanding || {}).supportedBy === 0);
    ok('IC-4e the squad surface does NOT promote it to the group\'s finding',
      squadFace.claim === null || squadFace.claim === undefined
      || !/reluctant to criticise/i.test(String(squadFace.claim)));
    ok('IC-4f …and carries it as an explanation that is not supported',
      (squadFace.explanations || []).some(e => /reluctant to criticise/i.test(String(e.statement))
        && e.supported === false));
    ok('IC-4g the object thread does not print it under the band the OBSERVATION earned',
      !(((thread.present || {}).summary || {}).thinking || '').match(/reluctant to criticise/i));
    ok('IC-4h …and instead offers it as a suggestion, with what it rests on beside it',
      (((thread.present || {}).summary || {}).possibleExplanation || {}).supportedBy === 0);
    ok('IC-4i the composer says the same thing in its own words',
      /reluctant to criticise/i.test(composerWhy) && /nothing on the record supports that yet/i.test(composerWhy));
    /* MY FIRST VERSION OF THIS MATCHED THE PRODUCT'S OWN HONEST SENTENCE. The composer writes
       "someone suggested it is because players are reluctant … — nothing on the record supports
       that yet", and a bare search for "it is because players are reluctant" hits the middle of
       it. That is the fourth time in this repository a negative check has gone red on the very
       clause that makes a statement safe, and it is recorded rather than quietly patched.

       The property that actually matters is that the claim never appears WITHOUT its hedge. So
       the qualified forms are removed first, and what is left must contain no assertion at all. */
    const unhedged = JSON.stringify({ state, thread }) + ' ' + composerWhy
      .replace(/someone suggested it is because[^.]*?—[^.]*?\./gi, '')
      .replace(/nothing on the record supports that yet/gi, '');
    ok('IC-4j …and NO surface states it without the clause that makes it a suggestion',
      !/(?:we know|it is|this is|the reason is)\s+(?:that\s+)?(?:because\s+)?players are reluctant/i.test(unhedged));

    console.log('\n  4c — THE UNKNOWN IS STILL THERE, ON THE SURFACES THAT CARRY ONE');
    ok('IC-4k the group route still reports what is not established',
      (groupInq.stillUnknown || []).some(u => /nothing recorded supports it yet/i.test(String(u))));
    ok('IC-4l …and the composer, asked directly, reports the same thing',
      /nothing recorded supports it yet/i.test(await ask("What don't we know?")));

    console.log('\n  4d — THE OUTCOME WORD IS ONE WORD, EVERYWHERE');
    ok('IC-4m the group\'s own store holds `better`',
      (state.history || []).some(f => f.focusId === focusId && f.outcome && f.outcome.result === 'better'));
    ok('IC-4n the question\'s own projection reports the same outcome against the same focus',
      (groupInq.triedBefore || []).some(t => t.focusId === focusId && t.outcome === 'better'));
    ok('IC-4o the loop, read from the question end, reports the same word',
      (related.loop || {}).outcome === 'better');
    /* READ FROM THE FOCUS'S OWN CONNECTIONS, which is where the edge lives. My first version
       looked at the THREAD payload, which does not carry `related` — the screen fetches it
       separately — so the assertion was asking the wrong object and would have failed whatever
       the product did. */
    const focusRelated = (await call('GET', `/api/objects/focus/${focusId}/related?scope=group:first`,
      undefined, 'coach')).j || {};
    ok('IC-4p the FOCUS end points back at the question it came from, by the field it was stored in',
      (focusRelated.related || []).some(r => r.type === 'addresses' && r.kind === 'inquiry'
        && /Communication after results/i.test(String(r.label || ''))
        && r.basis === 'focus.origin.inquiryId'));
    ok('IC-4p2 …and reports the same outcome word the question\'s end reports',
      (focusRelated.loop || {}).outcome === (related.loop || {}).outcome
      && (focusRelated.loop || {}).outcome === 'better');
    ok('IC-4p3 …and its own thread opens, so the focus is a place a person can actually stand',
      focusThread.ok !== false && !!((focusThread.present || {}).summary || {}).title);
    ok('IC-4q and the composer says it in the group\'s words rather than the kernel\'s enum',
      /it got better/i.test(composerTried) && !/\boutcome: better\b|"better"/.test(composerTried));

    console.log('\n  4e — AND NOT ONE OF THEM CLAIMS THE FOCUS CAUSED IT');
    const everySurface = JSON.stringify({ state, groupInq, thread, focusThread, related })
      + ' ' + composerWhy + ' ' + composerTried;
    ok('IC-4r no surface makes a causal claim',
      !NO_CAUSE.test(everySurface.replace(/not a claim that the focus caused it/gi, '')
        .replace(/nothing here says a focus caused what followed it/gi, '')));
    ok('IC-4s …and the surfaces that show the outcome carry the disclaimer explicitly',
      /not a claim that the focus caused it|nothing here says a focus caused what followed it/i
        .test(JSON.stringify(related) + composerTried));

    /* ══ 5 — AND NO SECOND COPY OF THE TRUTH ═══════════════════════════════════════════════
       The law this whole suite exists for: four faces, one understanding. If the confidence a
       surface reports were its own rather than the kernel's, two faces could drift apart without
       anything failing. */
    console.log('\n  5 — ONE UNDERSTANDING, NOT FOUR COPIES OF IT');
    ok('IC-5a every surface reporting a band for this question reports the SAME band',
      () => {
        const bands = new Set();
        if (groupInq.confidence) bands.add(String(groupInq.confidence.band));
        if (squadFace.band) bands.add(String(squadFace.band));
        if (((thread.present || {}).summary || {}).band) bands.add(String(thread.present.summary.band));
        return bands.size === 1;
      });
    ok('IC-5b …and the explanation\'s standing is reported the same way wherever it appears',
      () => {
        const standings = new Set();
        standings.add(String((groupInq.hypothesisStanding || {}).band));
        for (const e of (squadFace.explanations || [])) {
          if (/reluctant to criticise/i.test(String(e.statement))) standings.add(String(e.band));
        }
        const pe = ((thread.present || {}).summary || {}).possibleExplanation;
        if (pe) standings.add(String(pe.band));
        return standings.size === 1 && standings.has('tentative');
      });
    ok('IC-5c …and the outcome is stored once, by the group\'s owner, rather than copied per surface',
      () => {
        const inStore = (state.history || []).filter(f => f.focusId === focusId && f.outcome).length;
        return inStore === 1;
      });

  } catch (e) { fail++; console.error('  FAIL continuity suite threw:', e && e.stack); }

  server.close();
  console.log(`\nintelligence-continuity-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
