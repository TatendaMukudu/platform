/* Truth layer — WHAT WAS ALREADY TRIED, AND WHY THE ANSWER CHANGES WHEN AN OUTCOME IS RECORDED.

   Acceptance matrix 12-14: an outcome reported changes what is suggested next; a materially
   identical failed tactic is not recycled as new; and when reasonable tactics are exhausted the
   useful move is more understanding or human help rather than another variation.

   THE DEFECT WAS A LAYER THAT ONLY EXISTS WHEN A MODEL IS WRITING. `ai/composer.js` carries prior
   attempts into the model's context and its system prompt already says not to repackage a
   materially identical unsuccessful one. Measured on the real path: a turn bound to a group focus
   makes ONE provider call — the bounded action read — and the prose comes from the deterministic
   object reader. With models off, which is the pilot's state, none of that reached anybody.

   So a coach on their second attempt, asking what else to try, was told what they were working on
   and that nothing had been recorded about it, while the record held that the first attempt had
   been tried and had not helped. The most useful fact available was the one left out.

   AND THE RELATIONSHIP HAS TWO SPELLINGS. A personal focus stores `addresses: {kind,id}`; a group
   focus stores `origin.inquiryId`. The reader looked only at the first, which is why it knew about
   a personal focus's question and not a group's. Read under both names here rather than renamed:
   consolidating them is a canonical-owner change with its own blast radius, and this is a reader.

   WHAT IS DELIBERATELY NOT DONE. No suggestion, no ranking, and no claim that an attempt caused
   what followed it — the limitation travels with the answer. Scoped to focuses started from the
   SAME source, because judging two questions similar would be the system deciding they are the
   same thing, which it is not entitled to do.

   Run: node scripts/prior-attempts-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'pra', NOW = Date.now(), DAY = 86400000;
const SQUAD = ['p1', 'p2', 'p3', 'p4', 'p5'];
const SIG = (w, n) => ({ kind: 'observation', status: 'active', source: w, originRef: `o_${w}_${n}`,
  at: NOW - 9 * DAY, turnId: `t_${w}_${n}`, directness: 'direct', authority: 'corroborated',
  specificity: 0.7, ref: `ev_${w}_${n}`, contributedBy: w, text: 'we fade late' });

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma', orgMode: 'sports' } },
  orgUsers: { [C]: Object.fromEntries([
    ...SQUAD.map((id, i) => [id, { id, name: `Player ${i + 1}`, email: `${id}@p.io`, role: 'member',
      orgCode: C, status: 'active', assignedNodeIds: ['n'], profileComplete: true }]),
    ['coach', { id: 'coach', name: 'Coach', email: 'c@p.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['n'], assignedNodeIds: ['n'], profileComplete: true }],
  ]) },
  orgNodes: { [C]: { n: { nodeId: 'n', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: [...SQUAD, 'coach'], leaderIds: ['coach'] } } },
  inquiryStates: { [C]: { 'group:n': { m: {
    inquiryId: 'q1', subjectRef: 'group:n',
    topic: { canonicalConcept: 'f.late', label: 'How the last twenty go' }, status: 'exploring',
    hypotheses: [{ id: 'h1', statement: 'legs go late', supportRefs: SQUAD.map((w, i) => `ev_${w}_${i}`),
      challengeRefs: [], confidence: { score: 0.7, band: 'probable' }, status: 'open', createdAt: NOW }],
    leadingHypothesisId: 'h1', signals: SQUAD.map((w, i) => SIG(w, i)),
    confidence: { score: 0.7, band: 'probable', because: ['5 independent origins'] },
    missingSignals: [], falsifiers: [], timeline: [], lastUpdatedAt: NOW } } } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = w => ({ Authorization: `Bearer ${issueToken(w, C, w === 'coach' ? 'coach' : 'member')}`,
    'Content-Type': 'application/json' });
  const call = (m, u, b, w = 'coach') => fetch(base + u, { method: m, headers: H(w),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const said = r => String(((((r.j || {}).response) || {}).responseText) || '');
  /* THE ANSWER'S OWN LIMITATIONS, which live on the qa the reader receives. The turn also carries
     a top-level `limitations` describing the CONTEXT it answered from ("only what you have shared
     with IntelliQ"); that is a different statement and reading it instead is how a caveat looks
     missing when it is present. */
  const limits = r => ((((r.j || {}).response) || {}).qa || {}).limitations || [];

  try {
    console.log('\n  A — BEFORE ANYTHING HAS BEEN TRIED');
    const f1 = await call('POST', '/api/group/n/focus',
      { text: 'Extra fitness block on Tuesdays', fromInquiryId: 'q1' });
    const id1 = ((f1.j || {}).focus || {}).focusId;
    ok('PA-A1 a first attempt exists', !!id1);
    const early = await call('POST', '/api/assistant/turn',
      { text: 'What else could we try here?', about: { kind: 'focus', id: id1 } });
    /* THE CONTROL. With nothing recorded, there is nothing to carry — so "it mentions a prior
       attempt" cannot pass by mentioning attempts unconditionally. */
    ok('PA-A2 with nothing tried before, nothing is claimed to have been',
      !/already tried/i.test(said(early)));

    console.log('\n  B — AND AFTER AN OUTCOME IS RECORDED, THE ANSWER CHANGES');
    await call('POST', `/api/group/n/focus/${id1}/outcome`, { result: 'no_change' });
    const f2 = await call('POST', '/api/group/n/focus',
      { text: 'Rotate the press in the last twenty', fromInquiryId: 'q1' });
    const id2 = ((f2.j || {}).focus || {}).focusId;
    const later = await call('POST', '/api/assistant/turn',
      { text: 'What else could we try here?', about: { kind: 'focus', id: id2 } });
    ok('PA-B1 the reply now says what was already tried on the same question',
      /already tried/i.test(said(later)) && /Extra fitness block on Tuesdays/i.test(said(later)));
    ok('PA-B2 …carrying the outcome word that was actually recorded',
      /nothing changed/i.test(said(later)));
    /* THE LAW THAT KEEPS THIS HONEST. A sequence is not a cause, and the limitation travels with
       the answer rather than being left to phrasing. */
    ok('PA-B3 …and never says the attempt caused what followed it',
      limits(later).some(l => /not proof that attempt caused it/i.test(String(l)))
      && !/because of|caused|led to/i.test(said(later)));
    /* AND IT IS STILL A READ, NOT A SUGGESTION ENGINE. The deterministic path reports the record;
       it does not propose the next tactic, which is the boundary the whole product rests on. */
    ok('PA-B4 …and proposes no replacement tactic of its own',
      !/you (should|could) try|i suggest|recommend/i.test(said(later)));

    console.log('\n  C — SCOPED TO THE QUESTION IT WAS ABOUT');
    /* A second question with its own attempt. If the reader matched on resemblance rather than on
       the recorded relationship, this would bleed across. */
    S.inquiryStates[C]['group:n'].m2 = { ...S.inquiryStates[C]['group:n'].m,
      inquiryId: 'q2', topic: { canonicalConcept: 'f.set', label: 'Set pieces' } };
    const g1 = await call('POST', '/api/group/n/focus',
      { text: 'Near post drill every Thursday', fromInquiryId: 'q2' });
    await call('POST', `/api/group/n/focus/${((g1.j || {}).focus || {}).focusId}/outcome`, { result: 'better' });
    const stillLate = await call('POST', '/api/assistant/turn',
      { text: 'What else could we try here?', about: { kind: 'focus', id: id2 } });
    ok('PA-C1 an attempt on a DIFFERENT question does not appear against this one',
      !/Near post drill/i.test(said(stillLate)));
    ok('PA-C2 …while the one that really was about this question still does',
      /Extra fitness block on Tuesdays/i.test(said(stillLate)));

    console.log('\n  D — AND A SUCCESSFUL ATTEMPT IS PRECEDENT, NOT A GUARANTEE');
    const g2 = await call('POST', '/api/group/n/focus',
      { text: 'Another go at set pieces', fromInquiryId: 'q2' });
    const setReply = await call('POST', '/api/assistant/turn',
      { text: 'Where are we with this?', about: { kind: 'focus', id: ((g2.j || {}).focus || {}).focusId } });
    ok('PA-D1 something that DID help is reported with the word that was recorded',
      /already tried/i.test(said(setReply)) && /Near post drill/i.test(said(setReply)));
    ok('PA-D2 …and still carries the causal limitation rather than reading as proof it works',
      limits(setReply).some(l => /not proof that attempt caused it/i.test(String(l))));

  } catch (e) { fail++; console.error('  FAIL prior-attempts suite threw:', e && e.stack); }

  server.close();
  console.log(`\nprior-attempts-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
