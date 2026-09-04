/* Truth layer — WHAT SOMEBODY SAYS ON DAY ONE IS EVIDENCE, NOT A FORM.

   Founder, September 2026, asked what onboarding should do: "I think have a baseline at the start
   and ask then throughout keep asking when there's gaps isn't that the app?"

   THE TEST THAT DECIDES WHETHER THIS FEATURE EXISTS: does an answer become EVIDENCE — with an
   origin, a direction and a date — or does it become a profile field? A profile field is a form.
   Evidence is the product working. Before this, all seven answers landed in memberGoals[key] as
   strings that no law in the product could read: the kernel began every account from nothing and
   spent a month rebuilding what had already been typed on the first screen.

   THE BASELINE QUESTION is the new one and the important one. Every law here is self-relative —
   it reflects a person against THEIR OWN normal, never against a score and never against each
   other. Without an answer to "when you are not at your best, what does that usually look like?"
   there is no normal to be relative to.

   FOUR RULES KEEP IT HONEST, and this suite exists to hold each one:

     1. ONE PERSON IS ONE ORIGIN. Five boxes filled in is five signals and one origin, so
        onboarding alone can NEVER produce a High or a Low — the gate is two independent origins.
        A starting point, never a verdict.

     2. NO DIRECTION, EVER. Direction says which way something is MOVING and that needs two points
        in time. Onboarding is the first point. So "what would you like to improve?" is NOT filed
        as a decline and "what are your strengths?" is NOT filed as an improvement — reading the
        question as a direction is the classifier arriving through the one door built to keep it
        out.

     3. THE MAIN GOAL IS A FOCUS. It is not an account of the person, it is a thing they want to
        do, and the product has an object for exactly that.

     4. IT HAPPENS ONCE. Re-running the form does not file a second account of the same day.

   Run: node scripts/onboarding-evidence-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const teamState = require('../ai/team-state.js');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, inquiryStates, _getMemory, memberGoals } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'onb';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'A Club', orgMode: 'sports' } },
  orgUsers: { [C]: {
    p1: { id: 'p1', name: 'Player One', email: 'p1@x.io', role: 'member', orgCode: C, status: 'active' },
    p2: { id: 'p2', name: 'Player Two', email: 'p2@x.io', role: 'member', orgCode: C, status: 'active' },
    p3: { id: 'p3', name: 'Player Three', email: 'p3@x.io', role: 'member', orgCode: C, status: 'active' },
    p4: { id: 'p4', name: 'Player Four', email: 'p4@x.io', role: 'member', orgCode: C, status: 'active' },
  } },
});
_rebuildEmailIndex();

const FULL = {
  mainGoals:        'Start every league game this season',
  longTermGoals:    'Captain a side and coach after I stop playing',
  strengths:        'I read the game early and I keep talking when it is going badly',
  improvementAreas: 'I want to get better at holding my shape when I am tired',
  baseline:         'I go quiet, I stop asking questions, and I switch off between drills',
  selectedValues:   ['honesty'],
  personalMetrics:  ['Confidence'],
  freeText:         'I respond better to being told early than being told kindly',
};

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = t => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const get  = (u, t) => fetch(base + u, { headers: H(t) }).then(r => r.json());
  const post = (u, t, b) => fetch(base + u, { method: 'POST', headers: H(t), body: JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  const p1T = issueToken('p1', C, 'member');
  const p2T = issueToken('p2', C, 'member');
  const p3T = issueToken('p3', C, 'member');
  const p4T = issueToken('p4', C, 'member');
  const mine = id => Object.values((inquiryStates[C] || {})[`member:${id}`] || {});

  try {
    const done = await post('/api/auth/complete-profile', p1T, FULL);
    ok('OE1 onboarding finishes as it always did', done.status === 200 && done.j.ok === true);

    /* ── OE2: THE WHOLE POINT. The answers are on the record as evidence, not only in a profile
       blob. This is the assertion that separates a form from the product working. ── */
    const inqs = mine('p1');
    const byConcept = c => inqs.find(i => (i.topic || {}).canonicalConcept === c);
    const imp = byConcept('self_account.improvement');
    const str = byConcept('self_account.strengths');
    ok('OE2 what somebody says about themselves on day one becomes EVIDENCE — beliefs on their own record, not seven strings nothing can read',
      inqs.length >= 4 && inqs.every(i => (i.signals || []).length >= 1));
    ok('OE2b …and the server says how many, so the client can tell them rather than leaving them to find out',
      done.j.evidenced >= 4 && Array.isArray(done.j.inquiryIds) && done.j.inquiryIds.length === done.j.evidenced);

    /* ── OE3: THE BASELINE. The one every self-relative law in the product needs. ── */
    const bl = inqs.find(i => (i.topic || {}).canonicalConcept === 'self_account.baseline');
    ok('OE3 THE BASELINE IS RECORDED — every law here compares a person to their own normal, and without this there is no normal to be relative to',
      !!bl && (bl.signals || []).length === 1);
    ok('OE3b …in their own words, dated, and as a direct first-hand account of themselves',
      bl && bl.signals[0].directness === 'direct' && bl.signals[0].authority === 'self_report' &&
      bl.signals[0].source === 'self' && typeof bl.signals[0].at === 'number');

    /* ── OE4: ONE PERSON IS ONE ORIGIN, and the consequence — onboarding cannot call anything. ── */
    const origins = new Set(inqs.flatMap(i => (i.signals || []).map(s => s.originRef)));
    ok('OE4 five boxes filled in is FIVE SIGNALS AND ONE ORIGIN — the same rule that stops anybody talking a belief into a Low by repetition',
      origins.size === 1 && [...origins][0] === 'self:p1');
    ok('OE4b …and one sitting is ONE TELLING, so confidence cannot read five answers given at once as five occasions',
      new Set(inqs.flatMap(i => (i.signals || []).map(s => s.turnId))).size === 1);
    /* OE5 — THE CLAIM STATED PROPERLY, and the first version of it was nearly hollow.

       "originsOf(i) < 2" is trivially true when each inquiry holds exactly one signal, and
       "polarity === 'neutral'" was already guaranteed by the no-direction rule rather than by the
       origins rule. Both would have passed with the origin gate deleted.

       The real property is that ONBOARDING EVIDENCE NEVER VOTES: it counts toward the record, but
       it declares no direction, so it can never be one of the two directed origins a call needs.
       Shown by building the call around it — one directed origin is still not enough WITH the
       onboarding signal sitting there, and the second one carries it. If onboarding voted, the
       first would already have been sufficient. */
    const { applyProposals } = require('../ai/diagnose.js');
    const impKey = Object.keys(inquiryStates[C]['member:p1'])
      .find(k => inquiryStates[C]['member:p1'][k].inquiryId === imp.inquiryId);
    const witness = (ref, n) => ({
      id: `w_${ref}_${n}`, level: 'observation', directness: 'direct', authority: 'third_party',
      source: 'other', specificity: 0.7, statement: 'watched it happen',
      originKind: 'leader_report', originRef: ref, turnId: `t_${ref}_${n}`, direction: 'decline',
    });
    let probe = applyProposals(inquiryStates[C]['member:p1'][impKey], [witness('leader:a', 1)],
      { now: Date.now(), evidenceRefOf: p => `${p.originRef}#${p.id}` });
    ok('OE5 ONBOARDING EVIDENCE NEVER VOTES — with one outside account declaring a direction, the belief is STILL not called, because the person\'s own day-one answer sitting beside it is not a second directed origin',
      teamState.evidenceValence(probe).polarity === 'neutral');
    probe = applyProposals(probe, [witness('leader:b', 1)],
      { now: Date.now(), evidenceRefOf: p => `${p.originRef}#${p.id}` });
    ok('OE5a …and the SECOND outside account is what carries it, which is what proves the line above is a real gate and not an inert belief that could never be called at all',
      teamState.evidenceValence(probe).polarity === 'friction' && teamState.originsOf(probe) >= 2);
    const objs = (await get('/api/objects?kind=high&scope=all', p1T)).objects || [];
    const lowObjs = (await get('/api/objects?kind=low&scope=all', p1T)).objects || [];
    ok('OE5b …and nothing surfaces to them as a High or a Low on the strength of it',
      objs.length === 0 && lowObjs.length === 0);

    /* ── OE6: NO DIRECTION. The rule the whole product is built on, at the one place where the
       question shape makes it tempting to break. ── */
    ok('OE6 "what would you like to improve?" is NOT filed as a decline — an area somebody wants to get better at is not a thing getting worse',
      imp && imp.signals.every(s => s.direction === 'neutral'));
    ok('OE6b …and "what are your strengths?" is NOT filed as an improvement — the question is not a direction any more than the wording is',
      str && str.signals.every(s => s.direction === 'neutral'));
    ok('OE6c …nothing from onboarding carries a direction at all, because direction needs two points in time and this is the first one',
      inqs.every(i => (i.signals || []).every(s => s.direction === 'neutral')));

    /* ── OE7: the words themselves are not read for meaning. The strongest possible wording still
       carries nothing, which is the same assertion coach-observation makes about a coach. ── */
    const loud = await post('/api/auth/complete-profile', p2T, {
      ...FULL, improvementAreas: 'terrible, awful, catastrophic, I am getting worse every week',
    });
    ok('OE7 the strongest possible wording still carries NO direction — the classifier does not come back through the onboarding form either',
      loud.status === 200 && mine('p2').every(i => (i.signals || []).every(s => s.direction === 'neutral')));

    /* ── OE8: THE MAIN GOAL IS A FOCUS. Not an account of the person — a thing they want to do. ── */
    ok('OE8 the main goal opens as a REAL FOCUS, because that is the object this product has for a thing somebody is working towards',
      !!done.j.focus && /Start every league game/.test(done.j.focus.text || ''));
    const focuses = (_getMemory(C, 'p1').focuses || []);
    ok('OE8b …it is a genuine focus in their own space, private, and theirs',
      focuses.some(f => f.id === done.j.focus.id && f.status === 'active' &&
        f.visibility === 'private' && (f.participants || []).includes('p1')));
    const seen = ((await get('/api/objects?kind=focus&scope=all', p1T)).objects || []);
    ok('OE8c …AND IT REACHES THEIR SCREEN — a focus nobody can see is the same defect as evidence nothing can read',
      seen.some(o => /Start every league game/.test((o.present || {}).summary?.title || '')));
    ok('OE8d …with no target and no review date invented for them — they were not asked, and focus_stalled fires off that date',
      !focuses.find(f => f.id === done.j.focus.id).reviewAt &&
      !focuses.find(f => f.id === done.j.focus.id).target);
    /* OE8e — ADDED BECAUSE A MUTATION BIT NOTHING. Deleting _beginFocusAction left every
       assertion here green: the buckets read mem.focuses, so a focus can reach the screen while
       existing nowhere the outcome ledger can find it. _completeFocusAction looks the action up
       BY focusRef, so without this the day somebody says whether it helped there is nothing to
       record it against — which is the exact question the whole Highs and Lows machinery
       downstream is waiting on. */
    ok('OE8e …and it is in the actions ledger under its own ref, so the day they say whether it helped there is something to record that against',
      (S.actionsLog[C] || []).some(a => a && a.focusRef === done.j.focus.id && a.stage === 'observe'));

    /* ── OE9: SHORT ANSWERS ARE NOT ACCOUNTS. "n/a" is how people get past a required field. ── */
    const thin = await post('/api/auth/complete-profile', p3T, {
      mainGoals: 'Play more', selectedValues: ['honesty'],
      strengths: 'n/a', improvementAreas: 'ok', baseline: '', longTermGoals: '', freeText: '-',
    });
    ok('OE9 "n/a" and "ok" are dropped rather than recorded — a record full of them is a record people stop reading',
      thin.status === 200 && thin.j.evidenced === 0 && mine('p3').length === 0);
    ok('OE9b …and the rest of onboarding still completes, because a thin answer is not a failure to be blocked on',
      thin.j.ok === true && !!thin.j.focus);

    /* ── OE10: IT HAPPENS ONCE. ── */
    const before = mine('p1').flatMap(i => i.signals || []).length;
    const again = await post('/api/auth/complete-profile', p1T, FULL);
    const after = mine('p1').flatMap(i => i.signals || []).length;
    ok('OE10 re-running the form does not file a second account of the same day',
      again.status === 200 && after === before && again.j.evidenced === 0);
    ok('OE10b …and does not open the same goal as a second focus either',
      (_getMemory(C, 'p1').focuses || []).filter(f => /Start every league game/.test(f.text)).length === 1);
    /* OE10d — ADDED BECAUSE A MUTATION BIT NOTHING. Deleting the duplicate-focus guard changed no
       answer the suite could produce: the first-time guard already stops the goal block running
       twice, so the dedup sat on an unreachable path and could have been removed without a single
       assertion noticing. It IS reachable — nothing stops somebody setting a focus before they
       finish onboarding, and typing the same words into the goal box is the obvious way to get
       there. A list with the same commitment on it twice is a list people stop trusting. */
    const SAME = 'Get back to full training by December';
    await post('/api/me/focus', p4T, { text: SAME });
    const p4done = await post('/api/auth/complete-profile', p4T, { ...FULL, mainGoals: SAME });
    ok('OE10d somebody who set a focus BEFORE finishing onboarding, then typed the same words as their goal, gets ONE focus and not two',
      p4done.status === 200 &&
      (_getMemory(C, 'p4').focuses || []).filter(f => f.text === SAME && f.status === 'active').length === 1);

    const repair = await post('/api/auth/complete-profile', p1T, { repair: true });
    ok('OE10c …and the login repair path is untouched by any of this — it re-affirms completion and writes nothing',
      repair.status === 200 && mine('p1').flatMap(i => i.signals || []).length === before);

    /* ── OE11: the profile fields still work. Nothing downstream was traded for this. ── */
    const g = memberGoals[`${C}:p1`] || {};
    ok('OE11 the profile the assistant already reasons from is unchanged — evidence was ADDED, nothing was swapped out from under 48 call sites',
      g.goal === FULL.mainGoals && g.strengths === FULL.strengths && g.baseline === FULL.baseline);

    /* ── OE12: THE CALL SITE. A question nobody is asked is not a baseline. ── */
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
    ok('OE12 the baseline question is actually ASKED — the route reading it is worth nothing if no screen puts the question in front of anybody',
      /key:\s*'baseline'/.test(src) && /When you are not at your best/.test(src));
    ok('OE12b …and the answer is carried in the payload the form sends, not collected and dropped',
      /baseline:\s*''/.test(src));
    /* OE12c — the bug this suite created and caught. `_ob.step = 4` sent somebody back to the
       missing-values question by NUMBER; inserting the baseline step moved values to 5, so the
       form would have rejected them and reopened the wrong question. A hard-coded index reads as
       the form being broken rather than as an off-by-one. */
    ok('OE12c the form finds a step by KEY, not by a hard-coded number that the next inserted question silently breaks',
      /OB_STEPS\.findIndex\(s => s\.key === k\)/.test(src) && !/_ob\.step = !hasGoal \? 0 : 4/.test(src));
    ok('OE13 and they are TOLD what happened to what they typed — once, at sign-up, which is the founder\'s rule for explaining how this works',
      /Nothing is scored/.test(src) && /_ob\.landed/.test(src));

  } catch (e) { fail++; console.error('  FAIL suite threw:', e && e.stack); }

  server.close();
  console.log(`\nonboarding-evidence-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
