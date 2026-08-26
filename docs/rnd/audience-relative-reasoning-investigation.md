# Audience-relative reasoning over admissible evidence — R&D investigation

**Status:** research artifact. **Nothing implemented. No production code or test modified.**
**Branch:** `claude/platform-work-summary-nmb0cm` · **Written against:** `37f6ed0`.
**Method:** repository archaeology plus executed two-world experiments. Where a document and the code
disagree, the code wins. Every claim marked *measured* was produced by running code, not by reading it.

---

## 1 · EXECUTIVE VERDICT

# STRONG DIRECTION

**The proposed law is already the architecture's stated intent, is genuinely enforced at the evidence
layer, and is violated at two proven points in the projection layer.**

The founder's fourth candidate law — *"reason over the admissible world; do not reason globally and
censor afterward"* — is not a proposal. It is a design principle already written into the code, in
its own words:

> `_kernelEvidence` (`server.js:7756-7758`): *"the ONLY door to kernel reasoning… PURPOSE-SCOPED:
> private evidence is excluded **BEFORE any unauthorised context is built (never retrieved then
> filtered)**."*

**But the non-interference property fails.** Measured, twice, in worlds differing only by one private
capture belonging to Jordan:

| Vector | W1 (no private evidence) | W2 (Jordan has a private sensitive capture) |
|---|---|---|
| **Coach's briefing item for Jordan** | `careFlag: false` | **`careFlag: true`** → UI renders *"There may be personal context here — lead with care. Details are kept private."* |
| **Coach's recommended action** on an identical `plateau` belief | `scout` — *"Consider a focused scout / review with Jordan."* | **`supportive_checkin`** — *"Consider a supportive check-in with Jordan — listen first, before anything task-related."* |

The second is the founder's own forbidden example, realised: **private evidence leaking through the
recommendation.**

**Why the verdict is STRONG DIRECTION and not ALREADY IMPLEMENTED.** Reading the code alone would
have produced "already implemented" — the evidence layer is genuinely correct and its header says so
confidently. Only running the two-world test exposed the leaks. **The claim was stronger than its
tests.**

**Why it is not PROMISING BUT REQUIRES ARCHITECTURAL CHANGE.** The fix is bounded: one derived flag,
two consumers. No new store, no second belief model, no new reasoning register, no redesign.

---

## 2 · REPOSITORY TRUTH

### 2.1 · The admissibility door — already audience-relative

`server.js:7758-7759`:

```js
const PERSONAL_PURPOSES = ['personal_assistance','personal_memory','personal_planning','outcome_evaluation'];
const ORG_PURPOSES      = ['workspace_shared_reasoning','leader_support','group_reasoning','organisation_reasoning'];
```

`_kernelEvidence(code, {purpose, viewerId, subjectId})` (`:7760`) computes **two different admissible
sets from one log**:

```js
if (personal) {
  if (env.visibility === 'private') return !!viewerId && env.ownerRef === viewerId;
  return (env.subjectId === viewerId) || (env.ownerRef === viewerId);
}
// ORGANISATIONAL purposes:
if (env.visibility === 'private') return false;
return env.promoted === true;
```

This **is** `E_coach(Jordan)` versus `E_jordan(Jordan)`. The founder's formalism already has an
implementation.

### 2.2 · Supporting primitives, verified present

| Primitive | Location | Role |
|---|---|---|
| Evidence envelope with `visibility`, `ownerRef`, `subjectId`, `promoted`, `status` | `evidenceLog`, `lib/evidence.js` | the admissibility inputs |
| `_promoteEvidence` (`:6452`) | the **single** Self→Web crossing | refuses anything `promotable()` rejects |
| `_inheritedVisibility` (`:7795`) | derived artifacts | *"can never be broader than its narrowest input"* |
| `privacy.isPrivate` / `classifyText` / `GATE_DIRECTIVE` | `ai/privacy.js:60` | sensitivity vocabulary |
| Epistemic ladder | `ai/diagnose.js:44-48` | observation < interpretation < hypothesis < conclusion; the model may not conclude |
| `deriveConfidence` origin counting | `ai/diagnose.js:218-260` | independence + temporal axes |
| `audienceSafe` | `ai/proactive.js:293` | rendered-field projection guard |
| Web scope | `ai/org-graph.js` | node territory, pure |
| `getVisibleUserIds` | `server.js:2777` | person-level governance |
| `_retrieveGrounding` | `server.js:8684` | purpose-scoped grounding, **calls `_kernelEvidence` twice with different purposes** (`:8694-8695`) |
| `person-model` vocabulary guard | `ai/person-model.js:26-32` | raw text cannot enter the model |
| `publicProjection` | `ai/person-model.js:112` | `{hasModel, interactions}` only |

