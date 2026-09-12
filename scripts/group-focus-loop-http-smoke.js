/* Truth layer — THE A → B LOOP ON A GROUP FOCUS, THROUGH THE ROUTES A COACH ACTUALLY USES.

   WHAT THIS FILE EXISTS TO STOP HAPPENING AGAIN. Round 5 added an HTTP suite for the connection
   bundle, ran it, watched it go green, and reported the reader CONFIRMED. Its fixture was a
   PERSONAL Focus, written by hand in the personal shape. An independent gate read the canonical
   owners side by side and found that the group half of the product had never been driven at all:

     ai/team-state.js  newFocus()            writes  origin.inquiryId   and  outcome.at
     ai/cross-evidence.js                    read    raw.addresses      and  raw.resolvedAt

   Two owners, two field names for one fact, and a reader that knew one of them. Every group Focus
   in the product produced `edges: []`, `addresses: null`, `observedSince: null` — no relationship
   whatsoever on the half of the product where the A → B loop is the entire point. Nothing failed,
   because a reader returning null is indistinguishable from an object that is connected to
   nothing, which is the ordinary case for most objects.

   That is PROTOCOL lie #5 in its purest form — an unrepresentative fixture — and the lesson is
   not "read more carefully". It is that a suite covering two shapes has to CONTAIN two shapes.
   The personal shape stays where it is, in cross-evidence-context-http-smoke; this file is the
   group one, and it builds nothing by hand:

     POST /api/group/:nodeId/focus                    a leader sets it, FROM an inquiry
     POST /api/group/:nodeId/focus/:focusId/outcome   a leader closes it
     (evidence arrives on the inquiry, after the outcome)
     POST /api/assistant/turn  about that focus       a MEMBER asks whether it made a difference

   The Focus record under test is the one `teamState.newFocus` produced inside the real route. No
   fixture in this file can be in a shape the product could not produce, because no fixture in
   this file writes a Focus.

   Run: node scripts/group-focus-loop-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';

const ai = require('../ai/gateway.js');
const S  = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, inquiryStates } = S;

let pass = 0, fail = 0;
/* A THROW IS A FAILURE, NOT A SILENT EXIT — PROTOCOL lie #8. */
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'gfl', X = 'gfx';
const NOW = Date.UTC(2026, 2, 10, 9, 0, 0), DAY = 86400000;

/* TWELVE, and the number is load-bearing for the same reason it is in forum-context-http-smoke:
   the cohort floor is two-sided, so a smaller squad would make every group surface refuse and
   every assertion below would pass against a permanently empty screen. */
const SQUAD = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12'];

const SIG = (who, n, at, text) => ({ kind: 'observation', status: 'active', source: who,
  originRef: `o_${who}_${n}`, at, turnId: `t_${who}_${n}`, directness: 'direct',
  authority: 'corroborated', specificity: 0.7, ref: `ev_${who}_${n}`, contributedBy: who, text });

/* THE PRIVATE-SOUNDING SENTENCE lives on a signal of the very inquiry the focus addresses, so it
   is genuinely reachable from the object under test. An absence is only worth asserting when the
   thing could have been there. */
const SQUAD_WORDS = 'half of us think the goalkeeper is the problem';

const INQ = (id, concept, label, unknowns = []) => ({
  inquiryId: id, subjectRef: 'group:sq', topic: { canonicalConcept: concept, label },
  status: 'exploring',
  hypotheses: [{ id: `h_${id}`, statement: `A working read about ${label}`,
    confidence: { score: 0.7, band: 'probable' }, status: 'open' }],
  leadingHypothesisId: `h_${id}`,
  signals: SQUAD.slice(0, 5).map((w, i) => SIG(w, id, NOW - (10 - i) * DAY,
    i === 0 ? SQUAD_WORDS : 'something the squad noticed')),
  confidence: { score: 0.7, band: 'probable', because: ['5 independent origins'] },
  missingSignals: unknowns.map(question => ({ question })),
  falsifiers: [], timeline: [], lastUpdatedAt: NOW,
});

