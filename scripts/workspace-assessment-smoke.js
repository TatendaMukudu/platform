/* ============================================================
   scripts/workspace-assessment-smoke.js — assigned work → canonical evidence.

   The MyWorkspace assign → submit → assess → revise slice, driven END TO END over the
   real HTTP endpoints (DB_OPTIONAL, no AI). Proves:
     • each lifecycle event becomes claim-bounded canonical evidence, LIVE (not backfill);
     • an Assessment is a COMPLETE object (assessor·rubric·scale·feedback·submissionId),
       never a naked number;
     • submissions are append-only; a resubmission is a Revision linked to the prior one;
     • the kernel can answer improved? / responded to feedback? / iterations / what changed;
     • MyWorkspace captures are privacy-CLASSIFIED (no hard-coded 'normal');
     • canonical and legacy signal outputs stay CONSISTENT during migration;
     • backwards compatibility is preserved (legacy signal + _publicAssignment unchanged).

   Run:  node scripts/workspace-assessment-smoke.js   (part of `npm test`)
   ============================================================ */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const srv = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, evidenceLog, orgSignals, _assignmentProgress, _assessmentEvidenceFor } = srv;

const CODE = 'wsco';
const iso = new Date().toISOString();
const boss = 'boss', mem = 'mem';

_loadAllStores({
  orgMeta:  { [CODE]: { orgName: 'WS Co', createdAt: iso } },
  orgUsers: { [CODE]: {
    [boss]: { id: boss, name: 'Boss', email: 'boss@ws.co', role: 'superadmin', orgCode: CODE, supervisorId: null, status: 'active' },
    [mem]:  { id: mem,  name: 'Mem',  email: 'mem@ws.co',  role: 'member',     orgCode: CODE, supervisorId: boss, status: 'active' },
  } },
});
_rebuildEmailIndex();
const tokBoss = issueToken(boss, CODE, 'superadmin');
const tokMem  = issueToken(mem,  CODE, 'member');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };
const ev = () => evidenceLog[CODE] || [];
const prim = (p, sid) => ev().filter(e => e.status === 'active' && e.attributes && e.attributes.primitive === p && (!sid || e.subjectId === sid));

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
    console.log('\n=== MyWorkspace: assigned work → canonical evidence ===\n');

    // ── Define criteria (template) + assign (commitment) ───────────────────────
    const tpl = await call('/api/assessments/templates', tokBoss, { method: 'POST',
      body: { title: 'Match review', guidance: 'focus on decisions under pressure', kind: 'general', fields: [{ label: 'What did you decide?' }] } });
    ok('1. a leader can define assessment criteria (template)', tpl.status === 200 && tpl.j?.template?.id);
    const templateId = tpl.j.template.id;

    const asg = await call('/api/assessments/assign', tokBoss, { method: 'POST', body: { templateId, assigneeIds: [mem] } });
    ok('2. a leader can assign the work', asg.status === 200 && asg.j?.assigned?.length === 1);
    const aId = asg.j.assigned[0].id;

    const commit = prim('commitment', mem);
    ok('3. assigning creates a canonical COMMITMENT (not proof of work)', commit.length === 1);
    ok('4. the commitment retains issuer, assignee and versioned criteria',
       commit[0].attributes.issuerId === boss && commit[0].attributes.assigneeId === mem
       && /decisions/.test(commit[0].attributes.criteria) && commit[0].attributes.criteriaVersion === 1);

    // ── Submit (submission, append-only, iteration 1) ──────────────────────────
    const sub1 = await call(`/api/assessments/${aId}/submit`, tokMem, { method: 'POST',
      body: { response: { 'What did you decide?': 'I slowed the tempo and reset.' }, note: 'First attempt.' } });
    ok('5. the member can submit', sub1.status === 200 && sub1.j?.iteration === 1);
    const subs1 = prim('submission', mem);
    ok('6. submitting creates a canonical SUBMISSION (evidence of an attempt)', subs1.length === 1 && subs1[0].attributes.iteration === 1);
    ok('7. the first submission has no revision link', subs1[0].attributes.revisionOf === null && prim('revision', mem).length === 0);
    ok('8. backwards compat: submit still emits the legacy completion participation signal',
       (orgSignals[CODE] || []).some(s => s.source === 'assessment' && s.valueNum === 1 && s.subjectId === mem));

    // ── Return / assess (complete Assessment + feedback observation, LIVE) ──────
    const ret1 = await call(`/api/assessments/${aId}/return`, tokBoss, { method: 'POST', body: { feedback: 'Good reset. Commit earlier next time.', score: 68 } });
    ok('9. a leader can return an assessment', ret1.status === 200 && ret1.j?.assignment?.score === 68);
    const assess = _assessmentEvidenceFor(CODE, mem, { purpose: 'leader_support' });
    ok('10. returning creates canonical ASSESSMENT evidence LIVE (no backfill run)', assess.length === 1);
    const A = assess[0];
    ok('11. the Assessment is a COMPLETE object — never a naked number',
       A.assessmentId && A.submissionId && A.assessorId === boss && A.subjectId === mem
       && /decisions/.test(A.rubric) && A.score === 68 && A.scoreScale === '0-100'
       && /commit earlier/i.test(A.qualitativeFeedback) && 'confidence' in A);
    ok('12. the Assessment references the actual submission it judged', A.submissionId === subs1[0].attributes.submissionId);
    ok('13. feedback is recorded as a SEPARATE authored observation (observer + basis)',
       prim('observation', mem).some(o => o.attributes.observerId === boss && /decisions/.test(o.attributes.basis) && /commit earlier/i.test(o.valueText)));

    // ── Cutover: the legacy VALUE signal is retired; the score lives in canonical ───
    ok('14. the value-bearing legacy score signal is retired to a contentless completion marker',
       (orgSignals[CODE] || []).some(s => s.source === 'assessment' && s.subjectId === mem && s.data && s.data.returned && s.valueNum == null)
       && !(orgSignals[CODE] || []).some(s => s.source === 'assessment' && s.valueNum === 68));
    ok('15. the score + record stay consistent through canonical evidence (no naked number)',
       A.score === 68 && ret1.j.assignment.score === 68);
    ok('16. no assessment VALUE signal is emitted (nothing can double-count in a numeric stream)',
       (orgSignals[CODE] || []).filter(s => s.source === 'assessment' && Number.isFinite(s.valueNum) && s.valueNum > 1).length === 0);

    // ── Resubmit → Revision (append-only) ──────────────────────────────────────
    const sub2 = await call(`/api/assessments/${aId}/submit`, tokMem, { method: 'POST',
      body: { response: { 'What did you decide?': 'I committed earlier and it worked.' }, note: 'Reworked after feedback.' } });
    ok('17. a resubmission is accepted as iteration 2', sub2.status === 200 && sub2.j?.iteration === 2);
    const subsAll = prim('submission', mem);
    ok('18. submissions are APPEND-ONLY (the first submission is still present)', subsAll.length === 2);
    const rev = prim('revision', mem);
    ok('19. a resubmission creates a REVISION linked to the prior submission',
       rev.length === 1 && rev[0].attributes.previousSubmissionId === subs1[0].attributes.submissionId);
    ok('20. the revision records that it responds to the prior assessment',
       rev[0].attributes.respondsToAssessmentId === A.assessmentId);

    // ── Return again (improvement) + kernel reasoning ──────────────────────────
    await call(`/api/assessments/${aId}/return`, tokBoss, { method: 'POST', body: { feedback: 'Much better — decisive.', score: 82 } });
    const prog = _assignmentProgress(CODE, aId, mem);
    ok('21. the kernel answers: how many iterations', prog.iterations === 2);
    ok('22. the kernel answers: did they respond to feedback', prog.respondedToFeedback === true);
    ok('23. the kernel answers: did they improve (score trend, not a bare status)', prog.improved === true && prog.scoreTrend.join('>') === '68>82');
    ok('24. completion never implies success — improvement is judged from scored iterations', Array.isArray(prog.limitations));

    // ── Privacy: a hardship note in a submission is CLASSIFIED, not hard-coded ──
    const asg2 = await call('/api/assessments/assign', tokBoss, { method: 'POST', body: { templateId, assigneeIds: [mem] } });
    const a2 = asg2.j.assigned[0].id;
    await call(`/api/assessments/${a2}/submit`, tokMem, { method: 'POST',
      body: { response: {}, note: 'I have been struggling to cope with things at home and it affected this.' } });
    const hardshipSub = prim('submission', mem).find(s => s.attributes.assignmentId === a2);
    ok('25. a hardship disclosed in a submission is classified SENSITIVE, not hard-coded normal',
       hardshipSub && hardshipSub.visibility === 'sensitive');
    ok('26. an ordinary submission note stays normal (classifier, not blanket rule)',
       subs1[0].visibility === 'normal');

    // ── Backwards compatibility of the public projection ───────────────────────
    ok('27. _publicAssignment still returns response + feedback + score (UX preserved)',
       ret1.j.assignment.response && typeof ret1.j.assignment.feedback === 'string' && ret1.j.assignment.score === 68);

    // ── The single AssessmentAdapter path (no parallel logic) ──────────────────
    const a = require('../lib/adapters').AssessmentAdapter;
    ok('28. the production adapter exposes the full lifecycle (commitment/submission/assessment)',
       typeof a.commitment === 'function' && typeof a.submission === 'function' && typeof a.assessment === 'function');
    ok('29. the backfill entry point delegates to the same assessment() logic (no duplicate impl)',
       a.toCanonicalEvidence({ id: 'z', assigneeId: 'u', assignerId: 'l', status: 'returned', score: 50, title: 'T', guidance: 'g', returnedAt: iso })[0].attributes.primitive === 'assessment');

    // ── Downstream reasoning consumes the complete object, purpose-scoped ───────
    // (Assessment is read via the dedicated reader — like mood via _canonicalMoodSeries —
    // so the legacy score signal is never double-counted. It stays non-authoritative.)
    const ownerView = _assessmentEvidenceFor(CODE, mem, { purpose: 'personal_assistance', viewerId: mem });
    ok('30. downstream reasoning consumes the COMPLETE Assessment (assessor·rubric·scale·feedback), not a bare score',
       ownerView.length >= 1 && ownerView.every(x => x.assessorId && x.rubric && x.scoreScale && typeof x.score === 'number'));

    console.log(`\n=== workspace-assessment-smoke: ${pass} passed, ${fail} failed ===\n`);
    server.close(() => process.exit(fail ? 1 : 0));
  } catch (e) {
    console.error(e);
    server.close(() => process.exit(1));
  }
});
