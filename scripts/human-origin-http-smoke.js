/* Truth layer — A HUMAN MAY START IT, AND STARTING IT PROVES ONLY THAT THEY DID.

   FOUNDER CREATION LAW: humans may initiate all four. Creating something does NOT mean IntelliQ
   has proven its empirical content true. What a contribution establishes is that this person said
   this, observed this, asked this or chose this — never that the organisation agrees, that the
   claim is true, that the cause is known, or that the intervention will work.

   So this suite starts three journeys deliberately, from a human, and then attacks the one thing
   that would quietly destroy the distinction: authority leaking into truth.

     A HUMAN-CREATED HIGH   five people say something is going well
     A HUMAN-CREATED LOW    five people say something needs attention
     A HUMAN-CREATED INQUIRY a coach says "create an inquiry into X" with NO model configured

   And then:

     a COACH — the most senior person who can reach any of these — offers a causal explanation,
     and it earns exactly what a player's would: nothing;
     a FOCUS is created, and its existence establishes the INTENTION without establishing that
     the intervention works;
     a person contributes the SAME thing twice, and it is one origin rather than two.

   Every one of those is a place where "who said it" could become "therefore it is true", and each
   is driven rather than argued.

   Candidate DETECTION is model-gated, so candidates are minted through the exported helper and
   this suite runs models-off otherwise. Everything after that is the product's own routes.

   Run: node scripts/human-origin-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken,
        groupCandidates, _noteGroupCandidates, inquiryStates } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'hum';
const SQUAD = Array.from({ length: 14 }, (_, i) => 'p' + (i + 1));
const users = { coach: { id: 'coach', name: 'Coach', email: 'c@hum.io', role: 'coach', orgCode: C,
  status: 'active', leadershipNodeIds: ['first'], assignedNodeIds: ['first'] } };
for (const id of SQUAD) users[id] = { id, name: id.toUpperCase(), email: `${id}@hum.io`,
  role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['first'] };

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: users },
  orgNodes: { [C]: { first: { nodeId: 'first', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: [...SQUAD, 'coach'], leaderIds: ['coach'] } } },
});
_rebuildEmailIndex();

/* TWO THINGS THE SQUAD NOTICED, pointing opposite ways. One becomes a High and one a Low, and
   which is which is the CONTRIBUTORS' call rather than a reading of their words. */
