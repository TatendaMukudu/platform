/* Truth layer — LAW U2: A CONTEST CHANGES WHAT INTELLIQ MAY CLAIM (pure).

   TTD v1 §7, LAW U2. Founder decision: "A valid user contest changes the epistemic state of a
   belief. Contestability is a right, not a comment box."

   WRITTEN BEFORE THE FIX, by the reviewer rather than the implementer. These cases are the
   specification. Do not edit an assertion to make it pass — if one is wrong, say so and leave
   it red.

   NOT REGISTERED in scripts/test.js yet. Register it in the commit that makes it green, so
   main stays green while the gap is open.

   ── What the code does today ────────────────────────────────────────────────────────────

   A subject contesting a belief about themselves ("that's wrong") reaches
   ai/reason.js:applyFeedback, which does exactly two things (`:490-499`):

       b.feedback = { response, at, by };
       b.suppressUntil = now + WRONG_COOLDOWN;      // 60 days

   That is a TIMER, not a state. Three consequences, and the third is the defect:

     1. `b.status` is untouched. It is recomputed from evidence alone every tick at `:238`
        (`contested = counter > 0 && counter >= support`), so a contested belief still reads
        `open`, and its `outcome` still reads `active` (`:254`).
     2. Emission filters on suppression, not on epistemic state — `:300`
        `.filter(b => b.status !== 'dormant' && !isSuppressed(b, now))`, plus five equivalent
        filters in server.js (`:10615, :13824, :13840, :13887, :14113`).
     3. So once the 60 days elapse, the belief returns **automatically, unresolved, and
        indistinguishable from one that was never contested.** The agenda item carries no
        status field at all (`:353-371`), so nothing downstream can even tell.

   The code says so itself, at `:298`: "A dismissed belief is held silently through its
   cooldown (anti-nagging): the reasoner still BELIEVES it". That is correct and desirable for
   *dismissed* — "not now" is a scheduling preference. It is wrong for *wrong*, which is a
   claim about truth. The two responses share a mechanism and should not.

   ── The invariant ───────────────────────────────────────────────────────────────────────

       Once the affected person contests a belief, the passage of time alone must never
       restore it to a settled state.

   Resolution must come from evidence. Silence is not evidence.

   ── An architectural constraint the implementer must know ───────────────────────────────

   `b.status` is reassigned unconditionally on every tick at `ai/reason.js:238`. Setting
   `b.status = 'contested'` inside applyFeedback therefore does NOT survive the next tick — it
   is overwritten from the evidence counts. Whatever carries the contest has to be visible to
   that recomputation, or the recomputation has to honour it. This is stated because it is
   invisible until you have been bitten by it, not as a design instruction: how to satisfy the
   invariant is the implementer's call.

   Run: node scripts/contest-smoke.js */

'use strict';

