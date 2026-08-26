# P0-D adjudication — empirical nature overrides operational provenance

**Status:** architecture decision + mechanical implementation brief. Supersedes the classification
half of `docs/briefs/p0-d-authority-and-p0-5-origin.md`. Contract for `scripts/authority-truth-smoke.js`.

**Verdict: READY FOR CODEX.**

The founder's precedence law is implementable. One finding changes how, and it is worth stating
before the brief: **the premise that production already owns a vocabulary of empirical claim
identities is false.** Production owns primitive *categories* and pattern *kinds*. It does not own
the concept nouns organisations actually type. The derivation below is real, but it is a union of
five sources plus two explicitly-reasoned additions, not a single existing list.

---

# 1 · Verdict

**READY FOR CODEX.** No new semantic choice remains. §3 of the founder prompt authorises the
reviewer to *specify the smallest authoritative shared primitive* when direct reuse is
inappropriate, and that is what §4 below does.

One implementation resolution goes beyond the founder's four-line law and is flagged in §5.3: the
known-empirical test needs two tiers (exact identity, then token) with the curated operational list
sitting between them. Without that split, `kickoff_time` matches the empirical token `time` and a
known-operational type regresses. This is resolution *within* the decided law, not a re-opening of
it.

---

# 2 · Repository findings

## 2.1 · The defect, restated precisely

