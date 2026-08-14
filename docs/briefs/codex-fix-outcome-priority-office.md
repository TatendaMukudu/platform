# WITHDRAWN — do not implement

**Status:** withdrawn 2026-08-14, before dispatch. Superseded by repository truth.
**Do not work on the branch `codex/outcome-priority-office`. Do not merge it.**

---

## Why

This brief asked for a fix pass on `codex/outcome-priority-office`. That was wrong, and the
error was mine: I reviewed that branch against its own merge base (`2dec238`) instead of
against `main`, so every file in it read as new work.

It is not new work. All five modules were already on `main`, in better condition. What the
branch actually contains is a stale snapshot:

```
git diff --stat origin/main origin/codex/outcome-priority-office
88 files changed, 2697 insertions(+), 11856 deletions(-)
```

Merging it would delete roughly twelve thousand lines — whole smoke suites and most of
`server.js`. There is nothing in it to salvage.

The clearest illustration is the defect the original brief made its centrepiece. `main` has
the **correct** form and the branch has the **broken** one:

```diff
-  const suppressed = new Set((opts.suppressed || []).map(x => _s(x)));   // main
+  const suppressed = new Set((opts.suppressed || []).map(_s));           // the branch
```

Implementing the withdrawn brief would have *reintroduced* the bug it was written to fix, in
three files.

## What was real

Two of the four defects were genuine and live **on main**, which is why they mattered. Both
are now fixed, and both are pinned by a new suite so they cannot come back silently:

- a hardcoded `safe: true` at six sites, read as an authorisation gate by
  `ai/scoped-intelligence-packet.js:canUseItem`;
- `original: item` carrying the whole unredacted source object through
  `ai/priority-office.js` and `ai/intelligence-feed.js`.

See `scripts/epistemic-invariants-smoke.js`, registered in `scripts/test.js`, and
`docs/reviews/codex-outcome-priority-office.md` for the corrected review.

One genuine finding remains open and is a **design decision, not a bug fix** — see C1 in the
review: `ai/outcome-intelligence.js` ranks interventions by raw volume rather than by whether
they worked, so it recommends whatever is done most often. It computes `improvedRate` and then
ignores it. That needs a deliberate choice about small-sample handling before anyone changes
the sort.

## The lesson worth keeping

Review a branch against **`main`**, not against its own merge base. A three-dot diff answers
"what did this branch add since it forked", which is the wrong question when the branch is
stale. The right question is "what would change if this merged", and that is a two-dot diff
against the target.
