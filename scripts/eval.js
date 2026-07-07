/* ============================================================
   scripts/eval.js — the Kernel Quality Harness (Confidence Engine, seed)

   "Best, not fastest" needs quality to be MEASURED, not felt. This runs the
   deterministic kernel agents (Analyst via ai/baseline + ai/intelligence +
   ai/agents) against a golden set of known cases and asserts the RIGHT output.
   It is the first brick of the Confidence Engine: every case we learn the kernel
   got wrong becomes a new golden case, so the kernel can only improve.

   Series shapes (match what the server actually feeds):
     • pattern engine  → moodSeries: [{ t, mood }]
     • baseline engine → dimension series: [{ t, v }]

   Run: `node scripts/eval.js`   (no DB, no AI key — pure reasoning only)
   ============================================================ */

const baseline = require('../ai/baseline');
const intel    = require('../ai/intelligence');
const agents   = require('../ai/agents');

const DAY = 86400000;
const now = Date.now();
const ago = d => now - d * DAY;
let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗ FAIL:', name); } };

// Helper: build a mood series in BOTH shapes + the concerning deviation (if any).
const moodInput = (pairs) => {                    // pairs: [ [daysAgo, mood], ... ]
  const moodSeries = pairs.map(([d, v]) => ({ t: ago(d), mood: v }));
  const vSeries    = pairs.map(([d, v]) => ({ t: ago(d), v }));
  const dev = baseline.detectDeviation('mood', vSeries, now);
  return { moodSeries, deviations: dev.concerning ? [dev] : [] };
};

const GOLDEN = [
  {
    name: 'clear self-relative dip → baseline_shift, never a score',
    build: () => {
      const pairs = [];
      for (let d = 90; d >= 20; d -= 5) pairs.push([d, 8]);
      [10, 6, 3, 1].forEach(d => pairs.push([d, 3]));
      return { id: 'g1', name: 'Alex', now, ...moodInput(pairs) };
    },
    expect: (m) => {
      const { patterns, assessment } = agents.analyst(m, {});
      return patterns.some(p => p.type === 'baseline_shift')
        && assessment && !/\bNaN\b/.test(JSON.stringify(assessment))
        && !/\b\d{2,3}\/100\b/.test(JSON.stringify(assessment));
    },
  },
  {
    name: 'naturally-low-but-STABLE person is NOT flagged (fairness)',
    build: () => {
      const pairs = [];
      for (let d = 90; d >= 1; d -= 5) pairs.push([d, 3]);
      return { id: 'g2', name: 'Sam', now, ...moodInput(pairs) };
    },
    expect: (m) => agents.analyst(m, {}).patterns.length === 0,
  },
  {
    name: 'sparse history → honest "learning", never a false alarm',
    build: () => ({ id: 'g3', name: 'Kim', now, ...moodInput([[3, 2], [1, 2]]) }),
    expect: (m) => agents.analyst(m, {}).patterns.every(p => p.type !== 'baseline_shift'),
  },
  {
    name: 'genuine recent mood decline → momentum_drop fires',
    build: () => ({ id: 'g4', name: 'Lee', now, ...moodInput([[30, 4], [25, 4], [4, 2], [1, 2]]) }),
    expect: (m) => agents.analyst(m, {}).patterns.some(p => p.type === 'momentum_drop'),
  },
  {
    name: 'no output ever contains NaN',
    build: () => ({ id: 'g4b', name: 'Lee', now, ...moodInput([[30, 4], [25, 4], [4, 2], [1, 2]]) }),
    expect: (m) => !/\bNaN\b/.test(JSON.stringify(agents.analyst(m, {}))),
  },
  {
    name: 'learning surfaces as an honest note only with >=2 outcomes',
    build: () => ({ id: 'g5', name: 'Jo', now, ...moodInput([[30, 4], [25, 4], [4, 2], [1, 2]]) }),
    expect: (m) => {
      const weak   = agents.analyst(m, { momentum_drop: { action: 'A quiet word', positive: 1, total: 1 } });
      const strong = agents.analyst(m, { momentum_drop: { action: 'A quiet word', positive: 3, total: 4 } });
      return !weak.assessment.learnedNote && /quiet word/i.test(strong.assessment.learnedNote || '');
    },
  },
  {
    name: 'Coach reflection prompt is self-relative and forbids scores',
    build: () => ({ name: 'Riley', values: ['discipline'], goals: ['make varsity'],
      fingerprint: { mood: { label: 'mood', normal: 7 } },
      deviations: [{ label: 'check-in cadence', direction: 'below', deviationPct: -50 }], trajectory: 'down' }),
    expect: (m) => {
      const { system, user } = agents.coachReflectionPrompt(m);
      const blob = (system + ' ' + user).toLowerCase();
      return /their own normal/.test(blob) && /no scores/.test(blob) && /mirror/.test(blob);
    },
  },
];

console.log('Kernel quality eval — golden set\n');
GOLDEN.forEach(c => {
  let ok = false;
  try { ok = c.expect(c.build()); } catch (e) { ok = false; console.log('    (threw:', e.message + ')'); }
  check(c.name, ok);
});

console.log(`\neval: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
