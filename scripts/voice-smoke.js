/* Truth layer — IntelliQ's OWN voice (pure). Proves the assistant can speak warmly WITHOUT
   an LLM: openings compose from the facts given; nothing is fabricated (count 0 → "steady",
   no invented number); a rollup headline leads; it's deterministic (same seed → same line);
   it has stable variety (different seeds can differ); and — the point — NOTHING it ever says
   predicts or diagnoses (run through ai/language-guard). No DB / AI / IO.
   Run: node scripts/voice-smoke.js */

const V = require('../ai/voice.js');
const G = require('../ai/language-guard.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

/* ── 1 · the greeting uses time of day + name ── */
ok('1 · morning/afternoon/evening + name', V.greeting('Tyler', 'morning') === 'Morning, Tyler.' && V.greeting('', 'evening') === 'Evening.');

/* ── 2 · a leader opening composes from the count + area ── */
const l1 = V.leaderOpening({ name: 'Tyler', timeOfDay: 'afternoon', count: 2, areaLabel: 'the under-18s', seed: 'a' });
ok('2 · it greets and names how much is worth a look', /^Afternoon, Tyler\./.test(l1) && /two things/.test(l1) && /under-18s/.test(l1));

/* ── 3 · nothing to raise → an honest steady line, no invented number ── */
const l0 = V.leaderOpening({ name: 'Tyler', count: 0, areaLabel: 'the under-18s', seed: 'a' });
ok('3 · count 0 reads as steady and invents no number', /steady|calm|ticking along/.test(l0) && !/\b(one|two|three|\d)\b/.test(l0.replace('under-18s', '')));

/* ── 4 · a rollup headline leads the opening ── */
const rolled = V.leaderOpening({ name: 'Tyler', rollupHeadline: 'the under-18s have had a good week', count: 1, seed: 'a' });
ok('4 · the provided headline leads', /good week/.test(rolled));

/* ── 5 · a member opening speaks to them, not the team ── */
const m1 = V.memberOpening({ name: 'Sam', timeOfDay: 'morning', count: 1, seed: 'b' });
ok('5 · a member opening is about their own side', /^Morning, Sam\./.test(m1) && /your side/.test(m1));

/* ── 6 · deterministic — same inputs → same line ── */
ok('6 · same inputs → identical line', V.leaderOpening({ name: 'T', count: 1, seed: 'x' }) === V.leaderOpening({ name: 'T', count: 1, seed: 'x' }));

/* ── 7 · stable VARIETY — different seeds can produce different phrasings ── */
const variants = new Set([0, 1, 2, 3, 4, 5].map(i => V.leaderOpening({ name: 'T', count: 2, areaLabel: 'the squad', seed: 's' + i })));
ok('7 · variety exists across seeds (not one canned line)', variants.size >= 2);

/* ── 8 · THE POINT — nothing the voice says ever predicts or diagnoses ── */
const everything = [];
for (const tod of ['morning', 'afternoon', 'evening']) {
  for (let c = 0; c <= 6; c++) {
    for (let s = 0; s < 4; s++) {
      everything.push(V.leaderOpening({ name: 'T', timeOfDay: tod, count: c, areaLabel: 'the squad', seed: 'a' + s }));
      everything.push(V.leaderOpening({ name: 'T', timeOfDay: tod, count: c, rollupHeadline: 'the squad has had a good week', seed: 'b' + s }));
      everything.push(V.memberOpening({ name: 'S', timeOfDay: tod, count: c, seed: 'c' + s }));
    }
  }
}
ok(`8 · none of ${everything.length} generated openings predicts or diagnoses`, everything.every(t => G.describesOnly(t)));

console.log(`\nvoice-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
