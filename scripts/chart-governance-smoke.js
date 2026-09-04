/* Truth layer — A GRAPH IS A VIEW OF THE RECORD, NOT A NEW SOURCE OF NUMBERS.

   Founder, September 2026: "I want graphs to be a spontaneous thing created in a focus, high,
   low, inquiry when discussing with the assistant kinda like what ChatGPT does." And, asked where
   the figures come from: "The server, always."

   A chart is the most persuasive object a product can put in front of somebody. A line going up
   reads as a fact before anybody has looked at the axis, and by then the reader has already
   believed it. So every guarantee this codebase makes about a written claim has to hold for a
   picture, and one of them has to be made new.

   THE ONE THAT IS NEW: A COUNT MUST EQUAL ITS OWN EVIDENCE. Naming refs beside a number is not
   provenance if nothing checks that the number IS the refs — a fabricated value with a plausible
   citation list is exactly what an unchecked provenance field invites. So the count is computed
   FROM the refs and compared against what was claimed.

   THE ONE THAT MATTERS MOST: NOTHING IS SCORED. This product deliberately removed a system that
   reduced people to figures. A chart is precisely how that comes back, because a score is far
   easier to defend as a picture than as a sentence — nobody argues with an axis. The unit
   whitelist is the whole defence: count, band, date, and nothing else, ever.

   Run: node scripts/chart-governance-smoke.js */

'use strict';

