/* ============================================================
   scripts/mapping-lifecycle-smoke.js — the mapping approval lifecycle, end to end.

   Enforces THE rule: only an approved, versioned mapping may create canonical
   evidence. Drives the real server internals through:
     hold (no approval) → propose → approve → activate → reprocess (explicit) →
     drift pause → edit-forks-version → retire → rollback (history preserved).

   Aggressive failure cases: unapproved cannot promote; schema drift pauses; missing
   identity; changed units (deterministic transform); concurrent versions; rollback
   after ingest; historical replay preserves observed_at; rejected proposal = nothing.

   Run:  node scripts/mapping-lifecycle-smoke.js   (part of `npm test`)
   ============================================================ */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const srv = require('../server.js');
const { _loadAllStores, _rebuildEmailIndex, _ingestGeneric, _reprocessHeld, _activeMapping, evidenceLog, orgSignals, orgUsers, orgMappings } = srv;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const CODE = 'mapco';
_loadAllStores({ orgMeta: { [CODE]: { orgName: 'Map Co', createdAt: new Date().toISOString() } }, orgUsers: { [CODE]: {
  u_t: { id: 'u_t', name: 'Tatenda Mukudu', email: 'tatenda@club.fc', role: 'member', orgCode: CODE, status: 'active' },
} } });
_rebuildEmailIndex();

const sigs = () => orgSignals[CODE] || [];
const envs = () => evidenceLog[CODE] || [];
const maps = () => orgMappings[CODE] || [];
const PROV = 'gpsvendor';
const ingest = recs => _ingestGeneric(CODE, { records: recs }, 'admin1', { source: PROV, provider: PROV, requireApprovedMapping: true });

console.log('\n=== Mapping approval lifecycle ===\n');

// ── 1. No approved mapping → data is HELD, never promoted; a proposal is created ─
const OLD = '2026-01-10';
const r1 = ingest([{ email: 'tatenda@club.fc', distance: 10400, hr: 154, date: OLD }]);
ok('connector data with no approved mapping is HELD, not imported', r1.imported === 0 && r1.held >= 1 && r1.needsMapping === true);
ok('holding promotes NOTHING to the kernel', sigs().length === 0);
ok('the raw record is retained + a mapping is PROPOSED for review',
   envs().some(e => e.status === 'held') && maps().some(m => m.status === 'proposed' && m.provider === PROV));

const proposal = maps().find(m => m.status === 'proposed' && m.provider === PROV);
ok('a proposed mapping is not promotable and carries a schema fingerprint + version',
   proposal.status === 'proposed' && !!proposal.schemaFingerprint && proposal.version >= 1);

// ── 2. Approve → activate (still no reprocessing) → reprocess is EXPLICIT ────
proposal.status = 'approved'; proposal.approvedBy = 'admin1'; proposal.approvedAt = new Date().toISOString();
// activate (supersede any prior active)
proposal.status = 'active';
ok('activation alone does NOT reinterpret historical held evidence', sigs().length === 0);
const rp = _reprocessHeld(CODE, PROV, 'admin1');
ok('explicit reprocessing interprets held records + promotes them', rp.created >= 1 && rp.promoted >= 1 && sigs().length >= 1);

// ── 3. THE guarantee — replayed history keeps its original observed_at ───────
const promoted = sigs().find(s => s.data?.source?.provider === PROV);
ok('a reprocessed signal keeps its ORIGINAL observed time (no false new-event alert)',
   promoted && String(promoted.ts).startsWith(OLD));
ok('every promoted envelope records the mapping VERSION it was created under',
   envs().some(e => e.mappingVersion === proposal.version && e.promoted));

// ── 4. Live data now promotes directly under the active mapping ─────────────
const before = sigs().length;
ingest([{ email: 'tatenda@club.fc', distance: 9000, hr: 150, date: '2026-02-01' }]);
ok('with an active mapping, fresh connector data promotes directly', sigs().length === before + 2);

// ── 5. Duplicate source record collapses (dedupe) ───────────────────────────
const beforeDup = sigs().length;
ingest([{ email: 'tatenda@club.fc', distance: 9000, hr: 150, date: '2026-02-01' }]);
ok('an identical connector record is deduped (no second signal)', sigs().length === beforeDup);

