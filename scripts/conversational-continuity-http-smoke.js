/* Truth layer — FOUR FORMS, ONE INTELLIGENCE, FOLLOWED THROUGH TIME.

   RATIFIED FOUNDER LAW, September 2026:

     Focus is the one primary intelligence object a human deliberately creates. High, Low and
     Inquiry are governed standings that may arise from human contributions, questions and
     evidence. Prove journeys such as Inquiry → Focus → Outcome → Learning and High → Focus →
     Outcome → Learning without creating disconnected copies of the underlying intelligence.

   The authority/truth split must survive every journey: human speech establishes what they said,
   asked or chose; governed evidence establishes standing; a Focus establishes deliberate
   intention, not that the chosen intervention will work.

   HOW THIS IS DRIVEN. Through the bounded action schema, with the provider boundary stubbed — the
   model picks an action NAME and everything on both sides of that is this codebase's. No English
   pattern is added anywhere to make these pass, which is the point: section G asks in Shona and
   Ndebele and reaches the same owners.

   WHAT "NO DISCONNECTED COPIES" MEANS, asserted rather than asserted-about: after the whole
   journey there is ONE Inquiry, ONE Focus and ONE outcome, each reachable from the other end, and
   the Inquiry does not vanish because a Focus now exists.

   Run: node scripts/conversational-continuity-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const gateway = require('../ai/gateway.js');
const SEEN = [];
let NEXT = { actions: [] };
gateway.enabled = () => true;
gateway.deterministicOnly = () => false;
gateway.completeJSON = async ({ user }) => { SEEN.push(String(user || '')); return NEXT; };
gateway.complete = async () => 'Understood.';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'cvc', NOW = Date.now(), DAY = 86400000;
const SQUAD = ['me', 'p2', 'p3', 'p4', 'p5'];
const SIG = (who, n) => ({ kind: 'observation', status: 'active', source: who,
  originRef: `o_${who}_${n}`, at: NOW - 3 * DAY, turnId: `t_${who}_${n}`, directness: 'direct',
  authority: 'corroborated', specificity: 0.7, ref: `ev_${who}_${n}`, contributedBy: who,
  text: 'we went quiet after conceding' });
const INQ = (id, concept, label, subj) => ({
  inquiryId: id, subjectRef: subj, topic: { canonicalConcept: concept, label }, status: 'exploring',
  hypotheses: [{ id: `h_${id}`, statement: `A working read about ${label}`,
    supportRefs: SQUAD.map((w, i) => `ev_${w}_${id + i}`), challengeRefs: [],
    confidence: { score: 0.7, band: 'probable' }, status: 'open', createdAt: NOW }],
  leadingHypothesisId: `h_${id}`, signals: SQUAD.map((w, i) => SIG(w, id + i)),
  confidence: { score: 0.7, band: 'probable', because: ['5 independent origins'] },
  missingSignals: [{ question: 'does speaking first actually change it?' }],
  falsifiers: [], timeline: [], lastUpdatedAt: NOW });

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Highlanders', orgMode: 'sports' } },
  orgUsers: { [C]: Object.fromEntries([
    ...SQUAD.map((id, i) => [id, { id, name: `Player ${i + 1}`, email: `${id}@v.io`, role: 'member',
      orgCode: C, status: 'active', assignedNodeIds: ['first'], profileComplete: true }]),
    ['coach', { id: 'coach', name: 'Coach', email: 'c@v.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['first'], assignedNodeIds: ['first'], profileComplete: true }],
  ]) },
  orgNodes: { [C]: { first: { nodeId: 'first', name: 'First Team', parentId: null,
    childNodeIds: [], memberIds: [...SQUAD, 'coach'], leaderIds: ['coach'] } } },
  inquiryStates: { [C]: {
    'member:me': { m: INQ('inq_mine', 'football.quiet', 'How I react after conceding', 'member:me') },
  } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = w => ({ Authorization: `Bearer ${issueToken(w, C, w === 'coach' ? 'coach' : 'member')}`,
    'Content-Type': 'application/json' });
  const call = (m, u, b, w = 'me') => fetch(base + u, { method: m, headers: H(w),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const say = (text, extra, w = 'me') => call('POST', '/api/assistant/turn',
    Object.assign({ text }, extra || {}), w);
  const props = r => (((r.j || {}).response) || {}).proposedActions || [];
  const said = r => String((((r.j || {}).response) || {}).responseText || '');
  /* The model answers with one action name; everything after that is this codebase's. */
  const picks = (type, args) => { NEXT = { actions: [{ type, arguments: args || {},
    reason: 'the person asked for it' }], needsClarification: null }; };
  const none = () => { NEXT = { actions: [], needsClarification: null }; };
  const listed = async (kind, scope, w = 'me') =>
    (((await call('GET', `/api/objects?kind=${kind}&scope=${scope}`, undefined, w)).j || {}).objects || [])
      .map(o => String(o.id));
  /* Say it, then say yes IN WORDS — the way a person answers a question in a conversation. */
  const sayYes = async (word, w = 'me', extra) => {
    const r = await say(word, extra, w);
    const acc = (((r.j || {}).response) || {}).acceptance;
    if (!acc || !acc.resolves) return { acc, done: null, r };
    const done = await call('POST', `/api/assistant/turn/${acc.turnId}/confirm`,
      { proposalId: acc.resolves }, w);
    return { acc, done, r };
  };

  try {
    /* ══ A — GOVERNED INQUIRY → FOCUS → OUTCOME → LEARNING, BY TALKING ═══════════════════════
       The question already has governed standing from evidence. The person may discuss it and
       deliberately choose a Focus; conversation must not manufacture a second Inquiry copy. */
    console.log('\n  A — THE WHOLE LOOP, WITHOUT A HUMAN-CREATED INQUIRY');
    const inqBefore = await listed('inquiry', 'self');
    const focusBefore = await listed('focus', 'self');
    const iid = 'inq_mine';
    const iBefore = (((await call('GET', '/api/objects?kind=inquiry&scope=self')).j || {}).objects || [])
      .find(o => String(o.id) === iid);
    const standingBefore = JSON.stringify(((iBefore || {}).explained || {}).confidence || null);

    none();
    const a1 = await say('Why does that keep happening?', { about: { kind: 'inquiry', id: iid } });
    ok('A1 asking why does not create a second Inquiry action',
      !props(a1).some(p => p.actionType === 'create_inquiry'));
    ok('A2 …and the governed Inquiry remains the same canonical object',
      (await listed('inquiry', 'self')).filter(id => id === iid).length === 1);
    const iCard = (((await call('GET', '/api/objects?kind=inquiry&scope=self')).j || {}).objects || [])
      .find(o => String(o.id) === iid);
    ok('A3 …with evidence-derived standing still present', !!iCard && !!(iCard.explained || {}).confidence);
    ok('A4 …and asking the question did not upgrade or erase that standing',
      JSON.stringify(((iCard || {}).explained || {}).confidence || null) === standingBefore);

    picks('create_focus', { text: 'Speak first after we concede' });
    const a6 = await say('I want to work on that — speaking first after we concede',
      { about: { kind: 'inquiry', id: iid } });
    ok('A6 "I want to work on that" is offered as a focus to start',
      props(a6).some(p => p.actionType === 'create_focus'));
    const a6y = await sayYes('yeah', 'me');
    const fid = String(((a6y.done || {}).j || {}).focus?.id || '');
    ok('A7 …and saying yes starts it', !!fid && a6y.done.status === 200);
    ok('A8 …remembering which governed question it came out of',
      String((((a6y.done.j || {}).focus || {}).addresses || {}).id) === iid);
    const fCard = (((await call('GET', '/api/objects?kind=focus&scope=self')).j || {}).objects || [])
      .find(o => String(o.id) === fid);
    ok('A9 …and the Focus is an intention, never a confidence claim',
      /you set this|you decided to work on/i.test(String(((fCard.present || {}).summary || {}).standingWhy || ''))
      && !(fCard.explained || {}).confidence);

    picks('record_focus_outcome', { outcome: 'helped' });
    const a10 = await say('We tried it today and it helped', { about: { kind: 'focus', id: fid } });
    ok('A10 the reported outcome is offered against the Focus',
      props(a10).some(p => p.actionType === 'record_focus_outcome'));
    const a10y = await sayYes('yeah');
    ok('A11 …and it lands on THAT focus',
      a10y.done && a10y.done.status === 200 && String(a10y.done.j.focusId) === fid);

    none();
    const a12 = await say('What have we learned about speaking first?');
    ok('A12 …and asking later, from Home, reaches the learning',
      /Speak first after we concede/i.test(said(a12)) && /it helped/i.test(said(a12)));

    

    /* ══ B — AND NOTHING WAS DUPLICATED OR LOST GOING ROUND ════════════════════════════════ */
    console.log('\n  B — ONE INTELLIGENCE, NOT FOUR COPIES OF IT');
    const inqAfter = await listed('inquiry', 'self');
    const focusAfter = await listed('focus', 'self');
    ok('B1 no duplicate Inquiry was opened by conversation', inqAfter.length === inqBefore.length);
    ok('B2 exactly one Focus was started', focusAfter.length === focusBefore.length + 1);
    ok('B3 the Inquiry did not disappear because a Focus now exists', inqAfter.includes(iid));
    ok('B4 …and the seeded Inquiry was not replaced by a copy of itself',
      inqAfter.includes('inq_mine'));
    const rel = ((await call('GET', `/api/objects/focus/${fid}/related`)).j || {});
    ok('B5 the Focus names the question it addresses',
      (rel.related || []).some(r => String(r.ref) === `inquiry:${iid}` && r.type === 'addresses'));
    const relBack = ((await call('GET', `/api/objects/inquiry/${iid}/related`)).j || {});
    ok('B6 …and the question names the Focus back',
      (relBack.related || []).some(r => String(r.ref) === `focus:${fid}` && r.type === 'addressed_by'));
    ok('B7 …and the loop carries what came of it', (relBack.loop || {}).outcome === 'helped');

    /* ══ C — HIGH → FOCUS → OUTCOME → LEARNING ═════════════════════════════════════════════
       The founder's second sequence, and the law that goes with it: recording a strength does not
       make it proven. */
    console.log('\n  C — A STRENGTH SOMEBODY CLAIMS IS NOT A STRENGTH SOMEBODY PROVED');
    const highs = await listed('high', 'all');
    ok('C1 recording an outcome produced a High to stand on', highs.length > 0);
    const hCard = (((await call('GET', '/api/objects?kind=high&scope=all')).j || {}).objects || [])[0];
    /* IT MUST NOT READ AS EMPIRICAL CORROBORATION. */
    ok('C2 …and it is not presented as proven organisational truth',
      !/proven|established|confirmed strength/i.test(
        String((hCard.explained || {}).claim || '') + String((hCard.explained || {}).headline || '')));
    none();
    picks('create_focus', { text: 'Get even better at speaking first under pressure' });
    const c3 = await say('I want to get even better at this under pressure',
      { about: { kind: 'high', id: String(hCard.id) } });
    ok('C3 "I want to get even better at this" from a High is offered as a focus',
      props(c3).some(p => p.actionType === 'create_focus'));
    const c3y = await sayYes('yeah');
    const cfid = String(((c3y.done || {}).j || {}).focus?.id || '');
    ok('C4 …and it starts one, through the same owner', !!cfid && c3y.done.status === 200);
    ok('C5 …which remembers the High it came out of',
      String((((c3y.done.j || {}).focus || {}).addresses || {}).id) === String(hCard.id));
    ok('C6 …and the High is still there, not replaced by the Focus',
      (await listed('high', 'all')).includes(String(hCard.id)));

    /* ══ D — THE OUTCOME WORD IS THE PERSON'S, IN EVERY FORM THEY SAY IT ═══════════════════
       The founder's list: "That helped." / "That didn't work." / "No real difference." */
    console.log('\n  D — AND HOW IT WENT IS ALWAYS THEIR WORD, NEVER THE MODEL\'S');
    const mk = async text => {
      const f = await call('POST', '/api/me/focus', { text });
      return String(f.j.focus.id);
    };
    const f1 = await mk('Try the short corner');
    picks('record_focus_outcome', { outcome: 'helped' });
    ok('D1 "that helped" records that it helped',
      (await (async () => { const r = await say('That helped', { about: { kind: 'focus', id: f1 } });
        const p = props(r).find(x => x.actionType === 'record_focus_outcome');
        if (!p) return null;
        return (await call('POST', `/api/assistant/turn/${r.j.turnId}/confirm`, { proposalId: p.id })).j;
      })() || {}).outcome === 'helped');
    const f2 = await mk('Try the long throw');
    picks('record_focus_outcome', { outcome: 'no' });
    const d2 = await say("That didn't work", { about: { kind: 'focus', id: f2 } });
    ok('D2 "that didn\'t work" records that it did not help',
      props(d2).some(p => p.actionType === 'record_focus_outcome'));
    const f3 = await mk('Try rotating the keeper distribution');
    picks('record_focus_outcome', { outcome: 'no' });
    const d3 = await say('No real difference', { about: { kind: 'focus', id: f3 } });
    ok('D3 "no real difference" records no change',
      props(d3).some(p => p.actionType === 'record_focus_outcome'));
    /* AND THE MODEL CANNOT DECIDE IT. Same action, same context, a word the person never said. */
    const f4 = await mk('Try pressing from the front');
    picks('record_focus_outcome', { outcome: 'helped' });
    const d4 = await say('We tried it today', { about: { kind: 'focus', id: f4 } });
    ok('D4 …but a word the person never said records nothing',
      !props(d4).some(p => p.actionType === 'record_focus_outcome'));
    ok('D5 …and they are asked, in the words that focus\'s own screen offers',
      /did it help, not help, or was it mixed/i.test(said(d4)));

    /* ══ E — CHOOSING BETWEEN TWO DELIBERATE FOCUSES THAT WERE OFFERED ═══════════════════════
       Ambiguous acceptance is still a conversation problem; it does not require a synthetic
       create_inquiry action to prove it. */
    console.log('\n  E — AND CHOOSING AMONG WHAT WAS OFFERED');
    NEXT = { actions: [
      { type: 'create_focus', arguments: { text: 'Name who takes the restart' }, reason: 'one' },
      { type: 'create_focus', arguments: { text: 'Have the keeper call the restart' }, reason: 'two' },
    ], intent: 'stated', needsClarification: null };
    const e0 = await say("I want to work on naming who takes the restart, and separately have the keeper call the restart");
    ok('E1 two deliberate Focus options are offered', props(e0).length >= 2);
    none();
    const bare = await say('yeah');
    ok('E2 a bare yes against two does not guess',
      !((((bare.j || {}).response) || {}).acceptance || {}).resolves);
    ok('E3 …it asks which',
      /which/i.test(String(((((bare.j || {}).response) || {}).acceptance || {}).ask || '')));
    NEXT = { actions: [
      { type: 'create_focus', arguments: { text: 'Name who takes the restart' }, reason: 'one' },
      { type: 'create_focus', arguments: { text: 'Have the keeper call the restart' }, reason: 'two' },
    ], intent: 'stated', needsClarification: null };
    await say("I want to work on naming who takes the restart, and separately have the keeper call the restart");
    none();
    const firstOne = await sayYes("Let's try the first one");
    ok('E4 "let\'s try the first one" resolves to the first', !!firstOne.acc && !!firstOne.acc.resolves);
    ok('E5 …and reaches the governed owner', firstOne.done && firstOne.done.status === 200);
    ok('E6 …creating the deliberate Focus that was actually chosen',
      String(firstOne.done.j.confirmed) === 'create_focus');

    

    /* ══ F — "I DISAGREE" REACHES THE DISAGREEMENT BOUNDARY ════════════════════════════════ */
    console.log('\n  F — AND DISAGREEING IS A CONTRIBUTION, NOT A COMPLAINT');
    picks('disagree_with_inquiry', { because: 'I think it is the keeper going quiet, not the outfield' });
    const f5 = await say('I disagree — I think it is the keeper, not the outfield',
      { about: { kind: 'inquiry', id: 'inq_mine' } });
    ok('F1 "I disagree" is offered as a recorded disagreement',
      props(f5).some(p => p.actionType === 'disagree_with_inquiry'));
    const f5y = await sayYes('yeah');
    ok('F2 …and it reaches the governed boundary, against that inquiry',
      f5y.done && f5y.done.status === 200 && String(f5y.done.j.inquiryId) === 'inq_mine');
    ok('F3 …and is recorded as an account rather than averaged away',
      /not averaged away/i.test(String(f5y.done.j.note)));
    /* AND A HUMAN-CONTRIBUTED CONCERN IS NOT AN ESTABLISHED WEAKNESS. */
    const lows = (((await call('GET', '/api/objects?kind=low&scope=all')).j || {}).objects || []);
    ok('F4 …and the Low it produces says accounts differ, not that something is proven wrong',
      lows.some(l => /do not agree|differ/i.test(
        String((l.explained || {}).claim || '') + String((l.explained || {}).headline || ''))));

    /* ══ G — AND THE SAME AUTHORITY BOUNDARY HOLDS IN OTHER LANGUAGES ════════════════════════ */
    console.log('\n  G — SHONA CAN CHOOSE A FOCUS; NDEBELE CANNOT COMMAND AN INQUIRY INTO EXISTENCE');
    SEEN.length = 0;
    NEXT = { actions: [{ type: 'create_focus',
      arguments: { text: 'Taura kutanga kana tabvisirwa' }, reason: 'they said they want to' }],
      intent: 'stated', needsClarification: null };
    const g1 = await say('Ndinoda kushanda pakutaura kutanga kana tabvisirwa');
    ok('G0 a Shona declaration of intent produces a Focus proposal', props(g1).some(p => p.actionType === 'create_focus'));
    ok('G1 the Shona sentence reaches the provider with the bounded action list',
      SEEN.length > 0 && SEEN.join('').includes('create_focus'));
    const g1y = await sayYes('hongu');
    ok('G2 "hongu" is not a deterministic acceptance word, so no pattern guesses',
      !g1y.acc || !g1y.acc.resolves);
    const g1p = props(g1).find(p => p.actionType === 'create_focus') || { id: '__no_proposal__' };
    const g1done = await call('POST', `/api/assistant/turn/${g1.j.turnId}/confirm`, { proposalId: g1p.id });
    ok('G3 confirming the card reaches the same governed owner', g1done.status === 200 && !!g1done.j.focus);
    ok('G4 …and the Focus carries the person\'s own words, untranslated',
      /Taura kutanga/.test(String(((g1done.j || {}).focus || {}).text)));

    const ndebeleBefore = await listed('inquiry', 'self');
    SEEN.length = 0;
    none();
    const g5 = await say('Ngifuna ukwazi ukuthi kungani sithula nxa sesivinjelwe');
    ok('G5 an Ndebele question still reaches the provider, whose action list has no create_inquiry',
      SEEN.length > 0 && !SEEN.join('').includes('create_inquiry'));
    ok('G6 …and the language layer cannot turn that question into a canonical standing by itself',
      !props(g5).some(p => p.actionType === 'create_inquiry')
      && (await listed('inquiry', 'self')).length === ndebeleBefore.length);

    

    /* ══ H — AND THE MODEL'S READING IS A READING, NOT AUTHORITY ═══════════════════════════
       Section G handed the model a field that opens the commitment gate, which is the right
       architecture and also a new surface: the party that reads the sentence can now say the
       word that lets a Focus be staged. Two properties stop that becoming a way to TALK past
       the gate, and NEITHER WAS ASSERTED when the fix first went in — two mutations survived
       the very suite that found the defect, and the second survived `npm test` entire. That is
       the shape round 5 warned about: a suite that proves the capability and not the limit.

         · the field is CLOSED. Two exact strings and nothing else: no coercion, no truthiness,
           no unknown value falling through to the permissive one. A field that took whatever
           arrived would let a provider open the gate with almost any reply.
         · the QUESTION VETO IS NOT NEGOTIABLE. "Should I work on this?" is not a declaration
           however it is labelled, so deterministic code keeps the refusal. The model interprets
           language; it does not acquire mutation authority. H4 asks it in English and in Shona,
           because that veto is punctuation and structure rather than vocabulary and must not
           quietly become another thing that only works in one language.

       H5 is the control that stops the four refusals above it being satisfied by a route that
       stages nothing at all: the SAME Shona sentence, with the field filled in properly, does
       produce the proposal. Without it, deleting create_focus outright would make H1-H4 greener. */
    console.log('\n  H — THE FIELD IS CLOSED, AND THE QUESTION VETO STAYS WITH THE CODE');
    const DECLARES = 'Ndinoda kushanda pakuchengetedza bhora';
    const ASKS_SN  = 'Ndoita sei kuti ndichengetedze bhora?';
    /* One helper, one sentence, one variable: what the model says it read. */
    const readAs = async (intent, text) => {
      NEXT = { actions: [{ type: 'create_focus', arguments: { text: 'Chengetedza bhora' },
        reason: 'they said so' }], intent, needsClarification: null };
      return props(await say(text || DECLARES)).some(p => p.actionType === 'create_focus');
    };
    ok('H1 a reading that is not one of the two words does not open the commitment gate',
      !(await readAs('declared')));
    ok('H2 …nor does one that merely CONTAINS the word',
      !(await readAs('stated: they clearly want this')));
    ok('H3 …nor a value that is only the word once something has coerced it to a string',
      !(await readAs(['stated'])) && !(await readAs({ toString: () => 'stated' })));
    ok('H4 …and a question is still a question however the model labelled it',
      !(await readAs('stated', 'Should I work on keeping the ball?'))
      && !(await readAs('stated', ASKS_SN)));
    ok('H5 …while the same sentence, read as a declaration, does produce the proposal',
      await readAs('stated'));

  } catch (e) { fail++; console.error('  FAIL conversational-continuity suite threw:', e && e.stack); }

  server.close();
  console.log(`\nconversational-continuity-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
