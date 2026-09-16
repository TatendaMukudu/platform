/* Truth layer — THE QUESTIONS A COACH ACTUALLY ASKS, ANSWERED FROM WHAT IS ALREADY HELD.

   Driven with models off, which is the state the Alma pilot runs in. Every question below was put
   to `/api/assistant/turn` as a coach, and five of them came back:

       "I don't have enough authorised evidence to answer that yet."

   while the answer to every one was rendered on the group's own screen one tap away. That line is
   not a refusal and was never a lie about the retrieval bundle — it is a true statement about the
   free-text evidence index, delivered as though it were a statement about what the product knows,
   and a coach has no way to tell those two apart.

   A sixth was worse. "What's going on with communication?" returned

       "Evening, Coach. The First Team area is ticking along; nothing's asking for you today."

   at `confidence: confirmed`, with four open group questions, a human explanation on one of them,
   a focus started out of it, and an outcome recorded. The composer was not missing an ability; it
   was reading the BELIEF agenda — the reasoner's reads about people — and answering for two
   stores. And it asserted `confirmed` for the EMPTY case, which is the one case where the answer
   rests on nothing having been found.

   NO NEW BACKEND OWNER. `_teamStateAnswer` already answers at group grain from
   `_groupInquiryProjections`; it gained a LENS so it answers the question that was asked rather
   than always returning the whole picture. Every field each lens reads — `stillUnknown`,
   `triedBefore`, `readiness`, `hypothesis`, `alternatives`, `ruledOut` — was already on the
   projection and already on the screen. Nothing is generated, nothing is ranked, and no option is
   invented: the answer to "what could we do?" is what the record does or does not support, and
   the deciding stays with the coach.

   Run: node scripts/composer-coach-questions-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const DAY = 86400000, NOW = Date.now();
const C = 'cqa';
const SQUAD = Array.from({ length: 14 }, (_, i) => 'p' + (i + 1));
const users = { coach: { id: 'coach', name: 'Coach', email: 'c@cqa.io', role: 'coach', orgCode: C,
  status: 'active', leadershipNodeIds: ['first'], assignedNodeIds: ['first'] },
  lonely: { id: 'lonely', name: 'No Squad', email: 'l@cqa.io', role: 'coach', orgCode: C, status: 'active' } };
for (const id of SQUAD) users[id] = { id, name: id.toUpperCase(), email: `${id}@cqa.io`,
  role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['first'] };

const SIG = (source, originRef, at) => ({ kind: 'observation', status: 'active', source, originRef,
  at, turnId: `t_${source}`, directness: 'direct', authority: 'corroborated', specificity: 0.7,
  ref: `ev_${originRef}`, contributedBy: source });

const inq = (id, concept, label, hyps) => ({
  inquiryId: id, subjectRef: 'group:first', topic: { canonicalConcept: concept, label },
  status: 'exploring', hypotheses: hyps || [],
  leadingHypothesisId: (hyps && hyps[0] && hyps[0].id) || null,
  signals: Array.from({ length: 5 }, (_, i) => SIG('p' + (i + 1), `o_${id}_${i}`, NOW - (i + 1) * DAY)),
  confidence: { score: 0.7, band: 'supported', because: ['5 independent origins'],
    origin: { independentOrigins: 5, occasions: 5, signals: 5, contradictions: 0, retired: 0, unestablishedSources: 0 } },
  missingSignals: [], falsifiers: [{ statement: 'Talking stays the same after the next loss' }],
  timeline: [], lastUpdatedAt: NOW, alternatives: [],
});

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: users },
  orgNodes: { [C]: { first: { nodeId: 'first', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: [...SQUAD, 'coach'], leaderIds: ['coach'] } } },
  inquiryStates: { [C]: { 'group:first': {
    comms: inq('inq_comms', 'football.communication_after_result', 'Communication after results',
      [{ id: 'h1', statement: 'players are worried about criticising each other',
         confidence: { score: 0, band: 'tentative', because: ['nothing supports this yet'] },
         status: 'open', supportRefs: [], challengeRefs: [] }]),
    late: inq('inq_late', 'football.late_game_shape', 'How the last twenty minutes go', []),
  } } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = who => ({ Authorization: `Bearer ${issueToken(who, C, 'coach')}`, 'Content-Type': 'application/json' });
  const call = (m, u, b, who) => fetch(base + u, { method: m, headers: H(who),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const ask = async (text, who = 'coach') => {
    const r = await call('POST', '/api/assistant/turn', { text }, who);
    const resp = (r.j || {}).response || {};
    return { text: String(resp.responseText || ''), confidence: (resp.qa || {}).confidence || null,
      limitations: resp.limitations || [] };
  };

  try {
    const made = await call('POST', '/api/group/first/focus',
      { text: 'Player-led debrief after the next two matches', fromInquiryId: 'inq_comms' }, 'coach');
    await call('POST', `/api/group/first/focus/${made.j.focus.focusId}/outcome`, { result: 'better' }, 'coach');

    console.log('\n  A — "WHAT\'S GOING ON?" IS ANSWERED FROM BOTH STORES, NOT ONE');
    const going = await ask("What's going on with communication?");
    ok('CQ-A1 the answer names what the group is actually working out',
      /communication after results/i.test(going.text));
    ok('CQ-A2 …and does not say nothing is asking for the coach while four questions are open',
      !/nothing'?s asking for you|looks steady|all calm/i.test(going.text));
    ok('CQ-A3 …and reads the topic out loud rather than as a canonical key',
      !/football\.|attendance_timing/.test(going.text));
    /* THE EMPTY CASE IS THE ONE THAT WAS WRONG. `confirmed` was asserted for "nothing found",
       which is a statement about the record's silence rather than a fact established from it. */
    const empty = await ask("What's going on?", 'lonely');
    ok('CQ-A4 a reader with nothing recorded is never told so at `confirmed`',
      empty.confidence !== 'confirmed');

    console.log('\n  B — WHAT DON\'T WE KNOW');
    const unknowns = await ask("What don't we know?");
    ok('CQ-B1 answered from the frontier the projection already carries',
      /nothing recorded supports it yet/i.test(unknowns.text));
    ok('CQ-B2 …and not with the retrieval dead end, which was a fact about an index read as a fact about the product',
      !/enough authorised evidence/i.test(unknowns.text));

    console.log('\n  C — WHAT MIGHT EXPLAIN IT');
    const why = await ask('What could explain it?');
    ok('CQ-C1 the candidate explanation somebody offered is said',
      /worried about criticising each other/i.test(why.text));
    ok('CQ-C2 …WITH what it rests on, because a claim read aloud without its standing is the same lie in another channel',
      /nothing on the record supports that yet/i.test(why.text));
    ok('CQ-C3 …and it is attributed as a suggestion rather than stated as the finding',
      /someone suggested/i.test(why.text));
    ok('CQ-C4 …and it is not routed to the reasoning register, which is off in the pilot',
      !/reasoning engine is switched on/i.test(why.text));

    console.log('\n  D — WHAT HAVE WE TRIED, AND DID IT WORK');
    const tried = await ask('What have we tried?');
    ok('CQ-D1 the focus the coach started is named, in the coach\'s own words',
      /Player-led debrief after the next two matches/.test(tried.text));
    ok('CQ-D2 …with the outcome in the group\'s words rather than the kernel\'s enum',
      /it got better/i.test(tried.text) && !/after it: better|"better"/.test(tried.text));
    ok('CQ-D3 …and a disclaimer of cause travelling with it',
      /nothing here says a focus caused what followed it/i.test(tried.text));
    const worked = await ask('Did it work?');
    ok('CQ-D4 "did it work?" is answered with what was recorded after it',
      /it got better/i.test(worked.text));
    /* CHECKED ON WHAT IS LEFT ONCE THE DENIAL IS REMOVED. The disclaimer contains the word
       "caused", so a bare negative match goes red on the very sentence that makes the answer
       safe — the third time that trap has been hit in this repository, and the third time it is
       being recorded rather than quietly patched. */
    const withoutDenial = worked.text.replace(/Nothing here says a focus caused what followed it\.?/gi, '');
    ok('CQ-D5 …and never claims the focus caused it',
      !/because of|caused|worked because|proved|thanks to/i.test(withoutDenial));

    console.log('\n  E — WHAT COULD WE DO');
    const options = await ask('What could we do?');
    ok('CQ-E1 the honest answer is given: there is not enough to suggest anything worth trying',
      /not enough evidence yet to suggest anything worth trying/i.test(options.text));
    ok('CQ-E2 …with the reason, from the record rather than from a rule',
      /nothing recorded supports|nobody has offered an explanation/i.test(options.text));
    ok('CQ-E3 …and NO option is generated, ranked, scored or given a probability',
      !/\bI (?:suggest|recommend)\b|\bbest\b|\b\d+%|\bmost likely\b|\btry the\b/i.test(options.text));
    ok('CQ-E4 …and the deciding is left with the coach, said out loud',
      /yours to decide/i.test(options.text));

    console.log('\n  F — AND NONE OF IT NEEDED A MODEL');
    ok('CQ-F1 every answer above was composed with models switched off',
      process.env.IQ_DETERMINISTIC_ONLY === '1');
    ok('CQ-F2 …and no answer was the degraded "the reasoning engine is switched on" line',
      [going, unknowns, why, tried, worked, options].every(a => !/reasoning engine is switched on/i.test(a.text)));
    ok('CQ-F3 …and every one of them said something, rather than the dead end',
      [going, unknowns, why, tried, worked, options].every(a => a.text.length > 30
        && !/enough authorised evidence/i.test(a.text)));

    console.log('\n  G — AND A READER ON NO GROUP IS TOLD THAT, NOT TOLD THE RECORD IS THIN');
    const none = await ask('What have we tried?', 'lonely');
    ok('CQ-G1 the answer is about their position, not about a shortage of evidence',
      /not on a group yet/i.test(none.text) && !/enough authorised evidence/i.test(none.text));

    /* ══ H — PROVIDER DOWN SAYS WHICH THING IS MISSING, AND WHERE THE DOOR IS ════════════════
       With no model the action interpreter is unavailable, so "Create a Focus to try player-led
       debriefs" selected no action and fell through to a generic capture card — under a reply
       about the REASONING ENGINE being switched off, which is a different subsystem. A coach
       reading that learns nothing true: the product can still start a focus, and the control is
       two taps away on the question's own screen.

       The signpost chooses no action, binds no object, proposes nothing and writes nothing. It
       fires only when the interpreter is unavailable, so it can never pre-empt the governed path
       or disagree with it. */
    console.log('\n  H — WITH NO MODEL, AN ACTION REQUEST IS ANSWERED HONESTLY');
    for (const [what, utterance] of [
      ['Focus',   'Create a Focus to try player-led debriefs.'],
      ['Inquiry', 'Create an Inquiry into why substitutes feel disconnected.'],
      ['High',    'Create a High about our pressing being much more coordinated today.'],
      ['Low',     'Create a Low about substitute role clarity.'],
    ]) {
      const r = await ask(utterance);
      ok(`CQ-H1 "${what}": it says plainly that it has created nothing`,
        /have not created anything/i.test(r.text));
      ok(`CQ-H1b "${what}": …and names the reason as the language model, not as a reasoning engine`,
        /language model is unavailable/i.test(r.text));
      ok(`CQ-H1c "${what}": …and points at the control that still works with no provider`,
        /Work on this|group screen/i.test(r.text));
      ok(`CQ-H1d "${what}": …and confirms the words are kept privately rather than lost`,
        /nothing was saved or shared/i.test(r.text));
    }
    /* AND IT IS A SIGNPOST, NOT A SECOND INTENT ENGINE. It must not fire on an ordinary sentence,
       and it must never be the thing that acts. */
    const ordinary = await ask('Nobody talks after we lose.');
    ok('CQ-H2 an ordinary observation gets no signpost, because there was no action to read',
      !/have not created anything/i.test(ordinary.text));
    const question = await ask('What have we tried?');
    ok('CQ-H2b …and neither does a question the product can actually answer',
      !/have not created anything/i.test(question.text));
    /* CQ-H3 WAS `async () => true` FOR ONE EDIT — an assertion that cannot fail, which is the
       vacuous kind this repository keeps catching in its own tests. Removed rather than left in
       beside the real one. What follows counts. */
    const focusCount = ((await call('GET', '/api/objects?kind=focus&scope=all', undefined, 'coach')).j || {}).objects || [];
    ok('CQ-H3 the signpost writes nothing — counted, after four separate requests to create something',
      focusCount.length === 1);

  } catch (e) { fail++; console.error('  FAIL composer-coach-questions threw:', e && e.stack); }

  server.close();
  console.log(`\ncomposer-coach-questions-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
