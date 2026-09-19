/* Truth layer — WHAT YOU SAID ON DAY ONE IS REMEMBERED, AND IT IS NOT A VERDICT.

   Onboarding is the first thing anybody tells IntelliQ about themselves, and it can fail in two
   opposite directions. It can become DEAD CONFIGURATION — seven fields nothing ever reads, so the
   kernel starts from nothing and spends a month rebuilding what was typed on day one. Or it can
   become TOO TRUE — a person writes "my biggest strength is leadership" and the product later
   reports that they are a strong leader, on the authority of their own form.

   The repository already takes the first problem seriously: `POST /api/auth/complete-profile`
   files the answers as real evidence under four rules it states out loud — one person is one
   origin, no direction ever, one concept per question, and short answers are not accounts. This
   suite is not a repair of that. It is the assertion that the SECOND failure cannot happen, plus
   the two questions the founder named that the existing code does not answer on its own:

     · does a declared goal stay a goal when the person CHANGES it, or does the old one linger and
       masquerade as current;
     · does anything a person said privately about themselves reach their coach.

   THE EPISTEMIC SHAPE, which is the whole point:

       "I want to communicate better"          a declared goal. A desired B. Not a deficiency.
       "I struggle after mistakes"             an attributed first-person account. Theirs, at
                                               their own standing, one origin.
       "My biggest strength is leadership"     a self-description. Never a finding about them.

   Run: node scripts/onboarding-intelligence-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, inquiryStates, memberGoals } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'onb';
const users = {
  coach: { id: 'coach', name: 'Coach', email: 'c@onb.io', role: 'coach', orgCode: C,
    status: 'active', leadershipNodeIds: ['first'], assignedNodeIds: ['first'], profileComplete: true },
  mateo: { id: 'mateo', name: 'Mateo', email: 'm@onb.io', role: 'member', orgCode: C,
    status: 'active', assignedNodeIds: ['first'] },   // profileComplete deliberately unset
};
_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: users },
  orgNodes: { [C]: { first: { nodeId: 'first', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: ['mateo', 'coach'], leaderIds: ['coach'] } } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = who => ({ Authorization: `Bearer ${issueToken(who, C, who === 'coach' ? 'coach' : 'member')}`,
                      'Content-Type': 'application/json' });
  const call = (m, u, b, who) => fetch(base + u, { method: m, headers: H(who),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const mine = () => Object.values((inquiryStates[C] || {})['member:mateo'] || {});
  const say = (text, who) => call('POST', '/api/assistant/turn', { text }, who)
    .then(r => String((((r.j || {}).response) || {}).responseText || ''));

  try {
    /* ══ A — THE FORM, FILLED IN HONESTLY ══════════════════════════════════════════════════ */
    console.log('\n  A — A PLAYER TELLS INTELLIQ WHO THEY ARE');
    const done = await call('POST', '/api/auth/complete-profile', {
      mainGoals:        'Recover faster after I make a mistake in a match',
      longTermGoals:    'Become a player the younger lads look to when it is going badly',
      strengths:        'I think my biggest strength is leadership and talking to people',
      improvementAreas: 'I go quiet for a long time after I give the ball away',
      baseline:         'When I am not at my best I stop asking for the ball at all',
      selectedValues:   ['Honesty'],
      freeText:         'I have been at the club since I was fourteen years old',
    }, 'mateo');
    ok('ON-A1 the profile is accepted', done.status === 200);
    ok('ON-A2 …and what they said is on the record rather than in a form nobody reads',
      mine().length >= 3);
    ok('ON-A3 …with the MAIN GOAL becoming a focus, because a thing you want to do is a commitment',
      () => {
        const objs = S._allObjectsFor(C, 'mateo') || [];
        return objs.some(o => o.kind === 'focus'
          && /recover faster after i make a mistake/i.test(String((o.raw && o.raw.text) || '')));
      });

    /* ══ B — AND IT IS ONE PERSON'S ACCOUNT, NOT FIVE ══════════════════════════════════════
       Five boxes in one sitting is five signals and ONE origin. This is the rule that stops a
       form talking itself into a finding, and it is the same rule that stops a player repeating
       a belief into a Low. */
    console.log('\n  B — FIVE ANSWERS ARE ONE PERSON AND ONE OCCASION');
    const origins = new Set();
    const occasions = new Set();
    for (const inq of mine()) for (const s of (inq.signals || [])) {
      if (s.originRef) origins.add(s.originRef);
      if (s.turnId) occasions.add(s.turnId);
    }
    ok('ON-B1 every answer traces to the one person who gave it', origins.size === 1);
    ok('ON-B2 …and to the one sitting they gave it in', occasions.size === 1);
    ok('ON-B3 …so nothing reaches the two independent origins a group finding needs',
      mine().every(i => ((i.confidence || {}).origin || {}).independentOrigins <= 1
                     || (i.confidence || {}).band === 'tentative'));

    /* ══ C — A SELF-DESCRIPTION IS NOT A FINDING ═══════════════════════════════════════════ */
    console.log('\n  C — "MY STRENGTH IS LEADERSHIP" IS SOMETHING THEY SAID, NOT SOMETHING WE KNOW');
    const objs = () => S._allObjectsFor(C, 'mateo') || [];
    ok('ON-C1 no High was minted from them describing their own strength',
      !objs().some(o => o.kind === 'high' && /leadership/i.test(
        String((o.explained && o.explained.headline) || (o.raw && o.raw.text) || ''))));
    ok('ON-C2 …and no Low was minted from them naming what they want to improve',
      !objs().some(o => o.kind === 'low' && /go quiet|give the ball away/i.test(
        String((o.explained && o.explained.headline) || (o.raw && o.raw.text) || ''))));
    /* DIRECTION IS DECLARED, NEVER INFERRED. "What would you like to improve?" is not a decline
       and "what are your strengths?" is not an improvement; reading the QUESTION as a direction
       would be the classifier arriving through the one door built to keep it out. */
    ok('ON-C3 …because not one onboarding signal carries a direction at all',
      mine().every(i => (i.signals || []).every(s => !s.direction || s.direction === 'neutral')));
    ok('ON-C4 …and nothing claims to explain any of it',
      mine().every(i => (i.hypotheses || []).length === 0));

    /* ══ D — IT IS THEIRS ══════════════════════════════════════════════════════════════════
       The backdoor this section exists for: a private self-account becoming organisational
       intelligence by any indirect route. The product must reason over the admissible world
       rather than reason over everything and censor at the edge. */
    console.log('\n  D — AND THE COACH CANNOT READ IT, BY ANY ROUTE');
    const coachObjs = S._allObjectsFor(C, 'coach') || [];
    ok('ON-D1 none of it appears among the objects their coach can open',
      !coachObjs.some(o => /go quiet|give the ball away|since i was fourteen/i.test(JSON.stringify(o))));
    const squad = await call('GET', '/api/group/first/state', undefined, 'coach');
    ok('ON-D2 …nor anywhere on the squad surface',
      !/go quiet|give the ball away|since i was fourteen|biggest strength is leadership/i
        .test(JSON.stringify(squad.j || {})));
    const asked = await say('What do you know about Mateo?', 'coach');
    ok('ON-D3 …nor in an answer to a coach who asks about them directly',
      !/go quiet|give the ball away|since i was fourteen/i.test(asked));
    const group = await call('GET', '/api/group/first/inquiry', undefined, 'coach');
    ok('ON-D4 …and it opened no group inquiry, because one person is not a group',
      !/self_account/.test(JSON.stringify(group.j || {})));

    /* ══ E — AND IT REACHES THE PERSON'S OWN CONVERSATION ══════════════════════════════════
       The other half of the law. Private must not mean useless: the point of remembering what
       somebody said they wanted is that their own assistant knows it. */
    console.log('\n  E — WHILE THEIR OWN ASSISTANT DOES KNOW WHAT THEY SAID THEY WANTED');
    ok('ON-E1 their declared goal is on the record their own composer reads',
      () => {
        const g = memberGoals[C + ':mateo'] || {};
        return /recover faster/i.test(String(g.goal || g.mainGoals || ''));
      });
    ok('ON-E2 …and it is stored as a GOAL rather than as something observed about them',
      () => {
        const g = memberGoals[C + ':mateo'] || {};
        return !!g.goal && g.direction === undefined && g.confidence === undefined;
      });

    /* ══ F — PEOPLE CHANGE, AND THE OLD B MUST NOT LINGER ══════════════════════════════════
       The founder's rule: do not permanently anchor people to old onboarding statements. An
       identity somebody has replaced must not still be readable as their current one. */
    console.log('\n  F — THEY CHANGE THEIR MIND, AND THE OLD ANSWER STOPS BEING CURRENT');
    const beforeIdentity = (memberGoals[C + ':mateo'] || {}).identity;
    ok('ON-F1 the original long-term answer is what is current to begin with',
      /younger lads/i.test(String(beforeIdentity || '')));
    const upd = await call('POST', '/api/member/goals',
      { goal: 'Start every match in the first team', identity: 'A player who is trusted in the big games' }, 'mateo');
    ok('ON-F2 they can change it', upd.status === 200);
    const nowIdentity = (memberGoals[C + ':mateo'] || {}).identity;
    ok('ON-F3 …and the new one is current',
      /trusted in the big games/i.test(String(nowIdentity || '')));
    /* THE ASSERTION THAT MATTERS. Not "the new one exists" — "the old one is no longer current".
       A store that appended would satisfy the line above and still hand a stale B to every
       surface that reads the field. */
    ok('ON-F4 …and the old one is NOT still current, which is the half an append would pass',
      !/younger lads/i.test(String(nowIdentity || '')));
    ok('ON-F5 …and changing a goal did not quietly become a claim that they achieved the old one',
      mine().every(i => (i.hypotheses || []).length === 0)
      && !objs().some(o => o.kind === 'high' && /younger lads/i.test(JSON.stringify(o))));

  } catch (e) { fail++; console.error('  FAIL onboarding suite threw:', e && e.stack); }

  server.close();
  console.log(`\nonboarding-intelligence-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
