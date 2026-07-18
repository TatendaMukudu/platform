/* ============================================================
   scripts/adapters-smoke.js — capability → canonical evidence adapters (pure).

   Adapters are translation boundaries: claim-bounded, provenance-preserving, and
   idempotent. They classify + structure; they never detect patterns.

   Run:  node scripts/adapters-smoke.js   (part of `npm test`)
   ============================================================ */

const a = require('../lib/adapters');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

console.log('\n=== Capability adapters ===\n');

// ── Check-in: one record → SEVERAL claim-bounded evidences (never one blob) ──
const ci = { id: 'ci1', mood: 2, note: 'did not sleep well and worried about tomorrow', ts: '2026-05-01T08:00:00.000Z' };
const out = a.CheckInAdapter.toCanonicalEvidence(ci, { subjectId: 'u1' });
ok('a check-in yields multiple claims (a rating + a note), not one opaque signal',
   out.length === 2 && out.some(o => o.type === 'metric' && o.value === 2) && out.some(o => o.type === 'observation' && /sleep/.test(o.valueText)));
ok('the mood rating is a measurement; the note is a reported observation',
   out.find(o => o.type === 'metric').derivation === 'measured' && out.find(o => o.type === 'observation').derivation === 'reported');
ok('each claim preserves the occurred-at from the record', out.every(o => o.observedAt === ci.ts));

// ── Idempotent source keys — same record + claim = same key (replay-safe) ───
const again = a.CheckInAdapter.toCanonicalEvidence(ci, { subjectId: 'u1' });
ok('re-running the adapter produces identical stable source keys (idempotent)',
   out.map(o => o.externalId).join('|') === again.map(o => o.externalId).join('|'));
ok('a different subject yields a different source key', a.CheckInAdapter.toCanonicalEvidence(ci, { subjectId: 'u2' })[0].externalId !== out[0].externalId);

// ── Privacy is passed through, not inferred ─────────────────────────────────
const privCi = a.CheckInAdapter.toCanonicalEvidence(ci, { subjectId: 'u1', private: true });
ok('a private check-in maps to private visibility + owner ref', privCi.every(o => o.visibility === 'private' && o.ownerRef === 'u1'));
ok('a normal check-in defaults to SENSITIVE (informs aggregate, never quoted)', out.every(o => o.visibility === 'sensitive'));

// ── Studio: a meaningful member message becomes evidence; the assistant's does not ─
ok('a member Studio message becomes a claim', a.StudioAdapter.toCanonicalEvidence({ id: 'm1', role: 'user', text: 'I will finish the report by Friday', ts: '2026-05-02T00:00:00Z' }, { subjectId: 'u1' }).length === 1);
ok("the assistant's Studio message is NOT evidence about the person", a.StudioAdapter.toCanonicalEvidence({ role: 'assistant', text: 'good luck', ts: 'x' }, { subjectId: 'u1' }).length === 0);

// ── Assessment score retains what it REPRESENTS (rubric, evaluator, limitations) ─
const sc = a.AssessmentAdapter.toCanonicalEvidence({ id: 'as1', assigneeId: 'u1', assignerId: 'lead', status: 'returned', score: 78, title: 'Match review', guidance: 'focus on decisions', returnedAt: '2026-05-03T00:00:00Z' }, {});
ok('a returned assessment yields a score measurement', sc.length === 1 && sc[0].value === 78 && sc[0].type === 'metric');
ok('the score retains rubric + evaluator + a limitation (not a universal truth)',
   sc[0].context && /decisions/.test(sc[0].context.rubric) && sc[0].context.evaluator === 'lead' && /not a universal/.test(sc[0].context.limitations));
ok('an unreturned assessment produces no score evidence', a.AssessmentAdapter.toCanonicalEvidence({ id: 'as2', status: 'assigned', assigneeId: 'u1' }, {}).length === 0);

console.log(`\n=== adapters-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
