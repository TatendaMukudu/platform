/* Truth layer — ORGANISATIONAL MEMORY (Phase A, pure): the versioned history of the
   derived org-state. Proves snapshots are deterministic + dedup on observable change,
   diffs classify claim transitions (resolved/lapsed/changed/appeared/removed) and
   readiness movement, the timeline orders correctly with per-step diffs, and the rollup
   counts without inventing learning. No DB / AI / IO. Run: node scripts/org-memory-smoke.js */

const M = require('../ai/org-memory.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const T0 = Date.parse('2026-01-01T09:00:00Z');
const DAY = 86400000;

// A minimal derived-state factory (shape mirrors ai/org-state deriveOrgState output).
const state = (claims, pack = 'sports') => ({ organisation: { id: 'o', pack }, claimStates: claims });
// A minimal readiness view-model factory (shape mirrors ai/readiness project output).
const rvm = (status, focus, opts = {}) => ({
  focus: focus || null,
  readiness: { status, supportedAreas: opts.supported || [], constrainedAreas: opts.constrained || [] },
  nextQuestions: opts.questions || [],
});
const focus = (id, title) => ({ kind: 'event', id, title, type: 'match', at: new Date(T0 + 3 * DAY).toISOString() });

/* ── 1 · snapshot shape + version/schema stamp ── */
const s1 = M.snapshot({
  state: state([{ requirementId: 'e1:game_plan', claimType: 'game_plan', state: 'missing' }]),
  readiness: rvm('partially_ready', focus('e1', 'Cup Final'), { questions: [{ blocking: true }, { blocking: false }] }),
  contextRecords: [{ status: 'active' }, { status: 'active' }, { status: 'retired' }],
  fingerprint: 'fp-1', now: T0,
});
ok('1 · snapshot carries schema + version + fingerprint + pack', s1.schema === 'org-memory/v1' && s1.version === 1 && s1.fingerprint === 'fp-1' && s1.pack === 'sports');
ok('1 · snapshot captures focus, readiness status, claims, question counts, active context', s1.focus.id === 'e1' && s1.readinessStatus === 'partially_ready' && s1.claims.length === 1 && s1.openQuestions === 2 && s1.blockingQuestions === 1 && s1.contextActive === 2);

/* ── 2 · content hash ignores the timestamp (same situation, different moment → same hash) ── */
const s1later = M.snapshot({ state: state([{ requirementId: 'e1:game_plan', claimType: 'game_plan', state: 'missing' }]), readiness: rvm('partially_ready', focus('e1', 'Cup Final')), fingerprint: 'fp-2', now: T0 + 5 * DAY });
const s1noq = M.snapshot({ state: state([{ requirementId: 'e1:game_plan', claimType: 'game_plan', state: 'missing' }]), readiness: rvm('partially_ready', focus('e1', 'Cup Final')), fingerprint: 'fp-1', now: T0 });
ok('2 · content hash is invariant to timestamp + fingerprint (same observable state → same hash)', s1later.contentHash === s1noq.contentHash);
ok('2 · but the recorded moment/fingerprint still differ', s1later.at !== s1noq.at && s1later.fingerprint !== s1noq.fingerprint);

/* ── 3 · content hash is invariant to claim iteration order ── */
const two = [{ requirementId: 'e1:game_plan', claimType: 'game_plan', state: 'missing' }, { requirementId: 'e1:kickoff_time', claimType: 'kickoff_time', state: 'known' }];
const sA = M.snapshot({ state: state(two), readiness: rvm('partially_ready', focus('e1', 'Cup Final')), now: T0 });
const sB = M.snapshot({ state: state([...two].reverse()), readiness: rvm('partially_ready', focus('e1', 'Cup Final')), now: T0 });
ok('3 · content hash is invariant to claim ordering (deterministic)', sA.contentHash === sB.contentHash);
ok('3 · claims are stored in a stable sorted order', sA.claims[0].requirementId === 'e1:game_plan' && sA.claims[1].requirementId === 'e1:kickoff_time');

/* ── 4 · content hash CHANGES when a claim state changes ── */
const s2 = M.snapshot({ state: state([{ requirementId: 'e1:game_plan', claimType: 'game_plan', state: 'known' }]), readiness: rvm('ready', focus('e1', 'Cup Final')), fingerprint: 'fp-3', now: T0 + DAY });
ok('4 · a changed claim state changes the content hash', s2.contentHash !== s1.contentHash);

/* ── 5 · shouldRecord: baseline always, dedup on identical observable state ── */
ok('5 · no previous snapshot → always record the baseline', M.shouldRecord(null, s1) === true);
ok('5 · identical observable state → do NOT record (no timeline noise)', M.shouldRecord(s1noq, s1later) === false);
ok('5 · a genuine change → record', M.shouldRecord(s1, s2) === true);

/* ── 6 · diff: a missing → known transition reads as RESOLVED + readiness improved ── */
const d1 = M.diff(s1, s2);
ok('6 · missing → known is classified resolved', d1.claimTransitions.some(t => t.claimType === 'game_plan' && t.from === 'missing' && t.to === 'known' && t.direction === 'resolved'));
ok('6 · readiness partially_ready → ready reads as improved', d1.readiness.direction === 'improved' && d1.readiness.changed === true);
ok('6 · the summary states the resolution in plain, non-blaming language', d1.summary.some(l => /game plan is now recorded/i.test(l)) && !/\bfault|failed to|blame\b/i.test(d1.summary.join(' ')));

/* ── 7 · diff: a known → stale transition reads as LAPSED + readiness regressed ── */
const s3 = M.snapshot({ state: state([{ requirementId: 'e1:game_plan', claimType: 'game_plan', state: 'stale' }]), readiness: rvm('not_ready', focus('e1', 'Cup Final')), now: T0 + 30 * DAY });
const d2 = M.diff(s2, s3);
ok('7 · known → stale is classified lapsed', d2.claimTransitions.some(t => t.direction === 'lapsed' && t.from === 'known' && t.to === 'stale'));
ok('7 · readiness ready → not_ready reads as regressed', d2.readiness.direction === 'regressed');

/* ── 8 · diff: a same-rank state change (missing → disputed) reads as CHANGED, not improved/regressed ── */
const sM = M.snapshot({ state: state([{ requirementId: 'e1:kickoff_time', claimType: 'kickoff_time', state: 'missing' }]), readiness: rvm('not_ready', focus('e1', 'Cup Final')), now: T0 });
const sD = M.snapshot({ state: state([{ requirementId: 'e1:kickoff_time', claimType: 'kickoff_time', state: 'disputed' }]), readiness: rvm('not_ready', focus('e1', 'Cup Final')), now: T0 + DAY });
const d3 = M.diff(sM, sD);
ok('8 · missing → disputed (equal rank) is classified changed', d3.claimTransitions.some(t => t.direction === 'changed' && t.from === 'missing' && t.to === 'disputed'));

/* ── 9 · diff: appeared / removed transitions ── */
const sNone = M.snapshot({ state: state([]), readiness: rvm('insufficient_information', focus('e1', 'Cup Final')), now: T0 });
const sOne = M.snapshot({ state: state([{ requirementId: 'e1:availability', claimType: 'availability', state: 'missing' }]), readiness: rvm('not_ready', focus('e1', 'Cup Final')), now: T0 + DAY });
const dApp = M.diff(sNone, sOne);
const dRem = M.diff(sOne, sNone);
ok('9 · a newly-tracked requirement is classified appeared', dApp.claimTransitions.some(t => t.direction === 'appeared' && t.claimType === 'availability'));
ok('9 · a no-longer-tracked requirement is classified removed', dRem.claimTransitions.some(t => t.direction === 'removed' && t.claimType === 'availability'));

/* ── 10 · diff: focus change detected ── */
const dFocus = M.diff(M.snapshot({ state: state([]), readiness: rvm('ready', focus('e1', 'Cup Final')), now: T0 }),
                      M.snapshot({ state: state([]), readiness: rvm('ready', focus('e2', 'League Match')), now: T0 + DAY }));
ok('10 · a focus change is detected + summarised', dFocus.focus.changed === true && dFocus.summary.some(l => /focus moved to league match/i.test(l)));

/* ── 11 · diff: context delta ── */
const dCtx = M.diff(M.snapshot({ state: state([]), readiness: rvm('ready', focus('e1', 'X')), contextRecords: [{ status: 'active' }], now: T0 }),
                    M.snapshot({ state: state([]), readiness: rvm('ready', focus('e1', 'X')), contextRecords: [{ status: 'active' }, { status: 'active' }, { status: 'active' }], now: T0 + DAY }));
ok('11 · added operating-context records show as a positive context delta', dCtx.contextDelta === 2 && dCtx.summary.some(l => /2 operating-context records added/i.test(l)));

/* ── 12 · diff: nothingChanged when observably identical ── */
const dSame = M.diff(s1noq, s1later);   // same claims/focus/readiness/context, different moment
ok('12 · two observably-identical snapshots diff to nothingChanged', dSame.nothingChanged === true && /no observable change/i.test(dSame.summary.join(' ')));

/* ── 13 · diff: baseline (no previous) ── */
const dBase = M.diff(null, s1);
ok('13 · the first snapshot diffs as a baseline (timeline begins)', dBase.baseline === true && /timeline begins/i.test(dBase.summary.join(' ')));

/* ── 14 · record: append only on meaningful change, bounded, immutable input ── */
let tl = [];
let r = M.record(tl, s1); tl = r.timeline;
ok('14 · recording the first snapshot appends it', r.recorded === true && tl.length === 1);
const s1dup = M.snapshot({ state: state([{ requirementId: 'e1:game_plan', claimType: 'game_plan', state: 'missing' }]), readiness: rvm('partially_ready', focus('e1', 'Cup Final'), { questions: [{ blocking: true }, { blocking: false }] }), contextRecords: [{ status: 'active' }, { status: 'active' }, { status: 'retired' }], fingerprint: 'fp-later', now: T0 + DAY });
r = M.record(tl, s1dup); // observably identical to s1
ok('14 · recording an observably-identical snapshot is a no-op', r.recorded === false && r.timeline.length === 1);
r = M.record(tl, s2); tl = r.timeline;
ok('14 · recording a genuine change appends', r.recorded === true && tl.length === 2);
// bounded
let capped = [];
for (let i = 0; i < 10; i++) capped = M.record(capped, M.snapshot({ state: state([{ requirementId: 'e1:c', claimType: 'c', state: i % 2 ? 'known' : 'missing' }]), readiness: rvm('ready', focus('e1', 'X')), now: T0 + i * DAY }), { cap: 4 }).timeline;
ok('14 · the timeline is bounded to cap (oldest dropped)', capped.length === 4);

/* ── 15 · buildTimeline: ordered most-recent-first, per-step diffs, first has baseline ── */
const snaps = [
  M.snapshot({ state: state([{ requirementId: 'e1:game_plan', claimType: 'game_plan', state: 'missing' }]), readiness: rvm('not_ready', focus('e1', 'Cup Final')), fingerprint: 'f1', now: T0 }),
  M.snapshot({ state: state([{ requirementId: 'e1:game_plan', claimType: 'game_plan', state: 'known' }]), readiness: rvm('ready', focus('e1', 'Cup Final')), fingerprint: 'f2', now: T0 + DAY }),
  M.snapshot({ state: state([{ requirementId: 'e1:game_plan', claimType: 'game_plan', state: 'stale' }]), readiness: rvm('not_ready', focus('e1', 'Cup Final')), fingerprint: 'f3', now: T0 + 30 * DAY }),
];
const view = M.buildTimeline([snaps[2], snaps[0], snaps[1]]);   // deliberately unordered input
ok('15 · buildTimeline orders most-recent-first regardless of input order', view.entries[0].snapshot.fingerprint === 'f3' && view.entries[2].snapshot.fingerprint === 'f1');
ok('15 · the earliest entry carries a baseline diff', view.entries[2].changed.baseline === true);
ok('15 · each later entry carries the diff to the prior moment', view.entries[0].changed.claimTransitions.some(t => t.direction === 'lapsed') && view.entries[1].changed.claimTransitions.some(t => t.direction === 'resolved'));

/* ── 16 · summariseTimeline: counts improvements/regressions/resolved/lapsed (no learning) ── */
const sum = view.summary;
ok('16 · the rollup counts readiness improvements + regressions', sum.readinessImprovements === 1 && sum.readinessRegressions === 1);
ok('16 · the rollup counts claims resolved + lapsed', sum.claimsResolved === 1 && sum.claimsLapsed === 1);
ok('16 · the rollup reports span + count + last change', sum.count === 3 && sum.spanFrom === snaps[0].at && sum.lastChangeAt === snaps[2].at);

/* ── 17 · changedSince: default anchor is the previous moment; steps/fingerprint honoured ── */
const csDefault = M.changedSince(snaps);
ok('17 · changedSince defaults to head-vs-previous', csDefault.changed.from === snaps[1].at && csDefault.changed.to === snaps[2].at);
const csSteps = M.changedSince(snaps, { steps: 2 });
ok('17 · changedSince(steps:2) compares head against 2 moments back', csSteps.changed.from === snaps[0].at && csSteps.changed.claimTransitions.some(t => t.claimType === 'game_plan' && t.from === 'missing' && t.to === 'stale'));
const csFp = M.changedSince(snaps, { fingerprint: 'f1' });
ok('17 · changedSince(fingerprint) anchors on the matching snapshot', csFp.anchor.fingerprint === 'f1' && csFp.head.fingerprint === 'f3');

/* ── 18 · publicSnapshot redaction: no internal content hash leaks ── */
const pub = M.publicSnapshot(s1);
ok('18 · the public snapshot drops the internal content hash', pub.contentHash === undefined && pub.at === s1.at && pub.claims.length === 1);
ok('18 · buildTimeline entries are public (no content hash)', view.entries.every(e => e.snapshot.contentHash === undefined));

/* ── 19 · empty state (no focus) is a valid snapshot, not a crash ── */
const sEmpty = M.snapshot({ state: state([]), readiness: rvm('insufficient_information', null), now: T0 });
ok('19 · a no-focus moment is a valid snapshot', sEmpty.focus === null && sEmpty.readinessStatus === 'insufficient_information' && typeof sEmpty.contentHash === 'string');

/* ── 20 · determinism: identical inputs → byte-identical snapshot (excluding time) ── */
const g1 = M.snapshot({ state: state(two), readiness: rvm('partially_ready', focus('e1', 'Cup Final')), fingerprint: 'z', now: T0 });
const g2 = M.snapshot({ state: state(two), readiness: rvm('partially_ready', focus('e1', 'Cup Final')), fingerprint: 'z', now: T0 });
ok('20 · the projection is deterministic (identical inputs → identical snapshot)', JSON.stringify(g1) === JSON.stringify(g2));

console.log(`\norg-memory-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