for (const id of SQUAD.slice(0, 5)) {
  /* Their OWN words carry the collective language. The kernel refuses group relevance without
     it — "claimed group relevance without collective language in their own words" — so a fixture
     that skips it is testing nothing, and a fixture that fakes it around the check is lying. */
  _noteGroupCandidates(C, id, `member:${id}`, [{ id: 'hg_' + id, level: 'observation',
    text: 'we talk much more in training lately',
    sourceSpan: 'we talk to each other a lot more in training now',
    concerns: 'group', originRef: 'og_' + id, originKind: 'direct_observation', turnId: 'tg_' + id }],
    'training_communication', 'Communication in training');
  _noteGroupCandidates(C, id, `member:${id}`, [{ id: 'hl_' + id, level: 'observation',
    text: 'substitutes do not know their role',
    sourceSpan: 'our subs do not know what we want from them',
    concerns: 'group', originRef: 'ol_' + id, originKind: 'direct_observation', turnId: 'tl_' + id }],
    'substitute_clarity', 'What substitutes are asked to do');
}

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = who => ({ Authorization: `Bearer ${issueToken(who, C, who === 'coach' ? 'coach' : 'member')}`,
                      'Content-Type': 'application/json' });
  const call = (m, u, b, who) => fetch(base + u, { method: m, headers: H(who),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const inquiries = who => call('GET', '/api/group/first/inquiry', undefined, who)
    .then(r => ((r.j || {}).inquiries) || []);
  const byConcept = async (who, concept) =>
    (await inquiries(who)).find(i => ((i.topic || {}).canonicalConcept) === concept) || {};

  try {
    /* ══ A — A HUMAN-CREATED HIGH ══════════════════════════════════════════════════════════ */
    console.log('\n  A — FIVE PEOPLE SAY SOMETHING IS GOING WELL');
    for (const id of SQUAD.slice(0, 5)) {
      const c = (groupCandidates[C] || []).find(x => x.contributorId === id && x.concept === 'training_communication' && x.status === 'detected');
      if (c) await call('POST', '/api/group/first/contribute', { candidateId: c.candidateId, valence: 'working_well' }, id);
    }
    const high = await byConcept('coach', 'training_communication');
    ok('HO-A1 a human-started HIGH exists, and it came from people saying which way it points',
      !!high.inquiryId && (high.polarity === 'strength' || high.polarity === 'high'));
    ok('HO-A2 …resting on five INDEPENDENT ORIGINS, counted as origins rather than as voices',
      high.independentOrigins === 5);
    const stateA = (await call('GET', '/api/group/first/state', undefined, 'coach')).j || {};
    ok('HO-A3 …and it surfaces to the squad as a High rather than as something worth attention',
      !!stateA.high && String(stateA.high.inquiryId) === String(high.inquiryId));

    console.log('\n  A2 — BUT IT IS NOT YET A PROVEN ORGANISATIONAL STRENGTH');
    ok('HO-A4 nothing claims to know WHY it is going well',
      high.hypothesis === null && (high.alternatives || []).length === 0);
    ok('HO-A5 …and the product says outright there is not enough to suggest anything worth trying',
      (high.readiness || {}).state === 'not_enough_evidence');
    ok('HO-A6 …and the band is the kernel\'s own, carrying the score it computed',
      (high.confidence || {}).band === 'supported' && typeof high.confidence.score === 'number');

    /* ══ A3 — AND THE BAND IS THE RECORD'S, NOT THE HEADCOUNT'S ═════════════════════════════
       A6 alone cannot tell those apart: with five contributors, "the kernel derived it" and
       "five people said so" both land on `supported`, so the assertion would hold under a
       mutation that simply counted voices. This is the case that separates them — five people,
       the same route, the same words, and only TWO independent origins between them, because
       three of them are relaying what the same two saw. A room agreeing with itself is the one
       thing the origin model exists to refuse to treat as corroboration. */
    console.log('\n  A3 — FIVE VOICES CARRYING TWO ORIGINS IS NOT FIVE ACCOUNTS');
    const ECHO = SQUAD.slice(5, 10);
    ECHO.forEach((id, i) => {
      _noteGroupCandidates(C, id, `member:${id}`, [{ id: 'he_' + id, level: 'observation',
        text: 'the warm-up is rushed',
        sourceSpan: 'our warm-up feels rushed to everybody',
        concerns: 'group',
        // Two origins across five tellings: p6 and p7 saw it; p8, p9 and p10 are relaying them.
        originRef: 'oe_' + (i < 2 ? i : i % 2), originKind: i < 2 ? 'direct_observation' : 'reported',
        turnId: 'te_' + id }], 'warm_up_rush', 'How the warm-up goes');
    });
    for (const id of ECHO) {
      const c = (groupCandidates[C] || []).find(x => x.contributorId === id && x.concept === 'warm_up_rush' && x.status === 'detected');
      if (c) await call('POST', '/api/group/first/contribute', { candidateId: c.candidateId, valence: 'worth_attention' }, id);
    }
    const echo = await byConcept('coach', 'warm_up_rush');
    ok('HO-A7 five people relaying two accounts is counted as the two accounts it is',
      !!echo.inquiryId && echo.independentOrigins === 2 && echo.contributors === 5);
    console.log('DBG high', JSON.stringify(high.confidence), '\n  DBG echo', JSON.stringify(echo.confidence),
      '\n  DBG echoOrigins', echo.independentOrigins, 'contrib', echo.contributors);
    /* A8 IS OVER-DETERMINED, AND THAT IS SAID OUT LOUD RATHER THAN LEFT TO BE DISCOVERED. Two
       terms in deriveConfidence each open this gap on their own — independence (5 origins against
       2) and directness (an account relayed is not an account made) — so neutralising either one
       alone leaves it standing, and only neutralising BOTH takes it out. That was driven, not
       assumed: independence:=1 alone passes, directness:=1 alone passes, the two together fail.
       So this asserts the product of the two laws, which is the thing a reader cares about, and
       A7 above is what pins the origin count on its own. */
    ok('HO-A8 …and it therefore stands BELOW the one five separate people saw, on identical headcount',
      typeof (echo.confidence || {}).score === 'number'
      && echo.confidence.score < high.confidence.score);

    /* ══ B — A HUMAN-CREATED LOW, THE SAME PATH POINTING THE OTHER WAY ══════════════════════ */
    console.log('\n  B — AND FIVE PEOPLE SAY SOMETHING ELSE NEEDS ATTENTION');
    for (const id of SQUAD.slice(0, 5)) {
      const c = (groupCandidates[C] || []).find(x => x.contributorId === id && x.concept === 'substitute_clarity' && x.status === 'detected');
      if (c) await call('POST', '/api/group/first/contribute', { candidateId: c.candidateId, valence: 'worth_attention' }, id);
    }
    const low = await byConcept('coach', 'substitute_clarity');
    ok('HO-B1 a human-started LOW exists, on the same machinery pointing the other way',
      !!low.inquiryId && (low.polarity === 'friction' || low.polarity === 'low'));
    /* THE POINT OF THE PAIR. The same five people, the same route, the same number of origins —
       and two OPPOSITE directions. Nothing separates these two cases except which word each
       contributor chose, so the polarities being opposite is the whole assertion; asserting only
       that two inquiries exist would pass with the direction read out of the wording. */
    ok('HO-B2 …and the SAME five people produced a High and a Low, so the direction came from them rather than from their words',
      high.inquiryId !== low.inquiryId && low.independentOrigins === 5
      && high.polarity !== low.polarity
      && (low.polarity === 'friction' || low.polarity === 'low')
      && (high.polarity === 'strength' || high.polarity === 'high'));

    /* ══ C — AUTHORITY IS NOT EVIDENCE ═════════════════════════════════════════════════════
       THE ATTACK. The coach is the most senior person who can reach this route, and what they
       offer is a CAUSAL claim. If rank bought standing anywhere, it would buy it here. */
    console.log('\n  C — A COACH OFFERS A CAUSAL EXPLANATION, AND IT EARNS NOTHING');
    const byCoach = await call('POST', `/api/group/first/inquiry/${low.inquiryId}/explanation`,
      { text: 'it is caused by poor leadership among the senior players' }, 'coach');
    ok('HO-C1 the coach\'s explanation is accepted as a candidate, like anybody\'s',
      byCoach.status === 200 && !!byCoach.j.explanation);
    ok('HO-C2 …at the band the kernel births one with, which is tentative and unsupported',
      byCoach.j.explanation.band === 'tentative' && byCoach.j.explanation.supportedBy === 0);
    ok('HO-C3 …and the INQUIRY\'s own confidence did not move because a coach spoke',
      byCoach.j.inquiryConfidence.unchanged === true);
    const lowAfter = await byConcept('coach', 'substitute_clarity');
    ok('HO-C4 …and it is not promoted to the group\'s finding by who said it',
      (lowAfter.hypothesisStanding || {}).supportedBy === 0
      && (lowAfter.hypothesisStanding || {}).band === 'tentative');
    const stateC = (await call('GET', '/api/group/first/state', undefined, 'coach')).j || {};
    const lowFace = [stateC.low, stateC.high, stateC.question].filter(Boolean)
      .find(f => String(f.inquiryId) === String(low.inquiryId));
    ok('HO-C5 …and the squad surface does not state the coach\'s causal claim as the finding',
      !lowFace || !/caused by poor leadership/i.test(String(lowFace.claim || '')));
    ok('HO-C6 …and the readiness answer stays "not enough", because a claim nobody has evidenced is not evidence',
      (lowAfter.readiness || {}).state === 'not_enough_evidence');

    console.log('\n  C2 — AND A PLAYER SAYING THE SAME THING EARNS THE SAME NOTHING');
    const byPlayer = await call('POST', `/api/group/first/inquiry/${low.inquiryId}/explanation`,
      { text: 'the rotation changes late and nobody is told' }, 'p3');
    ok('HO-C7 a member\'s explanation is accepted on exactly the same terms',
      byPlayer.status === 200 && byPlayer.j.explanation.band === 'tentative'
      && byPlayer.j.explanation.supportedBy === 0);
    const lowTwo = await byConcept('coach', 'substitute_clarity');
    ok('HO-C8 …both are kept, and the coach\'s does not outrank the player\'s by being the coach\'s',
      ((lowTwo.alternatives || []).length + (lowTwo.hypothesis ? 1 : 0)) === 2
      && (lowTwo.alternatives || []).every(a => a.band === 'tentative'));
    ok('HO-C9 …and with two competing and nothing separating them, the honest answer becomes LEARN MORE',
      (lowTwo.readiness || {}).state === 'gather_information');

    /* ══ D — REPETITION FROM ONE VOICE IS NOT CORROBORATION ════════════════════════════════
       The owner is `ai/diagnose.js` applyProposals, which finds an existing hypothesis by
       NORMALISED statement before minting one — so saying it again lands on the same object
       rather than beside it. That is the assertion, because it is the one that can break.

       What is NOT asserted here: that the inquiry's independentOrigins stayed put. It does stay
       put, but it would stay put anyway — an explanation is a hypothesis and never joins the
       observation origin count, so pinning that number would pass whether or not repetition were
       handled at all. Counted a second time, it would be a number that proves nothing. */
    console.log('\n  D — THE SAME PERSON SAYING IT AGAIN IS STILL ONE EXPLANATION');
    const explanationsBefore = (lowTwo.alternatives || []).length + (lowTwo.hypothesis ? 1 : 0);
    await call('POST', `/api/group/first/inquiry/${low.inquiryId}/explanation`,
      { text: 'it is caused by poor leadership among the senior players' }, 'coach');
    // And again in different clothes, because normalising is what stops a retyped sentence
    // becoming a second opinion that agrees with the first.
    await call('POST', `/api/group/first/inquiry/${low.inquiryId}/explanation`,
      { text: 'It is caused by poor leadership among the senior players.' }, 'coach');
    const lowAgain = await byConcept('coach', 'substitute_clarity');
    ok('HO-D1 saying it twice more does not become three explanations — it is the same one',
      ((lowAgain.alternatives || []).length + (lowAgain.hypothesis ? 1 : 0)) === explanationsBefore
      && explanationsBefore === 2);
    ok('HO-D2 …and does not give the repeated explanation any support it did not have',
      (lowAgain.hypothesisStanding || {}).supportedBy === 0
      && (lowAgain.hypothesisStanding || {}).band === 'tentative');
    ok('HO-D3 …so the group is no readier to act than before it was said three times',
      (lowAgain.readiness || {}).state === 'gather_information');

    /* ══ E — A FOCUS ESTABLISHES THE INTENTION, NOT THE EFFECT ═════════════════════════════
       The distinction the founder named: "we are trying X", "X may improve Y", "Y changed
       afterward" and "X caused Y" are four different statements. */
    console.log('\n  E — THE GROUP CHOOSES TO TRY SOMETHING');
    const made = await call('POST', '/api/group/first/focus',
      { text: 'Tell substitutes their role at the team talk, not on the touchline', fromInquiryId: low.inquiryId }, 'coach');
    const focusId = made.j.focus.focusId;
    ok('HO-E1 the focus exists because a leader chose it — that is what makes it true',
      made.status === 200 && made.j.focus.origin.by === 'coach');
    ok('HO-E2 …and it carries NO confidence band, because a commitment is not a belief',
      () => {
        const objs = (S._allObjectsFor(C, 'coach') || []).find(o => o.kind === 'focus' && String(o.id) === focusId);
        return !!objs && objs.explained && objs.explained.confidence === null;
      });
    const lowWithFocus = await byConcept('coach', 'substitute_clarity');
    ok('HO-E3 …and choosing to try it did NOT make the explanation it came from any better supported',
      (lowWithFocus.hypothesisStanding || {}).supportedBy === 0
      && (lowWithFocus.readiness || {}).state === 'gather_information');

    console.log('\n  E2 — AND THE OUTCOME IS WHAT FOLLOWED, NOT WHAT IT ACHIEVED');
    await call('POST', `/api/group/first/focus/${focusId}/outcome`, { result: 'better' }, 'coach');
    const lowClosed = await byConcept('coach', 'substitute_clarity');
    ok('HO-E4 the outcome is recorded against the question it was about',
      (lowClosed.triedBefore || []).some(t => t.focusId === focusId && t.outcome === 'better'));
    ok('HO-E5 …and STILL nothing supports the explanation, because an outcome is not a cause',
      (lowClosed.hypothesisStanding || {}).supportedBy === 0);
    ok('HO-E6 …and the product has not started recommending it as something that works',
      (lowClosed.readiness || {}).state === 'gather_information');

    /* ══ F — A HUMAN-CREATED INQUIRY, WITH NO MODEL ═══════════════════════════════════════ */
    console.log('\n  F — A COACH OPENS A QUESTION BY SAYING SO, WITH NO MODEL CONFIGURED');
    const turn = await call('POST', '/api/assistant/turn',
      { text: 'Create an Inquiry into why substitutes feel disconnected.' }, 'coach');
    const resp = (turn.j || {}).response || {};
    const iProp = (resp.proposedActions || []).find(a => a.actionType === 'create_inquiry');
    ok('HO-F1 the existing action is named from what they said, with no provider anywhere', !!iProp);
    /* Two halves, because either alone passes for the wrong reason. The store being empty is
       true of any turn that proposes nothing at all; the proposal carrying requiredApproval is
       the part that says this particular action is gated rather than merely slow to arrive. */
    const mineBefore = Object.keys((inquiryStates[C] || {})['member:coach'] || {}).length;
    ok('HO-F2 …it is offered as something to approve, and nothing is opened before they do',
      mineBefore === 0 && iProp.requiredApproval === true);
    const conf = await call('POST', `/api/assistant/turn/${turn.j.turnId}/confirm`, { proposalId: iProp.id }, 'coach');
    ok('HO-F3 confirming it opens the inquiry through the canonical owner',
      conf.status === 200 && conf.j.ok === true && conf.j.confirmed === 'create_inquiry');
    ok('HO-F4 …and it starts UNSETTLED, because asking a question establishes the question and nothing else',
      () => {
        const mine = Object.values((inquiryStates[C] || {})['member:coach'] || {});
        const opened = mine.find(i => /substitutes feel disconnected/i.test(
          String((i.topic && (i.topic.label || i.topic.canonicalConcept)) || '')));
        return !!opened && (opened.hypotheses || []).length === 0
          && (opened.confidence || {}).band !== 'supported';
      });
    ok('HO-F5 …and it is the COACH\'S OWN, not the group\'s, because one person asking is not the group asking',
      () => {
        const groupOnes = Object.values((inquiryStates[C] || {})['group:first'] || {});
        return !groupOnes.some(i => /substitutes feel disconnected/i.test(
          String((i.topic && (i.topic.label || i.topic.canonicalConcept)) || '')));
      });

  } catch (e) { fail++; console.error('  FAIL human-origin suite threw:', e && e.stack); }

  server.close();
  console.log(`\nhuman-origin-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
