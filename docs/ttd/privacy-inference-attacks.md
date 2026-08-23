# Privacy inference attack suite

**Status:** CURRENT. Threat analysis with executable invariants.
**Stage 3** of the final pre-implementation hardening program. Preceded by `fc33740`.
**Written against:** `fc33740`; attacks executed against PR #74's head `1c02dc9`.

**Scope:** disclosure through *combinations of safe-looking aggregates*, not through direct names.
**Explicit non-goal:** a differential-privacy programme for Falcon.

---

## 1 · Headline

**Two attacks succeed today, and the first defeats the fix already written into the PR #74
correction brief.**

| # | Attack | Result | Caught by the planned fix? |
|---|---|---|---|
| **A1** | **complement** — `count == memberCount` | **SUCCEEDS** | **NO** |
| **A2** | difference — parent aggregate minus child aggregate | **SUCCEEDS** (needs two viewpoints) | no |
| A3 | below-floor counts in `rollup` | SUCCEEDS | yes — C1 |
| A4 | `momentum` derived from below-floor counts | SUCCEEDS | yes — C1 |
| A5 | `participation` / `activeThisWeek` fraction | SUCCEEDS | yes — C1 |

**A1 is the important finding.** The correction brief's C1 says *"drop every entry whose count
< MIN_COHORT"*. Measured against a two-member scope where **both** members decline:

```
memberCount   : 2
patternCounts : {"momentum_drop":2,"repeated_concern":2}
items         : 2 Web Lows surfaced
roster        : Ann, Ben
```

`count = 2` satisfies `MIN_COHORT = 2`. The filter passes it. And because `count == memberCount`,
the leader has learned that **both named people** have momentum drop. **An aggregate that covers the
whole population is a complete person-level disclosure**, and the floor as currently specified
protects nobody.

---

## 2 · The missing invariant

Cohort floors protect the **cohort**. They say nothing about the **complement**.

> **L-PR1 (proposed) — the complement floor.** An aggregate over a cohort of size `k` drawn from a
> visible population of size `n` may be disclosed only when **both** `k ≥ MIN_COHORT` **and**
> `n − k ≥ MIN_COHORT`. When either fails, the aggregate is withheld entirely — not narrowed, not
> rounded, not reported with a caveat.

Worked:

| n | k | k ≥ 2 | n−k ≥ 2 | Disclose? | Why |
|---|---|---|---|---|---|
| 2 | 2 | yes | **no** (0) | **withhold** | names everyone |
| 2 | 1 | no | yes | withhold | below floor |
| 3 | 2 | yes | **no** (1) | **withhold** | one person is identified by exclusion |
| 4 | 2 | yes | yes | disclose | genuine ambiguity both ways |
| 8 | 7 | yes | **no** (1) | **withhold** | one person identified by exclusion |
| 8 | 3 | yes | yes | disclose | |

The "identified by exclusion" cases are the ones the current floor misses entirely, and they are not
exotic: a squad where everyone is struggling is exactly the situation a leader most wants reported,
and exactly the one where reporting it names everyone.

> **L-PR2 (proposed) — no rate without a two-sided floor.** `MIN_SEG = 4` (`server.js:3240`) governs
> whether a *rate* may be published. A rate additionally requires the complement floor, because
> `100%` and `0%` are complete disclosures at any `n`.

---

## 3 · The attack catalogue

Each row states whether existing primitives can defeat it. `MIN_COHORT = 2` (`server.js:16932`),
`MIN_SEG = 4` (`:3240`), confidence tier at n≥12 (`:3250`), material-difference ≥20 points (`:3243`).

### 3.1 · Cardinality attacks

| Id | Attack | Today | Defeated by |
|---|---|---|---|
| A1 | `k = n` — everyone | **SUCCEEDS** | **L-PR1** |
| A1b | `k = n−1` — everyone but one | **SUCCEEDS** | **L-PR1** |
| A6 | `n = 1` — one-person node | **withheld** (k<2) | existing floor |
| A7 | `n = 2`, `k = 1` | **withheld** | existing floor |
| A8 | `n = 3`, `k = 2` | **SUCCEEDS** | **L-PR1** |
| A9 | `n = 4`, `k = 2` | discloses | correct — genuine ambiguity |

### 3.2 · Structural attacks