`ai/inquiry.js` (PR #73 `b1eac03`):

```js
function claimNature(claimType, { origin = null } = {}) {
  if (origin === 'org_context_arrangement') return 'operational';   // ← returns before any check
  return OPERATIONAL_CLAIMS.has(String(claimType || '').trim()) ? 'operational' : 'empirical';
}
```

Provenance short-circuits. Verified reachable from ordinary onboarding text through the real
`extract()` → `projectConfig()` → `adjudicateAnswer()` path:

```
"Sam is responsible for attendance"
   -> responsibility claimTypes: ["attendance"]
      attendance:  operational   owner authority=authoritative   corroborationNeeded=false
```

## 2.2 · What blocks a naive fix

`ai/org-context.js:21-24` — `validate()` constrains only that a responsibility has a subject or
role. It places **no constraint on `claimTypes`**. So any concept noun a leader types during
onboarding can enter a confirmed responsibility, and from there reach the promotion path.

## 2.3 · The provenance gate itself is sound and must not be touched

Re-verified this pass. `projectConfig` computes the origin rather than reading `f.claimOrigin`, so
it cannot be injected; and it requires an **active, confirmed, unexpired, claim-matching**
responsibility. No responsibility → null. Different claim → null. Unconfirmed → null. Superseded →
null. Expired → null. Injected via own fields → null. Bogus origin strings all reject.
`orgStateConfig`, the other half of `_orgContextConfig`'s merge, has no write route.

**The gate is not the defect. The precedence is.**

---

# 3 · Canonical empirical vocabulary — where it comes from, and the honest limit

I audited every candidate the founder named, plus three others. Measured against the six identities
the decision names as expected-empirical:

| Source | Owns | `attendance` | `engagement` | `morale` | `performance` | `wellbeing` | `burnout` |
|---|---|---|---|---|---|---|---|
| `ai/primitives.js` `PRIMITIVE` values | categories (`outcome`, `state`, `participation`…) | no | no | no | no | no | no |
| `ai/reason.js` `AXIS` **keys** | pattern kinds (`momentum_drop`, `withdrawal`…) | no | no | no | no | no | no |
| `ai/packs.js` `primitiveForSignal()` | label → primitive | — | — | — | — | — | — |
| `ai/understanding.js` `THEME_ALLOWLIST` | 12 allow-listed themes | no | no | no | no | no | no |
| `ai/org-learning.js` `SUBJECT_LABELS` | claim → label (all operational) | no | no | no | no | no | no |

**`primitiveForSignal()` is not a discriminator.** It returns `participation` for every one of
these, including `pitch_booking` and `kickoff_time`, because its fallback is
`SOURCE_PRIMITIVE[source] || 'participation'`. It fails closed by design, which is right for its
own job and useless for this one.

So the founder's §1 instruction — derive rather than handwrite — cannot be satisfied from any
single source. But it **can** be satisfied from a union, because the concept nouns do exist in
production, just scattered and mostly in places a program has never read:

| # | Source | What it contributes |
|---|---|---|
| **S1** | `ai/primitives.js:11-17` — the primitive names **and the concept nouns its own header names in parentheses** | `attendance`, `wellbeing`, `mood`, `stress`, `workload`, `skill`, `fitness`, `competence`, `grade`, `kpi`, `win`, `recovery`, `communication`, `mentoring`, `helping`, `activity`, `time`, `budget`, `capacity` |
| **S2** | `ai/reason.js` `AXIS` keys **and the `axis:` names** | `engagement`, `momentum`, `connection`, `growth`, `alignment`, `baseline`, `concern`, `load` + all 12 pattern kinds |
| **S3** | `ai/understanding.js` `THEME_ALLOWLIST` | `motivation`, `confidence`, `fatigue`, `focus`, `belonging`, `conflict`, `recognition`, `progress`, `setback`, `support_need`, `logistics` |
| **S4** | `ai/packs.js` `valenceFor()` down-good terms | `burnout`, `anxiety`, `pain`, `absence`, `turnover`, `incident`, `defect`, `error`, `risk` |
| **S5** | `ai/primitives.js` `STRUCTURE_LABEL` keys | `withdrawal`, `data_gap`, `isolation`, `overload`, `plateau` |

**The union covers four of the six: `attendance` (S1), `engagement` (S2), `wellbeing` (S1),
`burnout` (S4).**

**It misses `morale` and `performance`.** The nearest production words are `mood` (S1) and `outcome`
(S1) — different words. These two must be added explicitly. That is not an unreasoned handwritten
list: the founder's decision names them, and the addition is recorded here with its reason.

**Total: 70 identities.** Every one verified to resist promotion (§7).

## 3.1 · Why S1's parentheticals are legitimate authority

`ai/primitives.js:10` calls itself *"the few universal concepts the kernel exposes"* and then names
each category's real-world instances. Those parentheses are the closest thing the codebase has to a
statement of what the kernel considers measurable. Promoting them from comment to exported constant
does not invent vocabulary — it makes existing vocabulary machine-readable, which is precisely the
failure mode that produced the tautological assertion two rounds ago.

---

# 4 · The smallest authoritative shared primitive

**`ai/primitives.js` gains one export: `EMPIRICAL_CONCEPTS`.**

That module is already the owner of "what kinds of things exist in every human system", is already
pure, and is already imported by the reasoning layer. It is the correct home.

Two consumers, one definition, no duplication:

- `ai/inquiry.js` → `claimNature()` (Boundary A, constitutional)
- `ai/org-context.js` → `projectConfig()` (Boundary B, defence in depth)

**Dependency check.** `ai/primitives.js` requires only `./baseline`. `ai/inquiry.js` and
`ai/org-context.js` currently import nothing. Adding `require('./primitives')` to both creates no
cycle — verified. `ai/primitives.js` does not import either.

**One caution.** `ai/inquiry.js` is documented as PURE with no imports. Importing `./primitives`
pulls in `./baseline` transitively. Both are pure and IO-free, so the purity claim survives, but the
module header must be updated to say what it now depends on and why.

If Codex finds the import architecturally objectionable, the fallback is a new
`ai/claim-vocabulary.js` importing nothing and owning `EMPIRICAL_CONCEPTS` alone, consumed by all
three. **Prefer the `primitives.js` export**; take the fallback only if the import is rejected on
review, never to avoid the work.

---

# 5 · Final precedence law

## 5.1 · The law

```
1  exact empirical identity        → empirical      (never promotable)
2  curated operational identity    → operational
3  token-level empirical match     → empirical
4  unclassified + verified provenance → operational
5  otherwise                       → empirical      (fail closed)
```

## 5.2 · The invariant

> Organisational responsibility grants authority over actions and arrangements. It can never grant
> epistemic authority over a claim IntelliQ already knows is empirical. A responsibility assignment
> may promote an otherwise-unclassified arrangement; it may never transform a measured dimension
> into a decidable one.

## 5.3 · Why tiers 1 and 3 are separate — the one resolution beyond the stated law

`time`, `budget`, `capacity`, `activity`, `progress`, `logistics` are all legitimate members of the
empirical set (S1, S3). A single token-level test would therefore classify `kickoff_time`,
`session_time` and `meeting_time` as empirical, regressing three curated operational types and
breaking the P0-D behaviour already verified.

Splitting the test resolves it exactly: the curated operational list is explicit human judgement and
outranks a *token heuristic* (tier 2 before tier 3), but never outranks an *exact* empirical
identity (tier 1 before tier 2). Verified in §7 — all eleven operational types survive, all 70
empirical identities resist promotion, and derived forms like `attendance_rate` and
`engagement_dropped` are caught by tier 3.

## 5.4 · Normalisation

Trim, lowercase, and compare on the whole identity. Tier 3 splits on `_` only. No substring
matching anywhere — `approval` must not match inside `disapproval_rate`, and `owner` must not match
inside `downer`.

---

# 6 · Responsibility is not epistemic authority

To be recorded in the P0-D brief verbatim:

> **Responsibility answers who must act. Evidence answers what is true.** The two may concern the
> same topic without becoming the same thing.
>
> *"The head of pastoral care owns wellbeing"* means they may initiate a wellbeing process, schedule
> interventions, assign actions, and confirm that an operational action occurred. It does not mean
> their assessment of anyone's wellbeing is automatically true, that their empirical statements gain
> confidence from role, or that contradictory evidence is suppressed.
>
> *"The attendance officer owns attendance"* does not make attendance measurements or causal
> interpretations authoritative by declaration.
>
> The system must be able to hold both at once: *Sam is responsible for attendance*, and *Sam's
> claim that attendance has improved still requires evidence*.

## 6.1 · What the founder is trading away, stated plainly

Under this law, an owner answering *"has attendance improved?"* is recorded as `reported` with
`corroborationNeeded: true`, and the requirement does not satisfy on their word. If an organisation
has a genuine operational requirement phrased around an empirical noun — *"confirm the attendance
register is complete"* — it will be treated as empirical and will nag.

The correct long-term fix is to separate *the completion of an assigned action* from *the state of
the topic it concerns*, so the owner settles the former and never the latter. That is a new claim
shape and it is **out of scope**. Recorded here so it is not rediscovered as a bug.

---

# 7 · Prototype validation

A scratch prototype of §5.1, deriving the set from the five live sources, was run before this brief
was written. Full contract satisfied:

```
A  · attendance, engagement, morale, performance, wellbeing, burnout + provenance → all empirical
A2 · attendance_rate, engagement_dropped, wellbeing_score, morale_trend, performance_review
                                                          + provenance → all empirical
B  · pitch_booking, kit_washing, first_aid_cover, equipment_setup + provenance → all operational
C  · the same four WITHOUT provenance → all empirical
D  · all 11 curated operational types → unchanged, still operational
E  · all 70 canonical empirical identities resist promotion under owner role + provenance
F  · undefined, null, '', '   ', 123, {}, __proto__, constructor, brand_new → all empirical

prototype satisfies the full contract
```

The prototype is scratch only and is **not** part of the deliverable. Codex implements against the
tests in §9.

---

# 8 · Provenance-generation boundary (Boundary B)

**Yes, apply it — and it is not duplicate law, because it consumes the same export.**

`ai/org-context.js` `projectConfig()` must not stamp `ARRANGEMENT_ORIGIN` on a claim type that the
shared vocabulary already knows is empirical. Two properties follow:

- a stored requirement never carries a marker that would be refused downstream, so the data is
  self-consistent on inspection;
- the classification boundary stays authoritative — Boundary B is an optimisation and a
  data-hygiene measure, never the guarantee.

**Boundary A must be implemented and tested as if Boundary B did not exist.** If a requirement
somehow carries the marker on an empirical claim — legacy row, future code path — `claimNature()`
still refuses. The §9 tests assert Boundary A directly with a hand-constructed marker for exactly
this reason.

---

# 9 · Required test corrections — `scripts/authority-truth-smoke.js`

Additive only. **Do not weaken or remove any existing assertion.** The suite is currently 23/0; it
should end well above that.

**§9 · known empirical + valid responsibility provenance — the regression that must never return.**
Drive the real path: `orgContext.extract('Sam is responsible for attendance')` →
`orgContext.projectConfig([requirement, responsibility])` → `inquiry.adjudicateAnswer()` with
`isOwner: true`. Assert the answer is **not** `authoritative`, **not** `high` confidence,
`corroborationNeeded === true`, and that the empirical limitation is present.

**§10 · Boundary A in isolation.** Call `claimNature('attendance', { origin: 'org_context_arrangement' })`
directly → `'empirical'`. This must hold with the marker hand-constructed, independent of §8.

**§11 · unknown arrangement + provenance.** `pitch_booking` with a genuine matching confirmed
responsibility → `operational`, owner authoritative, `corroborationNeeded === false`, requirement
resolves, no empirical wording shown.

**§12 · same string without provenance.** `pitch_booking` with no responsibility → `empirical`.

**§13 · the eleven curated operational types.** Each still `operational` with and without a marker.
This is the tier-2 guard and it is what catches the `kickoff_time` / token-`time` hazard.

**§14 · THE SWEEP.** Iterate `primitives.EMPIRICAL_CONCEPTS` itself — not a copy, not a literal —
and assert every member stays `empirical` under `{ origin: 'org_context_arrangement' }`. This is the
assertion that stops us fixing `attendance` and leaving `morale` broken, and iterating the export
rather than a literal is what prevents a fourth round of tautological testing.

**§15 · derived forms.** `attendance_rate`, `engagement_dropped`, `wellbeing_score`, `morale_trend`,
`performance_review` — each `empirical` with a marker.

**§16 · Boundary B.** `projectConfig` with a confirmed responsibility naming `attendance` produces a
requirement whose `claimOrigin` is `null`; naming `pitch_booking` produces
`'org_context_arrangement'`.

**§17 · fail-closed edges preserved.** `undefined`, `null`, `''`, `'   '`, `123`, `{}`,
`'__proto__'`, `'constructor'`, `'brand_new_type'` → all `empirical`, with and without a marker.

---

# 10 · Codex implementation brief — mechanical

**Allowed surface:** `ai/primitives.js` (add one export), `ai/inquiry.js` (`claimNature` only),
`ai/org-context.js` (`projectConfig` only), `scripts/authority-truth-smoke.js` (additive).
**Do not touch:** `ai/conversation.js`, `ai/reason.js`, `ai/understanding.js`, `ai/packs.js`,
`ai/forum.js`, `server.js`, `db.js`, any P0-1/P0-2/P0-3 surface.

### Step 1 — `ai/primitives.js`

1. Add `EMPIRICAL_CONCEPTS` as a frozen `Set` of lowercase identities, built as the union of S1–S5
   in §3 plus `morale` and `performance`.
2. Derive S2 and S5 **programmatically** from `AXIS` and `STRUCTURE_LABEL` where those live in the
   importing module's reach; where a source lives in another module (`understanding`, `packs`),
   copy the terms with a comment naming the file and line they came from, so drift is visible.
   Do not import `ai/packs.js` or `ai/understanding.js` from `primitives.js` — that would invert the
   dependency direction.
3. Export it. Document in the header that it is the authoritative set of measured dimensions and
   that adding to it is a deliberate act.

### Step 2 — `ai/inquiry.js`

4. `require('./primitives')`. Update the module header's purity note.
5. Replace `claimNature` with the five-tier law in §5.1, normalising per §5.4. Signature unchanged:
   `claimNature(claimType, { origin } = {})`.
6. Leave `adjudicateAnswer` untouched — it already routes everything through `claimNature`.

### Step 3 — `ai/org-context.js`

7. `require('./primitives')`.
8. In `projectConfig`, when building `assignedArrangementClaims`, exclude any claim type that
   `claimNature` would classify empirical at tiers 1 or 3. Simplest correct form: filter the
   responsibility-derived claim types through the same predicate before adding them to the set.
9. Leave the responsibility record's own `claimOrigin: ARRANGEMENT_ORIGIN` as it is — it marks the
   responsibility, not a claim's nature.

### Step 4 — tests

10. Add §9–§17 from §9 above to `scripts/authority-truth-smoke.js`. Additive only.

### Acceptance

- `authority-truth-smoke` green, well above 23 assertions, including the §14 sweep over the export
- `inquiry-smoke` 51/0 · `conversation-smoke` 39/0 · `org-context-smoke` 28/0 · `org-state-smoke` 34/0
- `contest-smoke` 27/0 · `origin-correction-smoke` 51/0 · `privacy-smoke` 18/0 · `private-evidence-smoke` 18/0
- `epistemic-invariants-smoke` 16/0
- P0-1, P0-2, P0-3 suites unchanged
- `node scripts/test.js` green
- `pilot-loop-smoke` **28 passed, 1 failed** — unchanged

### Stop conditions

Stop and report rather than proceeding if: adding the import creates a cycle; the sweep in §14
fails for an identity you believe should be operational; a curated operational type regresses; or
`pilot-loop-smoke` moves off 28/1 for any reason.

### Prohibited

Widening `OPERATIONAL_CLAIMS` to make a test pass. Weakening or deleting an existing assertion.
A second empirical list anywhere. Substring matching. Touching `ai/conversation.js`'s open-reflection
carve-out. Implementing P0-5.

---

# 11 · Regressions and preserved behaviour

Must remain exactly as independently verified: fail-closed unknown classification; the four restored
operational types; the open-reflection carve-out in `ai/conversation.js`; correction history;
contest behaviour; tenant isolation; privacy; evidence visibility; provenance; empirical confidence
protections; P0-1; P0-2; P0-3.

**This narrows provenance promotion. It does not redesign P0-D.**

---

# 12 · P0-5 status

**Untouched and must stay untouched.** `ai/forum.js` unmodified; `pilot-loop-smoke` remains
**28 passed, 1 failed**, the sole failure being the Forum echo-origin assertion. If this work moves
that number, investigate — do not claim P0-5 complete.

---

# 13 · Remaining blockers

| | |
|---|---|
| **P0-D** | this brief — the last correctness defect in PR #73 |
| **P0-5** | Forum echo-origin preservation — briefed, not implemented |
| **P0-6** | inquiry-state concurrency — unadjudicated, not a pilot blocker on current evidence |
| Live PostgreSQL delete-CAS | performed and passed during the PR #72 review |
| Render drain behaviour | pre-pilot infrastructure check, not code |

**PR #73 is not merge-ready until §10 lands.** Nothing merged.
