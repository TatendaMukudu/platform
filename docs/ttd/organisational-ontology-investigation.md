# Organisational ontology — investigation

**Status:** architecture investigation. **Nothing implemented.** No production code changed.
**Subordinate to:** `intelliq-ttd-v1.md` → `intelliq-constitution.md` → this document.
**Written against:** `0663e56`. Every citation was read at that commit.

The brief asked for this idea to be attacked. It has been. The conclusion is not the one the
framing invites.

---

## 1 · EXECUTIVE VERDICT

# ADOPT NARROWLY

**IntelliQ already has an ontology. It is unusually good, it is not called one, and it is roughly
85% built.** What is missing is not a substrate. It is **four foreign keys and one new edge type**.

The founder's own test — *"if the repository already provides 80% of the benefit through existing
typed objects and provenance, say so"* — is met and exceeded. Saying so is the main finding.

Three things follow, and the third is the one that matters:

1. **Reject the general ontology programme.** No universal schema, no entity/relationship rewrite,
   no graph database, no migration. Every generic benefit an ontology is supposed to deliver —
   typed objects, reified relationships, provenance on edges, epistemic status, temporality,
   supersession, scope — **already exists and is enforced by tests**.
2. **Adopt the specific missing joins.** Four absent foreign keys break the learning loop, and all
   four are already named in earlier audits as separate gaps. They are the same gap seen four times.
3. **Adopt one genuinely new relationship type** — *behaviour-in-context → organisational aim* —
   because it is the only part of the founder's proposal with no existing analogue, and it is the
   part carrying the actual product idea.

The correct framing is **not** "should IntelliQ adopt an ontology". It is **"IntelliQ's ontology has
four broken joins and one missing edge type; close them."** That reframing shrinks a
substrate programme into roughly a week of narrow work.

---

## 2 · WHAT INTELLIQ ALREADY HAS

### 2.1 · The epistemic ladder — already enforced, already refuses the dangerous move

`ai/diagnose.js:44-48`:

```js
const LEVELS = ['observation', 'interpretation', 'hypothesis', 'conclusion'];
const LEVEL_RANK = { observation: 0, interpretation: 1, hypothesis: 2, conclusion: 3 };
const MODEL_MAY_PROPOSE = new Set(['observation', 'interpretation', 'hypothesis']);
```

with the rule stated in the header: *"The four epistemic levels never collapse into one field… A
level may only rest on levels beneath it."* And: *"A CONCLUSION is never the model's to draw — it is
the deterministic core's, from a supported hypothesis."*

The brief asks to *"explicitly distinguish OBJECT / RELATIONSHIP / OBSERVATION / CLAIM / HYPOTHESIS
/ EVIDENCE / ORGANIZATIONAL DECLARATION / EMPIRICAL FINDING / DECISION"* and warns *"do not collapse
these concepts merely to simplify the graph."*

**Four of those nine are already a ranked, enforced, test-covered ladder**, and the constraint the
brief most wants — *model inferred X therefore X is a fact* — is refused at the type level. The
header even uses the founder's exact example shape: *"'Scanning deficiency causes loss of
possession' is a HYPOTHESIS."* That is a behaviour → outcome relationship claim, already
representable, already epistemically typed.

### 2.2 · Reified relationships with full provenance — already the signal

Every signal admitted to an inquiry (`ai/diagnose.js:505-528`):

```js
next.signals.push({
  ref, kind: 'observation' | 'interpretation',
  directness, authority, source,
  ...originOf(p),              // originRef + originKind — what this is ULTIMATELY based on
  status: 'active',            // lifecycle → supersession, correction
  specificity, turnId, at,
  dissents: !!p.contradicts,
  supports:   p.supports   || null,   // → hypothesis id
  challenges: p.challenges || null,   // → hypothesis id
  ...(p.contributedBy ? { contributedBy, … } : {}),
});
```

The brief asks whether relationships would need *provenance, scope, visibility, confidence,
temporality, authority, contestability, expiration/supersession*.

| Required on an edge | Already present | Where |
|---|---|---|
| provenance | `originRef`, `originKind` | `diagnose.js:512` |
| authority | `authority`, `directness`, `source` | `:509-511` |
| temporality | `at`, `turnId` | `:519` |
| contestability | `dissents`, `challenges` | `:520`, `:524` |
| supersession | `status`, `supersededBy`, `supersededReason` | `:513`, `diagnose.js:485` |
| confidence inputs | `specificity`, plus `deriveConfidence` | `:517` |
| scope / visibility | on the evidence envelope | `env.visibility`, `env.ownerRef` |
| governance | `contributedBy` | `:527` |

**Every property the brief says a first-class relationship would need is already carried by the
existing edge.** A signal is not a row that happens to point at something; it is a reified,
governed, correctable relationship between evidence and a claim.

