/* Truth layer — THE REASONER over HTTP (the governed boundary). The pure fold is proven in
   reason-smoke; this proves the SERVER boundary: GET /api/reason/agenda is leader-gated;
   the org-wide belief ledger is read SCOPED to each leader (a belief about a person routes
   only to leaders who may see that person; a sibling branch lead never sees it — no leak);
   ripe items carry proposal-gated next steps; the projection leaks no evidence basis /
   support records / node scope; and the read is deterministic. Boots the real app in-process
   (DB_OPTIONAL) with an injected ledger. Run: node scripts/reason-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const DAY = 86400000, now = Date.now(), d = n => now - n * DAY;
const C = 'reasa';

/*  root(ceo)
      ├─ teamA(coachA, member joe)
      └─ teamB(coachB, member bob)                                          */
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'R', orgMode: 'sports' } },
  orgUsers: { [C]: {
    ceo:    { id: 'ceo',    name: 'Cleo', role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['root'] },
    coachA: { id: 'coachA', name: 'Alex', role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['teamA'] },
    coachB: { id: 'coachB', name: 'Bev',  role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['teamB'] },
    joe:    { id: 'joe',    name: 'Joe',  role: 'member', orgCode: C, status: 'active' },
    bob:    { id: 'bob',    name: 'Bob',  role: 'member', orgCode: C, status: 'active' },
    pat:    { id: 'pat',    name: 'Pat',  role: 'member', orgCode: C, status: 'active' },
  } },
  orgNodes: { [C]: {
    root:  { nodeId: 'root',  parentId: null,  leaderIds: ['ceo'],    memberIds: [], childNodeIds: ['teamA', 'teamB'] },
    teamA: { nodeId: 'teamA', parentId: 'root', leaderIds: ['coachA'], memberIds: ['joe'] },
    teamB: { nodeId: 'teamB', parentId: 'root', leaderIds: ['coachB'], memberIds: ['bob'] },
  } },
  // A KNOWN belief ledger (the shape reason() produces). The members carry no mood data, so
  // the tick adds no new observations — these prior beliefs drive the agenda. Recent lastSeen
  // keeps them open, not dormant.
  reasonLedger: { [C]: [
    { id: 'joe::momentum_drop', subjectId: 'joe', subjectName: 'Joe', scope: 'teamA',
      kind: 'momentum_drop', axis: 'momentum', polarity: 'risk',
      claim: "Joe's momentum has been running below their own normal.",
      support: [ { id: 'j1', t: d(9), severity: 'medium', basis: 'mood 2.7/5' }, { id: 'j2', t: d(5), severity: 'medium', basis: 'dip' }, { id: 'j3', t: d(1), severity: 'high', basis: 'mood 2.3/5' } ],
      counter: [], careFlag: false, firstSeen: d(9), lastSeen: d(1),
      whatWouldConfirm: 'the same signal recurring over the coming weeks',
      whatWouldRefute:  "the signal easing back toward Joe's normal, or them telling us the read is off" },
    { id: 'bob::plateau', subjectId: 'bob', subjectName: 'Bob', scope: 'teamB',
      kind: 'plateau', axis: 'growth', polarity: 'risk',
      claim: "Bob's growth has flattened despite steady effort.",
      support: [ { id: 'b1', t: d(12), severity: 'low', basis: 'flat' }, { id: 'b2', t: d(8), severity: 'low', basis: 'flat' }, { id: 'b3', t: d(4), severity: 'low', basis: 'flat' }, { id: 'b4', t: d(1), severity: 'low', basis: 'flat' } ],
      counter: [], careFlag: false, firstSeen: d(12), lastSeen: d(1),
      whatWouldConfirm: 'the same signal recurring over the coming weeks',
      whatWouldRefute:  "the signal easing back toward Bob's normal, or them telling us the read is off" },
  ] },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = {
    ceo: issueToken('ceo', C, 'coach'), coachA: issueToken('coachA', C, 'coach'),
    coachB: issueToken('coachB', C, 'coach'), pat: issueToken('pat', C, 'member'),
    joe: issueToken('joe', C, 'member'), bob: issueToken('bob', C, 'member'),
  };
  const agenda = who => (async () => {
    const r = await fetch(base + '/api/reason/agenda', { headers: { Authorization: `Bearer ${tok[who]}` } });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, j };
  })();
  const feedback = (who, beliefId, response) => (async () => {
    const r = await fetch(base + `/api/reason/${encodeURIComponent(beliefId)}/feedback`, {
      method: 'POST', headers: { Authorization: `Bearer ${tok[who]}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ response }),
    });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, j };
  })();

  try {
    /* ── 1 · leader-gated ── */
    const p = await agenda('pat');
    ok('1 · a plain member (no view_team) is refused (403)', p.status === 403);

    /* ── 2 · a leader reads the belief about their OWN person, ripe + support-first ── */
    const a = await agenda('coachA');
    const joeItem = (a.j.agenda || []).find(x => x.beliefId === 'joe::momentum_drop');
    ok('2 · the leader sees the belief about their person', a.j.ok && !!joeItem);
    ok('2 · it is ripe and raised SUPPORT-first (arm over the shoulder)', joeItem && joeItem.readiness === 'ripe' && joeItem.register === 'support');
    ok('2 · it carries the reasoner\'s own self-challenge', joeItem && Array.isArray(joeItem.challenge) && joeItem.challenge.some(r => /refuted by/.test(r)));
    const joeProp = (a.j.proposals || []).find(x => x.beliefId === 'joe::momentum_drop');
    ok('2 · the ripe belief carries a proposal-gated next step (surface, never act)', joeProp && joeProp.requiresConfirmation === true && /listen first/i.test(joeProp.text));

    /* ── 3 · NO cross-branch leak ── */
    ok('3 · the teamA lead does NOT see the teamB person\'s belief', !(a.j.agenda || []).some(x => x.beliefId === 'bob::plateau'));
    ok('3 · nothing about the sibling branch leaks in the payload', !/bob|Bob|teamB|plateau/i.test(JSON.stringify(a.j)));

    /* ── 4 · the other branch lead sees THEIR person, as a scout (not an emotional check-in) ── */
    const b = await agenda('coachB');
    const bobItem = (b.j.agenda || []).find(x => x.beliefId === 'bob::plateau');
    ok('4 · the teamB lead sees their own person\'s belief, raised as a SCOUT', bobItem && bobItem.register === 'scout' && bobItem.readiness === 'ripe');
    ok('4 · the teamB lead does NOT see the teamA person (no leak the other way)', !(b.j.agenda || []).some(x => x.beliefId === 'joe::momentum_drop') && !/joe|Joe|teamA|momentum/i.test(JSON.stringify(b.j)));

    /* ── 5 · the top leader sees the whole subtree ── */
    const c = await agenda('ceo');
    const ids = new Set((c.j.agenda || []).map(x => x.beliefId));
    ok('5 · the top leader\'s agenda spans both branches', ids.has('joe::momentum_drop') && ids.has('bob::plateau'));
    ok('5 · counts report ripe vs held honestly', c.j.counts && c.j.counts.total === 2 && c.j.counts.ripe === 2 && c.j.counts.held === 0);

    /* ── 6 · leader-safe projection — no evidence basis / support records / node scope ── */
    ok('6 · the projection leaks no evidence basis, support records, or node scope', !/"support":|"counter":|"basis"|nodeScope|"firstSeen"|"lastSeen"|\d\.\d\s*\/\s*5/.test(JSON.stringify([a.j, b.j, c.j])));

    /* ── 7 · every proposal is proposal-gated ── */
    ok('7 · all proposals across leaders require human confirmation', [a.j, b.j, c.j].every(v => (v.proposals || []).every(pr => pr.requiresConfirmation === true)));

    /* ── 8 · deterministic read (throttled tick returns a stable ledger) ── */
    const a2 = await agenda('coachA');
    ok('8 · identical scoped reads → identical agenda', JSON.stringify(a2.j.agenda) === JSON.stringify(a.j.agenda));

    /* ── 9 · calibration — every agenda item carries an honest reliability label ── */
    ok('9 · agenda items carry a Confidence-Engine reliability label (calibrating until earned)', joeItem && joeItem.reliability === 'calibrating');

    /* ── 10 · feedback is leader-gated + SCOPED — you can only judge a belief you may see ── */
    const cross = await feedback('coachB', 'joe::momentum_drop', 'dismissed');
    ok('10 · a leader cannot give feedback on another branch\'s belief (403)', cross.status === 403);
    const bad = await feedback('coachA', 'joe::momentum_drop', 'lol');
    ok('10 · an invalid response is rejected (400)', bad.status === 400);
    const missing = await feedback('coachA', 'nobody::nothing', 'useful');
    ok('10 · feedback on an unknown belief is a 404', missing.status === 404);

    /* ── 11 · "dismissed" stands the belief down — the reasoner stops raising it (no nag) ── */
    const dis = await feedback('coachA', 'joe::momentum_drop', 'dismissed');
    ok('11 · dismissal is accepted', dis.status === 200 && dis.j.ok === true);
    const afterDismiss = await agenda('coachA');
    ok('11 · the dismissed belief is no longer raised to that leader', !(afterDismiss.j.agenda || []).some(x => x.beliefId === 'joe::momentum_drop'));

    /* ── 12 · "useful" re-engages it (the loop runs both ways) ── */
    await feedback('coachA', 'joe::momentum_drop', 'useful');
    const afterUseful = await agenda('coachA');
    ok('12 · marking it useful brings it back to the agenda', (afterUseful.j.agenda || []).some(x => x.beliefId === 'joe::momentum_drop'));

    /* ── 13 · the SUBJECT can see what's believed about them — their own read only ── */
    const me = async who => { const r = await fetch(base + '/api/reason/me', { headers: { Authorization: `Bearer ${tok[who]}` } }); return { status: r.status, j: await r.json() }; };
    const joeMe = await me('joe');
    ok('13 · a person sees the belief about themselves, self-phrased', joeMe.j.ok && (joeMe.j.beliefs || []).some(b => b.beliefId === 'joe::momentum_drop' && /^your |^you/i.test(b.claim)));
    ok('13 · they see ONLY their own — never another person\'s', (joeMe.j.beliefs || []).every(b => b.beliefId.startsWith('joe::')));
    ok('13 · the self-view withholds leader-facing fields (urgency/register/challenge)', (joeMe.j.beliefs || []).every(b => !('urgency' in b) && !('register' in b) && !('challenge' in b) && !('severity' in b)));

    /* ── 14 · the subject can CONTEST (rectification), but only contest ── */
    const notMine = await feedback('joe', 'bob::plateau', 'wrong');
    ok('14 · a person cannot touch a belief about someone else (403)', notMine.status === 403);
    const overreach = await feedback('joe', 'joe::momentum_drop', 'useful');
    ok('14 · a subject may only CONTEST their own belief, not judge it useful (403)', overreach.status === 403 && /contest/.test(JSON.stringify(overreach.j)));
    const contest = await feedback('joe', 'joe::momentum_drop', 'wrong');
    ok('14 · a subject CAN say a belief about them is wrong', contest.status === 200 && contest.j.by === 'subject');
    const joeMe2 = await me('joe');
    ok('14 · once contested, it stops being asserted about them', !(joeMe2.j.beliefs || []).some(b => b.beliefId === 'joe::momentum_drop'));
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nreason-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
