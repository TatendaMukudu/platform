/* ============================================================
   scripts/advisor-migration-smoke.js — the member advisor on the canonical
   reasoning architecture (privacy-critical surface, proven independently).

   The advisor must:
     • retrieve ONLY leader-authorised CANONICAL evidence (never raw signals),
     • NEVER see private evidence (excluded by the leader_support gateway BEFORE
       any context is built — so it cannot leak what it cannot see),
     • reconstruct member state in the KERNEL with basis evidence IDs,
     • treat SENSITIVE evidence as inform-only (never quoted), NORMAL as quotable,
     • record meaningful recommendations as canonical DERIVED evidence,
     • bound every answer through the POST-KERNEL boundary (cite only authorised).

   Pure/deterministic: exercises the reasoning helpers directly (no AI, no DB).

   Run:  node scripts/advisor-migration-smoke.js   (part of `npm test`)
   ============================================================ */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const fs   = require('fs');
const path = require('path');
const srv  = require('../server.js');
const {
  _loadAllStores, _rebuildEmailIndex,
  _advisorKernelReasoning, _canonicaliseCheckin, _canonicalContext, _backfillCanonical,
  _recordEvidence, _promoteEvidence, _recordDerivedEvidence, _composeForAudience, _kernelEvidence,
  _isCanonicalEvidence, evidenceLog, reasoningArtifacts, assessmentAssignments, advisorThreads,
} = srv;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const CODE = 'adv';
_loadAllStores({
  orgMeta:  { [CODE]: { orgName: 'Advisory Co', createdAt: new Date().toISOString() } },
  orgValues:{ [CODE]: ['honesty', 'care'] },
  orgGoals: { [CODE]: [{ text: 'ship reliably' }] },
  memberGoals: { [`${CODE}:sam`]: { goal: 'Become a reliable finisher' } },   // sam is ANCHORED
  orgUsers: { [CODE]: {
    boss:   { id: 'boss',   name: 'Boss',   email: 'boss@ad.co',   role: 'admin',  orgCode: CODE, status: 'active' },
    sam:    { id: 'sam',    name: 'Sam',    email: 'sam@ad.co',    role: 'member', orgCode: CODE, supervisorId: 'boss', status: 'active' },
    deb:    { id: 'deb',    name: 'Deb',    email: 'deb@ad.co',    role: 'member', orgCode: CODE, supervisorId: 'boss', status: 'active' },
    rho:    { id: 'rho',    name: 'Rho',    email: 'rho@ad.co',    role: 'member', orgCode: CODE, supervisorId: 'boss', status: 'active' },
    newbie: { id: 'newbie', name: 'Newbie', email: 'new@ad.co',   role: 'member', orgCode: CODE, supervisorId: 'boss', status: 'active' },
    other:  { id: 'other',  name: 'Other',  email: 'other@ad.co',  role: 'member', orgCode: CODE, supervisorId: 'boss', status: 'active' },
  } },
});
_rebuildEmailIndex();

const ev = () => evidenceLog[CODE] || [];
const seedObs = (subjectId, extId, text, visibility) => {
  const r = _recordEvidence(CODE, {
    provider: 'workspace', source: 'workspace', subjectId, externalId: extId,
    type: 'observation', label: 'Observation (statement)', valueText: text,
    observedAt: '2026-06-10T00:00:00.000Z', retrievedAt: '2026-06-10T00:00:00.000Z',
    confidence: 'confirmed', visibility,
  });
  if (r.stored) _promoteEvidence(CODE, r.envelope);
  return r;
};

const HARDSHIP = 'I have not slept and I am really struggling to cope';
const SENS_OBS = 'mentioned tension at home is affecting focus';
const NORM_OBS = 'Volunteered to mentor a new teammate';

// ── Seed SAM: declining mood series + a PRIVATE hardship note + assessment +
//    a NORMAL observation (quotable) + a SENSITIVE observation (inform-only) ──
[5, 5, 4, 2, 1, 1].forEach((mood, i) =>
  _canonicaliseCheckin(CODE, 'sam', { id: `sam_ci_${i}`, mood, ts: `2026-06-0${i + 1}T08:00:00.000Z` }));
_canonicaliseCheckin(CODE, 'sam', { id: 'sam_hard', mood: 2, note: HARDSHIP, ts: '2026-06-07T08:00:00.000Z' });
(assessmentAssignments[CODE] = assessmentAssignments[CODE] || []).push(
  { id: 'sam_as1', assigneeId: 'sam', assignerId: 'boss', status: 'returned', score: 72, title: 'Match review', guidance: 'decisions', returnedAt: '2026-06-08T00:00:00.000Z' });
_backfillCanonical(CODE, {});
seedObs('sam', 'sam_obs_norm', NORM_OBS, 'normal');
seedObs('sam', 'sam_obs_sens', SENS_OBS, 'sensitive');

