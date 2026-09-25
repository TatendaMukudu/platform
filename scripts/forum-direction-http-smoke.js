/* Truth layer — THE ARROW POINTS ONE WAY, AND AGREEING IN PUBLIC IS NOT CORROBORATION.

   Forum is the group thinking out loud about something they are trying to understand. It is not a
   feed, and it is not a second evidence store. Two laws make that true, and they fail in opposite
   directions.

   THE DIRECTION LAW. A person's PRIVATE conversation may reason over Forum content they are
   authorised to read — that is the point of a group thread, and a coach asking "what does the
   squad think about this" should get an answer. The reverse must never happen: the Forum must not
   gain access to a private conversation merely because the private composer can see the Forum.
   One arrow. If it ever points both ways, every private thing anybody typed becomes group
   material by a route nobody chose.

   THE ORIGIN LAW. Five messages from one person are one origin. A restatement of somebody else's
   account carries THAT account's origin, marked `reported`, so a room agreeing with itself cannot
   manufacture independence. Speech is not evidence until its AUTHOR deliberately offers it, and
   nobody may offer anybody else's words.

   Both are already implemented — `_forumContext` reads one way and `forum.originForMessage`
   decides the origin. This suite is not a repair. It is the assertion that neither can be
   loosened without something going red, because both are the kind of law whose breach is
   invisible: nothing errors, the number just reads higher, or a sentence appears somewhere its
   author never sent it.

   Run: node scripts/forum-direction-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken,
        groupCandidates, _noteGroupCandidates } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'fdir';
const SQUAD = Array.from({ length: 14 }, (_, i) => 'p' + (i + 1));
const users = {
  coach: { id: 'coach', name: 'Coach', email: 'c@fdir.io', role: 'coach', orgCode: C,
    status: 'active', leadershipNodeIds: ['first'], assignedNodeIds: ['first'] },
  outsider: { id: 'outsider', name: 'Reserves Coach', email: 'o@fdir.io', role: 'coach', orgCode: C,
    status: 'active', leadershipNodeIds: ['res'], assignedNodeIds: ['res'] },
};
for (const id of SQUAD) users[id] = { id, name: id.toUpperCase(), email: `${id}@fdir.io`,
  role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['first'] };

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: users },
  orgNodes: { [C]: {
    first: { nodeId: 'first', name: 'First Team', parentId: null, childNodeIds: [],
      memberIds: [...SQUAD, 'coach'], leaderIds: ['coach'] },
    res: { nodeId: 'res', name: 'Reserves', parentId: null, childNodeIds: [],
      memberIds: ['outsider'], leaderIds: ['outsider'] },
  } },
});
_rebuildEmailIndex();

for (const id of SQUAD.slice(0, 5)) {
  _noteGroupCandidates(C, id, `member:${id}`, [{ id: 'fd_' + id, level: 'observation',
    text: 'talking drops off after we lose',
    sourceSpan: 'nobody on our team talks after a loss',
    concerns: 'group', originRef: 'of_' + id, originKind: 'direct_observation', turnId: 'tf_' + id }],
    'communication', 'Communication after results');
}

const PRIVATE_SECRET = 'my father has been unwell since the spring and it is on my mind every match';

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = who => ({ Authorization: `Bearer ${issueToken(who, C,
    (users[who] || {}).role === 'coach' ? 'coach' : 'member')}`, 'Content-Type': 'application/json' });
  const call = (m, u, b, who) => fetch(base + u, { method: m, headers: H(who),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const theInquiry = async who => (((await call('GET', '/api/group/first/inquiry', undefined, who)).j || {})
    .inquiries || []).find(i => ((i.topic || {}).canonicalConcept) === 'communication') || {};
  const say = (text, who) => call('POST', '/api/assistant/turn', { text }, who)
    .then(r => String((((r.j || {}).response) || {}).responseText || ''));

  try {
    /* ══ A — A QUESTION THE GROUP IS TRYING TO UNDERSTAND ══════════════════════════════════ */
    console.log('\n  A — THE SQUAD HAS A QUESTION, AND A ROOM AROUND IT');
    for (const id of SQUAD.slice(0, 5)) {
      const c = (groupCandidates[C] || []).find(x => x.contributorId === id && x.status === 'detected');
      if (c) await call('POST', '/api/group/first/contribute', { candidateId: c.candidateId, valence: 'worth_attention' }, id);
    }
    const inq = await theInquiry('coach');
    ok('FD-A1 the question is open on five independent origins',
      !!inq.inquiryId && inq.independentOrigins === 5);
    const post = (text, who) => call('POST', `/api/group/first/forum/${inq.inquiryId}`, { text }, who);
    const p1 = await post('Nobody wants to be the one who speaks first after a bad result', 'p1');
    ok('FD-A2 a member of the group can post into the room', p1.status === 200);
    const pOut = await post('I think it is fitness', 'outsider');
    ok('FD-A3 …and somebody who is not in this group cannot',
      pOut.status === 403 || pOut.status === 404);

    /* ══ B — THE ARROW: PRIVATE MAY READ THE ROOM ══════════════════════════════════════════ */
    console.log('\n  B — A COACH\'S PRIVATE CONVERSATION MAY REASON OVER THE ROOM');
    const ctx = S._forumContext(C, 'coach', `inquiry:${inq.inquiryId}`);
    ok('FD-B1 the room reaches the coach\'s private composer context',
      !!ctx && (ctx.messages || []).length >= 1
      && ctx.messages.some(m => /speaks first after a bad result/i.test(m.text)));
    /* AND IT CARRIES NO AUTHOR. What the group is saying may inform reasoning; WHO said each
       thing is not something the composer needs and is the cheapest way to turn a discussion
       into a file on somebody. */
    ok('FD-B2 …carrying what was said and not who said it',
      !!ctx && ctx.messages.every(m => !m.author && !m.authorId && !/p1/.test(JSON.stringify(m))));
    ok('FD-B3 …and scoped to the one object the room is about',
      !!ctx && ctx.sameObject === `inquiry:${inq.inquiryId}`);
    /* B4 IS OVER-DETERMINED AND THAT IS SAID OUT LOUD. `_forumContext` refuses an outsider twice:
       first because `_allObjectsFor` does not contain the object for them, and again because the
       room-membership re-check fails. Mutation confirmed it — removing the membership re-check
       changes nothing here, because the object gate has already answered. That is PROTOCOL lie #3,
       masked by an outer gate, and "this mutation proved B4" would be false.

       What IS true: two independent gates hold it, and the object gate is the load-bearing one
       (removing it takes out B1/B2/B3 rather than B4, because the outsider still has no room to
       read while the coach's own read breaks). For a privacy rule that shape is what you want. */
    const outCtx = S._forumContext(C, 'outsider', `inquiry:${inq.inquiryId}`);
    ok('FD-B4 …and a leader of another squad gets no room at all',
      outCtx === null);

    /* ══ C — AND IT DOES NOT POINT BACK ════════════════════════════════════════════════════
       THE ATTACK. The coach says something private, in their own thread, about the same object
       the room is about. Nothing they typed may appear in the room. */
    console.log('\n  C — AND NOTHING THE COACH TYPED PRIVATELY REACHES THE ROOM');
    await say(PRIVATE_SECRET, 'coach');
    await say('I think the senior players are the problem here, between us', 'coach');
    const roomAfter = await call('GET', `/api/group/first/forum/${inq.inquiryId}`, undefined, 'p2');
    const roomText = JSON.stringify(roomAfter.j || {});
    ok('FD-C1 the room does not carry the coach\'s private sentence',
      !new RegExp(PRIVATE_SECRET.slice(0, 30), 'i').test(roomText));
    ok('FD-C2 …nor the private opinion they expressed about the squad',
      !/senior players are the problem/i.test(roomText));
    /* AND THE ROOM DID NOT GROW. A private turn that quietly appended would show up as a
       message count, which is the version of this leak nobody would read closely enough to see. */
    ok('FD-C3 …and the room still holds only what was actually posted to it',
      ((roomAfter.j || {}).messages || []).length === 1);

    /* ══ D — SPEECH IS NOT EVIDENCE ════════════════════════════════════════════════════════ */
    console.log('\n  D — AND TALKING IN THE ROOM CHANGES NOTHING IT IS ABOUT');
    const beforeTalk = await theInquiry('coach');
    for (const t of ['I agree with that', 'Same, it is the fear of saying the wrong thing',
                     'Definitely what I have seen too']) await post(t, 'p3');
    const afterTalk = await theInquiry('coach');
    ok('FD-D1 three more messages did not raise what the question rests on',
      afterTalk.independentOrigins === beforeTalk.independentOrigins);
    ok('FD-D2 …nor its band, nor its score',
      (afterTalk.confidence || {}).band === (beforeTalk.confidence || {}).band
      && (afterTalk.confidence || {}).score === (beforeTalk.confidence || {}).score);
    ok('FD-D3 …and no message became a candidate explanation by being said',
      afterTalk.hypothesis === beforeTalk.hypothesis
      && (afterTalk.alternatives || []).length === (beforeTalk.alternatives || []).length);

    /* ══ E — AND NOBODY MAY OFFER SOMEBODY ELSE'S WORDS ════════════════════════════════════ */
    console.log('\n  E — ONLY THE AUTHOR MAY OFFER THEIR OWN ACCOUNT AS EVIDENCE');
    const room = await call('GET', `/api/group/first/forum/${inq.inquiryId}`, undefined, 'coach');
    const msg = ((room.j || {}).messages || [])[0];
    ok('FD-E1 there is a message to try this on', !!msg && !!msg.messageId);
    const byCoach = await call('POST',
      `/api/group/first/forum/${inq.inquiryId}/${msg.messageId}/contribute`, {}, 'coach');
    ok('FD-E2 a leader cannot contribute a member\'s message on their behalf',
      byCoach.status === 403);
    const byAuthor = await call('POST',
      `/api/group/first/forum/${inq.inquiryId}/${msg.messageId}/contribute`, {}, 'p1');
    ok('FD-E3 …while its own author can, which is the deliberate act the boundary is for',
      byAuthor.status === 200);
    /* NOT A STATUS CODE. The first version of this expected 400 or 409 and the route answers 403
       through `mayContributeMessage` ("already contributed"), which is a perfectly good answer —
       so the assertion was testing my guess about a number rather than the law. What matters is
       that offering the same message twice is REFUSED and, more to the point, that it does not
       become two accounts. The second half is the one worth having: a duplicate that were merely
       refused-with-the-wrong-code costs nothing, and a duplicate that counted would be a second
       origin nobody can see. */
    const originsBeforeDup = (await theInquiry('coach')).independentOrigins;
    const again = await call('POST',
      `/api/group/first/forum/${inq.inquiryId}/${msg.messageId}/contribute`, {}, 'p1');
    ok('FD-E4 …and cannot do it twice: the second offer is refused',
      again.status >= 400 && again.status < 500);
    ok('FD-E4b …and, whatever the refusal says, it did not become a second account',
      (await theInquiry('coach')).independentOrigins === originsBeforeDup);

    /* ══ F — AND AN ECHO IS NOT A SECOND WITNESS ═══════════════════════════════════════════
       The origin law at its own owner, because the route to declare an echo is the author's and
       the guarantee is the kernel's: a declared echo can never add an origin. */
    console.log('\n  F — AGREEING WITH SOMEBODY IS NOT SEEING IT YOURSELF');
    const forum = require('../ai/forum.js');
    const original = { messageId: 'm1', authorId: 'p1', contributedOrigin: 'forum_m1' };
    const echo = { messageId: 'm2', authorId: 'p4' };
    const own = forum.originForMessage(echo);
    const rel = forum.originForMessage(echo, { echoesMessage: original });
    ok('FD-F1 an account of your own is a new origin, direct',
      own.originRef === 'forum_m2' && own.originKind === 'direct_observation');
    ok('FD-F2 …while a declared echo carries the ORIGINAL\'s origin, not a new one',
      rel.originRef === 'forum_m1');
    ok('FD-F3 …and is marked as reported and inferred, so it cannot read as a second sighting',
      rel.originKind === 'reported' && rel.directness === 'inferred');

  } catch (e) { fail++; console.error('  FAIL forum-direction suite threw:', e && e.stack); }

  server.close();
  console.log(`\nforum-direction-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
