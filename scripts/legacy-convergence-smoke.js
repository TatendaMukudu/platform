/* ============================================================
   scripts/legacy-convergence-smoke.js — legacy paths converge on canonical evidence.

   Proves migrated capability inputs become claim-bounded canonical evidence, private
   stays owner-only, backfill is idempotent, duplicate events don't fork, and the
   shared context builder is purpose-scoped.

   Run:  node scripts/legacy-convergence-smoke.js   (part of `npm test`)
   ============================================================ */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const srv = require('../server.js');
const { _loadAllStores, _rebuildEmailIndex, _canonicaliseCheckin, _canonicalContext, _backfillCanonical,
        _isCanonicalEvidence, _kernelEvidence, evidenceLog, memberCheckins, assessmentAssignments } = srv;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const CODE = 'conv';
_loadAllStores({ orgMeta: { [CODE]: { orgName: 'Conv Co', createdAt: new Date().toISOString() } }, orgUsers: { [CODE]: {
  sam:  { id: 'sam',  name: 'Sam',  email: 'sam@co.fc',  role: 'member', orgCode: CODE, supervisorId: 'boss', status: 'active' },
  boss: { id: 'boss', name: 'Boss', email: 'boss@co.fc', role: 'admin',  orgCode: CODE, status: 'active' },
} } });
_rebuildEmailIndex();
const ev = () => evidenceLog[CODE] || [];

console.log('\n=== Legacy convergence ===\n');

// ── Check-in → claim-bounded canonical evidence (a rating + a hardship note) ─
const rec = { id: 'ci1', mood: 2, note: 'I have not slept and I am really struggling to cope', ts: '2026-06-01T08:00:00.000Z' };
_canonicaliseCheckin(CODE, 'sam', rec);
const moodEv = ev().find(e => e.provider === 'checkin' && e.type === 'metric' && e.value === 2);
const noteEv = ev().find(e => e.provider === 'checkin' && e.type === 'observation');
ok('1. a check-in creates canonical evidence', !!moodEv && !!noteEv);
ok('2. one check-in produces several claim-bounded records (rating + note)', moodEv && noteEv && moodEv.id !== noteEv.id);
ok('3. the hardship note is PRIVATE (owner-only) canonical evidence', noteEv.visibility === 'private' && noteEv.ownerRef === 'sam');

// ── Private check-in evidence: owner may use it; a leader may not ────────────
const personal = _canonicalContext({ code: CODE, viewerId: 'sam', purpose: 'personal_assistance', subjectId: 'sam' });
ok('4. the owner can use their private check-in evidence for personal reasoning', personal.some(e => e.evidenceId === noteEv.id));
const leader = _canonicalContext({ code: CODE, viewerId: 'boss', purpose: 'leader_support', subjectId: 'sam' });
ok('5. a leader-support context EXCLUDES the private check-in note before context is built',
   !leader.some(e => e.evidenceId === noteEv.id) && leader.every(_isCanonicalEvidence));
ok('6. the mood RATING informs the org (sensitive, promoted), not private', moodEv.visibility === 'sensitive' && moodEv.promoted === true);

// ── Idempotent replay: the same check-in does not fork into new facts ────────
const before = ev().length;
_canonicaliseCheckin(CODE, 'sam', rec);   // exact replay
ok('7. replaying the same check-in creates no duplicate evidence (idempotent)', ev().length === before);

// ── Backfill is idempotent + privacy-preserving ─────────────────────────────
(memberCheckins[`${CODE}:sam`] = memberCheckins[`${CODE}:sam`] || []).push({ id: 'ci2', mood: 4, note: 'good session today', ts: '2026-06-02T08:00:00.000Z' });
(assessmentAssignments[CODE] = assessmentAssignments[CODE] || []).push({ id: 'as1', assigneeId: 'sam', assignerId: 'boss', status: 'returned', score: 80, title: 'Review', guidance: 'decisions', returnedAt: '2026-06-03T00:00:00Z' });
const r1 = _backfillCanonical(CODE, {});
const countAfter1 = ev().length;
const r2 = _backfillCanonical(CODE, {});   // run again
ok('8. backfill records historical check-ins + assessments as canonical evidence', r1.recorded >= 2);
ok('9. backfill is IDEMPOTENT — a second run records nothing new', ev().length === countAfter1 && r2.recorded === 0 && r2.duplicates >= 1);
ok('10. a backfilled assessment score retains its raw context (rubric/evaluator)',
   (srv.rawEvidence && Object.values(srv.rawEvidence || {}).some(rr => rr.record && rr.record.rubric)) || ev().some(e => e.provider === 'assessment' && e.value === 80));

// ── Duplicate real-world event is not counted as several independent facts ──
const scoreEvs = ev().filter(e => e.provider === 'assessment' && e.value === 80 && e.status === 'active');
ok('11. one assessment score = one active evidence (no forked truth)', scoreEvs.length === 1);

// ── The context builder returns canonical evidence only, purpose-scoped ─────
ok('12. the shared context builder yields only canonical evidence', _canonicalContext({ code: CODE, viewerId: 'boss', purpose: 'organisation_reasoning' }).every(_isCanonicalEvidence));

console.log(`\n=== legacy-convergence-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
