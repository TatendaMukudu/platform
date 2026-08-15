/* Truth layer — LAW M2: ACTIVITY IS NOT OUTCOME (pure).

   TTD v1 §10 LAW M2. "70 tickets is activity; happier customers and three colleagues
   improved is outcome." More meetings is not better communication; more messages is not
   better collaboration; more interventions is not more improvement.

   WRITTEN BEFORE THE FIX, by the reviewer rather than the implementer. These cases are the
   specification. Do not edit an assertion to make it pass — if one is wrong, say so and
   leave it red.

   NOT REGISTERED in scripts/test.js yet. Register it in the commit that makes it green.

   ── The audit corrected the TTD ─────────────────────────────────────────────────────────

   TTD v1 records M2 as "NOT IMPLEMENTED — no such taxonomy exists anywhere in ai/". That is
   WRONG and this suite corrects it. `ai/primitives.js:10-17` defines exactly the taxonomy the
   law needs, and it is live (`server.js:38`, plus eval, invariants and intelligence-smoke):

       outcome        a result that matters relative to an aim   (grade, KPI, win, recovery)
       participation  showing up / doing the work                (attendance, check-ins, activity)

   The kernel already reasons with the distinction. PLATEAU (`:108-117`) fires when a
   capability/outcome is flat *despite* steady participation — activity present, outcome not
   moving. That is M2 reasoning, already working.

   ── Where the law actually breaks ───────────────────────────────────────────────────────

   The gap is not the taxonomy. It is which side of it an unrecognised signal lands on.
   `ai/packs.js:68`, the end of `primitiveForSignal`:

       return SOURCE_PRIMITIVE[source] || 'outcome';

   The default is `outcome` — the STRONGEST claim available. Verified against the live code:

       slack   / messages sent    -> outcome
       tickets / tickets closed   -> outcome
       calendar/ meetings held    -> outcome
       metric  / tickets closed   -> outcome        ← the founder's own 70-tickets example
       checkin / mood             -> participation  ← the one that is right

   So every activity stream nobody has explicitly classified is promoted, silently and by
   default, into "a result that matters relative to an aim". Volume then reads as achievement
   for the rest of the kernel's life.

   This also fails OPEN, which is the deeper fault. Compare `ai/diagnose.js:169`, where
   `unknown` origin is documented as "The default, and it is conservative." Here the default
   is the least conservative option available. AGENTS.md §2 invariant 7 says allowlist the
   good states; an unclassified signal should land on the weaker claim, not the stronger one.

   ── What this suite does NOT claim ──────────────────────────────────────────────────────

   Not "volume never matters". Volume is legitimate evidence, legitimate context, and a
   legitimate contributor to confidence — `scripts/outcome-ranking-smoke.js` already pins that
   41/50 outranks 1/1, and nothing here weakens it. The law is narrower and harder:

       volume is not outcome.

   Run: node scripts/activity-outcome-smoke.js */

'use strict';

const packs = require('../ai/packs.js');
const prims = require('../ai/primitives.js');
const { primitiveForSignal } = packs;
const { PRIMITIVE, structuralPatterns } = prims;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const DAY = 86400000;
const now = Date.parse('2026-08-01T00:00:00Z');
/* A rising series — more of whatever this is, week over week. */
const rising = (from, to, n = 12) =>
  Array.from({ length: n }, (_, i) => ({ t: now - (n - i) * 7 * DAY, v: from + ((to - from) * i) / (n - 1) }));
const flat = (v, n = 12) =>
  Array.from({ length: n }, (_, i) => ({ t: now - (n - i) * 7 * DAY, v }));

console.log('activity-outcome-smoke — LAW M2\n');

/* ── 1 · THE HEADLINE. Counting how much someone did is not a result.

   Each of these is a tally of actions taken. None of them says whether anything got better,
   and none may be classified as `outcome`. Note the founder's case is 1.4: a ticket count
   from a "metric" source is still a count of tickets. ── */
const activitySignals = [
  ['slack',    'messages sent'],
  ['calendar', 'meetings held'],
  ['tickets',  'tickets closed'],
  ['metric',   'tickets closed'],          // the 70-tickets case
  ['crm',      'calls made'],
  ['email',    'emails sent'],
  ['jira',     'issues touched'],
  ['git',      'commits pushed'],
];
activitySignals.forEach(([source, label], i) =>
  ok(`1.${i + 1} · "${label}" is activity, not an outcome`,
    primitiveForSignal(source, label) !== PRIMITIVE.OUTCOME));

/* ── 2 · Genuine outcomes must STILL classify as outcomes. Without this, the cheap fix is to
   stop calling anything an outcome, which destroys the distinction from the other side. ── */
const realOutcomes = [
  ['assessment', 'assessment score'],
  ['gamestats',  'match result'],
  ['metric',     'customer satisfaction'],
  ['metric',     'revenue'],
  ['sheet',      'retention rate'],
];
realOutcomes.forEach(([source, label], i) =>
  ok(`2.${i + 1} · "${label}" is still an outcome`,
    primitiveForSignal(source, label) === PRIMITIVE.OUTCOME));

