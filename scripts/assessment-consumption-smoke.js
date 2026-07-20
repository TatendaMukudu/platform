/* ============================================================
   scripts/assessment-consumption-smoke.js — the unified assistant consumes the
   COMPLETE canonical Assessment (scale-aware, journey-aware), not a naked score.

   Proves the 12 invariants of the assessment-consumption slice:
     • the assistant/advisor reasons from the full Assessment object live;
     • score and scale travel together; 45/50 ≠ 45/100;
     • incompatible rubrics are not compared; missing scale/rubric → a limitation;
     • a revision linked to feedback is recognised as responding to feedback;
     • private assessments are excluded from leader-support; sensitive feedback is not quoted;
     • one real assessment is never double-counted; basis IDs stay inspectable;
     • existing non-assessment advisor behaviour is unchanged.

   Hybrid: real HTTP flow for live/advisor paths + crafted canonical evidence for the
   scale/comparability/privacy cases (which the endpoints can't express on a 0-100 scale).

   Run:  node scripts/assessment-consumption-smoke.js   (part of `npm test`)
   ============================================================ */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const srv = require('../server.js');
const {
  app, _loadAllStores, _rebuildEmailIndex, issueToken,
  _assessmentKernelState, _assessmentConcerns, _scaleMax, _advisorKernelReasoning, _buildMemberIntelInput,
  _recordEvidence, _assessmentEvidenceFor, evidenceLog, orgSignals, orgUsers,
} = srv;

const CODE = 'acco';
const iso = new Date().toISOString();
const boss = 'boss', mem = 'mem', sub2 = 'sub2';

_loadAllStores({
  orgMeta:  { [CODE]: { orgName: 'AC Co', createdAt: iso } },
  orgUsers: { [CODE]: {
    [boss]: { id: boss, name: 'Boss', email: 'boss@ac.co', role: 'superadmin', orgCode: CODE, supervisorId: null, status: 'active' },
    [mem]:  { id: mem,  name: 'Mem',  email: 'mem@ac.co',  role: 'member',     orgCode: CODE, supervisorId: boss, status: 'active' },
    [sub2]: { id: sub2, name: 'Sub2', email: 's2@ac.co',   role: 'member',     orgCode: CODE, supervisorId: boss, status: 'active' },
  } },
  memberGoals: { [`${CODE}:${mem}`]: { goal: 'sharpen decisions' } },
});
_rebuildEmailIndex();
const tokBoss = issueToken(boss, CODE, 'superadmin');
const tokMem  = issueToken(mem,  CODE, 'member');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