| Id | Attack | Today | Defeated by |
|---|---|---|---|
| A10 | **unique role** — the only physio in a cohort | **SUCCEEDS** in principle | needs role-aware suppression — **research** |
| A11 | **one-person node aggregate** | withheld | existing floor |
| A12 | **one-person peer programme** | n/a — peer Web not built | L-P3 already specifies ≥3 peers |
| A13 | **leader + one subordinate** | **SUCCEEDS** (n=2 for the leader's view) | **L-PR1** |
| A14 | **node-leader identifiability** — "programme X declining" names its one leader | n/a for pilot | L-P3 no-naming rule |

### 3.3 · Difference attacks

| Id | Attack | Today | Defeated by |
|---|---|---|---|
| A2 | **parent aggregate − child aggregate** | **SUCCEEDS** — measured: head 4/7, coach 3/4 ⇒ 1 drop among 3 non-squad people | **L-PR3** below |
| A15 | Web A − Web B for overlapping actors | same mechanism | L-PR3 |
| A16 | peer aggregate − known members | n/a — not built | L-P3 |
| A17 | **temporal difference** — same actor polls before and after a membership change | **SUCCEEDS** | **L-PR4** below |
| A18 | **contribution difference** — poll, contribute one item, poll again | **SUCCEEDS** | L-PR4 |

**Severity note on A2.** It requires two viewpoints — a head and a coach comparing notes, or one
person holding both. That is collusion, and IntelliQ cannot prevent two humans talking. What it *can*
prevent is one actor performing the subtraction unaided, which is A17's shape.

> **L-PR3 (proposed) — nested aggregates are not independent.** Where an actor can read an aggregate
> over a node **and** over its descendant, the difference is derivable. Publishing both to the same
> actor is permitted only when the *difference cohort* also satisfies L-PR1. Where it does not, the
> child aggregate is withheld from that actor — the parent one is the more useful of the two.

> **L-PR4 (proposed) — aggregates are stable within a reporting window.** An aggregate recomputed
> after a single membership change or a single contribution reveals that change by subtraction.
> Aggregates therefore report against a **fingerprint-stamped snapshot** and change only when the
> snapshot advances. The existing `_orgEvidenceFingerprint` (`server.js:9863`) already supplies the
> stamp; `BRIEFING_TTL` (2h, `:3632`) already supplies the window.

L-PR4 is nearly free: the caching that already exists is the mitigation, provided the cache key does
**not** include a nonce and `?refresh=1` does not bypass it for non-privileged reads. That is worth
checking during implementation — `refresh=1` currently bypasses `intelBriefingCache` unconditionally
(`server.js:4159`), which turns the cache from a mitigation into a formality.

### 3.4 · Object-participation attacks

| Id | Attack | Today | Defeated by |
|---|---|---|---|
| A19 | **Focus outcome aggregate with one participant** | n/a — participants not built | L-PR1 applied to participant sets |
| A20 | **Inquiry state reveals the only contributor** | **partially SUCCEEDS** — a group inquiry opened by `INDEPENDENT_CORROBORATION` needs ≥2 contributors, but `AUTHORITATIVE_SOURCE` and `LEADER_OPENED` can open on one | see below |
| A21 | known Focus participation + Focus-scoped High | n/a | L-PR1 |

**A20 is worth stating carefully rather than alarming.** `shouldOpenGroupInquiry`
(`ai/contribution.js:213-223`) can open on a single authoritative source or a single leader act. In
both cases the opener is *known to themselves* and the inquiry is about the **group**, not a person.
The disclosure would be "someone contributed", which is true of any group inquiry. **Not a defect** —
recorded so it is not rediscovered as one.

### 3.5 · Combination attacks

| Id | Attack | Today | Defeated by |
|---|---|---|---|
| A22 | **known absence** — leader knows X is away; aggregate covers the rest | **SUCCEEDS** at small n | L-PR1 reduces the surface; not fully defeatable |
| A23 | **known injury / known situation** + Low | **SUCCEEDS** at small n | L-PR1; residual is irreducible |
| A24 | **High and Low combination** — X in the High cohort and not the Low cohort | **SUCCEEDS** at small n | L-PR1 applied per artifact, plus **L-PR5** |
| A25 | roster names + any count | **SUCCEEDS** — measured in A1 | L-PR1 |

> **L-PR5 (proposed) — floors apply to the union, not only per artifact.** Two artifacts each
> clearing L-PR1 can jointly identify a person by set intersection. Where several aggregates over the
> same population are published together, the floor applies to the **smallest derivable cell**, not
> to each aggregate independently.

L-PR5 is the honest limit of what a floor-based approach can do. Full protection needs query auditing
or noise, which is **out of scope for Falcon** and recorded as research.

### 3.6 · What cannot be defeated by floors

Stated plainly so nobody believes the suite is complete:

- **A22/A23 residual.** A leader who knows one person is absent, injured, or in a known situation can
  always reason about a small cohort. No aggregate policy fixes external knowledge.
- **A10 unique role.** Suppression requires knowing which attributes are identifying in that
  organisation, which is organisation-specific knowledge IntelliQ does not hold.
- **Collusion.** Two actors comparing their own legitimate views.

**Mitigation for all three is the same and it is not technical:** keep the *content* of aggregates
directional and non-diagnostic, so that even a successful re-identification yields "this person may
be in a cohort the system flagged" rather than a private disclosure. `audienceSafe` already enforces
this (`PROTECTED_RE`, `SCORE_RE`, `QUOTE_RE`, basis exclusion). **The floors limit who can be
identified; `audienceSafe` limits what identifying them is worth.** That layering is the actual
defence and it should be stated in the constitution.

---

## 4 · EXECUTABLE INVARIANTS

Suitable for `scripts/privacy-inference-smoke.js` (new). Each is a fixture plus an assertion.

| Id | Invariant | Fixture | Fails today? |
|---|---|---|---|
| **P-1** | `k = n` ⇒ no aggregate | 2 members, both declining | **YES** |
| **P-2** | `n − k < MIN_COHORT` ⇒ no aggregate | 3 members, 2 declining | **YES** |
| **P-3** | `k < MIN_COHORT` ⇒ no aggregate **and no count** | 2 members, 1 declining | **YES** (count leaks) |
| **P-4** | `n = 1` ⇒ nothing, ever | one-person node | passes; must not regress |
| **P-5** | rate published only at `k ≥ MIN_SEG` **and** complement ≥ `MIN_COHORT` | 5 members, 4 declining | **YES** |
| **P-6** | `momentum` derives from gated counts only | 2 members, 1 declining | **YES** |
| **P-7** | `participation` is `null`, not `0`, below floor | 2 members | **YES** |
| **P-8** | a child aggregate is withheld when the difference cohort fails L-PR1 | school 7 / squad 4 shapes | **YES** |
| **P-9** | two reads within a window over an unchanged fingerprint return identical aggregates | poll, poll again | untested |
| **P-10** | a read after one contribution does not expose that contribution by subtraction | poll, contribute, poll | **YES** |
| **P-11** | no aggregate contains a name, member id or evidence id | any | passes for `_webIntelligence`; not asserted generally |
| **P-12** | roster + briefing together contain no `(name, pattern)` pair | 2-member scope | **YES** (A25) |

**P-1, P-2 and P-12 are the ones that matter.** They are the complement attack, and they defeat the
fix currently specified in the correction brief.

---

## 5 · What existing primitives already defeat

Credit where it is due, so the corrections stay narrow:

| Primitive | Defeats |
|---|---|
| `_kernelEvidence` private exclusion (`:7768`) | any attack routed through private evidence — verified independently |
| `_inheritedVisibility` (`:7795`) | derived artifacts widening their basis |
| `MIN_COHORT = 2` | `k = 1` cohorts |
| `MIN_SEG = 4` | rates on tiny samples |
| ≥20-point material difference (`:3243`) | spurious rate comparisons |
| n≥12 confidence tier (`:3250`) | overconfident small-sample claims |
| `audienceSafe` | the *value* of a successful re-identification |
| Web scope + `canSee` | cross-branch aggregates |
| origin counting (`contribution.js:203`) | manufactured corroboration |

**Nine primitives already in place; two invariants missing.** That is the honest state — this is a
gap in the floor's formulation, not an absent privacy model.

---

## 6 · Recommended constitutional addition

> **The two-sided floor.** IntelliQ's disclosure floors are two-sided. A cohort must be large enough
> to hide an individual **and** small enough that its complement does too. An aggregate covering
> everyone is a statement about everyone.

This belongs in `intelliq-constitution.md` §13's neighbourhood and in
`web-semantics-and-continuous-intelligence.md` §23, which currently specifies only the one-sided
floors.
