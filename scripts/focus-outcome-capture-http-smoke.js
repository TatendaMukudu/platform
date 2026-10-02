/* Truth layer — HOW A FOCUS WENT IS A THING A PERSON CAN RECORD.

   LIVE iPHONE BLOCKER (findings R1 #14). The founder reported trying an extra defender and still
   conceding. The assistant clarified scope; the Focus afterwards still showed no outcome.

   THE CAPABILITY EXISTED THE WHOLE TIME. `record_focus_outcome` is a governed action with a
   canonical writer, an allowlisted vocabulary and an audit line. Its ONLY door was a model
   proposing it — so with models off, which is the pilot's own configuration, closing the loop on a
   commitment was a capability nobody had, and with models on it depended on a model choosing to
   offer it. That is the vertical slice law this repository keeps rediscovering: a capability
   reachable from no control is a capability nobody has.

   AND TWO THINGS HAD TO BE TRUE AT ONCE, which is why the door is a picker and not a text box:

     THE WORD IS A CLOSED VOCABULARY. A personal focus records helped / no / mixed; a group focus
     records better / no_change / worse / unclear. The canonical writer refuses a word from the
     other grain, so free text can never become an outcome.

     AND THE WORD MUST BE THE PERSON'S OWN. A model may never decide for somebody how their own
     commitment went. Tapping a word the product itself offers is a declaration at least as
     deliberate as typing it — and the grounding layer honours it ONLY for a word in the
     vocabulary for this focus's grain, and ONLY when a control was pressed.

   WHAT THIS FILE ASSERTS:

     the loop closes from a control, with models off          (A, B)
     what was TRIED is recorded, not only the verdict         (C)
     nothing is written until the person confirms             (B)
     a word from the wrong vocabulary is still refused        (D)
     and a model still cannot decide the word                 (E)

   Run: node scripts/focus-outcome-capture-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const fs = require('fs');
const path = require('path');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, userAiProfiles } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'foc', NOW = Date.now(), DAY = 86400000;
_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coach: { id: 'coach', name: 'Dana Coach', email: 'c@foc.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['n'], assignedNodeIds: ['n'], profileComplete: true },
  } },
  orgNodes: { [C]: { n: { nodeId: 'n', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: ['coach'], leaderIds: ['coach'] } } },
  userAiProfiles: { [`${C}:coach`]: { focuses: [
    { id: 'foc_late', text: 'Concede fewer late goals', status: 'active',
      visibility: 'only_me', createdAt: new Date(NOW - 5 * DAY).toISOString() },
    { id: 'foc_two', text: 'Start faster in the second half', status: 'active',
      visibility: 'only_me', createdAt: new Date(NOW - 4 * DAY).toISOString() },
  ] } },
});
_rebuildEmailIndex();

/* THE FOUNDER'S OWN SENTENCE. Deliberately NOT containing any of the three outcome words: the
   whole point of #14 is that a person reports what happened in their own English and the product
   still has to be able to close the loop. A fixture that said "it didn't help" would prove the
   easy half — the literal-word path that already worked — and miss the failure entirely. */
