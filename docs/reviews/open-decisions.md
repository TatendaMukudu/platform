# Open decisions — these need the founder, not an implementer

Two findings that are real, verified against the code, and deliberately **not** fixed. Both
change what IntelliQ is allowed to say, which is a product call rather than an engineering one.
An agent guessing either would be inventing taste.

---

## D1. The language guard under-enforces product law 2

**Status:** live on `main`. Verified 2026-08-14.

`AGENTS.md` §2 product law 2 forbids *"prediction / deterministic 'will quit' claims"* — naming
that phrasing explicitly. `ai/language-guard.js` does not catch it:

```js
> guard.describesOnly('This player will quit by December.')
true            // passes the guard
> guard.describesOnly('This player is likely to quit.')
false           // caught
```

`PREDICTIVE` matches `will\s+likely`, and catches `"If this continues, the group will
struggle"` through a separate clause pattern. A bald deterministic prediction — *subject* +
`will` + *verb* — is not matched. `scripts/language-guard-smoke.js` tests ten predictive
phrasings and this shape is not among them, so the gap is untested rather than deliberate as
far as the repository shows.

**Why this is your call.** The guard's own header says it is "deliberately aggressive" because
"a false positive just means the honest deterministic sentence is shown instead", and that
"under-blocking is the only real danger". By that logic the gap should close. But `will` is an
ordinary English word, and the aggressive fix changes what a user sees: model phrasing gets
replaced by deterministic text more often. That trade — fewer forbidden claims against a
blander voice — is taste, and the guard sits at every LLM edge, so it is felt everywhere.

**Options:**

1. **Broad** — match `will\s+\w+` generally. Closes the law fully; most false positives.
2. **Targeted** — match `will` followed by an outcome verb (quit, drop, fail, decline, worsen,
   leave, disengage). Closes the named case; keeps `"this will show you"` working. *My
   suggestion if you want one, but it is a list that needs maintaining.*
3. **Accept** — record that bald predictions are handled by prompt discipline rather than the
   guard, and add the case to the smoke suite as a documented non-goal.

Whichever you pick, the phrase from law 2 belongs in `scripts/language-guard-smoke.js` — either
as a caught case or an explicit exception. Right now it is neither, which is how it went
unnoticed.

---

## D2. Outcome intelligence ranks interventions by volume, not by whether they worked

**Status:** live on `main`. Reported in `docs/reviews/codex-outcome-priority-office.md` (C1).

`ai/outcome-intelligence.js` sorts by `(b.useful - a.useful)` where `useful = improved + steady`
— a raw count. `bestForPattern` returns `interventions[0]` and `earlySignalBrief` presents it
as `suggestedNextStep`:

```
check-in         total=10  improved=3   improvedRate=30%
load reduction   total=3   improved=3   improvedRate=100%

recommended -> checkin
```

`usefulRate` and `improvedRate` are computed and then ignored when ranking. The effect is a
system that recommends whatever is done most often and describes it as outcome-informed: the
most-used intervention accrues the most "useful" cases by volume, gets recommended, gets used
more. For an organisation that is a machine for entrenching the current habit.

Secondary: `steady` counts as fully useful, so "nothing changed" scores like "this helped".

**Why this is your call.** Ranking by rate instead is not obviously right either — 3 of 3 is a
weaker basis than 30 of 100, and `SMALL_SAMPLE` already exists but does not affect ordering.
The real question is what the product should do when it does not yet know: recommend the
common thing, recommend the promising thing, or decline to rank and say so. That is a stance on
how confident IntelliQ is willing to sound, which is the product's voice.

**Options:**

1. **Rate with a floor** — rank by `improvedRate`, but only among interventions above
   `SMALL_SAMPLE`; below it, rank by volume and label the limitation.
2. **Refuse to rank** — below a threshold, return no `suggestedNextStep` and say the history is
   too thin. Most honest; least useful early on, which is when it is most used.
3. **Separate the two** — report "most tried" and "best rate" as different lines and let the
   reader weigh them. No ranking decision at all.

Do not let an implementer guess this. Whoever does it should write the test that distinguishes
the options first — the assertion is the decision.
