/* Truth layer — TALKING TO INTELLIQ IS NOT CONTRIBUTING TO THE ORGANISATION.

   The generic Composer used to carry a "Private | Public" pill. It set `_wsShare`, which reached
   nothing — not the request body, not any other reader. A control that appears to choose who can
   see what you say, and does not, is the worst shape a privacy defect can take: somebody trusts it
   and says something they would not otherwise have said.

   The founder's correction is a product law rather than a wiring fix, and the law is why it was
   REMOVED instead of wired up:

     · This composer is the person's own conversation with IntelliQ — asking, exploring, attaching
       a photo, thinking aloud. That is private, always, with no mode to get wrong.
     · Contributing something to other people is a separate deliberate act that names its audience,
       shows the exact words, and is confirmed.

   A global public MODE is the dangerous form even when it is wired correctly, because somebody who
   shares one sentence has silently changed the audience of every sentence after it, and the moment
   they forget is the moment it matters. This suite asserts that no such mode exists and that none
   can be reintroduced from the client.

   The ten sections answer the ten things the founder asked to be proved. Section F is the one that
   stops this file being a celebration of a deletion: the governed sharing path must STILL WORK, or
   the correction has removed the ability to contribute rather than the lie about it.

   Run: node scripts/composer-privacy-law-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';        // provider-down, which is the pilot's real state

const fs   = require('fs');
const path = require('path');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken,
        groupCandidates, _noteGroupCandidates } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const APP_JS = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

const C = 'cpl';
const SQUAD = Array.from({ length: 14 }, (_, i) => 'p' + (i + 1));
const users = {
  coach: { id: 'coach', name: 'Coach', email: 'c@cpl.io', role: 'coach', orgCode: C,
    status: 'active', leadershipNodeIds: ['first'], assignedNodeIds: ['first'] },
  outsider: { id: 'outsider', name: 'Reserves Coach', email: 'o@cpl.io', role: 'coach', orgCode: C,
    status: 'active', leadershipNodeIds: ['res'], assignedNodeIds: ['res'] },
};
for (const id of SQUAD) users[id] = { id, name: id.toUpperCase(), email: `${id}@cpl.io`,
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

/* FIVE INDEPENDENT ORIGINS, so a group inquiry actually exists to have a Forum and an audience.
   Without it every assertion below would pass against a product with nothing in it — the
   empty-fixture lie this repository keeps finding in its own suites. */
for (const id of SQUAD.slice(0, 5)) {
  _noteGroupCandidates(C, id, `member:${id}`, [{ id: 'cp_' + id, level: 'observation',
    text: 'talking drops off after we lose',
    sourceSpan: 'nobody on our team talks after a loss',
    concerns: 'group', originRef: 'oc_' + id, originKind: 'direct_observation', turnId: 'tc_' + id }],
    'communication', 'Communication after results');
}

/* THE SENTENCE THE WHOLE FILE TURNS ON. Said privately to IntelliQ, never offered to anybody, and
   distinctive enough that it can be searched for anywhere it must not appear. */