### 2.3 · A typed relationship vocabulary — already exists

`ai/diagnose.js:925`:

```js
const RELATIONSHIPS = ['NEW', 'SAME_AS', 'REFINES', 'SUPPORTS', 'CONTRADICTS', 'RELATED_TO'];
```

`resolveIdentity()` (`:939`) routes a proposed concept against the open frontier, and — importantly —
**the relationship survives the routing decision** (`:949-957`): SAME_AS, SUPPORTS and CONTRADICTS
all route evidence to an existing inquiry, and an earlier version collapsed them, filing
contradicting evidence as agreement. That was found and fixed. `provenance: [{ at, relationship,
targetId, concept, reason }]` (`:337`) records the edge.

This is inquiry-to-inquiry (concept identity). It is **not** entity-to-entity. But it establishes
that typed, reasoned, provenance-carrying edges are already a working idiom in this codebase, with
the classic failure mode (flattening distinct relations into one) already discovered and guarded.

### 2.4 · Behaviour as contextual observation — already the exact primitive the founder wants

This is the most significant finding in the investigation. `server.js:7986-8003`:

```
/* CANONICAL capability observations (strengths / development) — CONTEXTUAL, purpose-scoped,
   never a permanent trait. Replaces regex-parsing of legacy `Strengths:/Development:` text. */
function _capabilityObservations(code, subjectId, opts = {}) { … }
```

Each returns:

```js
{ evidenceId, dimension, polarity, basis, confidence, limitations, at, assessmentId }
```

filtered on `primitive === 'observation' && observationType === 'capability'`, with
`env.visibility === 'private'` admitted only for the owner under a personal purpose.

`_capabilityDims` (`:8004`) repeats the law in its own header: *"Contextual, not a person-level
trait."*

So **"Alex shows optimistic framing under pressure"** already has a home: an evidence envelope with
a `dimension`, a `polarity`, a `basis`, a `confidence`, `limitations`, a timestamp, a visibility
class, and a lifecycle. It is an observation *about a person at a time*, not a property *of* a
person. That is precisely the representation the founder's §"People and behavior" asks for, and it
is already load-bearing.

### 2.5 · Typed organisational records — already a schema

`ai/org-context.js:18` — `['event','objective','responsibility','requirement','rhythm','dependency','decision']`,
each normalised by a constructor in `ai/org-state.js` (`objective:91`, `event:97`, `decision:103`,
`responsibility:108`, `dependency:113`, `requirement:118`, `operatingRhythm:125`), every one carrying
`provenance` from `prov()` (`:86`).

`responsibility` and `dependency` are **already relationship objects**. They are edges that were
given a type and a provenance because the product needed them to be inspectable.

### 2.6 · The full inventory

| Ontology concept | IntelliQ today | Status |
|---|---|---|
| Person | `orgUsers[code][id]` | object |
| Team / node | `orgNodes[code][nodeId]` with `parentIds`, `memberIds`, `leaderIds` | object + embedded edges |
| Organisation | `orgMeta[code]` | object |
| Role | `user.role`, `orgMeta.professionals[]`, `userPermissions` | object-ish, three places |
| Goal / objective | `orgState.objective` | object with provenance |
| **Behaviour** | capability observation envelope (`dimension`, `polarity`) | **reified observation** |
| Event | `orgState.event`, `orgCalendar` | object |
| Evidence | `evidenceLog[code]` envelopes | object with lifecycle |
| Inquiry | `inquiryStates[code][subjectRef][concept]` | object, richest in the product |
| Hypothesis | `inquiry.hypotheses[]` + `supportRefs`/`challengeRefs` | **reified claim with edges** |
| Focus | `mem.focuses[]` on `userAiProfiles` | object, thin |
| Decision | `orgState.decision` | object — **forward-looking only** |
| Intervention | `orgInterventions[code][]` | object |
| Outcome | `intervention.outcome` / `recordedOutcome` | embedded field |
| Belief | `reasonLedger[code][]` with `AXIS` polarity | object |
| Org memory | `orgStateHistory` + `ai/org-memory.js` | timeline with fingerprints |
| Person model | `ai/person-model.js` categorical dimensions | object, **self-only** |

**Verdict on Q1:** yes, unambiguously. IntelliQ contains an implicit ontology that is stronger on the
hard parts (epistemic status, provenance, correction, contestability) than most explicit ontologies
are, because those parts were forced by product arguments rather than modelled up front.

---

## 3 · THE FOUR BROKEN JOINS

Everything an ontology would newly provide reduces to this. Each was found independently by an
earlier audit, under a different name, which is itself the evidence that it is real.

