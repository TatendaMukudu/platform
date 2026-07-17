/* ============================================================
   scripts/identity-reresolve-smoke.js — the identity re-resolution lifecycle.

   Held-back (unmatched) evidence must become useful once the missing identity
   appears — WITHOUT ever mutating the original record, double-promoting, or letting
   a similarly-named newcomer silently inherit old evidence. And critically: when
   old evidence is promoted late, it must keep its ORIGINAL observed time so the
   kernel never mistakes history for a new event.

       unmatched → candidate discovered → confirmed → resolution appended →
       promotion reconsidered → kernel signal emitted ONCE

   Run:  node scripts/identity-reresolve-smoke.js   (part of `npm test`)
   ============================================================ */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const srv = require('../server.js');
const { _loadAllStores, _rebuildEmailIndex, _ingestGeneric, _reresolveUnmatched, evidenceLog, orgSignals, orgUsers, rawEvidence } = srv;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const CODE = 'reres';
_loadAllStores({ orgMeta: { [CODE]: { orgName: 'Re Co', createdAt: new Date().toISOString() } }, orgUsers: { [CODE]: {} } });
_rebuildEmailIndex();

const sigs = () => orgSignals[CODE] || [];
const envFor = pred => (evidenceLog[CODE] || []).find(pred);

console.log('\n=== Identity re-resolution lifecycle ===\n');

// ── 1. Evidence for a not-yet-existent person is STORED, not attached ───────
const OLD_DATE = '2026-01-05';
_ingestGeneric(CODE, { records: [{ email: 'late@club.fc', label: 'Sprint distance', value: 812, date: OLD_DATE }] }, null, { source: 'gps', provider: 'gps' });
const env1 = envFor(e => e.subjectRef === 'late@club.fc');
ok('unmatched evidence is stored with no subject and not promoted',
   env1 && env1.confidence === 'unmatched' && !env1.subjectId && !env1.promoted);
ok('no kernel signal exists for the missing person yet', sigs().length === 0);
const rawSnapshot = JSON.stringify(rawEvidence[env1.rawRef].record);

// ── 2. The person appears → deterministic re-resolution confirms + promotes ─
orgUsers[CODE]['u_late'] = { id: 'u_late', name: 'Late Joiner', email: 'late@club.fc', role: 'member', orgCode: CODE, status: 'active' };
const r1 = _reresolveUnmatched(CODE, { by: 'system', method: 'rule', reason: 'person created' });
ok('re-resolution confirms the deterministic (email) match and promotes it',
   r1.confirmed === 1 && r1.promoted === 1);
ok('the envelope is now confirmed + attached + promoted (exactly one resolution event)',
   env1.confidence === 'confirmed' && env1.subjectId === 'u_late' && env1.promoted === true && env1.resolutions.length === 1);
ok('the resolution event preserves the FROM state and who/why',
   env1.resolutions[0].from.confidence === 'unmatched' && env1.resolutions[0].method === 'deterministic' && /matched by email/.test(env1.resolutions[0].reason));

// ── 3. THE subtle guarantee — late promotion keeps the original observed time ─
const promoted = sigs().find(s => s.data?.source?.evidence_id === env1.id);
ok('a kernel signal was emitted for the resolved evidence', !!promoted && promoted.subjectId === 'u_late' && promoted.valueNum === 812);
ok('the promoted signal keeps the ORIGINAL observed time (no false "new event")',
   promoted.ts.startsWith(OLD_DATE));

// ── 4. The raw record was never mutated; history was appended, not rewritten ─
ok('the raw immutable record is unchanged after resolution',
   JSON.stringify(rawEvidence[env1.rawRef].record) === rawSnapshot);

// ── 5. Promote EXACTLY once — a second pass does nothing ────────────────────
const beforeCount = sigs().length;
const r2 = _reresolveUnmatched(CODE, { by: 'system', method: 'rule', reason: 'again' });
ok('a second re-resolution pass promotes nothing already promoted',
   r2.promoted === 0 && sigs().length === beforeCount);

// ── 6. A NAME-only match is PROPOSED, never auto-confirmed (authority≠identity) ─
_ingestGeneric(CODE, { records: [{ name: 'Jordan Blake', label: 'RPE', value: 6, date: '2026-02-01' }] }, null, { source: 'sheet', provider: 'sheet' });
const env2 = envFor(e => e.subjectRef === 'Jordan Blake');
ok('a name with no roster match is stored unmatched', env2 && env2.confidence === 'unmatched' && !env2.promoted);
orgUsers[CODE]['u_jb'] = { id: 'u_jb', name: 'Jordan Blake', email: 'jb@club.fc', role: 'member', orgCode: CODE, status: 'active' };
const sigCountBeforeName = sigs().length;
const r3 = _reresolveUnmatched(CODE, { by: 'system', method: 'rule', reason: 'person created' });
ok('a unique NAME match is proposed as a candidate, not auto-confirmed',
   r3.proposed >= 1 && env2.candidate && env2.candidate.subjectId === 'u_jb' && !env2.promoted && env2.confidence === 'unmatched');
ok('a proposed (fuzzy) match emits NO signal until a human confirms',
   sigs().length === sigCountBeforeName);

// ── 7. A similarly-named SECOND person → conflict, never a wrong attach ──────
_ingestGeneric(CODE, { records: [{ name: 'Sam Fox', label: 'Load', value: 40, date: '2026-03-01' }] }, null, { source: 'sheet', provider: 'sheet' });
const env3 = envFor(e => e.subjectRef === 'Sam Fox');
orgUsers[CODE]['u_s1'] = { id: 'u_s1', name: 'Sam Fox', email: 's1@club.fc', role: 'member', orgCode: CODE, status: 'active' };
orgUsers[CODE]['u_s2'] = { id: 'u_s2', name: 'Sam Fox', email: 's2@club.fc', role: 'member', orgCode: CODE, status: 'active' };
_reresolveUnmatched(CODE, { by: 'system', method: 'rule', reason: 'person created' });
ok('two people share the name → the evidence stays a conflict, never attached',
   env3 && !env3.promoted && !env3.subjectId && env3.candidateNote);

console.log(`\n=== identity-reresolve-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
