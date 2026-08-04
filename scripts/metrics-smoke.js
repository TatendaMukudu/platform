/* Truth layer — METRICS (pure). Proves the per-org usage counter: events accumulate per org,
   a snapshot ranks busiest-first, and it can be filtered to a single org (a superadmin's own
   view — no cross-org leak). Run: node scripts/metrics-smoke.js */

const M = require('../ai/metrics.js');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const store = {};
M.inc(store, 'club-a', 'turn'); M.inc(store, 'club-a', 'turn'); M.inc(store, 'club-a', 'llm_call');
M.inc(store, 'club-b', 'turn');

ok('1 · events accumulate per org', store['club-a'].events.turn === 2 && store['club-a'].events.llm_call === 1);
const snap = M.snapshot(store);
ok('2 · snapshot ranks the busiest org first', snap[0].orgCode === 'club-a' && snap[0].total === 3);
ok('2 · each row carries the per-event breakdown', snap[0].events.turn === 2 && snap[0].events.llm_call === 1);

const mine = M.snapshot(store, { orgCode: 'club-b' });
ok('3 · a snapshot can be scoped to ONE org (no cross-org leak)', mine.length === 1 && mine[0].orgCode === 'club-b');

M.inc(store, null, 'anon_event');
ok('4 · an event with no org is bucketed under "_" (never crashes)', store['_'].events.anon_event === 1);

console.log(`\nmetrics-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
