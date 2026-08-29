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
  };
  orgUsers[code].boss.leadershipNodeIds = ['root']; orgUsers[code].coach.leadershipNodeIds = ['team'];
  for (let i = 1; i <= 14; i++) orgUsers[code][`p${i}`].assignedNodeIds = ['team'];
  const contributorIds = ['p1', 'p2', 'p3', 'p4', 'p5'];
  inquiryStates[code] = { 'group:team': { organisation: {
    inquiryId: 'inq_leader_subject', subjectRef: 'member:coach', topic: { canonicalConcept: 'session_organisation', label: 'session organisation' },
    hypotheses: [{ id: 'h1', statement: 'Pat said Coach Lee made training chaotic for exactly three weeks', confidence: { band: 'probable' }, status: 'active' }], leadingHypothesisId: 'h1',
    signals: contributorIds.map((id, i) => ({ ref: `e${i}`, kind: 'observation', originRef: `origin${i}`, contributedBy: id, contributorVisibility: 'named', at: i + 1, status: 'active' })),
    missingSignals: [], confidence: { score: 0.7, band: 'probable', because: [] }, status: 'probable', timeline: [], lastUpdatedAt: 10,
  } } };
  groupCandidates[code] = contributorIds.map((id, i) => ({ candidateId: `c${i}`, nodeId: 'team', concept: 'session_organisation', contributorId: id, status: 'admitted', valence: 'worth_attention' }));
  const server = app.listen(0); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async id => { const r = await fetch(`${base}/api/group/team/state`, { headers: { Authorization: `Bearer ${issueToken(id, code, orgUsers[code][id].role)}` } }); return { status: r.status, body: await r.json() }; };
  try {
    const subject = await get('coach'), manager = await get('boss'), teammate = await get('p1');
    ok('L27-1 the finding routes to the subject and their own leader', subject.status === 200 && subject.body.low && manager.status === 200 && manager.body.low);
    const emitted = JSON.stringify([subject.body.low, manager.body.low]);
    ok('L27-2 no contributor identity or contributed phrasing crosses HTTP', !contributorIds.some(id => emitted.includes(id)) && !/Pat said|Coach Lee|chaotic|three weeks/.test(emitted));
    ok('L27-3 no exact contributor, origin, or cohort count crosses HTTP', !/"contributors"\s*:\s*5|"independentOrigins"\s*:\s*5|"of"\s*:\s*14/.test(emitted) && /several people/.test(emitted));
    ok('L27-4 the subject leader own team receives no leader-subject finding', teammate.status === 200 && teammate.body.low === null && teammate.body.high === null);
    const proposal = require('../ai/contribution').toGroupProposal({
      evidenceRef: 'default-anonymous', contributorId: 'p1', concept: 'organisation',
      originRef: 'origin-default', status: 'contributed',
    });
    ok('L38-1 contribution is anonymous unless the person explicitly chooses named', proposal.contributorVisibility === 'anonymous');
  } finally { await new Promise(resolve => server.close(resolve)); }
  console.log(`\nleader-subject-projection-http-smoke: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
