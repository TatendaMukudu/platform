/* Truth layer — A FOCUS READS ACROSS ITS GOVERNED RELATION, AND OWNS NOTHING IT FINDS THERE.

   FOUNDER RULING, findings R1 #42, on the one seam the previous round recorded as open rather
   than closing quietly at the end of a pass:

     *"A Focus must not copy or inherit another object's option set or evidence as if it owns
     them, but creating a Focus must not make IntelliQ less intelligent. If a Focus is related to
     an Inquiry, IntelliQ may read across that governed relation — subject to the same
     authorization/privacy rules — to consult the addressed Inquiry, previous attempts and
     outcomes, relevant organisational learning, user-provided material, and genuine external
     knowledge with provenance. Treat this as cross-object reading, not inheritance or
     duplication. Evidence stays with its canonical owner. Do not create a second option store,
     second evidence store, or parallel Focus intelligence model."*

   WHAT WAS ACTUALLY WRONG, reproduced on the real turn route with models off before anything was
   written. A personal Focus addressing a question whose kernel readiness was `worth_testing`,
   asked "What should we try now?":

     You are working on "Concede fewer late goals". Nothing has been recorded about how it
     went yet. You started it from the question "Late goals". That is what is on the record
     here, not a fresh reading of it.

   Behind that question sat a supported explanation, two independent accounts, an open unknown, a
   falsifier and the kernel's own governed option set. Standing on the Focus, the person was given
   the question's NAME. Starting a Focus had made the product less intelligent about the one thing
   the Focus exists to work on — which is the whole of what the founder's ruling forbids.

   THE TWO HALVES THIS FILE HOLDS APART, because a change that satisfies one by breaking the other
   is the likely failure and neither is visible on a screen:

     READING      the question's current read, what is still open on it, the kernel's readiness
                  with its reason, and the options held on it — every one attributed to the
                  question, none ranked, no contributed evidence text crossing at all.
     NOT OWNING   the Focus record gains nothing; the question gains nothing; the answer changes
                  when the QUESTION changes, because there is no copy to go stale; and a relation
                  pointing at something this reader may not open yields nothing rather than a
                  redacted something.

   Run: node scripts/focus-cross-object-reading-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, userAiProfiles, inquiryStates } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'fxr', NOW = Date.now(), DAY = 86400000;

/* THE WORDS SOMEBODY CONTRIBUTED. Named here so a single assertion can prove that not one of them
   reaches an answer composed on a different object. Evidence is referenced; it is never copied. */
const SAID_1 = 'we sat deep for the last twenty minutes after going ahead';
const SAID_2 = 'the back line dropped about twenty yards and nobody stepped up';

const SIG = (ref, who, at, text) => ({ kind: 'observation', status: 'active', source: who,
  originRef: `o_${ref}`, at, turnId: `t_${ref}`, directness: 'direct', authority: 'corroborated',
  specificity: 0.7, ref, contributedBy: who, text });

