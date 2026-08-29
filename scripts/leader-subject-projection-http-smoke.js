/* D27/D38 — a leader can be the subject, never the attributable target.
   Real HTTP proof over the existing team-state boundary. */
'use strict';
process.env.DB_OPTIONAL = '1';
process.env.IQ_DETERMINISTIC_ONLY = '1';
let pass = 0, fail = 0;
const ok = (name, condition) => { if (condition) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } };
(async () => {
  const S = require('../server');
  const { app, orgMeta, orgUsers, orgNodes, inquiryStates, groupCandidates, issueToken } = S;
  const code = 'leaderguard';
  const user = (id, role = 'member') => ({ id, name: id, email: `${id}@test.invalid`, role, status: 'active', assignedNodeIds: [], leadershipNodeIds: [] });
  orgMeta[code] = { orgName: 'Leader Guard' };
  orgUsers[code] = { boss: user('boss', 'admin'), coach: user('coach', 'coach') };
  for (let i = 1; i <= 14; i++) orgUsers[code][`p${i}`] = user(`p${i}`);
  orgNodes[code] = {
    root: { nodeId: 'root', parentId: null, childNodeIds: ['team'], memberIds: [], leaderIds: ['boss'] },
    team: { nodeId: 'team', parentId: 'root', childNodeIds: [], memberIds: Array.from({ length: 14 }, (_, i) => `p${i + 1}`), leaderIds: ['coach'] },
    /* Two more nodes, so the assertions added below cannot disturb the four above. */
    team2: { nodeId: 'team2', parentId: 'root', childNodeIds: [], memberIds: Array.from({ length: 14 }, (_, i) => `p${i + 1}`), leaderIds: ['coach'] },
    team3: { nodeId: 'team3', parentId: 'root', childNodeIds: [], memberIds: Array.from({ length: 14 }, (_, i) => `p${i + 1}`), leaderIds: ['coach'] },
  };
  orgUsers[code].boss.leadershipNodeIds = ['root']; orgUsers[code].coach.leadershipNodeIds = ['team'];
  for (let i = 1; i <= 14; i++) orgUsers[code][`p${i}`].assignedNodeIds = ['team', 'team2', 'team3'];
  const contributorIds = ['p1', 'p2', 'p3', 'p4', 'p5'];
  inquiryStates[code] = { 'group:team': { organisation: {
    inquiryId: 'inq_leader_subject', subjectRef: 'member:coach', topic: { canonicalConcept: 'session_organisation', label: 'session organisation' },
    hypotheses: [{ id: 'h1', statement: 'Pat said Coach Lee made training chaotic for exactly three weeks', confidence: { band: 'probable' }, status: 'active' }], leadingHypothesisId: 'h1',
    signals: contributorIds.map((id, i) => ({ ref: `e${i}`, kind: 'observation', originRef: `origin${i}`, contributedBy: id, contributorVisibility: 'named', at: i + 1, status: 'active' })),
    missingSignals: [{ question: 'Ask Pat whether Coach Lee said it after Tuesday training' }],
    falsifiers: [{ statement: 'Pat retracts the exact chaotic-training account' }],
    confidence: { score: 0.7, band: 'probable', because: [] }, status: 'probable', timeline: [], lastUpdatedAt: 10,
  } } };
  /* team2 — a GROUP-subject inquiry whose five contributors are all ANONYMOUS. This is the case
     that proves L-D38: anonymity changes attribution, never counting. Before D38 flipped the
     default, `contributors` mapped every anonymous signal to the single string '(anonymous)', so
     five people counted as ONE — which fails MIN_COHORT and would silently stop every group High
     and Low from ever surfacing again. Nothing tested it. */
  inquiryStates[code]['group:team2'] = { organisation: {
    inquiryId: 'inq_group_anon', subjectRef: 'group:team2', topic: { canonicalConcept: 'warmups', label: 'warm-ups' },
    hypotheses: [{ id: 'h2', statement: 'the warm-up is starting late', confidence: { band: 'probable' }, status: 'active' }], leadingHypothesisId: 'h2',
    signals: contributorIds.map((id, i) => ({ ref: `a${i}`, kind: 'observation', originRef: `anonorigin${i}`, contributedBy: id, contributorVisibility: 'anonymous', at: i + 1, status: 'active' })),
    missingSignals: [{ question: 'Whether the pitch is free earlier' }], falsifiers: [],
    confidence: { score: 0.7, band: 'probable', because: [] }, status: 'probable', timeline: [], lastUpdatedAt: 10,
  } };
  /* team3 — a `member:` subject who is NOT a known user. Codex made this FAIL CLOSED: an
     unidentifiable person gets the same retaliation protection as a leader. Untested until now,
     and a fail-open regression here is invisible. */
  inquiryStates[code]['group:team3'] = { organisation: {
    inquiryId: 'inq_ghost_subject', subjectRef: 'member:ghost', topic: { canonicalConcept: 'handover', label: 'handover' },
    hypotheses: [{ id: 'h3', statement: 'ghostly specifics that must not be shown', confidence: { band: 'probable' }, status: 'active' }], leadingHypothesisId: 'h3',
    signals: contributorIds.map((id, i) => ({ ref: `g${i}`, kind: 'observation', originRef: `ghostorigin${i}`, contributedBy: id, contributorVisibility: 'named', at: i + 1, status: 'active' })),
    missingSignals: [{ question: 'ghostly unknown that must not be shown' }], falsifiers: [],
    confidence: { score: 0.7, band: 'probable', because: [] }, status: 'probable', timeline: [], lastUpdatedAt: 10,
  } };
  groupCandidates[code] = [
    ...contributorIds.map((id, i) => ({ candidateId: `c${i}`, nodeId: 'team', concept: 'session_organisation', contributorId: id, status: 'admitted', valence: 'worth_attention' })),
    ...contributorIds.map((id, i) => ({ candidateId: `w${i}`, nodeId: 'team2', concept: 'warmups', contributorId: id, status: 'admitted', valence: 'worth_attention' })),
    ...contributorIds.map((id, i) => ({ candidateId: `h${i}`, nodeId: 'team3', concept: 'handover', contributorId: id, status: 'admitted', valence: 'worth_attention' })),
  ];
  const server = app.listen(0); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const getNode = async (node, id) => { const r = await fetch(`${base}/api/group/${node}/state`, { headers: { Authorization: `Bearer ${issueToken(id, code, orgUsers[code][id].role)}` } }); return { status: r.status, body: await r.json() }; };
  const get = async id => { const r = await fetch(`${base}/api/group/team/state`, { headers: { Authorization: `Bearer ${issueToken(id, code, orgUsers[code][id].role)}` } }); return { status: r.status, body: await r.json() }; };
  try {
    const subject = await get('coach'), manager = await get('boss'), teammate = await get('p1');
    ok('L27-1 the finding routes to the subject and their own leader', subject.status === 200 && subject.body.low && manager.status === 200 && manager.body.low);
    const emitted = JSON.stringify([subject.body, manager.body]);
    ok('L27-2 no contributor identity or contributed phrasing crosses HTTP', !contributorIds.some(id => emitted.includes(id)) && !/Pat said|Pat whether|Pat retracts|Coach Lee|chaotic|three weeks/.test(emitted));
    ok('L27-3 no exact contributor, origin, or cohort count crosses HTTP', !/"contributors"\s*:\s*5|"independentOrigins"\s*:\s*5|"of"\s*:\s*14/.test(emitted) && /several people/.test(emitted));
    ok('L27-4 the subject leader own team receives no leader-subject finding', teammate.status === 200 && teammate.body.low === null && teammate.body.high === null);
    const proposal = require('../ai/contribution').toGroupProposal({
      evidenceRef: 'default-anonymous', contributorId: 'p1', concept: 'organisation',
      originRef: 'origin-default', status: 'contributed',
    });
    ok('L38-1 contribution is anonymous unless the person explicitly chooses named', proposal.contributorVisibility === 'anonymous');

    /* L-D38 — anonymity is about ATTRIBUTION, never about COUNTING. Five anonymous people are
       five contributors. Collapsing them to one voice fails the cohort floor and silently kills
       every group finding in the product, which is why this asserts on the SURFACED result
       rather than on the number: if the count collapses, nothing surfaces at all. */
    const anon = await getNode('team2', 'p1');
    ok('L38-2 five ANONYMOUS contributors still count as five, so the finding clears the floor',
      anon.status === 200 && !!anon.body.low && !JSON.stringify(anon.body).includes('anonymous'));

    /* L-D27 fail-closed. A `member:` subject nobody can identify is protected exactly like a
       leader, because "we could not tell who this is about" is not a reason to expose the people
       who spoke about them. */
    const ghost = await getNode('team3', 'p1');
    ok('L27-5 a member subject who cannot be identified FAILS CLOSED and is protected like a leader',
      ghost.status === 200 && !/ghostly/.test(JSON.stringify(ghost.body)));
  } finally { await new Promise(resolve => server.close(resolve)); }
  console.log(`\nleader-subject-projection-http-smoke: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