**Nothing in this list needs to be built.** The proposal's substrate exists.

### 2.3 · The contaminating primitive

`server.js:3868-3871`:

```js
const mem = userAiProfiles[`${code}:${u.id}`];
const hasSensitiveContext =
  !!(mem?.keyMemory || []).some(k => k.sensitive) ||
  sigs.some(s => privacy.isPrivate(s.sensitivity));
```

Derived **entirely from evidence the coach may not see**. It then flows:

```
hasSensitiveContext (server.js:3869)
  ├─→ composeBriefingItem → careFlag (ai/intelligence.js:233)
  │     └─→ /api/intelligence/briefing items (:4180)
  │           └─→ _sanitizeBriefingForLeader (:4134) — spreads {...it}, DOES NOT STRIP careFlag
  │                 └─→ js/app.js:6951  "There may be personal context here — lead with care."
  │     └─→ /api/intelligence/watch row (:3037)
  │           └─→ js/app.js:6799  "· private context" badge
  │
  ├─→ _reasonObservations careFlag (:10739, :10746)
  │     └─→ reason.js:213  b.careFlag = b.careFlag || !!o.careFlag
  │           └─→ reason.js:322  _register(): careFlag ⇒ 'support' instead of 'scout'
  │                 └─→ PROPOSAL_TYPE/TEXT (reason.js:460-465) → the coach's recommended action
  │
  └─→ _deliverySweep careOf (:14313-14315)  ← THE CORRECT USE: withhold, fail-safe
```

**The same flag is used correctly in one place and incorrectly in two.** In delivery it *withholds*
(`unknown → sensitive → excluded`). In briefing it *annotates*. In the reasoner it *steers*.

---

## 3 · CURRENT REASONING PATH

```
STORAGE        evidenceLog[code] · memberCheckins · orgSignals · userAiProfiles
                   ↓
ADMISSIBILITY  _kernelEvidence(purpose, viewerId, subjectId)     ← audience-relative, correct
                   ↓
KERNEL         intel.detectPatterns · primitives.structuralPatterns · reason.reason
                   ↓                                              ← careFlag enters HERE (:10739)
BELIEF         reasonLedger[code] — claim, axis, polarity, severity, confidence, careFlag
                   ↓
PROJECTION     proactive.toInsight · composeBriefingItem · _sanitizeBriefingForLeader · audienceSafe
                   ↓                                              ← careFlag SURVIVES here
ANSWER         /api/intelligence/briefing · /watch · /reason/agenda
```

**The break is between KERNEL and PROJECTION, not at admissibility.** A flag computed from
inadmissible evidence is attached to a belief and travels with it into an audience the evidence
cannot reach.

---

## 4 · PRIVACY CONTAMINATION ANALYSIS

| Can inadmissible evidence influence… | Verdict | Evidence |
|---|---|---|
| **Beliefs** (claim, axis, polarity) | **NO** | `careFlag` is carried on the belief but does not alter `claim`, `axis` or `polarity` |
| **Confidence** | **NO** | `careFlag` appears nowhere in `ai/diagnose.js` or `ai/confidence.js` — grep confirms |
| **Selection** (who appears in "who is struggling") | **NO** | `detectPatterns` / `structuralPatterns` run on numeric series; `hasSensitiveContext` gates nothing there |
| **Severity / ranking** | **NO** | severity comes from the detector |
| **Recommendations** | **YES — MEASURED** | `_register` (`reason.js:322`) flips `scout` → `support`; the proposal text changes |
| **Rendered annotation** | **YES — MEASURED** | `careFlag` reaches the leader UI as an explicit "private context exists" badge |
| **Organisational memory** | **NO** | `orgStateHistory` is built from org-purpose state; private evidence excluded upstream |
| **Caches** | **WEAK YES** | `intelBriefingCache[code:userId]` is TTL-only (2h); a briefing computed before a private capture differs from one after. A timing channel, low bandwidth |
| **Projections** | **YES** | via the two above |