const RANKS = /\bbest\b|\bstrongest\b|\bmost likely\b|\brecommend(?:ed|ation)?\b|\boption 1\b|\bfirst choice\b|\btop (?:option|choice|pick)\b|\b\d{1,3}%\b|\bI would\b|\bstart with\b/i;

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Highlanders FC', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coach: { id: 'coach', name: 'Dana Coach', email: 'c@fxr.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['n'], assignedNodeIds: ['n'], profileComplete: true },
    /* SOMEBODY ELSE, WITH THEIR OWN QUESTION. The reachability half of the authorisation rule
       needs a real object this reader genuinely may not open, not an id that matches nothing —
       a missing id would pass this gate for the wrong reason. */
    other: { id: 'other', name: 'Sam Other', email: 'o@fxr.io', role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['far'], profileComplete: true },
  } },
  orgNodes: { [C]: {
    n:   { nodeId: 'n', name: 'First Team', parentId: null, childNodeIds: [], memberIds: ['coach'], leaderIds: ['coach'] },
    far: { nodeId: 'far', name: 'Academy', parentId: null, childNodeIds: [], memberIds: ['other'], leaderIds: [] },
  } },
  inquiryStates: { [C]: {
    'member:coach': {
      /* THE QUESTION THE FOCUS ADDRESSES — one explanation with support of its own and nothing
         competing, which is the kernel's own `worth_testing` condition. Not asserted here as a
         constant: the readiness the answer reports is read back from the question's own route. */
      q1: {
        inquiryId: 'q1', subjectRef: 'member:coach', status: 'exploring',
        topic: { label: 'Late goals', canonicalConcept: 'football.late_goals', domain: 'sports' },
        hypotheses: [{ id: 'h1', statement: 'we drop too deep once ahead', supportRefs: ['ev1', 'ev2'],
          confidence: { score: 0.7, band: 'probable', because: ['two independent accounts'] }, status: 'open' }],
        leadingHypothesisId: 'h1',
        signals: [SIG('ev1', 'coach', NOW - 5 * DAY, SAID_1), SIG('ev2', 'p2', NOW - 4 * DAY, SAID_2)],
        confidence: { score: 0.7, band: 'probable', because: ['two independent accounts'] },
        missingSignals: [{ question: 'does dropping deep actually precede the goals, or follow them?' }],
        falsifiers: [{ statement: 'late goals conceded while pressing high' }],
        timeline: [], lastUpdatedAt: NOW,
      },
      /* A SECOND QUESTION WITH NOTHING BEHIND IT, so "no options" is proven against a real
         question rather than against the absence of one. */
      q2: {
        inquiryId: 'q2', subjectRef: 'member:coach', status: 'exploring',
        topic: { label: 'Slow starts', canonicalConcept: 'football.slow_starts', domain: 'sports' },
        hypotheses: [], leadingHypothesisId: null,
        signals: [SIG('ev9', 'coach', NOW - 2 * DAY, 'we started flat')],
        confidence: { score: 0.2, band: 'tentative', because: ['one account'] },
        missingSignals: [], falsifiers: [], timeline: [], lastUpdatedAt: NOW,
      },
    },
    'member:other': {
      qx: {
        inquiryId: 'qx', subjectRef: 'member:other', status: 'exploring',
        topic: { label: 'Academy travel', canonicalConcept: 'football.travel', domain: 'sports' },
        hypotheses: [{ id: 'hx', statement: 'the coach trip is too long', supportRefs: ['evx'],
          confidence: { score: 0.7, band: 'probable', because: ['an account'] }, status: 'open' }],
        leadingHypothesisId: 'hx',
        signals: [SIG('evx', 'other', NOW - DAY, 'the bus takes two hours each way')],
        confidence: { score: 0.7, band: 'probable', because: ['an account'] },
        missingSignals: [], falsifiers: [], timeline: [], lastUpdatedAt: NOW,
      },
    },
  } },
  userAiProfiles: {
    [`${C}:coach`]: { focuses: [
      { id: 'foc_linked', text: 'Concede fewer late goals', status: 'active', visibility: 'only_me',
        addresses: { kind: 'inquiry', id: 'q1' }, createdAt: new Date(NOW - 2 * DAY).toISOString() },
      { id: 'foc_thin', text: 'Start games better', status: 'active', visibility: 'only_me',
        addresses: { kind: 'inquiry', id: 'q2' }, createdAt: new Date(NOW - 2 * DAY).toISOString() },
      { id: 'foc_loose', text: 'Have a word with the captain', status: 'active', visibility: 'only_me',
        createdAt: new Date(NOW - 2 * DAY).toISOString() },
      /* A LINK POINTING SOMEWHERE THIS READER MAY NOT GO. The object exists; their authorisation
         does not reach it. A relationship is not readership. */
      { id: 'foc_reach', text: 'Look at the travel', status: 'active', visibility: 'only_me',
        addresses: { kind: 'inquiry', id: 'qx' }, createdAt: new Date(NOW - 2 * DAY).toISOString() },
    ] },
  },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { Authorization: `Bearer ${issueToken('coach', C, 'coach')}`, 'Content-Type': 'application/json' };
  const call = (m, u, b) => fetch(base + u, { method: m, headers: H,
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const ask = async (text, about) => {
    const r = await call('POST', '/api/assistant/turn', { text, ...(about ? { about } : {}) });
    const resp = (r.j || {}).response || {};
    return { said: String(resp.responseText || ''), sources: resp.sources || [],
      props: (resp.proposedActions || []).map(p => p.actionType),
      limits: [...((resp.qa || {}).limitations || []), ...(resp.limitations || [])] };
  };
  const focusOf = id => ((userAiProfiles[`${C}:coach`] || {}).focuses || []).find(f => f.id === id) || null;

  try {
    console.log('\n  A — THE QUESTION BEHIND THE FOCUS IS ACTUALLY READ');
    const linked = await ask('What should we try now?', { kind: 'focus', id: 'foc_linked' });
    ok('FX-A1 the answer names the question the focus was started from',
      /You started it from the question "Late goals"/i.test(linked.said));
    /* THE READ ITSELF, not the title of the thing that holds it. This is the sentence whose
       absence was the defect: everything after the question's name was missing. */
    ok('FX-A2 …and what that question currently reads, which the focus does not hold itself',
      /On that question the record currently reads: we drop too deep once ahead/i.test(linked.said));
    ok('FX-A3 …and what is still open on it',
      /Still open on it: does dropping deep actually precede the goals/i.test(linked.said));
    /* THE KERNEL'S OWN THREE-STATE ANSWER, WITH ITS REASON. Read back from the question's own
       route rather than asserted as a constant here — if the two ever disagree, the answer on the
       Focus has stopped being a reading of the question and become a second opinion about it. */
    const qstate = await call('GET', '/api/objects/inquiry/q1');
    const qReadiness = (((qstate.j || {}).object || {}).raw || {}).readiness
      || ((qstate.j || {}).object || {}).readiness || null;
    ok('FX-A4 …and the kernel\'s readiness on that question, with the reason it is in that state',
      /There is enough on that question for something to be worth trying — one explanation has something behind it/i.test(linked.said));
    ok('FX-A5 …and the options the question holds, each with what it would teach',
      /Held on that question, in no order:/.test(linked.said)
      && /"Test whether we drop too deep once ahead"/.test(linked.said)
      && /it would tell you whether the explanation that has support actually accounts/i.test(linked.said)
      && /"Learn more before acting"/.test(linked.said));
    /* ATTRIBUTION IS THE DIFFERENCE BETWEEN READING AND INHERITING, so it is asserted as hard as
       the content. A sentence that states the question's support without saying whose it is has
       handed the Focus something it did not earn. */
    ok('FX-A6 …said to belong to the question rather than to this focus',
      /Those belong to the question, not to this focus/i.test(linked.said));
    ok('FX-A7 …and nothing is ranked, scored, recommended or picked',
      !RANKS.test(linked.said) && /nothing here picks one/i.test(linked.said));
    /* NOT ONE WORD ANYBODY CONTRIBUTED. The shape of the support may cross; the accounts may not,
       and this is the assertion that keeps a future "make it more grounded" change honest. */
    ok('FX-A8 …and no contributed account crosses the link at all',
      !linked.said.includes(SAID_1) && !linked.said.includes(SAID_2)
      && !linked.said.includes('twenty yards'));
    ok('FX-A9 …and the machine-readable limitation says the evidence stays with the question',
      linked.limits.some(l => /stays there and none of it belongs to this focus/i.test(String(l)))
      && linked.limits.some(l => /read across the link/i.test(String(l))));

    console.log('\n  B — READING IS NOT INHERITING');
    /* THE FOCUS RECORD IS THE PROOF. If any of this had been copied, it would be here. */
    ok('FX-B1 the focus gained no option set of its own',
      !focusOf('foc_linked').options && !focusOf('foc_linked').readiness);
    ok('FX-B2 …no evidence, no signals, no hypotheses',
      !focusOf('foc_linked').signals && !focusOf('foc_linked').hypotheses
      && !focusOf('foc_linked').evidence && !focusOf('foc_linked').supportRefs);
    ok('FX-B3 …and the question it read gained nothing either',
      ((inquiryStates[C] || {})['member:coach'] || {}).q1.signals.length === 2
      && ((inquiryStates[C] || {})['member:coach'] || {}).q1.hypotheses.length === 1);
    /* THE LIVE TEST OF "NO COPY". Change the QUESTION and ask the FOCUS again: a read follows,
       a copy does not. Reverted immediately so the rest of the file sees the fixture it expects. */
    const q1 = ((inquiryStates[C] || {})['member:coach'] || {}).q1;
    const keptRefs = q1.hypotheses[0].supportRefs;
    q1.hypotheses[0].supportRefs = [];
    const afterEdit = await ask('What should we try now?', { kind: 'focus', id: 'foc_linked' });
    q1.hypotheses[0].supportRefs = keptRefs;
    ok('FX-B4 removing the question\'s support changes what the focus says, because there is no copy',
      !/Held on that question/.test(afterEdit.said)
      && /There is not enough on that question yet|worth learning more before trying anything/i.test(afterEdit.said));
    const restored = await ask('What should we try now?', { kind: 'focus', id: 'foc_linked' });
    ok('FX-B4b …and putting it back restores them, from the question and not from anywhere here',
      /Held on that question, in no order:/.test(restored.said));
    /* AUTHORISATION IS THE SAME ONE. The object exists and is real; this reader cannot open it,
       so the relation yields nothing rather than a redacted something. */
    const unreachable = await ask('What should we try now?', { kind: 'focus', id: 'foc_reach' });
    /* THE WORDS PINNED HERE ARE THE QUESTION'S, NOT THE FOCUS'S. The first version of this matched
       /travel/ — and the focus is called "Look at the travel", so it would have failed on the
       focus's own title while proving nothing about the link, the same way FS-A5 once passed on
       a title it was meant to look past. What must not appear is the other person's question: its
       name, its explanation, and the account behind it. */
    ok('FX-B5 a link to a question this reader may not open yields nothing at all',
      !/On that question/i.test(unreachable.said)
      && !/Held on that question/i.test(unreachable.said)
      && !/Academy travel/i.test(unreachable.said)
      && !/coach trip is too long/i.test(unreachable.said)
      && !/bus|two hours/i.test(unreachable.said));
    /* AND A FOCUS WITH NO LINK IS NOT GIVEN ONE. Reading across a relation that does not exist
       would be the system deciding two things are about the same thing. */
    const loose = await ask('What should we try now?', { kind: 'focus', id: 'foc_loose' });
    ok('FX-B6 a focus with no governed relation reads across nothing',
      !/On that question/i.test(loose.said) && !/Held on that question/i.test(loose.said));

    console.log('\n  C — A QUESTION WITH NOTHING BEHIND IT OFFERS NOTHING');
    const thin = await ask('What should we try now?', { kind: 'focus', id: 'foc_thin' });
    ok('FX-C1 the relation is still read, so the answer is grounded rather than silent',
      /You started it from the question "Slow starts"/i.test(thin.said));
    ok('FX-C2 …and says there is not enough on that question to suggest anything',
      /There is not enough on that question yet to suggest anything worth trying/i.test(thin.said));
    ok('FX-C3 …and offers no options, because the kernel\'s gate is the only gate',
      !/Held on that question/i.test(thin.said) && !RANKS.test(thin.said));

    console.log('\n  D — A FAILED ATTEMPT IS A CAUTION, IN EITHER GRAIN\'S VOCABULARY');
    /* A PERSONAL focus records `no`; a group focus records `no_change`. The rule that a failed
       tactic must not come back as a fresh option read the GROUP words only, so on this path it
       was silently off. Added through the canonical store the product itself writes to. */
    userAiProfiles[`${C}:coach`].focuses.push({
      id: 'foc_failed', text: 'Put an extra defender on for the last ten', status: 'done',
      visibility: 'only_me', addresses: { kind: 'inquiry', id: 'q1' },
      outcome: { result: 'no', note: 'We tried an extra defender and still conceded.',
        recordedBy: 'coach', at: NOW - DAY },
      resolvedAt: new Date(NOW - DAY).toISOString(), createdAt: new Date(NOW - 3 * DAY).toISOString(),
    });
    const withFailure = await ask('What should we try now?', { kind: 'focus', id: 'foc_linked' });
    ok('FX-D1 the failed attempt is named with the outcome that was recorded',
      /Already tried on that question: "Put an extra defender on for the last ten" — recorded as it did not help/i.test(withFailure.said));
    ok('FX-D2 …and it is never re-offered as something to try',
      !/Held on that question[^.]*extra defender/i.test(withFailure.said));
    /* AND THAT ASSERTION HAS TEETH ONLY IF AN ATTEMPT CAN EVER REACH THE OPTION LIST. Written
       without this pair, FX-D2 could not fail: a failed tactic is not the kind of thing the
       option set builds from, so "it is absent" was true for a reason that had nothing to do with
       the law. Recorded as having HELPED, the SAME attempt comes back — as precedent, under its
       own outcome — which is what makes its absence above a constraint rather than a coincidence. */
    const failed = focusOf('foc_failed');
    failed.outcome.result = 'helped';
    const withPrecedent = await ask('What should we try now?', { kind: 'focus', id: 'foc_linked' });
    failed.outcome.result = 'no';
    ok('FX-D2b …whereas the same attempt recorded as having HELPED does reach the option list',
      /Held on that question[^]*extra defender/i.test(withPrecedent.said)
      && /Run something like "Put an extra defender on for the last ten" again/i.test(withPrecedent.said));
    ok('FX-D2c …as precedent under those conditions rather than as proof, and still unranked',
      /whether what helped before still helps under current conditions/i.test(withPrecedent.said)
      && !RANKS.test(withPrecedent.said)
      && /Those belong to the question, not to this focus/i.test(withPrecedent.said));
    /* THE EXHAUSTED STATE, WHICH IS THE POINT WHERE ANOTHER VARIATION IS THE WRONG ANSWER. With
       the only recorded attempt having failed, the option set drops the tactic and says so. */
    ok('FX-D3 …and with everything tried about it having failed, the answer says another variation is not the move',
      /already tried about this did not help, so another variation is not the useful next move/i.test(withFailure.said));
    ok('FX-D4 …and it is still not presented as caused by the attempt',
      withFailure.limits.some(l => /not proof that attempt caused it/i.test(String(l))));

    console.log('\n  E — EXTERNAL KNOWLEDGE COMES THROUGH THE QUESTION\'S OWN GOVERNED CONCEPT');
    /* A FOCUS HAS NO CANONICAL CONCEPT of its own and the sentence somebody typed must never
       become a query (L-WS1). A focus started FROM a question has one, and it is the question's.
       Only the GROUP spelling of that link was read, so a personal focus was refused outside
       reading while the same reading on its own question built a query. */
    const rdLinked = await call('GET', '/api/objects/focus/foc_linked/reading');
    const rdQuestion = await call('GET', '/api/objects/inquiry/q1/reading');
    ok('FX-E1 the focus borrows the question\'s concept rather than refusing for want of a topic',
      (rdLinked.j || {}).query === (rdQuestion.j || {}).query
      && /late goals/i.test(String((rdLinked.j || {}).query || '')));
    ok('FX-E2 …and the query is built from the topic, never from what the person wrote',
      !/concede fewer|have a word|captain/i.test(String((rdLinked.j || {}).query || '')));
    const rdLoose = await call('GET', '/api/objects/focus/foc_loose/reading');
    ok('FX-E3 …while a focus with no such link still says plainly there is nothing to look up',
      (rdLoose.j || {}).available === false && !(rdLoose.j || {}).query
      && /no general topic in it to look up/i.test(String((rdLoose.j || {}).reason || '')));
    ok('FX-E4 …and with no provider configured nothing claims to have read anything outside',
      (rdLinked.j || {}).available === false
      && /Everything on this screen came from inside IntelliQ/i.test(String((rdLinked.j || {}).note || '')));
    ok('FX-E5 …and no answer on the focus cites a web source or offers a link',
      [linked, thin, loose, withFailure].every(a => (a.sources || [])
        .every(s => s.kind !== 'web' && !s.url))
      && !/https?:\/\//.test(linked.said));

    console.log('\n  F — AND WITH THE PROVIDER OFF, WHICH IS THE PILOT\'S CONFIGURATION');
    /* EVERY ASSERTION ABOVE RAN WITH MODELS OFF. That is not a caveat, it is the point: a rule
       carried only by a prompt reaches nobody in the pilot's own deployment, and this whole seam
       is on the deterministic path for exactly that reason. This section states it as a claim
       that can fail rather than leaving it in a comment. */
    const ai = require('../ai/gateway.js');
    ok('FX-F1 this entire file ran against a deployment that sends nothing to a model',
      ai.deterministicOnly() === true);
    ok('FX-F2 …and the grounded cross-object answer was produced anyway',
      /On that question the record currently reads/.test(linked.said)
      && /Held on that question/.test(linked.said));
    /* DEGRADATION IS NOT A REASON TO SAY LESS ABOUT THE RECORD. The answer never explains its
       own shape by blaming a provider, because nothing about it depended on one. */
    ok('FX-F3 …without excusing itself with a provider problem it does not have',
      !/normal response|not available right now|couldn't reach|try again/i.test(linked.said));

    console.log('\n  G — AND ASKING WRITES NOTHING, ON EITHER OBJECT');
    ok('FX-G1 no focus was created by any of this asking',
      ((userAiProfiles[`${C}:coach`] || {}).focuses || []).length === 5);
    ok('FX-G2 …the focus being asked about is untouched',
      focusOf('foc_linked').status === 'active' && !focusOf('foc_linked').outcome);
    ok('FX-G3 …the question it read is untouched',
      ((inquiryStates[C] || {})['member:coach'] || {}).q1.signals.length === 2);
    ok('FX-G4 …and nothing was proposed that would write without a confirmation',
      [linked, thin, loose, withFailure].every(a => !a.props.includes('update_focus')));

  } catch (e) { fail++; console.error('  FAIL focus cross-object reading threw:', e && e.stack); }

  server.close();
  console.log(`\nfocus-cross-object-reading-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