// Craft a canonical assessment directly (unpromoted, exactly like production) so we can vary
// scale/rubric/visibility that the 0-100 endpoints cannot express.
let _seq = 0;
const craftAssessment = (subjectId, { score, scale, rubric, assignmentId, ts, visibility, ownerRef, feedback }) => {
  const aid = assignmentId || `craft${++_seq}`;
  const r = _recordEvidence(CODE, {
    provider: 'assessment', source: 'assessment', externalId: `as:${aid}:${ts}:${score}`,
    subjectId, type: 'metric', label: `Assessment score: ${aid}`, value: score,
    observedAt: ts, retrievedAt: ts, confidence: 'confirmed', visibility: visibility || 'normal', ownerRef: ownerRef || null,
    attributes: { primitive: 'assessment', assessmentId: `as_${aid}`, submissionId: `sub_${aid}`, assessorId: boss,
      subjectId, rubric, score, scoreScale: scale, qualitativeFeedback: feedback || '', confidence: null },
  });
  return r;
};

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
    console.log('\n=== Complete-assessment consumption (unified assistant) ===\n');

    // ── LIVE flow (no backfill): assign → submit → return, then reason ─────────
    const tpl = await call('/api/assessments/templates', tokBoss, { method: 'POST',
      body: { title: 'Decisions review', guidance: 'clarity under pressure', kind: 'general', fields: [{ label: 'Decision?' }] } });
    const asg = await call('/api/assessments/assign', tokBoss, { method: 'POST', body: { templateId: tpl.j.template.id, assigneeIds: [mem] } });
    const aId = asg.j.assigned[0].id;
    await call(`/api/assessments/${aId}/submit`, tokMem, { method: 'POST', body: { response: { Decision: 'reset tempo' }, note: 'v1' } });
    await call(`/api/assessments/${aId}/return`, tokBoss, { method: 'POST', body: { feedback: 'clearer structure needed', score: 62 } });

    const stLive = _assessmentKernelState(CODE, mem, { purpose: 'leader_support', viewerId: boss });
    ok('1. the assistant uses a complete canonical assessment LIVE (no backfill run)', !!stLive.latest && stLive.latest.score === 62);
    ok('2. score and scale travel together', stLive.latest.score === 62 && stLive.latest.scoreScale === '0-100' && !!stLive.latest.rubric);

    // Resubmit after feedback → revision → responded to feedback.
    await call(`/api/assessments/${aId}/submit`, tokMem, { method: 'POST', body: { response: { Decision: 'committed earlier' }, note: 'v2 reworked' } });
    const stRev = _assessmentKernelState(CODE, mem, { purpose: 'leader_support', viewerId: boss });
    ok('5. a revision linked to feedback is recognised as responding to feedback', stRev.feedbackActedUpon === true && stRev.iterations === 2);

    // ── Scale-awareness: 45/50 is NOT a concern; 45/100 IS ─────────────────────
    craftAssessment(mem, { score: 45, scale: '0-50',  rubric: 'passing', assignmentId: 'k50',  ts: new Date(Date.now() - 3 * 86400000).toISOString() });
    craftAssessment(sub2, { score: 45, scale: '0-100', rubric: 'passing', assignmentId: 'k100', ts: new Date(Date.now() - 3 * 86400000).toISOString() });
    ok('3. a 45/50 assessment does NOT trigger the concern rule that 45/100 does',
       _assessmentConcerns(CODE, mem).every(c => true) && !_assessmentConcerns(CODE, mem).some(c => /k50/.test(String(c.evidenceId)) )
       && _assessmentConcerns(CODE, sub2).length === 1);
    ok('3b. the scale ceiling is parsed correctly (0-50 → 50, 0-100 → 100)', _scaleMax('0-50') === 50 && _scaleMax('0-100') === 100 && _scaleMax('band') === null);

    // ── Incompatible rubrics are not directly compared ─────────────────────────
    const T = t => new Date(Date.now() - t * 86400000).toISOString();
    craftAssessment(sub2, { score: 80, scale: '0-100', rubric: 'defensive shape', assignmentId: 'r1', ts: T(10) });
    craftAssessment(sub2, { score: 40, scale: '0-100', rubric: 'set-piece delivery', assignmentId: 'r2', ts: T(2) });
    const stIncomp = _assessmentKernelState(CODE, sub2, { purpose: 'leader_support', viewerId: boss });
    ok('4. assessments with different rubrics are NOT directly compared (incomparable, not decline)',
       stIncomp.direction === 'incomparable' && stIncomp.limitations.some(l => /different scales or rubrics/i.test(l)));

    // ── Missing scale/rubric → a limitation, not an invented interpretation ─────
    orgUsers[CODE].m3 = { id: 'm3', name: 'M3', email: 'm3@ac.co', role: 'member', orgCode: CODE, supervisorId: boss, status: 'active' };
    craftAssessment('m3', { score: 30, scale: '', rubric: '', assignmentId: 'nr', ts: T(1) });
    const stMissing = _assessmentKernelState(CODE, 'm3', { purpose: 'leader_support', viewerId: boss });
    ok('9. a missing scale/rubric produces a LIMITATION rather than an interpretation',
       stMissing.direction === 'unknown' && stMissing.limitations.some(l => /missing its scale or rubric/i.test(l)));

    // ── Basis IDs remain inspectable on the kernel state ───────────────────────
    ok('10. basis evidence IDs remain inspectable on the assessment kernel state',
       Array.isArray(stRev.basisIds) && stRev.basisIds.length > 0 && stRev.kernelArt.basis.length > 0 && !stRev.kernelArt.rejected);

    // ── Privacy: private assessment excluded from leader-support, owner-visible ─
    craftAssessment('m3', { score: 90, scale: '0-100', rubric: 'private self-review', assignmentId: 'priv', ts: T(1), visibility: 'private', ownerRef: 'm3' });
    const leaderView = _assessmentKernelState(CODE, 'm3', { purpose: 'leader_support', viewerId: boss });
    const ownerView  = _assessmentKernelState(CODE, 'm3', { purpose: 'personal_assistance', viewerId: 'm3' });
    ok('6. a PRIVATE assessment is excluded from leader-support reasoning',
       !leaderView.assessments.some(a => a.assessmentId === 'as_priv'));
    ok('6b. the owner CAN use their own private assessment under personal assistance',
       ownerView.assessments.some(a => a.assessmentId === 'as_priv'));

    // ── Sensitive feedback is not quoted through the assistant ─────────────────
    const MARKER = 'ZZTOPSECRETFEEDBACKMARKER';
    craftAssessment(mem, { score: 70, scale: '0-100', rubric: 'closing games', assignmentId: 'fb', ts: T(1), feedback: MARKER });
    // Also craft the feedback as an authored observation carrying the marker text.
    _recordEvidence(CODE, { provider: 'assessment', source: 'assessment', externalId: 'obs:fb', subjectId: mem,
      type: 'observation', label: 'Feedback: fb', valueText: MARKER, observedAt: T(1), retrievedAt: T(1),
      confidence: 'confirmed', visibility: 'normal',
      attributes: { primitive: 'observation', observerId: boss, subjectId: mem, dimension: 'closing games', basis: 'closing games', relatesToAssessmentId: 'as_fb' } });
    const kr = _advisorKernelReasoning(CODE, orgUsers[CODE][mem], boss);
    const advisorText = JSON.stringify([kr.citable, kr.informing, kr.informingStrings]);
    ok('7. sensitive/raw qualitative feedback is NOT quoted through the assistant', !advisorText.includes(MARKER));
    ok('7b. the assistant still USES the assessment (themes/dimensions), just not the raw text',
       kr.citable.some(l => /Latest assessment|Assessment trajectory|Feedback dimensions/.test(l)));

    // ── Double-counting audit: one real assessment counted once everywhere ─────
    // The live return (aId, score 62) emitted ONE legacy signal; the canonical assessment
    // is unpromoted. Add a LOW canonical assessment and confirm a single concern count.
    const lowIso = T(1);
    craftAssessment(mem, { score: 30, scale: '0-100', rubric: 'closing games', assignmentId: 'low1', ts: lowIso });
    const lowTs = new Date(lowIso).getTime();
    const valueSignals = (orgSignals[CODE] || []).filter(s => s.source === 'assessment' && Number.isFinite(s.valueNum) && s.valueNum > 1);
    const intel = _buildMemberIntelInput(CODE, orgUsers[CODE][mem], Date.now());
    const concernAtLow = intel.concernSeries.filter(c => Math.abs(c.t - lowTs) < 1000).length;
    ok('8. no value-bearing legacy assessment signal exists (retired at cutover — nothing to double-count)', valueSignals.length === 0);
    ok('8b. a low canonical assessment is counted ONCE in concern detection (single source of truth)',
       _assessmentConcerns(CODE, mem).filter(c => c.t === lowTs).length === 1 && concernAtLow === 1);
    ok('8c. the legacy assessment value never enters the numeric capability streams',
       !(intel.streams || []).some(st => String(st.key || '').startsWith('assessment:Assessment score')));

    // ── Existing non-assessment advisor behaviour unchanged ────────────────────
    ok('11. non-assessment advisor behaviour is unchanged (mood trajectory + anchoring still produced)',
       typeof kr.trajectory === 'string' && Array.isArray(kr.citable) && kr.citable.some(l => /MEMBER aim/.test(l)));

    console.log(`\n=== assessment-consumption-smoke: ${pass} passed, ${fail} failed ===\n`);
    server.close(() => process.exit(fail ? 1 : 0));
  } catch (e) {
    console.error(e);
    server.close(() => process.exit(1));
  }
});