const PRIVATE = 'my father is unwell and I am finding the evenings hard';
const SECOND  = 'I also think our left side is where we keep losing the ball';

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = who => ({ Authorization: `Bearer ${issueToken(who, C,
    users[who].role === 'member' ? 'member' : 'coach')}`, 'Content-Type': 'application/json' });
  const call = (m, u, b, who) => fetch(base + u, { method: m, headers: H(who),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  /* Everything this person's organisation could possibly show anybody else, as one string. If the
     private sentence is anywhere in here, it has escaped. */
  const everythingVisibleTo = async (who) => {
    const parts = [];
    for (const [m, u] of [
      ['GET', '/api/group/first/state'],
      ['GET', '/api/team/readiness'],
      ['GET', '/api/leader/raises'],
      ['GET', '/api/objects'],
    ]) {
      const r = await call(m, u, undefined, who).catch(() => null);
      if (r) parts.push(JSON.stringify(r.j || {}));
    }
    return parts.join('\n');
  };

  try {
    /* ══ A — AN ORDINARY TURN IS PRIVATE, AND THERE IS NO MODE TO SET ══════════════════════ */
    console.log('\n  A — AN ORDINARY COMPOSER TURN IS PRIVATE');
    const t1 = await call('POST', '/api/assistant/turn', { text: PRIVATE, surface: 'home' }, 'p1');
    ok('A1 the turn is answered', t1.status === 200 && !!(t1.j && t1.j.response));
    ok('A2 …and the answer carries no visibility or audience decision at all',
      !/"visibility"\s*:\s*"(public|shared)"/i.test(JSON.stringify(t1.j || {})));
    /* THE INJECTION. A client that still believed in the old mode — or anybody crafting a
       request — must not be able to make a conversation public by asserting it. The route reads
       no such field, and this is what keeps that true. */
    const t2 = await call('POST', '/api/assistant/turn',
      { text: SECOND, surface: 'home', visibility: 'public', share: true, _wsShare: true,
        audience: 'node_members', shareToForum: true }, 'p1');
    ok('A3 a turn that ASSERTS it is public is still accepted as an ordinary private turn',
      t2.status === 200);
    ok('A4 …and saying so changed nothing about where it went',
      !(await everythingVisibleTo('coach')).includes('left side is where we keep losing'));

    /* ══ B — THE CONTROL IS GONE FROM THE CLIENT ═══════════════════════════════════════════
       Asserted against the source that ships. The rendered half is in the browser gate; this is
       the half that runs with no browser and catches a reinstatement in review. */
    console.log('\n  B — NO PRIVATE/PUBLIC CONTROL EXISTS TO BE SHOWN');
    ok('B1 no composer renders a visibility toggle', !/id="iq-vis"/.test(APP_JS));
    ok('B2 …there is no handler for one', !/toggleVisibility\s*\(\)\s*\{/.test(APP_JS));
    ok('B3 …and no state behind one', !/this\._wsShare\s*=/.test(APP_JS));
    /* THE HALF THAT STOPS A SILENT REWIRE. Removing the button while still sending a flag would
       pass B1-B3 and be WORSE than the defect, because nothing on screen would say so any more.
       Scoped to the turn request itself: `assistantTurn`'s JSON.stringify body is the only thing
       this surface sends, and it must name no visibility, share or audience key.

       The first version of this searched the whole file for `_wsShare` and failed against the
       comment explaining the removal — a test that cannot tell an explanation from a live wire. */
    const turnFn = APP_JS.slice(APP_JS.indexOf('async assistantTurn('));
    const turnBody = turnFn.slice(0, turnFn.indexOf('clearTimeout'));
    ok('B4pre the turn request body was actually located, so B4 is reading something',
      turnBody.length > 200 && /JSON\.stringify/.test(turnBody) && /conversationId/.test(turnBody));
    ok('B4 …and it carries no visibility, share or audience key',
      !/\b(visibility|share|shareToForum|audience|_wsShare)\b/.test(turnBody));
    /* AND THE ROW STILL SAYS WHAT IS TRUE. Deleting the pill and saying nothing would leave a
       person guessing; the standing fact and the link to the whole rule both remain. */
    ok('B5 the composer still states the standing fact, rather than going quiet',
      /iq-hint-note/.test(APP_JS) && /Private to you/.test(APP_JS));
    ok('B6 …and still offers the explanation of who can see what',
      /Who can see what I say here\?/.test(APP_JS));

    /* ══ C — PRIVATE CONVERSATION DOES NOT REACH THE FORUM ═════════════════════════════════ */
    console.log('\n  C — WHAT WAS SAID PRIVATELY IS NOT IN THE ROOM');
    /* THE ROOM HAS TO EXIST BEFORE "it is not in the room" MEANS ANYTHING. Five people each
       deliberately pass their own account forward, which is what opens the question — the two-
       sided floor needs five independent origins and they have to be offered, not merely
       detected. C3 and C4 below passed against a 404 on the first run of this file, which is the
       empty-fixture lie in its purest form. */
    for (const id of SQUAD.slice(0, 5)) {
      const c = (groupCandidates[C] || []).find(x => x.contributorId === id && x.status === 'detected');
      if (c) await call('POST', '/api/group/first/contribute',
        { candidateId: c.candidateId, valence: 'worth_attention' }, id);
    }
    const inqs = await call('GET', '/api/group/first/inquiry', undefined, 'coach');
    const inq = ((inqs.j || {}).inquiries || [])
      .find(i => ((i.topic || {}).canonicalConcept) === 'communication') || null;
    ok('C1 the group has a real inquiry on five independent origins, so there is a room to leak into',
      !!inq && inq.independentOrigins === 5);
    const roomId = inq && (inq.inquiryId || inq.id);
    const room = await call('GET', `/api/group/first/forum/${roomId}`, undefined, 'p2');
    ok('C2 the room opens for a squad member', room.status === 200);
    ok('C3 …and contains nothing the person said privately',
      !JSON.stringify(room.j || {}).includes('father is unwell'));
    ok('C4 …and is not carrying their second private sentence either',
      !JSON.stringify(room.j || {}).includes('left side is where we keep losing'));

    /* ══ D — AND IT DOES NOT REACH LEADER OR TEAM INTELLIGENCE ═════════════════════════════
       The direction that matters most for a family test: a member says something difficult and
       their coach must not find it in a dashboard. */
    console.log('\n  D — AND THEIR COACH DOES NOT FIND IT ANYWHERE');
    const coachSees = await everythingVisibleTo('coach');
    ok('D1 nothing the coach can read contains the private sentence',
      !coachSees.includes('father is unwell'));
    ok('D2 …nor the private opinion about the squad',
      !coachSees.includes('left side is where we keep losing'));
    /* ANOTHER SQUAD'S LEADER, who is the stricter case: no relationship to this person at all. */
    const outsiderSees = await everythingVisibleTo('outsider');
    ok('D3 …and another squad\'s leader finds neither',
      !outsiderSees.includes('father is unwell') &&
      !outsiderSees.includes('left side is where we keep losing'));
    /* AND IT DID NOT BECOME A CANDIDATE. Reaching the group's evidence would be the quietest
       escape of all, because no screen would name the person. */
    ok('D4 …and it never became a group candidate, which is the leak no screen would show',
      !JSON.stringify(groupCandidates[C] || {}).includes('father is unwell'));

    /* ══ E — BUT THE ARROW STILL POINTS INWARD ═════════════════════════════════════════════
       Removing a control must not have removed the legitimate direction: what the room has said,
       which this person is authorised to read, may still inform their private conversation. */
    console.log('\n  E — AUTHORISED FORUM INFORMATION MAY STILL REACH A PRIVATE COMPOSER');
    const said = await call('POST', `/api/group/first/forum/${roomId}`,
      { text: 'we go quiet on the bus home and nobody wants to be first to speak' }, 'p3');
    ok('E1 somebody says something in the room', said.status === 200);
    const backIn = await call('GET', `/api/group/first/forum/${roomId}`, undefined, 'p1');
    ok('E2 …and a different authorised member can read it',
      backIn.status === 200 && JSON.stringify(backIn.j || {}).includes('nobody wants to be first'));
    ok('E3 …so the inward direction survives the removal', backIn.status === 200);

    /* ══ F — THE GOVERNED WAY TO CONTRIBUTE STILL EXISTS ═══════════════════════════════════
       Without this section the file would only prove that something was deleted. The product has
       to still let a person deliberately contribute — and the contribution must still be the
       person's OWN act, named, and counted as one origin. */
    console.log('\n  F — AND A PERSON CAN STILL DELIBERATELY CONTRIBUTE');
    /* Read as the AUTHOR, because "mine" is the thing the contribute route turns on and the
       previous read was p1's. The first version of this asserted `!!mine || true`, which is a
       bare true wearing a sentence — it could not have failed for any product at all. */
    const asAuthor = await call('GET', `/api/group/first/forum/${roomId}`, undefined, 'p3');
    const msgs = (asAuthor.j || {}).messages || [];
    const theirs = msgs.find(m => /nobody wants to be first/.test(m.text || ''));
    ok('F1 the author can find their own message in the room, marked as theirs',
      !!theirs && theirs.mine === true);
    const contribute = await call('POST',
      `/api/group/first/forum/${roomId}/${(theirs || {}).messageId}/contribute`, {}, 'p3');
    ok('F2 the author may offer their own words as their own account', contribute.status === 200);
    /* AND NOT SOMEBODY ELSE'S. The governed path is preserved, including its refusals. */
    const notTheirs = await call('POST',
      `/api/group/first/forum/${roomId}/${(theirs || {}).messageId}/contribute`, {}, 'p1');
    ok('F3 …and nobody else may offer it for them', notTheirs.status >= 400);
    /* THE AUDIENCE MACHINERY ITSELF. `/api/me/audiences` is what a governed share names its
       readers from; if the removal had taken it out, sharing would have no vocabulary left. */
    const auds = await call('GET', '/api/me/audiences', undefined, 'p1');
    ok('F4 the audience vocabulary a governed share names its readers from still resolves',
      auds.status === 200 && Array.isArray((auds.j || {}).audiences));
    ok('F5 …and still describes at least one real audience',
      (((auds.j || {}).audiences) || []).length > 0);

    /* ══ G — THE OBJECT AUDIENCE CONTROLS ARE UNTOUCHED ════════════════════════════════════
       High, Low, Inquiry and Focus each carry their own audience decision. The correction was to
       the generic composer only, and this is the assertion that proves it did not reach further. */
    console.log('\n  G — HIGH, LOW, INQUIRY AND FOCUS KEEP THEIR OWN AUDIENCE CONTROLS');
    const f = await call('POST', '/api/me/focus', { text: 'speak first on the bus home' }, 'p1');
    const fid = f.j && f.j.focus && f.j.focus.id;
    ok('G1 a personal focus can be made', f.status === 200 && !!fid);
    ok('G2 …and starts private, as the law says', (f.j.focus.visibility || 'private') === 'private');
    const widen = await call('POST', `/api/me/focus/${fid}/visibility`, { visibility: 'shared' }, 'p1');
    ok('G3 …and its owner can still widen it deliberately, on the object itself',
      widen.status === 200 && widen.j.visibility === 'shared');
    ok('G4 …and is told in words who that now means',
      !!(widen.j && String(widen.j.note || '').length > 10));
    const narrow = await call('POST', `/api/me/focus/${fid}/visibility`, { visibility: 'private' }, 'p1');
    ok('G5 …and can take it back', narrow.status === 200 && narrow.j.visibility === 'private');
    /* THE CLIENT HALF: the control that opens this on a thread must still be rendered. */
    ok('G6 the object thread still offers its audience control',
      /openAudience\(/.test(APP_JS));
    ok('G7 …and the governed forum share action is still built',
      /share_to_forum/.test(APP_JS));

    /* ══ H — A PHOTO OR DOCUMENT FOLLOWS THE SAME LAW ══════════════════════════════════════
       An attachment is the case where somebody is most likely to assume a different rule applies,
       because they have handed the product an artefact rather than a sentence. */
    console.log('\n  H — AN ATTACHED THING IS PART OF THE SAME PRIVATE CONVERSATION');
    const att = await call('POST', '/api/assistant/attachments',
      { filename: 'note.txt', text: 'my father is unwell and I am finding the evenings hard' }, 'p1');
    ok('H1 a document can be attached to a private conversation', att.status === 200);
    const afterAtt = await everythingVisibleTo('coach');
    ok('H2 …and its contents do not appear in anything the coach can read',
      !afterAtt.includes('father is unwell'));
    ok('H3 …and it did not become group evidence',
      !JSON.stringify(groupCandidates[C] || {}).includes('father is unwell'));

    /* ══ I — NAVIGATION CANNOT CHANGE IT ═══════════════════════════════════════════════════
       The composer is in the shell now and is reachable from every page, so "which page was I on"
       must not be a privacy input. `surface` is the only thing the client sends that names one. */
    console.log('\n  I — WHICH PAGE THEY WERE ON IS NOT A PRIVACY INPUT');
    const surfaces = ['home', 'notes', 'settings', 'people', 'inquiry'];
    const results = [];
    for (const s of surfaces) {
      const r = await call('POST', '/api/assistant/turn',
        { text: `thinking about this from ${s}, and it is still my own business`, surface: s }, 'p4');
      results.push([s, r.status]);
    }
    ok('I1 the same turn is accepted from every page the composer now appears on',
      results.every(([, st]) => st === 200));
    const afterNav = await everythingVisibleTo('coach');
    ok('I2 …and none of them reached the coach, whichever page it was sent from',
      !afterNav.includes('still my own business'));
    ok('I3 …and none became group evidence',
      !JSON.stringify(groupCandidates[C] || {}).includes('still my own business'));

    /* ══ J — AND NONE OF THIS DEPENDED ON A MODEL ══════════════════════════════════════════
       The whole file ran with IQ_DETERMINISTIC_ONLY, which is the pilot's state. This section
       says so out loud rather than leaving it implied, because a privacy property that only holds
       while a provider is reachable is not a privacy property. */
    console.log('\n  J — PROVIDER-DOWN, WHICH IS HOW EVERY ASSERTION ABOVE RAN');
    ok('J1 the deterministic-only flag was on for this entire run',
      process.env.IQ_DETERMINISTIC_ONLY === '1');
    const down = await call('POST', '/api/assistant/turn',
      { text: 'with no model reachable this is still mine', surface: 'home' }, 'p5');
    ok('J2 a turn with no model still answers', down.status === 200);
    ok('J3 …and is still private', !(await everythingVisibleTo('coach')).includes('still mine'));

    /* ══ K — THE CONTROL ═══════════════════════════════════════════════════════════════════
       Every "did not leak" assertion above would pass against a server that returns nothing to
       anybody. This proves the coach's surfaces are live and do carry the group's real work. */
    console.log('\n  K — THE CONTROL: THE COACH DOES SEE WHAT THEY ARE ENTITLED TO');
    const coachFinal = await everythingVisibleTo('coach');
    ok('K1 the coach reads a real group picture, so the checks above were not measuring silence',
      /talking drops off after we lose|inquir/i.test(coachFinal));
    ok('K2 …and the room the squad has been using is genuinely readable by them',
      JSON.stringify((await call('GET', `/api/group/first/forum/${roomId}`, undefined, 'coach')).j || {})
        .includes('nobody wants to be first'));

  } catch (e) { fail++; console.error('  FAIL composer-privacy-law suite threw:', e && e.stack); }

  server.close();
  console.log(`\ncomposer-privacy-law-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
