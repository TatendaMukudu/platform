/* Truth layer — A COACH'S OBSERVATION, AND THE PLAYER'S RIGHT TO DISAGREE.

   Founder decision, September 2026, taken over two alternatives: "Yes — attributed, and the
   player sees it."

   A coach may record what they saw, directly, without waiting for a player to raise something.
   The ladder alone was too narrow — a leader's read only entered when a player asked a question,
   and coaches expect to be able to say what they saw.

   WHAT WAS REFUSED is the version where the player cannot see it. A private staff record is the
   secret file this architecture has declined everywhere else, and visibility is the only thing
   that stops an attributed observation becoming one.

   AND IT IS EVIDENCE LIKE ANY OTHER. Third-party authority, the leader as its own origin,
   through applyProposals — so one coach saying a thing five times is still ONE origin, and the
   kernel bands it rather than the coach asserting a standing for it. That is the same rule that
   stops a player talking their own belief into a Low by repetition, applied to the person with
   more power in the room rather than less.

   THE PLAYER'S ANSWER IS NOT A COMPLAINT FORM. It is a contradicting account on the same
   belief, which makes the belief CONTESTED — and contested climbs. Two people watched the same
   thing and read it differently, and that gap is the finding.

   Run: node scripts/coach-observation-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, inquiryStates } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'cob';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'A Club', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coach: { id: 'coach', name: 'Head Coach', email: 'c@x.io',  role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['n1'] },
    other: { id: 'other', name: 'Other Coach', email: 'oc@x.io', role: 'coach', orgCode: C, status: 'active', leadershipNodeIds: ['n2'] },
    p1:    { id: 'p1',    name: 'Player One', email: 'p1@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'] },
    out:   { id: 'out',   name: 'Other Squad', email: 'o@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n2'] },
  } },
  orgNodes: { [C]: {
    n1: { nodeId: 'n1', name: 'First Team', parentId: null, childNodeIds: [], memberIds: ['p1'], leaderIds: ['coach'] },
    n2: { nodeId: 'n2', name: 'Reserves',   parentId: null, childNodeIds: [], memberIds: ['out'], leaderIds: ['other'] },
  } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = t => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const get  = (u, t) => fetch(base + u, { headers: H(t) }).then(r => r.json());
  const post = (u, t, b) => fetch(base + u, { method: 'POST', headers: H(t), body: JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  const coachT = issueToken('coach', C, 'coach');
  const otherT = issueToken('other', C, 'coach');
  const p1T = issueToken('p1', C, 'member');

  const inqOf = () => Object.values((inquiryStates[C] || {})['member:p1'] || {})[0] || null;

  try {
    /* ── CO1-CO3: the coach records, attributed, and the player can see it. ── */
    const rec = await post('/api/leader/observation', coachT,
      { subjectId: 'p1', about: 'Pressing', text: 'He steps out late in the second half', direction: 'decline' });
    ok('CO1 a coach can record what they saw about somebody they lead, without waiting to be asked',
      rec.status === 200 && !!rec.j.inquiryId);
    ok('CO1b …and is told plainly that the player will see it and can answer — the transparency is stated, not assumed',
      /can see it/i.test(rec.j.note || '') && /saw it differently/i.test(rec.j.note || ''));

    const inq = inqOf();
    ok('CO2 it lands on the PLAYER\'S OWN record as ordinary evidence, in the coach\'s name',
      inq && (inq.signals || []).length === 1 && inq.signals[0].originRef === 'leader:coach' &&
      inq.signals[0].authority === 'third_party');

    const seen = await get('/api/inquiry', p1T);
    ok('CO3 THE PLAYER CAN SEE IT — a record about somebody they cannot read is the secret file this refuses to be',
      JSON.stringify(seen).includes(inq.inquiryId));

    /* ── CO4: leading is the gate, and it is scoped to the node. ── */
    const notMine = await post('/api/leader/observation', coachT, { subjectId: 'out', about: 'x', text: 'y' });
    ok('CO4 a coach cannot write about somebody on another squad — leading is scoped to the node, as it is for the roster',
      notMine.status === 403 && /do not lead/i.test(notMine.j.error || ''));
    const byPlayer = await post('/api/leader/observation', p1T, { subjectId: 'p1', about: 'x', text: 'y' });
    ok('CO4b …and somebody who leads nothing cannot record about anyone, including themselves',
      byPlayer.status === 400 || byPlayer.status === 403);

    /* ── CO5: ONE COACH IS ONE ORIGIN. The independence rule, applied to the person with more
       power in the room rather than less. ── */
    for (let i = 0; i < 4; i++) {
      await post('/api/leader/observation', coachT,
        { subjectId: 'p1', about: 'Pressing', text: `saying it again, number ${i}`, direction: 'decline' });
    }
    const many = inqOf();
    const origins = new Set((many.signals || []).filter(s => s.originRef).map(s => s.originRef));
    ok('CO5 five observations from one coach are FIVE signals and ONE origin — the same rule that stops a player talking their belief into a Low, applied to the coach',
      (many.signals || []).length === 5 && origins.size === 1);

    /* ── CO6: direction is DECLARED. A coach's wording is read no more than a player's. ── */
    const worded = await post('/api/leader/observation', coachT,
      { subjectId: 'p1', about: 'Recovery', text: 'terrible, awful, catastrophic session' });
    const rec2 = Object.values(inquiryStates[C]['member:p1']).find(i => i.inquiryId === worded.j.inquiryId);
    ok('CO6 with no direction declared, the strongest possible wording still carries NONE — the classifier does not come back through a coach',
      rec2.signals.every(s => s.direction === 'neutral'));

    /* ── CO7-CO9: the player's answer. ── */
    const empty = await post('/api/me/disagree', p1T, { inquiryId: inq.inquiryId, because: '' });
    ok('CO7 a disagreement with no account is refused — "I disagree" on its own tells the record nothing',
      empty.status === 400 && /how you saw it/i.test(empty.j.error || ''));

    const said = await post('/api/me/disagree', p1T,
      { inquiryId: inq.inquiryId, because: 'I drop in when the ball goes wide, which is the plan we agreed' });
    ok('CO8 the player can answer it, in their own words, on the same belief',
      said.status === 200 && said.j.contested === true);
    const after = inqOf();
    ok('CO8b …and it is a CONTRADICTING ACCOUNT on the record, not a flag somebody set — which is what a disagreement actually is',
      (after.signals || []).some(s => s.dissents === true && s.originRef === 'self:p1'));

    const lows = ((await get('/api/objects?kind=low&scope=all', p1T)).objects || [])
      .map(o => (o.present || {}).summary?.title || '');
    ok('CO9 DISAGREEMENT IS THE FINDING — it surfaces as a Low about accounts differing, rather than one side quietly winning',
      lows.some(t => /accounts differ/i.test(t)));

    ok('CO9b …and the response says the gap is not averaged away and moves up rather than down',
      /does not get averaged/i.test(said.j.note || '') && /moves up/i.test(said.j.note || ''));

    /* ── CO10: a player cannot disagree with somebody else's belief. ── */
    const notTheirs = await post('/api/me/disagree', issueToken('out', C, 'member'),
      { inquiryId: inq.inquiryId, because: 'nothing to do with me' });
    ok('CO10 a disagreement is about your own record — nobody can contest a belief that is not about them',
      notTheirs.status === 404);

    /* ── CO11: BOTH HAVE TO REACH A PHONE, and one of them replaces a button that only LOOKED
       like it worked. "I disagree" prefilled the composer with a sentence and contested nothing
       — the same hollow-control shape as "Make this a focus", which prefilled the composer and
       made no focus, reported three times before anybody found it. ── */
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
    ok('CO11 "I disagree" is now an ACT, not a sentence typed into a box for you to finish',
      /if \(action === 'contest'\) return this\._openDisagree\(\);/.test(src) &&
      /fetch\('\/api\/me\/disagree'/.test(src));
    ok('CO11b …and the old prefill for it is gone, so there is no path left that looks like disagreeing and is not',
      !/contest: 'I do not think that is right/.test(src));
    ok('CO12 a coach can reach the observation form from a player\'s profile, beside asking about them',
      /MemberApp\.openObservation\(/.test(src) && /fetch\('\/api\/leader\/observation'/.test(src));
    ok('CO12b …the form makes them DECLARE a direction rather than have it read from their wording',
      /_obDir\('improvement'\)/.test(src) && /_obDir\('decline'\)/.test(src) && /_obDir\('neutral'\)/.test(src));
    ok('CO12c …and it says on the form that the player will see it and can answer, so a leader knows before they write',
      /They will see this, in your name, and can say if they saw it differently/.test(src));

  } catch (e) { fail++; console.error('  FAIL suite threw:', e && e.stack); }

  server.close();
  console.log(`\ncoach-observation-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
