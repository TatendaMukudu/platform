/* Truth layer — FOUR FORMS, ONE INTELLIGENCE, FOLLOWED THROUGH TIME.

   FOUNDER, September 2026:

     Humans may create all four. But they are not four independent intelligence systems. Prove
     journeys such as Low → Inquiry → Focus → Outcome → Learning, and High → Focus → Outcome →
     Learning, without creating disconnected copies of the underlying intelligence.

   And the four laws that must survive being created by a person:

     A human-created High does not become empirically proven strength merely because it was
     recorded. A human-created Low does not become empirically proven organizational weakness. A
     human-created Inquiry does not establish its premise. A human-created Focus establishes
     deliberate intention, not that the chosen intervention will work.

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
    /* ══ A — LOW → INQUIRY → FOCUS → OUTCOME → LEARNING, BY TALKING ═════════════════════════
       The founder's own sequence. Each step is a sentence a person would really say, and each one
       reaches a governed owner through a confirmation. */
    console.log('\n  A — THE WHOLE LOOP, ONE SENTENCE AT A TIME');
    const inqBefore = await listed('inquiry', 'self');
    const focusBefore = await listed('focus', 'self');

    picks('create_inquiry', { text: 'why we go quiet after conceding' });
    const a1 = await say('Why does that keep happening?');
    ok('A1 "why does that keep happening" is offered as a question to open',
      props(a1).some(p => p.actionType === 'create_inquiry'));
    const a1y = await sayYes('yeah');
    const iid = String(((a1y.done || {}).j || {}).inquiry?.id || '');
    ok('A2 …and saying yes in words opens it', !!iid && a1y.done.status === 200);
    ok('A3 …and it is on the Inquiries surface, not only in the reply',
      (await listed('inquiry', 'self')).includes(iid));

    /* AND A HUMAN-OPENED INQUIRY DOES NOT ESTABLISH ITS PREMISE. Asking why something happens is
       not evidence that it happens. */
    const iCard = (((await call('GET', '/api/objects?kind=inquiry&scope=self')).j || {}).objects || [])
      .find(o => String(o.id) === iid);
    ok('A4 …carrying no confidence, because asking a question proves nothing',
      !(iCard.explained || {}).confidence);
    ok('A5 …and saying it has no read yet rather than agreeing with the premise',
      /don'?t have a read on this yet/i.test(String((iCard.explained || {}).claim || '')));

    /* FROM THE QUESTION TO SOMETHING TO DO ABOUT IT. */
    none();
    picks('create_focus', { text: 'Speak first after we concede' });
    const a6 = await say('I want to work on that — speaking first after we concede',
      { about: { kind: 'inquiry', id: iid } });
    ok('A6 "I want to work on that" is offered as a focus to start',
      props(a6).some(p => p.actionType === 'create_focus'));
    const a6y = await sayYes('yeah', 'me');
    const fid = String(((a6y.done || {}).j || {}).focus?.id || '');
    ok('A7 …and saying yes starts it', !!fid && a6y.done.status === 200);
    ok('A8 …remembering which question it came out of',
      String((((a6y.done.j || {}).focus || {}).addresses || {}).id) === iid);
    /* AND A HUMAN-STARTED FOCUS IS AN INTENTION, NOT A PREDICTION. */
    const fCard = (((await call('GET', '/api/objects?kind=focus&scope=self')).j || {}).objects || [])
      .find(o => String(o.id) === fid);
    ok('A9 …and the card says they decided it rather than that it will work',
      /you set this|you decided to work on/i.test(String(((fCard.present || {}).summary || {}).standingWhy || ''))
      && !(fCard.explained || {}).confidence);

    /* AND WHAT CAME OF IT. */
    picks('record_focus_outcome', { outcome: 'helped' });
    const a10 = await say('We tried it today and it helped', { about: { kind: 'focus', id: fid } });
    ok('A10 "we tried it today and it helped" is offered as an outcome',
      props(a10).some(p => p.actionType === 'record_focus_outcome'));
    const a10y = await sayYes('yeah');
    ok('A11 …and it lands on THAT focus',
      a10y.done && a10y.done.status === 200 && String(a10y.done.j.focusId) === fid);

    /* AND THEN IT IS LEARNING, REACHABLE FROM HOME WITH NOTHING BOUND. */
    none();
    const a12 = await say('What have we learned about speaking first?');
    ok('A12 …and asking later, from Home, reaches it',
      /Speak first after we concede/i.test(said(a12)) && /it helped/i.test(said(a12)));

    /* ══ B — AND NOTHING WAS DUPLICATED OR LOST GOING ROUND ════════════════════════════════ */
    console.log('\n  B — ONE INTELLIGENCE, NOT FOUR COPIES OF IT');
    const inqAfter = await listed('inquiry', 'self');
    const focusAfter = await listed('focus', 'self');
    ok('B1 exactly one Inquiry was opened', inqAfter.length === inqBefore.length + 1);
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

    /* ══ E — CHOOSING BETWEEN THINGS THAT WERE OFFERED ═════════════════════════════════════
       The founder's list: "Let's try the first one." / "The other one." / "Yeah." */
    console.log('\n  E — AND CHOOSING AMONG WHAT WAS OFFERED');
    /* A DECLARATIVE SENTENCE, not a question. "What could we try?" is a question, and the
       commitment gate correctly refuses to manufacture a Focus out of somebody wondering aloud —
       so the first version of this offered one thing, not two, and the ambiguity it meant to test
       never existed. The product was right; the fixture was asking the wrong thing. */
    NEXT = { actions: [
      { type: 'create_focus', arguments: { text: 'Name who takes the restart' }, reason: 'one' },
      { type: 'create_inquiry', arguments: { text: 'whether the keeper should hold it' }, reason: 'two' },
    ], intent: 'stated', needsClarification: null };
    const e0 = await say("Let's try naming who takes the restart, and I also want to understand whether the keeper should hold it");
    ok('E1 two things are offered', props(e0).length >= 2);
    none();
    const bare = await say('yeah');
    ok('E2 a bare yes against two does not guess',
      !((((bare.j || {}).response) || {}).acceptance || {}).resolves);
    ok('E3 …it asks which',
      /which/i.test(String(((((bare.j || {}).response) || {}).acceptance || {}).ask || '')));
    /* AND AN ORDINAL RESOLVES. */
    NEXT = { actions: [
      { type: 'create_focus', arguments: { text: 'Name who takes the restart' }, reason: 'one' },
      { type: 'create_inquiry', arguments: { text: 'whether the keeper should hold it' }, reason: 'two' },
    ], intent: 'stated', needsClarification: null };
    await say("Let's try naming who takes the restart, and I also want to understand whether the keeper should hold it");
    none();
    const firstOne = await sayYes("Let's try the first one");
    ok('E4 "let\'s try the first one" resolves to the first', !!firstOne.acc && !!firstOne.acc.resolves);
    ok('E5 …and reaches the governed owner', firstOne.done && firstOne.done.status === 200);
    ok('E6 …creating the thing that was actually offered first',
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

    /* ══ G — AND ALL OF IT WORKS IN ANOTHER LANGUAGE ═══════════════════════════════════════
       The whole reason understanding belongs to the model. Nothing below adds a pattern; the same
       bounded action list crosses the boundary and the same owners run. */
    console.log('\n  G — THE SAME ARCHITECTURE, ASKED IN SHONA AND NDEBELE');
    SEEN.length = 0;
    /* THE MODEL SAYS WHETHER THEY DECLARED IT. This is the fix for the defect this section found:
       the commitment gate used to be an ENGLISH WORD LIST, so a Shona sentence meaning "I want to
       work on speaking first" produced no Focus even though the model had understood it, picked
       the right action and supplied the right words. Reading a sentence is the model's half; the
       bounded two-value field is how it says what it read, and `ground` still vetoes a question. */
    NEXT = { actions: [{ type: 'create_focus',
      arguments: { text: 'Taura kutanga kana tabvisirwa' }, reason: 'they said they want to' }],
      intent: 'stated', needsClarification: null };
    const g1 = await say('Ndinoda kushanda pakutaura kutanga kana tabvisirwa');
    ok('G0 a Shona declaration of intent produces a Focus proposal — it used to produce nothing',
      props(g1).some(p => p.actionType === 'create_focus'));
    ok('G1 a Shona sentence reaches the provider with the bounded action list',
      SEEN.length > 0 && SEEN.join('').includes('create_focus'));
    const g1y = await sayYes('hongu');
    ok('G2 …and "hongu" is not an acceptance word this repo knows, so it is not resolved by pattern',
      !g1y.acc || !g1y.acc.resolves);
    /* THE HONEST HALF. Acceptance in another language is not a deterministic capability — saying
       so is better than a Shona word list, which is the allowlist the language layer already lost
       once. Confirming through the card still works, and that is the path that must not break. */
    const g1p = props(g1).find(p => p.actionType === 'create_focus');
    const g1done = await call('POST', `/api/assistant/turn/${g1.j.turnId}/confirm`, { proposalId: g1p.id });
    ok('G3 …while confirming it reaches the same governed owner',
      g1done.status === 200 && !!g1done.j.focus);
    ok('G4 …and the Focus carries the person\'s own words, untranslated',
      /Taura kutanga/.test(String(g1done.j.focus.text)));
    SEEN.length = 0;
    picks('create_inquiry', { text: 'kungani sithula nxa sesivinjelwe' });
    const g5 = await say('Ngifuna ukwazi ukuthi kungani sithula nxa sesivinjelwe');
    ok('G5 an Ndebele sentence gets the same bounded list',
      SEEN.length > 0 && SEEN.join('').includes('create_inquiry'));
    ok('G6 …and produces the same governed proposal',
      props(g5).some(p => p.actionType === 'create_inquiry'));

  } catch (e) { fail++; console.error('  FAIL conversational-continuity suite threw:', e && e.stack); }

  server.close();
  console.log(`\nconversational-continuity-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
