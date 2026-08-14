/* Truth layer — WHAT WORKED, NOT WHAT HAPPENED MOST (pure). D2, founder-approved 2026-08-14.

   WRITTEN BEFORE THE IMPLEMENTATION. These cases are the decision; ai/outcome-intelligence.js
   is correct when they are green. Do not edit an assertion to make it pass — if one is wrong,
   say so in the PR and leave it red.

   NOT REGISTERED in scripts/test.js yet. Register it in the commit that makes it green.

   ── The defect ──────────────────────────────────────────────────────────────────────────

   summarize() sorts interventions by `(b.useful - a.useful)` where `useful = improved + steady`
   — a RAW COUNT. bestForPattern returns interventions[0] and earlySignalBrief presents it as
   suggestedNextStep. Live on main today:

       check-in         total=10  improved=3   improvedRate=30%
       load reduction   total=3   improved=3   improvedRate=100%
       recommended -> checkin

   improvedRate and usefulRate are computed and then ignored when ranking. Ten mediocre
   interventions outrank three effective ones, because 10 > 3. That tells a reader what was
   COMMON, not what WORKED, while presenting itself as outcome history — so the most-used
   intervention accrues the most cases by volume, gets recommended, and gets used more. For an
   organisation that is a machine for entrenching the current habit.

   ── The semantics these cases encode ────────────────────────────────────────────────────

       observed efficacy  →  primary ranking signal
       evidence strength  →  preserved SEPARATELY, qualifies confidence
       volume             →  may qualify or break ties, never the primary signal

   The epistemic distinction that must survive: EFFECTIVENESS IS NOT EVIDENCE STRENGTH. An
   intervention can show high efficacy on thin evidence; another can show slightly lower
   efficacy on much stronger support. Collapsing those into one number throws away the thing
   a reader needs in order to judge, so both must remain visible in the output.

   And efficacy alone is not the answer either: a naive sort by success percentage lets 1/1 =
   100% beat 41/50 = 82%, which replaces one wrong ranking with another. Section 2 pins that.

   The method is NOT specified here. A lower confidence bound on the rate satisfies every case
   below, but so may other approaches — the tests define the requirement, the implementer
   chooses how to meet it and says why in the PR.

   Run: node scripts/outcome-ranking-smoke.js */

'use strict';

const oi = require('../ai/outcome-intelligence');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

/* Build n records of one intervention against one pattern, with a given outcome mix. */
function records(pattern, intervention, { improved = 0, steady = 0, worsened = 0, unclear = 0 }) {
  const out = [];
  const push = (outcome, k) => { for (let i = 0; i < k; i++) out.push({ patternType: pattern, interventionType: intervention, outcome }); };
  push('improved', improved); push('steady', steady); push('worsened', worsened); push('unclear', unclear);
  return out;
}
const rank = summary => (summary.patterns[0] ? summary.patterns[0].interventions.map(i => i.interventionType) : []);
const find = (summary, type) => summary.patterns[0].interventions.find(i => i.interventionType === type);

console.log('outcome-ranking-smoke\n');

/* 1 — THE HEADLINE. Efficacy outranks volume. This is the live defect, stated as a case.
   Ten interventions helping 30% of the time must not outrank three helping every time. */
{
  const s = oi.summarize([
    ...records('load_spike', 'checkin',      { improved: 3, worsened: 7 }),
    ...records('load_spike', 'reduce_load',  { improved: 3 }),
  ]);
  ok('1 · the more effective intervention ranks first, despite lower volume',
    rank(s)[0] === 'reduce_load');
  ok('1 · …and it is what earlySignalBrief suggests',
    oi.earlySignalBrief({ patternType: 'load_spike', signalCount: 1, outcomeSummary: s })
      .suggestedNextStep.interventionType === 'reduce_load');
}

