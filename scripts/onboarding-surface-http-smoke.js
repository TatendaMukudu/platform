/* Truth layer — THE ONBOARDING FORM IS EVIDENCE, NOT FIVE OPEN QUESTIONS.

   LIVE iPHONE BLOCKER (findings R1 #36). The founder's Inquiry list read as a profile
   questionnaire about a third person:

       What they say they bring
       What it looks like when they are not at their best
       Where they are trying to get to
       Where they want to get better
       What else they wanted known

   Those are not stray legacy cards left behind by an old build. They are REAL inquiries, one per
   onboarding answer, created by `POST /api/auth/complete-profile` — and creating them is right.
   It is the reason the kernel does not spend a month rebuilding what somebody typed on day one.

   WHAT IS WRONG IS WHERE THEY ARE SHOWN, and the product's own rules say why. An Inquiry is one
   question being worked through. Five answers given in one sitting are ONE ORIGIN — that is the
   same rule that stops a player talking a belief into a Low by repetition — and a standing needs
   two independent origins. So every one of these is permanently below the line by construction,
   ranked in among questions that are not, in the third person, about the person reading them.

   SO THIS FILE ASSERTS A SPLIT, IN BOTH DIRECTIONS, because either half alone is a different bug:

     the record keeps them            (A, F)   hiding the evidence would be the opposite failure
     the question list does not       (B)      the founder's screen
     and what the form really opened is still there  (C)
     and anything beyond the form brings it back     (D, E)

   THE SECOND HALF IS THE ONE THAT MATTERS. A reader that hid these forever would be an exclusion
   list, and an exclusion list is how a product quietly stops showing somebody their own record.
   The predicate is "the only thing on this is that one form", so it stops holding the moment
   anything else touches the concept.

   Run: node scripts/onboarding-surface-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, inquiryStates } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'obs';
_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: {
    /* `profileComplete` DELIBERATELY UNSET. The route files the answers as evidence only the
       first time through, so a fixture that arrived already complete would walk the branch this
       whole file is about and prove nothing. */
    p1: { id: 'p1', name: 'Player One', email: 'p1@ob.io', role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['n'] },
    coach: { id: 'coach', name: 'Dana Coach', email: 'c@ob.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['n'], assignedNodeIds: ['n'], profileComplete: true },
  } },
  orgNodes: { [C]: { n: { nodeId: 'n', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: ['p1', 'coach'], leaderIds: ['coach'] } } },
});
_rebuildEmailIndex();

/* THE FIVE ANSWERS, long enough to clear the route's own "short answers are not accounts" floor.
   These are the shapes the labels were written for, so what comes back is what a real person's
   first day actually produces. */
