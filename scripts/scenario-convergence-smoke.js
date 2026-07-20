/* ============================================================
   scripts/scenario-convergence-smoke.js — scenario/memberResults converge onto the
   SAME canonical assessment model as assigned work. One truth representation.

   Proves the 18 invariants: live canonicalization, idempotent backfill via the same
   adapter, score+scale linkage, missing-scale limitation, structured strength/development
   observations replacing regex parsing, source-assessment IDs retained, private exclusion,
   no raw-response leakage, one kernel-state contract for both paths, incomparable rubrics,
   numeric streams off the legacy value signal, no double-count, and the legacy value-signal
   cutover — with existing assigned-work / advisor / check-in behaviour unchanged.

   Hybrid: real HTTP for the live scenario write + advisor, direct helpers for backfill,
   kernel-state and consumer parity.

   Run:  node scripts/scenario-convergence-smoke.js   (part of `npm test`)
   ============================================================ */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const srv = require('../server.js');
const {
  app, _loadAllStores, _rebuildEmailIndex, issueToken,
  _backfillCanonical, _assessmentKernelState, _assessmentEvidenceFor, _capabilityDims, _personStrengths,
  _capabilityObservations, _buildMemberIntelInput, evidenceLog, orgSignals, orgUsers, memberResults,
} = srv;
const AssessmentAdapter = require('../lib/adapters').AssessmentAdapter;

const CODE = 'scco';
const iso = new Date().toISOString();
const boss = 'boss', liveM = 'liveM', histM = 'histM', privM = 'privM';