| # | Missing edge | Consequence | Previously found as |
|---|---|---|---|
| **J1** | `Inquiry → Objective` | The loop runs but cannot say which organisational aim it served | **P0-C** (`organisational-harness-addendum` §8) |
| **J2** | `Focus → origin` (Inquiry / High / Low) | Things get worked on and forget why they started | **G2** (constitution §13) |
| **J3** | `Intervention → Inquiry / Decision` | We know what was done and what happened; not why it was chosen | **§4** (`organisational-harness-addendum`) |
| **J4** | `Decision → Evidence → Outcome` | `decision` models a decision *to be made*, never one that *was* | **§4**, `harness-addendum` |

Verified absent at `0663e56`: no `objectiveId` on any inquiry; `orgInterventions` carries
`reason: 'briefing'` as a **string literal** (`server.js:4312`) where a reference belongs; no
`decidedAt` / `decidedBy` anywhere; `intervention.inquiryId` does not exist.

The harness addendum already reached the right conclusion about these and it should be quoted rather
than re-derived:

> *"Both are foreign keys, not architecture."*

That sentence is the entire ontology verdict. **An ontology is being proposed to solve a
foreign-key problem.**

### The one genuinely new edge type

| # | Missing edge | Why it is different |
|---|---|---|
| **J5** | `BehaviourObservation → Objective`, typed `SUPPORTS` / `MAY_CONFLICT_WITH` | No analogue exists. `ai/values.js` connects values to behaviour **only as LLM prompt text** (`orgDirective` returns a string); nothing deterministic joins a capability dimension to an organisational aim. |

J5 is the founder's actual product idea. J1-J4 are repairs; J5 is new capability.

---

## 4 · PROPOSED CONCEPTUAL MODEL

Deliberately tiny. Adding nothing that exists.

### Objects (all already exist — no change)

`Person · Node · Objective · Event · Evidence · Inquiry · Focus · Decision · Intervention · Belief`

### Relationships that should become first-class

Only five. Four are foreign keys on existing records; one is a new reified edge.

| Edge | Shape | Home | New store? |
|---|---|---|---|
| J1 `Inquiry -SERVES-> Objective` | `inquiry.servesObjectiveId` | `inquiryStates` | no |
| J2 `Focus -ORIGINATES_FROM-> Inquiry\|High\|Low` | `focus.origin.from = { kind, ref }` | `userAiProfiles` | no |
| J3 `Intervention -RESPONDS_TO-> Inquiry` | `intervention.respondsToInquiryId` | `orgInterventions` | no |
| J4 `Decision -DECIDED` | `decision.decidedAt/By/consideredEvidenceRefs[]/resultingInterventionId` | `orgContextRecords` | no |
| **J5** `BehaviourObservation -BEARS_ON-> Objective` | a **reified claim**, see below | evidence envelope | no |

**Four of five are fields on records that already persist, already partition by org, and already
ride the P0-3 CAS.** Zero migrations. Zero new stores.

### J5 must be a claim, not a fact

The dangerous version of J5 is an edge in a table saying *optimism SUPPORTS resilience*. That is
exactly the "model speculation becomes durable identity" failure the brief warns about.

The safe version already has a template in this codebase — the **hypothesis**:

```
BehaviourBearing {
  subjectRef,                 // 'member:alex'  — who the behaviour was observed in
  dimension,                  // 'optimistic_framing' — from the observation, never coined here
  objectiveId,                // what organisational aim it is claimed to bear on
  direction: 'supports' | 'may_conflict_with',
  status: 'hypothesis' | 'supported' | 'unsupported' | 'contested' | 'stale',
  supportRefs: [], challengeRefs: [],     // exactly as diagnose.js hypotheses do
  confidence: { score, band, because: [] },
  observedWindow: { from, to },           // temporality — see §7
  visibility, ownerRef,                   // inherits envelope governance
  provenance: { by, at, originRef },
}
```

This is **not a new primitive**. It is `ai/diagnose.js`'s hypothesis, given a typed subject and a
typed object. Which is the whole recommendation: *reuse the hypothesis machinery for
behaviour-to-aim claims rather than inventing an ontology layer above it.*

---

## 5 · INQUIRY INTEGRATION

**Yes — and this is the strongest argument in favour of narrow adoption.**

Today an Inquiry is keyed by `subjectRef` + `concept` (`inquiryStates[code][subjectRef][concept]`).
A concept is a **string** (`'football.session_attendance'`). So an Inquiry today questions *a topic
about a subject*.

With J5, an Inquiry can question **a claimed relationship**:

| Today | With J5 |
|---|---|
| "attendance" about `member:alex` | "does Alex's optimistic framing improve team recovery?" |
| subject + topic | subject + behaviour + aim + direction |

