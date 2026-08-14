# Review: `codex/outcome-priority-office`

> ## CORRECTED 2026-08-14 — read this first
>
> **Verdict is now: ABANDON THE BRANCH. Do not merge it, do not fix it, do not build on it.**
>
> The review below compared the branch against its own merge base (`2dec238`), so every file
> in it read as new work. It was not new work — all five modules were already on `main` in
> better condition. Against `main` the branch is a stale snapshot:
> `88 files changed, 2697 insertions(+), 11856 deletions(-)`. Merging it would delete whole
> smoke suites and most of `server.js`.
>
> **B1 and B2 below are wrong.** `main` already had the correct `.map(x => _s(x))`; the branch
> has the broken `.map(_s)`. Implementing the fix brief would have reintroduced the bug in
> three files. The five suites are registered on `main` and were green.
>
> **B3, B4 and C1 were real, and were live on `main`** — which is what actually mattered. B3
> and B4 are now fixed and pinned by `scripts/epistemic-invariants-smoke.js`. C1 remains open
> as a design decision.
>
> The methodological error, kept because it is the useful part: review a branch against the
> **target** it would merge into, not against its own merge base. "What did this add since it
> forked" is the wrong question when the branch is stale; "what would change if this merged"
> is the right one.

**Reviewer:** Claude (architecture)
**Branch reviewed:** `codex/outcome-priority-office` @ `30a1110`
**Base:** `2dec238` — behind current `main` (`0fb4078`), further behind the dev branch
**Original verdict (superseded): DO NOT MERGE AS-IS.** Four blocking defects.

---

## What landed

13 commits, 10 new files, 1217 lines. Five pure modules and five smoke suites:

| Module | Suite | Result |
|---|---|---|
| `ai/outcome-intelligence.js` | `outcome-intelligence-smoke` | 10 passed, 0 failed |
| `ai/priority-office.js` | `priority-office-smoke` | 9 passed, **1 failed** |
| `ai/process-reflection.js` | `process-reflection-smoke` | 11 passed, **1 failed** |
| `ai/intelligence-feed.js` | `intelligence-feed-smoke` | 11 passed, **1 failed** |
| `ai/scoped-intelligence-packet.js` | `scoped-intelligence-packet-smoke` | 12 passed, 0 failed |

This is **not** the work briefed in `docs/briefs/principal-agent-slice-1.md`. `ai/roles.js`
and `ai/claims.js` do not exist on any branch.

---

## Blocking

### B1. Three suites are red, and the arbiter cannot see them

None of the five suites is registered in `scripts/test.js`. Confirmed by grep: zero matches
for all five.

`node scripts/test.js` on this branch reports **TRUTH LAYER GREEN**. It is green *because*
it does not run the new tests. Broken code behind a passing CI signal is worse than broken
code behind a failing one — it is the state in which things get merged.

`AGENTS.md` §0 is the one rule that overrides all others. Registration is not a follow-up
chore; unregistered tests are decoration.

### B2. `.map(_s)` — suppression silently does nothing

Three sites:

- `ai/priority-office.js:72` — `new Set((suppressed || []).map(_s))`
- `ai/intelligence-feed.js:272` — same
- `ai/process-reflection.js:122` — same

`Array.prototype.map` invokes its callback as `(element, index, array)`. The helper is
`_s(v, n = 160)`, so **the array index arrives as the truncation length**:

```
expected: [ 'r1', 'r2', 'r3' ]
actual:   [ '',   'r',  'r3' ]
```

The first suppressed ID becomes the empty string, the second is cut to one character, the
third to two. Nothing matches, so nothing is suppressed. This single mistake is the cause of
all three test failures.

The suites deserve credit here: they caught a real defect. Nobody read the output.

**What it means in product terms:** suppression is a consent surface. A user dismisses an
item and the item returns. In `process-reflection` the suppressed items are reflections
about the user's own process — the ones a person is most likely to want gone.

Fix: `.map(x => _s(x))` at all three sites. Note `.map(_key)` at `priority-office.js:65` is
*safe* — `_key` takes one parameter — which is why this reads as correct at a glance.

### B3. The queue carries the raw source object

`ai/priority-office.js:54` and `ai/intelligence-feed.js:106`:

```js
original: item,
```

`normalizeItem` carefully truncates `title` to 160 characters and `body` to 400 — and then
attaches the entire unredacted source object beside them. Every consumer of the queue
receives whatever raw text was in the input.

Product law 7: *engine items carry no raw text fields; sensitive context is a contentless
flag only.* The truncation above is theatre while `original` rides along. `scripts/privacy-smoke.js`
would not catch this, because none of these modules is reachable from anything it exercises.