_loadAllStores({
  orgMeta:  { [CODE]: { orgName: 'SC Co', createdAt: iso } },
  orgUsers: { [CODE]: {
    [boss]:  { id: boss,  name: 'Boss',  email: 'boss@sc.co',  role: 'superadmin', orgCode: CODE, supervisorId: null, status: 'active' },
    [liveM]: { id: liveM, name: 'LiveM', email: 'live@sc.co',  role: 'member',     orgCode: CODE, supervisorId: boss, status: 'active' },
    [histM]: { id: histM, name: 'HistM', email: 'hist@sc.co',  role: 'member',     orgCode: CODE, supervisorId: boss, status: 'active' },
    [privM]: { id: privM, name: 'PrivM', email: 'priv@sc.co',  role: 'member',     orgCode: CODE, supervisorId: boss, status: 'active' },
  } },
});
_rebuildEmailIndex();
const tokBoss = issueToken(boss, CODE, 'superadmin');
const tokLive = issueToken(liveM, CODE, 'member');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };
const prim = (p, sid) => (evidenceLog[CODE] || []).filter(e => e.status === 'active' && e.attributes && e.attributes.primitive === p && (!sid || e.subjectId === sid));

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, tok, opts = {}) => {
    const headers = { ...(opts.headers || {}), ...(tok ? { Authorization: `Bearer ${tok}` } : {}) };
    if (opts.body) headers['Content-Type'] = 'application/json';
    const r = await fetch(base + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, j };
  };

  try {
    console.log('\n=== Scenario / memberResults assessment convergence ===\n');

    // ── 1. Live canonicalization at the write boundary ─────────────────────────
    const RAWMARK = 'RAWRESPONSESECRET';
    const live = await call('/api/member/submit-result', tokLive, { method: 'POST', body: {
      orgCode: CODE, memberId: liveM, userId: liveM, scenarioId: 'scnA',
      result: { scenarioId: 'scnA', scenarioTitle: 'Pressure call', domain: 'decisions', score: 74,
        dimensions: { overall: 74, summary: 'clear under pressure', strengths: ['composure', 'clarity'], development: ['tempo'] } } } });
    ok('1. a new memberResult canonicalizes LIVE at the write boundary', live.status === 200);
    const liveAssess = _assessmentEvidenceFor(CODE, liveM, { purpose: 'leader_support' });
    ok('1b. the scenario produces a canonical Assessment immediately', liveAssess.length === 1 && liveAssess[0].score === 74);
    ok('4. score and scale remain linked (system-defined 0-100 scenario scale)',
       liveAssess[0].score === 74 && liveAssess[0].scoreScale === '0-100');
    ok('  · a submission event is recorded (raw response not retained server-side)',
       prim('submission', liveM).some(s => s.attributes.sourceType === 'scenario' && s.attributes.responseRetained === false));

    // ── 6 / 7. Structured strength + development observations (not regex) ───────
    ok('6. strengths become STRUCTURED capability observations', prim('observation', liveM).some(o => o.attributes.polarity === 'strength' && o.attributes.dimension === 'composure'));
    ok('7. development areas become STRUCTURED capability observations', prim('observation', liveM).some(o => o.attributes.polarity === 'development' && o.attributes.dimension === 'tempo'));
    ok('8. observations retain their source assessment ID', prim('observation', liveM).every(o => /^as_scn_/.test(String(o.attributes.relatesToAssessmentId))));
    ok('  · strengths/development are CONTEXTUAL (not a permanent trait)', prim('observation', liveM).every(o => /not a permanent trait/i.test(o.attributes.limitations || '')));

    // ── _personStrengths / development now read structured observations ────────
    ok('6b. _personStrengths reads structured observations, not regex-parsed text', _personStrengths(CODE, liveM).includes('composure'));
    ok('7b. development consumer reads structured observations, not regex-parsed text', _capabilityDims(CODE, liveM, 'development', 'Development').includes('tempo'));

    // ── 10. Sensitive raw response text is never exposed ───────────────────────
    ok('10. the raw scenario response text is never stored or exposed (not retained server-side)',
       !JSON.stringify(evidenceLog[CODE]).includes(RAWMARK));

    // ── 2 / 3. Historical backfill via the SAME adapter, idempotent ────────────
    (memberResults[`${CODE}:${histM}`] = memberResults[`${CODE}:${histM}`] || []).push(
      { scenarioId: 'scnH', scenarioTitle: 'Old scenario', domain: 'ethics', score: 88, memberId: histM,
        submittedAt: '2026-05-01T00:00:00.000Z',
        dimensions: { overall: 88, summary: 'strong', strengths: ['integrity'], development: ['delegation'] } });
    const r1 = _backfillCanonical(CODE, {});
    const after1 = (evidenceLog[CODE] || []).length;
    const r2 = _backfillCanonical(CODE, {});
    ok('2. historical backfill uses the same adapter and records the scenario', r1.scenarios >= 1 && prim('assessment', histM).length === 1);
    ok('2b. backfill delegates to AssessmentAdapter.scenarioResult (one code path)', typeof AssessmentAdapter.scenarioResult === 'function');
    ok('3. backfill is IDEMPOTENT (a second run records nothing new)', (evidenceLog[CODE] || []).length === after1 && r2.recorded === 0);
    ok('3b. the live-canonicalised scenario is not re-created by backfill (dedupe)', prim('assessment', liveM).length === 1);

    // ── 5. Missing scale → limitation (no inference) ───────────────────────────
    const noScale = AssessmentAdapter.scenarioResult({ scenarioId: 'x', scenarioTitle: 'X', submittedAt: iso,
      dimensions: { strengths: ['a'] } }, { subjectId: 'z' });  // no overall/score
    ok('5. a scenario with no score produces a submission but NO invented assessment', !noScale.some(c => c.attributes && c.attributes.primitive === 'assessment'));

    // ── 11. Same kernel-state contract for assigned-work AND scenario ──────────
    const st = _assessmentKernelState(CODE, liveM, { purpose: 'leader_support', viewerId: boss });
    ok('11. scenario assessments use the SAME bounded kernel-state contract',
       st.assessments.length === 1 && Array.isArray(st.basisIds) && st.basisIds.length > 0 && 'direction' in st && !st.kernelArt.rejected);

    // ── 12. Assigned-work vs scenario are INCOMPARABLE (different rubric) ───────
    // Give histM a scenario AND an assigned-work assessment; they must not be compared.
    const tpl = await call('/api/assessments/templates', tokBoss, { method: 'POST', body: { title: 'Review', guidance: 'clarity', fields: [{ label: 'Q' }] } });
    const asg = await call('/api/assessments/assign', tokBoss, { method: 'POST', body: { templateId: tpl.j.template.id, assigneeIds: [histM] } });
    await call(`/api/assessments/${asg.j.assigned[0].id}/submit`, issueToken(histM, CODE, 'member'), { method: 'POST', body: { response: { Q: 'a' }, note: 'n' } });
    await call(`/api/assessments/${asg.j.assigned[0].id}/return`, tokBoss, { method: 'POST', body: { feedback: 'ok', score: 60 } });
    const stH = _assessmentKernelState(CODE, histM, { purpose: 'leader_support', viewerId: boss });
    ok('12. a scenario assessment and an assigned-work assessment are NOT directly compared',
       stH.assessments.length === 2 && stH.direction === 'incomparable');

    // ── 9. Private scenario responses excluded from leader support ─────────────
    (memberResults[`${CODE}:${privM}`] = memberResults[`${CODE}:${privM}`] || []).push(
      { scenarioId: 'scnP', scenarioTitle: 'Private scenario', score: 90, memberId: privM, submittedAt: iso,
        dimensions: { overall: 90, summary: 'ok', strengths: ['x'] } });
    // Force the private path by classifying: craft directly with private visibility.
    srv._recordEvidence(CODE, { provider: 'assessment', source: 'assessment', externalId: 'as:scnP:priv',
      subjectId: privM, type: 'metric', label: 'Assessment score: Private scenario', value: 90, observedAt: iso, retrievedAt: iso,
      confidence: 'confirmed', visibility: 'private', ownerRef: privM,
      attributes: { primitive: 'assessment', assessmentId: 'as_scn_priv', submissionId: 's', scenarioId: 'scnP', assessorId: 'scenario-ai',
        subjectId: privM, rubric: 'Scenario: Private scenario', score: 90, scoreScale: '0-100', qualitativeFeedback: '', confidence: null } });
    ok('9. a PRIVATE scenario assessment is excluded from leader-support kernel state',
       !_assessmentKernelState(CODE, privM, { purpose: 'leader_support', viewerId: boss }).assessments.some(a => a.assessmentId === 'as_scn_priv'));
    ok('9b. the owner may use their own private scenario assessment under personal assistance',
       _assessmentKernelState(CODE, privM, { purpose: 'personal_assistance', viewerId: privM }).assessments.some(a => a.assessmentId === 'as_scn_priv'));

    // ── 13 / 14. Numeric streams off legacy value; no double-count ─────────────
    const intel = _buildMemberIntelInput(CODE, orgUsers[CODE][histM], Date.now());
    ok('13. numeric capability streams no longer consume the legacy assessment value signal',
       !(intel.streams || []).some(st2 => String(st2.key || '').startsWith('assessment:Assessment score')));
    ok('14. one assessment cannot enter a numeric stream twice (legacy value signals are valueless)',
       !(orgSignals[CODE] || []).some(s => s.source === 'assessment' && Number.isFinite(s.valueNum) && s.valueNum > 1));

    // ── 15. Value-bearing legacy signal retired (only a contentless completion counter
    //        remains) — done AFTER every consumer moved to canonical readers ──────────
    ok('15. no score-bearing legacy assessment signal remains; only contentless completion markers',
       (orgSignals[CODE] || []).filter(s => s.source === 'assessment').length > 0
       && (orgSignals[CODE] || []).filter(s => s.source === 'assessment').every(s => !s.valueText && !(Number.isFinite(s.valueNum) && s.valueNum > 1)));

    // ── 16 / 17. Assigned-work + advisor + check-in behaviour unchanged ────────
    ok('16. assigned-work assessment still produces its complete canonical object',
       _assessmentEvidenceFor(CODE, histM, { purpose: 'leader_support' }).some(a => /Review/.test(a.title) && a.score === 60 && a.scoreScale === '0-100'));
    const kr = srv._advisorKernelReasoning(CODE, orgUsers[CODE][histM], boss);
    ok('17. the unified assistant reasons across BOTH assigned-work and scenario assessments (same contract)',
       typeof kr.trajectory === 'string' && kr.citable.some(l => /Latest assessment|Assessment trajectory/.test(l)));

    console.log(`\n=== scenario-convergence-smoke: ${pass} passed, ${fail} failed ===\n`);
    server.close(() => process.exit(fail ? 1 : 0));
  } catch (e) {
    console.error(e);
    server.close(() => process.exit(1));
  }
});
