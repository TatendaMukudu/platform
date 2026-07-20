/* ============================================================
   scripts/assessment-presentation-smoke.js — server-supplied assessment PRESENTATION.

   The frontend renders truth; it must not create it. This proves the server presentation
   projection (scale-aware verdict, scoreDisplay with the real scale, audience-safe) and that
   the client no longer derives a qualitative verdict or judgment colour from a raw score.

   HTTP for the projection + authorization; static source guards for the frontend neutralization.

   Run:  node scripts/assessment-presentation-smoke.js   (part of `npm test`)
   ============================================================ */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const fs   = require('fs');
const path = require('path');
const srv  = require('../server.js');
const {
  app, _loadAllStores, _rebuildEmailIndex, issueToken,
  _assessmentPresentationState, ASSESSMENT_VERDICTS, _recordEvidence, orgUsers,
} = srv;

const CODE = 'psco';
const iso = new Date().toISOString();
const boss = 'boss', a50 = 'a50', a100 = 'a100', imp = 'imp', priv = 'priv', noscale = 'noscale', other = 'other';

_loadAllStores({
  orgMeta:  { [CODE]: { orgName: 'PS Co', createdAt: iso } },
  orgUsers: { [CODE]: {
    [boss]:    { id: boss,    name: 'Boss',    email: 'boss@ps.co', role: 'superadmin', orgCode: CODE, supervisorId: null, status: 'active' },
    [a50]:     { id: a50,     name: 'A50',     email: 'a50@ps.co',  role: 'member',     orgCode: CODE, supervisorId: boss, status: 'active' },
    [a100]:    { id: a100,    name: 'A100',    email: 'a100@ps.co', role: 'member',     orgCode: CODE, supervisorId: boss, status: 'active' },
    [imp]:     { id: imp,     name: 'Imp',     email: 'imp@ps.co',  role: 'member',     orgCode: CODE, supervisorId: boss, status: 'active' },
    [priv]:    { id: priv,    name: 'Priv',    email: 'priv@ps.co', role: 'member',     orgCode: CODE, supervisorId: boss, status: 'active' },
    [noscale]: { id: noscale, name: 'NoScale', email: 'ns@ps.co',   role: 'member',     orgCode: CODE, supervisorId: boss, status: 'active' },
    [other]:   { id: other,   name: 'Other',   email: 'ot@ps.co',   role: 'member',     orgCode: CODE, status: 'active' },
  } },
});
_rebuildEmailIndex();

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

let seq = 0;
const craft = (subjectId, { score, scale, rubric, ts, visibility, ownerRef, feedback }) => _recordEvidence(CODE, {
  provider: 'assessment', source: 'assessment', externalId: `as:${subjectId}:${++seq}`, subjectId,
  type: 'metric', label: `Assessment score: ${rubric || 'x'}`, value: score, observedAt: ts || iso, retrievedAt: ts || iso,
  confidence: 'confirmed', visibility: visibility || 'normal', ownerRef: ownerRef || null,
  attributes: { primitive: 'assessment', assessmentId: `as_${subjectId}_${seq}`, submissionId: 's', assessorId: boss,
    subjectId, rubric, score, scoreScale: scale, qualitativeFeedback: feedback || '', confidence: null },
});
const P = (sid, viewer, purpose) => _assessmentPresentationState(CODE, sid, { purpose: purpose || 'leader_support', viewerId: viewer || boss });

