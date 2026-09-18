/* Truth layer — THE ACTIONS NOBODY HAD EVER DRIVEN, AND THE ARGUMENTS NOBODY HAD EVER NAMED.

   HOW THIS FILE CAME TO EXIST. The bounded action vocabulary has eighteen entries. Counting which
   of them any test had ever driven through `POST /api/assistant/turn` to a confirmation found
   EIGHT that none had: update_focus, inspect_inquiry, show_evidence, request_research,
   create_library_folder, prioritise_object, unprioritise_object, navigate_to_object. Round 5's
   ruling is exactly about this shape — a capability declared in a table, offered to a model, and
   never once carried to the end by anything — so they were driven, one at a time, to see which
   were real doors and which were painted on.

   THE ANSWER, STATED PLAINLY, because it is evidence for the freeze question: seven of the eight
   worked. Section A is that walk, kept as the standing proof, and it asserts the CANONICAL
   RESULT rather than the 200 — the focus's new wording on the surface that lists focuses, the
   folder on the Library's own folder route, the priority mark on the object's own detail, the
   navigate address pointing at the object actually in view.

   THE EIGHTH DID NOT. `create_library_folder` was offered, proposed, labelled "Create this
   Library folder", shown on a confirmation card, CONFIRMED BY A PERSON -- and answered
   400 "folder name required". Not a broken executor: the model had supplied `{ name: 'Restarts' }`
   and the only key this code reads is `folderName`, and NOTHING HAD EVER TOLD IT THAT. The schema
   handed across the boundary said `arguments: 'object containing only values stated by the user'`
   and stopped there, so every argument name in the system -- folderName, reviewOn, materialId,
   groupId, because, participantIds -- had to be guessed, and a wrong guess was dropped in silence
   by an allowlist one function away. The person who pressed Confirm got an error.

   That is what section B is about, and it is why the fix was not to add `name` to a list. An
   action schema that does not name its arguments is not a bounded schema; it is a bounded verb
   with an unbounded object. Each ACTION now declares `args`, `available()` carries the
   declaration to the model, and `normalize` filters PER ACTION from that same declaration rather
   than from a second hand-written union -- so the vocabulary has one owner and an argument
   belonging to one action can no longer ride along on another.

   Run: node scripts/conversational-action-journeys-http-smoke.js */

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

const actions = require('../ai/composer-actions.js');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'caj', NOW = Date.now(), DAY = 86400000;
const SQUAD = ['me', 'p2', 'p3', 'p4', 'p5'];
const SIG = (who, n) => ({ kind: 'observation', status: 'active', source: who,
  originRef: `o_${who}_${n}`, at: NOW - 3 * DAY, turnId: `t_${who}_${n}`, directness: 'direct',
  authority: 'corroborated', specificity: 0.7, ref: `ev_${who}_${n}`, contributedBy: who,
  text: 'we went quiet after conceding' });
