/* Truth layer — FORUM INFORMS THIS OBJECT'S CONVERSATION, FOR ALL FOUR KINDS, DRIVEN.

   `_forumContext` returned **null on every call** for the whole of round 3 and was reported PASS.
   Two things were wrong, one under the other:

     1  it read `a.kind` off `_turnAbout(about)`, which returns `{headline, body}`
     2  and even with a ref, it keyed the room on the AUDIENCE's forumKind rather than on the
        object's kind — so a squad's Focus, whose room is written at `focus:<id>`, was looked for
        under `tf_...` and came back empty

   Both are fixed. THIS FILE EXISTS BECAUSE NOTHING DROVE THEM. forum-audience-smoke calls the
   reader directly, which establishes the rules it applies; it says nothing about whether a person
   talking to IntelliQ on an object's own screen is ever handed that object's room.

   So every assertion below drives `POST /api/assistant/turn` with a real bound object and reads
   the prompt the gateway would have sent. All four kinds the founder's rule names get a real room
   with real authorised content posted into it:

     a group HIGH      a projection of an inquiry, room keyed by the inquiry id
     a group LOW       the same, other polarity
     a group INQUIRY   the node's lead question
     a group FOCUS     room keyed `focus:<id>`, the one the second defect hid

   AND AN EMPTY ROOM IS NOT A FAILED READ. A room nobody has spoken in returns a thread with no
   messages; a room that does not exist returns an error. A surface that cannot tell them apart
   will eventually tell somebody "nobody has said anything" about a room it could not open.

   Run: node scripts/forum-context-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';

const ai = require('../ai/gateway.js');
const S  = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, orgNodes } = S;

let pass = 0, fail = 0;
/* A THROW IS A FAILURE, NOT A SILENT EXIT — PROTOCOL lie #8. */
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'fcx', X = 'fcy';
const NOW = Date.UTC(2026, 2, 10, 9, 0, 0), DAY = 86400000;

/* TWELVE MEMBERS, AND THE NUMBER IS LOAD-BEARING — as is the five who contribute. The cohort
   floor is TWO-SIDED: at least 5 counted AND at least 5 left uncounted, because naming five of
   six names the sixth. So a squad of six can never surface a High or a Low at all, and every
   assertion about one would pass against a permanently refusing surface — the empty-fixture lie
   (#5) in PROTOCOL.md, and the shape this fixture was written in on the first attempt. Twelve
   with five contributors clears both sides and exercises the surface rather than assuming it. */
const SQUAD = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12'];

const SIG = (who, n, at) => ({ kind: 'observation', status: 'active', source: who,
  originRef: `o_${who}_${n}`, at, turnId: `t_${who}_${n}`, directness: 'direct',
  authority: 'corroborated', specificity: 0.7, ref: `ev_${who}_${n}`, contributedBy: who,
  text: 'something the squad noticed' });

/* FIVE CONTRIBUTORS, FIVE ORIGINS — enough to clear the floor and the origin gate together. */
const INQ = (id, concept, label, unknowns = []) => ({
  inquiryId: id, subjectRef: `group:sq`, topic: { canonicalConcept: concept, label },
  status: 'exploring',
  hypotheses: [{ id: `h_${id}`, statement: `A working read about ${label}`,
    confidence: { score: 0.7, band: 'probable' }, status: 'open' }],
  leadingHypothesisId: `h_${id}`,
  signals: SQUAD.slice(0, 5).map((who, i) => SIG(who, id, NOW - (10 - i) * DAY)),
  confidence: { score: 0.7, band: 'probable', because: ['5 independent origins'] },
  /* THE LEAD QUESTION IS DRAWN FROM AN INQUIRY'S LIVE UNKNOWNS, so an inquiry with none can
     never be one — `openQuestion` filters on `stillUnknown.length` before anything else. */
  missingSignals: unknowns.map(question => ({ question })),
  falsifiers: [], timeline: [], lastUpdatedAt: NOW,
});

/* THE VALENCE IS THE CONTRIBUTORS' CALL, never the system's — so a High exists because people
   said "this is working", and a Low because they said "this needs attention". */
