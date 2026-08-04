/* Truth layer — KERNEL CO-REASONING (pure). Proves the LLM can help the kernel reason about
   WHAT TO LOOK AT without ever owning truth: the digest it sees is DE-IDENTIFIED (counts and
   structure only, never a person); a hypothesis is always tagged a hypothesis at 'unconfirmed'
   readiness and is NEVER a belief; any suggestion that leaks a person's name is DROPPED; a
   framing survives only if it attaches to an ALREADY-CONFIRMED pattern. Run: node scripts/kernel-coreasoning-smoke.js */

const K = require('../ai/kernel-coreasoning.js');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

/* 1 — the digest is de-identified: counts + structure, and it names NO individual */
const digest = K.buildDigest({
  kinds: { momentum_drop: 6, baseline_shift: 6, overload: 2 },
  registers: { support: 10, delivery: 4 },
  structure: { teams: 3, tiers: 2, roles: { coach: 3, member: 40 } },
  collecting: ['check-ins', 'attendance'],
  confirmedPatterns: [{ id: 'p_overload', summary: 'the way the team responds to overload keeps not landing' }],
});
ok('1 · the digest carries aggregate counts', /momentum_drop×6/.test(digest) && /3 teams/.test(digest));
ok('1 · the digest names no individual (Tomas/Joe never appear — they were never given)', !/tomas|joe|jimmy/i.test(digest));
ok('1 · the digest exposes confirmed patterns by id for framing', /\[p_overload\]/.test(digest));

/* 2 — a hypothesis is a HYPOTHESIS, never a belief, and carries confirm/refute */
const g = K.governSuggestions({
  hypotheses: [{ statement: 'A defensive-pullback cluster often co-occurs with a formation mismatch.', wouldConfirm: 'formation changes precede the cluster', wouldRefute: 'the cluster appears with a stable formation' }],
  collectionGaps: [{ signal: 'training load / recovery', why: 'youth squads often mask fatigue', howToAsk: 'a light weekly load check-in' }],
  framings: [{ patternRef: 'p_overload', framing: 'in many clubs this reflects a workload distribution problem, not effort' }],
}, { confirmedPatternIds: ['p_overload'], personTokens: ['tomas', 'joe'] });

ok('2 · a hypothesis is tagged a hypothesis at unconfirmed readiness', g.hypotheses.length === 1 && g.hypotheses[0].readiness === 'unconfirmed');
ok('2 · …and is explicitly NOT a belief', g.hypotheses[0].isBelief === false);
ok('2 · …and carries what would confirm AND refute it (falsifiable)', !!g.hypotheses[0].wouldConfirm && !!g.hypotheses[0].wouldRefute);

/* 3 — a collection gap is a proposal to START capturing a signal (confirmation-gated) */
ok('3 · a collection gap names a signal to collect and how to ask for it', g.collectionGaps.length === 1 && /training load/.test(g.collectionGaps[0].signal) && g.collectionGaps[0].requiresConfirmation === true);

/* 4 — a framing survives ONLY when it attaches to a confirmed pattern */
ok('4 · a framing on a confirmed pattern is kept and labelled general', g.framings.length === 1 && g.framings[0].patternRef === 'p_overload' && /general/i.test(g.framings[0].label));
const g2 = K.governSuggestions({ framings: [{ patternRef: 'p_not_real', framing: 'x' }] }, { confirmedPatternIds: ['p_overload'] });
ok('4 · a framing on an UNCONFIRMED pattern is dropped (never invents a finding)', g2.framings.length === 0 && g2.dropped.some(d => d.kind === 'framing'));

/* 5 — DEFENCE IN DEPTH: any suggestion that leaks a person's name is dropped */
const g3 = K.governSuggestions({
  hypotheses: [{ statement: 'Tomas is the reason the back line struggles.', wouldConfirm: 'x', wouldRefute: 'y' }],
  collectionGaps: [{ signal: 'ask Joe directly how he feels', why: 'x', howToAsk: 'y' }],
}, { confirmedPatternIds: [], personTokens: ['tomas', 'joe'] });
ok('5 · a hypothesis that names an individual is dropped', g3.hypotheses.length === 0 && g3.dropped.some(d => /individual/.test(d.reason)));
ok('5 · a collection gap that names an individual is dropped', g3.collectionGaps.length === 0);

/* 6 — thin aggregates yield nothing, honestly (no manufactured insight) */
const g4 = K.governSuggestions({ hypotheses: [], collectionGaps: [], framings: [] }, {});
ok('6 · empty in → empty out, marked not-usable (no fabricated pattern)', g4.usable === false);

/* 7 — the contract forbids individuals + predictions and demands falsifiable hypotheses */
ok('7 · the system prompt bars naming an individual and predicting outcomes', /never name|never a person|never predict/i.test(K.SYSTEM_PROMPT) && /confirm/i.test(K.SYSTEM_PROMPT));

console.log(`\nkernel-coreasoning-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