const INQ = {
  inquiryId: 'q1', subjectRef: 'member:me', topic: { canonicalConcept: 'f.quiet', label: 'Going quiet' },
  status: 'exploring',
  hypotheses: [{ id: 'h1', statement: 'We stop talking after we concede',
    supportRefs: SQUAD.map((w, i) => `ev_${w}_${i}`), challengeRefs: [],
    confidence: { score: 0.7, band: 'probable' }, status: 'open', createdAt: NOW }],
  leadingHypothesisId: 'h1', signals: SQUAD.map((w, i) => SIG(w, i)),
  confidence: { score: 0.7, band: 'probable', because: ['5 independent origins'] },
  missingSignals: [], falsifiers: [], timeline: [], lastUpdatedAt: NOW };

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Highlanders', orgMode: 'sports' } },
  orgUsers: { [C]: Object.fromEntries([
    ...SQUAD.map((id, i) => [id, { id, name: `Player ${i + 1}`, email: `${id}@j.io`, role: 'member',
      orgCode: C, status: 'active', assignedNodeIds: ['first'], profileComplete: true }]),
    ['coach', { id: 'coach', name: 'Coach', email: 'c@j.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['first'], assignedNodeIds: ['first'], profileComplete: true }],
  ]) },
  orgNodes: { [C]: { first: { nodeId: 'first', name: 'First Team', parentId: null,
    childNodeIds: [], memberIds: [...SQUAD, 'coach'], leaderIds: ['coach'] } } },
  inquiryStates: { [C]: { 'member:me': { m: INQ } } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = w => ({ Authorization: `Bearer ${issueToken(w, C, w === 'coach' ? 'coach' : 'member')}`,
    'Content-Type': 'application/json' });
  const call = (m, u, b, w = 'me') => fetch(base + u, { method: m, headers: H(w),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const say = (text, about, w = 'me') => call('POST', '/api/assistant/turn',
    about ? { text, about } : { text }, w);
  const props = r => (((r.j || {}).response) || {}).proposedActions || [];
  /* The model answers with one action name and its declared arguments; everything on both sides
     of that is this codebase's. `intent` is the bounded two-value reading (see the continuity
     suite) and is supplied so a declaration reads as one. */
  const picks = (type, args) => { NEXT = { actions: [{ type, arguments: args || {},
    reason: 'the person asked for it' }], intent: 'stated', needsClarification: null }; };
  /* SAY IT, THEN CONFIRM WHAT WAS OFFERED — the whole journey, never a direct call to the owner. */
  const journey = async (type, args, words, about, w = 'me') => {
    picks(type, args);
    const r = await say(words, about, w);
    const p = props(r).find(x => x.actionType === type);
    if (!p) return { r, p: null, done: null };
    const done = await call('POST', `/api/assistant/turn/${r.j.turnId}/confirm`, { proposalId: p.id }, w);
    return { r, p, done };
  };
  const objects = async (kind, scope, w = 'me') =>
    (((await call('GET', `/api/objects?kind=${kind}&scope=${scope}`, undefined, w)).j || {}).objects || []);

  try {
    /* ══ A — THE EIGHT ACTIONS NOTHING HAD EVER CARRIED TO THE END ═════════════════════════
       Each one is a sentence, a proposal, a human confirmation and then the canonical result read
       back off the surface a person would actually look at. */
    console.log('\n  A — DRIVEN TO THE END, AND READ BACK OFF THE SURFACE');

    const made = await journey('create_focus', { text: 'Speak first after we concede' },
      'I want to work on speaking first after we concede', { kind: 'inquiry', id: 'q1' });
    const fid = String(((made.done || {}).j || {}).focus?.id || '');
    ok('A0 there is a focus to work on, started by talking', !!fid && made.done.status === 200);
    const F = { kind: 'focus', id: fid };

    /* 1 — UPDATE_FOCUS. The wording changes; the focus does not become a second focus. */
    const before = (await objects('focus', 'self')).length;
    const upd = await journey('update_focus', { text: 'Speak first within ten seconds of conceding' },
      'change that to speaking first within ten seconds of conceding', F);
    ok('A1 the focus wording can be changed by saying so', upd.done && upd.done.status === 200);
    const afterUpd = await objects('focus', 'self');
    ok('A2 …and the NEW wording is what the focus surface shows',
      afterUpd.some(o => String(o.id) === fid
        && /within ten seconds/i.test(String((o.explained || {}).headline || '') + String((o.raw || {}).text || ''))));
    ok('A3 …on the same focus, not a second one', afterUpd.length === before
      && afterUpd.some(o => String(o.id) === fid));

    /* 2-4 — THE THREE READS. Each returns an address, and it must be the address of the object
       the person was looking at rather than a different one. */
    const insp = await journey('inspect_inquiry', {}, 'show me that question', { kind: 'inquiry', id: 'q1' });
    ok('A4 asking to see the inquiry opens THAT inquiry',
      insp.done && insp.done.status === 200
      && ((insp.done.j || {}).navigate || {}).kind === 'inquiry'
      && String(((insp.done.j || {}).navigate || {}).id) === 'q1');
    const ev = await journey('show_evidence', {}, 'what is this based on', { kind: 'inquiry', id: 'q1' });
    ok('A5 asking what it is based on opens the governed evidence for THAT object',
      ev.done && ev.done.status === 200 && String(((ev.done.j || {}).navigate || {}).id) === 'q1');
    const rr = await journey('request_research', {}, 'is there any reading on this', { kind: 'inquiry', id: 'q1' });
    ok('A6 external reading can be asked for', rr.done && rr.done.status === 200);
    /* AND IT IS NEVER PRESENTED AS EVIDENCE ABOUT THESE PEOPLE. */
    ok('A7 …and it says so: cited reading is not a finding about them',
      /not a finding about you/i.test(String((rr.done.j || {}).note || '')));

    /* 5 — CREATE_LIBRARY_FOLDER. The one that was broken. */
    const fol = await journey('create_library_folder', { folderName: 'Restarts' },
      'make me a folder called Restarts');
    ok('A8 a folder asked for in conversation is created', fol.done && fol.done.status === 200);
    const folders = (((await call('GET', '/api/library/folders')).j || {}).folders || []);
    ok('A9 …and it is on the Library\'s own folder route, by the name they said',
      folders.some(f => String(f.name) === 'Restarts'));
    ok('A10 …carrying the id the confirmation returned, so the card and the shelf agree',
      folders.some(f => String(f.id) === String(((fol.done.j || {}).folder || {}).id)));

    /* 6-7 — THE PRIORITY MARK, WHICH IS THEIRS ALONE. */
    const pr = await journey('prioritise_object', {}, 'keep this near the top for me', F);
    ok('A11 marking something as a priority by saying so reaches the owner',
      pr.done && pr.done.status === 200);
    const detail = w => call('GET', `/api/objects/focus/${fid}/thread`, undefined, w);
    ok('A12 …and the object\'s own detail says it is marked',
      ((await detail('me')).j || {}).prioritised === true);
    /* IT IS A FACT ABOUT THE READER, NOT ABOUT THE OBJECT. Nobody else's screen changes. */
    const up = await journey('unprioritise_object', {}, 'take it off my priorities', F);
    ok('A13 …and taking it off again reaches the same owner', up.done && up.done.status === 200);
    ok('A14 …after which the detail says it is not marked',
      ((await detail('me')).j || {}).prioritised === false);

    /* 8 — NAVIGATE_TO_OBJECT. */
    const nav = await journey('navigate_to_object', {}, 'where is that', F);
    ok('A15 asking where something is returns that object\'s address',
      nav.done && nav.done.status === 200
      && ((nav.done.j || {}).navigate || {}).kind === 'focus'
      && String(((nav.done.j || {}).navigate || {}).id) === fid);

    /* ══ B — THE SCHEMA NAMES ITS ARGUMENTS, AND EACH ACTION ONLY ITS OWN ══════════════════ */
    console.log('\n  B — A BOUNDED VERB WITH AN UNBOUNDED OBJECT IS NOT A BOUNDED SCHEMA');
    /* WHAT CROSSES THE BOUNDARY. Asserted on the real prompt string, because the defect was that
       the model was never told these names exist. */
    SEEN.length = 0;
    picks('create_library_folder', { folderName: 'Set pieces' });
    /* Bound to the inquiry, because that is the context where most of the vocabulary is offered —
       an unbound turn is offered six actions and would prove six names. */
    await say('make me a folder called Set pieces', { kind: 'inquiry', id: 'q1' });
    const promptSent = SEEN.join('');
    ok('B1 the prompt names each action\'s arguments, so nothing has to be guessed',
      /folderName/.test(promptSent) && /reviewOn/.test(promptSent)
      && /materialId/.test(promptSent) && /because/.test(promptSent));
    ok('B2 …and it never offers evidenceRef, which the model may not author',
      !/evidenceRef/.test(promptSent));
    /* ONE OWNER FOR THE VOCABULARY. The declaration the model is shown IS the filter, so the two
       cannot drift; asserted as a property over every action rather than against a copy of the
       list, which would just be the second copy again. */
    ok('B3 every action in the vocabulary declares its arguments',
      Object.values(actions.ACTIONS).every(a => a.args && typeof a.args === 'object'));
    ok('B4 …and what the model is shown is exactly what normalize will keep',
      /* A MISSING DECLARATION MUST FAIL THIS, NOT THROW PAST THE REST OF THE SECTION. The first
         mutation run against this file removed the declaration from `available()` and B4 threw on
         `Object.keys(undefined)`, taking B5-B11 out of the run with it. */
      actions.available({ object: { kind: 'focus', id: fid } }).every(a => {
        const declared = Object.keys(a.arguments || {}).sort().join(',');
        const owned = Object.keys((actions.ACTIONS[a.type] || {}).args || {}).sort().join(',');
        return !!a.arguments && declared === owned;
      }));

    /* THE DEFECT ITSELF, DRIVEN THE WAY IT HAPPENED: the model guesses a key nobody told it. */
    const guessed = await journey('create_library_folder', { name: 'Corners' },
      'make me a folder called Corners');
    ok('B5 a folder proposal that could not be carried out is not offered at all',
      !guessed.p);
    ok('B6 …so nobody can confirm one and be told afterwards that it needed a name',
      !guessed.done);
    ok('B7 …and no folder of that name was created',
      !(((await call('GET', '/api/library/folders')).j || {}).folders || [])
        .some(f => String(f.name) === 'Corners'));
    /* THE CONTROL. The same sentence with the declared key does produce the folder, so B5-B7 are
       not passing against an action that has simply been switched off. */
    const named = await journey('create_library_folder', { folderName: 'Corners' },
      'make me a folder called Corners');
    ok('B8 …while the declared argument creates it', named.done && named.done.status === 200
      && (((await call('GET', '/api/library/folders')).j || {}).folders || [])
        .some(f => String(f.name) === 'Corners'));

    /* AND AN ARGUMENT BELONGING TO ONE ACTION NO LONGER RIDES ALONG ON ANOTHER. `create_focus`
       used to accept `visibility` from the model: the card never showed it and the canonical
       owner never read it, so it was dead weight that nonetheless looked like a model choosing
       an audience. The audience law is proved elsewhere; what is proved here is that the value
       does not survive normalize at all. */
    const n1 = actions.normalize({ actions: [{ type: 'create_focus',
      arguments: { text: 'work on restarts', visibility: 'shared', groupId: 'first', outcome: 'helped' } }] },
      { object: { kind: 'focus', id: fid } });
    ok('B9 an argument create_focus does not declare is dropped before it is anything',
      Object.keys(n1.actions[0].arguments).join(',') === 'text');
    const n2 = actions.normalize({ actions: [{ type: 'update_focus',
      arguments: { text: 'x', visibility: 'shared', participantIds: ['p2', 'p2', 'p3'] } }] },
      { object: { kind: 'focus', id: fid } });
    ok('B10 …while an action that DOES declare it keeps it, de-duplicated',
      n2.actions[0].arguments.visibility === 'shared'
      && n2.actions[0].arguments.participantIds.join(',') === 'p2,p3');
    /* AND THE ONE THE LAW FORBIDS IS FORBIDDEN AT THE FILTER, not only absent from the prompt. */
    const n3 = actions.normalize({ actions: [{ type: 'declare_focus_relation',
      arguments: { relation: 'supports', evidenceRef: 'ev_me_0' } }] },
      { object: { kind: 'focus', id: fid }, evidence: { ref: 'ev_me_0' } });
    ok('B11 the model may author the relation word and never the evidence identifier',
      n3.actions.length === 1 && n3.actions[0].arguments.relation === 'supports'
      && !('evidenceRef' in n3.actions[0].arguments));

  } catch (e) { fail++; console.error('  FAIL action-journeys suite threw:', e && e.stack); }

  server.close();
  console.log(`\nconversational-action-journeys-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
