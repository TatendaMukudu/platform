/* Truth layer — ADMISSIBILITY AT THE RETRIEVAL BOUNDARY (pure).

   WRITTEN BEFORE ai/admissibility.js EXISTS. This file is the specification: the module is
   correct when this suite is green, and the suite was written by someone other than whoever
   implements it, on purpose. A module that ships with only its author's tests can be wrong
   and self-consistent at the same time — which is exactly how a hardcoded `safe: true` came
   to be believed by its own smoke suite.

   NOT REGISTERED in scripts/test.js yet. Register it in the same commit that adds the module.

   ── What this is for ────────────────────────────────────────────────────────────────────

   `_retrieveGrounding` in server.js decides what evidence reaches an answer, and today it has
   no awareness of signal lifecycle. So a signal the source has since withdrawn can still
   ground a current factual claim, and the correction that was supposed to matter changes
   nothing a reader sees. Corrections become cosmetic.

   ── Why this is NOT just isActive ───────────────────────────────────────────────────────

   ai/diagnose.js already has `isActive`, and it is deliberately permissive:

       const isActive = s => !s || !s.status || s.status === 'active';

   `isActive(null)` and `isActive({})` are both TRUE — "a signal is active until something
   says otherwise". That is right for the confidence kernel, where signals stored before the
   status field existed must keep counting. It is wrong for a retrieval gate, where a missing
   or malformed signal is exactly the thing that should not silently ground an answer.

   So admissibility is strictly stronger than isActive in two places, and identical everywhere
   else. Where it diverges, it must say so out loud rather than quietly disagreeing.

   ── The second job: exclusion must be VISIBLE ───────────────────────────────────────────

   Filtering superseded evidence out is only half of a correction. If retrieval simply drops
   it, the answer silently shrinks and nobody learns that something was corrected. partition()
   exists so the caller can say "three accounts, one since withdrawn" instead of quietly
   reporting two.

   ── Out of scope, because these already have homes ──────────────────────────────────────

     - counting independent origins            → ai/diagnose.js:deriveConfidence (originRef)
     - whether evidence may enter a group      → ai/contribution.js:mayContribute
     - who may read a subject at all           → the server's auth layer
     - predictive / diagnostic language        → ai/language-guard.js

   Admissibility answers ONE question: may this signal ground an answer NOW. If a rule here
   starts to look like confidence, authorisation or phrasing, it belongs in one of the four
   modules above instead.

   Run: node scripts/admissibility-smoke.js */

'use strict';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

console.log('admissibility-smoke\n');

let A;
try {
  A = require('../ai/admissibility');
} catch (e) {
  console.log('  ✗ ai/admissibility.js does not exist yet — this suite is its specification.');
  console.log(`\nadmissibility-smoke: 0 passed, 1 failed`);
  process.exit(1);
}

const { SIGNAL_STATUSES } = require('../ai/diagnose');

/* 1 — the allowlist. Active grounds an answer; the two documented terminal states do not.
   Nothing else is a judgement call. */
{
  ok('1 · an active signal is admissible', A.admit({ ref: 's1', status: 'active' }).admissible === true);
  ok('1 · a superseded signal is not', A.admit({ ref: 's2', status: 'superseded' }).admissible === false);
  ok('1 · a withdrawn signal is not', A.admit({ ref: 's3', status: 'withdrawn' }).admissible === false);
}

/* 2 — THE HEADLINE. Fail closed on anything unrecognised.

   This is the test the module exists for. Enumerating the bad states and admitting everything
   else fails OPEN: the day someone adds 'disputed' or 'pending' to the vocabulary, every
   disputed signal silently starts grounding answers until a human notices. The rule in
   AGENTS.md §2 invariant 7 is to allowlist the good states, so a new status is inadmissible on
   the day it is invented rather than the day someone remembers this file. */
{
  ok('2 · an unrecognised status is INADMISSIBLE, not assumed fine',
    A.admit({ ref: 's4', status: 'disputed' }).admissible === false &&
    A.admit({ ref: 's5', status: 'pending' }).admissible === false);
  ok('2 · …and the reason names the status, so the gap is diagnosable',
    /disputed/.test(A.admit({ ref: 's4', status: 'disputed' }).reason || ''));
  ok('2 · …and every status the kernel documents is decided, none fall through',
    SIGNAL_STATUSES.every(s => typeof A.admit({ ref: 'x', status: s }).admissible === 'boolean'));
}