// ── Seed comparators: rho recovering, deb declining, other (isolation), newbie empty ──
[1, 1, 2, 4, 5, 5].forEach((mood, i) => _canonicaliseCheckin(CODE, 'rho', { id: `rho_ci_${i}`, mood, ts: `2026-06-0${i + 1}T08:00:00.000Z` }));
[5, 5, 4, 2, 1, 1].forEach((mood, i) => _canonicaliseCheckin(CODE, 'deb', { id: `deb_ci_${i}`, mood, ts: `2026-06-0${i + 1}T08:00:00.000Z` }));
seedObs('other', 'other_obs', 'Other person private-to-their-own-context note', 'normal');

console.log('\n=== Advisor migration — canonical evidence · kernel · post-kernel ===\n');

// ─────────────────────────────────────────────────────────────────────────────
// A. RETRIEVAL — canonical evidence only, leader-authorised, purpose-scoped
// ─────────────────────────────────────────────────────────────────────────────
const kr = _advisorKernelReasoning(CODE, srv.orgUsers[CODE].sam, 'boss');
ok('1. the advisor retrieves canonical evidence only (every item __canonical)', kr.evidence.length > 0 && kr.evidence.every(_isCanonicalEvidence));
ok('2. retrieval is purpose-scoped to leader_support (matches the shared gateway)',
   (() => { const g = _canonicalContext({ code: CODE, viewerId: 'boss', purpose: 'leader_support', subjectId: 'sam' }); return g.length === kr.evidence.length; })());
ok('3. retrieval is subject-scoped — no other member\'s evidence leaks in', kr.evidence.every(e => e.subjectId === 'sam' || e.subjectId == null));

// The PRIVATE hardship note — the single most important invariant.
const privNote = ev().find(e => e.subjectId === 'sam' && e.visibility === 'private' && (e.valueText || '').includes(HARDSHIP));
ok('4. the hardship note exists as PRIVATE canonical evidence (owner-only)', !!privNote && privNote.ownerRef === 'sam' && privNote.promoted !== true);
ok('5. the advisor context EXCLUDES the private hardship note (gateway, before context)', !kr.evidence.some(e => e.evidenceId === privNote.id));
ok('6. the private note TEXT never appears in any citable line', !kr.citable.some(l => l.includes(HARDSHIP)));
ok('7. the private note TEXT never appears in any informing line', !kr.informing.some(l => l.includes(HARDSHIP)));
ok('8. the private note is not in the kernel basis', !kr.basis.includes(privNote.id));

// ─────────────────────────────────────────────────────────────────────────────
// B. KERNEL — member state reconstructed here, with basis IDs + confidence
// ─────────────────────────────────────────────────────────────────────────────
ok('9. a kernel derivation artifact is recorded', !!kr.kernelArt && kr.kernelArt.stage === 'kernel');
ok('10. the kernel artifact retains basis evidence IDs', Array.isArray(kr.kernelArt.basis) && kr.kernelArt.basis.length > 0);
ok('11. the kernel artifact was NOT rejected (valid kernel output)', !kr.kernelArt.rejected);
ok('12. the kernel basis equals the authorised evidence set', kr.kernelArt.basis.join('|') === kr.basis.join('|'));
ok('13. the kernel carries a confidence + limitations', !!kr.kernelArt.confidence && Array.isArray(kr.kernelArt.limitations) && kr.kernelArt.limitations.length > 0);
ok('14. trajectory is a DIRECTIONAL word, never a numeric grade', ['converging', 'sustaining', 'stalled', 'diverging', 'unanchored', 'unknown'].includes(kr.trajectory));
ok('15. a declining mood series reconstructs as DIVERGING', kr.trajectory === 'diverging');
ok('16. the state result carries no numeric alignment score', !/\b\d+%/.test(JSON.stringify(kr.kernelArt.result)));

// ─────────────────────────────────────────────────────────────────────────────
// C. CONTEXT TIERS — normal quotable · sensitive informs only · anchors are frames
// ─────────────────────────────────────────────────────────────────────────────
ok('17. a NORMAL observation is quotable (appears in citable)', kr.citable.some(l => l.includes(NORM_OBS)));
ok('18. a SENSITIVE observation informs only — never in citable', !kr.citable.some(l => l.includes(SENS_OBS)));
ok('19. a SENSITIVE observation appears in the inform-only tier', kr.informing.some(l => l.includes(SENS_OBS)));
ok('20. the sensitive span is registered for last-line redaction', kr.informingStrings.some(s => s.includes(SENS_OBS)));
ok('21. mood is referenced as an AGGREGATE, not a quoted individual reading', kr.citable.some(l => /Recent mood:.*aggregate/i.test(l)));
ok('22. the member aim (anchor) is present as a reference frame', kr.citable.some(l => /MEMBER aim/.test(l) && /reliable finisher/i.test(l)));
ok('23. org values (guardrails) are present as a frame', kr.citable.some(l => /ORG values/.test(l) && /honesty/.test(l)));
ok('24. the directional kernel state is surfaced in words', kr.citable.some(l => /Kernel state: trajectory diverging/.test(l)));

