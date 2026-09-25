/* Truth layer — WHEN IT IS AMBIGUOUS, ASK OR REFUSE. NEVER GUESS.

   This is the load-bearing half of natural-language action. Everything else in the pipeline is
   about what may happen; this is about WHICH THING it happens to. A product that guesses right
   nine times out of ten and silently records an outcome against the wrong focus the tenth time
   has not got a small bug — it has destroyed the one thing the A -> B loop is for, and nobody
   would be able to tell from the screen.

   Attacked here, all through the real routes:

     "It helped"          with no focus, with one, and with two
     "Make this a High"   with nothing in view
     a proposal confirmed after the object it was about CHANGED
     a proposal confirmed after the focus it was about was already CLOSED
     a conversation bound to one object, acted on from the page of another
     an object in another node
     an object in another organisation
     an id nobody has

   The rule is the same in every case: an action names exactly one thing or it does not happen.
   Refusals here are the product working, not failing, so each one is asserted for WHAT IT SAYS as
   well as that it happened — a 409 a screen cannot explain is a dead end wearing a status code.

   Run: node scripts/composer-binding-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';

const ai = require('../ai/gateway.js');
const S  = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, inquiryStates } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const DAY = 86400000, NOW = Date.now();
const C = 'bnd', X = 'bndx';
const SQUAD = Array.from({ length: 14 }, (_, i) => 'p' + (i + 1));
const users = { coach: { id: 'coach', name: 'Coach', email: 'c@bnd.io', role: 'coach', orgCode: C,
  status: 'active', leadershipNodeIds: ['first'], assignedNodeIds: ['first'] } };
for (const id of SQUAD) users[id] = { id, name: id.toUpperCase(), email: `${id}@bnd.io`,
  role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['first'] };

const SIG = (source, originRef, at) => ({ kind: 'observation', status: 'active', source, originRef,
  at, turnId: `t_${source}`, directness: 'direct', authority: 'corroborated', specificity: 0.7,
  ref: `ev_${originRef}`, contributedBy: source });

const inq = (id, concept, label) => ({
  inquiryId: id, subjectRef: 'group:first', topic: { canonicalConcept: concept, label },
  status: 'exploring', hypotheses: [], leadingHypothesisId: null,
  signals: Array.from({ length: 5 }, (_, i) => SIG('p' + (i + 1), `o_${id}_${i}`, NOW - (i + 1) * DAY)),
  confidence: { score: 0.7, band: 'supported', because: ['5 independent origins'],
    origin: { independentOrigins: 5, occasions: 5, signals: 5, contradictions: 0, retired: 0, unestablishedSources: 0 } },
  missingSignals: [], falsifiers: [], timeline: [], lastUpdatedAt: NOW, alternatives: [],
});

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' }, [X]: { orgName: 'Rival Club', orgMode: 'sports' } },
  orgUsers: { [C]: users,
    [X]: { rival: { id: 'rival', name: 'Rival', email: 'r@bndx.io', role: 'coach', orgCode: X,
      status: 'active', leadershipNodeIds: ['theirs'], assignedNodeIds: ['theirs'] } } },
  orgNodes: { [C]: {
    first:  { nodeId: 'first', name: 'First Team', parentId: null, childNodeIds: [], memberIds: [...SQUAD, 'coach'], leaderIds: ['coach'] },
    // A node the coach does NOT lead and is not on — every id in it resolves, and only the
    // boundary stands between them.
    other:  { nodeId: 'other', name: 'Other Squad', parentId: null, childNodeIds: [], memberIds: ['p1'], leaderIds: [] },
  },
    [X]: { theirs: { nodeId: 'theirs', name: 'Theirs', parentId: null, childNodeIds: [], memberIds: [], leaderIds: ['rival'] } } },
  inquiryStates: { [C]: {
    'group:first': { comms: inq('inq_comms', 'football.communication_after_result', 'Communication after results'),
                     late:  inq('inq_late', 'football.late_game_shape', 'How the last twenty minutes go') },
    'group:other': { theirs: { ...inq('inq_other', 'football.other_thing', 'Something else'), subjectRef: 'group:other' } },
  } },
});
_rebuildEmailIndex();

/* The interpreter stub. It always names `record_focus_outcome` with the person's word, which is
   the most dangerous action to bind wrongly: it writes a judgement about something that ran. */
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
  const H = (who, org = C) => ({ Authorization: `Bearer ${issueToken(who, org, who === 'coach' || who === 'rival' ? 'coach' : 'member')}`,
                                 'Content-Type': 'application/json' });
  const call = (m, u, b, who, org) => fetch(base + u, { method: m, headers: H(who, org),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const say = async (text, who, opts = {}, model) => {
    NEXT = model || null;
    const r = await call('POST', '/api/assistant/turn', { text, ...opts }, who);
    const resp = (r.j || {}).response || {};
    return { turnId: (r.j || {}).turnId, conversationId: (r.j || {}).conversationId,
      actions: resp.proposedActions || [], text: String(resp.responseText || ''),
      clarify: resp.clarify || null };
  };
  const OUT = w => ({ actions: [{ type: 'record_focus_outcome', arguments: { outcome: w }, reason: 'they said how it went' }], needsClarification: null });

  try {
    /* ══ A — "IT HELPED" WITH NOTHING IN VIEW ═══════════════════════════════════════════════ */
    console.log('\n  A — NO OBJECT IN VIEW, AND A SENTENCE THAT NAMES NONE');
    const none = await say('It helped.', 'coach', {}, OUT('helped'));
    ok('BD-A1 with no focus in view, no outcome action is proposed at all',
      !none.actions.some(a => a.actionType === 'record_focus_outcome'));
    ok('BD-A2 …and no focus was invented to attach it to',
      !/record this focus outcome/i.test(none.text));

    /* ══ B — EXACTLY ONE, NAMED BY THE PAGE ═════════════════════════════════════════════════ */
    console.log('\n  B — ONE FOCUS, AND THE PAGE SAYS WHICH');
    const f1 = await call('POST', '/api/group/first/focus',
      { text: 'Player-led debrief after the next two matches', fromInquiryId: 'inq_comms' }, 'coach');
    const id1 = f1.j.focus.focusId;
    const bound = await say('It got better.', 'coach', { about: { kind: 'focus', id: id1 } }, OUT('better'));
    const bProp = bound.actions.find(a => a.actionType === 'record_focus_outcome');
    ok('BD-B1 the outcome action binds the focus the page is showing', !!bProp);
    ok('BD-B2 …and carries the word the person actually said',
      !!bProp && bProp.effect && bProp.effect.outcome === 'better');

    /* ══ C — TWO PLAUSIBLE FOCUSES, AND NOTHING SAYING WHICH ════════════════════════════════
       THE ATTACK THIS FILE IS NAMED FOR. Two live focuses, a sentence that names neither, and a
       model happy to propose an outcome. The only safe answers are to ask or to do nothing; the
       one unacceptable answer is to pick. */
    console.log('\n  C — TWO PLAUSIBLE FOCUSES, AND A SENTENCE THAT NAMES NEITHER');
    const f2 = await call('POST', '/api/group/first/focus',
      { text: 'Ten minutes of small-sided at the end of every session', fromInquiryId: 'inq_late' }, 'coach');
    const id2 = f2.j.focus.focusId;
    const ambiguous = await say('It helped.', 'coach', {}, OUT('helped'));
    ok('BD-C1 with two focuses live and neither named, NO outcome action is proposed',
      !ambiguous.actions.some(a => a.actionType === 'record_focus_outcome'));
    const st = await call('GET', '/api/group/first/state', undefined, 'coach');
    ok('BD-C2 …and neither focus was closed by the attempt',
      !(st.j.history || []).some(f => (f.focusId === id1 || f.focusId === id2) && f.outcome));
    ok('BD-C3 …and the reply does not claim to have recorded anything',
      !/recorded|closed|marked/i.test(ambiguous.text) || /nothing/i.test(ambiguous.text));

    /* ══ D — THE OBJECT CHANGED BETWEEN PROPOSAL AND CONFIRMATION ═══════════════════════════ */
    console.log('\n  D — CONFIRMING A PROPOSAL ABOUT SOMETHING THAT HAS SINCE CHANGED');
    const staleTurn = await say('It got worse.', 'coach', { about: { kind: 'focus', id: id2 } }, OUT('worse'));
    const staleProp = staleTurn.actions.find(a => a.actionType === 'record_focus_outcome');
    ok('BD-D1 a proposal is prepared against the focus in view', !!staleProp);
    // Somebody else closes it first — the ordinary race, not a contrived one.
    await call('POST', `/api/group/first/focus/${id2}/outcome`, { result: 'better' }, 'coach');
    const late = await call('POST', `/api/assistant/turn/${staleTurn.turnId}/confirm`, { proposalId: staleProp.id }, 'coach');
    ok('BD-D2 confirming it afterwards is REFUSED rather than overwriting what happened',
      late.status === 409 || late.status === 404 || (late.j && late.j.error));
    ok('BD-D3 …and says the thing changed, in words a screen can show',
      !!late.j && /changed|no longer|fresh proposal|not found/i.test(JSON.stringify(late.j)));
    const stD = await call('GET', '/api/group/first/state', undefined, 'coach');
    ok('BD-D4 …and the outcome that WAS recorded is the one the other path wrote, unaltered',
      (stD.j.history || []).some(f => f.focusId === id2 && f.outcome && f.outcome.result === 'better'));

    /* ══ E — A CONVERSATION BOUND TO ONE OBJECT, ACTED ON FROM ANOTHER'S PAGE ═══════════════
       The binding rule: page state may ESTABLISH a binding, never RETARGET an existing one. */
    console.log('\n  E — A CONVERSATION ABOUT ONE THING, ACTED ON FROM THE PAGE OF ANOTHER');
    const first = await say('Tell me about this.', 'coach', { about: { kind: 'focus', id: id1 } });
    const crossed = await say('It got better.', 'coach',
      { conversationId: first.conversationId, about: { kind: 'inquiry', id: 'inq_late' } }, OUT('better'));
    ok('BD-E1 the mismatch is refused rather than resolved to one of the two',
      !crossed.actions.some(a => a.actionType === 'record_focus_outcome'));
    ok('BD-E2 …and says which situation it is, rather than failing silently',
      /belongs to a different object|new conversation/i.test(crossed.text));

    /* ══ F — ANOTHER NODE, ANOTHER TENANT, AND AN ID NOBODY HAS ═════════════════════════════ */
    console.log('\n  F — SOMETHING THEY MAY NOT ACT ON, AND SOMETHING THAT DOES NOT EXIST');
    const otherNode = await say('It got better.', 'coach', { about: { kind: 'inquiry', id: 'inq_other' } }, OUT('better'));
    ok('BD-F1 an object in a node they are not on binds nothing',
      !otherNode.actions.some(a => a.actionType === 'record_focus_outcome'));
    const guessed = await say('It got better.', 'coach', { about: { kind: 'focus', id: 'tf_does_not_exist' } }, OUT('better'));
    ok('BD-F2 an id nobody has binds nothing, and is not treated as a near miss',
      !guessed.actions.some(a => a.actionType === 'record_focus_outcome'));
    const crossOrg = await call('POST', `/api/group/first/focus/${id1}/outcome`, { result: 'worse' }, 'rival', X);
    ok('BD-F3 another tenant cannot reach this group\'s focus at all',
      crossOrg.status === 403 || crossOrg.status === 404);
    const stF = await call('GET', '/api/group/first/state', undefined, 'coach');
    ok('BD-F4 …and none of those attempts wrote anything',
      !(stF.j.history || []).some(f => f.focusId === id1 && f.outcome));

    /* ══ G — AND THE ONE THAT SHOULD WORK STILL WORKS ═══════════════════════════════════════
       A suite of refusals can pass by refusing everything. This is the control. */
    console.log('\n  G — THE CONTROL: THE UNAMBIGUOUS CASE STILL GOES THROUGH');
    const good = await say('It got better.', 'coach', { about: { kind: 'focus', id: id1 } }, OUT('better'));
    const gProp = good.actions.find(a => a.actionType === 'record_focus_outcome');
    ok('BD-G1 with exactly one focus named by the page, the action is proposed', !!gProp);
    const gConf = await call('POST', `/api/assistant/turn/${good.turnId}/confirm`, { proposalId: gProp.id }, 'coach');
    ok('BD-G2 …and confirming it writes through the canonical owner',
      gConf.status === 200 && gConf.j.ok === true && gConf.j.outcome === 'better');
    const stG = await call('GET', '/api/group/first/state', undefined, 'coach');
    ok('BD-G3 …and the group\'s own store holds it, in the group\'s vocabulary',
      (stG.j.history || []).some(f => f.focusId === id1 && f.outcome && f.outcome.result === 'better'));

  } catch (e) { fail++; console.error('  FAIL composer-binding suite threw:', e && e.stack); }

  server.close();
  console.log(`\ncomposer-binding-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