**Two of nine contaminated. Both in projection. Both measured.**

The clean result on selection and confidence matters: it means the leak is an *annotation and steering*
problem, not a *reasoning* problem. That is why the fix is bounded.

---

## 5 · SCENARIO RESULTS

| # | Scenario | Result today |
|---|---|---|
| **A** | Coach: *"How is Jordan doing?"* | **WORKS** — reasons over the coach-admissible set. Contaminated by `careFlag` |
| **B** | Coach: *"Who is struggling?"* | **WORKS, uncontaminated selection.** `careFlag` does not affect who is selected |
| **C** | Coach: *"How can we help Jordan?"* | **FAILS** — the register flip changes the answer. Measured |
| **D** | Teammate: *"How is Jordan doing?"* | **CORRECTLY REFUSED** — `getVisibleUserIds` gives a plain member only themselves (`member` role has `view_team:false`, `:1781`) |
| **E** | Jordan: *"How am I doing?"* | **PARTIAL** — Self Highs/Lows read `orgSignals`, not the personal branch, so Jordan's own private evidence does not inform his own Highs/Lows (gap **T-1**, already tracked) |
| **F** | Strongest evidence is private | **WORKS in principle** — the coach answer rests on admissible evidence only. Contaminated by C |
| **G** | Public says fine, private says struggling | **WORKS** — the coach sees "fine"; that is the correct behaviour, and it is the case the product must be willing to accept |
| **H** | Public says struggling, private explains why | **FAILS** — the register flip means the *why* leaks as a change of recommendation type |
| **I** | Coach asks a sequence designed to infer | **PARTIALLY EXPOSED** — see §8 |
| **J** | Same question before/after Jordan's private capture | **FAILS — this is the non-interference test.** Measured: `careFlag` flips, recommendation flips |
| **K** | Aggregate from private-but-aggregate-safe | **ABSENT** — no consent primitive exists; private evidence contributes nothing (ratified, correct) |
| **L** | Progressive filtering until an aggregate identifies one person | **EXPOSED** — the two-sided floor (L-PR1) is specified but **not implemented**; today `k = n` clears `MIN_COHORT` |
| **M** | A private belief is later explicitly shared | **PARTIAL** — `_promoteEvidence` handles the crossing and preserves `originRef`; no mechanism re-derives prior conclusions |
| **N** | User revokes future reasoning permission | **ABSENT** — no revocation primitive; §6 |
| **O** | Safeguarding exception | **EXPLICIT, correct** — `safeguardingLeadId` (`:11470`) is a *routing* target; the flag travels to a named person rather than widening anyone's Web. **This is the right shape and should be the template for any future exception** |

**Scenario O deserves emphasis.** IntelliQ already models a legitimate privacy exception as *explicit
routing to a named person*, not as a hidden read-through. Any future exception should copy it.

---

## 6 · PROPOSED SEMANTIC MODEL

### 6.1 · The five categories, attacked

| # | Proposed | Verdict |
|---|---|---|
| 1 | **PRIVATE** | **KEEP — exists.** `visibility:'private'` + `ownerRef` |
| 2 | **PRIVATE / AGGREGATE-SAFE** | **KEEP as a future primitive, not now.** Requires a consent flag that does not exist. This is D-C1, already a founder decision, already deferred |
| 3 | **DERIVED-SHARING** | **KEEP, narrowly.** The owner permits a *specific derived conclusion* to travel. Safe **only** because the owner authorises the specific output, not a class of reasoning |
| 4 | **AUDIENCE-REASONABLE** | **REJECT — UNSAFE.** See below |
| 5 | **EXPLICITLY SHARED** | **KEEP — exists.** `visibility:'normal'` + `promoted:true` |

### 6.2 · Why category 4 must be rejected

> *"Evidence may inform reasoning for a specified audience but raw evidence may not be exposed."*