/* ── 3 · FAIL CLOSED on the unknown.

   A signal nobody has classified must land on the weaker claim, not the stronger one. This is
   the actual defect — `|| 'outcome'` at ai/packs.js:68 — and it is the one assertion that
   cannot be satisfied by adding another keyword to a list. ── */
{
  const unknowns = [
    ['some_new_tool', 'widgets'],
    ['unknown',       ''],
    ['',              'thing'],
    ['weird_source',  'zzz'],
  ];
  ok('3 · an unclassified signal does not default to being an outcome',
    unknowns.every(([s, l]) => primitiveForSignal(s, l) !== PRIMITIVE.OUTCOME));
  ok('3 · …and still returns a valid primitive rather than nothing',
    unknowns.every(([s, l]) => Object.values(PRIMITIVE).includes(primitiveForSignal(s, l))));
}

/* ── 4 · No overcorrection: the classifications that were already right stay right. A fix
   that reroutes everything to `participation` fails section 2; a fix that breaks the existing
   heuristics fails here. ── */
{
  ok('4 · load-shaped signals are still load',
    primitiveForSignal('metric', 'workload hours') === PRIMITIVE.LOAD);
  ok('4 · capability-shaped signals are still capability',
    primitiveForSignal('metric', 'sprint speed rating') === PRIMITIVE.CAPABILITY);
  ok('4 · resource-shaped signals are still resource',
    primitiveForSignal('metric', 'budget') === PRIMITIVE.RESOURCE);
  ok('4 · a check-in is still participation',
    primitiveForSignal('checkin', 'mood') === PRIMITIVE.PARTICIPATION);
}

/* ── 5 · THE CONSEQUENCE, not just the label.

   Classification only matters because the kernel reasons differently either side of it.
   PLATEAU exists to say "effort is steady but the result is not moving" — the exact shape of
   the founder's 70-tickets case. It needs a PARTICIPATION stream to establish the effort.

   Here: ticket volume climbing steeply, customer satisfaction dead flat. Read correctly, that
   is a plateau — lots of activity, no movement in the result. Read with volume mis-typed as an
   outcome, the effort evidence vanishes and the plateau cannot form, so the system loses the
   very reading that would have told the truth. ── */
{
  const streams = [
    { label: 'tickets closed', primitive: primitiveForSignal('tickets', 'tickets closed'),
      valence: 'up-good', series: rising(35, 70) },
    { label: 'customer satisfaction', primitive: primitiveForSignal('metric', 'customer satisfaction'),
      valence: 'up-good', series: flat(3.1) },
  ];
  const found = structuralPatterns(streams, now);
  ok('5 · rising activity against a flat result reads as a plateau, not as progress',
    found.some(p => p.type === 'plateau'));
  ok('5 · …and no pattern describes the volume itself as an improvement',
    !found.some(p => /improv|better|progress|gain/i.test(p.basis || '')));
}

/* ── 6 · The mirror case, and the reason section 5 cannot be passed by luck.

   Same shape, but the result IS moving: satisfaction climbing while ticket volume is flat.
   That is not a plateau, and a fix that simply always returns plateau — or that treats any
   activity stream as evidence of stagnation — fails here. ── */
{
  const streams = [
    { label: 'tickets closed', primitive: primitiveForSignal('tickets', 'tickets closed'),
      valence: 'up-good', series: flat(35) },
    { label: 'customer satisfaction', primitive: primitiveForSignal('metric', 'customer satisfaction'),
      valence: 'up-good', series: rising(3.1, 4.4) },
  ];
  const found = structuralPatterns(streams, now);
  ok('6 · a moving result with steady activity is NOT reported as a plateau',
    !found.some(p => p.type === 'plateau'));
}

/* ── 7 · Volume still counts where volume legitimately counts.

   M2 is "volume is not outcome", never "volume never matters". Evidence strength is exactly
   where volume belongs, and scripts/outcome-ranking-smoke.js pins it: 41 of 50 outranks 1 of
   1. This assertion exists so that a fix which over-reads M2 and starts discounting sample
   size breaks HERE rather than silently degrading the ranking law next door. ── */
{
  const oi = require('../ai/outcome-intelligence.js');
  const rec = (iv, outcome, n) => Array.from({ length: n }, () =>
    ({ patternType: 'drop_off', interventionType: iv, outcome }));
  const s = oi.summarize([
    ...rec('peer_checkin', 'improved', 1),
    ...rec('route_support', 'improved', 41), ...rec('route_support', 'worsened', 9),
  ]);
  ok('7 · evidence volume still qualifies confidence in outcome ranking',
    s.patterns[0].interventions[0].interventionType === 'route_support');
}

console.log(`\nactivity-outcome-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