const TRIED = 'We tried an extra defender and still conceded in the last ten minutes.';

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { Authorization: `Bearer ${issueToken('coach', C, 'coach')}`, 'Content-Type': 'application/json' };
  const call = (m, u, b) => fetch(base + u, { method: m, headers: H,
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const focusOf = (id) => ((userAiProfiles[`${C}:coach`] || {}).focuses || []).find(f => f.id === id) || null;

  try {
    console.log('\n  A — THE CONTROL REACHES THE ACTION, WITH NO MODEL ANYWHERE');
    /* THE PRESSED CONTROL, as the browser stages it: the action requested by name, the word
       chosen from the vocabulary this focus's own owner accepts, and the person's own sentence
       as the turn. */
    const staged = await call('POST', '/api/assistant/turn', {
      text: TRIED, about: { kind: 'focus', id: 'foc_late' },
      requestedAction: { type: 'record_focus_outcome', arguments: { outcome: 'no' } },
    });
    ok('FO-A1 the turn is accepted', staged.status === 200);
    const props = ((staged.j || {}).response || {}).proposedActions || [];
    const prop = props.find(p => p && p.actionType === 'record_focus_outcome');
    ok('FO-A2 …and it comes back as a proposal to record the outcome', !!prop);
    ok('FO-A3 …carrying the word the person chose', !!prop && (prop.effect || {}).outcome === 'no');
    /* THE SENTENCE IS THEIRS AND IS CARRIED WITH IT. "It did not help" is a verdict on nothing
       until the record says what it is about — which is the half of #14 the outcome record had a
       field for and never filled. */
    ok('FO-A4 …and the words they actually wrote, as the note, on the card they read before confirming',
      !!prop && String((prop.effect || {}).note || '').includes('extra defender'));
    /* AND THE WORD IS MARKED AS CHOSEN RATHER THAN WRITTEN, so a confirmation surface can say
       which it was instead of implying prose. */
    ok('FO-A5 …said to be a word they chose, not one read out of their sentence',
      !!prop && (prop.effect || {}).outcomeSource === 'user_chosen');

    console.log('\n  B — AND NOTHING IS WRITTEN UNTIL THEY CONFIRM IT');
    ok('FO-B1 the focus is still open while the proposal sits there',
      !!focusOf('foc_late') && !focusOf('foc_late').outcome);
    const turnId = (staged.j || {}).turnId;
    /* GUARDED, because the whole point of this file is to be run against a build where the
       proposal is missing — that is the defect. Dereferencing it would abort the walk and hide
       every assertion below behind one stack trace. */
    const done = prop
      ? await call('POST', `/api/assistant/turn/${encodeURIComponent(turnId)}/confirm`, { proposalId: prop.id })
      : { status: 0, j: null };
    ok('FO-B2 confirming it is accepted', done.status === 200 && (done.j || {}).ok === true);
    const f = focusOf('foc_late');
    ok('FO-B3 …and the canonical record now holds the outcome',
      !!f && !!f.outcome && f.outcome.result === 'no');
    ok('FO-B4 …with the focus closed by its own writer rather than by this route',
      !!f && f.status === 'done' && !!f.resolvedAt);

    console.log('\n  C — AND WHAT WAS TRIED IS ON THE RECORD, NOT ONLY THE VERDICT');
    ok('FO-C1 the outcome note is the person\'s own sentence',
      !!f && String(f.outcome.note || '').includes('extra defender'));
    ok('FO-C2 …unchanged, rather than summarised into something they did not write',
      !!f && f.outcome.note === TRIED);
    /* AND IT REACHES A SCREEN. A note stored where nothing renders it is the same failure in a
       different place. */
    const read = await call('GET', '/api/objects/focus/foc_late/thread?scope=self');
    ok('FO-C3 …and the object\'s own read carries it back',
      read.status === 200 && String(JSON.stringify(read.j || {})).includes('extra defender'));

    console.log('\n  D — A WORD FROM THE WRONG VOCABULARY IS STILL REFUSED');
    /* THE TWO GRAINS STAY SEPARATE. A personal focus never accepts a group word, and the guard
       that allows a CHOSEN word must not have become a way past that. */
    const wrong = await call('POST', '/api/assistant/turn', {
      text: TRIED, about: { kind: 'focus', id: 'foc_two' },
      requestedAction: { type: 'record_focus_outcome', arguments: { outcome: 'no_change' } },
    });
    const wrongProps = ((wrong.j || {}).response || {}).proposedActions || [];
    ok('FO-D1 a group word on a personal focus proposes nothing',
      !wrongProps.some(p => p && p.actionType === 'record_focus_outcome'));
    ok('FO-D2 …and the second focus is untouched', !!focusOf('foc_two') && !focusOf('foc_two').outcome);
    /* AND AN INVENTED WORD IS REFUSED TOO, so the guard is a vocabulary check rather than a
       "did somebody press something" check. */
    const junk = await call('POST', '/api/assistant/turn', {
      text: TRIED, about: { kind: 'focus', id: 'foc_two' },
      requestedAction: { type: 'record_focus_outcome', arguments: { outcome: 'brilliant' } },
    });
    ok('FO-D3 …and a word that is in neither vocabulary proposes nothing either',
      !(((junk.j || {}).response || {}).proposedActions || [])
        .some(p => p && p.actionType === 'record_focus_outcome'));

    console.log('\n  E — AND A MODEL STILL CANNOT DECIDE HOW IT WENT');
    /* THE LAW THIS CHANGE COULD MOST EASILY HAVE BROKEN. `requested` means a person pressed a
       control. A model-proposed action passes no such flag, so on that path the word must still
       be literally in what the person wrote — which is what stops a model concluding, from a
       sentence about conceding, that the focus did not help. Asserted at the module, because with
       models off the proposal path cannot be driven through a route. */
    const actions = require('../ai/composer-actions.js');
    const ctx = { object: { kind: 'focus', id: 'foc_two', raw: { id: 'foc_two' } }, groups: [], contacts: [] };
    const asModel = actions.ground(
      actions.normalize({ actions: [{ type: 'record_focus_outcome', arguments: { outcome: 'no' }, reason: 'inferred' }] }, ctx),
      { text: TRIED, priorMessages: [], context: ctx });
    ok('FO-E1 a model proposing an outcome word the person never wrote is dropped',
      !(asModel.actions || []).some(a => a.type === 'record_focus_outcome'));
    ok('FO-E2 …and the person is asked, in the words their own focus accepts',
      /did it help, not help, or was it mixed/i.test(String(asModel.needsClarification || '')));
    /* WHILE THE LITERAL PATH IS UNCHANGED: somebody who writes the word still gets the proposal,
       and it is still marked as theirs. */
    const spoken = actions.ground(
      actions.normalize({ actions: [{ type: 'record_focus_outcome', arguments: { outcome: 'no' }, reason: 'they said so' }] }, ctx),
      { text: 'The extra defender did not help at all.', priorMessages: [], context: ctx });
    const spokenAct = (spoken.actions || []).find(a => a.type === 'record_focus_outcome');
    ok('FO-E3 …while a person who writes the word is still understood',
      !!spokenAct && spokenAct.arguments.outcome === 'no'
      && spokenAct.argumentSources.outcome === 'user_stated');

    console.log('\n  F — AND THE DOOR EXISTS ON THE SCREEN THAT NEEDS IT');
    /* THE VERTICAL SLICE, which is the whole reason this defect survived: everything above is
       unreachable from the product if no control stages it. Only a Focus — a High, a Low and an
       Inquiry have no outcome to record — and only while there is not one already. */
    const ui = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    ok('FO-F1 a Focus thread offers the control, and only a Focus',
      /kind === 'focus' && !det\.outcome[\s\S]{0,160}beginFocusOutcome\(\)/.test(ui));
    ok('FO-F2 …which offers the words that focus\'s own owner accepts, by grain',
      /\['helped', 'It helped'\]/.test(ui) && /\['no_change', 'Nothing changed'\]/.test(ui)
      && /const group = !!\(t\.scope && String\(t\.scope\)\.startsWith\('group:'\)\)/.test(ui));
    ok('FO-F3 …and stages the same typed request a model would propose, rather than writing',
      /_pendingComposerAction = \{ type: 'record_focus_outcome', arguments: \{ outcome: String\(word\) \} \}/.test(ui));
    ok('FO-F4 …and says plainly that nothing is recorded until it is confirmed',
      /Nothing is recorded until you confirm it/.test(ui));

  } catch (e) { fail++; console.error('  FAIL focus-outcome suite threw:', e && e.stack); }

  server.close();
  console.log(`\nfocus-outcome-capture-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
