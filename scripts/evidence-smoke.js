/* ============================================================
   scripts/evidence-smoke.js — the Canonical Evidence Envelope contract.

   Proves the boundary every connector crosses: normalisation, structural
   validation, deduplication, and the promotion gate (only a resolved, active
   envelope may become a kernel signal). Pure + deterministic.

   Run:  node scripts/evidence-smoke.js   (part of `npm test`)
   ============================================================ */

const ev = require('../lib/evidence');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

console.log('\n=== Canonical Evidence Envelope ===\n');

// ── Build: loose input → a complete, normalised envelope ────────────────────
const e1 = ev.buildEnvelope({
  org: 'CLUB', provider: 'hudl', externalId: 'match_456',
  subjectRef: 'tatenda@club.fc', subjectId: 'u1', groupRef: 'First Team',
  type: 'metric', label: 'High-speed distance', value: '612', unit: 'm',
  date: '2026-07-20', confidence: 'confirmed', mappingVersion: 2,
});
ok('org is normalised to lower-case', e1.org === 'club');
ok('a string number becomes a real number', e1.value === 612 && typeof e1.value === 'number');
ok('observedAt is derived from the source date (ISO)', e1.observedAt.startsWith('2026-07-20'));
ok('retrievedAt is set even when the source omits it', !!e1.retrievedAt);
ok('all boundary fields are present',
   ['org','provider','externalId','subjectRef','subjectId','groupRef','type','label','value','unit','observedAt','retrievedAt','confidence','status','visibility','rawRef','mappingVersion']
     .every(k => k in e1));
ok('status defaults to active; visibility to normal', e1.status === 'active' && e1.visibility === 'normal');

// ── Validation: the guarantees the kernel relies on ─────────────────────────
ok('a well-formed envelope validates', ev.validateEnvelope(e1).ok);
ok('an unknown evidence type is rejected', !ev.validateEnvelope({ ...e1, type: 'nonsense' }).ok);
ok('buildEnvelope coerces an unknown type back to a safe default (metric)',
   ev.buildEnvelope({ org: 'c', type: 'nonsense', value: 1 }).type === 'metric');
ok('evidence with neither value nor text is rejected',
   !ev.validateEnvelope(ev.buildEnvelope({ org: 'c', type: 'metric', label: 'empty' })).ok);
ok('a text observation (no number) is valid',
   ev.validateEnvelope(ev.buildEnvelope({ org: 'c', type: 'observation', valueText: 'looked sharp in training' })).ok);
ok('an envelope with no org is rejected', !ev.validateEnvelope(ev.buildEnvelope({ type: 'metric', value: 1 })).ok);

// ── Confidence defaults honestly to unmatched (never silent attach) ─────────
ok('confidence defaults to unmatched when unknown', ev.buildEnvelope({ org:'c', type:'metric', value:1 }).confidence === 'unmatched');

// ── Deduplication: same observation collapses; a new value does not ─────────
const base = { org:'c', provider:'p', externalId:'x1', subjectId:'u1', type:'metric', label:'rpe', observedAt:'2026-07-20T00:00:00.000Z' };
const k1 = ev.dedupeKey(ev.buildEnvelope({ ...base, value: 7 }));
const k2 = ev.dedupeKey(ev.buildEnvelope({ ...base, value: 7 }));   // exact retry
const k3 = ev.dedupeKey(ev.buildEnvelope({ ...base, value: 9 }));   // corrected value, same fact
const k4 = ev.dedupeKey(ev.buildEnvelope({ ...base, observedAt:'2026-07-21T00:00:00.000Z', value: 7 })); // next day
ok('an exact re-send has the same dedupe key (webhook retry collapses)', k1 === k2);
ok('a corrected VALUE keeps the same key (a supersede, not a new fact)', k1 === k3);
ok('a different observation time is a different key', k1 !== k4);

// ── Promotion gate: only resolved + active envelopes reach the kernel ───────
ok('confirmed + active + subject → promotable',
   ev.promotable(ev.buildEnvelope({ org:'c', type:'metric', value:1, confidence:'confirmed', subjectId:'u1' })));
ok('probable + subject → promotable (surfaced, but allowed)',
   ev.promotable(ev.buildEnvelope({ org:'c', type:'metric', value:1, confidence:'probable', subjectId:'u1' })));
ok('unmatched → NEVER promotable (stored for audit, not attached)',
   !ev.promotable(ev.buildEnvelope({ org:'c', type:'metric', value:1, confidence:'unmatched', subjectId:null })));
ok('conflict → NEVER promotable', !ev.promotable(ev.buildEnvelope({ org:'c', type:'metric', value:1, confidence:'conflict' })));
ok('a resolved subject but non-active status → not promotable',
   !ev.promotable(ev.buildEnvelope({ org:'c', type:'metric', value:1, confidence:'confirmed', subjectId:'u1', status:'superseded' })));

console.log(`\n=== evidence-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
