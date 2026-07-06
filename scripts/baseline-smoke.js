/* Smoke test for ai/baseline.js — runs with plain `node`, no DB/AI key.
   Verifies self-relative deviation detection + honest "learning" confidence. */

const base = require('../ai/baseline');
const DAY = 86400000;
const now = Date.now();
const ago = d => now - d * DAY;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

// Build a mood series: a long stable normal (~7 over ~3 months), then a recent dip.
const stableThenDip = [];
for (let d = 90; d >= 20; d -= 5) stableThenDip.push({ t: ago(d), v: 7 });   // normal ≈ 7
[10, 7, 4, 2].forEach(d => stableThenDip.push({ t: ago(d), v: 3 }));         // lately ≈ 3

const dip = base.detectDeviation('mood', stableThenDip, now);
ok('deviation flagged as unusual', dip.unusual === true);
ok('direction is below', dip.direction === 'below');
ok('normal learned ≈ 7', Math.abs(dip.normal - 7) < 0.5);
ok('recent ≈ 3', Math.abs(dip.recent - 3) < 0.6);
ok('deviation % is large & negative', dip.deviationPct < -40);
ok('confidence reflects history (clear)', dip.confidence === 'clear');

// A naturally-low-but-STABLE person is NOT flagged (fairness: compare to self).
const lowStable = [];
for (let d = 90; d >= 2; d -= 5) lowStable.push({ t: ago(d), v: 3 });        // always ~3, incl. lately
const low = base.detectDeviation('mood', lowStable, now);
ok('stable-low person is NOT flagged', low.unusual === false);

// Not enough history → honest "learning", never a false alarm.
const sparse = [{ t: ago(3), v: 2 }, { t: ago(1), v: 2 }];
const learn = base.detectDeviation('mood', sparse, now);
ok('sparse history → confidence "learning"', learn.confidence === 'learning' && learn.unusual === false);

// analyze() surfaces concerning deviations + a fingerprint.
const res = base.analyze({ mood: stableThenDip }, now);
ok('analyze returns the concerning deviation', res.deviations.some(d => d.dimension === 'mood'));
ok('fingerprint carries the normal', res.fingerprint.mood && Math.abs(res.fingerprint.mood.normal - 7) < 0.5);

// phrase is self-relative and contains no raw text / diagnosis.
const p = base.phrase(dip);
ok('phrase is self-relative', /their usual/.test(p) && /normal of/.test(p));
ok('phrase has no "prediction"/diagnosis words', !/predict|diagnos|will\b/i.test(p));

console.log(`\nbaseline-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
