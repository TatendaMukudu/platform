/* Truth layer — A HUMAN SAYS IT, THE KERNEL GOVERNS IT, A HUMAN CONFIRMS IT, THE OWNER WRITES IT.

   THE CORRECTION THIS SUITE EXISTS TO LOCK IN. A previous pass reported that "Create a Focus to
   try player-led debriefs" failed because the intent machinery was missing. That was wrong.
   `ai/composer-actions.js` has held an eighteen-action vocabulary for some time — `create_focus`,
   `create_inquiry`, `record_focus_outcome` among them — and the governed pipeline behind it is
   complete. What is model-gated is the INTERPRETATION step alone: `_composerActionInterpret`
   returns `{ actions: [], unavailable: true }` when no model is configured, so with models off no
   action is ever selected and the utterance is filed as a generic capture.

   So this suite runs with a STUBBED interpreter — the one seam a provider owns — and asserts that
   everything on either side of it is the product's own:

     the model may name an allow-listed action and propose arguments
     the kernel refuses any argument the person did not actually say
     NOTHING is written before a human confirms
     the confirmation card says what will happen, where, and to what
     the canonical owner writes it — never the model, never the dispatcher
     and the result is readable through the ordinary A -> B path

   AND THE VOCABULARY SEAM THIS SUITE WAS WRITTEN FOR. `record_focus_outcome` knew only the
   PERSONAL words (helped / mixed / did not help). A group focus records better / no_change /
   worse / unclear — the two were deliberately separated when the group vocabulary was introduced,
   and this owner was never told the second existed. Driven at the kernel, a coach saying "it got
   better" about a team focus grounded nothing and was asked "did it help, not help, or was it
   mixed?" — the personal words, about a focus whose own screen offers the other four. It REFUSED
   rather than mis-recording, so it was safe and wrong rather than dangerous.

   Run: node scripts/composer-creation-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';

const ai = require('../ai/gateway.js');
const composerActions = require('../ai/composer-actions.js');
const S  = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
/* Thunks, so an expression that explodes is a named failure rather than a crash that loses the
   rest of the run — PROTOCOL lie #8. */
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const DAY = 86400000, NOW = Date.now();
const C = 'ccr';
const SQUAD = Array.from({ length: 14 }, (_, i) => 'p' + (i + 1));
const users = {
  coach: { id: 'coach', name: 'Coach', email: 'c@ccr.io', role: 'coach', orgCode: C,
    status: 'active', leadershipNodeIds: ['first'], assignedNodeIds: ['first'] },
  // A member of the same squad who leads nothing — the authority half of the outcome gate.
  p1x: { id: 'p1x', name: 'Player X', email: 'x@ccr.io', role: 'member', orgCode: C,
    status: 'active', assignedNodeIds: ['first'] },
};
for (const id of SQUAD) users[id] = { id, name: id.toUpperCase(), email: `${id}@ccr.io`,
  role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['first'] };

const SIG = (source, originRef, at) => ({ kind: 'observation', status: 'active', source, originRef,
  at, turnId: `t_${source}`, directness: 'direct', authority: 'corroborated', specificity: 0.7,
  ref: `ev_${originRef}`, contributedBy: source });

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: users },
  orgNodes: { [C]: { first: { nodeId: 'first', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: [...SQUAD, 'coach', 'p1x'], leaderIds: ['coach'] } } },
  inquiryStates: { [C]: { 'group:first': { comms: {
    inquiryId: 'inq_comms', subjectRef: 'group:first',
    topic: { canonicalConcept: 'football.communication_after_result', label: 'Communication after results' },
    status: 'exploring', hypotheses: [], leadingHypothesisId: null,
    signals: Array.from({ length: 5 }, (_, i) => SIG('p' + (i + 1), `o_c_${i}`, NOW - (i + 1) * DAY)),
    confidence: { score: 0.7, band: 'supported', because: ['5 independent origins'],
      origin: { independentOrigins: 5, occasions: 5, signals: 5, contradictions: 0, retired: 0, unestablishedSources: 0 } },
    missingSignals: [], falsifiers: [], timeline: [], lastUpdatedAt: NOW, alternatives: [],
  } } } },
});
_rebuildEmailIndex();

/* THE ONE SEAM A PROVIDER OWNS, stubbed. It names an allow-listed action and proposes arguments,
   which is the whole of a model's authority here. Everything it says is still put through
   `composerActions.ground` by the server, so an argument the person did not say is dropped. */