const chart = require('../ai/chart.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const DAY = 86400000;
const t0 = Date.parse('2026-08-01T00:00:00Z');

/* ── CG1-CG3: the unit whitelist. The anti-scoring law. ── */
ok('CG1 the units a chart may plot are count, band and date — and nothing else',
  JSON.stringify(chart.UNITS) === JSON.stringify(['count', 'band', 'date']));

for (const unit of ['score', 'rating', 'percent', 'index', 'iq', 'performance']) {
  const spec = { kind: 'firming', title: 'x', limitations: ['x'],
    series: [{ key: 'k', unit, points: [{ at: t0, value: 74, refs: ['a'] }] }] };
  const g = chart.governChart(spec);
  ok(`CG2 a chart asking for a "${unit}" scale is REFUSED — the scoring system this product removed would come back as a picture before it came back as a sentence`,
    !g.ok && g.violations.some(v => v.kind === 'invented_scale') && g.chart === null);
}
ok('CG3 …and the refusal says so in words a reader would use, rather than "insufficient data"',
  /nothing here is scored/i.test(chart.refusalNote([{ kind: 'invented_scale' }])));

/* ── CG4-CG6: provenance, and the check that makes provenance mean something. ── */
{
  const spec = { kind: 'firming', title: 'x', limitations: ['x'],
    series: [{ key: 'origins', unit: 'count', points: [{ at: t0, value: 2, refs: [] }] }] };
  const g = chart.governChart(spec);
  ok('CG4 a point that names no evidence is refused — a number that traces to nothing is invented whatever shape it is drawn in',
    !g.ok && g.violations.some(v => v.kind === 'unprovenanced'));
}
{
  // THE ONE THAT MATTERS. Refs present, count fabricated.
  const spec = { kind: 'firming', title: 'x', limitations: ['x'],
    series: [{ key: 'origins', unit: 'count', points: [{ at: t0, value: 9, refs: ['a', 'b'] }] }] };
  const g = chart.governChart(spec);
  ok('CG5 A COUNT THAT DISAGREES WITH ITS OWN EVIDENCE IS REFUSED — citing two things beside the number nine is what an unchecked provenance field invites',
    !g.ok && g.violations.some(v => v.kind === 'count_disagrees_with_evidence'));
}
{
  const spec = { kind: 'firming', title: 'x', limitations: ['x'],
    series: [{ key: 'origins', unit: 'count', points: [{ at: t0, value: 2, refs: ['a', 'outside'] }] }] };
  const g = chart.governChart(spec, { basis: ['a', 'b'] });
  ok('CG6 a point citing something outside the basis the reader was cleared for is refused as firmly as an invented one — it is a chart of data they were never shown',
    !g.ok && g.violations.some(v => v.kind === 'outside_basis'));
}

/* ── CG7: the builder cannot be talked into a bad count, because it never reads one. ── */
{
  const built = chart.buildFirming({
    occasions: [{ at: t0, refs: ['a'], band: 'tentative', count: 99, value: 99 }],
    threshold: 2,
  });
  ok('CG7 the builder computes the count FROM the refs and never reads one from the caller — a caller passing 99 beside one ref cannot get 99 drawn',
    built.series[0].points[0].value === 1);
}

/* ── CG8-CG9: bands are the kernel's own ladder, and an unknown step is refused. ── */
ok('CG8 the band axis is the kernel\'s four steps, in the kernel\'s order',
  JSON.stringify(chart.BAND_STEPS) === JSON.stringify(['tentative', 'emerging', 'probable', 'supported']));
{
  const spec = { kind: 'firming', title: 'x', limitations: ['x'],
    series: [{ key: 'band', unit: 'band', points: [{ at: t0, value: 7, refs: ['a'] }] }] };
  const g = chart.governChart(spec);
  ok('CG9 a band position the kernel does not have is refused — it would put a mark on an axis that means nothing',
    !g.ok && g.violations.some(v => v.kind === 'unknown_band'));
}

/* ── CG10-CG12: the cohort floor, and WHY the refusal is total. ── */
{
  const spec = chart.buildSpread({
    title: 'How it landed',
    categories: [{ key: 's1', label: 'Pressing traps', refs: ['e1', 'e2', 'e3'] },
                 { key: 's2', label: 'Rest defence',   refs: ['e1'] }],
    cohort: { k: 3, n: 6 },
    floor: { ok: false, reason: '3 of 6 is below the floor of 5' },
  });
  const g = chart.governChart(spec);
  ok('CG10 a group chart below the two-sided cohort floor is REFUSED — a bar chart of three in a squad of six is a roster with the names taken off',
    !g.ok && g.violations.some(v => v.kind === 'below_cohort_floor'));
  ok('CG10b …and it returns NO chart at all, rather than the bars above the floor — a reader takes what is drawn for the whole group, so a partial picture is worse than none',
    g.chart === null);
  ok('CG10c …and says why in the reader\'s terms, because a refusal nobody understands is a refusal they learn to click past',
    /stays anonymous/i.test(chart.refusalNote(g.violations)));
}
/* CG10d — THE BUG THE HTTP SUITE CAUGHT, pinned here where it belongs.

   When the floor fails, the caller has NOTHING to put in the chart — so the refusal arrived
   behind an `empty` violation and refusalNote, which reads the first one, said "nothing on the
   record to draw yet". That is a privacy refusal wearing the costume of an absence: a coach told
   their squad said nothing, when the truth is their squad is too small to be shown. Neither
   outcome draws a chart, so nobody would ever have reported it. */
{
  const spec = chart.buildSpread({
    title: 'How it landed', categories: [],
    cohort: { k: 1, n: 1 }, floor: { ok: false, reason: '1 of 1 is below the floor of 5' },
  });
  const g = chart.governChart(spec);
  ok('CG10d a floor refusal with NOTHING to draw still says it is a floor refusal — "nothing here" and "too few people to show" both draw no chart, so the wrong one would never be reported',
    !g.ok && /stays anonymous/i.test(chart.refusalNote(g.violations)));
}
{
  const spec = chart.buildSpread({
    title: 'How it landed',
    categories: [{ key: 's1', label: 'Pressing traps', refs: ['e1', 'e2', 'e3', 'e4', 'e5'] }],
    cohort: { k: 6, n: 12 },
    floor: { ok: true, reason: '6 of 12, both sides clear' },
  });
  const g = chart.governChart(spec, { basis: ['e1', 'e2', 'e3', 'e4', 'e5'] });
  ok('CG11 …and above the floor it draws, which is what proves the gate above is a gate and not an always-refuse',
    g.ok === true && g.chart.series[0].points[0].value === 5);
  ok('CG11b …counting people and never naming them, said on the chart itself',
    g.chart.limitations.some(l => /never names them/i.test(l)));
  ok('CG12 …and it says that silence is not an answer, because a bar chart of who agreed invites reading the gap as who disagreed',
    g.chart.limitations.some(l => /silence is not an answer/i.test(l)));
}

/* ── CG13: a picture with no stated limits is read as complete. ── */
{
  const spec = { kind: 'firming', title: 'x', limitations: [],
    series: [{ key: 'origins', unit: 'count', points: [{ at: t0, value: 1, refs: ['a'] }] }] };
  ok('CG13 a chart with no stated limits is refused — a picture that does not say what it cannot show is read as showing everything',
    !chart.governChart(spec).ok);
}

/* ── CG14-CG16: the firming chart, which is the founder's first pick and teaches the law. ── */
{
  const built = chart.buildFirming({
    title: 'How this firmed up',
    occasions: [
      { at: t0,           refs: ['s1'],             band: 'tentative' },
      { at: t0 + 3 * DAY, refs: ['s1', 's2'],       band: 'emerging' },
      { at: t0 + 9 * DAY, refs: ['s1', 's2', 's3'], band: 'probable' },
    ],
    threshold: 2,
  });
  const g = chart.governChart(built, { basis: ['s1', 's2', 's3'] });
  ok('CG14 a real firming chart passes governance end to end', g.ok === true);
  ok('CG14b …with two series: how many independent origins had spoken, and what the kernel made of it',
    built.series.map(s => s.key).join(',') === 'origins,band');
  ok('CG15 THE THRESHOLD IS DRAWN — the shape is only legible against it, because two origins is not "a bit more evidence", it is the difference between a question and a finding',
    built.threshold && built.threshold.value === 2 && built.threshold.unit === 'count');
  /* CG16 — THE CAVEAT THIS SUITE MOVED. It first passed only because the server happened to hand
     the line in as a limitation, which meant the single most important thing to say about this
     chart depended on every future caller remembering to say it. It is what the chart PLOTS, so
     the builder states it and a caller cannot omit it. Asserted with NO limitations passed in. */
  ok('CG16 …and the chart itself says it counts origins and not messages — the caveat is intrinsic, not something a caller has to remember to supply',
    chart.buildFirming({ occasions: [{ at: t0, refs: ['s1'], band: 'tentative' }] })
      .limitations.some(l => /the same person saying it again does not move this/i.test(l)));
}

/* ── CG16b: THE SPREAD IS TWO SERIES, and a mutation collapsing it to one bit nothing.

   L-MT3 carried into the picture. A part where three people said they were stuck and a part
   nobody opened are BOTH a zero-height "said they had it" bar. Drawing only that series makes
   them identical — the exact conflation the record refuses to make in words, and worse here,
   because nobody argues with a bar. ── */
{
  const built = chart.buildSpread({
    categories: [
      { key: 's1', label: 'Pressing traps', refs: [], notRefs: ['e1', 'e2', 'e3'] },
      { key: 's2', label: 'Set pieces',     refs: [], notRefs: [] },
    ],
    cohort: { k: 6, n: 14 }, floor: { ok: true, reason: 'clear' },
  });
  ok('CG16b a spread carries BOTH what people had and what they did not — one series makes "three said they are stuck" and "nobody opened it" the same empty bar',
    built.series.map(s => s.key).join(',') === 'got,not_yet');
  const stuck = built.series[1].points.find(p => p.key === 's1');
  const quiet = built.series[1].points.find(p => p.key === 's2');
  ok('CG16c …so the part three people are stuck on is visibly different from the part nobody opened',
    stuck.value === 3 && quiet.value === 0);
  ok('CG16d …and an HONEST ZERO still draws: a nought whose evidence is genuinely empty is not an invented number, which is what collided with the provenance rule the first time',
    chart.governChart(built, { basis: ['e1', 'e2', 'e3'] }).ok === true);
  ok('CG16e …while a NON-zero with nothing behind it is still refused, so the rule was made exact rather than loosened',
    !chart.governChart({ kind: 'spread', title: 'x', limitations: ['x'],
      series: [{ key: 'got', unit: 'count', points: [{ at: null, value: 4, refs: [] }] }] }).ok);
  ok('CG16f …and the chart says that an empty bar means nothing was said about it, not that nobody understood it',
    built.limitations.some(l => /not the same as nobody understanding it/i.test(l)));
}

/* ── CG17: nothing to draw is not an empty chart. ── */
{
  const built = chart.buildFirming({ occasions: [] });
  ok('CG17 with nothing on the record the chart is refused rather than drawn empty — an empty chart claims "nothing happened", which is a different and false statement',
    !chart.governChart(built).ok);
}

/* ── CG18: the timeline plots dates and refuses to invent a magnitude for an event. ── */
{
  const built = chart.buildTimeline({
    events: [{ at: t0, label: 'Set', refs: ['f1'] }, { at: t0 + DAY, label: 'Attached', refs: ['m1'] }],
  });
  ok('CG18 a timeline plots WHEN and nothing else — giving each event a size would be a score wearing a different hat',
    built.series[0].unit === 'date' && built.series[0].points.every(p => p.value === p.at));
  ok('CG18b …in order, whatever order they arrived in',
    chart.governChart(built, { basis: ['f1', 'm1'] }).ok === true);
}

console.log(`\nchart-governance-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