_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Alma College', orgMode: 'sports' }, [X]: { orgName: 'Elsewhere', orgMode: 'sports' } },
  orgUsers: {
    [C]: {
      coach: { id: 'coach', name: 'Head Coach', email: 'c@g.io', role: 'coach', orgCode: C, status: 'active', leadershipNodeIds: ['sq'], assignedNodeIds: [] },
      ...Object.fromEntries(SQUAD.map((id, i) => [id, { id, name: `Player ${i + 1}`, email: `${id}@g.io`, role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['sq'] }])),
      // A member of ANOTHER node in the same organisation. Authorised to exist, never this squad's.
      out: { id: 'out', name: 'Other Squad', email: 'o@g.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['res'] },
    },
    [X]: { far: { id: 'far', name: 'Far Away', email: 'f@g.io', role: 'coach', orgCode: X, status: 'active', leadershipNodeIds: ['th'] } },
  },
  orgNodes: {
    [C]: {
      sq:  { nodeId: 'sq',  name: 'First Team', parentId: null, childNodeIds: [], memberIds: SQUAD, leaderIds: ['coach'] },
      res: { nodeId: 'res', name: 'Reserves',   parentId: null, childNodeIds: [], memberIds: ['out'], leaderIds: [] },
    },
    [X]: { th: { nodeId: 'th', name: 'Theirs', parentId: null, childNodeIds: [], memberIds: [], leaderIds: ['far'] } },
  },
  inquiryStates: { [C]: { 'group:sq': {
    inq_q:  INQ('inq_q',  'football.build_up',  'Building from the back',
      ['does starting deeper actually help, or does it just move the problem?']),
    /* A SECOND group inquiry the focus was NOT started on. Without it, "names the right inquiry"
       is satisfied by naming the only one there is. */
    inq_o:  INQ('inq_o',  'football.set_pieces', 'Defending set pieces',
      ['are we losing the first contact or the second?']),
  } } },
});
_rebuildEmailIndex();