Crucially the machinery does not change. A `BehaviourBearing` has `supportRefs` / `challengeRefs`,
a confidence band, and a status — so `deriveConfidence`, `applyProposals`, `boundFrontier`,
supersession, contest and the timeline **all work on it unmodified**. The Inquiry kernel is not
replaced; it gains a second kind of thing to be uncertain about.

**Q12 — does this materially improve the questions IntelliQ can ask?** Yes, and specifically: it
lets the system ask the *comparative* question it currently cannot form. Today it can ask "is
attendance a problem?". With a bearing it can ask "does this behaviour, which we have observed,
actually help the thing you said you cared about?" That is a categorically better question, and it
is the question the founder's whole example is built around.

**One honest caution.** Existing inquiry identity resolution (`resolveIdentity`) works on concept
strings, and its stated failure mode is fragmentation: *"ambiguity resolves toward coherence."* A
bearing has a three-part identity (subject, dimension, objective). Identity collision and
fragmentation logic must be extended, not assumed. That is real work and it is the main
implementation risk in J5.

---

## 6 · HUMAN / BEHAVIOUR MODEL

### What already protects people

| Guard | Where | Effect |
|---|---|---|
| Behaviour is an **observation**, never a trait | `server.js:7986` header | contextual, purpose-scoped, timestamped |
| Person model stores **only vocabulary tokens** | `ai/person-model.js:26-32` | raw text cannot enter, so it cannot leak |
| Evidence floor before asserting understanding | `person-model.js:36` `FLOOR = 3` | below the floor → `null`, honestly |
| Ties yield nothing | `person-model.js:86` | no leader when top equals runner-up |
| Org sees nothing personal | `publicProjection():112` | `{ hasModel, interactions }` only |
| Protected traits refused in any rendered text | `ai/proactive.js:289` `PROTECTED_RE` | never named or inferred |
| Model may not conclude | `diagnose.js:47` | conclusions are the kernel's |

That is a genuinely strong position. *"IntelliQ declares: you are an optimistic person"* is
structurally difficult to produce today.

### The one real defect — and it is Scenario 3

`ai/person-model.js:61`:

```js
m[dim][t] = (m[dim][t] || 0) + 1;
```

**The person model is a monotonic counter. There is no decay, no recency weighting, no time
window.** A person observed as `direct` fifty times in 2026 and `gentle` twenty times in 2028 still
reads as `direct`, permanently, because `_leader()` sorts raw lifetime counts.

This is precisely the risk the brief names — *"old behavior permanently defining a person"* — and it
is live today, independent of any ontology decision.

> **Finding O-1.** The person model cannot represent change. This is a defect in the existing
> system, not an argument for an ontology, and it should be fixed whether or not J5 is adopted.

The fix is small and needs no new architecture: half-life weighting on the counters, or a bounded
recency window, plus an `observedWindow` on any assertion derived from them. Every bearing claim
must carry `observedWindow` for the same reason.

### The rule that keeps behaviour from becoming identity

> **Law O-2 (proposed).** A behaviour is always represented as *(subject, dimension, context, time,
> evidence)* — never as *(subject, dimension)*. Any projection that drops context or time is
> producing a label and must be refused. A bearing claim renders as *"in these situations, this
> appeared to…"* and never as *"Alex is…"*.

### Self-perception versus other-perception

The founder's example — the player says "no", the coach says "yes", evidence says something else —
is already representable and this matters:

- the player's account: signal with `authority: 'self_report'`, `directness: 'direct'`
- the coach's account: signal with a different `authority`, and `dissents: true` if it contradicts
- outcome data: signals with `originKind` distinct from both

`deriveConfidence` counts **independent origins**, so the coach agreeing with themselves twice does
not outweigh the player. And P0-D applies directly: *"does optimism help resilience"* is an
**empirical** claim, so the coach's authority does not settle it. The existing law already handles
the hardest case in the founder's example.

---

## 7 · TRUTH + GOVERNANCE

### How a bearing acquires epistemic status

It does not acquire one by being written. It enters as the lowest thing that can be said and climbs
only on evidence:

```
proposed (model or human)  →  hypothesis  →  supported | unsupported | contested  →  stale
                                    ↑                                                  ↓
                            supportRefs / challengeRefs                       observedWindow expiry
```

Governed by the rules that already exist:

| Rule | Source | Applies to a bearing |
|---|---|---|
| Model may propose observation/interpretation/hypothesis, never conclusion | `diagnose.js:47` | unchanged |
| Confidence is computed deterministically, not asserted | `diagnose.js:22-23` | unchanged |
| Independent origins, not voices | `contribution.js:203` | unchanged |
| Authority settles arrangements; evidence settles empirical claims | P0-D, `ai/inquiry.js` | **critical** — a bearing is empirical |
| Corrections supersede without erasing | `diagnose.js:485` | unchanged |
| Contest is a first-class state | `server.js:10890` | unchanged |

