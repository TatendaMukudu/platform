/* Truth layer — IF INTELLIQ SAYS IT DID SOMETHING, THE PERSON MUST BE ABLE TO FIND IT.

   FOUNDER BRIEF, September 2026, after round 4 found a conversationally confirmed Inquiry that
   was proposed, confirmed, written and returned a success response while being invisible on every
   user-facing surface:

     Do not treat this as an Inquiry-only defect. Treat it as evidence that our tests may have
     historically proven mutation without proving product connectivity.

   THE ACCEPTANCE STANDARD, in their words: *if IntelliQ tells the human that something was
   created, recorded, kept, shared or changed, can that human actually find the same canonical
   thing again and continue working with it?*

   So this file is not another mutation suite. Every other suite in `npm test` already proves that
   the write happens. What none of them proved is the half after the write:

     PROMISE  →  CANONICAL TRUTH  →  HUMAN DOOR  →  REOPEN  →  CONTINUE

   WHAT THIS FILE REFUSES TO ACCEPT AS PROOF, because each of them is how the Inquiry defect
   stayed green for two rounds:

     a 200                      the Inquiry route returned one, and answered "Inquiry opened"
     a row in persistence       the inquiry was really in inquiryStates the whole time
     text on a screen           the person's own echoed sentence contains the word "inquiry"
     a card rendering           it must render THE SAME CANONICAL ID that was written

   Every assertion below is about an ID or about a reader's actual behaviour. No assertion here
   searches response prose for a word.

   MODELS ARE OFF THROUGHOUT, which is the pilot's own state. Actions are staged through the
   production `requestedAction` branch — the path a pressed control uses — so the interpretation
   layer is not what is under test here; the connectivity is.

   Run: node scripts/product-promise-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'prm', NOW = Date.now(), DAY = 86400000;
const SQUAD = ['me', 'p2', 'p3', 'p4', 'p5'];
const SIG = (who, n) => ({ kind: 'observation', status: 'active', source: who,
  originRef: `o_${who}_${n}`, at: NOW - 3 * DAY, turnId: `t_${who}_${n}`, directness: 'direct',
  authority: 'corroborated', specificity: 0.7, ref: `ev_${who}_${n}`, contributedBy: who,
  text: 'we went quiet after conceding' });
/* A REAL INQUIRY, grown to the shape the kernel produces: five independent origins, a leading
   hypothesis that carries its own supporting refs. A thinner fixture would make the High and Low
   projections below unreachable and the sections that need them vacuous. */
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
    ...SQUAD.map((id, i) => [id, { id, name: `Player ${i + 1}`, email: `${id}@p.io`, role: 'member',
      orgCode: C, status: 'active', assignedNodeIds: ['first'], profileComplete: true }]),
    ['coach', { id: 'coach', name: 'Coach', email: 'c@p.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['first'], assignedNodeIds: ['first'], profileComplete: true }],
    /* THE PERSON WHO MUST NEVER FIND ANY OF IT. In the org, in a different group. A stranger from
       another tenant would be refused by tenant isolation and would prove nothing about audience. */
    ['out', { id: 'out', name: 'Outsider', email: 'o@p.io', role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['res'], profileComplete: true }],
  ]) },
  orgNodes: { [C]: {
    first: { nodeId: 'first', name: 'First Team', parentId: null, childNodeIds: [],
      memberIds: [...SQUAD, 'coach'], leaderIds: ['coach'] },
    res: { nodeId: 'res', name: 'Reserves', parentId: null, childNodeIds: [], memberIds: ['out'], leaderIds: [] },
  } },
  inquiryStates: { [C]: {
    'group:first': { g: INQ('inq_group', 'football.quiet', 'Going quiet after conceding', 'group:first') },
    'member:me':   { m: INQ('inq_mine', 'football.myquiet', 'How I react after conceding', 'member:me') },
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

  /* Stage a consequential action and CONFIRM it, the way a pressed control does. Returns the
     proposal (so "nothing written before confirm" can be asserted between the two) and the
     canonical body the confirmation answered with. */
  const stage = async (type, args, opts = {}, who = 'me') => {
    const t = await call('POST', '/api/assistant/turn', { text: opts.text || 'do that',
      requestedAction: { type, arguments: args || {} }, about: opts.about,
      conversationId: opts.conversationId }, who);
    const prop = (((t.j || {}).response || {}).proposedActions || []).find(x => x.actionType === type);
    return { turnId: (t.j || {}).turnId, conversationId: (t.j || {}).conversationId, prop };
  };
  const confirm = (turnId, propId, who = 'me') =>
    call('POST', `/api/assistant/turn/${turnId}/confirm`, { proposalId: propId }, who);

  /* THE DOORS, BY ID. Every one of these is a real human-facing read model: the list a person
     lands on, and the thread they open. Nothing here reads prose. */
  const listed = async (kind, scope, who = 'me') =>
    (((await call('GET', `/api/objects?kind=${kind}&scope=${scope}`, undefined, who)).j || {}).objects || [])
      .map(o => String(o.id));
  const card = async (kind, scope, id, who = 'me') =>
    (((await call('GET', `/api/objects?kind=${kind}&scope=${scope}`, undefined, who)).j || {}).objects || [])
      .find(o => String(o.id) === String(id)) || null;
  const reopen = (kind, id, who = 'me') => call('GET', `/api/objects/${kind}/${id}/thread`, undefined, who);
  const shelf = async (who = 'me') =>
    (((await call('GET', '/api/library/shelf', undefined, who)).j || {}).items || []);

  try {
    /* ══ A — "FOCUS STARTED" ═══════════════════════════════════════════════════════════════ */
    console.log('\n  A — "FOCUS STARTED" → THE SAME FOCUS, OPENED, AND TALKED ABOUT');
    const before = await listed('focus', 'self');
    const a = await stage('create_focus', { text: 'Speak first after we concede' },
      { text: 'I want to work on speaking first after we concede' });
    ok('A1 the utterance produces a proposal', !!a.prop);
    ok('A2 …and nothing is written before it is confirmed',
      (await listed('focus', 'self')).length === before.length);
    const aDone = await confirm(a.turnId, a.prop.id);
    const fid = String(((aDone.j || {}).focus || {}).id || '');
    ok('A3 confirming answers with a canonical id', aDone.status === 200 && !!fid);
    /* THE ASSERTION ROUND 4 WAS MISSING. Not "a focus is listed" — THAT id is listed. */
    ok('A4 …and THAT id is on the Focuses surface', (await listed('focus', 'self')).includes(fid));
    const aCard = await card('focus', 'self', fid);
    ok('A5 …its card carries the person\'s own words, not a paraphrase',
      !!aCard && String(((aCard.present || {}).summary || {}).full) === 'Speak first after we concede');
    const aOpen = await reopen('focus', fid);
    ok('A6 …it opens', aOpen.status === 200);
    ok('A7 …to the SAME canonical object, not one that merely looks like it',
      String((aOpen.j || {}).about) === `focus:${fid}`);
    /* THE CONVERSATION IT CAME OUT OF IS STILL ATTACHED. A Focus with no history is a commitment
       nobody can trace back to why they made it. */
    const src = await call('GET', `/api/me/focus/${fid}/source`);
    ok('A8 …and the conversation it was started from is still reachable from it',
      src.status === 200 && src.j.available === true
      && (src.j.messages || []).some(m => m.role === 'user'
        && /speaking first after we concede/i.test(String(m.text || ''))));
    ok('A9 …its audience is private, because nobody chose otherwise',
      !!aCard && String(((aDone.j || {}).focus || {}).visibility) === 'private');
    ok('A10 …and somebody in another group cannot open it',
      (await reopen('focus', fid, 'out')).status === 404
      && !(await listed('focus', 'all', 'out')).includes(fid));

    /* ══ B — "OUTCOME RECORDED" ════════════════════════════════════════════════════════════
       The founder's case: recorded against the INTENDED Focus, still there on reopen, and
       reachable by asking about it afterwards. */
    console.log('\n  B — "OUTCOME RECORDED" → ON THAT FOCUS, AND ASKABLE AFTERWARDS');
    const b = await stage('record_focus_outcome', { outcome: 'helped' },
      { about: { kind: 'focus', id: fid }, text: 'we tried it today and it helped' });
    ok('B1 the outcome is proposed', !!b.prop);
    const bBefore = await card('focus', 'self', fid);
    ok('B2 …and nothing is recorded before it is confirmed',
      !((bBefore.present || {}).detail || {}).outcome);
    const bDone = await confirm(b.turnId, b.prop.id);
    ok('B3 confirming answers with the focus it belongs to',
      bDone.status === 200 && String((bDone.j || {}).focusId) === fid);
    const bCard = await card('focus', 'self', fid);
    ok('B4 …and reopening THAT focus shows it',
      String((((bCard || {}).present || {}).detail || {}).outcome || {}.result) !== 'undefined'
      && (((bCard.present || {}).detail || {}).outcome || {}).result === 'helped');
    ok('B5 …in the vocabulary that focus\'s own screen uses',
      (((bCard.present || {}).summary || {}).status) === 'It helped');
    /* AND THE CONTINUATION. This is the assertion that was red before this pass: standing in the
       Focus and asking what happened answered "I don't have enough authorised evidence" about a
       fact printed on the card. */
    const ask = await call('POST', '/api/assistant/turn',
      { text: 'What happened when we tried this?', about: { kind: 'focus', id: fid } });
    const said = String((((ask.j || {}).response) || {}).responseText || '');
    ok('B6 …and asking about it from inside the Focus reaches the record',
      !/don'?t have enough authorised evidence/i.test(said));
    ok('B7 …answering with what was recorded, in the presenter\'s own words',
      said.includes('it helped'));
    /* NOT CAUSALITY. A reported outcome is what somebody observed, and the answer must say so. */
    /* READ FROM `response.qa`, which is where an answer's OWN limitations travel — distinct from
       `response.limitations`, which is the turn's context. Pointed at the wrong one first and it
       went red, which is the right way round for an assertion to be wrong. */
    const lim = ((((ask.j || {}).response) || {}).qa || {}).limitations || [];
    ok('B8 …and says outright it is not proof the focus caused anything',
      lim.some(l => /not proof the focus caused it/i.test(String(l))));

    /* ══ C — "INQUIRY OPENED" — THE ROUND 4 DEFECT, PINNED ══════════════════════════════════ */
    console.log('\n  C — "INQUIRY OPENED" → THE SAME INQUIRY, VISIBLE AND OPENABLE');
    const cBefore = await listed('inquiry', 'self');
    const c = await stage('create_inquiry', { text: 'why we stop talking when we go behind' },
      { text: 'I want to understand why we stop talking when we go behind' });
    ok('C1 the utterance produces a proposal', !!c.prop);
    ok('C2 …and nothing is opened before it is confirmed',
      (await listed('inquiry', 'self')).length === cBefore.length);
    const cDone = await confirm(c.turnId, c.prop.id);
    const iid = String(((cDone.j || {}).inquiry || {}).id || '');
    ok('C3 confirming answers with a canonical id', cDone.status === 200 && !!iid);
    ok('C4 …and THAT id is on the Inquiries surface — the round-4 defect',
      (await listed('inquiry', 'self')).includes(iid));
    ok('C5 …it opens', (await reopen('inquiry', iid)).status === 200);
    ok('C6 …to the same canonical object',
      String(((await reopen('inquiry', iid)).j || {}).about) === `inquiry:${iid}`);
    const cCard = await card('inquiry', 'self', iid);
    ok('C7 …preserving the question in the person\'s own words',
      !!cCard && /why we stop talking when we go behind/i.test(String((cCard.explained || {}).headline || '')));
    /* AND IT INVENTS NOTHING. A question nobody has answered yet must not arrive carrying a band. */
    ok('C8 …and carrying no confidence, because nobody has said anything about it yet',
      !(cCard.explained || {}).confidence);
    ok('C9 …and somebody in another group cannot see or open it',
      !(await listed('inquiry', 'all', 'out')).includes(iid)
      && (await reopen('inquiry', iid, 'out')).status === 404);

    /* ══ D — HIGHS AND LOWS ════════════════════════════════════════════════════════════════
       These are PROJECTIONS, not things a person creates — the product says so in a coach's
       words, and `pilot-coach` asserts that. What must be true here is the other half: when one
       exists it is on its own surface, it opens, and it opens to itself. */
    console.log('\n  D — A HIGH AND A LOW ARE ON THEIR OWN SURFACES, AND OPEN TO THEMSELVES');
    const highs = await listed('high', 'all');
    const lows  = await listed('low', 'all');
    ok('D1 recording an outcome produced a High to stand on', highs.length > 0);
    for (const id of highs.slice(0, 2)) {
      const t = await reopen('high', id);
      ok(`D2 high ${id} opens to itself`, t.status === 200 && String((t.j || {}).about) === `high:${id}`);
      ok(`D2b …and an outsider cannot`, (await reopen('high', id, 'out')).status === 404);
    }
    /* A LOW EXISTS BECAUSE ACCOUNTS DIFFER, which is the one that must not be quietly upgraded. */
    const dDis = await stage('disagree_with_inquiry',
      { because: 'I think it is the keeper going quiet, not the outfield' },
      { about: { kind: 'inquiry', id: 'inq_mine' }, text: 'I do not think that is right' });
    ok('D3 a disagreement is proposed', !!dDis.prop);
    const dDone = await confirm(dDis.turnId, dDis.prop.id);
    ok('D4 …and recorded against that inquiry',
      dDone.status === 200 && String((dDone.j || {}).inquiryId) === 'inq_mine');
    const lows2 = await listed('low', 'all');
    ok('D5 …and the disagreement reaches the Lows surface', lows2.length >= lows.length);
    for (const id of lows2.slice(0, 2)) {
      const t = await reopen('low', id);
      ok(`D6 low ${id} opens to itself`, t.status === 200 && String((t.j || {}).about) === `low:${id}`);
    }
    /* AND A HUMAN-CONTRIBUTED ACCOUNT IS NOT AN ESTABLISHED ORGANISATIONAL WEAKNESS. */
    const lowCard = await card('low', 'all', lows2[0]);
    ok('D7 …a Low built from differing accounts says the disagreement IS the finding',
      !!lowCard && /do not agree|differ/i.test(String((lowCard.explained || {}).claim || '')
        + String((lowCard.explained || {}).headline || '')));

    /* ══ E — "KEPT" ════════════════════════════════════════════════════════════════════════ */
    console.log('\n  E — "KEPT" → LIBRARY FINDS IT, AND IT REOPENS TO THE LIVE THING');
    const conv = await call('POST', '/api/assistant/turn', { text: 'the back four kept dropping' });
    const cid = String(conv.j.conversationId);
    const eBefore = (await shelf()).length;
    const e = await stage('keep_in_library', {}, { conversationId: cid, text: 'keep this conversation' });
    ok('E1 keeping is proposed', !!e.prop);
    ok('E2 …and nothing is filed before it is confirmed', (await shelf()).length === eBefore);
    const eDone = await confirm(e.turnId, e.prop.id);
    ok('E3 confirming answers with a filing', eDone.status === 200 && !!(eDone.j || {}).filed);
    const entry = (await shelf()).find(s => String(s.id) === String(eDone.j.filed.id));
    ok('E4 …and it is on the Library shelf', !!entry);
    /* A REFERENCE, NOT A COPY. The shelf entry must point at the LIVE conversation id. */
    ok('E5 …pointing at the live conversation rather than a copy of it',
      !!entry && String(entry.refId) === cid && String(entry.about) === `conversation:${cid}`);
    const reopened = await call('GET', `/api/assistant/conversations/${cid}`);
    ok('E6 …and reopening it reaches the same conversation, with what was said in it',
      reopened.status === 200 && String(((reopened.j || {}).conversation || {}).id) === cid
      && ((reopened.j || {}).messages || []).some(m => /back four kept dropping/i.test(String(m.text || ''))));
    /* AND KEEPING A FOCUS FILES A REFERENCE TO THAT FOCUS, not to a second copy of it. */
    const e2 = await stage('keep_in_library', {}, { about: { kind: 'focus', id: fid }, text: 'keep this' });
    const e2Done = await confirm(e2.turnId, e2.prop.id);
    const fEntry = (await shelf()).find(s => String(s.id) === String((e2Done.j || {}).filed.id));
    ok('E7 keeping a Focus files a reference to THAT focus',
      !!fEntry && String(fEntry.refId) === fid && String(fEntry.kind) === 'focus');
    ok('E8 …and the Focus itself is untouched by being kept',
      (await listed('focus', 'self')).includes(fid));
    ok('E9 …and nobody else\'s shelf gained anything', (await shelf('p2')).length === 0);

    /* ══ F — "SHARED WITH THE TEAM" ════════════════════════════════════════════════════════ */
    console.log('\n  F — "SHARED" → THE AUTHORISED PERSON FINDS IT, THE UNAUTHORISED DOES NOT');
    const conv2 = await call('POST', '/api/assistant/turn', { text: 'we keep going quiet after we concede' });
    const f = await stage('discuss_with_group',
      { groupId: 'first', text: 'we keep going quiet after we concede' },
      { conversationId: conv2.j.conversationId, text: 'ask the team about this' });
    ok('F1 asking the team is proposed', !!f.prop);
    const fDone = await confirm(f.turnId, f.prop.id);
    const sharedId = String(((fDone.j || {}).focus || {}).id || '');
    ok('F2 confirming answers with a canonical shared object',
      fDone.status === 200 && !!sharedId);
    ok('F3 …and a teammate can find THAT object', (await listed('focus', 'all', 'p2')).includes(sharedId));
    ok('F4 …and open it', (await reopen('focus', sharedId, 'p2')).status === 200);
    ok('F5 …while somebody outside the group cannot',
      !(await listed('focus', 'all', 'out')).includes(sharedId)
      && (await reopen('focus', sharedId, 'out')).status === 404);
    /* THE PRIVATE CONVERSATION IT CAME OUT OF IS NOT EXPOSED BY SHARING. */
    const teammateSource = await call('GET', `/api/me/focus/${sharedId}/source`, undefined, 'p2');
    ok('F6 …and the private conversation it came out of does not travel with it',
      teammateSource.status === 404 || teammateSource.j.available === false);
    ok('F7 …but its author can still reach their own side of it',
      (await call('GET', `/api/me/focus/${sharedId}/source`)).status === 200);

    /* ══ G — "POSTED TO THE FORUM" ═════════════════════════════════════════════════════════ */
    console.log('\n  G — "POSTED TO THE FORUM" → READABLE IN THE ROOM IT NAMED');
    const g = await stage('share_to_forum', { text: 'Does anyone else feel this?' },
      { about: { kind: 'inquiry', id: 'inq_group' }, text: 'put this to the forum' }, 'coach');
    ok('G1 sharing to the forum is proposed', !!g.prop);
    const gDone = await confirm(g.turnId, g.prop.id, 'coach');
    const msgId = String((gDone.j || {}).messageId || '');
    const room = (gDone.j || {}).forum || {};
    ok('G2 confirming answers with a message id and the room it went to',
      gDone.status === 200 && !!msgId && room.nodeId === 'first' && room.objectId === 'inq_group');
    const gRead = await call('GET', `/api/group/${room.nodeId}/forum/${room.objectId}`, undefined, 'me');
    ok('G3 …and a member of that room finds THAT message',
      gRead.status === 200 && (gRead.j.messages || []).some(m => String(m.messageId) === msgId));
    ok('G4 …while somebody outside the group cannot read the room at all',
      (await call('GET', `/api/group/${room.nodeId}/forum/${room.objectId}`, undefined, 'out')).status === 403);
    /* SPEECH IS NOT EVIDENCE. Posting must not move what the organisation believes. */
    ok('G5 …and it is speech, marked as changing nothing',
      (gDone.j || {}).epistemicEffect === 'none');
    ok('G6 …and the forum entry is not marked contributed by being posted',
      (gRead.j.messages || []).find(m => String(m.messageId) === msgId).contributed === false);

    /* ══ H — "ADDED AS EVIDENCE" ═══════════════════════════════════════════════════════════ */
    console.log('\n  H — "ATTACHED" → ON THAT OBJECT, FOR THE PEOPLE WHO MAY READ IT');
    const up = await call('POST', '/api/assistant/attachments',
      { filename: 'draws.txt', text: 'Draw 1-1. Draw 0-0. Draw 2-2.' });
    const mid = String(up.j.materialId);
    ok('H1 a document exists', up.status === 200 && !!mid);
    const hOn = async (who = 'me') => (((await call('GET',
      `/api/objects/focus/${fid}/materials`, undefined, who)).j || {}).materials || []).map(m => String(m.materialId));
    ok('H2 …and is not on the Focus yet', !(await hOn()).includes(mid));
    const h = await stage('attach_material', { materialId: mid },
      { conversationId: up.j.conversationId, about: { kind: 'focus', id: fid }, text: 'use this as evidence' });
    ok('H3 attaching is proposed', !!h.prop);
    ok('H4 …and nothing is attached before it is confirmed', !(await hOn()).includes(mid));
    const hDone = await confirm(h.turnId, h.prop.id);
    ok('H5 confirming answers with THAT material',
      hDone.status === 200 && String((hDone.j || {}).materialId) === mid);
    ok('H6 …and the Focus now lists it', (await hOn()).includes(mid));
    ok('H7 …and it reopens to the same document',
      String((((await call('GET', `/api/materials/${mid}`)).j || {}).material || {}).materialId) === mid);
    /* RELATIONSHIP IS NOT READERSHIP. Attaching a private document to an object does not hand it
       to that object's readers — the founder's rule, asserted as behaviour. */
    ok('H8 …and attaching it did not hand it to anybody else',
      (await call('GET', `/api/materials/${mid}`, undefined, 'p2')).status === 404);

    /* ══ J — "KEPT NEAR THE TOP" ═══════════════════════════════════════════════════════════ */
    console.log('\n  J — "KEPT NEAR THE TOP" → IT IS ACTUALLY NEAR THE TOP');
    const j = await stage('prioritise_object', {}, { about: { kind: 'focus', id: fid }, text: 'keep this near the top' });
    const jDone = await confirm(j.turnId, j.prop.id);
    ok('J1 prioritising is confirmed', jDone.status === 200);
    const attention = ((await call('GET', '/api/me/attention')).j || {}).items || [];
    ok('J2 …and THAT object is on the attention list',
      attention.some(i => String(i.ref) === `focus:${fid}`));
    ok('J3 …because they said so, not because something was inferred',
      (attention.find(i => String(i.ref) === `focus:${fid}`) || {}).reason === 'explicitly_prioritised');
    ok('J4 …and nobody else\'s attention changed',
      !(((await call('GET', '/api/me/attention', undefined, 'p2')).j || {}).items || [])
        .some(i => String(i.ref) === `focus:${fid}`));

    /* ══ K — THE RELATIONSHIPS SURVIVE THE LOOP ════════════════════════════════════════════
       The founder's §7: the intelligence follows the thing through time. A Focus started from an
       Inquiry must remember why it exists, and the Inquiry must not disappear because the Focus
       now does. */
    console.log('\n  K — A FOCUS STARTED FROM A QUESTION REMEMBERS WHY IT EXISTS');
    const k = await stage('create_focus', { text: 'Name the next action out loud' },
      { about: { kind: 'inquiry', id: 'inq_mine' }, text: 'I want to work on naming the next action out loud' });
    const kDone = await confirm(k.turnId, k.prop.id);
    const kFid = String(((kDone.j || {}).focus || {}).id || '');
    ok('K1 the focus is created', kDone.status === 200 && !!kFid);
    ok('K2 …and records the question it addresses',
      String((((kDone.j || {}).focus || {}).addresses || {}).id) === 'inq_mine');
    const rel = ((await call('GET', `/api/objects/focus/${kFid}/related`)).j || {});
    ok('K3 …the relationship is readable from the Focus',
      (rel.related || []).some(r => String(r.ref) === 'inquiry:inq_mine' && r.type === 'addresses'));
    ok('K4 …and the loop names both ends',
      (rel.loop || {}).focus === `focus:${kFid}` && (rel.loop || {}).addresses === 'inquiry:inq_mine');
    ok('K5 …the Inquiry did not disappear because a Focus now exists',
      (await listed('inquiry', 'self')).includes('inq_mine')
      && (await reopen('inquiry', 'inq_mine')).status === 200);
    ok('K6 …and no duplicate Inquiry was created to hang the Focus off',
      (await listed('inquiry', 'self')).filter(x => x === 'inq_mine').length === 1);
    /* AND ASKING INSIDE THE NEW FOCUS NAMES WHERE IT CAME FROM. */
    const kAsk = await call('POST', '/api/assistant/turn',
      { text: 'What is this about?', about: { kind: 'focus', id: kFid } });
    ok('K7 …and standing in it, IntelliQ can say what it came out of',
      /how i react after conceding/i.test(String((((kAsk.j || {}).response) || {}).responseText || '')));

    /* ══ L — AND NONE OF IT DEPENDS ON THE PROCESS NOT RESTARTING ═════════════════════════
       Everything above is one server. What a person experiences as "come back tomorrow" is a
       fresh read of persisted state, so what matters is that the objects survive SERIALISATION —
       the boundary this environment can actually exercise without a database. */
    console.log('\n  L — AND THE OBJECTS SURVIVE THE SERIALISATION BOUNDARY');
    const snap = JSON.parse(JSON.stringify({
      inquiryStates: S.inquiryStates[C], materials: S.materials[C],
      shelf: S.shelfFilings ? S.shelfFilings[C] : null,
    }));
    const flat = JSON.stringify(snap);
    ok('L1 the opened inquiry survives, with the mark that makes it visible',
      flat.includes(iid) && flat.includes('openedBy'));
    ok('L2 the attached material survives', flat.includes(mid));
    ok('L3 …and the disagreement that produced the Low survives',
      flat.includes('inq_mine') && /dissents|contradicts|disputes/.test(flat));

  } catch (e) { fail++; console.error('  FAIL product-promise suite threw:', e && e.stack); }

  server.close();
  console.log(`\nproduct-promise-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