**`careFlag` is category 4, implemented.** It is evidence-derived, it informs reasoning for the coach,
and the raw evidence is never exposed. **And it leaks — measured, twice.**

The impossibility is general, not incidental:

> If evidence `e` may influence output `O` visible to audience `A`, and `e` is inadmissible to `A`,
> then `O` is a channel carrying `e`. The bandwidth depends on how much `O` varies with `e`, but it is
> never zero, because *the influence is the point*. Category 4 is a request for evidence to change an
> observable output without being observable — which is a contradiction, not an engineering problem.

Category 4 is only safe when the derived output is **non-identifying by construction** — at which
point it *is* category 2 (aggregate) or category 3 (owner-authorised derived conclusion). **It
collapses. It does not survive as its own category.**

> **Finding R-1.** The founder's category 4 is the exact mechanism that produced both proven leaks.
> Formalising it would ratify the defect.

### 6.3 · Do "visibility" and "reasoning permission" need to be separate?

**No — and separating them is what category 4 buys.**

Keep them fused with one rule:

> **L-AR1 (proposed).** An audience's admissible evidence set fully determines what may be concluded
> for that audience. There is no class of evidence that may *influence* an audience's answer without
> being *admissible* to it. Where the owner wants influence without exposure, they authorise a
> **specific derived conclusion** (category 3) — which then becomes ordinary admissible evidence for
> that audience, with its own provenance.

This is simpler than the five-category model, needs no new axis, and is what `_kernelEvidence` already
implements.

### 6.4 · The minimum architecture

Four of the six things the brief asks for **already exist**:

| Need | Exists? | Where |
|---|---|---|
| visibility | **yes** | `env.visibility`, `ownerRef` |
| reasoning admissibility | **yes** | `_kernelEvidence(purpose, viewerId)` |
| audience | **yes** | `purpose` + `audience` on insights |
| purpose | **yes** | `PERSONAL_PURPOSES` / `ORG_PURPOSES` |
| **derived conclusions** (cat 3) | **no** | needs an owner-authorised derived-claim record |
| **aggregation consent** (cat 2) | **no** | D-C1, deferred |
| **revocation** | **no** | §6.5 |

**Two new primitives, both deferred. Zero changes to the admissibility model.**

### 6.5 · Revocation — Scenario N, answered

The honest answer, because the brief asks for it explicitly:

| Object | On revocation of *future* reasoning permission |
|---|---|
| Historical evidence | **retained** — memory may be durable |
| Prior conclusions already delivered | **cannot be recalled.** Say so plainly; a promise otherwise is false |
| Beliefs in `reasonLedger` | must be **re-derived** on the next tick without the revoked evidence — `_reasonNudge` already exists as the invalidation hook |
| Organisational memory | unaffected — private evidence never entered it |
| Cached projections | **must be invalidated** — and today `rosterCache`/`intelBriefingCache` are TTL-only, so this is the same gap as GI-6 |
| Learned methods (`noticeFeedback`, `confidence.reliability`) | **unaffected and should be** — they carry no subject and no content |
| Future reasoning | excluded at `_kernelEvidence` |

Revocation is therefore **mostly a cache-invalidation problem**, and it shares its mechanism with the
already-specified graph-invalidation work.

---

## 7 · CANDIDATE LAWS

| Law | Verdict | Reasoning |
|---|---|---|
| *"Privacy constrains evidence, not intelligence."* | **KEEP** | Correct and already the design. It is also the right *product* stance: refusing to conclude anything is not privacy, it is uselessness |
| *"No conclusion may be influenced by evidence inadmissible to the requester/audience."* | **KEEP — and strengthen** | Correct, but "conclusion" is too narrow. **Measured:** the leaks were in a *recommendation* and an *annotation*, neither of which is a conclusion. Amend to: *no observable output* |
| *"Private knowledge may make IntelliQ smarter for its owner without making that knowledge available, directly or indirectly, to others."* | **KEEP** | The "indirectly" is doing the work and is the clause both leaks violate |
| *"Reason over the admissible world; do not reason globally and censor afterward."* | **KEEP — already implemented** | `_kernelEvidence`'s own header states it. Ratify it as law so it cannot erode |

### The amended second law