### Two prohibitions the ontology must inherit

> **Law O-3 (proposed).** *Organisation says X therefore X* is refused for bearings by P0-D: a
> claim that a behaviour helps an aim is **empirical**, so no role is authoritative for it. A
> leader may **declare** a bearing; the declaration is an `organisational declaration` at the
> declarer's evidence class, and it does not raise the bearing's confidence.

> **Law O-4 (proposed).** *Model inferred X therefore X* is refused by the level ladder: a model may
> propose a bearing at `hypothesis` and no higher. Promotion to `supported` is the kernel's, from
> `supportRefs` counted by origin.

### The nine concepts, kept distinct

The brief asked not to collapse them. Mapped to where each lives:

| Concept | Home | Collapsed today? |
|---|---|---|
| Object | `orgUsers`, `orgNodes`, `orgContextRecords` | no |
| Relationship | signals, `RELATIONSHIPS`, `responsibility`, `dependency` | no |
| Observation | `LEVELS[0]`, capability observation envelope | no |
| Claim / Interpretation | `LEVELS[1]` | no |
| Hypothesis | `LEVELS[2]`, `inquiry.hypotheses[]` | no |
| Evidence | `evidenceLog` envelope | no |
| Organisational declaration | `orgContextRecords` + `prov.kind = 'explicit'` | **partly** — `harness-review` §2 records that the belief kernel never reads `prov.kind`, so a declaration is not treated differently downstream |
| Empirical finding | `LEVELS[3]` conclusion, kernel-derived | no |
| Decision | `orgState.decision` | **yes** — forward-looking only (J4) |

Two of nine are imperfect, and both are already-registered gaps.

---

## 8 · PRIVACY MODEL

### The risk an ontology genuinely introduces

Everything above makes relationships easier to write and easier to traverse. **Traversability is
the danger.** Today, learning something sensitive about a person requires going through
`_capabilityObservations`, which checks `visibility`, `purpose` and `ownerRef` on every envelope. A
graph that answers *"show me everything connected to Alex"* invites a query shape that bypasses
per-envelope reasoning.

| Risk | Mitigation | Already exists? |
|---|---|---|
| Private conversation becomes a visible relationship | edges inherit envelope `visibility` / `ownerRef`; a private-derived bearing is private | yes — `private-evidence-smoke §12`: *"a pattern derived from private evidence inherits PRIVATE visibility + owner"* |
| Inferred personality becomes org fact | O-4 + `MODEL_MAY_PROPOSE` | yes |
| Leader queries sensitive interpretations | no general traversal API; reads stay purpose-scoped | yes — must not regress |
| Old behaviour defines a person | `observedWindow` + decay | **no — O-1** |
| Evidence escapes scope | Web scope + `audienceSafe` + cohort floors | yes |
| Aggregation re-identifies | disclosure floors, `constitution` §13 / `web-semantics` §23 | yes |

### The rule that keeps it safe

> **Law O-5 (proposed).** A relationship is never more visible than the least visible evidence it
> rests on. A bearing supported by one private signal is private, and remains private when it is
> counted into an aggregate — the count may surface, the edge may not.

> **Law O-6 (proposed).** There is **no general graph traversal API**. Every read of a bearing goes
> through a purpose-scoped accessor that applies visibility per record, exactly as
> `_capabilityObservations` does today. "Show me the graph around this person" is not a supported
> query and must never become one.

O-6 is the single most important governance constraint in this document. Most of the harm an
ontology could do to IntelliQ arrives through a convenient traversal endpoint.

---

## 9 · MEMORY + RETRIEVAL

### Q16 — memory: yes, materially, and this is the second strongest argument

The brief's chain —

```
Person A → participated in Inquiry B → which examined Goal C → based on Evidence D/E/F
        → resulting in Decision G → followed by Intervention H → producing Outcome I
```

— is **exactly** J1-J4. Today that chain is broken in four places, so answering *"why did we decide
this in March"* requires reconstructing intent from text. With the four foreign keys it is a
traversal of records that already exist.

The harness addendum already reached this conclusion and deferred it for a good reason: *"we do not
know which joins Falcon actually needs… Falcon will make perhaps a dozen consequential decisions in
a pilot. Watch them, then model."* That reasoning still holds for J4's full shape. It does **not**
hold for J1-J3, which are single fields.

### Q17 / Q18 — retrieval and tokens: **be sceptical**

The claim "an ontology reduces token usage" is the part of the brief most likely to be wrong, and it
should not be accepted without measurement.

**What genuinely improves:** answering a *structural* question — "what did this Focus come from",
"which objective does this inquiry serve" — becomes a field read instead of a retrieval. That is a
real saving because those questions currently either cannot be answered or require assembling
context.