Fix: drop `original`, or reduce it to the specific typed fields a consumer needs.

### B4. `safe: true` is self-asserted, and a gate trusts it

`safe: true` appears as a hardcoded literal at `outcome-intelligence.js:131,166,182`,
`process-reflection.js:116`, `scoped-intelligence-packet.js:104,135`. It is not computed
from anything.

It is also load-bearing. `scoped-intelligence-packet.js:52`:

```js
if (!item || item.safe === false) return false;
```

An authority gate reads a field the producing module simply declared true. This is the
invariant in `worker.md` inverted: *permissions, identity, confidence and state transitions
are computed, never generated. A module may never assert its own confidence.*

Sharpest illustration: `outcome-intelligence.js` defines `assertSafeText` — a real check for
predictive and causal language — and **never calls it on its own output**. The only caller
anywhere is line 33 of its own smoke test. The module owns a safety checker, declares itself
safe, and does not run the checker.

`priority-office.stamp` gets this right: `safe: queue.every(i => ...)` is computed. That is
the pattern the others should follow.

---

## Correctness

### C1. "Best intervention" ranks by volume, not by whether it worked

`outcome-intelligence.js:121` sorts interventions by `(b.useful - a.useful)` where
`useful = improved + steady` — a **raw count**. `bestForPattern` returns `interventions[0]`,
and `earlySignalBrief` presents that as `suggestedNextStep`.

Demonstrated on this branch:

```
check-in         total=10  improved=3  improvedRate=30%
load reduction   total=3   improved=3  improvedRate=100%

recommended by earlySignalBrief -> checkin
```

The module computes `usefulRate` and `improvedRate` and then ignores both when ranking. The
result is a system that recommends whatever is done most often and describes it as
outcome-informed history. For an organisation, this is a machine for entrenching the current
habit: the most-used intervention accumulates the most "useful" cases by volume alone, and is
then recommended, which increases its use.

Secondarily: `steady` counts as fully useful, so an intervention after which nothing changed
scores identically to one that improved things.

This needs a deliberate decision, not a quick patch — rate with a small-sample floor, or
explicit refusal to rank below a threshold. `SMALL_SAMPLE` already exists and is surfaced in
`limitations`; it just does not affect ordering.

---

## Process

### P1. Nothing is wired — all 1217 lines are unreachable

No `server.js` require, no frontend reference. The only inbound references are between the
new modules and their own suites. Landing pure modules before wiring is fine and correct.
But it means none of this has met real data, and the safety claims are untested in the only
place they matter.

### P2. Every module defers privacy to a caller that does not exist

The recurring header line, in various forms:

> Callers own tenant/auth/privacy before inputs arrive.
> The caller owns privacy/scoping before records reach this module.

Five modules consume a guarantee that nothing currently provides. That guarantee is exactly
what `_retrieveGrounding` does not yet make — it has no awareness of evidence status or
origin structure, which is why `docs/briefs/admissibility.md` exists.

**This is the architectural finding.** The work is not wrong to assume a boundary. It is
premature by one layer. Until the retrieval boundary is real, "already-safe items" is an
assumption, not an input.

---

## What is good, and should survive

Stated plainly, because the defects above are fixable and the foundation mostly is not the
problem:

- The modules are genuinely pure and deterministic; the determinism tests are real tests.
- The historical language discipline is careful and correct — `"was followed by"`, never
  `"caused"`. `assertSafeText` is a good idea (it just needs calling).
- `limitations` as first-class output — `not_causal`, `small_sample`, `outcome_still_unclear`
  — is the right shape for honest uncertainty.
- `requiresConfirmation` gating on every suggestion, and `askFirstOffer` proposing a
  reorder rather than silently performing it, both respect the consent model.
- Headers explain reasoning rather than restating the code.

---

## Recommendation

**Do not merge.** Two paths, in order of preference:

1. **Sequence admissibility first.** `docs/briefs/admissibility.md` builds the boundary all
   five of these modules already assume. Land it, then fix and rebase this branch on top of a
   base where "already-safe" is enforced rather than hoped for. B1–B4 are roughly an hour of
   work and should be done as part of that rebase, not before it.

2. **Fix in place now** (B1–B4, plus a decision on C1) if this work is wanted sooner. It
   still cannot be trusted end-to-end until the boundary exists, but it would at least be
   green, honestly scoped, and registered with the arbiter.

Either way, B1 is non-negotiable: unregistered suites do not count, and a green arbiter over
red tests is the one failure mode this repo is built to prevent.