const REAL = { enabled: ai.enabled, budgetAvailable: ai.budgetAvailable, complete: ai.complete, completeJSON: ai.completeJSON };
let handed = '';
Object.assign(ai, {
  enabled: () => true, budgetAvailable: () => true,
  // The capture. Returning '' degrades to the deterministic reply, which is fine: what is under
  // test is the CONTEXT that was built, not the prose that came back.
  complete: async (o) => { handed = String((o && o.user) || ''); return ''; },
  completeJSON: async () => null,
});

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = t => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const T = {
    coach: issueToken('coach', C, 'coach'),
    p1:    issueToken('p1', C, 'member'),
    out:   issueToken('out', C, 'member'),
    far:   issueToken('far', X, 'coach'),
  };
  const post = (u, b, t) => fetch(base + u, { method: 'POST', headers: H(t), body: JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const turn = (who, text, about) => post('/api/assistant/turn', { text, about }, T[who]);
  const block = () => { const i = handed.indexOf('HOW THIS CONNECTS'); return i < 0 ? '' : handed.slice(i); };

  try {
    console.log('\n  A — A LEADER SETS A GROUP FOCUS ON A GROUP INQUIRY, THROUGH THE REAL ROUTE');
    const made = await post('/api/group/sq/focus',
      { text: 'Start the build deeper for three games', fromInquiryId: 'inq_q' }, T.coach);
    ok('GFL-A1 the route accepts it and returns the focus the canonical constructor built',
      made.status === 200 && !!(made.j && made.j.focus && made.j.focus.focusId));
    const FID = made.j && made.j.focus && made.j.focus.focusId;
    ok('GFL-A2 …and the record carries the link in the OWNER\'S field, which is the field this whole item is about',
      made.j.focus.origin && made.j.focus.origin.inquiryId === 'inq_q'
      && made.j.focus.origin.from === 'inquiry');
    ok('GFL-A2b …and NOT in the personal shape, so nothing here has been quietly normalised to suit the reader',
      made.j.focus.addresses === undefined && made.j.focus.resolvedAt === undefined);
    ok('GFL-A3 a member of the squad cannot set the group\'s focus — the gate the UI only decorates',
      (await post('/api/group/sq/focus', { text: 'mine now' }, T.p1)).status === 403);
    ok('GFL-A3b …and a focus naming an inquiry that is not this group\'s is refused rather than silently unlinked',
      (await post('/api/group/sq/focus', { text: 'x', fromInquiryId: 'not_ours' }, T.coach)).status === 404);

    console.log('\n  B — THE LEADER CLOSES IT, AND THE OUTCOME IS A RECORD RATHER THAN A WORD');
    const closed = await post(`/api/group/sq/focus/${FID}/outcome`,
      { result: 'better', note: 'kept the ball better in the middle third' }, T.coach);
    ok('GFL-B1 the outcome route accepts it',
      closed.status === 200 && !!(closed.j && closed.j.focus && closed.j.focus.outcome));
    ok('GFL-B2 …and writes the time at outcome.at, an epoch number — the field the reader had never looked at',
      Number.isFinite(closed.j.focus.outcome.at) && closed.j.focus.outcome.at > 0
      && closed.j.focus.resolvedAt === undefined);
    ok('GFL-B3 …and a member cannot close their squad\'s focus',
      (await post(`/api/group/sq/focus/${FID}/outcome`, { result: 'better' }, T.p1)).status === 403);

    /* WHAT ARRIVED AFTERWARDS. Two accounts on the inquiry the focus was started on, dated after
       the outcome — so `observedSince` has a real number to report. A zero would have proved
       nothing at all: it is exactly what the broken reader returned. */
    const AFTER = Date.now() + 1000;
    inquiryStates[C]['group:sq'].inq_q.signals.push(
      SIG('p6', 'inq_q', AFTER,     'the goalkeeper is starting it quicker now'),
      SIG('p7', 'inq_q', AFTER + 1, 'we still lose it when they press two'),
    );
    // And one on the OTHER inquiry, which must not be counted against this focus.
    inquiryStates[C]['group:sq'].inq_o.signals.push(SIG('p8', 'inq_o', AFTER + 2, 'near post again'));

    console.log('\n  C — AND A MEMBER ASKING WHETHER IT HELPED IS HANDED THE WHOLE LOOP');
    handed = '';
    await turn('p1', 'Did starting deeper make any difference?', { kind: 'focus', id: FID });
    ok('GFL-C0 the composer ran at all — every assertion below is about the text it was handed',
      handed.length > 100);
    ok('GFL-C1 the connection block is in the prompt the model was given',
      /HOW THIS CONNECTS TO THEIR OTHER RECORDS/.test(handed));
    ok('GFL-C2 …and names the RIGHT inquiry — the one the focus was started on, not the other one',
      /started to work on an inquiry: Building from the back/i.test(block())
      && !/Defending set pieces/i.test(block()));
    ok('GFL-C2b …with the article the kind actually takes, because a bundle asking a model to be precise should read as though somebody proof-read it',
      !/\bon a inquiry\b/i.test(handed));
    ok('GFL-C3 …and the outcome the LEADER recorded, as the result rather than a stringified record',
      /the person recorded the outcome of this focus as: better/i.test(block())
      && !/\[object Object\]/.test(handed));
    ok('GFL-C4 …and what has arrived on that inquiry SINCE the outcome, as a real count',
      /2 record\(s\) have arrived on that thing SINCE the outcome/i.test(block()));
    ok('GFL-C4b …counting only the inquiry this focus addressed, not everything the squad has said since',
      !/3 record\(s\) have arrived/i.test(block()));
    ok('GFL-C5 …with the causal refusal in the same block as the data, not left to a prompt to remember',
      /is NOT evidence the focus caused it, and you must not say it was/i.test(block()));
    ok('GFL-C6 …and the repetition rule, because a list of connections is the shape that invites "three things point at this"',
      /a connection does NOT make/i.test(handed)
      && /two records resting on one account are still one account/i.test(handed));
    ok('GFL-C7 the loop is reported as CLOSED — nothing is listed as still open, because nothing is',
      !/OPEN: this focus does not say what it was started to work on/i.test(handed)
      && !/OPEN: no outcome has been recorded/i.test(handed)
      && !/nothing has been recorded on that thing since the outcome/i.test(handed));

    console.log('\n  D — AND IT CARRIES NOTHING IT SHOULD NOT');
    ok('GFL-D1 not a word of what the squad SAID travels in the connection bundle — labels and refs only',
      !new RegExp(SQUAD_WORDS, 'i').test(block()));
    ok('GFL-D1b …nor any of the accounts that arrived after the outcome, which are counted and never quoted',
      !/goalkeeper is starting it quicker/i.test(block()) && !/when they press two/i.test(block()));
    ok('GFL-D2 nobody is NAMED in the bundle — a count of accounts is not a list of who gave them',
      !/Player \d/i.test(block()) && !/Head Coach/i.test(block()));

    console.log('\n  E — THE OTHER END OF THE SAME EDGE, AND THE ENDS THAT DO NOT EXIST');
    handed = '';
    await turn('p1', 'What is the state of this one?', { kind: 'inquiry', id: 'inq_q' });
    ok('GFL-E1 the inquiry reports the other direction — it is being worked on by that focus',
      /is being worked on by a focus: Start the build deeper/i.test(block()));
    ok('GFL-E1b …and does NOT claim the loop, because a loop belongs to the focus that ran it',
      !/the person recorded the outcome of this focus/i.test(handed));
    handed = '';
    await turn('p1', 'And this one?', { kind: 'inquiry', id: 'inq_o' });
    ok('GFL-E2 a group inquiry no focus was started on carries no connection block at all — the bundle is not decorative',
      handed.length > 100 && !/HOW THIS CONNECTS TO THEIR OTHER RECORDS/.test(handed));

    console.log('\n  F — AND SOMEBODY OUTSIDE THE SQUAD GETS NOTHING');
    handed = '';
    await turn('out', 'Tell me about that focus', { kind: 'focus', id: FID });
    ok('GFL-F1 a member of another node in the same organisation is handed no bundle for this squad\'s focus',
      !/Start the build deeper/i.test(handed) && !/Building from the back/i.test(handed));
    handed = '';
    await turn('far', 'Tell me about that focus', { kind: 'focus', id: FID });
    ok('GFL-F2 …and another tenant is handed nothing either, which fails closed at the object rather than at the edge',
      !/Start the build deeper/i.test(handed) && !/Building from the back/i.test(handed));

    console.log('\n  G — A FOCUS A LEADER SIMPLY DECIDED ON STILL HAS NO LINK TO INVENT');
    const plain = await post('/api/group/sq/focus', { text: 'Throw-ins in our own half' }, T.coach);
    ok('GFL-G1 a focus set with no originating inquiry records origin.from = leader and no inquiryId',
      plain.status === 200 && plain.j.focus.origin.from === 'leader'
      && plain.j.focus.origin.inquiryId === null);
    handed = '';
    await turn('p1', 'Any read on this one?', { kind: 'focus', id: plain.j.focus.focusId });
    /* NAMED EXACTLY, not "either this or nothing". An assertion with an `||` fallback passes when
       the interesting branch never runs, which is how a bundle that silently stopped being built
       would still read as green here. */
    ok('GFL-G2 …and the turn about it says WHERE THE LOOP IS OPEN rather than inventing an inquiry for it',
      /this focus does not say what it was started to work on/i.test(handed)
      && /no outcome has been recorded on this focus yet/i.test(handed));
    ok('GFL-G2b …and never names the inquiry the OTHER focus was started on',
      !/started to work on an inquiry: Building from the back/i.test(block()));

  } catch (e) { fail++; console.error('  FAIL group-focus-loop suite threw:', e && e.stack); }

  Object.assign(ai, REAL);
  server.close();
  console.log(`\ngroup-focus-loop-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
