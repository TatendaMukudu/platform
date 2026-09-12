/* Truth layer — PRIVATE → FORUM, THE OTHER DIRECTION, DRIVEN.

   The founder's rule has two halves and only one of them had been driven. Forum content may
   inform private conversation for that same object — forum-context-http-smoke proves that.
   PRIVATE CONVERSATION NEVER ENTERS A FORUM without a separate explicit Share to Forum action, an
   audience preview, and a confirmation — and that half had a suite reading the source of the
   handler rather than pressing the button.

   The difference matters more in this direction than in the other. A read that fails shows
   somebody less than they were entitled to see. A write that happens without confirmation puts a
   person's private words in front of their squad, and there is no undoing it.

   So every assertion below drives the real routes:

     POST /api/assistant/turn                       the model OFFERS the action
     POST /api/assistant/turn/:turnId/confirm       the person confirms it
     GET  /api/forum/... , /api/group/:node/forum/… what is actually in the room afterwards

   The model is steered through ai.completeJSON — the same module object server.js holds — so the
   proposal arrives the way a real one does and nothing here fabricates a proposal id.

   Run: node scripts/forum-share-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';

const ai = require('../ai/gateway.js');
const S  = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, orgNodes, forumThreads } = S;

let pass = 0, fail = 0;
/* A THROW IS A FAILURE, NOT A SILENT EXIT — PROTOCOL lie #8. */
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'fsh', X = 'fsx';
const NOW = Date.UTC(2026, 2, 10, 9, 0, 0), DAY = 86400000;
const SQUAD = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12'];

const SIG = (who, n, at) => ({ kind: 'observation', status: 'active', source: who,
  originRef: `o_${who}_${n}`, at, turnId: `t_${who}_${n}`, directness: 'direct',
  authority: 'corroborated', specificity: 0.7, ref: `ev_${who}_${n}`, contributedBy: who,
  text: 'something the squad noticed' });

const INQ = (id, concept, label, unknowns = []) => ({
  inquiryId: id, subjectRef: 'group:sq', topic: { canonicalConcept: concept, label },
  status: 'exploring',
  hypotheses: [{ id: `h_${id}`, statement: `A working read about ${label}`,
    confidence: { score: 0.7, band: 'probable' }, status: 'open' }],
  leadingHypothesisId: `h_${id}`,
  signals: SQUAD.slice(0, 5).map((w, i) => SIG(w, id, NOW - (10 - i) * DAY)),
  confidence: { score: 0.7, band: 'probable', because: ['5 independent origins'] },
  missingSignals: unknowns.map(question => ({ question })),
  falsifiers: [], timeline: [], lastUpdatedAt: NOW,
});

_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Alma College', orgMode: 'sports' }, [X]: { orgName: 'Elsewhere', orgMode: 'sports' } },
  orgUsers: {
    [C]: {
      coach: { id: 'coach', name: 'Head Coach', email: 'c@f.io', role: 'coach', orgCode: C, status: 'active', leadershipNodeIds: ['sq'], assignedNodeIds: [] },
      ...Object.fromEntries(SQUAD.map((id, i) => [id, { id, name: `Player ${i + 1}`, email: `${id}@f.io`, role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['sq'] }])),
      out: { id: 'out', name: 'Other Squad', email: 'o@f.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['res'] },
    },
    [X]: { far: { id: 'far', name: 'Far Away', email: 'f@f.io', role: 'coach', orgCode: X, status: 'active', leadershipNodeIds: ['th'] } },
  },
  orgNodes: {
    [C]: {
      sq:  { nodeId: 'sq',  name: 'First Team', parentId: null, childNodeIds: [], memberIds: SQUAD, leaderIds: ['coach'] },
      res: { nodeId: 'res', name: 'Reserves',   parentId: null, childNodeIds: [], memberIds: ['out'], leaderIds: [] },
    },
    [X]: { th: { nodeId: 'th', name: 'Theirs', parentId: null, childNodeIds: [], memberIds: [], leaderIds: ['far'] } },
  },
  inquiryStates: { [C]: { 'group:sq': {
    inq_q: INQ('inq_q', 'football.build_up', 'Building from the back',
      ['does starting deeper actually help, or does it just move the problem?']),
  } } },
  teamFocuses: { [C]: {
    sq:  [{ focusId: 'tf_press', nodeId: 'sq', text: 'Press from the first touch', status: 'active',
      createdAt: NOW - 6 * DAY, by: 'coach', origin: { from: 'leader', by: 'coach', at: NOW - 6 * DAY, inquiryId: null } }],
    res: [{ focusId: 'tf_solo', nodeId: 'res', text: 'One person, one focus', status: 'active',
      createdAt: NOW - 3 * DAY, by: 'out', origin: { from: 'leader', by: 'out', at: NOW - 3 * DAY, inquiryId: null } }],
  } },
});
_rebuildEmailIndex();