const FORM = {
  mainGoals: 'Play in the first team next season',
  selectedValues: ['honesty'],
  strengths: 'I bring a lot of energy to training every single day',
  improvementAreas: 'I want to get better at defending set pieces',
  longTermGoals: 'I want to be captain of this team one day',
  baseline: 'When I am not at my best I go quiet and stop talking',
  freeText: 'I also help organise the kit on matchdays',
};

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = (who, role) => ({ Authorization: `Bearer ${issueToken(who, C, role)}`,
    'Content-Type': 'application/json' });
  const call = (m, u, b, who = 'p1', role = 'member') => fetch(base + u, { method: m, headers: H(who, role),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const titlesOf = async (kind) => {
    const r = await call('GET', `/api/objects?kind=${kind}&scope=all`);
    return ((r.j || {}).objects || []).map(o =>
      String(((o.present || {}).summary || {}).title || (o.explained || {}).headline || ''));
  };
  const LEGACY = /what they say they bring|not at their best|trying to get to|want to get better|what else they wanted known/i;

  try {
    console.log('\n  A — THE FORM IS FILED AS EVIDENCE, EXACTLY AS BEFORE');
    const done = await call('POST', '/api/auth/complete-profile', FORM);
    ok('OS-A1 onboarding is accepted', done.status === 200 && (done.j || {}).ok === true);
    ok('OS-A2 …and five accounts are recorded, which is what the person is then told',
      (done.j || {}).evidenced === 5);
    const mine = (inquiryStates[C] || {})['member:p1'] || {};
    ok('OS-A3 …and the record holds them as real inquiries the kernel can read',
      Object.values(mine).filter(i => /^self_account\./.test(String((i.topic || {}).canonicalConcept || '')))
        .length === 5);
    /* THE CONDITION THAT MAKES THIS A SURFACE QUESTION AND NOT A RECORD ONE: one origin, one
       sitting. Asserted rather than assumed, because if the route ever filed these as two origins
       they would be genuine questions and hiding them would be wrong. */
    ok('OS-A4 …all from one origin in one sitting, which is why none of them can cross on its own',
      Object.values(mine).filter(i => (i.signals || []).length)
        .every(i => new Set((i.signals || []).map(s => s.originRef)).size === 1
          && new Set((i.signals || []).map(s => s.turnId)).size === 1));

    console.log('\n  B — AND THE QUESTION LIST IS NOT A QUESTIONNAIRE');
    const inqTitles = await titlesOf('inquiry');
    ok('OS-B1 the person\'s Inquiry list does not open on five form fields',
      !inqTitles.some(t => LEGACY.test(t)));
    ok('OS-B2 …and the label written about a third person reaches no object surface at all',
      !inqTitles.length || !inqTitles.some(t => /\bthey\b/i.test(t)));
    /* AND NOT BY BEING UNREACHABLE EVERYWHERE. The thread route resolves through the same bucket,
       so a card that is not listed is also not openable — which is correct here and worth
       pinning, because the alternative is a link somewhere else that now 404s silently. */
    const anyId = Object.values(mine).find(i => /^self_account\./.test(String((i.topic || {}).canonicalConcept || '')));
    const thread = await call('GET', `/api/objects/inquiry/${encodeURIComponent(anyId.inquiryId)}/thread?scope=self`);
    ok('OS-B3 …and one is not half-hidden: no card, and no thread behind it either',
      thread.status === 404 || !(thread.j || {}).ok);

    console.log('\n  C — WHAT THE FORM REALLY OPENED IS STILL THERE');
    /* THE NEAREST WAY TO GET THIS WRONG. The main goal is not an account of the person, it is a
       thing they said they would do — so it becomes a Focus, which is the object built for
       exactly that, and it must survive a change aimed at the five that are not. */
    const focusTitles = await titlesOf('focus');
    ok('OS-C1 the goal they typed is a Focus they can see',
      focusTitles.some(t => /first team/i.test(t)));

    console.log('\n  D — AND ANYTHING BEYOND THE FORM BRINGS IT BACK');
    /* A SECOND ORIGIN, WRITTEN INTO THE CANONICAL STORE. The assertion here is about the READER,
       not about any particular writer — what must be true is that the moment this inquiry rests
       on more than that one sitting, it is a question like any other. Written at the store so the
       test does not depend on which of several real paths happens to deliver the second account. */
    const target = Object.values(mine).find(i => (i.topic || {}).canonicalConcept === 'self_account.improvement');
    target.signals.push({ kind: 'observation', status: 'active', ref: 'ev_coach_1',
      originRef: 'coach:coach', source: 'coach:coach', at: Date.now(), turnId: 't_coach_1',
      directness: 'direct', authority: 'corroborated', specificity: 0.7,
      statement: 'Struggled to clear the first set piece in each of the last two sessions' });
    const after = await titlesOf('inquiry');
    ok('OS-D1 once a second origin has spoken, the question is listed like any other',
      after.some(t => /want to get better/i.test(t)));
    ok('OS-D2 …and only that one — the other four are still nothing but the form',
      after.filter(t => LEGACY.test(t)).length === 1);

    console.log('\n  E — AND SO DOES DELIBERATELY OPENING ONE');
    /* THE OTHER DOOR, and the reason the guard is written as "never opened AND only the form".
       `openedBy` is set by the governed confirmation path; a person who asked for this question to
       exist is owed the question. */
    const other = Object.values(mine).find(i => (i.topic || {}).canonicalConcept === 'self_account.long_term');
    other.openedBy = 'p1';
    const after2 = await titlesOf('inquiry');
    ok('OS-E1 an inquiry somebody deliberately opened is listed even with only the form on it',
      after2.some(t => /trying to get to/i.test(t)));

    console.log('\n  F — AND NOTHING WAS TAKEN OFF THE RECORD TO ACHIEVE ANY OF IT');
    /* THE OPPOSITE FAILURE, asserted last because it is the one a reader of this change will
       worry about. The store is untouched: the kernel, the grounding retrieval and the composer
       all read it directly, so what a person said on day one is still available to IntelliQ. */
    const still = (inquiryStates[C] || {})['member:p1'] || {};
    ok('OS-F1 all five accounts are still on the record after every read above',
      Object.values(still).filter(i => /^self_account\./.test(String((i.topic || {}).canonicalConcept || '')))
        .length === 5);
    ok('OS-F2 …with their signals intact',
      Object.values(still).filter(i => /^self_account\./.test(String((i.topic || {}).canonicalConcept || '')))
        .every(i => (i.signals || []).length >= 1));
    /* AND THE PATH THAT FEEDS THE MODEL READS THAT STORE, NOT THIS INDEX. Source-level and said
       so: it is the half that cannot be driven here, because with models off the composer is
       never called. Anchored on the assignment itself rather than on nearby prose. */
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
    const comp = src.slice(src.indexOf('const contextText = composer.buildContext(') - 4000,
      src.indexOf('const contextText = composer.buildContext('));
    ok('OS-F3 …and the composer reads the inquiry store directly, so hiding a card hides nothing from IntelliQ',
      /const mine = \(inquiryStates\[code\] \|\| \{\}\)\[`member:\$\{userId\}`\]/.test(comp));

  } catch (e) { fail++; console.error('  FAIL onboarding-surface suite threw:', e && e.stack); }

  server.close();
  console.log(`\nonboarding-surface-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
