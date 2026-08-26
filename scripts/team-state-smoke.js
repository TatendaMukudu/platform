/* Truth layer — THE TEAM-GRAIN SURFACE (pure + HTTP).

   The screen this exists to produce, and the only acceptance target that matters:

     Men's Soccer
     High:    Player-led communication has improved over the last two sessions.
     Low:     Substitute role clarity is emerging as something worth attention.
     Inquiry: Why does communication drop after difficult results?
     Focus:   Test player-led post-match debriefs for the next two matches.
     IntelliQ: We don't yet know whether the improvement transfers after losses.

   Assembly, not new intelligence. Everything above was established by the kernel before this
   layer ran. So the assertions below are mostly about what the surface REFUSES to say:

     · a High or a Low that rests on one origin retold is not surfaced (L-OR1)
     · a count that names the complement of the cohort is not surfaced (L-PR1, two-sided)
     · a claim the kernel rates `tentative`, or has marked disputed, is not surfaced (L-DC1)
     · valence is the contributor's, never the system's — and disagreement is contested,
       which makes it an Inquiry rather than a High somebody would dispute

   Run: node scripts/team-state-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.IQ_DETERMINISTIC_ONLY = '1';           // no model: this whole surface must work without one

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const T = require('../ai/team-state.js');

/* A group inquiry projection, shaped exactly as _groupInquiryProjections emits one. */
const inq = (o = {}) => ({
  inquiryId: o.inquiryId || 'inq_1',
  topic: { canonicalConcept: o.concept || 'communication', label: o.label || 'player-led communication', domain: '' },
  status: o.status || 'probable',
  polarity: o.polarity || T.POLARITY.NEUTRAL,
  contested: o.contested === true,
  hypothesis: o.hypothesis || 'Player-led communication has improved over the last two sessions',
  confidence: { score: o.score ?? 0.6, band: o.band || 'probable', because: [] },
  independentOrigins: o.origins ?? 3,
  contributors: o.contributors ?? 3,
  signals: o.signals ?? 4,
  corrected: 0, contradictions: o.contradictions ?? 0,
  stillUnknown: o.stillUnknown || [],
  lastUpdatedAt: o.at ?? 1000,
});