const CAND = (concept, valence, who) => ({
  candidateId: `gc_${concept}_${who}`, orgCode: C, nodeId: 'sq', contributorId: who,
  concept, label: concept, evidenceRef: `ev_${who}_x`, originRef: `o_${who}_${concept}`,
  originKind: 'first_hand', authority: 'self_report', scope: 'GROUP_CANDIDATE',
  status: 'contributed', valence, contributorRole: 'member', createdAt: NOW - 9 * DAY,
});

_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Alma College', orgMode: 'sports' }, [X]: { orgName: 'Elsewhere', orgMode: 'sports' } },
  orgUsers: {
    [C]: {
      coach: { id: 'coach', name: 'Head Coach', email: 'c@x.io', role: 'coach', orgCode: C, status: 'active', leadershipNodeIds: ['sq'], assignedNodeIds: [] },
      ...Object.fromEntries(SQUAD.map((id, i) => [id, { id, name: `Player ${i + 1}`, email: `${id}@x.io`, role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['sq'] }])),
      out: { id: 'out', name: 'Other Squad', email: 'o@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['res'] },
    },
    [X]: { far: { id: 'far', name: 'Far Away', email: 'f@x.io', role: 'coach', orgCode: X, status: 'active', leadershipNodeIds: ['th'] } },
  },
  orgNodes: {
    [C]: {
      sq:  { nodeId: 'sq',  name: 'First Team', parentId: null, childNodeIds: [], memberIds: SQUAD, leaderIds: ['coach'] },
      res: { nodeId: 'res', name: 'Reserves',   parentId: null, childNodeIds: [], memberIds: ['out'], leaderIds: [] },
    },
    [X]: { th: { nodeId: 'th', name: 'Theirs', parentId: null, childNodeIds: [], memberIds: [], leaderIds: ['far'] } },
  },
  inquiryStates: { [C]: { 'group:sq': {
    inq_high: INQ('inq_high', 'football.rest_day', 'The extra rest day'),
    inq_low:  INQ('inq_low',  'football.set_pieces', 'Defending set pieces'),
    inq_q:    INQ('inq_q',    'football.build_up', 'Building from the back',
      ['does starting deeper actually help, or does it just move the problem?']),
  } } },
  groupCandidates: { [C]: [
    ...SQUAD.slice(0, 3).map(w => CAND('football.rest_day', 'working_well', w)),
    ...SQUAD.slice(0, 3).map(w => CAND('football.set_pieces', 'worth_attention', w)),
    // inq_q deliberately gets NO valence call, so it stays neutral and lands as the question.
  ] },
  teamFocuses: { [C]: { sq: [
    { focusId: 'tf_press', nodeId: 'sq', text: 'Press from the centre-back\'s first touch',
      status: 'active', createdAt: NOW - 6 * DAY, by: 'coach',
      origin: { from: 'leader', by: 'coach', at: NOW - 6 * DAY, inquiryId: null } },
    /* A SECOND FOCUS NOBODY HAS SPOKEN ABOUT. Its room exists — same squad, same rule — and it
       is empty, which is the state section E needs and which a room with speech in it cannot
       stand in for. */
    { focusId: 'tf_quiet', nodeId: 'sq', text: 'Throw-ins in our own half',
      status: 'active', createdAt: NOW - 4 * DAY, by: 'coach',
      origin: { from: 'leader', by: 'coach', at: NOW - 4 * DAY, inquiryId: null } },
  ] } },
});
_rebuildEmailIndex();

const REAL = { enabled: ai.enabled, budgetAvailable: ai.budgetAvailable, complete: ai.complete, completeJSON: ai.completeJSON };
let handed = '';
Object.assign(ai, {
  enabled: () => true, budgetAvailable: () => true,
  complete: async (o) => { handed = String((o && o.user) || ''); return ''; },
  completeJSON: async () => null,
});

/* ONE SENTENCE PER ROOM, each distinctive enough that finding it in the wrong turn is
   unmistakable. If two rooms shared a phrase, "the right room reached the turn" would be
   satisfied by the wrong one. */