**What does not improve:** the dominant token cost in IntelliQ is not context reconstruction. It is
`_intakeTurn` (`server.js:9187`, `maxTokens: 4000`) turning prose into proposals — a semantic task
no graph removes. Compressing a briefing's grounding by a few hundred tokens against a 4,000-token
intake call is noise.

> **Finding O-7.** Do not justify this work on cost. The token argument is weak and unmeasured. The
> justification is *organisational learning* — being able to say why something was decided — which
> is a product claim, not an efficiency claim.

---

## 10 · WORKER ARCHITECTURE

### Deterministic tasks the joins would unlock

Each of these is impossible today purely because a foreign key is missing, and each becomes a
deterministic sweep the moment it exists:

| Task | Needs | Model? |
|---|---|---|
| "Objectives with no inquiry serving them" | J1 | **no** |
| "Inquiries resolved but no decision recorded" | J1 + J4 | **no** |
| "Interventions with no measured outcome after N days" | J3 | **no** — partly exists |
| "Focuses whose originating Inquiry has since been refuted" | J2 | **no** |
| "Bearings whose supporting evidence was all corrected" | J5 | **no** |
| "Bearings stale beyond their observed window" | J5 + O-1 | **no** |
| "Behaviours claimed to support an objective that has been retired" | J1 + J5 | **no** |

The fourth is the most valuable and the most human: *someone is still working on something the
organisation stopped believing in.* That is a genuinely useful thing to notice, it needs no model,
and today it cannot be computed at all.

### What must remain model work

- Turning prose into candidate observations (`_intakeTurn` — no deterministic substitute).
- **Proposing** that a dimension might bear on an objective. The graph cannot invent the hypothesis;
  it can only test one.
- Phrasing a bearing question in language a person will engage with.
- Reading documents and images.

> **Law O-8 (proposed).** The graph tests relationships. The model proposes them. Neither may do the
> other's job: a deterministic sweep may never coin a bearing, and a model may never promote one.

---

## 11 · STORAGE RECOMMENDATION

### **Existing store. Typed fields on existing records. No new technology.**

| Option | Verdict | Why |
|---|---|---|
| **Existing stores + typed fields** | **ADOPT** | J1-J4 are fields on records already in `_persistedStores` (`server.js:184`), already org-partitioned by `_durableUnits`, already covered by P0-3 CAS. Zero migration. |
| Typed edge table | **LATER, if ever** | Only J5 has edge-like cardinality. Until a Falcon pilot produces hundreds of bearings, an array on the envelope is sufficient and inspectable. |
| Graph database | **REJECT** | Falcon is one organisation with tens of people. A graph DB adds an operational dependency, a second consistency model, and a query surface that directly violates O-6. The traversals in question are depth ≤ 4 over hundreds of records. |
| Vector database | **REJECT — out of scope** | Unrelated to the question. `ai/embeddings.js` already exists and is a separate concern. |
| Hybrid | **REJECT for now** | Two stores means two truths and a sync problem — the exact failure `organisational-harness-review` §3 identified with `orgGoals`. |

**Q23 — does this require a graph database? No.** Nothing in this investigation needs one, and the
pilot would be worse for having it.

---

## 12 · FIVE SCENARIO WALKTHROUGHS

### Scenario 1 — human development (player encourages teammates; player dismisses it; coach disagrees)

**Current architecture.** Mostly works. The coach's observation lands as a capability observation
(`dimension: 'encouraging_teammates'`, `polarity: 'strength'`). The player's dismissal lands as a
`self_report` signal. Both carry `originRef`, so `deriveConfidence` counts them as two origins, not
two votes. P0-D keeps the coach from settling it by rank.

**What breaks:** there is nowhere to put the *claim being disputed*. The dispute is "does this help
team resilience?" — a behaviour→aim relationship. Today the disagreement gets filed against a
concept string, so the thing being contested is a topic, not a proposition.

**With J5.** A `BehaviourBearing { subject: alex, dimension: encouraging_teammates,
objective: team_resilience, direction: supports, status: 'hypothesis' }`. The coach's account is a
`supportRef`; the player's dismissal is a `challengeRef` with `dissents: true`; match-recovery data
is a third origin. Status resolves to `contested` — not to whoever outranks whom.

**Durable memory:** the bearing, its refs, its confidence band and its timeline.
**Remains uncertain:** the direction, honestly, until independent origins accumulate.
**The Inquiry:** *"When you've encouraged people after a setback, did the group respond differently?"*
— answerable by the player, and not a personality question.

### Scenario 2 — organisational decision (leadership says the process works; players disagree; outcomes mixed)

