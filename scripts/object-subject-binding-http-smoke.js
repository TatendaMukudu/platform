/* Truth layer — THE OBJECT YOU ARE STANDING IN IS THE SUBJECT OF THE CONVERSATION.

   Four live iPhone findings that turned out to be one surface, and one cause under three of them.

     #43  an Inquiry thread drifted onto the squad's draws and asked about the First Team group
     #44  "Does the record actually support that, or is that just a hypothesis?" got navigation copy
     #46  "What could we try?" declined, blamed an internal answer-length limit, then asked around it
     #48  the founder's own Inquiry still read "Where they are trying to get to"

   THE CAUSE, FOUND BY REPRODUCING #43 RATHER THAN BY READING THE SENTENCE. `_assistantAnswer` is an
   English-cue router — thirteen branches, not one of which looks at `opts.object` — and the bound
   object is consulted LAST, after free-text retrieval has dead-ended. Driven on the real route from
   Titi's own Inquiry:

     "How is the team doing?"     → the SQUAD's open question, no mention of the object
     "What should I focus on?"    → "First Team is working out many draws this season"

   Neither answer was about the thing on the screen, and neither said so. #44 and #46 are the same
   shape seen from the other side: a question ABOUT the bound object that no branch could answer,
   falling through to a description of it and then to a suggestion that the person ask something
   else.

   THE FOUNDER'S RULING IS THREE SENTENCES AND THE FIRST SECTION ASSERTS ALL THREE: the current
   object is the primary subject; related context may be consulted but must not SILENTLY replace
   it; a topic switch needs an explicit transition or a clearly signposted branch. So a question
   that names no other subject is answered about the object, with the wider reading OFFERED rather
   than withheld; and a question that names the team still gets the team, in a sentence that says
   which conversation it stepped out of.

   Run: node scripts/object-subject-binding-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, inquiryStates } = S;
const present = require('../ai/present.js');

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'osb', NOW = Date.now(), DAY = 86400000;
const SIG = (ref, who, at, text) => ({ kind: 'observation', status: 'active', source: who,
  originRef: `o_${ref}`, at, turnId: `t_${ref}`, directness: 'direct', authority: 'corroborated',
  specificity: 0.7, ref, contributedBy: who, text });

/* THE SQUAD'S SUBJECT, NAMED HERE so one assertion can prove it did not cross. */
const OTHER_TOPIC = /draw|equalis|settle for a point|ten minutes/i;

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: {
    titi: { id: 'titi', name: 'Titi Player', email: 't@osb.io', role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['ft'], profileComplete: true },
    p2: { id: 'p2', name: 'Second Player', email: 'p2@osb.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['ft'] },
    p3: { id: 'p3', name: 'Third Player', email: 'p3@osb.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['ft'] },
    coach: { id: 'coach', name: 'Head Coach', email: 'c@osb.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['ft'], assignedNodeIds: [] },
  } },
  orgNodes: { [C]: { ft: { nodeId: 'ft', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: ['titi', 'p2', 'p3'], leaderIds: ['coach'] } } },
  inquiryStates: { [C]: {
    'member:titi': {
      /* THE FOUNDER'S OWN OBJECT, under the label an account created before #48 still carries —
         so section D proves the reader carries it forward rather than proving a fresh write. */
      mine: {
        inquiryId: 'mine', subjectRef: 'member:titi', status: 'exploring', openedBy: 'titi',
        topic: { label: 'Where they are trying to get to', canonicalConcept: 'self_account.long_term' },
        hypotheses: [{ id: 'hm', statement: 'they want to start every week', supportRefs: ['evm1', 'evm2'],
          confidence: { score: 0.6, band: 'probable', because: ['their own account'] }, status: 'open' }],
        leadingHypothesisId: 'hm',
        signals: [SIG('evm1', 'titi', NOW - 6 * DAY, 'I want to be starting every week by the spring'),
          SIG('evm2', 'coach', NOW - 5 * DAY, 'they have said the same thing to me twice')],
        confidence: { score: 0.6, band: 'probable', because: ['their own account'] },
        missingSignals: [{ question: 'what would starting every week actually take?' }],
        falsifiers: [], timeline: [], lastUpdatedAt: NOW,
      },
      /* A QUESTION WITH A CANDIDATE NOBODY HAS BACKED — the middle state of #44, and the one a
         two-state answer collapses. */
      guess: {
        inquiryId: 'guess', subjectRef: 'member:titi', status: 'exploring', openedBy: 'titi',
        topic: { label: 'Slow starts', canonicalConcept: 'football.slow_starts' },
        hypotheses: [{ id: 'hg', statement: 'the warm-up is too short', supportRefs: [],
          confidence: { score: 0.2, band: 'tentative', because: ['nobody has backed it'] }, status: 'open' }],
        leadingHypothesisId: 'hg',
        signals: [SIG('evg', 'titi', NOW - 3 * DAY, 'we start games flat')],
        confidence: { score: 0.3, band: 'tentative', because: ['one account'] },
        missingSignals: [{ question: 'is it every game or only away?' }],
        falsifiers: [], timeline: [], lastUpdatedAt: NOW,
      },
      /* AND ONE WITH NO EXPLANATION AT ALL — "we do not know" is a state, not a gap. */
      bare: {
        inquiryId: 'bare', subjectRef: 'member:titi', status: 'exploring', openedBy: 'titi',
        topic: { label: 'Travel days', canonicalConcept: 'football.travel' },
        hypotheses: [], leadingHypothesisId: null,
        signals: [SIG('evb', 'titi', NOW - 2 * DAY, 'the coach trip is long')],
        confidence: { score: 0.2, band: 'tentative', because: ['one account'] },
        missingSignals: [], falsifiers: [], timeline: [], lastUpdatedAt: NOW,
      },
    },
    'group:ft': { draws: {
      inquiryId: 'draws', subjectRef: 'group:ft', status: 'exploring',
      topic: { label: 'Many draws this season', canonicalConcept: 'football.draws' },
      hypotheses: [{ id: 'hd', statement: 'we settle for a point too early', supportRefs: ['ev1', 'ev2', 'ev3'],
        confidence: { score: 0.7, band: 'probable', because: ['three accounts'] }, status: 'open' }],
      leadingHypothesisId: 'hd',
      signals: [SIG('ev1', 'titi', NOW - 5 * DAY, 'we sat back after equalising'),
        SIG('ev2', 'p2', NOW - 4 * DAY, 'the draws keep coming from dropping deep'),
        SIG('ev3', 'p3', NOW - 3 * DAY, 'we settle for a point too early')],
      confidence: { score: 0.7, band: 'probable', because: ['three independent accounts'] },
      missingSignals: [{ question: 'is it the same ten minutes every time?' }],
      falsifiers: [], timeline: [], lastUpdatedAt: NOW,
    } },
  } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { Authorization: `Bearer ${issueToken('titi', C, 'member')}`, 'Content-Type': 'application/json' };
  const call = (m, u, b) => fetch(base + u, { method: m, headers: H,
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const ask = async (text, id, conv) => {
    const r = await call('POST', '/api/assistant/turn',
      { text, about: { kind: 'inquiry', id }, ...(conv ? { conversationId: conv } : {}) });
    const resp = (r.j || {}).response || {};
    return { said: String(resp.responseText || ''), conv: (r.j || {}).conversationId || null,
      limits: [...((resp.qa || {}).limitations || []), ...(resp.limitations || [])] };
  };

  try {
    console.log('\n  A — A QUESTION THAT NAMES NO OTHER SUBJECT IS ABOUT THE OBJECT');
    /* THE EXACT QUESTION THAT RETURNED THE ATTENTION DIGEST. Its words match the priority cue and
       nothing else; on a thread about one question it can only mean that question. */
    const focusQ = await ask('What should I focus on?', 'mine');
    /* THE TITLE ALONE IS NOT ENOUGH, and a mutation proved it: the attention digest LISTS the
       person's objects, so it names this Inquiry while being an answer about everything they own.
       What has to be true is that the OBJECT'S OWN READ answered — its claim, its basis, and the
       sentence that only that reader writes. */
    ok('OS-A1 "what should I focus on?" inside an Inquiry answers about that Inquiry',
      /Where you are trying to get to/i.test(focusQ.said)
      && /That is what is on the record here, not a fresh reading of it/i.test(focusQ.said));
    ok('OS-A2 …and not about the squad\'s separate question',
      !OTHER_TOPIC.test(focusQ.said) && !/First Team/i.test(focusQ.said));
    /* THE WIDER READ IS OFFERED, NOT WITHHELD. Refusing the digest outright would trade one
       defect for another — "what should I focus on" across the whole record is a real question. */
    ok('OS-A3 …and the wider reading is offered rather than silently dropped',
      /across everything rather than this one/i.test(focusQ.said));
    const knowQ = await ask('What do you know about this?', 'mine');
    ok('OS-A4 an open question on the thread stays on the thread',
      /Where you are trying to get to/i.test(knowQ.said) && !OTHER_TOPIC.test(knowQ.said));

    console.log('\n  B — A QUESTION THAT NAMES ANOTHER SUBJECT IS ANSWERED, AND SAYS SO');
    const teamQ = await ask('How is the team doing?', 'mine');
    ok('OS-B1 naming the team still gets the team — this is not a ban on asking',
      OTHER_TOPIC.test(teamQ.said));
    /* THE SIGNPOST IS THE FOUNDER'S OWN WORD FOR IT: a switch must not be silent. */
    ok('OS-B2 …and the answer says which conversation it stepped out of, by name',
      /Stepping outside "Where you are trying to get to"/i.test(teamQ.said));
    ok('OS-B3 …and the machine-readable limitation says the same thing',
      teamQ.limits.some(l => /not about "Where you are trying to get to"/i.test(String(l))));

    console.log('\n  C — THE SUPPORT QUESTION IS ANSWERED, NOT DEFLECTED');
    /* THE FOUNDER'S OWN WORDING, asked SECOND in the same conversation — which is what made the
       live reply navigation copy: the object read repeated, and the repeat guard spoke instead. */
    const first = await ask('What do you make of this?', 'mine');
    const sup = await ask('Does the record actually support that, or is that just a hypothesis?', 'mine', first.conv);
    ok('OS-C1 a supported read is classified as supported, in the first clause',
      /^Supported/i.test(sup.said.trim()));
    ok('OS-C2 …and never with the navigation copy the live build answered with',
      !/same part of the record I just showed you/i.test(sup.said)
      && !/ask about something else/i.test(sup.said));
    ok('OS-C3 …and says what it rests on rather than only asserting the verdict',
      /rests on|built from/i.test(sup.said));
    ok('OS-C4 …and does not overclaim: a supported reading is not proof',
      /not proof/i.test(sup.said));
    const g1 = await ask('What do you make of this?', 'guess');
    const gsup = await ask('Is that actually supported or just a theory?', 'guess', g1.conv);
    ok('OS-C5 an unbacked candidate is called a hypothesis, and the person is told whose it is',
      /^Just a hypothesis/i.test(gsup.said.trim())
      && /Somebody offered "the warm-up is too short"/i.test(gsup.said));
    ok('OS-C6 …and the accounts are not misreported as support for it',
      /nothing on the record supports it yet/i.test(gsup.said));
    const b1 = await ask('What do you make of this?', 'bare');
    const bsup = await ask('Do we actually know that, or is it a guess?', 'bare', b1.conv);
    ok('OS-C7 with no explanation offered at all, neither verdict is claimed',
      /^Neither/i.test(bsup.said.trim()) && /nothing to support or rule out/i.test(bsup.said));
    /* THREE RECORDS, THREE DIFFERENT VERDICTS. Comparing the whole answers was the first version
       and a mutation walked through it: forcing every record to the "we do not know" branch still
       produced three different STRINGS, because each one carries its own open question in the
       tail. What must differ is the classification, which is the first clause and the whole point
       of the finding. */
    const verdict = t => String(t || '').trim().split(/[.,—]/)[0].trim().toLowerCase();
    ok('OS-C8 …and the three records genuinely receive three different verdicts',
      new Set([verdict(sup.said), verdict(gsup.said), verdict(bsup.said)]).size === 3);

    console.log('\n  D — AND A PERSON\'S OWN RECORD IS NOT WRITTEN ABOUT A THIRD PARTY');
    ok('OS-D1 the legacy third-person label is read back in the second person',
      /Where you are trying to get to/i.test(knowQ.said)
      && !/Where they are trying to get to/i.test(knowQ.said));
    /* THE RECORD ITSELF IS UNTOUCHED — the finding says presentation cleanup, and a reader that
       quietly rewrote somebody's stored object would be a different and worse change. */
    ok('OS-D2 …while the stored topic label is left exactly as it was',
      ((inquiryStates[C] || {})['member:titi'] || {}).mine.topic.label === 'Where they are trying to get to');
    ok('OS-D3 …and the translation is a whole-label map, not a pronoun rewriter',
      present.humanTopic({ label: 'they keep arriving late after they travel' })
        === 'they keep arriving late after they travel');
    ok('OS-D4 …covering all five labels the onboarding route ever wrote',
      Object.keys(present.LEGACY_SELF_LABELS).length === 5
      && Object.values(present.LEGACY_SELF_LABELS).every(v => /\byou(r)?\b/i.test(v))
      && Object.keys(present.LEGACY_SELF_LABELS).every(k => /\bthey\b/i.test(k)));

    console.log('\n  E — WHAT COULD WE TRY, ANSWERED FROM THE GOVERNED OPTION SET');
    const tryHere = await ask('What could we try?', 'mine');
    ok('OS-E1 a question at worth_testing gets a small option set with what each would teach',
      /worth trying/i.test(tryHere.said) && /In no order:/.test(tryHere.said)
      && /it would tell you/i.test(tryHere.said));
    ok('OS-E2 …unranked, and choosing stays the person\'s',
      /Nothing here picks one/i.test(tryHere.said)
      && !/\bbest\b|\brecommend|\bmost likely\b|\bstart with\b|\bfirst choice\b/i.test(tryHere.said));
    ok('OS-E3 …and each option carries what it does not settle',
      /though/i.test(tryHere.said));
    const tryThin = await ask('What could we try?', 'guess');
    ok('OS-E4 a record with nothing behind it says so, with the kernel\'s own reason',
      /Nothing worth trying yet|worth learning more before trying anything/i.test(tryThin.said));
    ok('OS-E5 …and asks the ONE question that would move it on, rather than a list',
      /The one thing that would move this on: is it every game or only away\?/i.test(tryThin.said));
    /* THE SENTENCE THE FOUNDER WAS GIVEN AS THE REASON. An internal answer-length limit is not a
       fact about their record, and it may not be offered as one. */
    ok('OS-E6 …and never blames an internal answer-length limit for any of it',
      [tryHere, tryThin].every(a => !/ran out of room|token|length limit|too long to/i.test(a.said)));
    ok('OS-E7 …and asking what to try wrote nothing to the record',
      ((inquiryStates[C] || {})['member:titi'] || {}).mine.signals.length === 2
      && ((inquiryStates[C] || {})['member:titi'] || {}).guess.signals.length === 1);

  } catch (e) { fail++; console.error('  FAIL object subject binding threw:', e && e.stack); }

  server.close();
  console.log(`\nobject-subject-binding-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