> **L-AR2 (proposed).** No **observable output** of a reasoning operation — conclusion, confidence,
> selection, ranking, recommendation, wording, annotation, ordering, or the presence or absence of an
> item — may vary with evidence inadmissible to that audience.

The measured failures were an annotation and a register. **Neither is a conclusion.** A law phrased
around conclusions would have passed both.

---

## 8 · ATTACK ANALYSIS

| Attack | Result today |
|---|---|
| **Repeated identical question** | Stable — `intelBriefingCache` returns the same payload for 2h |
| **Before/after a private capture (J)** | **BREAKS.** Measured: `careFlag` flips, register flips |
| **Answer differences** | **BREAKS** via the register — a coach who learns that *"listen first, before anything task-related"* appears on a **growth plateau** has been told there is something emotional present |
| **Rankings** | Safe — ranking is severity-driven; `careFlag` does not enter |
| **Confidence changes** | Safe — `careFlag` is absent from `deriveConfidence` |
| **Recommendations** | **BREAKS** — the primary vector |
| **Timing** | Weak channel — `?refresh=1` bypasses the cache unconditionally (`:4159`), so an attacker can force recomputation at will and observe the flip immediately |
| **Aggregation** | **BREAKS** — the two-sided floor is unimplemented; `k = n` clears `MIN_COHORT` |
| **Subgroup filtering (L)** | **BREAKS** — same cause |
| **Cache/history** | Minor — a stale pre-capture briefing differs from a post-capture one |

### The sharpest attack, stated plainly

A coach who understands the product can determine **whether any given player has recorded private
sensitive material**, at will, by requesting `/api/intelligence/briefing?refresh=1` and reading the
care badge. No sequence of questions is needed. It is a one-bit oracle per person, on demand.

**One bit per person is not a small leak in a school.** *"Does this 16-year-old have something they
have marked private?"* is close to the most sensitive single bit the system holds.

---

## 9 · PILOT IMPLICATIONS

### MUST HAVE BEFORE ALMA / FALCON

| # | Item | Why |
|---|---|---|
| **AR-1** | **Strip `careFlag` from every leader-facing projection** — `_sanitizeBriefingForLeader` (`:4134`) and the `/watch` row (`:3037`) | one-bit private-existence oracle, on demand |
| **AR-2** | **Remove `careFlag` from `_register`** (`ai/reason.js:322`) | private evidence changes the recommendation — the founder's own forbidden case |

Both are deletions from a projection, not new architecture. **AR-2 needs a product decision about what
replaces it** — see §11.

### SHOULD HAVE DURING PILOT

- The non-interference test as a standing suite (§10).
- The two-sided cohort floor (already specified as L-PR1; blocks attacks L and K).
- Cache invalidation on revocation (shares the GI-6 mechanism).

### POST-PILOT R&D

- Category 3 derived-sharing (owner authorises a specific derived conclusion).
- Category 2 aggregate consent — this is D-C1, already a deferred founder decision.
- Formal revocation semantics.
- **Differential privacy: not now, and possibly never at Falcon scale.** With cohorts of 10-25, noise
  calibrated to protect an individual destroys the signal. The two-sided floor plus withholding is the
  correct instrument at this size. Revisit only above hundreds per cohort.

---

## 10 · TEST DESIGN

### 10.1 · The non-interference harness

`scripts/non-interference-smoke.js` (proposed, **not written**).

Two worlds constructed identically, seeded from **one** fixture builder so they cannot drift:

```
W1 = fixture()
W2 = fixture() + one PRIVATE sensitive capture owned by Jordan
```

For every coach-facing surface, assert **semantic equivalence**:

| Property | Must be identical |
|---|---|
| selected subjects | the set and its order |
| hypotheses / claims | text and ids |
| confidence band | exact |
| severity | exact |
| evidence basis ids | exact |
| **recommendations** | proposal type **and** text |
| **annotations** | every boolean and badge, `careFlag` included |
| item count | exact |
| **the serialised payload** | **byte-identical after removing timestamps and generated ids** |

### 10.2 · Why byte-identity, and where it stops

The two measured leaks were a **boolean** and a **register string**. A test asserting "same conclusions"
would have passed both. **The only assertion that catches an unknown future vector is equality of the
whole authorised payload.**