**Current architecture.** Authority is handled: the leadership statement becomes an
`organisational declaration` via `_confirmOrgContext`, and P0-D stops it minting a high-confidence
empirical belief. Player evidence is admissible and contradicting evidence produces `contested`.
Interventions and measured outcomes exist.

**What breaks — two things.** (a) The decision record is forward-looking only, so *"leadership
adopted this process"* has no historical record with a decider, a date, or the evidence considered.
(b) `orgInterventions.reason` is the string `'briefing'` — the intervention cannot point at the
decision it implements.

**With J1/J3/J4.** `Decision { decidedAt, decidedBy, consideredEvidenceRefs, respondsToInquiryId,
resultingInterventionId }`; the intervention points back; the outcome attaches to the intervention;
the inquiry names the objective. *"We adopted this in March on this evidence; here is what happened;
the belief that justified it is now contested"* becomes a traversal.

This is the scenario where the joins pay for themselves, and it is the one Falcon will actually
produce.

### Scenario 3 — the changing person (2026 ≠ 2028)

**Current architecture — genuinely broken.** `person-model.js` counters are monotonic (§6). Lifetime
counts never age. Capability observations *do* carry `at` and are sorted by it, but `_capabilityDims`
(`server.js:8009`) counts **all** of them and takes the top three, with no recency weighting. So both
behaviour surfaces are dominated by whoever the person used to be.

**With the proposal.** `observedWindow` on every bearing; decay on person-model counters; bearings
transition to `stale` when their window closes without fresh support. A 2026 bearing does not
disappear — it becomes history with a closed window, which is what "remembering without labelling"
actually means.

**This scenario alone justifies O-1, independent of the ontology question.**

### Scenario 4 — privacy (private conversation informs an Inquiry; leadership must not see the text)

**Current architecture — already correct, and tested.** `private-evidence-smoke` asserts it end to
end: private evidence cannot be a leader-facing citation (§10), its id is absent from the authorised
set (§11), *a pattern derived from private evidence inherits PRIVATE visibility and owner* (§12),
and derived private evidence is excluded from org reasoning (§13).

**With ontology — unchanged, provided O-5 and O-6 hold.** A bearing resting on a private signal
inherits private visibility. The aggregate count may surface; the edge may not. **This is the
scenario where an ontology adds no benefit and all of the risk**, and it is why O-6 (no general
traversal) is non-negotiable.

### Scenario 5 — the deterministic worker

**Without a model, with J1-J2:**

> *"Three people are working on a Focus that originated from an Inquiry which has since been
> refuted by later evidence."*

Pure traversal: `focus.origin.from.ref` → `inquiry.status === 'refuted'`. No model, no ambiguity, no
tokens — and genuinely useful, because it catches effort still being spent on a belief the
organisation has already abandoned. **Impossible today: `focus.origin` does not exist.**

**Where a model remains genuinely useful:**

> A player writes *"I keep telling everyone it'll be fine but I'm not sure they believe me any more."*

Recognising that as a candidate observation about `encouraging_teammates`, with a possible bearing on
team resilience and a possible tension with risk recognition, is irreducibly semantic. No graph
produces it. The model proposes; the graph then tests it against evidence over time.

That division — **model proposes, graph tests** — is the whole worker architecture in one line.

---

## 13 · FAILURE MODES — attacking the proposal

As instructed. These are the ways this goes wrong.

| # | Failure | Severity | Mitigation |
|---|---|---|---|
| F1 | **Renaming existing tables.** "Ontology" applied to `orgUsers`/`orgNodes` produces a vocabulary change and zero capability. | **High — the most likely outcome** | Ship only J1-J5. If a change does not close a named join, it is not in scope. |
| F2 | **Premature generalisation.** A universal entity/relationship schema before one Falcon bearing exists. | **High** | No generic `Entity`/`Edge` types. Five named edges, four of them fields. |
| F3 | **The traversal endpoint.** Someone adds `GET /api/graph/person/:id` because it is convenient. | **Critical** | Law O-6. Should be an explicit invariant test. |
| F4 | **Behaviour edges become labels anyway.** A UI renders "Alex: optimistic" from a bearing. | **Critical** | Law O-2; render templates must be context-and-time bound; `audienceSafe`-style guard. |
| F5 | **Graph-database enthusiasm.** | Medium | §11. Depth ≤ 4 over hundreds of records. |
| F6 | **Identity fragmentation in bearings.** Three-part identity multiplies the collision problem `resolveIdentity` already fights. | **Medium-high** | Named as the main J5 implementation risk (§5). Do J5 last. |
| F7 | **The cost argument is wrong.** | Medium | Finding O-7 — do not justify on tokens. |
| F8 | **Developer complexity.** A fifth way to express a relationship alongside signals, `RELATIONSHIPS`, `responsibility`, `dependency`. | Medium | J5 explicitly reuses the hypothesis shape rather than inventing a sixth. |
| F9 | **Migration cost on live Focus records.** | Low | `origin` absent reads as unknown; no backfill; but the field must land **before** the pilot writes records or intent is unrecoverable. |
| F10 | **It makes IntelliQ less understandable.** The current code is readable because concepts were argued into existence one at a time. | Medium | Every edge here has a named product question behind it. If one cannot be stated in a sentence, drop it. |

