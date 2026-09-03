/* Truth layer — THE LADDER, AND WHY BEING PASSED ALONG MAKES SOMETHING MATTER MORE.

   Founder: "if a high or low person has to go through a leader and the owner... they will all
   have different perspectives with different evidence, such as a weight room coach's evidence
   for you doing well will be different to a head coach. Which is only advantageous to our
   system. And each time a leader pushes it away the bigger the priority becomes because it'll
   be a bottleneck on the user's page."

   Two mechanisms, one design.

   UP: five people who see a player from five vantages produce five accounts that are genuinely
   independent. A strength coach and a head coach are not one story told twice — they are two
   origins, and origins are what this whole system runs on. Routing is not overhead on the way
   to gathering evidence. Routing IS the gathering.

   DOWN: a thing five people each handed on is not a thing of declining importance. It is a
   thing nobody owns, which is a fact about the ORGANISATION rather than about the person, and
   it belongs at the top of their page. Ordinary software reads a dismissal as "show this less".
   Here a pass means show it MORE, because the person is still carrying it.

   The founder took L-ES1 explicitly when asked: THE PERSON RAISES IT. Automatic routing on the
   call was offered and rejected. So the suite pins consent as hard as it pins the escalation —
   nothing about somebody travels because the machine decided it should.

   Run: node scripts/escalation-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const diagnose   = require('../ai/diagnose.js');
const escalation = require('../ai/escalation.js');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, inquiryStates, _getMemory,
  _ladderFor, _raises } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'esc';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'A Club', orgMode: 'sports' } },
  orgUsers: { [C]: {
    p:      { id: 'p',      name: 'A Player',      email: 'p@x.io',  role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['first'] },
    other:  { id: 'other',  name: 'Other Player',  email: 'o@x.io',  role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['first'] },
    strength: { id: 'strength', name: 'Strength Coach', email: 's@x.io', role: 'coach', orgCode: C, status: 'active', leadershipNodeIds: ['first'] },
    head:   { id: 'head',   name: 'Head Coach',    email: 'h@x.io',  role: 'coach', orgCode: C, status: 'active', leadershipNodeIds: ['first'] },
    dir:    { id: 'dir',    name: 'Director',      email: 'd@x.io',  role: 'coach', orgCode: C, status: 'active', leadershipNodeIds: ['club'] },
    owner:  { id: 'owner',  name: 'The Owner',     email: 'w@x.io',  role: 'superadmin', orgCode: C, status: 'active' },
  } },
  // TWO THINGS IN THIS TREE ARE DELIBERATE, because without them the ladder assertions below
  // pass on a shape that cannot go wrong. The head coach leads BOTH the first team and the club,
  // so a ladder that forgets to dedupe puts them on it twice. And the player is the CAPTAIN — a
  // leader of the very group they are a member of — so a ladder that forgets to exclude the
  // subject asks them to answer their own raise. The first fixture had neither and a mutation
  // deleting both rules changed nothing.
  orgNodes: { [C]: {
    first: { nodeId: 'first', name: 'First Team', parentId: 'club', childNodeIds: [], memberIds: ['p', 'other'], leaderIds: ['strength', 'head', 'p'] },
    club:  { nodeId: 'club',  name: 'The Club',   parentId: null,   childNodeIds: ['first'], memberIds: [], leaderIds: ['dir', 'head'] },
  } },
});
_rebuildEmailIndex();

const mk = (id, concept, label, n) => {
  let i = diagnose.newInquiry({ id, subjectRef: 'member:p', concept, label, domain: 'sports' });
  const props = Array.from({ length: n }, (_, k) => ({
    id: `p${k}`, level: 'observation', directness: 'direct', authority: 'self_report',
    source: 'self', specificity: 0.7, statement: 'x',
    originKind: 'self_report', originRef: `${id}_o${k}`, turnId: `${id}_t${k}`,
  }));
  i = diagnose.applyProposals(i, props, { now: Date.now(), evidenceRefOf: p => p.originRef });
  i.hypotheses = [diagnose.newHypothesis({ id: `h_${id}`, statement: `something about ${label}` })];
  i.leadingHypothesisId = i.hypotheses[0].id;
  return i;
};
inquiryStates[C] = { 'member:p': {
  knee:   mk('inq_knee', 'soccer.knee', 'Knee after training', 3),
  uncalled: mk('inq_unc', 'soccer.pass', 'Passing range', 3),
} };

const originsOf = () => {
  const inq = Object.values(inquiryStates[C]['member:p']).find(i => i.inquiryId === 'inq_knee');
  const active = (inq.signals || []).filter(s => s && s.kind !== 'interpretation' && diagnose.isActive(s));
  return new Set(active.filter(s => s.originRef).map(s => s.originRef)).size;
};

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = t => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const get  = (u, t) => fetch(base + u, { headers: H(t) }).then(r => r.json());
  const post = (u, t, b) => fetch(base + u, { method: 'POST', headers: H(t), body: JSON.stringify(b || {}) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  const pT = issueToken('p', C, 'member');
  const sT = issueToken('strength', C, 'coach');
  const hT = issueToken('head', C, 'coach');
  const dT = issueToken('dir', C, 'coach');
  const wT = issueToken('owner', C, 'superadmin');
  const oT = issueToken('other', C, 'member');

  try {
    /* ── E1-E2: L-ES1. THE PERSON'S ACT, and only for something they have taken a position on. ── */
    const early = await post('/api/me/raise', pT, { inquiryId: 'inq_unc' });
    ok('E1 a belief you have not called cannot be raised — asking five people to look at something you have not taken a position on yourself is not a request, it is a shrug',
      early.status === 400 && /call it/i.test(early.j.error || ''));

    await post('/api/me/call', pT, { inquiryId: 'inq_knee', valence: 'worth_attention' });
    const beforeRaise = await get('/api/leader/raises', sT);
    ok('E2 CALLING IT SENDS IT NOWHERE — the call files it privately and no leader can see anything yet',
      (beforeRaise.raises || []).length === 0);

    /* ── E3: the ladder, nearest first. ── */
    const ladder = _ladderFor(C, 'p');
    ok('E3 the ladder is the people who lead you, NEAREST FIRST, ending at whoever runs the place',
      ladder.map(l => l.leaderId).join(',') === 'strength,head,dir,owner');
    ok('E3b …it never contains the person themselves, even when they captain the very group they are in — nobody is asked to answer their own raise',
      !ladder.some(l => l.leaderId === 'p'));
    ok('E3c …and somebody who leads two of your groups is ONE rung, not two — a ladder that counts a person twice inflates the bottleneck it is meant to measure',
      ladder.filter(l => l.leaderId === 'head').length === 1 &&
      !ladder.some(l => l.leaderId === 'other'));

    const raised = await post('/api/me/raise', pT, { inquiryId: 'inq_knee' });
    ok('E4 raising it is a second, deliberate act, and it goes to the nearest leader first',
      raised.status === 200 && raised.j.waitingOn === 'Strength Coach' && raised.j.of === 4);
    const rid = raised.j.raiseId;

    ok('E4b …and now, and only now, it is in front of that leader',
      ((await get('/api/leader/raises', sT)).raises || []).some(r => r.raiseId === rid));
    ok('E4c …and not in front of the one after them — a ladder is a queue, not a broadcast',
      !((await get('/api/leader/raises', hT)).raises || []).some(r => r.raiseId === rid));

    /* ── E5: what a leader is shown. Named person, no verbatim. ── */
    const forStrength = ((await get('/api/leader/raises', sT)).raises || []).find(r => r.raiseId === rid);
    ok('E5 the leader is told WHO and WHAT, because a read on somebody you cannot identify is not a read',
      forStrength.from === 'A Player' && /Knee after training/i.test(forStrength.label));
    ok('E5b …and is asked for their own vantage rather than shown a verdict to agree with',
      /what do you see/i.test(forStrength.question || ''));

    /* ── E6: L-ES2. A pass must say why. ── */
    const silent = await post(`/api/leader/raise/${rid}/pass`, sT, { kind: 'handoff' });
    ok('E6 a leader cannot pass it on in silence — a pass with no reason is a dismissal wearing a routing label',
      silent.status === 400 && /say why/i.test(silent.j.error || ''));

    /* ── E7: L-ES6. Only the person holding it. ── */
    const reachIn = await post(`/api/leader/raise/${rid}/pass`, hT, { reason: 'not mine', kind: 'handoff' });
    ok('E7 the NEXT leader cannot reach in and act early — a ladder anybody can reach into is a queue with no accountability, which is the thing being measured',
      reachIn.status === 403);
    const byPlayer = await post(`/api/leader/raise/${rid}/take`, oT, { note: 'mine now' });
    ok('E7b …and somebody who leads nothing cannot touch it at all', byPlayer.status === 403);

    /* ── E8-E10: L-ES4. A read is evidence. A handoff never is. ── */
    const originsAtStart = originsOf();
    const handoff = await post(`/api/leader/raise/${rid}/pass`, sT,
      { reason: 'Nothing in the gym numbers, this is one for the pitch staff', kind: 'handoff' });
    ok('E8 a HANDOFF moves it on and records nothing about the person — "not my area" is routing, and routing must never become an observation about somebody',
      handoff.status === 200 && handoff.j.recorded === false && originsOf() === originsAtStart);

    const read = await post(`/api/leader/raise/${rid}/pass`, hT,
      { reason: 'He is landing heavy on that side late in sessions', kind: 'read' });
    ok('E9 a READ is an account, deliberately given, and becomes evidence in its author\'s name',
      read.status === 200 && read.j.recorded === true && originsOf() === originsAtStart + 1);

    const read2 = await post(`/api/leader/raise/${rid}/pass`, dT,
      { reason: 'Same thing showed up in the away trip reports', kind: 'read' });
    ok('E10 DIFFERENT VANTAGES ARE DIFFERENT ORIGINS — this is the founder\'s point, and it is what makes routing worth doing at all',
      read2.status === 200 && originsOf() === originsAtStart + 2 &&
      escalation.originCount(_raises(C)[rid]) === 2);

    /* ── E11-E13: L-ES3. THE ESCALATION. ── */
    const mine = ((await get('/api/me/raises', pT)).raises || []).find(r => r.raiseId === rid);
    ok('E11 every pass raises the priority rather than lowering it — three people have handed it on and it is now urgent',
      mine.passes === 3 && mine.priority === 'urgent');
    ok('E11b …and the person is told plainly where it is and who is holding it',
      /Waiting on The Owner/i.test(mine.line) && /passed it on/i.test(mine.line));
    ok('E11c …and can read what each of them actually said, attributed',
      (mine.said || []).length === 3 &&
      mine.said.some(s => s.by === 'Head Coach' && s.kind === 'read') &&
      mine.said.some(s => s.by === 'Strength Coach' && s.kind === 'handoff'));

    // The climb itself, on the kernel, where the steps can be seen one at a time.
    const rung = n => {
      let r = escalation.newRaise({ raiseId: 'r', inquiryId: 'i', subjectId: 'p', ladder:
        [1, 2, 3, 4, 5].map(k => ({ leaderId: 'L' + k })), now: 1 });
      for (let k = 0; k < n; k++) {
        r = escalation.pass(r, { by: 'L' + (k + 1), reason: 'why', kind: 'handoff', now: 1 }).raise;
      }
      return escalation.priorityOf(r);
    };
    ok('E12 the climb is monotonic and it caps — medium, high, urgent, and it stays urgent rather than inventing a louder word',
      rung(0) === 'medium' && rung(1) === 'high' && rung(2) === 'urgent' && rung(4) === 'urgent');

    /* ── E13: running off the end is an OUTCOME, not an error. ── */
    const last = await post(`/api/leader/raise/${rid}/pass`, wT, { reason: 'Refer to the medical staff', kind: 'handoff' });
    ok('E13 when the last person passes it on, that is reported as what it is rather than as a failure',
      last.status === 200 && /nobody after you/i.test(last.j.note || ''));
    const exhausted = ((await get('/api/me/raises', pT)).raises || []).find(r => r.raiseId === rid);
    ok('E13b …and the person is told, in those words, that nobody took it',
      exhausted.status === 'exhausted' && exhausted.priority === 'urgent' &&
      /Nobody has taken it/i.test(exhausted.line));

    /* ── E14: THE BOTTLENECK REACHES THE PERSON'S PAGE. The escalation is worth nothing if it
       only exists in a list nobody opens, so it is asserted through the same read the app uses. ── */
    const lows = ((await get('/api/objects?kind=low&scope=self', pT)).objects || []);
    const bott = lows.find(o => /nobody has taken this on/i.test(((o.present || {}).summary || {}).title || ''));
    ok('E14 a raise nobody took is on the person\'s own page as a Low — the bottleneck is the finding',
      !!bott);
    ok('E14b …and it says how much better evidenced the thing became on its way through',
      /2 people have given their own read/i.test(JSON.stringify(bott || {})));
    ok('E14c …and it carries no verbatim of anything the person themselves said',
      !/Knee after training is/i.test(JSON.stringify(bott || {})) &&
      !/landing heavy/i.test(JSON.stringify(bott || {})));

    /* ── E15: taking it on ENDS the escalation. A solved thing must not go on being counted as
       an open one, or the priority number stops meaning anything. ── */
    await post('/api/me/call', pT, { inquiryId: 'inq_unc', valence: 'worth_attention' });
    const r2 = (await post('/api/me/raise', pT, { inquiryId: 'inq_unc' })).j.raiseId;
    await post(`/api/leader/raise/${r2}/pass`, sT, { reason: 'pitch staff', kind: 'handoff' });
    const taken = await post(`/api/leader/raise/${r2}/take`, hT, { note: 'I will look at this with him Tuesday' });
    ok('E15 a leader can take it on, and that is the point of the whole ladder', taken.status === 200);
    const held = ((await get('/api/me/raises', pT)).raises || []).find(r => r.raiseId === r2);
    ok('E15b …it drops out of the priority race, because it has an owner and is no longer theirs to carry',
      held.status === 'held' && held.priority === 'low' && /has taken this on/i.test(held.line));

    /* ── E16: symmetry. Raising was the person's act, so taking it back is too. ── */
    const notYours = await post(`/api/me/raise/${r2}/withdraw`, hT);
    ok('E16 a leader cannot withdraw somebody else\'s raise', notYours.status === 403);
    const pulled = await post(`/api/me/raise/${r2}/withdraw`, pT);
    ok('E16b the person can, and is told that what others already said about it stands',
      pulled.status === 200 && /their words/i.test(pulled.j.note || ''));
    ok('E16c …and withdrawing genuinely does not delete what a leader said — those were their words, not the subject\'s to erase',
      (_raises(C)[r2].stops || []).some(s => s.reason === 'pitch staff'));

    /* ── E17: IT HAS TO REACH BOTH PHONES. Every route above passed while nothing in the app
       called any of them, which is the defect shape that has bitten this month four times now.
       Existence is not invocation, so the call sites are pinned — and so is the one piece of
       UI behaviour that carries a law: the pass form cannot offer a way to pass without a
       reason, and it must make the leader SAY which of the two things they are doing. ── */
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
    ok('E17 the person can actually raise it — the button exists and posts',
      /MemberApp\.raiseBelief\('\$\{id\}'\)/.test(src) && /fetch\('\/api\/me\/raise'/.test(src));
    ok('E17b …and the leader\'s queue is rendered from the route, not defined and forgotten',
      /this\._renderWaiting\(\)/.test(src) && /fetch\('\/api\/leader\/raises'/.test(src));
    ok('E17c …the leader can take it on in one tap, and passing is the act that costs something',
      /takeRaise\(/.test(src) && /\/pass`/.test(src));
    ok('E17d …the form refuses an empty reason on the client too, so the rule is felt rather than discovered by a 400',
      /if \(!reason\)/.test(src));
    ok('E17e …and the leader is made to say which they are doing rather than have it read out of their wording',
      /value="read"/.test(src) && /value="handoff"/.test(src));

  } catch (e) { fail++; console.error('  FAIL suite threw:', e && e.stack); }

  server.close();
  console.log(`\nescalation-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