/* THE WORDS. Distinctive enough that finding them anywhere they do not belong is unmistakable. */
const SAID    = 'the middle third is where we keep losing it';
const EDITED  = 'we keep losing it in the middle third, and that is the bit to work on';
const PRIVATE = 'honestly I think the goalkeeper is costing us games';

const REAL = { enabled: ai.enabled, budgetAvailable: ai.budgetAvailable, complete: ai.complete, completeJSON: ai.completeJSON };
/* The model OFFERS the action and proposes only the wording, which is the whole of its authority
   under ai/composer-actions.js. It never names a room here, because there is no argument for one. */
let offerText = SAID;
Object.assign(ai, {
  enabled: () => true, budgetAvailable: () => true,
  complete: async () => '',
  completeJSON: async (o) => {
    if (String((o && o.taskType) || '') !== 'composer_action_interpret') return null;
    return { actions: [{ type: 'share_to_forum', arguments: { text: offerText },
      reason: 'You said you wanted the squad to see this.' }] };
  },
});

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = t => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const T = { p1: issueToken('p1', C, 'member'), p2: issueToken('p2', C, 'member'),
    coach: issueToken('coach', C, 'coach'), out: issueToken('out', C, 'member'), far: issueToken('far', X, 'coach') };
  const get  = (u, t) => fetch(base + u, { headers: H(t) }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const post = (u, b, t) => fetch(base + u, { method: 'POST', headers: H(t), body: JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  /* Stage a real proposal: a turn bound to the object, with the model offering the action. */
  const stage = async (who, about, text) => {
    const r = await post('/api/assistant/turn', { text: text || `Put this to the group: ${SAID}`, about }, T[who]);
    const resp = (r.j && r.j.response) || {};
    const props = resp.proposedActions || [];
    const prop = props.find(p => p.actionType === 'share_to_forum') || null;
    /* The turn id is on the ENVELOPE, not on the response -- `r.j.turnId`. Reading it off the
       response gave undefined, every confirm answered 404 'turn not found', and thirteen
       assertions failed in a way that looked exactly like a broken product. */
    return { turnId: (r.j && r.j.turnId) || (r.j && r.j.interpretation && r.j.interpretation.turnId), prop, resp };
  };
  const roomOf = async (who) => (await get('/api/group/sq/forum/inq_q', T[who]));

  try {
    console.log('\n  A — THE OFFER IS AN OFFER, AND NOTHING IS IN THE ROOM UNTIL SOMEBODY CONFIRMS');
    const before = await roomOf('p1');
    ok('FS-A0 the room is readable and empty to begin with, so everything below is a change this file caused',
      before.status === 200 && ((before.j && before.j.messages) || []).length === 0);
    const staged = await stage('p1', { kind: 'inquiry', id: 'inq_q' });
    ok('FS-A1 the model may OFFER the share, and the offer reaches the person as a proposal needing confirmation',
      !!staged.prop && staged.prop.requiredApproval === true);
    ok('FS-A2 …labelled in words rather than as an identifier, because a label is what somebody reads before they press confirm',
      !!staged.prop && /put this to the forum/i.test(String(staged.prop.label || '')));
    ok('FS-A3 …marked SHARED rather than only_me, so the card cannot present it as a private act',
      !!staged.prop && staged.prop.visibility === 'shared');
    const afterOffer = await roomOf('p1');
    ok('FS-A4 AND NOTHING IS IN THE ROOM — an offer is not a share, which is the whole of the founder\'s rule in this direction',
      ((afterOffer.j && afterOffer.j.messages) || []).length === 0);

    console.log('\n  B — THE CONFIRMATION PUTS IT THERE, ONCE');
    const done = await post(`/api/assistant/turn/${staged.turnId}/confirm`, { proposalId: staged.prop.id }, T.p1);
    ok('FS-B1 confirming posts it to the room of the object in view',
      done.status === 200 && done.j.outcome === 'posted_to_forum');
    ok('FS-B2 …and says so as SPEECH, not as evidence — the reply names the effect rather than leaving it to be assumed',
      done.j.epistemicEffect === 'none' && /not evidence/i.test(String(done.j.note || '')));
    const roomTwo = await roomOf('p2');
    ok('FS-B3 …and the room now carries the words, readable by another member of the squad',
      roomTwo.status === 200
      && ((roomTwo.j && roomTwo.j.messages) || []).some(m => String(m.text || '').includes(SAID)));
    ok('FS-B4 …once. Confirming the same proposal again is refused rather than posting twice',
      (await post(`/api/assistant/turn/${staged.turnId}/confirm`, { proposalId: staged.prop.id }, T.p1)).status === 409);

    console.log('\n  C — MEMBERSHIP IS RE-CHECKED AT CONFIRMATION, NOT INHERITED FROM STAGING');
    const keepM = orgNodes[C].sq.memberIds.slice();
    const staged2 = await stage('p2', { kind: 'inquiry', id: 'inq_q' });
    ok('FS-C0 a second person stages a share while they are still in the squad',
      !!staged2.prop);
    // Removed BETWEEN staging and confirming — the window the rule exists for.
    orgNodes[C].sq.memberIds = keepM.filter(id => id !== 'p2');
    const refused = await post(`/api/assistant/turn/${staged2.turnId}/confirm`, { proposalId: staged2.prop.id }, T.p2);
    /* WHICH GATE ACTUALLY STOPS THEM, named rather than left to an `||`. My first version accepted
       `403 || 404`, which passes whichever fires — and mutation M170, which makes the handler's
       own membership re-check unconditionally true, SURVIVED it. The refusal is not coming from
       that check at all: the OBJECT is resolved through `_allObjectsFor`, so a person removed from
       the squad can no longer resolve the group object their proposal was bound to, and the route
       answers 404 before the share handler is reached.

       The re-check below is a second door on the same corridor rather than the load-bearing one,
       and a reader of this file should know which is which — it is the same lesson M83 taught
       about the cross-evidence reader last round. M172 mutates the resolution and this goes red. */
    ok('FS-C1 …and is refused at CONFIRMATION after being removed from the squad, rather than posting on a stale permission',
      refused.status === 404 && /not found/i.test(String((refused.j || {}).error || '')));
    const roomAfterRefusal = await roomOf('p1');
    ok('FS-C1b …and nothing of theirs is in the room',
      !((roomAfterRefusal.j && roomAfterRefusal.j.messages) || []).some(m => String(m.text || '').includes(SAID)
        && m.authorId === 'p2'));
    orgNodes[C].sq.memberIds = keepM;
    const stagedRoster = await stage('p1', { kind: 'inquiry', id: 'inq_q' });
    const beforeRoster = await roomOf('p2');
    // Same headcount, different recipients: a count-only comparison would miss this.
    orgNodes[C].sq.memberIds = keepM.filter(id => id !== 'p3').concat(['out']);
    const changedRoster = await post(`/api/assistant/turn/${stagedRoster.turnId}/confirm`,
      { proposalId: stagedRoster.prop.id }, T.p1);
    ok('FS-C2 a same-size recipient swap requires a fresh audience preview and consent',
      changedRoster.status === 409 && /forum_audience_changed/.test(String((changedRoster.j || {}).error || '')));
    orgNodes[C].sq.memberIds = keepM;
    const afterRoster = await roomOf('p2');
    ok('FS-C3 a refused stale-audience share writes no message',
      ((afterRoster.j && afterRoster.j.messages) || []).length === ((beforeRoster.j && beforeRoster.j.messages) || []).length);

    console.log('\n  D — THE ROOM IS THE OBJECT\'S, AND THE PROPOSAL CANNOT NAME ANOTHER ONE');
    const stagedFocus = await stage('p1', { kind: 'focus', id: 'tf_press' });
    const doneFocus = await post(`/api/assistant/turn/${stagedFocus.turnId}/confirm`, { proposalId: stagedFocus.prop.id }, T.p1);
    ok('FS-D1 a share staged on the FOCUS lands in the focus\'s own room',
      doneFocus.status === 200 && doneFocus.j.forum && doneFocus.j.forum.objectId === 'tf_press'
      && doneFocus.j.forum.room === 'focus');
    const focusRoom = await get('/api/forum/focus/tf_press', T.p2);
    ok('FS-D1b another member actually reads the confirmed words in that Focus room',
      focusRoom.status === 200 && ((focusRoom.j && focusRoom.j.messages) || [])
        .some(m => String(m.text || '').includes(SAID)));
    const inq = await roomOf('p1');
    ok('FS-D2 …and NOT in the inquiry\'s room, though both belong to the same squad — same object is structural, not a promise',
      ((inq.j && inq.j.messages) || []).filter(m => String(m.text || '').includes(SAID)).length === 1);

    console.log('\n  E — AND A ROOM THAT DOES NOT EXIST CANNOT BE SHARED INTO');
    const stagedSolo = await stage('out', { kind: 'focus', id: 'tf_solo' });
    const soloDone = stagedSolo.prop
      ? await post(`/api/assistant/turn/${stagedSolo.turnId}/confirm`, { proposalId: stagedSolo.prop.id }, T.out)
      : { status: 0, j: null };
    ok('FS-E1 a singleton object has no room, so confirming a share into it is refused with the reason',
      soloDone.status === 403 && /nobody/i.test(String((soloDone.j || {}).error || '')));
    const stagedFar = await stage('far', { kind: 'inquiry', id: 'inq_q' });
    ok('FS-E2 another tenant cannot even stage a share on this squad\'s object, because the object is not theirs to bind to',
      !stagedFar.prop || (await post(`/api/assistant/turn/${stagedFar.turnId}/confirm`,
        { proposalId: stagedFar.prop.id }, T.far)).status >= 400);
    const stagedOut = await stage('out', { kind: 'inquiry', id: 'inq_q' });
    ok('FS-E3 …and neither can a member of another node in the same organisation',
      !stagedOut.prop || (await post(`/api/assistant/turn/${stagedOut.turnId}/confirm`,
        { proposalId: stagedOut.prop.id }, T.out)).status >= 400);

    console.log('\n  F — THE WORDS ARE THE PERSON\'S, AND THEIR EDIT WINS');
    /* ai/composer-actions.js states this as the contract: "the text is the PERSON'S, carried in
       `text` and editable on the card, because a share whose wording the person did not see is a
       share they did not make". The confirm route's own comment repeats it. Driven here, because
       a capability described in two comments and exercised by nothing is the shape this whole
       engagement keeps finding. */
    offerText = SAID;
    const stagedEdit = await stage('p1', { kind: 'inquiry', id: 'inq_q' });
    const edited = await post(`/api/assistant/turn/${stagedEdit.turnId}/confirm`,
      { proposalId: stagedEdit.prop.id, overrides: { text: EDITED } }, T.p1);
    ok('FS-F1 confirming with the wording the person edited on the card is ACCEPTED',
      edited.status === 200 && edited.j.outcome === 'posted_to_forum');
    const roomEdited = await roomOf('p1');
    ok('FS-F2 …and what lands in the room is THEIR words, not the ones the model proposed',
      ((roomEdited.j && roomEdited.j.messages) || []).some(m => String(m.text || '').includes(EDITED)));
    ok('FS-F3 …and the model\'s original wording is not posted alongside it',
      ((roomEdited.j && roomEdited.j.messages) || []).filter(m => String(m.text || '').trim() === SAID).length === 1);
    /* AND THE EXCEPTION IS EXACTLY ONE FIELD ON EXACTLY ONE ACTION. Everything else in a proposal
       stays frozen: a proposal id authorises the payload the person was shown, and a browser that
       can rewrite any other field can turn a confirmation into a second, hidden proposal. */
    const stagedRoom = await stage('p1', { kind: 'inquiry', id: 'inq_q' });
    const hijack = await post(`/api/assistant/turn/${stagedRoom.turnId}/confirm`,
      { proposalId: stagedRoom.prop.id, overrides: { text: EDITED, context: { kind: 'focus', id: 'tf_press' } } }, T.p1);
    ok('FS-F4 an override naming ANY other field is refused, so the edit cannot become a second proposal',
      hijack.status === 409 && /proposal_payload_changed/.test(String((hijack.j || {}).error || '')));
    const stagedEmpty = await stage('p1', { kind: 'inquiry', id: 'inq_q' });
    const empty = await post(`/api/assistant/turn/${stagedEmpty.turnId}/confirm`,
      { proposalId: stagedEmpty.prop.id, overrides: { text: '   ' } }, T.p1);
    ok('FS-F5 …and an edit that empties the message posts nothing rather than an empty line in the room',
      empty.status === 400 && /nothing_to_share/.test(String((empty.j || {}).error || '')));

    const stagedCleared = await stage('p1', { kind: 'inquiry', id: 'inq_q' });
    ok('FS-F6 an explicitly empty share edit starts with a real proposal', !!stagedCleared.prop);
    const roomBeforeClear = await roomOf('p2');
    const cleared = await post(`/api/assistant/turn/${stagedCleared.turnId}/confirm`,
      { proposalId: stagedCleared.prop.id, overrides: { text: '' } }, T.p1);
    const roomAfterClear = await roomOf('p2');
    ok('FS-F7 empty-string edits are refused and cannot silently restore model wording',
      cleared.status === 400 && /nothing_to_share/.test(String((cleared.j || {}).error || ''))
      && (roomAfterClear.j?.messages || []).length === (roomBeforeClear.j?.messages || []).length);

    const stagedPrivate = await stage('p1', { kind: 'inquiry', id: 'inq_q' });
    ok('FS-F8 a public share can be withdrawn from a real staged proposal', !!stagedPrivate.prop);
    const corrected = await post(`/api/assistant/turn/${stagedPrivate.turnId}/correct`,
      { proposalId: stagedPrivate.prop.id, correction: 'keep this private' }, T.p1);
    const afterCorrection = await roomOf('p2');
    const attempted = await post(`/api/assistant/turn/${stagedPrivate.turnId}/confirm`,
      { proposalId: stagedPrivate.prop.id }, T.p1);
    const afterAttempt = await roomOf('p2');
    ok('FS-F9 private correction withdraws the public proposal instead of labelling it safe to confirm',
      corrected.status === 200 && corrected.j?.applied?.includes('withdrew public share')
      && !(corrected.j?.proposals || []).some(p => p.id === stagedPrivate.prop.id));
    ok('FS-F10 the old confirm cannot post; another member sees no new message',
      attempted.status === 404 && (afterAttempt.j?.messages || []).length === (afterCorrection.j?.messages || []).length);

    console.log('\n  G — AND THE PRIVATE CONVERSATION STAYS PRIVATE');
    /* The person says something in the private thread that they never offered to share. It must
       not be in the room, by any route — the only thing that crosses is what they confirmed. */
    offerText = SAID;
    await post('/api/assistant/turn', { text: PRIVATE, about: { kind: 'inquiry', id: 'inq_q' } }, T.p1);
    const finalRoom = await roomOf('p2');
    ok('FS-G1 nothing the person merely SAID in the private thread is in the room',
      !((finalRoom.j && finalRoom.j.messages) || []).some(m => String(m.text || '').includes(PRIVATE)));
    /* MY FIRST VERSION OF THIS ASSERTED THE OPPOSITE OF THE PRODUCT'S LAW, and it is worth
       leaving the correction visible. I asserted that every message in the room carries an
       `authorId` — "confirmed by its author, with the author recorded". ai/forum.js deliberately
       projects `authorId: null` to everybody, leader and admin included, and carries `mine` so a
       reader can pick out their own; authorship is held by the kernel so origins still count and
       echoes still refuse to corroborate, and it is HIDDEN rather than removed. Asserting my
       version would have demanded the product leak exactly what this surface exists to protect.
       So the assertion is the real law, in both directions. */
    ok('FS-G2 …and what IS there is attributed to nobody on the way out — not to a leader, not to an admin',
      ((finalRoom.j && finalRoom.j.messages) || []).length > 0
      && ((finalRoom.j && finalRoom.j.messages) || []).every(m => m.authorId === null));
    const ownRoom = await roomOf('p1');
    ok('FS-G2b …while the person who shared it can still see which of them are theirs',
      ((ownRoom.j && ownRoom.j.messages) || []).some(m => m.mine === true && String(m.text || '').includes(EDITED)));
    ok('FS-G2c …and another member sees the same words as nobody\'s, which is what stops one person manufacturing a consensus in public',
      ((finalRoom.j && finalRoom.j.messages) || []).some(m => String(m.text || '').includes(EDITED) && m.mine === false));
    ok('FS-G3 the share wrote SPEECH and nothing else — the inquiry it was shared from is untouched',
      () => {
        const inqNow = S.inquiryStates[C]['group:sq'].inq_q;
        return inqNow.signals.length === 5
          && !JSON.stringify(inqNow).includes(SAID) && !JSON.stringify(inqNow).includes(EDITED);
      });

  } catch (e) { fail++; console.error('  FAIL forum-share suite threw:', e && e.stack); }

  Object.assign(ai, REAL);
  server.close();
  console.log(`\nforum-share-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