### The strongest argument against doing any of this

**Falcon has not run yet.** The harness addendum's reasoning — *watch a dozen real decisions, then
model* — is correct and was correct when written. The counter-argument is narrow and only applies to
two items: J2 (`focus.origin`) must exist **before** records are created, because intent cannot be
back-filled; and O-1 (decay) is a live defect regardless. Everything else can wait for evidence.

---

## 14 · MINIMUM VIABLE ADOPTION

Smallest change capturing most of the benefit. Ordered by value per unit of risk.

| # | Change | Size | Blocks the pilot? |
|---|---|---|---|
| **M1** | `focus.origin = { by, from: {kind, ref} }` — J2 / G2 | one field | **Yes — must land before records exist** |
| **M2** | Person-model decay + `observedWindow` on derived assertions — O-1 | one function | No, but it is a live defect |
| **M3** | `inquiry.servesObjectiveId` — J1 / P0-C | one field | No |
| **M4** | `intervention.respondsToInquiryId` — J3 | one field | No |
| **M5** | Deterministic sweep: "Focus whose origin was refuted" | one sweep | No |
| **M6** | `BehaviourBearing` as a hypothesis subtype — J5 | real work | No |
| **M7** | Decision-as-history — J4 | real work | No — wait for Falcon |

**M1 + M2 is the honest minimum.** Two small changes: one because intent is unrecoverable later, one
because it is a defect today. M3-M5 are cheap and unlock the deterministic sweeps. M6 is the product
idea and should follow pilot evidence. M7 stays deferred on the harness addendum's reasoning.

---

## 15 · DEFERRED — explicitly do NOT build before pilots

- A universal entity/relationship schema.
- A graph database, a triple store, or any new storage technology.
- A general traversal or "graph around this person" API — **ever**, per O-6.
- `BehaviourBearing` (M6) before Falcon produces real capability observations.
- Decision-as-history (M7) before a dozen real decisions have been watched.
- Any ontology-driven refactor of `ai/diagnose.js`, `ai/reason.js`, or the evidence envelope.
- Ontology-derived retrieval or context compression — the cost case is unproven (O-7).
- Renaming existing concepts to ontology vocabulary.

---

## 16 · TTD QUESTIONS FOR THE FOUNDER

Only where product judgement is genuinely required. The repository answered everything else.

### Q-O1 · Is a bearing claim a *person* object or an *organisational* object?

A bearing says "Alex's encouragement helps team resilience". Alex may reasonably consider that his;
the organisation may reasonably consider it organisational learning. It determines who may contest
it, who may see it after Alex leaves, and whether it survives his departure at all.
**Recommendation:** the *bearing* is organisational, the *observation* it rests on is Alex's — so it
survives as an anonymised pattern and dies as an attributed claim. Confirm.

### Q-O2 · May IntelliQ tell a person about a bearing they disagree with?

The scenario is the whole point: Alex says the behaviour is irrelevant; evidence suggests otherwise.
Showing him is either the most valuable thing the product does or a machine arguing with someone
about their own character. **Recommendation:** show it only as a question with its evidence
attached, never as a finding; and never to a leader while contested. Confirm.

### Q-O3 · Does an organisation get to declare which behaviours matter?

If leadership declares "we value optimism", does that create bearings, or only objectives that
bearings may point at? The first makes the org's values into hypotheses about people.
**Recommendation:** only objectives. Values never generate claims about individuals.

### Q-O4 · How long is a behavioural window?

O-1 needs a number. A season, a term, a year? This is a product judgement about how quickly IntelliQ
should be willing to forget who someone used to be. **No repository precedent exists** — the
existing floors (`STALE = 21d`, `DISMISS_COOLDOWN = 14d`) are about attention, not identity.

### Q-O5 · Does J5 wait for Falcon?

M1-M5 are defensible now. M6 is the actual idea and would be built on zero real bearings.
**Recommendation:** wait. But this is a product-timing call, not an architectural one.

---

## Summary

IntelliQ has an ontology. It is called evidence, signals, hypotheses, observations and org-context
records, and on the hard properties — epistemic status, provenance, correction, contestability,
visibility — it is better than most systems that use the word.

What it does not have is **four foreign keys, a decay function, and one new claim type**.

Build those. Do not build an ontology.