(async () => {

  // ── 1. VALENCE IS THE CONTRIBUTOR'S ────────────────────────────────────────────────────────
  console.log('\n  VALENCE — the person says which it is, the system never guesses');
  ok('1 · nobody has called it → neutral, which makes it a question not a High',
    T.valenceOf([{ status: 'admitted' }]).polarity === T.POLARITY.NEUTRAL);
  ok('1 · all in one direction → that direction',
    T.valenceOf([
      { status: 'admitted', valence: 'working_well' },
      { status: 'admitted', valence: 'working_well' },
    ]).polarity === T.POLARITY.WORKING_WELL);
  {
    const v = T.valenceOf([
      { status: 'admitted', valence: 'working_well' },
      { status: 'contributed', valence: 'worth_attention' },
    ]);
    ok('1 · called both ways → CONTESTED, and contested is neutral',
      v.contested === true && v.polarity === T.POLARITY.NEUTRAL);
    ok('1 · …and the disagreement is reported, not hidden',
      /both ways/.test(v.reason));
  }
  ok('1 · "unsure" cannot create a valence',
    T.valenceOf([{ status: 'admitted', valence: 'unsure' }, { status: 'admitted', valence: 'unsure' }])
      .polarity === T.POLARITY.NEUTRAL);
  ok('1 · "unsure" cannot contest one either',
    T.valenceOf([
      { status: 'admitted', valence: 'working_well' },
      { status: 'admitted', valence: 'unsure' },
    ]).contested === false);
  ok('1 · a candidate that was never contributed counts for nothing',
    T.valenceOf([{ status: 'detected', valence: 'worth_attention' }]).polarity === T.POLARITY.NEUTRAL);

  // ── 2. THE TWO-SIDED COHORT FLOOR ──────────────────────────────────────────────────────────
  console.log('\n  L-PR1 — a count is a disclosure in BOTH directions');
  ok('2 · 3 of 8 clears both sides', T.cohortFloor(3, 8).ok);
  ok('2 · 1 of 8 fails the low side', !T.cohortFloor(1, 8).ok);
  ok('2 · THE COMPLEMENT ATTACK: 2 of 2 satisfies k>=2 and is still refused',
    !T.cohortFloor(2, 2).ok);
  ok('2 · …and the refusal names the reason (naming k names the rest)',
    /names the rest/.test(T.cohortFloor(2, 2).reason));
  ok('2 · 3 of 4 is refused — one person left uncounted', !T.cohortFloor(3, 4).ok);
  ok('2 · 4 of 6 is the smallest shape that passes', T.cohortFloor(4, 6).ok && !T.cohortFloor(4, 5).ok);
  ok('2 · contributors cannot be their own denominator', !T.cohortFloor(3, 3).ok);
  ok('2 · more contributors than members is refused, not clamped', !T.cohortFloor(9, 8).ok);

  // ── 3. FITNESS TO BE SURFACED ──────────────────────────────────────────────────────────────
  console.log('\n  L-OR1 + L-DC1 — what may be put in front of a leader as a fact');
  ok('3 · a well-evidenced claim in a big enough group passes',
    T.fitForSurface(inq({ origins: 3, contributors: 3 }), { cohortSize: 9 }).ok);
  {
    const f = T.fitForSurface(inq({ origins: 1, contributors: 4 }), { cohortSize: 12 });
    ok('3 · ONE ORIGIN RETOLD BY FOUR is refused', !f.ok);
    ok('3 · …named as repetition, not corroboration',
      f.blocked.some(b => b.gate === 'origins' && /repetition/.test(b.reason)));
  }
  {
    const f = T.fitForSurface(inq({ origins: 3, contributors: 2 }), { cohortSize: 2 });
    ok('3 · a two-person squad cannot have a High, however well evidenced', !f.ok);
    ok('3 · …blocked on the cohort, not on the evidence',
      f.blocked.some(b => b.gate === 'cohort') && !f.blocked.some(b => b.gate === 'origins'));
  }
  ok('3 · a `tentative` band is too early to show anyone',
    !T.fitForSurface(inq({ band: 'tentative' }), { cohortSize: 9 }).ok);
  ok('3 · `emerging` is the floor and it passes',
    T.fitForSurface(inq({ band: 'emerging' }), { cohortSize: 9 }).ok);
  ok('3 · a DISPUTED inquiry is never surfaced as settled',
    !T.fitForSurface(inq({ status: 'disputed' }), { cohortSize: 9 }).ok);
  ok('3 · every refusal explains itself — a silent drop is indistinguishable from no finding',
    T.fitForSurface(inq({ origins: 0, band: 'tentative' }), { cohortSize: 2 }).blocked.length === 3);

  // ── 4. THE OPEN QUESTION ───────────────────────────────────────────────────────────────────
  console.log('\n  INQUIRY — the one artifact on this surface that names nobody');
  {
    const q = T.openQuestion([
      inq({ inquiryId: 'a', stillUnknown: [] }),
      inq({ inquiryId: 'b', stillUnknown: ['Why does communication drop after difficult results?'] }),
    ]);
    ok('4 · an inquiry with no live unknowns is not a question', q && q.inquiryId === 'b');
    ok('4 · the question is carried verbatim from the frontier',
      q.question === 'Why does communication drop after difficult results?');
  }
  ok('4 · a resolved inquiry is not a question',
    T.openQuestion([inq({ status: 'resolved', stillUnknown: ['x'] })]) === null);
  {
    const q = T.openQuestion([
      inq({ inquiryId: 'a', stillUnknown: ['x', 'y', 'z'] }),
      inq({ inquiryId: 'b', contested: true, stillUnknown: ['q'] }),
    ]);
    ok('4 · CONTESTED outranks well-populated — disagreement is the useful part',
      q.inquiryId === 'b');
  }
  {
    // A question contains no count and names nobody, so it is deliberately NOT floor-gated.
    // Gating it would suppress the one safe-by-construction artifact here.
    const q = T.openQuestion([inq({ contributors: 2, origins: 1, band: 'tentative', stillUnknown: ['why?'] })]);
    ok('4 · a question survives in a two-person group where a High could not', q !== null);
  }
  {
    // An inquiry already shown as the High or the Low has its unknown spoken to by the closing
    // statement. Promoting it to the Inquiry line as well spends the surface's third slot
    // restating its first, so a standalone question outranks it.
    const q = T.openQuestion([
      inq({ inquiryId: 'shown', at: 9000, stillUnknown: ['Does it hold after a loss?'] }),
      inq({ inquiryId: 'only_a_question', at: 1, stillUnknown: ['Why does communication drop after difficult results?'] }),
    ], { alreadyShown: ['shown'] });
    ok('4 · a question already carried by a High does not also become THE Inquiry',
      q.inquiryId === 'only_a_question');
  }
  ok('4 · …but a surfaced inquiry\'s unknown is still used rather than showing nothing',
    T.openQuestion([inq({ inquiryId: 'shown', stillUnknown: ['x'] })], { alreadyShown: ['shown'] }) !== null);

  // ── 5. FOCUS CARRIES ORIGIN FROM THE FIRST RECORD ──────────────────────────────────────────
  console.log('\n  FOCUS — origin cannot be back-filled, so it exists from record one');
  {
    const f = T.normalizeFocus({ focusId: 'tf1', text: 'Test player-led debriefs', createdAt: 5,
      origin: { by: 'coach', at: 5, from: 'inquiry', inquiryId: 'inq_1' } });
    ok('5 · origin survives normalisation intact',
      f.origin.by === 'coach' && f.origin.from === 'inquiry' && f.origin.inquiryId === 'inq_1');
  }
  ok('5 · a focus with no declared origin defaults to `leader`, never to `inquiry`',
    T.normalizeFocus({ focusId: 'x', text: 't', createdAt: 1 }).origin.from === 'leader');
  ok('5 · an unrecognised outcome result becomes `unclear`, not the value supplied',
    T.normalizeFocus({ focusId: 'x', text: 't', outcome: { result: 'amazing' } }).outcome.result === 'unclear');
  ok('5 · an unrecognised status becomes `active`, not the value supplied',
    T.normalizeFocus({ focusId: 'x', text: 't', status: 'shipped' }).status === 'active');

  // ── 6. THE ACCEPTANCE TARGET, ASSEMBLED ────────────────────────────────────────────────────
  console.log('\n  THE SCREEN — Men\'s Soccer, end to end');
  const state = T.buildTeamState({
    node: { nodeId: 'mens_soccer', name: "Men's Soccer", memberCount: 22 },
    inquiries: [
      inq({ inquiryId: 'high1', polarity: T.POLARITY.WORKING_WELL, label: 'player-led communication',
        hypothesis: 'Player-led communication has improved over the last two sessions',
        band: 'probable', origins: 3, contributors: 4, at: 3000,
        stillUnknown: ['Does the improvement hold after a loss?'] }),
      inq({ inquiryId: 'low1', polarity: T.POLARITY.WORTH_ATTENTION, label: 'substitute role clarity',
        hypothesis: 'Substitute role clarity is emerging as something worth attention',
        band: 'emerging', origins: 2, contributors: 3, at: 2000,
        stillUnknown: ['What would make the substitute role clear?'] }),
      // The Inquiry line is its OWN artifact, not a by-product of a High or a Low: an open
      // question nobody has called either way, which is exactly why it is still a question.
      inq({ inquiryId: 'q1', polarity: T.POLARITY.NEUTRAL, label: 'communication after losses',
        band: 'emerging', origins: 2, contributors: 3, at: 2500,
        stillUnknown: ['Why does communication drop after difficult results?', 'Is it every loss or only close ones?'] }),
    ],
    focuses: [{ focusId: 'tf1', text: 'Test player-led post-match debriefs for the next two matches',
      status: 'active', createdAt: 4000, origin: { by: 'coach', at: 4000, from: 'inquiry', inquiryId: 'high1' } }],
    now: 5000,
  });

  ok('6 · the node names itself', state.node.name === "Men's Soccer");
  ok('6 · HIGH is the working-well claim', state.high && state.high.about === 'player-led communication');
  ok('6 · LOW is the worth-attention claim', state.low && state.low.about === 'substitute role clarity');
  ok('6 · INQUIRY is an open question', state.question && /difficult results/.test(state.question.question));
  ok('6 · FOCUS is the active commitment', state.focus && /post-match debriefs/.test(state.focus.text));
  ok('6 · the focus knows it came out of an inquiry', state.focus.origin.from === 'inquiry');
  ok('6 · INTELLIQ says what is not yet known, naming the specific thing',
    /don't yet know/.test(state.statement) && /communication/.test(state.statement));
  ok('6 · the High reports what it rests on', state.high.basis.independentOrigins === 3 && state.high.basis.of === 22);
  ok('6 · nothing withheld in a 22-person squad', state.withheld.length === 0);
  ok('6 · the surface declares it carries no private content', state.carriesPrivateContent === false);

  // ── 7. THE SAME SCREEN IN A SMALL GROUP ────────────────────────────────────────────────────
  console.log('\n  THE SAME SCREEN, SIX PEOPLE — where the floors actually bite');
  const small = T.buildTeamState({
    node: { nodeId: 'subs', name: 'Substitutes', memberCount: 6 },
    inquiries: [
      inq({ inquiryId: 'l', polarity: T.POLARITY.WORTH_ATTENTION, label: 'substitute role clarity',
        band: 'probable', origins: 3, contributors: 5, stillUnknown: ['What would make the role clear?'] }),
    ],
    focuses: [], now: 5000,
  });
  ok('7 · 5 of 6 is refused — one person left uncounted names them', small.low === null);
  ok('7 · the finding is REPORTED AS WITHHELD, not silently dropped',
    small.withheld.length === 1 && small.withheld[0].kind === 'low');
  ok('7 · what is withheld is named by TOPIC — never by restating the claim',
    small.withheld[0].about === 'substitute role clarity' && !('claim' in small.withheld[0]));
  ok('7 · the reason is carried so a leader can act on it (ask more people)',
    small.withheld[0].blocked.some(b => b.gate === 'cohort'));
  ok('7 · the question still surfaces — it names nobody', small.question !== null);

  // ── 8. AN EMPTY GROUP IS AN HONEST ANSWER ──────────────────────────────────────────────────
  console.log('\n  NOTHING YET — silence must be explained, not implied');
  {
    const empty = T.buildTeamState({ node: { nodeId: 'n', name: 'New Squad', memberCount: 10 }, inquiries: [], focuses: [], now: 1 });
    ok('8 · no High, no Low, no question', !empty.high && !empty.low && !empty.question);
    ok('8 · and IntelliQ says why, not nothing',
      /Nothing has crossed/.test(empty.statement) && /more than one account/.test(empty.statement));
  }

  // ── 9. NEUTRAL AND CONTESTED NEVER BECOME A HIGH OR A LOW ──────────────────────────────────
  console.log('\n  THE REFUSAL THAT MATTERS MOST');
  {
    const s = T.buildTeamState({
      node: { nodeId: 'n', name: 'Squad', memberCount: 20 },
      inquiries: [inq({ polarity: T.POLARITY.NEUTRAL, contested: true, origins: 4, contributors: 6,
        band: 'supported', stillUnknown: ['Which account is right?'] })],
      focuses: [], now: 1,
    });
    ok('9 · a CONTESTED claim is never a High, however well evidenced', s.high === null && s.low === null);
    ok('9 · it becomes the open question instead', s.question && s.question.contested === true);
    ok('9 · and IntelliQ names the disagreement rather than resolving it',
      /describing/.test(s.statement) && /disagreement/.test(s.statement));
    ok('9 · a contested claim is not listed as withheld — it was not suppressed, it is unresolved',
      s.withheld.length === 0);
  }

  // ── 10. THE SAME MODULE ON A DIFFERENT DEPLOYMENT SHAPE ────────────────────────────────────
  console.log('\n  SHAPE NEUTRALITY — a node is a node');
  {
    const classroom = T.buildTeamState({
      node: { nodeId: 'yr9_maths', name: 'Year 9 Maths', memberCount: 28 },
      inquiries: [inq({ inquiryId: 'c1', polarity: T.POLARITY.WORTH_ATTENTION,
        label: 'homework completion after assessment weeks', band: 'probable', origins: 3, contributors: 5,
        hypothesis: 'Homework completion drops in the week after an assessment' })],
      focuses: [], now: 1,
    });
    ok('10 · the identical module produces a classroom surface with no education branch',
      classroom.low && classroom.low.about === 'homework completion after assessment weeks');
    ok('10 · nothing in the output names a sport, a subject or a pilot',
      !/soccer|football|maths/i.test(JSON.stringify(classroom.statement)));
  }

  // ── 11. OVER HTTP, WITH THE REAL SERVER ────────────────────────────────────────────────────
  console.log('\n  DETECTED GROUP PATTERNS — existing kernel, team grain');
  {
    const detected = { findingId:'det_withdrawal', type:'withdrawal', about:'Participation',
      claim:'Participation is below the group baseline', polarity:'risk', confidence:'emerging',
      status:'observed', memberCount:2 };
    const s = T.buildTeamState({ node:{nodeId:'n',name:'Node',memberCount:4}, findings:[detected] });
    ok('F01 · a detected two-of-four participation decline becomes a Low without contributions',
      s.low && s.low.source === 'detected' && s.low.detectedType === 'withdrawal');
    ok('F02 · detected and contributed findings are explicitly distinguishable',
      s.low.source === 'detected' && T.buildTeamState({node:{memberCount:8},inquiries:[inq({polarity:T.POLARITY.WORTH_ATTENTION})]}).low.source === 'contributed');
    const one = T.buildTeamState({ node:{nodeId:'n',name:'Node',memberCount:4}, findings:[{...detected,memberCount:1}] });
    ok('F03 · a one-member detected pattern never becomes a team finding',!one.low && one.withheld[0]?.source === 'detected');
    const all = T.buildTeamState({ node:{nodeId:'n',name:'Node',memberCount:4}, findings:[{...detected,memberCount:4}] });
    ok('F04 · the two-sided floor also refuses an all-member detected finding',!all.low && all.withheld[0]?.blocked[0]?.gate === 'cohort');
  }

  // ── 12. OVER HTTP, WITH THE REAL SERVER ────────────────────────────────────────────────────
  console.log('\n  HTTP — the endpoints, the roles, and the org boundary');
  const S = require('../server.js');
  const { app, orgMeta, orgUsers, orgNodes, issueToken, _teamFocuses, evidenceLog } = S;

  const CODE = 'alma', OTHER = 'riverside';
  orgMeta[CODE]  = { orgName: 'Alma', orgMode: 'sports' };
  orgMeta[OTHER] = { orgName: 'Riverside School', orgMode: 'education' };
  const mk = (id, name, role = 'member') => ({ id, name, email: `${id}@x.test`, role, status: 'active', assignedNodeIds: [], leadershipNodeIds: [] });
  orgUsers[CODE] = { p1: mk('p1', 'Ash'), p2: mk('p2', 'Bo'), p3: mk('p3', 'Cass'), p4: mk('p4', 'Dee'),
                     coach: mk('coach', 'Jordan', 'coach'), outsider: mk('outsider', 'Eli') };
  orgUsers[OTHER] = { far: mk('far', 'Fen') };
  orgNodes[CODE] = { mens: { nodeId: 'mens', name: "Men's Soccer", parentId: null, childNodeIds: [],
                             memberIds: ['p1', 'p2', 'p3', 'p4'], leaderIds: ['coach'] } };
  orgNodes[OTHER] = { yr9: { nodeId: 'yr9', name: 'Year 9', parentId: null, childNodeIds: [], memberIds: ['far'], leaderIds: [] } };
  for (const u of ['p1', 'p2', 'p3', 'p4']) orgUsers[CODE][u].assignedNodeIds = ['mens'];
  orgUsers[CODE].coach.leadershipNodeIds = ['mens'];

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

  {
    const r = await GET(CODE, 'coach', '/api/group/mens/state');
    ok('11 · a leader reads their group\'s state', r.status === 200 && r.body.node.name === "Men's Soccer");
    ok('11 · an empty group still answers, and says why',
      r.body.high === null && /Nothing has crossed/.test(r.body.statement));
  }
  ok('11 · a member of the group reads it too', (await GET(CODE, 'p1', '/api/group/mens/state')).status === 200);
  ok('11 · someone outside the group cannot', (await GET(CODE, 'outsider', '/api/group/mens/state')).status === 403);
  ok('11 · another org\'s node is 404, not 403 — existence is not confirmed',
    (await GET(CODE, 'coach', '/api/group/yr9/state')).status === 404);
  ok('11 · …and a user from that org cannot reach it through this org either',
    (await GET(OTHER, 'far', '/api/group/mens/state')).status === 404);

  // Organisationally-admissible typed streams: p1/p2 decline, p3/p4 stay
  // steady. The aggregate therefore moves, and exactly two members independently
  // exhibit the same existing structural pattern.
  const tnow = Date.now(), day = 86400000;
  const e = (id, subjectId, value, days, visibility = 'shared') => ({ id, orgCode:CODE,
    status:'active', subjectId, type:'metric', label:'attendance', value,
    observedAt:new Date(tnow-days*day).toISOString(), visibility,
    promoted:visibility !== 'private', attributes:{primitive:'participation',valence:'up-good'} });
  const stream = (id, recent) => {
    const out=[]; for(let d=90;d>=20;d-=5)out.push(e(`${id}_${d}`,id,5,d));
    [10,6,3,1].forEach(d=>out.push(e(`${id}_${d}`,id,recent,d))); return out;
  };
  evidenceLog[CODE] = [...stream('p1',1),...stream('p2',1),...stream('p3',5),...stream('p4',5)];
  const detectedBefore = await GET(CODE,'coach','/api/group/mens/state');
  ok('F05 · admissible group streams produce a detected Low without contributions',
    detectedBefore.body.low && detectedBefore.body.low.source === 'detected' && detectedBefore.body.low.detectedType === 'withdrawal');
  [10,6,3,1].forEach(d => evidenceLog[CODE].push(e(`private_attack_${d}`,'p3',100,d,'private')));
  const detectedAfter = await GET(CODE,'coach','/api/group/mens/state');
  ok('F06 · a private capture changes nothing about the detected group surface',
    JSON.stringify({high:detectedBefore.body.high,low:detectedBefore.body.low,withheld:detectedBefore.body.withheld,statement:detectedBefore.body.statement}) ===
    JSON.stringify({high:detectedAfter.body.high,low:detectedAfter.body.low,withheld:detectedAfter.body.withheld,statement:detectedAfter.body.statement}));
  evidenceLog[CODE] = []; // isolate the pre-existing Focus/Inquiry acceptance cases below

  console.log('\n  WHICH GROUPS AM I PART OF');
  {
    const r = await GET(CODE, 'coach', '/api/group/mine');
    ok('11 · a leader is told which groups they lead',
      r.status === 200 && r.body.groups.length === 1 && r.body.groups[0].role === 'leader');
    ok('11 · …with the name and size the surface needs, and nothing more',
      Object.keys(r.body.groups[0]).sort().join(',') === 'memberCount,name,nodeId,role');
  }
  ok('11 · a member is told the groups they belong to',
    (await GET(CODE, 'p1', '/api/group/mine')).body.groups[0].role === 'member');
  {
    const r = await GET(CODE, 'outsider', '/api/group/mine');
    ok('11 · someone on no node is told so, rather than shown the org',
      r.status === 200 && r.body.groups.length === 0);
  }

  console.log('\n  FOCUS OVER HTTP');
  ok('11 · a member may not set the group\'s focus',
    (await POST(CODE, 'p1', '/api/group/mens/focus', { text: 'do a thing' })).status === 403);
  ok('11 · an empty focus is refused',
    (await POST(CODE, 'coach', '/api/group/mens/focus', { text: '  ' })).status === 400);
  ok('11 · a focus claiming an inquiry that does not exist is refused',
    (await POST(CODE, 'coach', '/api/group/mens/focus', { text: 'x', fromInquiryId: 'inq_nope' })).status === 404);

  let focusId = null;
  {
    const r = await POST(CODE, 'coach', '/api/group/mens/focus',
      { text: 'Test player-led post-match debriefs for the next two matches' });
    focusId = r.body.focus && r.body.focus.focusId;
    ok('11 · a leader sets it, and it records WHO and WHEN',
      r.status === 200 && r.body.focus.origin.by === 'coach' && r.body.focus.origin.at > 0);
    ok('11 · a focus the leader simply decided is marked `leader`, not `inquiry`',
      r.body.focus.origin.from === 'leader');
  }
  {
    const r = await GET(CODE, 'p1', '/api/group/mens/state');
    ok('11 · the focus appears on the group surface for members too',
      r.body.focus && r.body.focus.focusId === focusId);
    ok('11 · IntelliQ names the untested focus as the live uncertainty',
      /nothing has come back/.test(r.body.statement));
  }
  {
    const r = await POST(CODE, 'coach', `/api/group/mens/focus/${focusId}/outcome`, { result: 'better', note: 'two matches in' });
    ok('11 · the outcome loop closes, recording who and what',
      r.status === 200 && r.body.focus.outcome.result === 'better' && r.body.focus.outcome.recordedBy === 'coach');
    ok('11 · closing it moves it out of `active`', r.body.focus.status === 'done');
  }
  ok('11 · a member may not record the outcome',
    (await POST(CODE, 'p1', `/api/group/mens/focus/${focusId}/outcome`, { result: 'better' })).status === 403);
  {
    const r = await GET(CODE, 'coach', '/api/group/mens/state');
    ok('11 · a closed focus stays visible in history rather than vanishing',
      (r.body.history || []).some(f => f.focusId === focusId));
  }

  console.log('\n  ERASURE');
  {
    const before = _teamFocuses(CODE, 'mens').find(f => f.focusId === focusId);
    S._removePerson(CODE, 'coach', { erase: true });
    const after = _teamFocuses(CODE, 'mens').find(f => f.focusId === focusId);
    ok('11 · the group keeps its commitment when the person who set it is erased',
      !!after && after.text === before.text);
    ok('11 · …but the person is unlinked from it', after.origin.by === '(erased)');
    ok('11 · …and from the outcome they recorded', after.outcome.recordedBy === '(erased)');
    ok('11 · the origin SHAPE survives, so a real origin is never mistaken for a missing one',
      after.origin.from === 'leader' && after.origin.at > 0);
  }

  // ── 12. THE AGENT ANSWERS AT THE GRAIN THAT WAS ASKED ──────────────────────────────────────
  console.log('\n  THE AGENT — "how is the team doing?"');
  {
    const { inquiryStates, groupCandidates } = S;
    // Restore the coach: §11 erased them, and the agent path needs a leader to answer for.
    orgUsers[CODE].coach = mk('coach', 'Jordan', 'coach');
    orgUsers[CODE].coach.leadershipNodeIds = ['mens'];
    orgNodes[CODE].mens.leaderIds = ['coach'];
    orgNodes[CODE].mens.memberIds = ['p1', 'p2', 'p3', 'p4'];
    // Widen the squad so a real finding can clear the two-sided floor — the small-group case
    // is already pinned in §7, and here we need the surface to actually speak.
    for (let i = 5; i <= 14; i++) {
      const id = `p${i}`;
      orgUsers[CODE][id] = mk(id, `Player ${i}`);
      orgUsers[CODE][id].assignedNodeIds = ['mens'];
      orgNodes[CODE].mens.memberIds.push(id);
    }

    // A group inquiry the kernel already holds, and the contributor-declared valence that
    // makes it a High. Both written the way the real paths write them.
    inquiryStates[CODE] = inquiryStates[CODE] || {};
    inquiryStates[CODE]['group:mens'] = {
      communication: {
        inquiryId: 'inq_comm', subjectRef: 'group:mens',
        topic: { canonicalConcept: 'communication', label: 'player-led communication', domain: 'sports' },
        displayLabel: 'player-led communication',
        hypotheses: [{ id: 'h1', statement: 'Player-led communication has improved over the last two sessions',
          confidence: { score: 0.6, band: 'probable' }, status: 'active', supportRefs: [], challengeRefs: [] }],
        leadingHypothesisId: 'h1',
        signals: [
          { ref: 'e1', kind: 'observation', originRef: 'o_tue', contributedBy: 'p1', contributorVisibility: 'named', at: 1 },
          { ref: 'e2', kind: 'observation', originRef: 'o_sat', contributedBy: 'p2', contributorVisibility: 'named', at: 2 },
          { ref: 'e3', kind: 'observation', originRef: 'o_sun', contributedBy: 'p3', contributorVisibility: 'named', at: 3 },
          { ref: 'e4', kind: 'observation', originRef: 'o_mon', contributedBy: 'p4', contributorVisibility: 'named', at: 4 },
        ],
        missingSignals: [{ question: 'Does the improvement hold after a loss?' }],
        confidence: { score: 0.6, band: 'probable', because: [] },
        status: 'probable', timeline: [], createdAt: 1, lastUpdatedAt: 9,
      },
    };
    groupCandidates[CODE] = [
      { candidateId: 'gc1', nodeId: 'mens', concept: 'communication', contributorId: 'p1', status: 'admitted', valence: 'working_well' },
      { candidateId: 'gc2', nodeId: 'mens', concept: 'communication', contributorId: 'p2', status: 'admitted', valence: 'working_well' },
      { candidateId: 'gc3', nodeId: 'mens', concept: 'communication', contributorId: 'p3', status: 'admitted', valence: 'working_well' },
      { candidateId: 'gc4', nodeId: 'mens', concept: 'communication', contributorId: 'p4', status: 'admitted', valence: 'working_well' },
    ];

    const r = await GET(CODE, 'coach', '/api/group/mens/state');
    ok('12 · the surface reads the kernel\'s own inquiry as a High',
      r.body.high && r.body.high.about === 'player-led communication');
    ok('12 · the claim is the kernel\'s hypothesis, not a restatement',
      /improved over the last two sessions/.test(r.body.high.claim));

    const turn = await POST(CODE, 'coach', '/api/assistant/turn', { text: "How is the team doing?" });
    const said = String(turn.body.reply || turn.body.answer || JSON.stringify(turn.body));
    ok('12 · the agent answers a team question at the TEAM\'s grain',
      /player-led communication|Working well/i.test(said));
    ok('12 · …and names the open question rather than closing it',
      /hold after a loss|don't yet know|Still open/i.test(said));
    ok('12 · …without naming an individual player',
      !/\bPlayer \d+\b/.test(said) && !/\bAsh\b|\bBo\b|\bCass\b|\bDee\b/.test(said));

    // The same question from a member of the group. The group's state is the group's, so a
    // member gets the same picture — this is the Web→Self direction that is safe because the
    // artifact was already floor-gated and names nobody.
    const memberTurn = await POST(CODE, 'p1', '/api/assistant/turn', { text: "How is the team doing?" });
    const memberSaid = String(memberTurn.body.reply || memberTurn.body.answer || JSON.stringify(memberTurn.body));
    ok('12 · a member asking about their own team gets the group picture too',
      /player-led communication|Working well/i.test(memberSaid));
    ok('12 · …and still no individual is named',
      !/\bPlayer \d+\b/.test(memberSaid));

    // Someone on no node at all falls through to the existing read rather than erroring.
    ok('12 · a person on no node falls through instead of failing',
      S._teamStateAnswer(CODE, 'outsider', 'how is the team doing?') === null);

    // Naming a group they are not on narrows to nothing, and cannot confirm it exists.
    orgNodes[CODE].womens = { nodeId: 'womens', name: "Women's Soccer", parentId: null, childNodeIds: [], memberIds: ['p2'], leaderIds: [] };
    const t = S._teamStateAnswer(CODE, 'coach', "how are the women's soccer doing?");
    ok('12 · naming a group outside your own nodes matches nothing and reveals nothing',
      t && (t.nodes || []).every(n => n === 'mens'));
  }

  // ── 13. THE SCREEN IS ACTUALLY WIRED ───────────────────────────────────────────────────────
  // A surface with endpoints and no renderer is not a product. These are structural checks on
  // the front end, not a browser test: they catch the specific failure of shipping the API and
  // forgetting the screen, which is exactly what happened to the group layer before this.
  console.log('\n  THE SCREEN');
  {
    const fs = require('fs'), path = require('path');
    const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');
    ok('13 · the leader home has a slot for the group', /id="team-state"/.test(app));
    ok('13 · …and calls the renderer that fills it', /_renderTeamState\(\)/.test(app));
    ok('13 · the renderer reads the governed endpoints, not a second source',
      /\/api\/group\/mine/.test(app) && /\/api\/group\/\$\{encodeURIComponent\(g\.nodeId\)\}\/state/.test(app));
    ok('13 · the card renders all four lines plus what IntelliQ says',
      /'High'/.test(app) && /'Low'/.test(app) && /'Inquiry'/.test(app) && /'Focus'/.test(app) && /tstate-says/.test(app));
    ok('13 · withheld findings are surfaced to the leader, not dropped by the front end',
      /tstate-withheld/.test(app) && /Not shown yet/.test(app));
    ok('13 · every rendered value goes through the escaper',
      !/\$\{s\.(high|low|question|focus|statement)[^}]*\}/.test(app.slice(app.indexOf('function _teamStateCard'), app.indexOf('function _teamStateCard') + 3000)
        .replace(/esc\([^)]*\)/g, 'ESC')));
    ok('13 · the strip has styles, so it is not invisible on the page', /\.tstate-card\{/.test(css));
    ok('13 · a failing group read cannot take down the leader home',
      /catch \(_\) \{ box\.innerHTML = ''; \}/.test(app));

    // Without a way to declare valence, every contribution defaults to `unsure`, no inquiry
    // ever gains a polarity, and the team surface can never show a High or a Low at all.
    // The capture path is therefore load-bearing, not a nicety.
    const mv = fs.readFileSync(path.join(__dirname, '..', 'js', 'member-view.js'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const mcss = fs.readFileSync(path.join(__dirname, '..', 'css', 'member.css'), 'utf8');
    ok('13 · the member surface has a slot for their own group noticings',
      /id="me-group"/.test(html) && /_renderGroupNoticings\(\)/.test(mv));
    ok('13 · it reads the member\'s OWN candidates, which nobody else can see',
      /\/candidates`/.test(mv));
    ok('13 · contributing declares a valence — the three the kernel accepts, and no others',
      /'working_well'/.test(mv) && /'worth_attention'/.test(mv) && /'unsure'/.test(mv));
    ok('13 · declining is offered as an equal option, not a hidden one',
      /dismissNoticing/.test(mv) && /Keep it to myself/.test(mv));
    ok('13 · the card says plainly that nothing is shared yet',
      /Nobody can see this yet/.test(mv));
    ok('13 · after contributing, the member is told whether it actually opened anything',
      /does not open anything/.test(mv));
    ok('13 · the noticing card is styled to look private, not like a notification',
      /\.mg-card \{/.test(mcss));

    ok('13 · home opens with the OPEN QUESTION, above everything settled',
      app.indexOf('id="lead-inquiry"') < app.indexOf('id="team-state"')
      && app.indexOf('id="lead-inquiry"') > 0);
    ok('13 · …fed by the one ranking that puts self and team on the same list',
      /\/api\/inquiry\/lead/.test(app) && /_renderLeadInquiry\(\)/.test(app));
    ok('13 · …and it says where the question came from', /About you/.test(app) && /linq-head/.test(app));
    ok('13 · the open-question strip has styles', /\.linq-card\{/.test(css));

    // THE LOOP THE PILOT EXISTS TO TEST. An earlier pass emitted only aggregate Web items,
    // which left POST /api/intelligence/act with no caller anywhere in the front end: the
    // leader could read a page and could not answer it, and the Confidence Engine stopped
    // receiving the feedback it learns from. Nothing went red, because no assertion asked
    // whether a server route still had a caller. This one does.
    const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    for (const route of ['/api/intelligence/act', '/api/intelligence/outcome', '/api/intelligence/notice-feedback']) {
      const declared = srv.includes(`app.post('${route}'`);
      const called = app.includes(`fetch('${route}'`);
      ok(`13 · ${route} is declared AND reachable from the UI`, declared && called);
    }
    ok('13 · the leader can record that they acted, and how it went',
      /function intelAct\(/.test(app) && /function intelOutcome\(/.test(app));
    ok('13 · aggregate and person items are rendered as different things',
      /perspective === 'web'/.test(app) && /Needs your attention/.test(app));
    ok('13 · only a person item carries the act buttons — a Web item names nobody',
      /it\.perspective !== 'web' && it\.memberId \?/.test(app));
  }

  // ── 14. THE ONE RANKING OVER SELF AND TEAM ─────────────────────────────────────────────────
  console.log('\n  THE LEAD INQUIRY — self and team on one list');
  {
    const { inquiryStates } = S;
    inquiryStates[CODE]['member:coach'] = {
      preparation: {
        inquiryId: 'inq_self', subjectRef: 'member:coach',
        topic: { canonicalConcept: 'preparation', label: 'how I prepare sessions' },
        hypotheses: [], leadingHypothesisId: null,
        signals: [{ ref: 's1', kind: 'observation', at: 1 }],
        missingSignals: [{ question: 'What makes a session land for this group?' }],
        confidence: { score: 0.3, band: 'emerging' }, status: 'exploring',
        timeline: [], createdAt: 1, lastUpdatedAt: 100,
      },
    };
    const r = await GET(CODE, 'coach', '/api/inquiry/lead');
    ok('14 · a leader with both a self and a team question gets exactly one',
      r.status === 200 && r.body.lead && typeof r.body.lead.question === 'string');
    ok('14 · …tagged with where it came from', ['self', 'team'].includes(r.body.lead.source));

    // Contested wins over everything, across the self/team line — the ranking is one ranking.
    inquiryStates[CODE]['member:coach'].preparation.signals.push({ ref: 's2', kind: 'observation', dissents: true, at: 2 });
    const r2 = await GET(CODE, 'coach', '/api/inquiry/lead');
    ok('14 · a CONTESTED self question outranks an uncontested team one',
      r2.body.lead.source === 'self' && r2.body.lead.contested === true);
    ok('14 · …and the strip can say it is about them', r2.body.lead.where === 'you');

    // A person with nothing open gets null, not an invented question.
    ok('14 · nothing open returns nothing, never a filler question',
      (await GET(CODE, 'outsider', '/api/inquiry/lead')).body.lead === null);

    // The reader's own frontier cannot leak: another member's self inquiry is not in scope.
    inquiryStates[CODE]['member:p2'] = {
      confidence_thing: {
        inquiryId: 'inq_p2_private', subjectRef: 'member:p2',
        topic: { canonicalConcept: 'nerves', label: 'nerves before matches' },
        hypotheses: [], signals: [{ ref: 'x', kind: 'observation', dissents: true, at: 9 }],
        missingSignals: [{ question: 'PRIVATE_MARKER_should_never_surface' }, { question: 'b' }, { question: 'c' }],
        confidence: { band: 'probable' }, status: 'exploring', timeline: [], createdAt: 1, lastUpdatedAt: 99999,
      },
    };
    const r3 = await GET(CODE, 'coach', '/api/inquiry/lead');
    ok('14 · another person\'s own frontier never reaches the leader\'s home',
      !/PRIVATE_MARKER/.test(JSON.stringify(r3.body)));
    ok('14 · …not even though it is contested, newer and has more unknowns',
      r3.body.lead.inquiryId !== 'inq_p2_private');
  }

  server.close();
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