/* 2 — but efficacy alone is not enough. A single lucky case must not beat a well-supported
   record. 1/1 = 100% is a weaker basis than 41/50 = 82%, and a naive percentage sort gets
   this exactly backwards. */
{
  const s = oi.summarize([
    ...records('drop_off', 'peer_checkin',  { improved: 1 }),
    ...records('drop_off', 'route_support', { improved: 41, worsened: 9 }),
  ]);
  ok('2 · a 1-of-1 result does not outrank a well-supported 41-of-50',
    rank(s)[0] === 'route_support');
}

/* 3 — effectiveness and evidence strength stay SEPARATE in the output.

   The reader has to be able to see "82% across 50 cases" rather than one opaque score. If
   ranking collapses both into a single number and drops the parts, the output can no longer
   be argued with — which is the property this whole product exists to preserve. */
{
  const s = oi.summarize(records('drop_off', 'route_support', { improved: 41, worsened: 9 }));
  const iv = find(s, 'route_support');
  ok('3 · the observed rate is still reported', iv.improvedRate === 82);
  ok('3 · the sample it rests on is still reported', iv.total === 50);
  ok('3 · rate and sample are distinct values, not one collapsed score',
    iv.improvedRate !== iv.total);
}

/* 4 — "steady" is not "worked".

   useful = improved + steady scored "nothing changed" identically to "this helped". An
   outcome ranking that cannot tell those apart is not reporting outcomes. Same sample size,
   so only the outcome quality differs. */
{
  const s = oi.summarize([
    ...records('friction', 'recognise',  { improved: 5 }),
    ...records('friction', 'peer_checkin', { steady: 5 }),
  ]);
  ok('4 · an intervention that improved things outranks one that changed nothing',
    rank(s)[0] === 'recognise');
  ok('4 · …and the two are distinguishable in the record',
    find(s, 'recognise').improved === 5 && find(s, 'peer_checkin').improved === 0);
}

/* 5 — volume as a QUALIFIER. At equal observed efficacy, more evidence ranks higher: that is
   confidence doing its proper job, rather than standing in for success. */
{
  const s = oi.summarize([
    ...records('load_spike', 'checkin',     { improved: 2 }),
    ...records('load_spike', 'reduce_load', { improved: 20 }),
  ]);
  ok('5 · at equal efficacy, the better-evidenced intervention ranks first',
    rank(s)[0] === 'reduce_load');
}

/* 6 — thin evidence still says so. Ranking honestly is not the same as sounding sure. */
{
  const s = oi.summarize(records('load_spike', 'reduce_load', { improved: 2 }));
  ok('6 · a small sample is still flagged as a limitation',
    find(s, 'reduce_load').limitations.includes('small_sample'));
  ok('6 · …and causation is never claimed',
    find(s, 'reduce_load').limitations.includes('not_causal'));
}

/* 7 — unchanged guarantees. The rewrite must not quietly drop what already held. */
{
  const s = oi.summarize([
    ...records('load_spike', 'checkin',     { improved: 3, worsened: 7 }),
    ...records('load_spike', 'reduce_load', { improved: 3 }),
  ]);
  ok('7 · output is deterministic', JSON.stringify(s) === JSON.stringify(oi.summarize([
    ...records('load_spike', 'checkin',     { improved: 3, worsened: 7 }),
    ...records('load_spike', 'reduce_load', { improved: 3 }),
  ])));
  ok('7 · the summary is still historical, never predictive',
    s.patterns[0].interventions.every(i => /was followed by/.test(i.line)));
  ok('7 · every suggestion remains confirmation-gated',
    oi.earlySignalBrief({ patternType: 'load_spike', signalCount: 1, outcomeSummary: s })
      .suggestedNextStep.requiresConfirmation === true);
  ok('7 · no outcome history still yields no suggestion, rather than a guess',
    oi.earlySignalBrief({ patternType: 'never_seen', signalCount: 1, outcomeSummary: s })
      .suggestedNextStep === null);
  ok('7 · safe is computed and holds', s.safe === true);
}

console.log(`\noutcome-ranking-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
