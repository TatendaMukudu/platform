/* Truth layer — RATE LIMIT (pure). Proves the fixed-window limiter: allows up to the limit,
   blocks beyond it, resets after the window, reset() clears a key (successful login), and
   sweep() prunes stale windows. Run: node scripts/rate-limit-smoke.js */

const RL = require('../ai/rate-limit.js');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const store = {}; const key = 'user@x|1.2.3.4'; const opt = t => ({ limit: 3, windowMs: 1000, now: t });

/* 1 — up to the limit is allowed, then it blocks */
ok('1 · hit 1 allowed', RL.hit(store, key, opt(0)).allowed === true);
ok('1 · hit 2 allowed', RL.hit(store, key, opt(10)).allowed === true);
ok('1 · hit 3 allowed (at the limit)', RL.hit(store, key, opt(20)).allowed === true);
const over = RL.hit(store, key, opt(30));
ok('1 · hit 4 is blocked, with time to reset', over.allowed === false && over.remaining === 0 && over.resetInMs > 0);

/* 2 — isLimited peeks without counting */
ok('2 · isLimited reports true while over the limit', RL.isLimited(store, key, opt(40)) === true);

/* 3 — the window resets after windowMs */
ok('3 · a hit after the window resets the count (allowed again)', RL.hit(store, key, opt(1001)).allowed === true);

/* 4 — reset() clears a key (e.g. a successful login) */
RL.hit(store, key, opt(1002)); RL.hit(store, key, opt(1003));
RL.reset(store, key);
ok('4 · reset clears the counter', RL.hit(store, key, opt(1004)).count === 1);

/* 5 — sweep prunes stale windows */
const s2 = { a: { start: 0, count: 5 }, b: { start: 5000, count: 1 } };
RL.sweep(s2, { windowMs: 1000, now: 5500 });
ok('5 · sweep drops elapsed windows, keeps live ones', !('a' in s2) && ('b' in s2));

console.log(`\nrate-limit-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
