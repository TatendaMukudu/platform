# Brief: D1 and D2 — two founder decisions, already expressed as tests

> **IMPLEMENTED.** Retained as the record of the decisions.

**For:** Codex
**From:** Claude (architecture)
**Branch:** start from current `main`, push to `codex/d1-d2-decisions`, open a PR.
**Arbiter:** two suites that exist and are RED. Make them green without editing them.

```
node scripts/prediction-boundary-smoke.js     # D1 — currently 16 passed, 4 failed
node scripts/outcome-ranking-smoke.js         # D2 — currently 13 passed, 3 failed
node scripts/test.js                          # must be green when you are done
```

Read the header comment of each suite before the code. The reasoning is there, and it matters
more than the assertions — the assertions are only the part a machine can check.

**Do not edit either suite to make it pass.** They encode decisions the founder made; changing
one silently overrides a person. If you believe an assertion is wrong, say so in the PR with
your reasoning and leave it red. That is a good outcome, not a failure.

---

## D1 — close the bald-prediction hole

`AGENTS.md` §2 product law 2 forbids deterministic "will quit" claims, naming that phrasing.
`ai/language-guard.js` does not catch it, so the implementation is in breach of written product
law. Four cases are red: `will quit`, `will burn out`, `will leave`, `won't recover`.

The principle, and it is the whole of the decision:

> IntelliQ may describe evidence, uncertainty and possibilities.
> It must not turn those into prophecies about a person.

The rule targets **future claims about people and their outcomes**, not the English future
tense. Section 2 of the suite is as important as section 1: `"The assessment will open
tomorrow"` and `"The system will request another response"` are deterministic facts about
software and must keep working. **Do not blanket-ban `will`.** A rule that catches the
prophecies and also blocks system statements has moved the bug, not fixed it.

Section 3 matters too: `"Signals indicate elevated disengagement risk"` must stay allowed. It
is what the system should say *instead* of a prophecy, so blocking it leaves nothing sayable.

Narrowest is best. Sections 2 through 5 are already green — keep them that way.

## D2 — rank by what worked, not what happened most

`summarize()` sorts by `useful = improved + steady` as a raw count, so ten interventions
helping 30% of the time outrank three helping every time. It reports what was common while
presenting itself as outcome history.

The semantics:

```
observed efficacy  →  primary ranking signal
evidence strength  →  preserved SEPARATELY, qualifies confidence
volume             →  may qualify or break ties, never the primary signal
```

Two traps the suite pins deliberately:

- **Do not sort by raw percentage.** Section 2 requires 41/50 (82%) to outrank 1/1 (100%). It
  passes today by accident — under volume-sorting 41 beats 1 — so it is easy to break while
  fixing section 1. Same for section 5.
- **Effectiveness is not evidence strength.** Section 3 requires both to remain visible in the
  output. A reader must be able to see "82% across 50 cases", not one opaque score. Collapsing
  them throws away what makes the claim arguable.

Section 4 is the founder's call that `steady` is not `worked`: `useful = improved + steady`
scored "nothing changed" identically to "this helped".

**The method is yours.** A lower confidence bound on the rate satisfies every case, but so may
other approaches. Say in the PR which you chose and why.

---

## Out of scope

No new durable store. No changes to `server.js`, `ai/diagnose.js` or `ai/confidence.js`. Do not
touch `ai/admissibility.js`. Do not build a second confidence function — if your ranking starts
to look like `deriveConfidence`, stop and say so.

## Registration

Add both suites to the list in `scripts/test.js` **in the same commit** that makes them pass.
For D1, also fold the cases from `scripts/prediction-boundary-smoke.js` into
`scripts/language-guard-smoke.js` — that is their permanent home, and the separate file exists
only so `main` stayed green while the decision was pending. Delete it once folded.

## Acceptance

Paste, verbatim and unsummarised:

1. `node scripts/prediction-boundary-smoke.js` (or the folded language-guard suite) — full output
2. `node scripts/outcome-ranking-smoke.js` — full output
3. `node scripts/test.js` — the final verdict line
4. Which ranking method you chose for D2, and why
5. Anything in these suites the repository proved wrong

A red result reported honestly is worth more than a green one that was not run. **Push and open
a PR** — work that is not pushed did not happen.
