/* Truth layer — the ACCOUNTABILITY TRAIL (pure). Proves the compliance core: every
   accountable access is recorded content-free (who/what/whom/when + a basis label, never
   a claim, quote, or score); only allow-listed actions are accepted; the log is
   tamper-evident (each entry hash-chains to the prior, so an edit or deletion is
   detectable); a subject can see who accessed THEIR data (the SAR basis); and it's
   deterministic. No DB / AI / IO. Run: node scripts/audit-smoke.js */

const A = require('../ai/audit.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const T = Date.parse('2026-07-28T09:00:00Z');
// Build a small trail: a leader views the agenda (touching two people), then a report,
// then one of those people exercises subject access.
let log = [];
log = A.append(log, A.record({ actor: 'coachA', action: 'agenda_view', subjectIds: ['uma', 'ken'], basis: 'scoped team read', at: T }, A.tip(log)));
log = A.append(log, A.record({ actor: 'coachA', action: 'report_view', subjectIds: ['uma'], basis: 'grounded report', at: T + 1000 }, A.tip(log)));
log = A.append(log, A.record({ actor: 'uma',    action: 'subject_access', subjectIds: ['uma'], basis: 'Art 15 export', at: T + 2000 }, A.tip(log)));

/* ── 1 · only allow-listed actions are recorded (no free-text smuggling) ── */
ok('1 · an unknown action is refused (allow-list guard)', A.record({ actor: 'x', action: 'peek', subjectIds: ['y'], at: T }) === null);
ok('1 · three real accesses are recorded', log.length === 3);

/* ── 2 · entries are CONTENT-FREE — who/what/whom/when + a basis label, nothing sensitive ── */
const e0 = log[0];
ok('2 · an entry carries actor, action, subjects, basis, time', e0.actor === 'coachA' && e0.action === 'agenda_view' && e0.subjectIds.length === 2 && e0.basis === 'scoped team read' && e0.at === T);
ok('2 · an entry holds no claim / quote / score field', !('claim' in e0) && !('text' in e0) && !('score' in e0) && !('quote' in e0));

/* ── 3 · a subject can see who accessed THEIR data (the SAR basis) — content-free ── */
const umaTrail = A.subjectTrail(log, 'uma');
ok('3 · Uma\'s trail shows every access that touched her (agenda + report + her own SAR)', umaTrail.length === 3);
ok('3 · …and Ken sees only the one access that touched him', A.subjectTrail(log, 'ken').length === 1);
ok('3 · a subject trail lists actor/action/basis/time, never content', umaTrail.every(t => 'actor' in t && 'basis' in t && !('subjectIds' in t) && !('text' in t)));

/* ── 4 · the actor view — what did this leader access ── */
const coachTrail = A.actorTrail(log, 'coachA');
ok('4 · the leader\'s own trail shows the two reads they made', coachTrail.length === 2 && coachTrail.every(t => t.action));

/* ── 5 · TAMPER-EVIDENCE — the chain verifies, and any edit or deletion breaks it ── */
ok('5 · an intact trail verifies', A.verify(log).ok === true);

const edited = JSON.parse(JSON.stringify(log));
edited[0].subjectIds = ['uma'];                     // quietly drop Ken from the first access
const v1 = A.verify(edited);
ok('5 · editing an entry breaks the chain at that entry (detectable)', v1.ok === false && v1.brokenAt === 0);

const deleted = JSON.parse(JSON.stringify(log)).filter(e => e.seq !== 1);   // remove the middle entry
ok('5 · deleting an entry breaks the chain (the trail is provably incomplete)', A.verify(deleted).ok === false);

/* ── 6 · determinism — the same access recorded twice hashes the same ── */
const r1 = A.record({ actor: 'coachA', action: 'agenda_view', subjectIds: ['ken', 'uma'], basis: 'scoped team read', at: T }, null);
const r2 = A.record({ actor: 'coachA', action: 'agenda_view', subjectIds: ['uma', 'ken'], basis: 'scoped team read', at: T }, null);
ok('6 · identical access → identical hash (subjects order-normalized)', r1.hash === r2.hash);

console.log(`\naudit-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