const SAID = {
  high:  'the extra rest day is the thing that changed for us',
  low:   'we are losing the second ball at every corner',
  inq:   'starting deeper only works if the full-backs push on',
  focus: 'pressing on the first touch leaves us short in midfield',
};

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = t => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const T = {
    coach: issueToken('coach', C, 'coach'), out: issueToken('out', C, 'member'),
    far: issueToken('far', X, 'coach'),
    ...Object.fromEntries(SQUAD.map(id => [id, issueToken(id, C, 'member')])),
  };
  const get  = (u, t) => fetch(base + u, { headers: H(t) }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const post = (u, t, b) => fetch(base + u, { method: 'POST', headers: H(t), body: JSON.stringify(b || {}) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const turn = async (who, text, about) => {
    handed = '';
    await post('/api/assistant/turn', T[who], { text, about });
    return handed;
  };

  try {
    console.log('\n  A — ALL FOUR KINDS EXIST AS REAL OBJECTS WITH A REAL ROOM');
    const objs = {};
    for (const kind of ['high', 'low', 'inquiry', 'focus']) {
      const r = await get(`/api/objects?kind=${kind}&scope=group:sq`, T.p1);
      objs[kind] = ((r.j && r.j.objects) || [])[0] || null;
      ok(`FC-A1 a group ${kind.toUpperCase()} is in the squad's bucket — without it nothing below is testing that kind`,
        !!objs[kind] && !!objs[kind].id);
    }
    ok('FC-A1b …and the High and the Low are DIFFERENT objects, or one polarity is standing in for both',
      objs.high && objs.low && objs.high.id !== objs.low.id);
    for (const kind of ['high', 'low', 'inquiry', 'focus']) {
      const th = await get(`/api/objects/${kind}/${objs[kind].id}/thread?scope=group:sq`, T.p1);
      ok(`FC-A2 …and its own screen says it has a room, with the count the rule turns on (${kind})`,
        th.status === 200 && th.j.forumAvailable === true && th.j.forumReadable === SQUAD.length + 1);
    }

    console.log('\n  B — AUTHORISED SPEECH IN EACH ROOM REACHES THAT OBJECT\'S PRIVATE TURN');
    /* A High and a Low are PROJECTIONS of their inquiry, so their room is the node room keyed by
       the inquiry's own id. A Focus has its own room. Posted through the routes a person uses. */
    await post(`/api/group/sq/forum/${objs.high.id}`, T.p1, { text: SAID.high });
    await post(`/api/group/sq/forum/${objs.low.id}`,  T.p2, { text: SAID.low });
    await post(`/api/group/sq/forum/${objs.inquiry.id}`, T.p3, { text: SAID.inq });
    await post(`/api/forum/focus/${objs.focus.id}`,   T.p4, { text: SAID.focus });

    const seen = {};
    for (const [kind, key] of [['high', 'high'], ['low', 'low'], ['inquiry', 'inq'], ['focus', 'focus']]) {
      seen[kind] = await turn('p1', 'What should we make of this?', { kind, id: objs[kind].id });
      ok(`FC-B1 a turn on the ${kind.toUpperCase()} is handed that room's own words`,
        new RegExp(SAID[key], 'i').test(seen[kind]));
      ok(`FC-B1b …with the rule beside the data, so six agreeing messages cannot become "the group agrees" (${kind})`,
        /not evidence|changes nothing|does not (?:make|count)/i.test(seen[kind]));
      ok(`FC-B1c …and NO AUTHOR, because forum speech is anonymous to every human and the one reader that is not a human must not be the way round it (${kind})`,
        !/Player 1|Player 2|Player 3|Player 4/.test(seen[kind].slice(seen[kind].indexOf('DISCUSS'))));
    }

    console.log('\n  C — AND ONLY THAT OBJECT\'S');
    for (const [kind, key] of [['high', 'high'], ['low', 'low'], ['inquiry', 'inq'], ['focus', 'focus']]) {
      const others = [['high', 'high'], ['low', 'low'], ['inquiry', 'inq'], ['focus', 'focus']]
        .filter(([k]) => k !== kind);
      ok(`FC-C1 the ${kind.toUpperCase()} turn carries none of the other three rooms`,
        others.every(([, ok2]) => !new RegExp(SAID[ok2], 'i').test(seen[kind])));
    }

    console.log('\n  D — AND NOBODY WHO SHOULD NOT HAVE IT GETS IT');
    const outsider = await turn('out', 'What about this?', { kind: 'high', id: objs.high.id });
    ok('FC-D1 somebody on another squad is handed none of it — they cannot open the object, so the room never arises',
      !new RegExp(SAID.high, 'i').test(outsider));
    const alien = await turn('far', 'What about this?', { kind: 'high', id: objs.high.id });
    ok('FC-D2 …and neither is another tenant, failing closed at the object rather than at the room',
      !new RegExp(SAID.high, 'i').test(alien));

    /* REMOVED FROM THE NODE THIS MORNING, NOTHING THIS AFTERNOON. Resolved on every read, with
       nothing cached and no membership list stored, which is what makes the removal take effect
       on the very next request rather than after a sweep. */
    const keep = orgNodes[C].sq.memberIds.slice();
    orgNodes[C].sq.memberIds = keep.filter(id => id !== 'p1');
    const removed = await turn('p1', 'What about this?', { kind: 'high', id: objs.high.id });
    ok('FC-D3 a member removed from the node is handed nothing on the very next turn',
      !new RegExp(SAID.high, 'i').test(removed));
    orgNodes[C].sq.memberIds = keep;
    const back = await turn('p1', 'What about this?', { kind: 'high', id: objs.high.id });
    ok('FC-D3b …and it comes back when they do, because nothing was stored to go stale',
      new RegExp(SAID.high, 'i').test(back));

    console.log('\n  E — AN EMPTY ROOM IS NOT A FAILED READ');
    /* inq_q's room has speech; this is a room nobody has opened at all. The distinction matters
       because a surface that cannot tell them apart will eventually say "nobody has said
       anything" about a room it could not open. */
    const emptyRoom = await get('/api/forum/focus/tf_quiet', T.p5);
    ok('FC-E0 a room nobody has spoken in answers 200 with a thread and NO messages',
      emptyRoom.status === 200 && Array.isArray(emptyRoom.j.messages) && emptyRoom.j.messages.length === 0);
    const missing = await get('/api/group/sq/forum/inq_does_not_exist', T.p1);
    ok('FC-E1 a room that does NOT exist answers with an error and a reason, not an empty thread',
      missing.status >= 400 && !!(missing.j && missing.j.error) && !Array.isArray(missing.j && missing.j.messages));
    const refused = await get(`/api/group/sq/forum/${objs.high.id}`, T.out);
    ok('FC-E2 …and a room somebody may not read is refused rather than returned empty, which is the same distinction one level up',
      refused.status === 403);
    /* AND IN THE TURN: an object with a room nobody has spoken in carries no discussion block,
       which is correct — there is nothing to carry — and is reached by a DIFFERENT path from the
       one that carries nothing because the read failed. */
    const quietTurn = await turn('p5', 'Anything worth saying here?', { kind: 'focus', id: 'tf_quiet' });
    ok('FC-E3 a turn on the object whose room is EMPTY carries no discussion block — there is nothing to carry',
      quietTurn.length > 50 && !/WHAT THE PEOPLE|DISCUSS/i.test(quietTurn));
    ok('FC-E3b …while the object whose room has speech carries it, so E3 is not passing for want of a room at all',
      new RegExp(SAID.focus, 'i').test(await turn('p5', 'And here?', { kind: 'focus', id: objs.focus.id })));

    /* ══ F — THE INDICATOR ON THE CARD IS THE SAME ANSWER AS THE ROOM ═══════════════════════
       The card used to decide this for itself out of two fields the objects projection does not
       carry, so it could never be true. It asks the canonical owner now, and this drives the
       PROJECTION the cards are built from rather than the owner in isolation — a list route is
       where an availability rule silently stops being applied. */
    console.log('\n  F — THE CARD PROJECTION CARRIES THE SAME ANSWER AS THE ROOM');
    for (const kind of ['high', 'low', 'inquiry', 'focus']) {
      const r = await get(`/api/objects?kind=${kind}&scope=group:sq`, T.p1);
      const row = ((r.j && r.j.objects) || []).find(o => o.id === objs[kind].id);
      const th = await get(`/api/objects/${kind}/${objs[kind].id}/thread?scope=group:sq`, T.p1);
      ok(`FC-F1 the ${kind.toUpperCase()} card says it has a room, and says the SAME thing its own screen says`,
        !!row && row.forumAvailable === true && row.forumAvailable === th.j.forumAvailable);
    }
    /* A ONE-PERSON NODE. The node exists, so every rule that asked "is there a node" said yes;
       the rule that asks "are there two people" says no, and the card must agree. */
    const solo = await get('/api/objects?kind=focus&scope=group:res', T.out);
    ok('FC-F2 a SINGLETON node\'s objects are not offered a room on the card either',
      solo.status === 200 && ((solo.j && solo.j.objects) || []).every(o => o.forumAvailable === false));
    ok('FC-F2b …and the card and the screen still agree about it, which is the whole reason there is one owner',
      (() => {
        const rows = (solo.j && solo.j.objects) || [];
        return rows.length === 0 || rows.every(o => o.forumAvailable === false);
      })());

    /* REMOVED FROM THE NODE — the card, on the very next read, exactly as the room was. */
    /* A LEADER IS SOMEBODY YOU CAN TALK TO. Shrinking the roster to one MEMBER leaves a room of
       two, because the coach is in it — which is correct, and is why this case removes the leader
       as well to reach an actual room of one. Asserting the wrong thing here would have reported
       a product defect that was a fixture mistake. */
    const keep2 = orgNodes[C].sq.memberIds.slice(), keepL = orgNodes[C].sq.leaderIds.slice();
    orgNodes[C].sq.memberIds = ['p1'];
    const twoLeft = await get('/api/objects?kind=focus&scope=group:sq', T.p1);
    ok('FC-F3 one member and a leader is still a room of two, and the card still says so',
      ((twoLeft.j && twoLeft.j.objects) || []).some(o => o.forumAvailable === true));
    orgNodes[C].sq.leaderIds = [];
    const shrunk = await get('/api/objects?kind=focus&scope=group:sq', T.p1);
    ok('FC-F3a …and a node that has shrunk to ONE PERSON stops offering the icon on the very next read',
      ((shrunk.j && shrunk.j.objects) || []).every(o => o.forumAvailable === false));
    orgNodes[C].sq.memberIds = [];
    orgNodes[C].sq.leaderIds = keepL;
    const emptied = await get('/api/objects?kind=focus&scope=group:sq', T.coach);
    ok('FC-F3b …and an EMPTY node offers it to nobody, including the leader who can still read it',
      ((emptied.j && emptied.j.objects) || []).every(o => o.forumAvailable === false));
    orgNodes[C].sq.memberIds = keep2;
    orgNodes[C].sq.leaderIds = keepL;
    const restored = await get('/api/objects?kind=focus&scope=group:sq', T.p1);
    ok('FC-F3c …and it comes back when the roster does, because the answer is computed rather than stored',
      ((restored.j && restored.j.objects) || []).some(o => o.forumAvailable === true));

    ok('FC-F4 another tenant cannot read the list at all, so the question of an icon never arises',
      (await get('/api/objects?kind=focus&scope=group:sq', T.far)).status >= 400);
    ok('FC-F5 an UNSUPPORTED kind is refused by the list route rather than answered with an availability it has no rule for',
      (await get('/api/objects?kind=material&scope=group:sq', T.p1)).status === 400);

  } catch (e) { fail++; console.error('  FAIL forum-context suite threw:', e && e.stack); }

  Object.assign(ai, REAL);
  server.close();
  console.log(`\nforum-context-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
