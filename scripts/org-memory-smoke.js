/* Truth layer — ORGANISATIONAL MEMORY (pure): the versioned, EXPLAINABLE history of the
   derived org-state. Proves snapshots are deterministic + dedup on observable change;
   trigger provenance is normalised + redacted; semantics-versioning gates comparison
   (incompatible → neutral rebaseline, never false transitions); diffs classify a
   user-facing direction AND a deterministic cause; removals keep a structural reason;
   explain is leader-safe. No DB / AI / IO. Run: node scripts/org-memory-smoke.js */

const M = require('../ai/org-memory.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const T0 = Date.parse('2026-01-01T09:00:00Z');
const DAY = 86400000;
const SEM  = { orgStateSchemaVersion: 1, projectionRulesVersion: 1, readinessRulesVersion: 1 };
const SEM2 = { orgStateSchemaVersion: 1, projectionRulesVersion: 2, readinessRulesVersion: 1 };   // incompatible (rules bumped)

const state = (claims, pack = 'sports') => ({ organisation: { id: 'o', pack }, claimStates: claims });
const rvm = (status, focus, opts = {}) => ({ focus: focus || null,
  readiness: { status, supportedAreas: opts.supported || [], constrainedAreas: opts.constrained || [] },
  nextQuestions: opts.questions || [] });
const focus = (id, title) => ({ kind: 'event', id, title, type: 'match', at: new Date(T0 + 3 * DAY).toISOString() });
// Factory: sensible defaults + full override surface. sem:null models a legacy snapshot.
const mk = (claims, opts = {}) => M.snapshot({
  state: state(claims, opts.pack),
  readiness: rvm(opts.status || 'partially_ready', opts.focus === undefined ? focus('e1', 'Cup Final') : opts.focus, opts),
  contextRecords: opts.contextRecords || [], fingerprint: opts.fp != null ? opts.fp : null,
  now: opts.now || T0, trigger: opts.trigger || { type: 'context_confirmed' },
  semantics: opts.sem === null ? null : (opts.sem || SEM),
});
const C = (rid, ct, st) => ({ requirementId: rid, claimType: ct, state: st });

/* ── 1 · snapshot shape: schema v2, semantics + memory version, internal trigger ── */
const s1 = mk([C('e1:game_plan', 'game_plan', 'missing')], { fp: 'fp1', questions: [{ blocking: true }, { blocking: false }],
  contextRecords: [{ status: 'active' }, { status: 'active' }, { status: 'retired' }],
  trigger: { type: 'context_confirmed', boundary: 'org_context', actorRef: 'coach', recordRef: 'ctx_1', occurredAt: 'x' } });
ok('1 · snapshot carries schema v2 + memory version + stamped semantics', /org-memory\/v2/.test(s1.schema) && s1.memorySchemaVersion === 2 && s1.semantics && s1.semantics.projectionRulesVersion === 1);
ok('1 · snapshot keeps the INTERNAL trigger descriptor', s1.trigger && s1.trigger.type === 'context_confirmed' && s1.trigger.actorRef === 'coach' && s1.trigger.recordRef === 'ctx_1');
ok('1 · snapshot captures focus, readiness, claims, counts', s1.focus.id === 'e1' && s1.readinessStatus === 'partially_ready' && s1.claims.length === 1 && s1.openQuestions === 2 && s1.blockingQuestions === 1 && s1.contextActive === 2);

/* ── 2 · content hash excludes time, fingerprint, trigger AND semantics ── */
const s1b = mk([C('e1:game_plan', 'game_plan', 'missing')], { fp: 'other', now: T0 + 9 * DAY, trigger: { type: 'uncertainty_resolved' }, sem: SEM2 });
ok('2 · content hash is invariant to time/fingerprint/trigger/semantics', s1b.contentHash === mk([C('e1:game_plan', 'game_plan', 'missing')]).contentHash);

/* ── 3 · content hash invariant to claim order; sorted storage ── */
const two = [C('e1:game_plan', 'game_plan', 'missing'), C('e1:kickoff_time', 'kickoff_time', 'known')];
ok('3 · content hash invariant to claim ordering', mk(two).contentHash === mk([...two].reverse()).contentHash);
ok('3 · claims stored in stable sorted order', mk(two).claims[0].requirementId === 'e1:game_plan');

/* ── 4 · content hash changes when a claim changes ── */
ok('4 · a changed claim state changes the content hash', mk([C('e1:game_plan', 'game_plan', 'known')]).contentHash !== s1.contentHash);

/* ── 5 · compatible(): same versions yes; bumped rules no; legacy (missing) no ── */
ok('5 · compatible when semantic versions match', M.compatible(mk([]), mk([])) === true);
ok('5 · incompatible when projection rules differ', M.compatible(mk([]), mk([], { sem: SEM2 })) === false);
ok('5 · legacy snapshot (no semantics) is never comparable', M.compatible(mk([], { sem: null }), mk([])) === false);

/* ── 6 · shouldRecord: baseline; dedup on identical compatible; change → record ── */
ok('6 · no previous → record baseline', M.shouldRecord(null, s1) === true);
ok('6 · identical compatible observable state → no record', M.shouldRecord(mk([C('e1:game_plan', 'game_plan', 'missing')]), mk([C('e1:game_plan', 'game_plan', 'missing')], { now: T0 + DAY })) === false);
ok('6 · a genuine change → record', M.shouldRecord(s1, mk([C('e1:game_plan', 'game_plan', 'known')])) === true);
ok('6 · a semantics change records even if observable state is identical (rebaseline)', M.shouldRecord(mk([C('e1:game_plan', 'game_plan', 'missing')]), mk([C('e1:game_plan', 'game_plan', 'missing')], { sem: SEM2 })) === true);

/* ── 7 · diff resolved + improved + cause evidence_added ── */
const dRes = M.diff(mk([C('e1:game_plan', 'game_plan', 'missing')], { status: 'partially_ready' }),
                    mk([C('e1:game_plan', 'game_plan', 'known')], { status: 'ready', trigger: { type: 'uncertainty_resolved' } }));
ok('7 · missing → known classified resolved with cause evidence_added', dRes.claimTransitions.some(t => t.direction === 'resolved' && t.cause === 'evidence_added'));
ok('7 · readiness improved; summary non-blaming', dRes.readiness.direction === 'improved' && !/\bblame|fault|failed to\b/i.test(dRes.summary.join(' ')));
ok('7 · rebaseline flags are false for a normal compatible diff', dRes.rebaseline === false && dRes.semanticsChanged === false);

/* ── 8 · became_stale + regressed ── */
const dStale = M.diff(mk([C('e1:game_plan', 'game_plan', 'known')], { status: 'ready' }),
                      mk([C('e1:game_plan', 'game_plan', 'stale')], { status: 'not_ready', trigger: { type: 'temporal_recalculation' } }));
ok('8 · known → stale classified lapsed with cause became_stale', dStale.claimTransitions.some(t => t.direction === 'lapsed' && t.cause === 'became_stale'));
ok('8 · readiness regressed', dStale.readiness.direction === 'regressed');

/* ── 9 · became_due + became_not_applicable ── */
const dDue = M.diff(mk([C('e1:kickoff_time', 'kickoff_time', 'not_yet_due')]),
                    mk([C('e1:kickoff_time', 'kickoff_time', 'missing')], { trigger: { type: 'temporal_recalculation' } }));
ok('9 · not_yet_due → missing classified cause became_due', dDue.claimTransitions.some(t => t.cause === 'became_due'));
const dNa = M.diff(mk([C('e1:availability', 'availability', 'missing')]),
                   mk([C('e1:availability', 'availability', 'not_applicable')]));
ok('9 · → not_applicable classified cause became_not_applicable', dNa.claimTransitions.some(t => t.cause === 'became_not_applicable'));

/* ── 10 · appeared (structure_added) / removed (structure_removed) ── */
const dApp = M.diff(mk([]), mk([C('e1:availability', 'availability', 'missing')]));
ok('10 · appeared requirement → cause structure_added', dApp.claimTransitions.some(t => t.direction === 'appeared' && t.cause === 'structure_added'));
const dRem = M.diff(mk([C('e1:availability', 'availability', 'missing')]), mk([]));
ok('10 · removed requirement → cause structure_removed', dRem.claimTransitions.some(t => t.direction === 'removed' && t.cause === 'structure_removed'));

/* ── 11 · evidence-driven causes come from the trigger ── */
const dSup = M.diff(mk([C('r1', 'kickoff_time', 'known')]), mk([C('r1', 'kickoff_time', 'known'), C('r2', 'game_plan', 'known')], { trigger: { type: 'evidence_superseded' } }));
// (r2 appeared as known via supersession trigger → evidence_superseded on the resolve path)
ok('11 · missing → known under an evidence_superseded trigger reads cause evidence_superseded', M.classifyCause(null, 'known', 'evidence_superseded') === 'structure_added' && M.classifyCause('missing', 'known', 'evidence_superseded') === 'evidence_superseded');
const dEvRem = M.diff(mk([C('r1', 'kickoff_time', 'known')]), mk([C('r1', 'kickoff_time', 'missing')], { trigger: { type: 'evidence_removed' } }));
ok('11 · known → missing under evidence_removed trigger reads cause evidence_removed', dEvRem.claimTransitions.some(t => t.cause === 'evidence_removed'));
ok('11 · known → missing with no informative trigger stays cause unknown', M.diff(mk([C('r1', 'kickoff_time', 'known')]), mk([C('r1', 'kickoff_time', 'missing')], { trigger: { type: 'temporal_recalculation' } })).claimTransitions.some(t => t.cause === 'unknown'));

/* ── 12 · removalReason taxonomy (structural, neutral) ── */
ok('12 · supersede trigger → removalReason superseded', M.removalReason('evidence_superseded', false) === 'superseded');
ok('12 · remove trigger → removalReason intentionally_removed', M.removalReason('evidence_removed', false) === 'intentionally_removed');
ok('12 · parent gone → removalReason parent_removed', M.removalReason('temporal_recalculation', true) === 'parent_removed');
ok('12 · context change → removalReason no_longer_applicable', M.removalReason('context_confirmed', false) === 'no_longer_applicable');
ok('12 · otherwise removalReason unknown', M.removalReason('temporal_recalculation', false) === 'unknown');
// parent_removed detected structurally when an entire event's claims vanish
const dParent = M.diff(mk([C('e1:kickoff_time', 'kickoff_time', 'known'), C('e1:game_plan', 'game_plan', 'missing')]), mk([], { trigger: { type: 'temporal_recalculation' } }));
ok('12 · when all of an event\'s claims vanish, removal reason is parent_removed', dParent.claimTransitions.every(t => t.removalReason === 'parent_removed'));

/* ── 13 · ownership_changed is a moment-level cause on a role binding (no claim moved) ── */
const dOwn = M.diff(mk([C('e1:game_plan', 'game_plan', 'missing')], { constrained: [{ label: 'Ownership' }] }),
                    mk([C('e1:game_plan', 'game_plan', 'missing')], { supported: [{ label: 'Ownership' }], trigger: { type: 'role_binding_changed' } }));
ok('13 · a role binding that shifts ownership adds cause ownership_changed', dOwn.causes.includes('ownership_changed'));

/* ── 14 · REBASELINE — incompatible semantics never invents transitions ── */
const dReb = M.diff(mk([C('e1:game_plan', 'game_plan', 'missing')], { status: 'not_ready' }),
                    mk([C('e1:game_plan', 'game_plan', 'known')], { status: 'ready', sem: SEM2 }));
ok('14 · incompatible semantics → semanticsChanged + rebaseline', dReb.semanticsChanged === true && dReb.rebaseline === true);
ok('14 · rebaseline invents NO claim transitions', dReb.claimTransitions.length === 0);
ok('14 · rebaseline readiness direction is neutral (not improved/regressed)', dReb.readiness.direction === 'semantics_changed');
ok('14 · rebaseline summary is neutral about rules, not the organisation', /interpretation rules changed/i.test(dReb.summary.join(' ')) && !/improved|slipped|regress/i.test(dReb.summary.join(' ')));
// legacy → versioned is also a rebaseline (never fabricated as an org change)
ok('14 · legacy → versioned moment is a rebaseline', M.diff(mk([C('e1:game_plan', 'game_plan', 'missing')], { sem: null }), mk([C('e1:game_plan', 'game_plan', 'known')])).semanticsChanged === true);

/* ── 15 · nothingChanged + baseline ── */
ok('15 · observably-identical compatible diff → nothingChanged', M.diff(mk([C('e1:game_plan', 'game_plan', 'missing')]), mk([C('e1:game_plan', 'game_plan', 'missing')], { now: T0 + DAY })).nothingChanged === true);
ok('15 · first moment diffs as a baseline', M.diff(null, s1).baseline === true);

/* ── 16 · record: meaningful only, bounded, immutable; rebaseline still records ── */
let tl = [];
let r = M.record(tl, s1); tl = r.timeline;
ok('16 · first snapshot appends', r.recorded && tl.length === 1);
r = M.record(tl, mk([C('e1:game_plan', 'game_plan', 'missing')], { now: T0 + DAY, contextRecords: [{ status: 'active' }, { status: 'active' }, { status: 'retired' }], questions: [{ blocking: true }, { blocking: false }] }));
ok('16 · identical compatible snapshot is a no-op', r.recorded === false && r.timeline.length === 1);
r = M.record(tl, mk([C('e1:game_plan', 'game_plan', 'missing')], { now: T0 + 2 * DAY, sem: SEM2, contextRecords: [{ status: 'active' }, { status: 'active' }, { status: 'retired' }], questions: [{ blocking: true }, { blocking: false }] }));
ok('16 · a semantics change records a rebaseline moment even with identical observable state', r.recorded === true && r.timeline.length === 2);

/* ── 17 · buildTimeline ordering + per-step diffs; summariseTimeline separates rebaselines ── */
const snaps = [
  mk([C('e1:game_plan', 'game_plan', 'missing')], { status: 'not_ready', fp: 'f1', now: T0 }),
  mk([C('e1:game_plan', 'game_plan', 'known')], { status: 'ready', fp: 'f2', now: T0 + DAY, trigger: { type: 'uncertainty_resolved' } }),
  mk([C('e1:game_plan', 'game_plan', 'known')], { status: 'ready', fp: 'f3', now: T0 + 2 * DAY, sem: SEM2 }),   // rebaseline
  mk([C('e1:game_plan', 'game_plan', 'stale')], { status: 'not_ready', fp: 'f4', now: T0 + 40 * DAY, sem: SEM2, trigger: { type: 'temporal_recalculation' } }),
];
const view = M.buildTimeline([snaps[3], snaps[1], snaps[0], snaps[2]]);
ok('17 · timeline ordered most-recent-first', view.entries[0].snapshot.fingerprint === 'f4' && view.entries[3].snapshot.fingerprint === 'f1');
ok('17 · earliest entry is a baseline', view.entries[3].changed.baseline === true);
ok('17 · the f2 step is a real resolution (compatible)', view.entries[2].changed.claimTransitions.some(t => t.direction === 'resolved'));
ok('17 · the f3 step is a rebaseline (no false transitions)', view.entries[1].changed.semanticsChanged === true && view.entries[1].changed.claimTransitions.length === 0);
ok('17 · rollup counts rebaselines separately from gains/slips', view.summary.rebaselines === 1 && view.summary.readinessImprovements === 1 && view.summary.claimsResolved === 1);

/* ── 18 · changedSince variants ── */
ok('18 · changedSince defaults head-vs-previous', M.changedSince(snaps).changed.to === snaps[3].at);
ok('18 · changedSince(fingerprint) anchors on the match', M.changedSince(snaps, { fingerprint: 'f1' }).anchor.fingerprint === 'f1');

/* ── 19 · publicSnapshot redaction — no hash, no raw trigger internals, no versions ── */
const pub = M.publicSnapshot(s1);
ok('19 · public snapshot drops content hash + raw trigger internals + semantic versions', pub.contentHash === undefined && pub.trigger === undefined && pub.semantics === undefined && !('actorRef' in pub) && !('recordRef' in pub));
ok('19 · public snapshot exposes only a SAFE trigger category', pub.triggerCategory === 'operating context was updated');
ok('19 · timeline entries never leak trigger internals or hashes', !/actorRef|recordRef|contentHash|"boundary"/.test(JSON.stringify(view.entries)));

/* ── 20 · explainMoment — leader-safe explanation ── */
const ex = M.explainMoment(snaps[0], snaps[1]);
ok('20 · explain exposes a safe trigger + readiness labels', ex.trigger === 'a question was answered' && ex.fromReadiness === 'not_ready' && ex.toReadiness === 'ready');
ok('20 · explain transitions carry claim label + direction + cause, NOT requirement ids', ex.transitions.every(t => t.claim && t.direction && t.cause && !('requirementId' in t)) && ex.transitions.some(t => t.direction === 'resolved'));
ok('20 · explain never leaks actor/record ids, hashes, boundary, or versions', !/actorRef|recordRef|contentHash|boundary|SchemaVersion|RulesVersion/.test(JSON.stringify(ex)));
const exReb = M.explainMoment(snaps[1], snaps[2]);
ok('20 · explain of a rebaseline: incompatible + rulesChanged + no transitions + limitation', exReb.semanticallyCompatible === false && exReb.rulesChanged === true && exReb.transitions.length === 0 && exReb.limitations.some(l => /interpretation rules/i.test(l)));
const exUnknown = M.explainMoment(mk([C('r1', 'x', 'known')]), mk([C('r1', 'x', 'missing')], { trigger: { type: 'temporal_recalculation' } }));
ok('20 · explain surfaces an unknown cause as an explicit limitation', exUnknown.limitations.some(l => /could not be attributed/i.test(l)));

/* ── 21 · trigger normalisation — unknown type coerced; unknown fields stripped ── */
const sBad = M.snapshot({ state: state([]), readiness: rvm('ready', focus('e1', 'X')), now: T0, semantics: SEM, trigger: { type: 'hacked', evilText: 'raw evidence here', actorRef: 'a' } });
ok('21 · an unknown trigger type coerces to temporal_recalculation', sBad.trigger.type === 'temporal_recalculation');
ok('21 · unknown trigger fields (raw text) are stripped', !('evilText' in sBad.trigger) && !/raw evidence here/.test(JSON.stringify(sBad)));

/* ── 22 · determinism ── */
ok('22 · identical inputs → identical snapshot', JSON.stringify(mk(two, { fp: 'z' })) === JSON.stringify(mk(two, { fp: 'z' })));

console.log(`\norg-memory-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
