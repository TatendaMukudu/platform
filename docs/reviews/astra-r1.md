# Review round 1 — Astra

**Read:** main @ 5683df3de63d8daa54d345ab39fa262db1908d2e
**Lane:** the kernel and whether the surfaces tell the truth
**Ran:** no repository suite could be executed in this environment. A local `git clone https://github.com/TatendaMukudu/platform.git /tmp/platform` was attempted and failed before checkout with `Could not resolve host: github.com`. Repository reads and this report write used the connected GitHub API. I did not count API reads as reproduced execution.

## Scope actually covered
Read `docs/reviews/PROTOCOL.md` and `docs/reviews/prompt-astra.md` first. Read the target commit and the Astra-lane implementations in `ai/diagnose.js`, `ai/team-state.js`, `ai/contribution.js`, `ai/stance.js`, `ai/privacy.js`, `ai/material.js`, `ai/composer.js`, `ai/chart.js`, `ai/shelf.js`, plus `scripts/seed-alma.js`, `scripts/seed-alma-smoke.js`, `scripts/material-smoke.js`, `package.json`, and `.github/workflows/ci.yml`.

I specifically traced the declared-direction/origin rules, the two roads to a High/Low, contested direction, the material cohort-floor refusal, the narrowed-material composer boundary, shelf resolution, chart floor handling, and the Alma seed's use of production constructors.

I did NOT complete an executable pass over every Astra-lane file named in the prompt. In particular I did not finish line-by-line review of `ai/proactive.js`, `ai/behaviour.js`, `ai/voice.js`, `ai/present.js`, `ai/escalation.js`, `ai/admissibility.js`, or `ai/reasoning-register.js`; I did not exercise server endpoints; I did not run `npm test`; I did not run `seed-alma-smoke`; I did not run mutation tests; and I did not open the product in a browser or on a device.

## Reproduced failures
None. I could not execute repository code, so protocol section 3 requires the findings below to remain labelled Read rather than Reproduced.

## Code-reading concerns (not reproduced)

**Read — material cohort refusal returns the exact arithmetic it says it withholds.** `ai/material.js::understanding()` returns `cohort: { k, n }` unconditionally, including when `floor.ok !== true`. On the refusal path it correctly empties `parts`, `struggling`, and `untouched`, but the returned object still carries the exact number of distinct respondents and the total membership. That directly contradicts the adjacent comment: "The refusal carries the reason and NO counts. Returning the numbers with an ok:false beside them is how a caller ends up rendering them anyway." It also violates L-MT5 if that object reaches a leader-facing caller. `scripts/material-smoke.js` assertion MS14b claims the refusal "carries NO counts at all" but asserts only that the three arrays are empty; it never asserts that `u.cohort` is absent. This is protocol lie pattern 6 in substance: the assertion's English claims a stronger property than its predicate proves. I did not reproduce a user-visible leak, so I am not claiming that an endpoint currently exposes it.

**Read — the contested-direction concern named in the Astra prompt appears already addressed at this target SHA.** `ai/team-state.js::evidenceValence()` groups the latest declared direction by origin and, after the standing gates, explicitly returns `contested: true`, neutral polarity, and an "accounts differ" reason when both `up` and `down` are non-zero. Therefore the prompt's statement that opposite independently declared directions "currently produce silence" is stale against the target I read. I did not execute the surface path, so this is not proof that every caller renders the finding.

**Read — the narrowed-material boundary is partly structural and partly prompt-only.** `ai/material.js::contextFor()` structurally limits the model's material text to selected section ids and marks the result `partial`/`narrowed`; this prevents omitted sections from entering the material block. `ai/composer.js::buildContext()` then relies on prose instructions — "Do not claim to have read all of it, and do not summarise the whole" — to stop the model from making a whole-document claim. `verifyGrounding` guards invented organisational specifics, not the semantic scope of a summary. I did not find a deterministic postcondition that can reject "this deck says..." when only selected sections were supplied. Whether to add such a semantic scope contract without inferring meaning needs more design than I can prove by reading alone.

**Read — the seed's own documentation and the Astra brief disagree on silent-player count.** `prompt-astra.md` says seven of twenty-eight say nothing; the current `scripts/seed-alma.js` header says eight of twenty-eight say nothing. This is a documentation/brief drift, not by itself an epistemic defect. I did not execute the seed to establish the actual generated count.

## Fixed
None. The protocol requires every fix assertion to be mutation-proved and requires `npm test` green. This environment could read and write GitHub but could not execute the checked-out repository. I therefore did not make an unproved production or test change merely to make the branch look complete.

## Refused / escalated

**Narrowed-material whole-document semantics.** If the product wants a mechanical guarantee stronger than the current prompt sentence, the founder needs to choose the contract before implementation: **A)** a narrowed conversation may make claims only about explicitly supplied section ids, and any whole-document grammar is refused structurally; or **B)** the current rule remains a composition instruction, with grounding preventing invented specifics but no deterministic whole-document-scope verifier. This changes what the system is epistemically allowed to claim from partial material, so I did not choose silently.

## Not fixed, and why

The `material.understanding()` refusal arithmetic is a real code-reading finding and appears to have a small ordinary fix: omit/null `cohort` when the floor refuses, then strengthen MS14b to assert the count object is absent. I did not apply it because I could not satisfy the protocol's required mutation: break that exact production line, run the suite, see the assertion go red, restore it, then run the full truth layer green. Shipping the edit without that proof would violate the review contract.

The seed silent-count drift was not fixed because the actual generated distribution was not executed and therefore I cannot tell whether the brief or the seed comment is stale.

## Mutation map
| Mutation | Assertion that went red |
|---|---|
| None executed — repository execution unavailable | None |

## Touched another lane
None. Only this Astra report was written on `astra/review-r1`.

## What I could not verify
I could not run `npm test`, any focused smoke suite, or any mutation because the available execution environment could not resolve GitHub to obtain a checkout, while the connected GitHub capability exposed repository reads/writes but not a shell over the repository. Consequently I cannot honestly certify the branch green, call the material arithmetic finding Reproduced, or claim any existing assertion mutation-proved.

I also could not verify the exact Alma seed output, confidence bands under execution, endpoint-level self-versus-leader disclosure, whether the `material.understanding()` cohort object reaches an HTTP response, model output under narrowed material, browser/device behaviour, or the already-known Library controls and tap targets. This is an incomplete round-1 pass under the protocol, not a completed Astra certification.