# Astra — review round 1

You are reviewing **IntelliQ** (`TatendaMukudu/platform`), a system that forms and governs
beliefs about people in an organisation. It goes live with Alma College Men's Soccer on
**26 September 2026**.

**Read `docs/reviews/PROTOCOL.md` first and follow it exactly.** It carries the non-negotiables,
the mutation standard of proof, the nine ways an assertion lies in this repo, the report format,
and a list of things already known that you should not re-report.

Work on branch `astra/review-r1` off current `main`. Do not merge.

---

## What this product actually claims

Read this before the code, because your lane is whether the code keeps these promises.

IntelliQ does not score people. It holds **beliefs** with **provenance**, and it refuses to say
more than the evidence supports. The specific claims:

- **A belief's confidence comes from the shape of its evidence**, not from assertion. Two
  independent origins outrank one origin repeated five times.
- **Direction is declared by a person, never inferred from their words.** A lexicon that read
  "wrecked" as decline was removed for destroying information.
- **A person's own call is read alongside the evidence and cannot overrule it.** The founder's
  ruling: "it's dangerous if a person decides what their baseline is. That's like someone sick
  saying they're fine."
- **A disagreement is a finding, not a tie to break.** A contested belief is neither a High nor
  a Low; it climbs rather than averages.
- **A claim about a group cannot be made when making it would identify individuals** — the
  two-sided cohort floor, `k >= 5` and `n - k >= 5`.
- **A refusal is stated, never hidden.** A leader shown nothing concludes nothing is there, so
  withheld findings are named without being restated.
- **A recommendation is a judgment, not a fact**, and must say so.

---

## Your lane: the kernel and whether the surfaces tell the truth

**The epistemic core**
- `ai/diagnose.js` — `newInquiry`, `applyProposals`, `deriveConfidence`, corrections,
  contradictions, `DIRECTIONS`. Does confidence actually track independence of origin? Can a
  single origin be made to look like several? Does a correction really retire the earlier claim
  without deleting it?
- `ai/team-state.js` — `evidenceValence`, `personalValence`, `combinedValence`, `valenceOf`,
  `cohortFloor`, `fitForSurface`, `buildTeamState`. The four gates for a team High or Low.
- `ai/contribution.js` — `shouldOpenGroupInquiry`, `toGroupProposal`. The `ECHO` rule: several
  people repeating one origin is repetition, not corroboration.
- `ai/stance.js` — record / reading / recommendation, and the refusal of agreement counts as
  evidence.
- `ai/escalation.js`, `ai/admissibility.js`, `ai/privacy.js`, `ai/reasoning-register.js`.

**Whether what reaches a person is true**
- `ai/proactive.js` `toInsight` + `audienceSafe`, `ai/behaviour.js` `plan`, `ai/voice.js`
  `explainObject`, `ai/present.js`.
- The self view and the leader view of the same underlying belief. Does the leader view ever
  carry something the self view would not disclose, or vice versa? Does a banded projection ever
  leak the exact count it was banded to hide?
- `ai/material.js` `understanding` and `contextFor`; `ai/chart.js` — a chart is the report with
  the argument removed, so it must not be the looser surface.
- `ai/shelf.js` — a folder points at work and confers no access; a count is of what resolved,
  never of what was filed.

**The demo, which is the first thing anyone believes**
- `scripts/seed-alma.js` and `scripts/seed-alma-smoke.js`. This is where I would most like a
  second pair of eyes, for the reason in the next section.

---

## Specific things to go at

1. **Is the seeded demo honest?** I rewrote it today. Before, it produced **zero Highs and zero
   Lows for all 28 people** because nothing had a declared direction and nothing had been
   called — the law working correctly against a seed that never spoke. Now it produces a season.

   The danger is the opposite one: that I tuned the numbers until the surfaces looked good.
   Check that. Specifically:
   - Does anything in the seed write a band, a score or a polarity directly? (`SA10` claims not.)
   - Are the confidence bands the kernel assigns *defensible* for the evidence given, or did I
     pick evidence weights that flatter the output?
   - Is the distribution honest? Seven of twenty-eight say nothing. Is that plausible, or is it
     a number I chose to make a point?
   - The squad High rests on 6 contributors of 28 and the Low on 7 of 28. Both clear the floor.
     Is the floor being *demonstrated*, or merely *cleared*?

2. **The two roads to a High.** A belief reaches a bucket either because the evidence declared a
   direction, or because the person called it and nothing else points anywhere. The card says
   which ("2 separate accounts point the same way" vs "you called this one"). Are those two
   claims actually different in the code, or does one quietly stand in for the other? Can a call
   promote a belief the evidence does not support?

3. **Contested.** There are two different notions in the code: `evidenceValence` returning
   up-and-down, and `inq.status === 'disputed'` / a signal's `dissents`. Only the second
   produces the "Accounts differ" finding. **Is that right?** Two people each declaring an
   opposite direction is a disagreement too, and it currently produces silence — no High, no
   Low, and no card saying why. I think that may be a real gap. It touches epistemic law, so if
   you agree, **escalate it rather than fixing it**.

4. **The cohort floor's arithmetic in its own refusal.** The withheld reason for a cohort block
   is deliberately banded to "not enough safely attributable support to disclose", because
   "1 of 6 left uncounted" states k and n about real people. Check every path a refusal reason
   can travel. Does the exact arithmetic escape anywhere — a log line, an error body, a chart
   limitation string, the assistant's own words?

5. **The composer prompt.** `ai/composer.js` `buildContext` now says, when material has been
   narrowed to a person's declared sections, "do not summarise the whole". That is a promise
   enforced by a sentence in a prompt, which is the weakest enforcement in this codebase. Is
   there anywhere else that boundary should be held structurally?

---

## What I would most like you to disbelieve

I wrote the laws in `ai/shelf.js` and `ai/stance.js`, most of `ai/material.js`, and the
assertions that guard all three. **A law I wrote, tested with tests I wrote, is exactly the
place where a wrong idea survives.**

Go after the *ideas*, not just the code. If `L-SH2` ("filing confers no access") is the wrong
frame, or the stance taxonomy is missing a category, or the cohort floor is protecting the wrong
thing — say so. Those are worth more than a bug.

And check one specific thing about me: I have a habit in this repo of writing an assertion that
matches a function's **definition** rather than its **call**, so a feature that is never invoked
still reports as reachable. I have shipped that five times. Look for a sixth.

---

## Deliverable

- Fixes on `astra/review-r1`, each with an assertion and a mutation that proves the assertion.
- `docs/reviews/astra-r1.md` in the exact format the protocol specifies.
- `npm test` green on your branch.
- Do not merge. Do not open a PR unless asked.

Label every finding **reproduced** or **read**. If something touches a law — and in this lane
most interesting findings will — do not fix it. Escalate it with the decision the founder has to
make, stated as a choice between named options rather than a recommendation to think about it.