const R = require('../ai/reason.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const DAY = 86400000;
const t0 = Date.parse('2026-07-01T00:00:00Z');
const BELIEF = 'joe::momentum_drop';
const CONTROL = 'ann::momentum_drop';
const inAgenda = (r, id) => r.agenda.find(a => a.beliefId === id);
const belief = (r, id) => r.beliefs.find(b => b.id === id);

/* A belief is "presented as settled" when it reaches the agenda carrying nothing that marks
   it as disputed. Absence from the agenda is one acceptable answer; presence WITH disclosure
   is another. This helper deliberately accepts both, so the test does not dictate which of
   the two legitimate designs the implementer picks — it only refuses the third, where a
   contested belief is emitted looking exactly like an uncontested one. */
function presentedAsSettled(result, id) {
  const item = inAgenda(result, id);
  if (!item) return false;                                    // withheld — acceptable
  const discloses = item.contested === true || item.status === 'contested'
    || item.epistemicState === 'contested' || item.disputed === true;
  return !discloses;                                          // emitted, undisclosed — the defect
}

const observations = (subjectId, name, ids, at) => ids.map((id, i) => ({
  id, subjectId, subjectName: name, scope: 'teamA', kind: 'momentum_drop',
  severity: 'medium', basis: 'mood softening', t: at - (i + 1) * DAY,
}));

console.log('contest-smoke — LAW U2\n');

/* ── Tick A: two equivalent beliefs form. Joe contests his; Ann never does. Ann is the
   control, and she is here to stop the cheap fix of contesting everything or breaking
   ordinary belief flow to pass this suite. ── */
const tickA = R.reason({
  now: t0,
  scopeLabel: { teamA: 'Team A' },
  observations: [
    ...observations('joe', 'Joe', ['j1', 'j2', 'j3'], t0),
    ...observations('ann', 'Ann', ['a1', 'a2', 'a3'], t0),
  ],
});

ok('1 · a belief forms and is usable before any contest',
  !!belief(tickA, BELIEF) && !!inAgenda(tickA, BELIEF));
ok('1 · …and the control belief forms too', !!inAgenda(tickA, CONTROL));

/* ── The contest. The subject says the belief about them is wrong. ── */
const contested = R.applyFeedback(tickA.beliefs, BELIEF, 'wrong', t0, 'joe');

ok('2 · the contest is recorded against the belief',
  !!contested && contested.feedback && contested.feedback.response === 'wrong');
ok('2 · …attributed to the person who made it', contested.feedback.by === 'joe');

/* ── 3 · The epistemic state itself must change. This is the difference between a right and
   a comment box, and it is what blocks the cheap fix of making suppression permanent —
   hiding a belief for ever still leaves it recorded as an ordinary open belief that the
   reasoner believes. ── */
{
  const b = belief(tickA, BELIEF);
  ok('3 · a contested belief is no longer in an ordinary open state', b.status !== 'open');
  ok('3 · …and its state says contested, in the kernel\'s own vocabulary',
    b.status === 'contested');
  ok('3 · …while the uncontested control belief is untouched',
    belief(tickA, CONTROL).status === 'open');
}

/* ── 4 · THE HEADLINE. Time is not evidence.

   Run a later tick past the cooldown, with FRESH supporting observations so the belief stays
   live rather than going dormant — dormancy at STALE (21 days) would otherwise hide the
   defect and let this suite pass for the wrong reason.

   The delay is derived from the exported WRONG_COOLDOWN rather than hardcoded, so raising
   that constant cannot satisfy this test. ── */
const t1 = t0 + R.WRONG_COOLDOWN + 2 * DAY;
const tickB = R.reason({
  now: t1,
  scopeLabel: { teamA: 'Team A' },
  priorBeliefs: tickA.beliefs,
  observations: [
    ...observations('joe', 'Joe', ['j4', 'j5', 'j6'], t1),
    ...observations('ann', 'Ann', ['a4', 'a5', 'a6'], t1),
  ],
});

ok('4 · after the cooldown expires the belief is NOT presented as settled again',
  !presentedAsSettled(tickB, BELIEF));
ok('4 · …and its epistemic state still records the unresolved contest',
  belief(tickB, BELIEF).status === 'contested');
ok('4 · …even though fresh supporting evidence has arrived since',
  belief(tickB, BELIEF).supportCount > 3);

/* ── 5 · No overcorrection. The control belief must still flow normally through the very
   same tick. A fix that quiets everything, or that treats fresh evidence as suspect, fails
   here. ── */
ok('5 · an uncontested belief is still emitted normally', !!inAgenda(tickB, CONTROL));
ok('5 · …and remains in an ordinary open state', belief(tickB, CONTROL).status === 'open');

/* ── 6 · History survives. Blocks the cheap fixes of deleting the belief or dropping its
   evidence, and keeps the record correctable rather than merely accumulating. ── */
{
  const b = belief(tickB, BELIEF);
  ok('6 · the contested belief still exists — it is not deleted', !!b);
  ok('6 · …its original supporting evidence is intact',
    ['j1', 'j2', 'j3'].every(id => (b.support || []).some(r => r.id === id)));
  ok('6 · …and the contest itself is still on the record for later resolution',
    b.feedback && b.feedback.response === 'wrong' && b.feedback.by === 'joe');
}

/* ── 7 · The contest is first-class evidence, not an annotation.

   The founder's decision says the user's counterclaim "becomes first-class evidence". The
   distinction that matters: the reasoner must be able to SEE the disagreement when it
   re-weighs the belief, because a contest nobody can see cannot be resolved by anybody. ── */
{
  const b = belief(tickB, BELIEF);
  const visibleToReweighing = (b.counterCount || 0) > 0
    || b.contestedBy || b.contest || (b.counter || []).some(r => r && r.by === 'joe');
  ok('7 · the disagreement is visible to the reasoner, not only to the audit log',
    !!visibleToReweighing);
}

/* ── 8 · Resolution stays possible. This suite must not freeze a belief for ever: it asserts
   that TIME does not resolve a contest, never that nothing can. The belief must still be a
   live participant in ticks — carrying its evidence, still being re-weighed — so that a
   later evidence-backed resolution has something to act on. ── */
{
  const b = belief(tickB, BELIEF);
  ok('8 · the belief is still re-weighed each tick, so resolution remains reachable',
    typeof b.confidence === 'string' && typeof b.supportCount === 'number');
  ok('8 · …and it is not silently retired', !(tickB.retired || []).includes(BELIEF));
}

/* ── 9 · "Wrong" and "not now" are different claims and must not share an outcome.

   `dismissed` means "not now" — a scheduling preference, correctly handled by a cooldown.
   `wrong` is a claim about truth. If both produce the same state, the product has one
   mechanism where it needs two. ── */
{
  const tickC = R.reason({
    now: t0, scopeLabel: { teamA: 'Team A' },
    observations: observations('kim', 'Kim', ['k1', 'k2', 'k3'], t0),
  });
  const dismissed = R.applyFeedback(tickC.beliefs, 'kim::momentum_drop', 'dismissed', t0, 'kim');
  ok('9 · a dismissal is still only a cooldown — the reasoner still believes it',
    dismissed.status === 'open' && R.isSuppressed(dismissed, t0));
  ok('9 · …so "wrong" and "not now" do not collapse into the same state',
    dismissed.status !== belief(tickA, BELIEF).status);
}

console.log(`\ncontest-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