// ── 6. Schema DRIFT pauses ingestion — no guessing ──────────────────────────
const rDrift = ingest([{ email: 'tatenda@club.fc', dist: 8000, hr: 149, date: '2026-02-05' }]); // distance → dist
ok('a renamed field triggers drift → held + paused, not promoted',
   rDrift.imported === 0 && rDrift.drift && rDrift.drift.missing.includes('distance'));

// ── 7. Missing identity field also pauses (never guess the subject) ─────────
const rNoId = ingest([{ distance: 7000, hr: 145, date: '2026-02-06' }]);
ok('a missing identity field is drift → held, not promoted', rNoId.imported === 0 && rNoId.drift && rNoId.drift.identityMissing);

// ── 8. Versions are immutable — an "edit" forks a NEW draft version ─────────
const v1 = _activeMapping(CODE, PROV);
const forked = JSON.parse(JSON.stringify(v1));
forked.id = 'map_fork'; forked.version = v1.version + 1; forked.status = 'draft';
forked.fields = forked.fields.map(f => f.from === 'distance' ? { ...f, unit: 'km', transform: { scale: 0.001, round: 2 } } : f);
maps().push(forked);
ok('editing an approved contract produces a new DRAFT version (v1 untouched)',
   forked.version === v1.version + 1 && forked.status === 'draft' && v1.status === 'active');

// ── 9. Concurrent versions — only the ACTIVE one promotes ───────────────────
forked.status = 'approved';
ok('an approved-but-not-active version is NOT the promoting mapping (v1 stays active)',
   _activeMapping(CODE, PROV).version === v1.version);
const beforeConc = sigs().length;
ingest([{ email: 'tatenda@club.fc', distance: 8800, hr: 151, date: '2026-03-01' }]);
const conc = envs().find(e => e.value === 8800 || e.value === 8.8);
ok('with v1 still active, new data is interpreted by v1 (metres), not the approved v2 (km)',
   conc && conc.mappingVersion === v1.version && conc.value === 8800);

// Activate v2 → supersede v1.
v1.status = 'superseded'; forked.status = 'active';
ingest([{ email: 'tatenda@club.fc', distance: 12000, hr: 152, date: '2026-03-02' }]);
const kmEnv = envs().find(e => e.value === 12 && e.mappingVersion === forked.version);
ok('after activating v2, new data uses v2 rules (12000 m → 12 km) and records v2',
   !!kmEnv);

// ── 10. Rollback restores v1 WITHOUT mutating history ───────────────────────
const kmEnvId = kmEnv.id;
forked.status = 'superseded'; v1.status = 'active';   // rollback
ok('after rollback the active mapping is v1 again', _activeMapping(CODE, PROV).version === v1.version);
ok('rollback does NOT rewrite already-ingested history (the v2 envelope still says v2)',
   envs().find(e => e.id === kmEnvId).mappingVersion === forked.version);

// ── 11. Retire stops FUTURE promotion but keeps prior evidence ──────────────
const evCountBeforeRetire = envs().filter(e => e.promoted).length;
v1.status = 'retired';
const rRetired = ingest([{ email: 'tatenda@club.fc', distance: 5000, hr: 140, date: '2026-04-01' }]);
ok('a retired mapping stops future promotion (data is held again)', rRetired.imported === 0);
ok('retiring never deletes prior evidence', envs().filter(e => e.promoted).length === evCountBeforeRetire);

// ── 12. A rejected proposal yields no evidence + no signals ─────────────────
const sigBefore = sigs().length, promotedBefore = envs().filter(e => e.promoted).length;
_ingestGeneric(CODE, { records: [{ email: 'tatenda@club.fc', foo: 1 }] }, 'admin1', { source: 'rejprov', provider: 'rejprov', requireApprovedMapping: true });
const rejProp = maps().find(m => m.provider === 'rejprov');
if (rejProp) { rejProp.status = 'retired'; rejProp.rejected = true; }
ok('a rejected proposal promotes nothing (no signals, no promoted evidence)',
   sigs().length === sigBefore && envs().filter(e => e.promoted).length === promotedBefore);

console.log(`\n=== mapping-lifecycle-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