// ─────────────────────────────────────────────────────────────────────────────
// D. POST-KERNEL — bound the answer to the kernel + the leader's authorised set
// ─────────────────────────────────────────────────────────────────────────────
const composed = _composeForAudience(CODE, kr.kernelArt, { role: 'admin', subjectId: 'sam', viewerId: 'boss', purpose: 'leader_support', text: 'Sam is trending down; a direct, supportive check-in this week is worth it.' });
ok('25. post-kernel composition is bounded (ok)', composed.ok === true);
ok('26. post-kernel cites only leader-authorised evidence', composed.output.cites.every(id => kr.basis.includes(id)));
ok('27. post-kernel NEVER cites the private hardship note', !composed.output.cites.includes(privNote.id));
ok('28. post-kernel does not raise the kernel confidence', composed.output.confidence === kr.kernelArt.confidence);
ok('29. post-kernel preserves the kernel limitations', kr.kernelArt.limitations.every(l => composed.output.limitations.includes(l)));
ok('30. post-kernel adds no unsupported factual claim', composed.output.addedFactualClaim === false);
ok('31. a presentation_decision artifact is recorded', (reasoningArtifacts[CODE] || []).some(a => a.stage === 'post_kernel' && a.type === 'presentation_decision'));

// A leader can never be authorised to cite private evidence, even by forcing it.
const forced = _composeForAudience(CODE, { ...kr.kernelArt, basis: [...kr.kernelArt.basis, privNote.id] }, { role: 'admin', subjectId: 'sam', viewerId: 'boss', purpose: 'leader_support', text: 'x' });
ok('32. forcing the private ID into the basis still never cites it to the leader', !forced.output.cites.includes(privNote.id));

// ─────────────────────────────────────────────────────────────────────────────
// E. DERIVED EVIDENCE — a meaningful recommendation becomes canonical evidence
// ─────────────────────────────────────────────────────────────────────────────
const before = ev().length;
const rec = _recordDerivedEvidence(CODE, { subjectId: 'sam', type: 'observation', label: 'Advisor recommendation', valueText: 'Have a supportive 1:1 with Sam this week.', basisIds: kr.basis });
ok('33. a recommendation is recorded as canonical derived evidence', !!rec && rec.stored && ev().length === before + 1);
const recEnv = ev().find(e => e.id === rec.id);
ok('34. the derived recommendation is NOT private (basis carries none)', recEnv && recEnv.visibility !== 'private' && !recEnv.ownerRef);
ok('35. the derived recommendation carries its basis (derivedFrom)', recEnv && Array.isArray(recEnv.derivedFrom) && recEnv.derivedFrom.length > 0);
ok('36. the derived recommendation does NOT auto-promote (no recursive self-feed)', recEnv && recEnv.promoted !== true);

// A recommendation grounded in a PRIVATE basis inherits an owner-only ceiling.
const privRec = _recordDerivedEvidence(CODE, { subjectId: 'sam', ownerId: 'sam', type: 'observation', label: 'Personal pattern', valueText: 'derived from private material', basisIds: [privNote.id] });
const privRecEnv = ev().find(e => e.id === privRec.id);
ok('37. a recommendation from PRIVATE basis inherits owner-only visibility', privRecEnv && privRecEnv.visibility === 'private' && privRecEnv.ownerRef === 'sam');

// ─────────────────────────────────────────────────────────────────────────────
// F. LEGACY-PATH REMOVAL — the advisor endpoint no longer reads raw signals
// ─────────────────────────────────────────────────────────────────────────────
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const askStart = src.indexOf("app.post('/api/advisor/:memberId/ask'");
const askEnd   = src.indexOf("app.get('/api/advisor/:memberId/threads'");
const askBody  = src.slice(askStart, askEnd);
ok('38. the advisor endpoint no longer calls _buildAdvisorContext', askStart > 0 && !askBody.includes('_buildAdvisorContext'));
ok('39. the advisor endpoint no longer calls _getMemory', !askBody.includes('_getMemory'));
ok('40. the advisor endpoint does not read raw signals (_gatherSignals/_buildMemberIntelInput)', !askBody.includes('_gatherSignals') && !askBody.includes('_buildMemberIntelInput'));
ok('41. the advisor endpoint routes through _advisorKernelReasoning + _composeForAudience', askBody.includes('_advisorKernelReasoning') && askBody.includes('_composeForAudience'));

// ─────────────────────────────────────────────────────────────────────────────
// G. e2e PROOFS — trajectory reconstruction, empty state, isolation
// ─────────────────────────────────────────────────────────────────────────────
ok('42. a recovering mood series reconstructs as CONVERGING', _advisorKernelReasoning(CODE, srv.orgUsers[CODE].rho, 'boss').trajectory === 'converging');
const krNew = _advisorKernelReasoning(CODE, srv.orgUsers[CODE].newbie, 'boss');
ok('43. a member with no evidence + no aim is UNANCHORED, with an empty basis and no crash',
   krNew.trajectory === 'unanchored' && krNew.basis.length === 0 && krNew.citable.some(l => /UNANCHORED/i.test(l)));
ok('44. no other member\'s evidence leaks into Sam\'s advisor context (authorised-set isolation)',
   !kr.evidence.some(e => e.subjectId === 'other'));
ok('45. a leader-support context over Sam never contains ANY private-visibility evidence', kr.evidence.every(e => e.visibility !== 'private'));

console.log(`\n=== advisor-migration-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
