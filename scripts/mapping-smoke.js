/* ============================================================
   scripts/mapping-smoke.js — the mapping contract (pure).

   Schema fingerprinting, drift detection, deterministic transforms, and the
   promotion gate. The aggressive failure cases live here where they're cheapest to
   assert: renamed field, number→string, missing identity, changed units.

   Run:  node scripts/mapping-smoke.js   (part of `npm test`)
   ============================================================ */

const m = require('../lib/mapping');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

console.log('\n=== Mapping contract ===\n');

// A baseline approved mapping over a clean shape.
const records = [
  { athlete: 'Tatenda', distance: 10400, hr: 154, date: '2026-07-20' },
  { athlete: 'Sam',     distance: 9800,  hr: 148, date: '2026-07-20' },
];
const mapping = {
  status: 'active', version: 1, subjectField: 'athlete', dateField: 'date',
  schemaFingerprint: m.schemaFingerprint(records).hash,
  fields: [
    { from: 'distance', primitive: 'metric', evidenceType: 'metric', label: 'Distance', unit: 'm', transform: null, include: true },
    { from: 'hr',       primitive: 'metric', evidenceType: 'metric', label: 'Heart rate', unit: 'bpm', transform: null, include: true },
  ],
};

// ── Fingerprint ─────────────────────────────────────────────────────────────
ok('a fingerprint is stable for the same shape', m.schemaFingerprint(records).hash === m.schemaFingerprint(records).hash);
ok('fingerprint captures field names + coarse types', m.schemaFingerprint(records).types.distance === 'num');

// ── Apply + deterministic transforms ────────────────────────────────────────
ok('applyMapping produces the mapped metrics', m.applyMapping(records[0], mapping).length === 2 && m.applyMapping(records[0], mapping)[0].value === 10400);
const kmMapping = { ...mapping, fields: [{ from: 'distance', evidenceType: 'metric', label: 'Distance', unit: 'km', transform: { scale: 0.001, round: 2 }, include: true }] };
ok('a deterministic unit transform runs at runtime (10400 m → 10.4 km)', m.applyMapping(records[0], kmMapping)[0].value === 10.4 && m.applyMapping(records[0], kmMapping)[0].unit === 'km');
ok('a string-encoded number still transforms deterministically', m.applyTransform('10400', { scale: 0.001 }) === 10.4);

// ── Drift: renamed field ────────────────────────────────────────────────────
const renamed = [{ athlete: 'Tatenda', dist: 10400, hr: 154, date: '2026-07-21' }]; // distance → dist
const d1 = m.detectDrift(renamed, mapping);
ok('a RENAMED source field is detected as drift', d1.drifted && d1.missing.includes('distance'));

// ── Drift: number becomes string (non-numeric) ──────────────────────────────
const stringy = [{ athlete: 'Tatenda', distance: 'far', hr: 154, date: '2026-07-21' }];
const d2 = m.detectDrift(stringy, mapping);
ok('a metric field that is no longer numeric is detected as drift', d2.drifted && d2.typeChanged.some(t => t.field === 'distance'));

// ── Drift: missing identity field ───────────────────────────────────────────
const noId = [{ distance: 10400, hr: 154, date: '2026-07-21' }];
const d3 = m.detectDrift(noId, mapping);
ok('a MISSING identity field is detected as drift (never guess the subject)', d3.drifted && d3.identityMissing);

// ── No drift on the same shape ──────────────────────────────────────────────
ok('the original shape shows no drift', !m.detectDrift(records, mapping).drifted);

// ── Promotion gate + immutability ───────────────────────────────────────────
ok('only an ACTIVE mapping can promote', m.canPromote({ status: 'active' }) && !m.canPromote({ status: 'approved' }) && !m.canPromote({ status: 'proposed' }));
ok('approved/active/superseded/retired mappings are immutable (edit must fork)',
   ['approved', 'active', 'superseded', 'retired'].every(s => m.isImmutable({ status: s })) && !m.isImmutable({ status: 'draft' }));

// ── Preview shows input → output before approval ────────────────────────────
const pv = m.preview(records, mapping, 5);
ok('preview transforms sample records into canonical output', pv.samples.length === 2 && pv.samples[0].output.length === 2 && !!pv.fingerprint);

console.log(`\n=== mapping-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
