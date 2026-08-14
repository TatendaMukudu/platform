/* Truth layer — THE PROPHECY BOUNDARY (pure). D1, founder-approved 2026-08-14.

   WRITTEN BEFORE THE IMPLEMENTATION. These cases are the decision; ai/language-guard.js is
   correct when they are green. Do not edit an assertion to make it pass — if one is wrong,
   say so and leave it red.

   NOT REGISTERED in scripts/test.js yet. Register it in the commit that makes it green, and
   fold these cases into scripts/language-guard-smoke.js at the same time — that is their
   permanent home; this file is a staging area so that main stays green in the meantime.

   ── The defect ──────────────────────────────────────────────────────────────────────────

   AGENTS.md §2 product law 2 forbids deterministic "will quit" claims, naming that phrasing
   explicitly. The guard does not catch it:

       guard.describesOnly('This player will quit by December.')  // true — passes today

   PREDICTIVE matches `will\s+likely`, and catches "If this continues, the group will struggle"
   through a separate clause pattern. Bald *subject + will + outcome verb* is unmatched, and
   scripts/language-guard-smoke.js never tests that shape — so the implementation has been in
   breach of written product law, untested rather than deliberately permitted.

   ── The principle these cases encode ────────────────────────────────────────────────────

     IntelliQ may describe evidence, uncertainty and possibilities.
     It must not turn those into prophecies about a person.

   So the rule targets FUTURE CLAIMS ABOUT PEOPLE AND THEIR OUTCOMES, not the English future
   tense. "The assessment will open tomorrow" is a deterministic fact about the system and must
   keep working; a blanket ban on `will` would break ordinary product copy and push authors to
   fight the guard rather than obey it.

   Both halves matter equally. A rule that catches the prophecies but also blocks
   "the system will request another response" has not solved this — it has moved the bug.

   Run: node scripts/prediction-boundary-smoke.js */

'use strict';

const G = require('../ai/language-guard');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

console.log('prediction-boundary-smoke\n');

/* 1 — PROPHECIES ABOUT A PERSON MUST BE CAUGHT.

   The first case is the one named in product law 2. The rest are the same shape, so a rule
   that special-cases the literal string "will quit" passes case 1 and fails the others — which
   is the point of listing them. */
const prophecies = [
  'This player will quit by December.',            // the phrasing law 2 names
  'She will drop out before the end of term.',
  'He will fail the next assessment.',
  'This member will burn out.',
  'They will leave the squad.',
  'Marcus will decline over the next month.',
  "He won't recover in time.",                     // negated future is the same claim
];
prophecies.forEach((t, i) =>
  ok(`1.${i + 1} · caught: "${t}"`, G.predictsOrDiagnoses(t) === true));

/* 2 — DETERMINISTIC STATEMENTS ABOUT THE SYSTEM MUST SURVIVE.

   These are facts about what the software does, not claims about a person. Banning the future
   tense outright would catch every one of them, so these cases are what stop the fix from
   being a blanket `\bwill\b`. If this section goes red, the rule is too broad. */
const systemFutures = [
  'The assessment will open tomorrow.',
  'The system will request another response.',
  'The report will include last month\'s sessions.',
  'IntelliQ will show the trend once there is enough history.',
  'This check-in will take about two minutes.',
  'The reminder will be sent on Friday morning.',
];
systemFutures.forEach((t, i) =>
  ok(`2.${i + 1} · allowed: "${t}"`, G.describesOnly(t) === true));

/* 3 — GROUNDED, HEDGED OBSERVATION MUST SURVIVE.

   The distinction the principle draws is between describing evidence and prophesying. A
   hedged, evidence-referring statement is the CORRECT output — it is what the system should
   say instead of a prophecy, so a guard that blocks it leaves nothing admissible to say. */
const grounded = [
  'Signals indicate elevated disengagement risk.',
  'Attendance has dropped in three of the last four weeks.',
  'This pattern has appeared twice before in this squad.',
  'Two accounts disagree about what happened on Saturday.',
];
grounded.forEach((t, i) =>
  ok(`3.${i + 1} · allowed: "${t}"`, G.describesOnly(t) === true));

/* 4 — REGRESSION. Everything the guard caught before must still be caught. A narrowing that
   fixes section 1 by loosening something else has traded one breach for another. */
const alreadyCaught = [
  'His momentum will likely worsen before the final.',
  'They are trending toward a drop in form.',
  'This is expected to lead to more absences.',
  'If this continues, the group will struggle.',
  'She is on track to fall behind her peers.',
  'The team is at risk of declining next month.',
  'I predict a dip in the coming weeks.',
  'Performance is going to drop.',
  'They are likely to disengage.',
  'This could lead to burnout.',
  'He seems clinically depressed.',
  'This looks like an anxiety disorder.',
];
ok('4 · every phrasing the guard already caught is still caught',
  alreadyCaught.every(t => G.predictsOrDiagnoses(t)));

/* 5 — the guard stays pure and total: no throw on empty, null or non-string input. A guard
   that throws is a guard that gets wrapped in a try/catch and quietly bypassed. */
{
  const odd = ['', null, undefined, 0, {}, [], 'a'.repeat(5000)];
  let threw = false;
  for (const t of odd) { try { G.predictsOrDiagnoses(t); } catch { threw = true; } }
  ok('5 · never throws on empty, null or non-string input', !threw);
  ok('5 · empty input is not a prediction', G.predictsOrDiagnoses('') === false);
}

console.log(`\nprediction-boundary-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
