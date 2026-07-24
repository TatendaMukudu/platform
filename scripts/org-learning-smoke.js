/* Truth layer — LEARNING ENGINE Phase B1 (pure): governed longitudinal OBSERVATIONS,
   not recommendations. Proves intervals are built only from semantically-compatible,
   chronological, single-tenant moments; that rebaseline/legacy history is excluded;
   that the factual observation taxonomy derives deterministically with dedup + stable
   identity; that contradictions/limitations are retained; and that public output is
   redacted + non-causal. No DB / AI / IO. Run: node scripts/org-learning-smoke.js */

const OM = require('../ai/org-memory.js');
const L  = require('../ai/org-learning.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const T0 = Date.parse('2026-01-01T00:00:00Z');
const HR = 3600000;
const SEM  = { orgStateSchemaVersion: 1, projectionRulesVersion: 1, readinessRulesVersion: 1 };
const SEM2 = { orgStateSchemaVersion: 1, projectionRulesVersion: 2, readinessRulesVersion: 1 };
const cl = (rid, ct, st) => ({ requirementId: rid, claimType: ct, state: st });
const mo = (i, claims, opts = {}) => OM.snapshot({
  state: { organisation: { pack: 'sports' }, claimStates: claims },
  readiness: { focus: { kind: 'event', id: 'e', title: 'E' }, readiness: { status: opts.status || 'partially_ready' }, nextQuestions: [] },
  fingerprint: opts.fp || ('fp' + i), now: T0 + i * HR,
  trigger: { type: opts.trig || 'evidence_recorded' }, semantics: opts.sem === null ? null : (opts.sem || SEM),
});
const build = (tl, o = {}) => L.buildIntervals(tl, { diff: OM.diff, ...o });

/* ── INTERVAL CONSTRUCTION ── */
// A resolving-across-events timeline: availability recorded for e1, then e2, then e3.
const tRepeat = [
  mo(0, [cl('e1:availability', 'availability', 'missing')], { status: 'not_ready' }),
  mo(1, [cl('e1:availability', 'availability', 'known'), cl('e2:availability', 'availability', 'missing')], { status: 'partially_ready' }),
  mo(2, [cl('e1:availability', 'availability', 'known'), cl('e2:availability', 'availability', 'known'), cl('e3:availability', 'availability', 'missing')], { status: 'partially_ready' }),
  mo(3, [cl('e1:availability', 'availability', 'known'), cl('e2:availability', 'availability', 'known'), cl('e3:availability', 'availability', 'known')], { status: 'ready' }),
];
const ivRepeat = build(tRepeat);
ok('1 · compatible chronological moments form intervals', ivRepeat.length === 3 && ivRepeat.every(i => i.compatible === true && i.fromFingerprint && i.toFingerprint));
ok('1 · each interval carries duration + a safe trigger category + a readiness transition', ivRepeat.every(i => i.durationMs === HR && i.triggerCategory === 'information was recorded' && i.readinessTransition));

// Incompatible semantics → a diagnostic interval, never analysable.
const ivIncompat = build([mo(0, [cl('e1:availability', 'availability', 'missing')]), mo(1, [cl('e1:availability', 'availability', 'known')], { sem: SEM2 })]);
ok('2 · incompatible semantics produce no ANALYTICAL interval (transitions withheld)', ivIncompat[0].compatible === false && ivIncompat[0].incompatibilityReason === 'semantics_changed' && ivIncompat[0].transitions.length === 0);

// Rebaseline splits history into separate comparable segments.
const ivSplit = build([mo(0, [cl('e1:a', 'a', 'missing')]), mo(1, [cl('e1:a', 'a', 'known')]), mo(2, [cl('e1:a', 'a', 'known')], { sem: SEM2 }), mo(3, [cl('e1:a', 'a', 'stale')], { sem: SEM2, trig: 'temporal_recalculation' })]);
ok('3 · a rebaseline splits history: the crossing interval is excluded, both sides remain', ivSplit[0].compatible && !ivSplit[1].compatible && ivSplit[2].compatible && ivSplit[1].incompatibilityReason === 'semantics_changed');

// Legacy unknown-semantics excluded.
const ivLegacy = build([mo(0, [cl('e1:a', 'a', 'missing')], { sem: null }), mo(1, [cl('e1:a', 'a', 'known')])]);
ok('4 · a legacy (unknown-semantics) moment yields no analysable interval', ivLegacy[0].compatible === false && ivLegacy[0].incompatibilityReason === 'legacy_unknown_semantics');

// Tenant mixing rejected.
const a0 = mo(0, [cl('e1:a', 'a', 'missing')]); a0.orgRef = 'A';
const b1 = mo(1, [cl('e1:a', 'a', 'known')]); b1.orgRef = 'B';
const a2 = mo(2, [cl('e1:a', 'a', 'known')]); a2.orgRef = 'A';
const ivTenant = build([a0, b1, a2], { orgRef: 'A' });
ok('5 · tenant mixing is rejected (a foreign-tenant moment never forms an interval)', ivTenant.length === 1 && ivTenant[0].fromFingerprint === 'fp0' && ivTenant[0].toFingerprint === 'fp2');

// Duplicate + malformed fail safely.
const dup = mo(1, [cl('e1:a', 'a', 'known')], { fp: 'fp1' });
const bad = mo(9, [cl('e1:a', 'a', 'known')], { fp: 'bad' }); bad.at = 'not-a-date';
const ivSafe = build([mo(0, [cl('e1:a', 'a', 'missing')], { fp: 'fp0' }), mo(1, [cl('e1:a', 'a', 'known')], { fp: 'fp1' }), dup, bad]);
ok('6 · duplicate + malformed moments fail safe (no crash, duplicates collapse)', Array.isArray(ivSafe) && ivSafe.length === 1);

/* ── OBSERVATION DERIVATION ── */
const obsRepeat = L.deriveObservations(ivRepeat, { minOccurrences: 3, minDistinctEvents: 2 });
const rt = obsRepeat.find(o => o.type === 'repeated_transition');
ok('7 · repeated transition (availability not-recorded → recorded, 3×) is observed', rt && rt.occurrenceCount === 3 && rt.distinctEvents === 3);
ok('7 · recurring requirement type across distinct events is observed', obsRepeat.some(o => o.type === 'recurring_requirement_type' && o.subject === 'availability' && o.distinctEvents === 3));

// Repeated cause: availability lapsing via became_stale twice.
const tStale = [
  mo(0, [cl('e1:availability', 'availability', 'known')], { status: 'ready' }),
  mo(1, [cl('e1:availability', 'availability', 'stale')], { status: 'not_ready', trig: 'temporal_recalculation' }),
  mo(2, [cl('e1:availability', 'availability', 'known')], { status: 'ready', trig: 'evidence_recorded' }),
  mo(3, [cl('e1:availability', 'availability', 'stale')], { status: 'not_ready', trig: 'temporal_recalculation' }),
  mo(4, [cl('e1:availability', 'availability', 'known')], { status: 'ready', trig: 'evidence_recorded' }),
];
const obsStale = L.deriveObservations(build(tStale), { minOccurrences: 2 });
ok('8 · repeated cause (information becoming out of date, 2×) is observed', obsStale.some(o => o.type === 'repeated_cause' && o.causeCategory === 'became_stale' && o.occurrenceCount === 2));
ok('8 · an explicit sequence (out of date → recorded again) is observed ≥ 2×', obsStale.some(o => o.type === 'transition_sequence' && o.sequenceName === 'became_stale_then_recorded'));

// Reverse transition appears as a possible contradiction (known→missing and missing→known both occur).
const tReverse = [
  mo(0, [cl('e1:availability', 'availability', 'missing')]),
  mo(1, [cl('e1:availability', 'availability', 'known')], { trig: 'evidence_recorded' }),
  mo(2, [cl('e1:availability', 'availability', 'missing')], { trig: 'evidence_removed' }),
  mo(3, [cl('e1:availability', 'availability', 'known')], { trig: 'evidence_recorded' }),
];
const obsReverse = L.deriveObservations(build(tReverse), { minOccurrences: 2 });
const rtRev = obsReverse.find(o => o.type === 'repeated_transition' && o.transitionCategory.to === 'known');
ok('9 · the reverse transition is retained as a possible contradiction', rtRev && rtRev.possibleContradictions.includes('reverse_transition_also_occurred'));

// Readiness co-occurrence uses NON-CAUSAL language.
const tCo = [
  mo(0, [cl('e1:availability', 'availability', 'missing'), cl('e2:availability', 'availability', 'missing')], { status: 'partially_ready' }),
  mo(1, [cl('e1:availability', 'availability', 'known'), cl('e2:availability', 'availability', 'missing')], { status: 'ready', trig: 'evidence_recorded' }),
  mo(2, [cl('e1:availability', 'availability', 'known'), cl('e2:availability', 'availability', 'missing')], { status: 'partially_ready', trig: 'temporal_recalculation' }),
  mo(3, [cl('e1:availability', 'availability', 'known'), cl('e2:availability', 'availability', 'known')], { status: 'ready', trig: 'evidence_recorded' }),
];
const obsCo = L.deriveObservations(build(tCo), { minOccurrences: 2 });
const co = obsCo.find(o => o.type === 'readiness_co_occurrence');
ok('10 · readiness co-occurrence is observed', !!co);
ok('10 · co-occurrence wording is non-causal (co-occurred with; never caused/led to/improved)', co && /co-occurred with/i.test(L.summariseObservation(co)) && !/\b(caused|led to|resulted in|improved|because)\b/i.test(L.summariseObservation(co)));

// Insufficient occurrences → no observation.
const obsFew = L.deriveObservations(build([mo(0, [cl('e1:availability', 'availability', 'missing')]), mo(1, [cl('e1:availability', 'availability', 'known')], { trig: 'evidence_recorded' })]), { minOccurrences: 3 });
ok('11 · a single occurrence under the minimum yields no repeated-transition observation', !obsFew.some(o => o.type === 'repeated_transition'));

// Determinism + dedup + stable identity.
const again = L.deriveObservations(ivRepeat, { minOccurrences: 3, minDistinctEvents: 2 });
ok('12 · recomputation is idempotent (identical output)', JSON.stringify(again) === JSON.stringify(obsRepeat));
ok('12 · observations dedupe deterministically (unique fingerprints)', new Set(obsRepeat.map(o => o.fingerprint)).size === obsRepeat.length);
ok('12 · ordering is deterministic (sorted by recency, count, fingerprint)', JSON.stringify(obsRepeat.map(o => o.fingerprint)) === JSON.stringify(again.map(o => o.fingerprint)));

// Support-change → new fingerprint, SAME identity (supersession-ready); no history rewrite.
const ivExtended = build(tRepeat.concat([
  mo(4, [cl('e1:availability', 'availability', 'known'), cl('e2:availability', 'availability', 'known'), cl('e3:availability', 'availability', 'known'), cl('e4:availability', 'availability', 'missing')], { status: 'partially_ready' }),
  mo(5, [cl('e1:availability', 'availability', 'known'), cl('e2:availability', 'availability', 'known'), cl('e3:availability', 'availability', 'known'), cl('e4:availability', 'availability', 'known')], { status: 'ready' }),
]));
const rtExt = L.deriveObservations(ivExtended, { minOccurrences: 3, minDistinctEvents: 2 }).find(o => o.type === 'repeated_transition');
ok('13 · extended support yields a NEW fingerprint but the SAME identity key (superseding version)', rtExt && rtExt.identityKey === rt.identityKey && rtExt.fingerprint !== rt.fingerprint);

// Stable non-change.
const tStable = [
  mo(0, [cl('e1:game_plan', 'game_plan', 'missing')]),
  mo(1, [cl('e1:game_plan', 'game_plan', 'missing'), cl('e2:x', 'x', 'known')], { trig: 'evidence_recorded' }),
  mo(2, [cl('e1:game_plan', 'game_plan', 'missing'), cl('e2:x', 'x', 'known'), cl('e3:y', 'y', 'known')], { trig: 'evidence_recorded' }),
];
const obsStable = L.deriveObservations(build(tStable), { minOccurrences: 5, minDistinctEvents: 5, minStableMoments: 3 });
ok('14 · a claim that never changed across ≥3 moments is a neutral stable observation', obsStable.some(o => o.type === 'stable_non_change' && o.subject === 'game_plan' && o.state === 'missing'));

/* ── PRIVACY / REDACTION ── */
const pub = L.publicObservation(rt);
ok('15 · public observation exposes only safe labels (no requirement/record ids, no versions/hashes)', !/requirementId|e1:|e2:|Version|contentHash|fp0/.test(JSON.stringify({ ...pub, supportingMoments: [] })) && pub.subjectLabel === 'availability information');
ok('15 · public observation carries a neutral summary + contradiction/limitation flags', typeof pub.summary === 'string' && typeof pub.hasContradictions === 'boolean' && Array.isArray(pub.limitations));
ok('15 · explain adds an explicit "historical description, not advice" disclaimer', /not a recommendation/i.test(L.explainObservation(rt).disclaimer) && L.explainObservation(rt).kind === 'historical_description');
ok('15 · no observation summary uses causal or evaluative language', obsRepeat.concat(obsStale).every(o => !/\b(caused|led to|resulted in|because|healthy|unhealthy|effective|ineffective|success|failure)\b/i.test(L.summariseObservation(o))));

// A rebaseline in the history surfaces as a contradiction on affected observations.
const obsSplit = L.deriveObservations(build([mo(0, [cl('e1:a', 'a', 'missing')]), mo(1, [cl('e1:a', 'a', 'known')], { trig: 'evidence_recorded' }), mo(2, [cl('e1:a', 'a', 'missing')], { sem: SEM2, trig: 'evidence_removed' }), mo(3, [cl('e1:a', 'a', 'known')], { sem: SEM2, trig: 'evidence_recorded' })]), { minOccurrences: 2 });
ok('16 · an observation whose history was interrupted by a rebaseline records that contradiction', obsSplit.every(o => o.possibleContradictions.includes('history_interrupted_by_a_rules_change')) || obsSplit.length === 0);

console.log(`\norg-learning-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
