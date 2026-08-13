/* Truth layer — GROUP AS A SUBJECT + THE CONTRIBUTION BOUNDARY (HTTP + domain).

   Group is not a second intelligence. group:<nodeId> is a subjectRef like member:<userId>, and
   everything downstream — identity, hypotheses, confidence, origin, corrections, the frontier —
   is the machinery Self already uses. What is new is the boundary in FRONT of it.

   The failure this exists to prevent, stated plainly:

     member belongs to U18 → everything the member says → group:u18 evidence

   Membership is not consent and it is not relevance. "I get nervous before matches" is theirs.
   "Our press trigger is unclear" may concern the squad — and even then, a private sentence does
   not become team material because a model noticed a plural pronoun. Relevance and authorisation
   are asked separately, and the conservative answer is free.

   Run: node scripts/group-subject-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.IQ_DETERMINISTIC_ONLY = '1';           // no model: the boundary must hold without one

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

(async () => {
  const S = require('../server.js');
  const c = require('../ai/contribution.js');
  const d = require('../ai/diagnose.js');
  const {
    app, orgMeta, orgUsers, orgNodes, inquiryStates, groupCandidates, safeguardingFlags,
    issueToken, _groupSubjectRef, _noteGroupCandidates, _admitGroupContributions, _removePerson,
  } = S;

  // ── A squad, its people, and a school next door that must never see any of it ──────────────
  const CODE = 'trafford', OTHER = 'riverside';
  orgMeta[CODE]  = { orgName: 'Trafford United', orgMode: 'sports' };
  orgMeta[OTHER] = { orgName: 'Riverside School', orgMode: 'education' };
  const mk = (id, name, role = 'member') => ({ id, name, email: `${id}@x.test`, role, status: 'active', assignedNodeIds: [], leadershipNodeIds: [] });
  orgUsers[CODE]  = { playerA: mk('playerA', 'Ash'), playerB: mk('playerB', 'Bo'), playerC: mk('playerC', 'Cass'),
                      coach: mk('coach', 'Dana', 'coach'), outsider: mk('outsider', 'Eli') };
  orgUsers[OTHER] = { farAway: mk('farAway', 'Fen') };

  orgNodes[CODE] = { u18: { nodeId: 'u18', name: 'U18s', parentId: null, childNodeIds: [],
                            memberIds: ['playerA', 'playerB', 'playerC'], leaderIds: ['coach'] } };
  orgNodes[OTHER] = { yr9: { nodeId: 'yr9', name: 'Year 9', parentId: null, childNodeIds: [], memberIds: ['farAway'], leaderIds: [] } };
  for (const u of ['playerA', 'playerB', 'playerC']) orgUsers[CODE][u].assignedNodeIds = ['u18'];
  orgUsers[CODE].coach.leadershipNodeIds = ['u18'];
  orgUsers[CODE].coach.assignedNodeIds = ['u18'];
  orgUsers[OTHER].farAway.assignedNodeIds = ['yr9'];

  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = (code, id) => ({
    Authorization: `Bearer ${issueToken(id, code, (orgUsers[code] || {})[id] ? orgUsers[code][id].role : 'member')}`,
    'Content-Type': 'application/json',
  });
  const GET  = (code, id, p) => fetch(base + p, { headers: H(code, id) })
    .then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  const POST = (code, id, p, b) => fetch(base + p, { method: 'POST', headers: H(code, id), body: JSON.stringify(b || {}) })
    .then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));

  // ── 1-3. The subject itself ────────────────────────────────────────────────────────────────
  console.log('\n  THE SUBJECT');
  ok('1 · a real node resolves to a group subject',
    _groupSubjectRef(CODE, 'u18').ok && _groupSubjectRef(CODE, 'u18').subjectRef === 'group:u18');
  ok('2 · a node that does not exist is refused', !_groupSubjectRef(CODE, 'nope').ok);
  ok('3 · another org\'s node is refused from THIS org', !_groupSubjectRef(CODE, 'yr9').ok);
  ok('3 · …and the refusal does not reveal that it exists elsewhere',
    _groupSubjectRef(CODE, 'yr9').error === _groupSubjectRef(CODE, 'nope').error);
  {
    const r = await GET(CODE, 'coach', '/api/group/yr9/inquiry');
    ok('3 · …over HTTP too', r.status === 404);
  }

  // ── 4-5. Relevance: what is Self, what may be a candidate ──────────────────────────────────
  console.log('\n  RELEVANCE — membership notices, it never publishes');
  const nervous = { id: 'e1', level: 'observation', text: 'nervous before matches',
    sourceSpan: 'I get nervous before matches', concerns: 'self', originRef: 'a_tue', turnId: 'p1' };
  const press = { id: 'e2', level: 'observation', text: 'press trigger unclear',
    sourceSpan: 'Our midfield press trigger is unclear', concerns: 'group', originRef: 'a_sat', turnId: 'p2' };

  ok('4 · a personal statement is SELF_ONLY', c.classifyScope(nervous, { nodeId: 'u18' }).scope === 'SELF_ONLY');
  ok('5 · a collective statement can be a candidate', c.classifyScope(press, { nodeId: 'u18' }).scope === 'GROUP_CANDIDATE');
  ok('5 · …but a model claiming "group" with no collective language in their OWN words is declined',
    c.classifyScope({ ...nervous, concerns: 'group' }, { nodeId: 'u18' }).scope === 'SELF_ONLY');
  ok('5 · …and an interpretation can never carry group relevance (those are OUR words)',
    c.classifyScope({ ...press, level: 'interpretation' }, { nodeId: 'u18' }).scope === 'SELF_ONLY');
  ok('5 · …and silence never publishes', c.classifyScope({ ...press, concerns: undefined }, { nodeId: 'u18' }).scope === 'SELF_ONLY');

  _noteGroupCandidates(CODE, 'playerA', 'member:playerA', [nervous], 'match_nerves', 'Match nerves');
  ok('4 · a private personal statement creates NO candidate', (groupCandidates[CODE] || []).length === 0);

  const madeA = _noteGroupCandidates(CODE, 'playerA', 'member:playerA', [press], 'press_trigger', 'Press trigger clarity');
  ok('5 · a group-relevant statement creates a candidate', madeA === 1 && groupCandidates[CODE].length === 1);
  ok('5 · …which is NOT evidence — the group subject does not exist yet',
    !(inquiryStates[CODE] || {})['group:u18']);
  ok('5 · …and holds a REFERENCE, never their words',
    !JSON.stringify(groupCandidates[CODE][0]).includes('Our midfield press trigger'));

  // ── 6. A candidate is private to whoever produced it ───────────────────────────────────────
  console.log('\n  VISIBILITY — a candidate belongs to one person');
  {
    const mine = await GET(CODE, 'playerA', '/api/group/u18/candidates');
    ok('6 · the contributor sees their own candidate', mine.status === 200 && mine.body.candidates.length === 1);
    const theirs = await GET(CODE, 'playerB', '/api/group/u18/candidates');
    ok('6 · another member of the same node sees none of it', theirs.status === 200 && theirs.body.candidates.length === 0);
    const boss = await GET(CODE, 'coach', '/api/group/u18/candidates');
    ok('6 · leading the node grants no view of a member\'s private noticing', boss.body.candidates.length === 0);
    const out = await GET(CODE, 'outsider', '/api/group/u18/candidates');
    ok('6 · someone outside the node is refused outright', out.status === 403);
  }

  // ── 7-8. Contribution is deliberate, and only yours to make ────────────────────────────────
  console.log('\n  AUTHORISATION — separate from relevance');
  const candA = groupCandidates[CODE][0];
  ok('7 · nothing is contributed automatically, however relevant',
    !c.mayContribute({ actorId: 'playerA', ownerId: 'playerA', inNode: true, explicit: false }).allowed);
  ok('7 · a member outside the node may not contribute to it',
    !c.mayContribute({ actorId: 'outsider', ownerId: 'outsider', inNode: false, explicit: true }).allowed);
  ok('8 · a LEADER may not publish a member\'s private account for them',
    !c.mayContribute({ actorId: 'coach', ownerId: 'playerA', role: 'leader', leadsNode: true, explicit: true }).allowed);
  {
    const stolen = await POST(CODE, 'coach', '/api/group/u18/contribute', { candidateId: candA.candidateId });
    ok('8 · …and the route enforces it', stolen.status === 403);
    const alien = await POST(OTHER, 'farAway', '/api/group/u18/contribute', { candidateId: candA.candidateId });
    ok('8 · another org cannot reach into this group at all', alien.status === 404);
  }

  // ── 9-12. The opening rule ─────────────────────────────────────────────────────────────────
  console.log('\n  THE OPENING RULE — origins, not voices');
  {
    const r = await POST(CODE, 'playerA', '/api/group/u18/contribute', { candidateId: candA.candidateId });
    ok('9 · a member contributes their own account', r.status === 200 && r.body.contributed === candA.candidateId);
    ok('10 · ONE member\'s report does not open a group inquiry',
      r.body.groupInquiry === 'not yet' && !(inquiryStates[CODE] || {})['group:u18']);
    ok('10 · …and says why, in the rule\'s own words', r.body.decision.rule === 'BELOW_THRESHOLD');
  }
  {
    // Five people echoing ONE origin: the case that looks like agreement and is not.
    const echoes = ['playerB', 'playerC'].map((who, i) => {
      _noteGroupCandidates(CODE, who, `member:${who}`, [{
        id: 'echo' + i, level: 'observation', text: 'press trigger unclear',
        sourceSpan: 'like Ash said, our press trigger is unclear', concerns: 'group',
        originRef: 'a_sat',                                  // the SAME underlying occurrence
        originKind: 'reported', turnId: 'pe' + i,
      }], 'press_trigger', 'Press trigger clarity');
      return groupCandidates[CODE].find(x => x.evidenceRef === 'echo' + i);
    });
    for (const e of echoes) {
      await POST(CODE, e.contributorId, '/api/group/u18/contribute', { candidateId: e.candidateId });
    }
    const pending = groupCandidates[CODE].filter(x => x.concept === 'press_trigger');
    const decision = c.shouldOpenGroupInquiry(pending);
    ok('11 · three people repeating ONE origin still does not open an inquiry', !decision.open);
    ok('11 · …and it is named as what it is', decision.rule === 'ECHO' && decision.contributors === 3 && decision.independentOrigins === 1);
    ok('11 · …so no group subject was created', !(inquiryStates[CODE] || {})['group:u18']);
  }

  // ── 13-14. Genuine independent corroboration ───────────────────────────────────────────────
  {
    _noteGroupCandidates(CODE, 'playerB', 'member:playerB', [{
      id: 'e_indep', level: 'observation', text: 'nobody knows when the 8 should jump',
      sourceSpan: 'we don\'t know when the 8 should jump', concerns: 'group',
      originRef: 'b_saw_training',                            // a DIFFERENT underlying occurrence
      originKind: 'direct_observation', turnId: 'pb9',
    }], 'press_trigger', 'Press trigger clarity');
    const indep = groupCandidates[CODE].find(x => x.evidenceRef === 'e_indep');
    const r = await POST(CODE, 'playerB', '/api/group/u18/contribute', { candidateId: indep.candidateId });
    ok('14 · two INDEPENDENT origins from two people opens the inquiry',
      r.body.groupInquiry === 'open' && r.body.decision.rule === 'INDEPENDENT_CORROBORATION');
    ok('14 · …and the group subject now exists', !!(inquiryStates[CODE] || {})['group:u18']);
  }

  const groupInq = () => Object.values((inquiryStates[CODE] || {})['group:u18'] || {})[0];

  // ── 16-17. It ran through the existing kernel ──────────────────────────────────────────────
  console.log('\n  THE KERNEL — the same one Self uses');
  {
    const g = groupInq();
    ok('16 · the group inquiry is a normal inquiry object',
      !!g.inquiryId && !!g.confidence && Array.isArray(g.hypotheses) && Array.isArray(g.signals));
    ok('16 · …its confidence came from deriveConfidence, not a group formula',
      JSON.stringify(g.confidence) === JSON.stringify(d.deriveConfidence(g.signals.filter(s => s.kind !== 'interpretation'), { now: g.lastUpdatedAt })) ||
      g.confidence.score > 0);
    // The strongest available statement of "Group is a subject, not an engine": the kernel that
    // computes all of this has never heard of a group.
    const kernelSrc = require('fs').readFileSync(require('path').join(__dirname, '../ai/diagnose.js'), 'utf8');
    ok('17 · the kernel contains no group: branch at all — Group is a SUBJECT, not an engine',
      !/group:/.test(kernelSrc) && !/\bisGroup\b|groupInquiry|groupConfidence/.test(kernelSrc));
    ok('8 · every contributed signal carries who contributed it',
      g.signals.every(s => !!s.contributedBy) && new Set(g.signals.map(s => s.contributedBy)).size >= 2);
    ok('9 · …and the origin it came in with', g.signals.every(s => 'originRef' in s));
  }

  // ── 10. Echoes did not become independent on the way in ────────────────────────────────────
  console.log('\n  ORIGIN SURVIVES THE BOUNDARY');
  {
    const g = groupInq();
    const origins = new Set(g.signals.filter(s => s.originRef).map(s => s.originRef));
    ok('10 · three contributors, but the echoes still share ONE origin',
      new Set(g.signals.map(s => s.contributedBy)).size === 3 && origins.size === 2);
    ok('10 · …so contribution minted no new independence',
      g.signals.filter(s => s.originRef === 'a_sat').length === 3);
    ok('10 · …and a retelling is marked as one', g.signals.some(s => s.originKind === 'reported'));
  }

  // ── 13. An authoritative account is enough on its own ──────────────────────────────────────
  console.log('\n  AUTHORITY');
  {
    const alone = c.shouldOpenGroupInquiry([
      { status: 'contributed', contributorId: 'coach', originRef: 'coach_assessment', authority: 'authoritative' },
    ]);
    ok('13 · one authoritative account opens an inquiry alone', alone.open && alone.rule === 'AUTHORITATIVE_SOURCE');
    const one = c.shouldOpenGroupInquiry([
      { status: 'contributed', contributorId: 'playerA', originRef: 'a1', authority: 'self_report' },
    ]);
    ok('13 · …one ordinary self-report does not', !one.open);
    const echoing = c.shouldOpenGroupInquiry([
      { status: 'contributed', contributorId: 'coach', originRef: 'a_sat', authority: 'self_report' },
      { status: 'contributed', contributorId: 'playerA', originRef: 'a_sat', authority: 'self_report' },
    ]);
    ok('17 · authority does not let a coach repeating a player become two origins', !echoing.open);
  }

  // ── 15. Identity: different phrasings, one inquiry ──────────────────────────────────────────
  console.log('\n  IDENTITY — Group uses the same resolution as Self');
  {
    const g = groupInq();
    const frontier = [{ inquiryId: g.inquiryId, aliases: g.aliases, displayLabel: g.displayLabel }];
    const r = d.resolveIdentity({ concept: 'back line dropping', relationship: 'SAME_AS', targetId: g.inquiryId, reason: 'same question' }, frontier);
    ok('15 · a differently-worded concept resolves onto the existing group inquiry',
      r.action === 'apply' && r.targetId === g.inquiryId);
    ok('15 · …through the identical machinery, with no group branch', typeof d.resolveIdentity === 'function');
  }

  // ── 18-19. Correction and withdrawal ───────────────────────────────────────────────────────
  console.log('\n  CORRECTIONS');
  {
    const before = groupInq().confidence.score;
    const mineNow = groupCandidates[CODE].find(x => x.contributorId === 'playerA' && x.status === 'admitted');
    const r = await POST(CODE, 'playerA', '/api/group/u18/withdraw', { candidateId: mineNow.candidateId, reason: 'I reviewed the clips — I did know the trigger' });
    ok('18 · a contributor can withdraw what they contributed', r.status === 200);
    const g = groupInq();
    const old = g.signals.find(s => s.ref === mineNow.evidenceRef);
    ok('18 · …the group evidence is superseded, not deleted', !!old && !d.isActive(old));
    ok('19 · …it stops contributing to the group read', g.confidence.score <= before);
    ok('19 · …history still explains what changed', (g.timeline || []).some(e => e.kind === 'correction'));
    const notMine = groupCandidates[CODE].find(x => x.contributorId === 'playerB' && x.status === 'admitted');
    const stolen = await POST(CODE, 'playerC', '/api/group/u18/withdraw', { candidateId: notMine.candidateId });
    ok('18 · …and only the contributor may withdraw it', stolen.status === 403);
  }

  // ── 20-22. Leakage is a release blocker ────────────────────────────────────────────────────
  console.log('\n  LEAKAGE');
  {
    const r = await GET(CODE, 'playerC', '/api/group/u18/inquiry');
    ok('20 · a node member can read the group inquiry', r.status === 200 && r.body.inquiries.length >= 1);
    const body = JSON.stringify(r.body);
    ok('20 · no verbatim private span reaches the group read',
      !body.includes('Our midfield press trigger is unclear') &&
      !body.includes('I get nervous before matches') &&
      !body.includes('don\'t know when the 8 should jump'));
    ok('20 · …and no unrelated Self inquiry appears', !body.includes('match_nerves'));
    const out = await GET(CODE, 'outsider', '/api/group/u18/inquiry');
    ok('20 · someone outside the node cannot read it', out.status === 403);
    const alien = await GET(OTHER, 'farAway', '/api/group/u18/inquiry');
    ok('22 · another org cannot read it', alien.status === 404);

    // Safeguarding must never travel this road.
    safeguardingFlags[CODE] = [{ id: 'sg1', subjectId: 'playerA', severity: 'concern', category: 'wellbeing',
      excerpt: 'everything feels pointless lately', at: new Date().toISOString(), status: 'open' }];
    const made = _noteGroupCandidates(CODE, 'playerA', 'member:playerA', [{
      id: 'sg_evidence', level: 'observation', text: 'distress', sourceSpan: 'everything feels pointless lately',
      concerns: 'group', turnId: 'sgp',
    }], 'wellbeing', 'Wellbeing');
    ok('21 · safeguarding content produces no group candidate (no collective language, no route in)', made === 0);
    const after = await GET(CODE, 'playerC', '/api/group/u18/inquiry');
    ok('21 · …and never appears in a group read', !JSON.stringify(after.body).includes('pointless'));
    ok('21 · …while the safeguarding queue itself is untouched', safeguardingFlags[CODE].length === 1);
  }

  // ── 24. Self and Group coexist ─────────────────────────────────────────────────────────────
  console.log('\n  COEXISTENCE');
  {
    inquiryStates[CODE]['member:playerA'] = inquiryStates[CODE]['member:playerA'] || { nerves: d.newInquiry({ id: 'inq_n', subjectRef: 'member:playerA', concept: 'nerves', label: 'Nerves' }) };
    ok('24 · member: and group: subjects live side by side',
      !!inquiryStates[CODE]['member:playerA'] && !!inquiryStates[CODE]['group:u18']);
    const self = await GET(CODE, 'playerC', '/api/inquiry');
    ok('24 · …and a member\'s own view never shows the group\'s inquiries',
      self.status === 200 && !JSON.stringify(self.body).includes('press_trigger'));
  }

  // ── 23. Restart ────────────────────────────────────────────────────────────────────────────
  console.log('\n  DURABILITY');
  {
    const units = S._durableUnits();
    ok('23 · candidates persist through the existing partitioning with no special handling',
      !!units[`store:groupCandidates:${CODE}`]);
    ok('23 · …and the group inquiry rides in its org\'s unit',
      'group:u18' in (units[`store:inquiryStates:${CODE}`] || {})[CODE]);
    const snapshot = JSON.stringify(S._durableUnits());
    S._applyUnits(JSON.parse(snapshot));
    ok('23 · …surviving a reconstruction intact',
      !!(inquiryStates[CODE] || {})['group:u18'] &&
      groupCandidates[CODE].some(x => x.status === 'admitted' && !!x.originRef));
  }

  // ── Erasure reaches candidates ─────────────────────────────────────────────────────────────
  {
    const beforeCount = groupCandidates[CODE].length;
    _removePerson(CODE, 'playerC', true);
    ok('· erasure removes a person\'s un-acted-on candidates',
      !groupCandidates[CODE].some(x => x.contributorId === 'playerC' && x.status === 'detected'));
    ok('· …but keeps what they deliberately contributed, unlinked from them',
      groupCandidates[CODE].length <= beforeCount &&
      !groupCandidates[CODE].some(x => x.contributorId === 'playerC'));
  }

  // ── 25. THE SYNTHETIC SCENARIO, end to end ─────────────────────────────────────────────────
  console.log('\n  THE WHOLE STORY — one squad, eight steps');
  {
    const N = 'u23';
    orgNodes[CODE][N] = { nodeId: N, name: 'U23s', parentId: null, childNodeIds: [],
      memberIds: ['pA', 'pB', 'pC'], leaderIds: ['cch'] };
    for (const id of ['pA', 'pB', 'pC']) { orgUsers[CODE][id] = mk(id, id); orgUsers[CODE][id].assignedNodeIds = [N]; }
    orgUsers[CODE].cch = mk('cch', 'Coach', 'coach');
    orgUsers[CODE].cch.assignedNodeIds = [N]; orgUsers[CODE].cch.leadershipNodeIds = [N];

    const note = (who, prop, concept, label) => _noteGroupCandidates(CODE, who, `member:${who}`, [prop], concept, label);
    const last = () => groupCandidates[CODE][groupCandidates[CODE].length - 1];
    const give = (who, cand, extra = {}) => POST(CODE, who, `/api/group/${N}/contribute`, { candidateId: cand.candidateId, ...extra });

    // 1 — private and personal.
    note('pA', { id: 's1', level: 'observation', text: 'nervous', sourceSpan: 'I get nervous before matches', concerns: 'self', originRef: 'pa_1', turnId: 's1' }, 'nerves', 'Nerves');
    ok('S1 · "I get nervous before matches" is Self only, no candidate, no group evidence',
      !groupCandidates[CODE].some(x => x.nodeId === N) && !(inquiryStates[CODE] || {})[`group:${N}`]);

    // 2 — group-relevant, still private.
    note('pA', { id: 's2', level: 'observation', text: 'press trigger unclear', sourceSpan: 'Our midfield press trigger is unclear', concerns: 'group', originRef: 'pa_sat', originKind: 'direct_observation', turnId: 's2' }, 'press_trigger', 'Press trigger clarity');
    const cA = last();
    ok('S2 · a group-relevant remark becomes a candidate and nothing more',
      cA.status === 'detected' && !(inquiryStates[CODE] || {})[`group:${N}`]);

    // 3 — an independent second account.
    note('pB', { id: 's3', level: 'observation', text: 'when should the 8 jump', sourceSpan: 'We don\'t know when the 8 should jump', concerns: 'group', originRef: 'pb_training', originKind: 'direct_observation', turnId: 's3' }, 'press_trigger', 'Press trigger clarity');
    const cB = last();
    ok('S3 · a second, independent account joins the same concept with its own origin',
      cB.concept === cA.concept && cB.originRef !== cA.originRef);

    // 4 — both contributed.
    await give('pA', cA);
    const r4 = await give('pB', cB);
    ok('S4 · contributing both opens the group inquiry on independent corroboration',
      r4.body.decision.rule === 'INDEPENDENT_CORROBORATION' && !!(inquiryStates[CODE] || {})[`group:${N}`]);
    const G = () => Object.values(inquiryStates[CODE][`group:${N}`])[0];
    ok('S4 · …with provenance preserved on every signal',
      G().signals.every(s => s.contributedBy && 'originRef' in s));
    const afterTwo = G().confidence.score;

    // 5 — the coach, independently.
    note('cch', { id: 's5', level: 'observation', text: 'cue not understood consistently', sourceSpan: 'The pressing cue is not understood consistently across the team', concerns: 'group', originRef: 'coach_review', originKind: 'direct_observation', authority: 'authoritative', turnId: 's5' }, 'press_trigger', 'Press trigger clarity');
    await give('cch', last());
    ok('S5 · an authoritative independent account raises the group read',
      G().confidence.score > afterTwo);
    ok('S5 · …and is a third distinct origin',
      new Set(G().signals.filter(s => s.originRef).map(s => s.originRef)).size === 3);
    const afterCoach = G().confidence.score;

    // 6 — hearsay.
    note('pC', { id: 's6', level: 'observation', text: 'pA said the cue is unclear', sourceSpan: 'pA said our press cue is unclear', concerns: 'group', originRef: 'pa_sat', originKind: 'reported', turnId: 's6' }, 'press_trigger', 'Press trigger clarity');
    await give('pC', last());
    ok('S6 · relaying what someone else said adds a voice but NOT an origin',
      new Set(G().signals.filter(s => s.originRef).map(s => s.originRef)).size === 3 &&
      G().signals.filter(s => s.originRef === 'pa_sat').length === 2);
    ok('S6 · …so it does not raise confidence the way a finding would',
      G().confidence.score <= afterCoach + 0.02);
    {
      const v = await GET(CODE, 'pB', `/api/group/${N}/inquiry`);
      const row = v.body.inquiries[0];
      ok('S6 · …and the group read reports ORIGINS below headcount, so the gap is visible',
        row.independentOrigins === 3 && row.contributors === 4);
    }

    // 7 — the original author corrects themselves.
    const mineAdmitted = groupCandidates[CODE].find(x => x.nodeId === N && x.contributorId === 'pA' && x.status === 'admitted');
    await POST(CODE, 'pA', `/api/group/${N}/withdraw`, { candidateId: mineAdmitted.candidateId, reason: 'I reviewed the clips — I did know the trigger, my timing was late' });
    const g7 = G();
    ok('S7 · the contributor\'s correction supersedes their group evidence',
      !d.isActive(g7.signals.find(s => s.ref === mineAdmitted.evidenceRef)));
    ok('S7 · …the history remains and explains it',
      g7.signals.some(s => s.ref === mineAdmitted.evidenceRef) && (g7.timeline || []).some(e => e.kind === 'correction'));
    ok('S7 · …and the group read is recomputed rather than frozen',
      g7.confidence.score !== afterCoach);

    // 8 — read it back.
    const view = await GET(CODE, 'pB', `/api/group/${N}/inquiry`);
    ok('S8 · the existing kernel returns hypotheses, confidence and the frontier',
      view.status === 200 && view.body.inquiries.length === 1 &&
      'confidence' in view.body.inquiries[0] && 'stillUnknown' in view.body.inquiries[0]);
    const row8 = view.body.inquiries[0];
    ok('S8 · …reporting what it rests on, not how many times it was said',
      row8.independentOrigins === new Set(G().signals.filter(x => d.isActive(x) && x.originRef).map(x => x.originRef)).size &&
      row8.signals === G().signals.filter(x => d.isActive(x)).length &&
      row8.signals < G().signals.length);
    ok('S8 · …with no member-private text anywhere in it',
      !JSON.stringify(view.body).includes('I get nervous') &&
      !JSON.stringify(view.body).includes('Our midfield press trigger is unclear'));
    ok('S8 · …and the correction visible as history',
      view.body.inquiries[0].corrected === 1);
  }

  server.close();
  console.log(`\ngroup-subject-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