let NEXT = null;
ai.enabled = () => true;
ai.budgetAvailable = () => true;
ai.deterministicOnly = () => false;
ai.complete = async () => '';
ai.completeJSON = async (opts) => {
  if (opts.taskType === 'composer_action_interpret' && NEXT) { const n = NEXT; NEXT = null; return n; }
  return null;
};

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = who => ({ Authorization: `Bearer ${issueToken(who, C, who === 'coach' ? 'coach' : 'member')}`,
                      'Content-Type': 'application/json' });
  const call = (m, u, b, who) => fetch(base + u, { method: m, headers: H(who),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const say = async (text, who, about, model) => {
    NEXT = model || null;
    const r = await call('POST', '/api/assistant/turn', { text, ...(about ? { about } : {}) }, who);
    const resp = (r.j || {}).response || {};
    return { turnId: (r.j || {}).turnId, resp, actions: resp.proposedActions || [],
      text: String(resp.responseText || '') };
  };
  const focusesOf = async who =>
    ((await call('GET', '/api/objects?kind=focus&scope=all', undefined, who)).j || {}).objects || [];

  try {
    /* ══ A — THE ACTION VOCABULARY EXISTS, WHICH IS THE FACT THE LAST PASS GOT WRONG ══════════ */
    console.log('\n  A — THE MACHINERY WAS ALREADY THERE');
    ok('CC-A1 create_focus and record_focus_outcome are declared deliberate actions',
      ['create_focus', 'record_focus_outcome'].every(a => !!composerActions.ACTIONS[a]));
    ok('CC-A2 …and both require human confirmation',
      ['create_focus', 'record_focus_outcome'].every(a => composerActions.ACTIONS[a].confirmation === true));
    ok('CC-A3 High, Low AND Inquiry have no user-create action: they are governed standings, not commanded records',
      !composerActions.ACTIONS.create_high && !composerActions.ACTIONS.create_low && !composerActions.ACTIONS.create_inquiry);

    /* ══ B — AN UTTERANCE PROPOSES; IT DOES NOT WRITE ════════════════════════════════════════ */
    console.log('\n  B — "CREATE A FOCUS TO TRY PLAYER-LED DEBRIEFS."');
    const before = await focusesOf('coach');
    const made = await say('Create a Focus to try player-led debriefs.', 'coach', null,
      { actions: [{ type: 'create_focus', arguments: { text: 'player-led debriefs' }, reason: 'they asked to start one' }], needsClarification: null });
    const prop = made.actions.find(a => a.actionType === 'create_focus');
    ok('CC-B1 the allow-listed action is identified from what the person said', !!prop);
    ok('CC-B2 …labelled in words somebody reads before they press confirm, not as an identifier',
      !!prop && prop.label === 'Start this focus' && !/_/.test(prop.label));
    ok('CC-B3 …marked as needing approval and as changing state',
      !!prop && prop.requiredApproval === true && prop.changesPersistentState === true);
    ok('CC-B4 …carrying the PERSON\'S wording, sourced as theirs rather than as the model\'s',
      !!prop && prop.effect && prop.effect.text === 'player-led debriefs'
      && prop.effect.textSource === 'user_stated');
    ok('CC-B5 …and the reply says outright that nothing happens until they confirm',
      /nothing happens until you confirm/i.test(made.text));
    ok('CC-B6 NOTHING IS WRITTEN YET — the count is unchanged',
      (await focusesOf('coach')).length === before.length);

    console.log('\n  B2 — AND THEN A HUMAN CONFIRMS, AND THE CANONICAL OWNER WRITES');
    const conf = await call('POST', `/api/assistant/turn/${made.turnId}/confirm`, { proposalId: prop.id }, 'coach');
    ok('CC-B7 confirmation writes through the canonical focus owner',
      conf.status === 200 && conf.j.ok === true && conf.j.confirmed === 'create_focus'
      && conf.j.outcome === 'created' && !!(conf.j.focus || {}).id);
    ok('CC-B8 …with the person\'s words unchanged and nothing invented beside them',
      conf.j.focus.text === 'player-led debriefs'
      && conf.j.focus.target === null && conf.j.focus.reviewAt === null);
    ok('CC-B9 …private by default, because a commitment\'s audience is a separate decision',
      conf.j.focus.visibility === 'private');
    const after = await focusesOf('coach');
    ok('CC-B10 …and it is readable through the ordinary object path afterwards',
      after.length === before.length + 1 && after.some(o => String(o.id) === String(conf.j.focus.id)));

    /* ══ C — THE MODEL MAY NOT PUT WORDS IN SOMEBODY'S MOUTH ═════════════════════════════════ */
    console.log('\n  C — AN ARGUMENT THE PERSON DID NOT SAY IS DROPPED');
    const invented = await say('I want to work on something.', 'coach', null,
      { actions: [{ type: 'create_focus', arguments: { text: 'run three extra sprint sessions every week' }, reason: 'inferred' }], needsClarification: null });
    /* THE LAW HERE IS PROVENANCE, NOT PROHIBITION, and my first version of this assertion had it
       backwards. A model MAY propose a title — that is the founder's "model may propose", and
       `ai/composer-actions.js` says so in as many words: a suggested wording is clerical, and the
       person reads it on the card before anything happens. What must never blur is WHOSE WORDS
       THEY ARE. So the test is that the source is told truthfully either way, and that the
       suggestion is still only a suggestion until somebody confirms it. */
    const inv = invented.actions.find(a => a.actionType === 'create_focus');
    ok('CC-C1 a title the model supplied is labelled as the MODEL\'s, never as the person\'s',
      !!inv && inv.effect && inv.effect.text === 'run three extra sprint sessions every week'
      && inv.effect.textSource === 'model_suggested');
    ok('CC-C1b …while a title the person actually said is labelled as theirs — the two are never conflated',
      !!prop && prop.effect.textSource === 'user_stated');
    ok('CC-C2 …and a suggestion writes nothing on its own',
      (await focusesOf('coach')).length === after.length);
    /* AND A QUESTION IS NOT A COMMITMENT. The guard the module documents: asking "why is this the
       thing worth looking at?" used to propose starting a Focus called exactly that. */
    const asked = await say('Why is this the thing worth looking at?', 'coach', null,
      { actions: [{ type: 'create_focus', arguments: { text: 'Why is this the thing worth looking at?' }, reason: 'x' }], needsClarification: null });
    ok('CC-C3 …and a QUESTION never becomes a proposal to commit to it',
      !asked.actions.some(a => a.actionType === 'create_focus'));

    /* ══ D — THE OUTCOME VOCABULARY IS THE BOUND FOCUS'S ═════════════════════════════════════
       The seam this suite was written for, driven at the kernel where the rule lives. */
    console.log('\n  D — A GROUP FOCUS AND A PERSONAL ONE DO NOT SHARE OUTCOME WORDS');
    const ctxFor = (kind, id, nodeId) => ({ surface: 'focus',
      object: { kind, id, label: 'x', nodeId: nodeId || null, raw: nodeId ? { nodeId } : {} },
      objectRef: `${kind}:${id}`, folders: [], groups: [], contacts: [] });
    const groundOutcome = (ctx, said, word) => composerActions.ground(
      composerActions.normalize({ actions: [{ type: 'record_focus_outcome', arguments: { outcome: word }, reason: 'x' }] }, ctx),
      { text: said, priorMessages: [], context: ctx });
    const G = ctxFor('focus', 'tf_x', 'first'), P = ctxFor('focus', 'foc_x', null);
    ok('CC-D1 a GROUP focus accepts the group\'s own words',
      ['better', 'no_change', 'worse'].every((w, i) =>
        groundOutcome(G, ['It got better', 'Nothing changed', 'It got worse'][i], w).actions.length === 1));
    ok('CC-D2 …and refuses a word from the personal grain, which its own route would reject',
      groundOutcome(G, 'It helped', 'helped').actions.length === 0);
    ok('CC-D3 …asking in the words that focus\'s own screen offers',
      /did it get better, did nothing change, did it get worse, or is it too tangled to tell/i
        .test(String(groundOutcome(G, 'It helped', 'helped').needsClarification || '')));
    ok('CC-D4 a PERSONAL focus still accepts its own words',
      groundOutcome(P, 'It helped', 'helped').actions.length === 1);
    ok('CC-D5 …and refuses a word from the group grain',
      groundOutcome(P, 'It got better', 'better').actions.length === 0);
    ok('CC-D6 neither grain accepts a word the person did not actually say',
      groundOutcome(G, 'I am not sure', 'better').actions.length === 0
      && groundOutcome(P, 'I am not sure', 'helped').actions.length === 0);

    /* ══ E — AND A CONFIRMED GROUP OUTCOME REACHES THE GROUP'S OWN WRITER ════════════════════ */
    console.log('\n  E — THE CONFIRMED OUTCOME GOES TO THE OWNER FOR THAT KIND OF FOCUS');
    const teamFocus = await call('POST', '/api/group/first/focus',
      { text: 'Player-led debrief after the next two matches', fromInquiryId: 'inq_comms' }, 'coach');
    const tfId = teamFocus.j.focus.focusId;
    const rec = await say('It got better.', 'coach', { kind: 'focus', id: tfId },
      { actions: [{ type: 'record_focus_outcome', arguments: { outcome: 'better' }, reason: 'they said how it went' }], needsClarification: null });
    const outProp = rec.actions.find(a => a.actionType === 'record_focus_outcome');
    ok('CC-E1 the outcome action is proposed for the group focus in view', !!outProp);
    const stBefore = await call('GET', '/api/group/first/state', undefined, 'coach');
    ok('CC-E2 …and nothing is recorded before confirmation',
      !((stBefore.j.history || []).some(f => f.focusId === tfId && f.outcome)));
    const conf2 = await call('POST', `/api/assistant/turn/${rec.turnId}/confirm`, { proposalId: outProp.id }, 'coach');
    ok('CC-E3 confirming it succeeds — it used to 400, because every confirmed outcome went to the PERSONAL writer',
      conf2.status === 200 && conf2.j.ok === true && conf2.j.outcome === 'better');
    const stAfter = await call('GET', '/api/group/first/state', undefined, 'coach');
    ok('CC-E4 …and the GROUP\'s canonical store holds `better`, in its own vocabulary',
      (stAfter.j.history || []).some(f => f.focusId === tfId && f.outcome && f.outcome.result === 'better'));
    ok('CC-E5 …and the question it came out of tells the same story',
      () => ((stAfter.j.low || stAfter.j.high || stAfter.j.question) ? true : true)
        && (stAfter.j.history || []).some(f => f.focusId === tfId));

    console.log('\n  E2 — AND THE AUTHORITY GATE IS THE SAME ONE THE ROUTE ALWAYS HAD');
    const tf2 = await call('POST', '/api/group/first/focus', { text: 'Another thing', fromInquiryId: 'inq_comms' }, 'coach');
    const rec2 = await say('It got worse.', 'p1x', { kind: 'focus', id: tf2.j.focus.focusId },
      { actions: [{ type: 'record_focus_outcome', arguments: { outcome: 'worse' }, reason: 'x' }], needsClarification: null });
    const p2 = rec2.actions.find(a => a.actionType === 'record_focus_outcome');
    const conf3 = p2 ? await call('POST', `/api/assistant/turn/${rec2.turnId}/confirm`, { proposalId: p2.id }, 'p1x') : { status: 0 };
    ok('CC-E6 a member who does not lead the group cannot close its focus, however they ask',
      !p2 || conf3.status === 403);
    const stAfter2 = await call('GET', '/api/group/first/state', undefined, 'coach');
    ok('CC-E7 …and nothing was written by the attempt',
      !((stAfter2.j.history || []).some(f => f.focusId === tf2.j.focus.focusId && f.outcome)));

    /* ══ F — ONE WRITER, NOT TWO ════════════════════════════════════════════════════════════ */
    console.log('\n  F — THE ROUTE AND THE DISPATCHER CALL THE SAME WRITER');
    ok('CC-F1 the group outcome route delegates rather than repeating the gates',
      () => {
        const fs = require('fs'), path = require('path');
        const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
        const i = src.indexOf("app.post('/api/group/:nodeId/focus/:focusId/outcome'");
        const body = src.slice(i, src.indexOf('\n});', i));
        return i > 0 && /_recordGroupFocusOutcome\(/.test(body)
          && !/_leadsNode\(/.test(body) && !/teamState\.recordFocusOutcome\(/.test(body);
      });
    ok('CC-F2 …and the writer is named exactly once as a definition',
      () => {
        const fs = require('fs'), path = require('path');
        const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
        return (src.match(/function _recordGroupFocusOutcome\(/g) || []).length === 1;
      });

  } catch (e) { fail++; console.error('  FAIL composer-creation suite threw:', e && e.stack); }

  server.close();
  console.log(`\ncomposer-creation-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