/* 3 — the deliberate divergence from isActive, asserted rather than left implicit.

   isActive(null) is true. Admissibility must NOT copy that: a missing signal at a retrieval
   boundary is a bug or a race, and grounding an answer on it is the failure this module is
   supposed to prevent. */
{
  ok('3 · a missing signal is inadmissible (isActive says otherwise, deliberately)',
    A.admit(null).admissible === false && A.admit(undefined).admissible === false);
  ok('3 · a non-object is inadmissible', A.admit('s1').admissible === false && A.admit(42).admissible === false);
}

/* 3b — but a signal with NO status stays admissible, matching the kernel.

   Signals stored before the status field existed have no status, and treating them as
   inadmissible would silently empty the grounding of every older inquiry. This is the one
   place admissibility must NOT be stricter than isActive, and it is a deliberate decision
   rather than an oversight. */
{
  const r = A.admit({ ref: 's6' });
  ok('3b · a legacy signal with no status is admissible, as the kernel treats it', r.admissible === true);
  ok('3b · …and is marked as legacy rather than silently indistinguishable from active',
    r.status === 'legacy' || /legacy/.test(r.reason || ''));
}

/* 4 — admissibility never touches confidence, origin or phrasing.

   Two signals identical but for originKind must get the same answer. Origin independence is
   deriveConfidence's job; if admissibility starts weighing it, two modules disagree about what
   'reported' means and the kernel has two confidence functions. */
{
  const base = { ref: 's7', status: 'active' };
  const kinds = ['direct_observation', 'self_report', 'reported', 'document', 'system', 'unknown'];
  const answers = new Set(kinds.map(k => A.admit({ ...base, originKind: k }).admissible));
  ok('4 · originKind does not change admissibility (that is confidence\'s job)',
    answers.size === 1 && answers.has(true));
  ok('4 · a missing originRef does not change admissibility either',
    A.admit({ ref: 's8', status: 'active' }).admissible === true);
  ok('4 · the verdict carries no confidence field',
    A.admit(base).confidence === undefined && A.admit(base).score === undefined);
}

/* 5 — purity. Callers pass stored signals; a gate that edits them corrupts the record it
   was meant to protect. */
{
  const sig = { ref: 's9', status: 'superseded', supersededBy: 's10' };
  const before = JSON.stringify(sig);
  A.admit(sig);
  ok('5 · admit does not mutate the signal it judges', JSON.stringify(sig) === before);
  ok('5 · admit is deterministic',
    JSON.stringify(A.admit(sig)) === JSON.stringify(A.admit(sig)));
}

/* 6 — partition: exclusion is reported, not silent. This is what stops a correction from
   being cosmetic — the caller can SAY that something was withdrawn. */
{
  const signals = [
    { ref: 'a', status: 'active' },
    { ref: 'b', status: 'superseded' },
    { ref: 'c' },                             // legacy
    { ref: 'd', status: 'withdrawn' },
    { ref: 'e', status: 'disputed' },         // unrecognised
  ];
  const p = A.partition(signals);
  ok('6 · admissible carries exactly the active and legacy signals',
    p.admissible.map(s => s.ref).sort().join(',') === 'a,c');
  ok('6 · excluded carries the other three', p.excluded.length === 3);
  ok('6 · …each exclusion names the ref and a reason, so it can be reported to a human',
    p.excluded.every(x => x.ref && typeof x.reason === 'string' && x.reason.length > 0));
  ok('6 · …and the superseded one is distinguishable from the unrecognised one',
    p.excluded.find(x => x.ref === 'b').reason !== p.excluded.find(x => x.ref === 'e').reason);
  ok('6 · partition does not mutate its input', signals.length === 5 && signals[1].status === 'superseded');
  ok('6 · an empty list is a valid empty result',
    A.partition([]).admissible.length === 0 && A.partition([]).excluded.length === 0);
  ok('6 · a null list does not throw', (() => { try { A.partition(null); return true; } catch { return false; } })());
}

/* 7 — the integration guarantee, stated as a unit test so it survives the wiring.

   A correction must change what an answer is grounded on. Before: two accounts, both active.
   After: the first is superseded by the second. The corrected account must stop grounding the
   answer, and must still be visible as history — never deleted. */
{
  const { supersede } = require('../ai/diagnose');
  const first  = { ref: 'm1', status: 'active', originRef: 'p1' };
  const second = { ref: 'm2', status: 'active', originRef: 'p1' };
  const corrected = supersede(first, { by: 'm2', reason: 'watched the video' });

  const after = A.partition([corrected, second]);
  ok('7 · a corrected account stops grounding the answer',
    after.admissible.map(s => s.ref).join(',') === 'm2');
  ok('7 · …but is still present as history, not deleted',
    after.excluded.some(x => x.ref === 'm1'));
  ok('7 · …and the original signal object was not destroyed by the correction',
    first.status === 'active' && corrected.status === 'superseded');
}

console.log(`\nadmissibility-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