const server = app.listen(0, async () => {
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const call = async (p, tok) => { const r = await fetch(baseUrl + p, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} }); let j = null; try { j = await r.json(); } catch (_) {} return { status: r.status, j }; };

  try {
    console.log('\n=== Server-supplied assessment presentation ===\n');

    // ── 1 / 2. Scale-aware verdict; no /100 assumption ─────────────────────────
    craft(a50,  { score: 45, scale: '0-50',  rubric: 'passing' });
    craft(a100, { score: 45, scale: '0-100', rubric: 'passing' });
    const p50 = P(a50), p100 = P(a100);
    ok('1. a 45/50 result does NOT get the same verdict as 45/100', p50.verdict !== p100.verdict && p50.verdict === 'strong' && p100.verdict === 'developing');
    ok('2. scoreDisplay uses the ACTUAL scale, never assuming /100', p50.scoreDisplay === '45 / 50' && p100.scoreDisplay === '45 / 100');
    ok('  · the verdict is a member of the bounded enum', ASSESSMENT_VERDICTS.includes(p50.verdict) && ASSESSMENT_VERDICTS.includes(p100.verdict));

    // ── 3. Incomparable rubrics ────────────────────────────────────────────────
    craft(imp, { score: 80, scale: '0-100', rubric: 'defence', ts: new Date(Date.now() - 10 * 86400000).toISOString() });
    craft(imp, { score: 50, scale: '0-100', rubric: 'set pieces', ts: new Date(Date.now() - 2 * 86400000).toISOString() });
    ok('3. different rubrics produce an INCOMPARABLE presentation, not a decline', P(imp).verdict === 'incomparable' && /not directly comparable/i.test(P(imp).label));

    // ── 4 / 5. Missing scale → limitation; raw score still displayable ─────────
    craft(noscale, { score: 47, scale: '', rubric: 'x' });
    const pns = P(noscale);
    ok('4. a missing scale produces an explicit limitation + uninterpreted verdict',
       pns.verdict === 'uninterpreted' && pns.limitations.some(l => /scale/i.test(l)));
    ok('5. the raw score remains displayable WITHOUT a qualitative verdict', /Score recorded — scale unavailable/.test(pns.scoreDisplay) && pns.verdict === 'uninterpreted');

    // ── 8. Revision + improvement → improving ──────────────────────────────────
    craft(imp, { score: 40, scale: '0-100', rubric: 'closing', ts: new Date(Date.now() - 9 * 86400000).toISOString() });
    craft(imp, { score: 55, scale: '0-100', rubric: 'closing', ts: new Date(Date.now() - 6 * 86400000).toISOString() });
    craft(imp, { score: 78, scale: '0-100', rubric: 'closing', ts: new Date(Date.now() - 1 * 86400000).toISOString() });
    ok('8. improvement across comparable attempts → an "improving" presentation', P(imp).verdict === 'improving' && /improving/i.test(P(imp).label));

    // ── 9. Feedback acted upon without reassessment ────────────────────────────
    _recordEvidence(CODE, { provider: 'assessment', source: 'assessment', externalId: 'rev:imp', subjectId: imp,
      type: 'event', label: 'Revision', valueText: 'iteration 2', observedAt: iso, retrievedAt: iso, confidence: 'confirmed', visibility: 'normal',
      attributes: { primitive: 'revision', submissionId: 's2', previousSubmissionId: 's1', assignmentId: `imp_closing`, iteration: 2, respondsToAssessmentId: 'as_x' } });
    const pImp = P(imp);
    ok('9. feedback acted upon without reassessment is represented accurately',
       pImp.feedbackActedUpon === true && /feedback acted on/i.test(pImp.label));

    // ── 10 / 11. Privacy: private excluded from leader; no raw feedback surfaced ─
    const MARK = 'SECRETFEEDBACKMARKER';
    craft(priv, { score: 90, scale: '0-100', rubric: 'private review', visibility: 'private', ownerRef: priv, feedback: MARK });
    const leaderP = P(priv, boss, 'leader_support');
    const ownerP  = P(priv, priv, 'personal_assistance');
    ok('10. a PRIVATE assessment is excluded from leader-facing presentation', leaderP.verdict === 'unknown' && leaderP.assessmentId === null);
    ok('10b. the owner sees their own private assessment presentation', ownerP.assessmentId !== null && ownerP.scoreDisplay === '90 / 100');
    ok('11. sensitive raw feedback is NEVER surfaced through the projection', !JSON.stringify(ownerP).includes(MARK) && !JSON.stringify(leaderP).includes(MARK));

    // ── 12. Assigned-work + scenario share the SAME presentation contract ──────
    const KEYS = ['assessmentId', 'scoreDisplay', 'verdict', 'label', 'direction', 'comparable', 'confidence', 'limitations', 'basisIds', 'revisionState', 'feedbackActedUpon'];
    craft(a100, { score: 70, scale: '0-100', rubric: 'Scenario: X (decisions)' });   // scenario-shaped rubric
    ok('12. assigned-work and scenario assessments use the SAME presentation contract', KEYS.every(k => k in P(a100)) && KEYS.every(k => k in p50));

    // ── Endpoint authorization ─────────────────────────────────────────────────
    const tokBoss = issueToken(boss, CODE, 'superadmin');
    const tokA50  = issueToken(a50, CODE, 'member');
    const tokOther = issueToken(other, CODE, 'member');
    ok('E1. the member gets their OWN presentation (personal assistance)', (await call(`/api/assessments/${a50}/presentation`, tokA50)).j?.presentation?.scoreDisplay === '45 / 50');
    ok('E2. a leader gets a member presentation (leader support)', (await call(`/api/assessments/${a50}/presentation`, tokBoss)).status === 200);
    ok('E3. an unrelated member is denied (403)', (await call(`/api/assessments/${a50}/presentation`, tokOther)).status === 403);
    ok('E4. the endpoint requires auth (401)', (await call(`/api/assessments/${a50}/presentation`, null)).status === 401);

    // ── 6 / 7. Frontend neutralization (static source guards) ──────────────────
    const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    const win = (src, marker, n = 260) => { const i = src.indexOf(marker); return i >= 0 ? src.slice(i, i + n) : ''; };
    const ui = read('js/ui.js'), mv = read('js/member-view.js'), sc = read('js/scenarios.js');
    ok('6. ui.scoreLabel no longer derives a qualitative verdict from a raw score',
       !/Excellent|Good|Average|Needs Support/.test(win(ui, 'function scoreLabel')) && /NEUTRALIZED/.test(win(ui, 'function scoreLabel')));
    ok('6b. scenarios.getScoreLabel no longer derives a verdict from a raw score',
       !/Exceptional|Strong|Developing|Needs Work/.test(win(sc, 'getScoreLabel(')) && /score >= 85/.test(win(sc, 'getScoreLabel(')) === false);
    ok('6c. member-view._scoreLabel no longer derives a verdict from a raw score',
       !/Exceptional|Strong|Developing|Needs Work/.test(win(mv, '_scoreLabel(v)')));
    ok('7. ui.scoreColor no longer maps a raw score to a judgment colour (no thresholds)',
       !/>=\s*\d/.test(win(ui, 'function scoreColor')) && !/--success|--danger/.test(win(ui, 'function scoreColor')));
    ok('7b. member-view._scoreColor no longer maps a raw score to a judgment colour',
       !/>=\s*\d/.test(win(mv, '_scoreColor(v)')));
    ok('7c. a bounded server-verdict → style map exists (the only sanctioned score-to-visual mapping)',
       /function verdictStyle/.test(ui) && /VERDICT_STYLE/.test(ui));
    ok('7d. the member view consumes the server presentation endpoint + verdictStyle',
       /\/api\/assessments\/.*\/presentation/.test(mv) && /verdictStyle/.test(mv) && /data-assessment-verdict/.test(mv));

    console.log(`\n=== assessment-presentation-smoke: ${pass} passed, ${fail} failed ===\n`);
    server.close(() => process.exit(fail ? 1 : 0));
  } catch (e) {
    console.error(e);
    server.close(() => process.exit(1));
  }
});