Where it must stop, honestly:

- **Timestamps and generated ids** are excluded — they vary by construction.
- **Latency is not asserted.** Computing over a larger evidence set takes marginally longer, and that
  channel is real but unbounded to close. Out of scope; record it as accepted residual risk.
- **Cache state is asserted separately:** the same query with `?refresh=1` must also be byte-identical
  across worlds.

### 10.3 · The generalised form

Parameterise over the private-evidence *kind*, so the suite does not merely test `keyMemory`:

```
for each privateKind in [ sensitive keyMemory, private evidence envelope,
                          restricted signal, private note, private check-in ]:
  assert payloadEquivalent( coachQuery(W1), coachQuery(W2 + privateKind) )
```

**This is the single most valuable test in the investigation.** It is a property test over an
adversary's whole surface, not an enumeration of known leaks — and it would have caught both measured
vectors without anyone knowing to look for them.

### 10.4 · A second suite worth having

`private-does-not-steer-smoke.js` — a **unit-level** guard on `ai/reason.js`: identical observation
sets differing only by `careFlag` must produce identical `register`, `proposalType` and `text`. Pure
module, no HTTP, runs in milliseconds, and pins AR-2 permanently.

---

## 11 · FINAL RECOMMENDATION

### Is this worth building?

**Yes — but most of it is not "building".** The law is right, and the architecture already implements
it where it matters most. The work is removing two leaks and adding a test that would have caught them.

### How much already exists?

**The admissibility model: essentially all of it.** Two audience-relative evidence sets from one log,
computed before context assembly, with a single deliberate crossing and a monotonic visibility ceiling
on derived artifacts. That is the hard part and it is done.

**The non-interference property: not enforced, and now measured to fail.**

### The smallest correct next step

> **Write the non-interference harness first (§10), against current `main`, before changing anything.**

It will go red on the two known vectors. **Then** fix AR-1 and AR-2 and watch it go green. Fixing first
and testing after would leave the general property unproven and the next vector undetected.

### Does it strengthen or weaken the product thesis?

**Strengthens it, materially.** *"Privacy constrains evidence, not intelligence"* is a better product
position than the alternative most competitors adopt — refusing to conclude anything about a person
and calling that safety. IntelliQ can say something sharper:

> *We will tell you what the evidence you are entitled to actually supports, and we will not let what
> you are not entitled to change that answer by even one bit.*

**That claim is testable, and §10 is the test.** It is worth more than the feature it protects.

### What I would refuse to implement

1. **Category 4 (audience-reasonable) as a first-class evidence class.** It is the mechanism that
   produced both leaks. Formalising it ratifies the defect.
2. **Any "I know something but cannot say" affordance**, in any form — badge, tone, hedge, softened
   wording, or a suppressed item whose absence is observable. `careFlag` is the polite version of this
   and it is exactly the leak.
3. **Post-generation privacy filtering.** Already correctly avoided; it must stay avoided.
4. **Differential privacy at pilot scale.** Wrong instrument for cohorts of 10-25.
5. **A second belief store keyed by audience.** Audience-relative beliefs are already achievable by
   computing over the audience's admissible set. A second store would be a second truth, and the first
   time they disagreed nobody would know which was right.

### The one thing that needs a product decision

**AR-2 removes something a coach genuinely benefits from.** `careFlag` exists because a coach
approaching a struggling player with a task-first review, when something personal is going on, is a
real harm the designers were trying to prevent. Deleting it is correct for privacy and is a small loss
for care.

The honest resolution: **a coach should approach a struggling player care-first *always*, not
conditionally.** If the default register for a wellbeing-axis risk is already `support`
(`reason.js:322`, `WELLBEING_AXES`), then the only cases `careFlag` changes are precisely the ones
where it is leaking — a *growth* or *alignment* risk being reclassified as emotional because of
something the coach may not know.

**Recommendation:** delete the `careFlag` term from `_register` and leave the axis and severity terms.
This preserves care-first behaviour wherever the *admissible* evidence supports it, and removes it
exactly where it was inferred from evidence the coach cannot see.

**This is a founder decision** — it changes what a coach is told — and it is the only one this
investigation raises.
