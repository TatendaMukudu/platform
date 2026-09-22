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

    /* ══ H — WITH NO MODEL, THE FOUR REQUESTS ARE ANSWERED HONESTLY AND DIFFERENTLY ══════════
       FOUNDER ADJUDICATION, September 2026. The action vocabulary and the governed pipeline
       behind it are provider-independent; only the INTERPRETATION step was model-gated, so with
       no provider "Create a Focus to try player-led debriefs" selected nothing and fell through
       to a generic capture card, under a reply about the REASONING ENGINE — a different subsystem.

       `composerActions.readCommand` is a SYNTAX parser, not an intent engine. It reads the shape
       of an explicit imperative and returns which ALREADY-EXISTING action it names. It does not
       set `requested`, so the reading goes through the same grounding a model-proposed action
       gets and can still be refused. It names no action that does not exist.

       So the four requests get three different honest answers, and this section asserts all of
       them — including that the two which CAN be created still write nothing until a human
       confirms, which is the property the parser must not be allowed to erode. */
    console.log('\n  H — WITH NO MODEL, THE FOUR REQUESTS ARE ANSWERED HONESTLY AND DIFFERENTLY');
    const propose = async (utterance) => {
      const r = await call('POST', '/api/assistant/turn', { text: utterance }, 'coach');
      const resp = (r.j || {}).response || {};
      return { turnId: (r.j || {}).turnId, actions: resp.proposedActions || [],
        text: String(resp.responseText || '') };
    };
    const countFocuses = async () =>
      (((await call('GET', '/api/objects?kind=focus&scope=all', undefined, 'coach')).j || {}).objects || []).length;
    const countInquiries = async () =>
      (((await call('GET', '/api/objects?kind=inquiry&scope=all', undefined, 'coach')).j || {}).objects || []).length;

    const focusesBefore = await countFocuses(), inquiriesBefore = await countInquiries();

    const askFocus = await propose('Create a Focus to try player-led debriefs.');
    const fProp = askFocus.actions.find(a => a.actionType === 'create_focus');
    ok('CQ-H1 "Create a Focus …" names the existing action, with NO model configured',
      !!fProp);
    ok('CQ-H1b …carrying the PERSON\'S own remaining words, sourced as theirs',
      !!fProp && fProp.effect && fProp.effect.text === 'try player-led debriefs'
      && fProp.effect.textSource === 'user_stated');
    ok('CQ-H1c …needing a human confirmation, and saying so',
      !!fProp && fProp.requiredApproval === true && /nothing happens until you confirm/i.test(askFocus.text));
    ok('CQ-H1d …and writing NOTHING on its own',
      (await countFocuses()) === focusesBefore);

    /* Inquiry now follows the same governed-discovery law as High/Low. A person can offer the
       unresolved question, but cannot command canonical Inquiry standing into existence. */
    const askInq = await propose('Create an Inquiry into why substitutes feel disconnected.');
    ok('CQ-H2 "Create an Inquiry …" cannot manufacture governed Inquiry standing',
      !askInq.actions.some(a => a.actionType === 'create_inquiry'));
    ok('CQ-H2a …and the response does not falsely claim an Inquiry was created',
      !/created (?:an |the )?inquiry|I have created/i.test(askInq.text));
    ok('CQ-H2b …and writes nothing on its own either',
      (await countInquiries()) === inquiriesBefore);

    /* A HIGH AND A LOW ARE NOT A PROVIDER PROBLEM. Neither is a record: both are PROJECTIONS of
       observations people contributed to a group. There is no action to fail, and inventing one
       would be inventing a second canonical owner. The answer names where it actually happens. */
    for (const [what, utterance] of [
      ['High', 'Create a High about our pressing being much more coordinated today.'],
      ['Low',  'Create a Low about substitute role clarity.'],
    ]) {
      const r = await propose(utterance);
      ok(`CQ-H3 "${what}": no action is invented for it`,
        !r.actions.some(a => /^create_(high|low)$/.test(String(a.actionType))));
      ok(`CQ-H3b "${what}": …and the answer says it is what APPEARS when a group has offered it`,
        /is not something I create/i.test(r.text) && /offered the same observation/i.test(r.text));
      ok(`CQ-H3c "${what}": …and points at the group, which is where that happens`,
        /open your group and offer it there/i.test(r.text));
      ok(`CQ-H3d "${what}": …and confirms the words are kept privately rather than lost`,
        /nothing was saved or shared/i.test(r.text));
      ok(`CQ-H3e "${what}": …and never claims it has been created`,
        !/created it|I have created|added a (?:high|low)/i.test(r.text));
    }

    /* AND THE PARSER IS A PARSER. It must stay silent on anything that is not an explicit
       imperative naming one of the product's own object words. */
    const ordinary = await propose('Nobody talks after we lose.');
    ok('CQ-H4 an ordinary observation names no creation action',
      !ordinary.actions.some(a => /^create_/.test(String(a.actionType))));
    const wondering = await propose('Should I create a focus for this?');
    ok('CQ-H4b …and a QUESTION about creating one is not a command to create one',
      !wondering.actions.some(a => /^create_/.test(String(a.actionType))));
    const bare = await propose('Create a focus');
    ok('CQ-H4c …and "create a focus" with nothing after it proposes nothing, because it names nothing',
      !bare.actions.some(a => a.actionType === 'create_focus'));
    /* ── A CLAIM I MADE AND HAD NOT TESTED ──────────────────────────────────────────────────
       The parser's comment says it does not set `requested`, so the reading goes through the same
       grounding a model-proposed action gets. Mutating the call site to pass `requested: true`
       produced ZERO failures — the property was asserted in prose and nowhere else.

       It is also weaker than it first sounds, and that is recorded rather than dressed up: today
       no parsed command reaches a case where the two differ, because `readCommand` already
       refuses a question and already requires a payload, so the grounding's own question and
       stated-intent tests have nothing left to catch. What the flag would change is the FUTURE —
       the day the parser is widened, `requested: true` would silently exempt it from the tests
       that stop a question becoming a commitment.

       So the assertion is on the call site, which is the thing that would actually regress. */
    ok('CQ-H4d the command shape does not claim to be a pressed control, so the grounding still judges it',
      () => {
        const fs = require('fs'), path = require('path');
        const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
        const i = src.indexOf('const cmd = composerActions.readCommand(text);');
        const body = src.slice(i, i + 700);
        return i > 0 && /composerActions\.ground\(reading, \{ text, priorMessages, context \}\)/.test(body)
          && !/requested:\s*true/.test(body);
      });

    ok('CQ-H5 after every one of those, the record is exactly where it was',
      (await countFocuses()) === focusesBefore && (await countInquiries()) === inquiriesBefore);

    /* ══ H2 — AND THEN A HUMAN CONFIRMS, WITH NO MODEL, AND THE CANONICAL OWNER WRITES ═══════
       The whole point of the adjudication: the pilot runs with the provider off, and a coach must
       be able to start something and have it be real. Everything after the parser is the path a
       pressed control already takes. */
    console.log('\n  H2 — AND CONFIRMING IT, STILL WITH NO MODEL, WRITES THROUGH THE CANONICAL OWNER');
    const conf = await call('POST', `/api/assistant/turn/${askFocus.turnId}/confirm`,
      { proposalId: fProp.id }, 'coach');
    ok('CQ-H6 confirmation succeeds with no provider anywhere in the path',
      conf.status === 200 && conf.j.ok === true && conf.j.confirmed === 'create_focus'
      && conf.j.outcome === 'created');
    ok('CQ-H6b …with the person\'s words unchanged and nothing invented beside them',
      conf.j.focus.text === 'try player-led debriefs'
      && conf.j.focus.target === null && conf.j.focus.reviewAt === null);
    ok('CQ-H6c …private by default, because a commitment\'s audience is a separate decision',
      conf.j.focus.visibility === 'private');
    ok('CQ-H6d …and it is readable afterwards through the ordinary object path',
      (await countFocuses()) === focusesBefore + 1);
    ok('CQ-H6e …and it was models-off throughout, which is the state the pilot runs in',
      process.env.IQ_DETERMINISTIC_ONLY === '1');

  } catch (e) { fail++; console.error('  FAIL composer-coach-questions threw:', e && e.stack); }

  server.close();
  console.log(`\ncomposer-coach-questions-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
